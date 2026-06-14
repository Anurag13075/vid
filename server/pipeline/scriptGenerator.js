const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";
function targetSections(length) {
    switch (length) {
        case "short":
            return { count: 12, label: "6-8 minutes", wordsPerSection: 100, totalWords: 1200 };
        case "long":
            return { count: 22, label: "12-15 minutes", wordsPerSection: 110, totalWords: 2420 };
        default:
            return { count: 16, label: "9-11 minutes", wordsPerSection: 105, totalWords: 1680 };
    }
}
function repairJson(raw) {
    let s = raw.trim();
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first)
        s = s.slice(first, last + 1);
    s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    s = s.replace(/\/\/[^\n]*/g, "");
    const missingCommaRe = /(\btrue|\bfalse|\bnull|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*")\s*\n(\s*"[^"]*"\s*:)/g;
    let prev = "";
    while (prev !== s) {
        prev = s;
        s = s.replace(missingCommaRe, "$1,\n$2");
    }
    s = s.replace(/,\s*([}\]])/g, "$1");
    s = s.replace(/,\s*,/g, ",");
    return s;
}
function normaliseScript(parsed) {
    if (!parsed || typeof parsed !== "object")
        throw new Error("Script is not an object");
    if (!Array.isArray(parsed.sections))
        throw new Error("Script missing sections array");
    if (parsed.sections.length < 4)
        throw new Error(`Too few sections: ${parsed.sections.length}`);
    const seen = new Set();
    const cleaned = [];
    for (let i = 0; i < parsed.sections.length; i++) {
        const s = parsed.sections[i];
        if (!s || typeof s !== "object")
            continue;
        const id = typeof s.id === "number" ? s.id : i + 1;
        if (seen.has(id))
            continue;
        seen.add(id);
        const isGraphic = s.section_type === "graphic";
        cleaned.push({
            id,
            narration: isGraphic ? "" : String(s.narration || "").trim(),
            visual_keywords: Array.isArray(s.visual_keywords)
                ? s.visual_keywords.slice(0, 3).map(String)
                : ["people walking street"],
            section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(s.section_type)
                ? s.section_type
                : "broll",
            key_point: s.key_point ? String(s.key_point).slice(0, 60) : null,
            estimated_words: Number(s.estimated_words) || 105,
            sfx: Boolean(s.sfx),
        });
    }
    if (cleaned.length < 4)
        throw new Error("Too few valid sections after dedup");
    return {
        title: String(parsed.title || "").trim(),
        description: String(parsed.description || "").slice(0, 200),
        mood: ["dramatic", "uplifting", "neutral", "tense"].includes(parsed.mood) ? parsed.mood : "neutral",
        thumbnail_hook: String(parsed.thumbnail_hook || "").slice(0, 60),
        sections: cleaned,
    };
}
async function callCerebras(messages) {
    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey)
        throw new Error("CEREBRAS_API_KEY env variable is not set");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
        const response = await fetch(CEREBRAS_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-oss-120b",
                max_tokens: 4096,
                temperature: 0.7,
                messages,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        const responseText = await response.text();
        console.log(`[cerebras] status: ${response.status}`);
        console.log(`[cerebras] body preview: ${responseText.slice(0, 300)}`);
        if (!response.ok) {
            // 429 = rate limit — caller will retry with backoff
            throw new Error(`Cerebras API error ${response.status}: ${responseText}`);
        }
        const data = JSON.parse(responseText);
        const choice = data.choices?.[0];
        // Detect silent truncation — broken JSON guaranteed if we proceed
        if (choice?.finish_reason === "length") {
            throw new Error(`Cerebras truncated response (finish_reason: length) — will retry with fewer words`);
        }
        const content = choice?.message?.content || "";
        console.log(`[cerebras] content length: ${content.length} chars`);
        console.log(`[cerebras] content preview: ${content.slice(0, 200)}`);
        return content || "{}";
    }
    catch (err) {
        clearTimeout(timer);
        if (err?.name === "AbortError")
            throw new Error("Cerebras API timed out after 90s");
        throw err;
    }
}
async function generateSectionBatch(title, startId, count, wordsPerSection, isFirst, isLast) {
    const firstType = isFirst ? "intro" : "broll";
    const lastType = isLast ? "outro" : "broll";
    const prompt = `Write sections ${startId} to ${startId + count - 1} of a YouTube documentary script about: "${title}"

Output a JSON array of exactly ${count} section objects:
[
  {
    "id": ${startId},
    "narration": "narration text",
    "visual_keywords": ["keyword1", "keyword2", "keyword3"],
    "section_type": "${firstType}",
    "key_point": "short fact or null",
    "estimated_words": ${wordsPerSection},
    "sfx": false
  }
]

STRICT RULES:
- Section ${startId} must have section_type: "${firstType}"${isLast ? `\n- Section ${startId + count - 1} must have section_type: "${lastType}"` : ""}
- All middle sections: "broll" or "stat" (stat = has numbers/dates/statistics)
- narration: MUST be ${wordsPerSection} to ${wordsPerSection + 10} words. Count carefully. Never write less than ${wordsPerSection} words.
- visual_keywords: 3 SPECIFIC searchable phrases for Pexels/Pixabay stock footage.
  GOOD: "close up white bed sheets", "pest spray bottle kitchen counter", "insect magnified crawling wood surface"
  BAD: "cinematic", "background", "dramatic footage", "visual", "scene", "abstract"
  Each keyword must describe the exact visual content relevant to that section's topic.
- Output ONLY the JSON array. No markdown, no explanation, no extra text.`;
    const raw = await callCerebras([
        { role: "system", content: "Output ONLY a valid JSON array. No markdown, no explanation, no preamble." },
        { role: "user", content: prompt },
    ]);
    let s = raw.trim();
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const arrStart = s.indexOf("[");
    const arrEnd = s.lastIndexOf("]");
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
        s = s.slice(arrStart, arrEnd + 1);
    }
    const sections = JSON.parse(s);
    return sections.map((sec, i) => ({
        id: typeof sec.id === "number" ? sec.id : startId + i,
        narration: String(sec.narration || "").trim(),
        visual_keywords: Array.isArray(sec.visual_keywords)
            ? sec.visual_keywords.slice(0, 3).map(String)
            : ["people walking street"],
        section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(sec.section_type)
            ? sec.section_type
            : "broll",
        key_point: sec.key_point ? String(sec.key_point).slice(0, 60) : null,
        estimated_words: Number(sec.estimated_words) || wordsPerSection,
        sfx: Boolean(sec.sfx),
    }));
}
export async function generateScript(title, length) {
    const { count, label, wordsPerSection } = targetSections(length);
    const metaPrompt = `For a YouTube documentary about "${title}", output this JSON:
{
  "title": "compelling title string",
  "description": "150-200 char SEO description",
  "mood": "dramatic",
  "thumbnail_hook": "4-6 punchy words"
}
Output ONLY the JSON object.`;
    let meta = {};
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const raw = await callCerebras([
                { role: "system", content: "Output ONLY valid JSON, no markdown." },
                { role: "user", content: metaPrompt },
            ]);
            const repaired = repairJson(raw);
            meta = JSON.parse(repaired);
            console.log("[cerebras] meta generated ok");
            break;
        }
        catch (err) {
            console.error(`Meta attempt ${attempt} failed:`, err.message);
            if (attempt < 3)
                await sleep(5000);
        }
    }
    // Batch size 4 (not 5) — keeps output tokens ~1600 per call,
    // well under the truncation threshold even at 110 words/section
    const BATCH_SIZE = 4;
    const allSections = [];
    for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
        const batchCount = Math.min(BATCH_SIZE, count - batchStart);
        const startId = batchStart + 1;
        const isFirst = batchStart === 0;
        const isLast = batchStart + batchCount >= count;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // On retry, reduce words slightly to avoid hitting length limit again
                const adjustedWords = attempt === 1 ? wordsPerSection : Math.floor(wordsPerSection * 0.88);
                const sections = await generateSectionBatch(title, startId, batchCount, adjustedWords, isFirst, isLast);
                allSections.push(...sections);
                console.log(`[cerebras] batch ${startId}-${startId + batchCount - 1} ok (${sections.length} sections)`);
                break;
            }
            catch (err) {
                const msg = err.message;
                console.error(`Batch ${startId} attempt ${attempt} failed:`, msg);
                // 429 = rate limit, wait longer; other errors = shorter wait
                const delay = msg.includes("429") ? 20000 : 6000 * attempt;
                if (attempt < 3)
                    await sleep(delay);
                else
                    throw new Error(`Failed to generate sections ${startId}-${startId + batchCount - 1}: ${msg}`);
            }
        }
        // Pause between batches to stay under Cerebras free tier TPM
        if (batchStart + BATCH_SIZE < count)
            await sleep(2000);
    }
    if (allSections.length < 4) {
        throw new Error(`Only got ${allSections.length} sections, need at least 4`);
    }
    return {
        title: String(meta.title || title).trim(),
        description: String(meta.description || "").slice(0, 200),
        mood: ["dramatic", "uplifting", "neutral", "tense"].includes(meta.mood) ? meta.mood : "neutral",
        thumbnail_hook: String(meta.thumbnail_hook || "").slice(0, 60),
        sections: allSections,
    };
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

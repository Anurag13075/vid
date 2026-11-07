const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
let cachedGroqModels = null;
export async function resolveGroqModels(apiKey) {
    if (cachedGroqModels && cachedGroqModels.length > 0)
        return cachedGroqModels;
    const candidateOrder = [
        process.env.GROQ_MODEL,
        "openai/gpt-oss-120b",
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-20b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
    ].filter(Boolean);
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
            const data = (await res.json());
            const availableIds = new Set((data.data || []).map((m) => m.id));
            const verified = candidateOrder.filter((m) => availableIds.has(m));
            if (verified.length > 0) {
                cachedGroqModels = verified;
                console.log(`[groq] Discovered ${verified.length} verified models for API key: ${verified.join(", ")}`);
                return verified;
            }
        }
    }
    catch (err) {
        console.warn(`[groq] Could not query /models endpoint: ${err.message}`);
    }
    cachedGroqModels = candidateOrder;
    return candidateOrder;
}
function targetSections(length) {
    switch (length) {
        case "short":
            return { count: 12, label: "5-6 minutes", wordsPerSection: 100, totalWords: 1200 };
        case "long":
            return { count: 20, label: "10-12 minutes", wordsPerSection: 110, totalWords: 2200 };
        case "extended":
            return { count: 26, label: "15-18 minutes", wordsPerSection: 110, totalWords: 2860 };
        default:
            return { count: 16, label: "7-9 minutes", wordsPerSection: 105, totalWords: 1680 };
    }
}
function repairJson(raw, isArray = false) {
    let s = raw.trim();
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (isArray) {
        const first = s.indexOf("[");
        const last = s.lastIndexOf("]");
        if (first !== -1 && last !== -1 && last > first)
            s = s.slice(first, last + 1);
    } else {
        const first = s.indexOf("{");
        const last = s.lastIndexOf("}");
        if (first !== -1 && last !== -1 && last > first)
            s = s.slice(first, last + 1);
    }
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
async function callGroq(messages, maxTokens = 6144) {
    const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim();
    if (!apiKey)
        throw new Error("GROQ_API_KEY environment variable is not set");
    const models = await resolveGroqModels(apiKey);
    let lastError = null;
    for (const model of models) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 85_000);
        try {
            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    temperature: 0.65,
                    messages,
                }),
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!response.ok) {
                const responseText = await response.text();
                console.warn(`[groq] model ${model} status ${response.status}: ${responseText}`);
                if (response.status === 404 || response.status === 400) {
                    lastError = new Error(`Groq model ${model} failed (${response.status}): ${responseText}`);
                    continue;
                }
                throw new Error(`Groq API error ${response.status}: ${responseText}`);
            }
            const responseText = await response.text();
            const data = JSON.parse(responseText);
            const choice = data.choices?.[0];
            const content = choice?.message?.content || "";
            console.log(`[groq] model ${model} returned ${content.length} chars`);
            return content || "{}";
        }
        catch (err) {
            clearTimeout(timer);
            if (err?.name === "AbortError") {
                lastError = new Error(`Groq API timed out after 85s with model ${model}`);
                continue;
            }
            lastError = err;
        }
    }
    throw lastError || new Error("Failed to get response from Groq");
}
async function generateSectionBatch(title, startId, count, wordsPerSection, isFirst, isLast) {
    const firstType = isFirst ? "intro" : "broll";
    const lastType = isLast ? "outro" : "broll";
    const prompt = `You are a world-class documentary director and investigative journalist (in the style of Vox, Wendover Productions, and Frontline).
Write sections ${startId} to ${startId + count - 1} of a comprehensive, publish-ready documentary script about: "${title}".

Output a JSON array of exactly ${count} section objects:
[
  {
    "id": ${startId},
    "narration": "Spoken documentary narration...",
    "visual_keywords": ["cleanroom", "silicon wafer", "circuit board"],
    "section_type": "${firstType}",
    "key_point": "Key statistic, date, or fact highlight",
    "chapter_title": ${isFirst ? '"CHAPTER 01 · THE HOOK"' : (startId % 4 === 1 ? '"ACT II · THE ESCALATION"' : 'null')},
    "location_stamp": ${isFirst ? '"📍 [LOCATION] · [YEAR/DATE]"' : 'null'},
    "estimated_words": ${wordsPerSection},
    "sfx": false
  }
]

DOCUMENTARY NARRATIVE RULES:
- LOCATION BADGES: In 'location_stamp', if this section references a specific historical location, city, bunker, or date/year from the research pack, format a concise HUD badge like '📍 NORMANDY · JUNE 1944' or '📍 CAPE CANAVERAL · 1969'. If no specific location/date applies to this section, set location_stamp to null. NEVER invent locations not in the research.
- CHAPTER TITLES: In 'chapter_title', provide a high-impact, topic-relevant act or chapter title for transition sections (like 'ACT I · THE INITIAL BREACH' or 'CHAPTER 02 · ESCALATION'), or null for standard middle scenes.
${isFirst ? `- Section ${startId} (COLD OPEN HOOK): Begin directly in media res with high stakes, a gripping sensory scene, or an unanswered paradox. NEVER say "In this video", "Welcome back", or "Today we look at". Hook the viewer immediately.` : ""}
${isLast ? `- Section ${startId + count - 1} (CONCLUSION): Provide a powerful philosophical resolution, lasting historical consequences, and an open reflection that leaves an impact.` : ""}
- All middle sections: Use "broll" or "stat" (use "stat" whenever specific numbers, dates, megatons, population figures, or historical milestones are mentioned).
- WRITING STYLE: Short spoken sentences (8 to 18 words). Conversational cadence, rhythm, dramatic pauses. Written specifically for natural voiceover narration.
- ACCURACY: Include real historical dates, official operations, names of key figures, geographical coordinates or locations, and verified facts. Do not invent facts.
- RETENTION & PACING: Create tension, open loops between sections ("What the public wasn't told was far worse..."), and satisfying payoffs.
- LENGTH: Each narration MUST be approximately ${wordsPerSection} to ${wordsPerSection + 15} words. Count carefully.
- VISUAL KEYWORDS: Provide 3 to 5 CONCISE, 1-3 word stock footage search terms per section (e.g. "cleanroom", "silicon wafer", "circuit board", "battleship"). STRICT RULE: Maximum 3 words per keyword, never write long sentences or descriptive paragraphs! Stock video engines return 0 hits for long phrases.
  * STRICT NEGATIVES: NEVER use generic filler like "business person", "team meeting", "laptop desk", "concept", "abstract background", "cinematic". Use only concrete physical nouns.
- Output ONLY the valid JSON array. No markdown fences, no preamble.`;
    const raw = await callGroq([
        {
            role: "system",
            content: "You output ONLY a strictly valid JSON array of documentary script sections. No markdown, no commentary.",
        },
        { role: "user", content: prompt },
    ]);
    const cleaned = repairJson(raw, true);
    const parsed = JSON.parse(cleaned);
    const sections = Array.isArray(parsed) ? parsed : [];
    return sections.map((sec, i) => ({
        id: typeof sec.id === "number" ? sec.id : startId + i,
        narration: String(sec.narration || "").trim(),
        visual_keywords: Array.isArray(sec.visual_keywords) && sec.visual_keywords.length > 0
            ? sec.visual_keywords.slice(0, 3).map((k) => String(k).trim())
            : [title.toLowerCase().slice(0, 40)],
        section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(sec.section_type)
            ? sec.section_type
            : "broll",
        key_point: sec.key_point ? String(sec.key_point).slice(0, 75).trim() : null,
        chapter_title: sec.chapter_title ? String(sec.chapter_title).slice(0, 60).trim() : null,
        location_stamp: sec.location_stamp ? String(sec.location_stamp).slice(0, 50).trim() : null,
        estimated_words: Number(sec.estimated_words) || wordsPerSection,
        sfx: Boolean(sec.sfx),
    }));
}
export async function generateScript(title, length) {
    const { count, wordsPerSection } = targetSections(length);
    // 1. Generate Metadata
    const metaPrompt = `For a high-end YouTube documentary about "${title}", produce metadata:
{
  "title": "Gripping, high-CTR YouTube documentary title (50-70 chars)",
  "description": "Engaging 180-250 character SEO description highlighting the core mystery and historical stakes",
  "mood": "dramatic", // one of: "dramatic", "tense", "neutral", "uplifting"
  "thumbnail_hook": "4-6 powerful words for thumbnail",
  "tags": ["topic", "documentary", "history", "deep dive"]
}
Output ONLY valid JSON.`;
    let meta = {};
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const raw = await callGroq([
                { role: "system", content: "Output ONLY a valid JSON object." },
                { role: "user", content: metaPrompt },
            ]);
            const repaired = repairJson(raw);
            meta = JSON.parse(repaired);
            break;
        }
        catch (err) {
            console.warn(`[script] Meta generation attempt ${attempt} failed: ${err.message}`);
            if (attempt < 3)
                await sleep(2000 * attempt);
        }
    }
    // 2. Generate Sections in Batches
    const BATCH_SIZE = 4;
    const allSections = [];
    for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
        const batchCount = Math.min(BATCH_SIZE, count - batchStart);
        const startId = batchStart + 1;
        const isFirst = batchStart === 0;
        const isLast = batchStart + batchCount >= count;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const adjustedWords = attempt === 1 ? wordsPerSection : Math.floor(wordsPerSection * 0.9);
                const sections = await generateSectionBatch(title, startId, batchCount, adjustedWords, isFirst, isLast);
                allSections.push(...sections);
                console.log(`[script] Batch ${startId}-${startId + batchCount - 1} generated successfully (${sections.length} sections)`);
                break;
            }
            catch (err) {
                const msg = err.message || String(err);
                console.error(`[script] Batch ${startId} attempt ${attempt} failed: ${msg}`);
                const delay = msg.includes("429") ? 15000 : 3500 * attempt;
                if (attempt < 3)
                    await sleep(delay);
                else
                    throw new Error(`Failed to generate sections ${startId}-${startId + batchCount - 1}: ${msg}`);
            }
        }
        if (batchStart + BATCH_SIZE < count)
            await sleep(1200);
    }
    if (allSections.length < 4) {
        throw new Error(`Only generated ${allSections.length} sections, minimum 4 required`);
    }
    // 3. Generate Researched Sources & Bibliography
    let sources = [];
    try {
        const sourcesPrompt = `List 5 to 7 real, authoritative historical or scientific sources, archives, government reports, or academic records relevant to: "${title}".
Output a JSON array of strings:
["Source 1 with author/agency and title", "Source 2...", ...]
Output ONLY valid JSON array.`;
        const rawSources = await callGroq([
            { role: "system", content: "Output ONLY a valid JSON array of strings." },
            { role: "user", content: sourcesPrompt },
        ], 2048);
        const clean = repairJson(rawSources, true);
        sources = JSON.parse(clean);
    }
    catch (err) {
        console.warn("[script] Source bibliography generation optional fallback:", err);
        sources = [
            "National Archives and Records Administration (NARA) Declassified Files",
            "Department of Energy Historical Nuclear Testing Records",
            "Comprehensive Historical Overview & Archival Documentation",
        ];
    }
    return {
        title: String(meta.title || title).trim(),
        description: String(meta.description || `Investigative documentary exploring ${title}.`).slice(0, 300),
        mood: ["dramatic", "uplifting", "neutral", "tense"].includes(meta.mood) ? meta.mood : "dramatic",
        thumbnail_hook: String(meta.thumbnail_hook || title.slice(0, 30)).trim(),
        sources: Array.isArray(sources) ? sources.map(String) : [],
        tags: Array.isArray(meta.tags) ? meta.tags.map(String) : ["documentary", "history"],
        sections: allSections,
    };
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

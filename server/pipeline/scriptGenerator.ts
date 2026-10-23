import type { Script, ScriptSection } from "./types.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

function targetSections(length: string): {
  count: number;
  label: string;
  wordsPerSection: number;
  totalWords: number;
} {
  switch (length) {
    case "short":
      return { count: 12, label: "6-8 minutes",   wordsPerSection: 100, totalWords: 1200 };
    case "long":
      return { count: 22, label: "12-15 minutes", wordsPerSection: 110, totalWords: 2420 };
    default:
      return { count: 16, label: "9-11 minutes",  wordsPerSection: 105, totalWords: 1680 };
  }
}

function repairJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/\/\/[^\n]*/g, "");
  const missingCommaRe =
    /(\btrue|\bfalse|\bnull|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*")\s*\n(\s*"[^"]*"\s*:)/g;
  let prev = "";
  while (prev !== s) { prev = s; s = s.replace(missingCommaRe, "$1,\n$2"); }
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/,\s*,/g, ",");
  return s;
}

async function callGroq(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.GROK_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROK_API_KEY (or GROQ_API_KEY) environment variable is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  // Available on Groq Cloud: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.7,
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const responseText = await response.text();
    console.log(`[groq] status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`Groq API error ${response.status}: ${responseText}`);
    }

    const data = JSON.parse(responseText) as any;
    const choice = data.choices?.[0];

    if (choice?.finish_reason === "length") {
      throw new Error(`Groq truncated response (finish_reason: length) — will retry with fewer words`);
    }

    const content = (choice?.message?.content as string) || "";
    console.log(`[groq] content length: ${content.length} chars`);
    return content || "{}";
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") throw new Error("Groq API timed out after 90s");
    throw err;
  }
}

async function generateSectionBatch(
  title: string,
  startId: number,
  count: number,
  wordsPerSection: number,
  isFirst: boolean,
  isLast: boolean
): Promise<ScriptSection[]> {
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
- visual_keywords: 3 SPECIFIC searchable stock footage phrases directly about "${title}".
  RULES FOR KEYWORDS:
  * Each keyword = visible subject + action + setting. All 3 must relate to "${title}".
  * Think: what would someone search on Pexels/Pixabay to find a video clip for this exact section?
  * GOOD examples for "how to get rid of bed bugs": "bed bug crawling white mattress close up", "pest control spray bottle bedroom", "person sealing mattress encasement cover"
  * GOOD examples for "how to make money online": "person typing laptop home office", "paypal payment notification phone screen", "freelancer working desk coffee shop"
  * GOOD examples for "healthy breakfast recipes": "oatmeal bowl fruits close up kitchen", "person blending smoothie counter", "eggs cooking pan morning light"
  * BAD: "cinematic", "background", "dramatic", "visual", "scene", "abstract", "nature", "landscape", "people walking", any word not related to "${title}"
  * NEVER use generic filler words. Every keyword must be specific to "${title}" and this section's narration.
- Output ONLY the JSON array. No markdown, no explanation, no extra text.`;

  const raw = await callGroq([
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

  const sections = JSON.parse(s) as any[];
  return sections.map((sec: any, i: number) => ({
    id: typeof sec.id === "number" ? sec.id : startId + i,
    narration: String(sec.narration || "").trim(),
    visual_keywords: Array.isArray(sec.visual_keywords)
      ? sec.visual_keywords.slice(0, 3).map(String)
      : [title.toLowerCase().slice(0, 40)],
    section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(sec.section_type)
      ? sec.section_type
      : "broll",
    key_point: sec.key_point ? String(sec.key_point).slice(0, 60) : null,
    estimated_words: Number(sec.estimated_words) || wordsPerSection,
    sfx: Boolean(sec.sfx),
  }));
}

export async function generateScript(title: string, length: string): Promise<Script> {
  const { count, label, wordsPerSection } = targetSections(length);

  const metaPrompt = `For a YouTube documentary about "${title}", output this JSON:
{
  "title": "compelling title string",
  "description": "150-200 char SEO description",
  "mood": "dramatic",
  "thumbnail_hook": "4-6 punchy words"
}
Output ONLY the JSON object.`;

  let meta: any = {};

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callGroq([
        { role: "system", content: "Output ONLY valid JSON, no markdown." },
        { role: "user", content: metaPrompt },
      ]);
      const repaired = repairJson(raw);
      meta = JSON.parse(repaired);
      console.log("[groq] meta generated ok");
      break;
    } catch (err) {
      console.error(`Meta attempt ${attempt} failed:`, (err as Error).message);
      if (attempt < 3) await sleep(5000);
    }
  }

  const BATCH_SIZE = 4;
  const allSections: ScriptSection[] = [];

  for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, count - batchStart);
    const startId = batchStart + 1;
    const isFirst = batchStart === 0;
    const isLast = batchStart + batchCount >= count;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const adjustedWords = attempt === 1 ? wordsPerSection : Math.floor(wordsPerSection * 0.88);
        const sections = await generateSectionBatch(
          title, startId, batchCount, adjustedWords, isFirst, isLast
        );
        allSections.push(...sections);
        console.log(`[groq] batch ${startId}-${startId + batchCount - 1} ok (${sections.length} sections)`);
        break;
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`Batch ${startId} attempt ${attempt} failed:`, msg);
        const delay = msg.includes("429") ? 20000 : 6000 * attempt;
        if (attempt < 3) await sleep(delay);
        else throw new Error(`Failed to generate sections ${startId}-${startId + batchCount - 1}: ${msg}`);
      }
    }

    if (batchStart + BATCH_SIZE < count) await sleep(2000);
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

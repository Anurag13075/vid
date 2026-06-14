import type { Script, ScriptSection } from "./types.js";

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";

function targetSections(length: string): {
  count: number;
  label: string;
  wordsPerSection: number;
  totalWords: number;
} {
  switch (length) {
    case "short":
      return { count: 8,  label: "5-6 minutes",   wordsPerSection: 100, totalWords: 800  };
    case "long":
      return { count: 12, label: "12-14 minutes",  wordsPerSection: 130, totalWords: 1560 };
    default:
      return { count: 10, label: "8-10 minutes",   wordsPerSection: 120, totalWords: 1200 };
  }
}

const SYSTEM_PROMPT = `You are a YouTube scriptwriter. Output ONLY valid JSON, no markdown, no explanation.`;

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

function normaliseScript(parsed: any): Script {
  if (!parsed || typeof parsed !== "object") throw new Error("Script is not an object");
  if (!Array.isArray(parsed.sections)) throw new Error("Script missing sections array");
  if (parsed.sections.length < 4) throw new Error(`Too few sections: ${parsed.sections.length}`);

  const seen = new Set<number>();
  const cleaned: ScriptSection[] = [];

  for (let i = 0; i < parsed.sections.length; i++) {
    const s = parsed.sections[i];
    if (!s || typeof s !== "object") continue;
    const id = typeof s.id === "number" ? s.id : i + 1;
    if (seen.has(id)) continue;
    seen.add(id);
    const isGraphic = s.section_type === "graphic";
    cleaned.push({
      id,
      narration: isGraphic ? "" : String(s.narration || "").trim(),
      visual_keywords: Array.isArray(s.visual_keywords)
        ? s.visual_keywords.slice(0, 3).map(String)
        : ["cinematic background"],
      section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(s.section_type)
        ? s.section_type
        : "broll",
      key_point: s.key_point ? String(s.key_point).slice(0, 60) : null,
      estimated_words: Number(s.estimated_words) || 65,
      sfx: Boolean(s.sfx),
    });
  }

  if (cleaned.length < 4) throw new Error("Too few valid sections after dedup");

  return {
    title: String(parsed.title || "").trim(),
    description: String(parsed.description || "").slice(0, 200),
    mood: ["dramatic", "uplifting", "neutral", "tense"].includes(parsed.mood) ? parsed.mood : "neutral",
    thumbnail_hook: String(parsed.thumbnail_hook || "").slice(0, 60),
    sections: cleaned,
  };
}

// ─── Call Cerebras API ───────────────────────────────────────────────────────
async function callCerebras(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error("CEREBRAS_API_KEY env variable is not set");

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

    // Log full response for debugging
    const responseText = await response.text();
    console.log(`[cerebras] status: ${response.status}`);
    console.log(`[cerebras] response body (first 300 chars): ${responseText.slice(0, 300)}`);

    if (!response.ok) {
      throw new Error(`Cerebras API error ${response.status}: ${responseText}`);
    }

    const data = JSON.parse(responseText) as any;
    const content = (data.choices?.[0]?.message?.content as string) || "";
    console.log(`[cerebras] content length: ${content.length} chars`);
    console.log(`[cerebras] content preview: ${content.slice(0, 200)}`);
    return content || "{}";
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") throw new Error("Cerebras API timed out after 90s");
    throw err;
  }
}

// ─── Generate sections in two batches to avoid token truncation ──────────────
// A single call for 10 sections at 65 words each = ~4000 tokens output.
// gpt-oss-120b sometimes silently truncates near the token limit leaving
// broken JSON. Splitting into 2 calls of 5 sections each (~2000 tokens each)
// guarantees complete JSON on every call.
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
    "narration": "exactly ${wordsPerSection} words of spoken narration",
    "visual_keywords": ["keyword1", "keyword2", "keyword3"],
    "section_type": "${firstType}",
    "key_point": "short fact or null",
    "estimated_words": ${wordsPerSection},
    "sfx": false
  }
]

RULES:
- Section ${startId} type: "${firstType}"${isLast ? `\n- Section ${startId + count - 1} type: "${lastType}"` : ""}
- All others: "broll" or "stat" (use stat for sections with numbers/dates)
- narration: exactly ${wordsPerSection} words, factual, engaging, no filler
- visual_keywords: 3 specific cinematic keywords for that scene
- Output ONLY the JSON array, nothing else`;

  const raw = await callCerebras([
    { role: "system", content: "Output ONLY a valid JSON array. No markdown, no explanation." },
    { role: "user", content: prompt },
  ]);

  // Extract array from response
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
      : ["cinematic background"],
    section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(sec.section_type)
      ? sec.section_type
      : "broll",
    key_point: sec.key_point ? String(sec.key_point).slice(0, 60) : null,
    estimated_words: Number(sec.estimated_words) || wordsPerSection,
    sfx: Boolean(sec.sfx),
  }));
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateScript(title: string, length: string): Promise<Script> {
  const { count, label, wordsPerSection } = targetSections(length);

  // Step 1: generate metadata (title, description, mood, hook) — tiny call
  const metaPrompt = `For a YouTube documentary about "${title}", output this JSON:
{
  "title": "compelling title string",
  "description": "150-200 char SEO description",
  "mood": "dramatic",
  "thumbnail_hook": "4-6 punchy words"
}
Output ONLY the JSON object.`;

  let lastError: Error | null = null;
  let meta: any = {};

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
    } catch (err) {
      console.error(`Meta attempt ${attempt} failed:`, (err as Error).message);
      if (attempt < 3) await sleep(5000);
    }
  }

  // Step 2: generate sections in batches of 5 to avoid truncation
  const BATCH_SIZE = 5;
  const allSections: ScriptSection[] = [];

  for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, count - batchStart);
    const startId = batchStart + 1;
    const isFirst = batchStart === 0;
    const isLast = batchStart + batchCount >= count;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const sections = await generateSectionBatch(
          title, startId, batchCount, wordsPerSection, isFirst, isLast
        );
        allSections.push(...sections);
        console.log(`[cerebras] batch ${startId}-${startId + batchCount - 1} ok (${sections.length} sections)`);
        break;
      } catch (err) {
        lastError = err as Error;
        console.error(`Batch ${startId} attempt ${attempt} failed:`, (err as Error).message);
        const delay = (err as Error).message.includes("429") ? 15000 : 5000 * attempt;
        if (attempt < 3) await sleep(delay);
        else throw new Error(`Failed to generate sections ${startId}-${startId + batchCount - 1}: ${(err as Error).message}`);
      }
    }

    // Small pause between batches to stay under TPM limit
    if (batchStart + BATCH_SIZE < count) await sleep(1000);
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

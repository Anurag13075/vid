import Groq from "groq-sdk";
import type { Script, ScriptSection } from "./types.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function targetSections(length: string): { count: number; label: string } {
  switch (length) {
    case "short":  return { count: 12, label: "4-6 minutes" };
    case "long":   return { count: 22, label: "12-15 minutes" };
    default:       return { count: 16, label: "8-10 minutes" };
  }
}

const SYSTEM_PROMPT = `You are a professional YouTube documentary scriptwriter.
Output ONLY a single raw JSON object — no markdown, no code fences, no explanation, no extra text before or after.
The JSON must be 100% valid. Every property must be separated by a comma. No trailing commas. No duplicate keys.`;

// ─── Robust JSON repair ───────────────────────────────────────────────────────
function repairJson(raw: string): string {
  let s = raw.trim();

  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }

  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/\/\/[^\n]*/g, "");

  const missingCommaRe =
    /(\btrue|\bfalse|\bnull|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*")\s*\n(\s*"[^"]*"\s*:)/g;
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(missingCommaRe, "$1,\n$2");
  }

  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/,\s*,/g, ",");

  return s;
}

// ─── Validate and normalise a parsed script ──────────────────────────────────
function normaliseScript(parsed: any): Script {
  if (!parsed || typeof parsed !== "object") throw new Error("Script is not an object");
  if (!Array.isArray(parsed.sections)) throw new Error("Script missing sections array");
  if (parsed.sections.length < 6) {
    throw new Error(`Script has too few sections: ${parsed.sections.length}`);
  }

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
        ? s.visual_keywords.slice(0, 5).map(String)
        : ["cinematic background"],
      section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(s.section_type)
        ? s.section_type
        : "broll",
      key_point: s.key_point ? String(s.key_point).slice(0, 60) : null,
      estimated_words: Number(s.estimated_words) || 120,
      sfx: Boolean(s.sfx),
    });
  }

  if (cleaned.length < 6) throw new Error("Too few valid sections after deduplication");

  return {
    title: String(parsed.title || "").trim(),
    description: String(parsed.description || "").slice(0, 200),
    mood: ["dramatic", "uplifting", "neutral", "tense"].includes(parsed.mood)
      ? parsed.mood
      : "neutral",
    thumbnail_hook: String(parsed.thumbnail_hook || "").slice(0, 60),
    sections: cleaned,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateScript(title: string, length: string): Promise<Script> {
  const { count, label } = targetSections(length);

  const prompt = `Write a complete documentary-style YouTube script for: "${title}"

Target: exactly ${count} sections (${label} video)

Return this exact JSON structure. IT MUST BE VALID JSON — every property separated by commas, no trailing commas, no duplicate keys:

{
  "title": "string",
  "description": "string (150-200 chars, YouTube SEO)",
  "mood": "dramatic | uplifting | neutral | tense",
  "thumbnail_hook": "string (4-7 punchy words)",
  "sections": [
    {
      "id": 1,
      "narration": "string (spoken narration, 100-160 words for non-graphic sections, empty string for graphic)",
      "visual_keywords": ["specific visual 1", "specific visual 2", "specific visual 3"],
      "section_type": "intro | broll | stat | graphic | outro",
      "key_point": "string or null",
      "estimated_words": 130,
      "sfx": false
    }
  ]
}

STRICT RULES:
1. section_type "intro" → first section only
2. section_type "outro" → last section only
3. section_type "graphic" → narration MUST be empty string "", used 1-2 times at act breaks only
4. section_type "stat" → use for any section with a specific number, percentage, or date
5. section_type "broll" → everything else
6. visual_keywords must be cinematic and SPECIFIC to that scene, not the general topic
7. key_point: max 8 words, only for striking stats/facts, otherwise null
8. Write EXACTLY ${count} sections — no more, no less
9. All IDs must be sequential starting at 1 with NO gaps and NO duplicates
10. narration must be 100-160 words for all non-graphic sections`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const message = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 8000,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      });

      const raw = message.choices[0]?.message?.content || "{}";

      let cleaned: string;
      try {
        cleaned = repairJson(raw);
      } catch {
        cleaned = raw;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch (jsonErr) {
        console.error(`Attempt ${attempt}: JSON parse failed.\nRepaired candidate:\n${cleaned.slice(0, 800)}`);
        throw new Error(`JSON parse error: ${(jsonErr as Error).message}`);
      }

      return normaliseScript(parsed);
    } catch (err) {
      lastError = err as Error;
      console.error(`Script generation attempt ${attempt} failed:`, (err as Error).message);
      if (attempt < 3) await sleep(4000 * attempt);
    }
  }

  throw lastError || new Error("Script generation failed after 3 attempts");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
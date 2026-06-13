import Groq from "groq-sdk";
import type { Script, ScriptSection } from "./types.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Target word counts per length ──────────────────────────────────────────
// 130 words/min is the average TTS narration pace.
// "short"  →  5-6 min  →  ~700  words across 10 sections
// "medium" →  8-10 min →  ~1150 words across 16 sections  ← default
// "long"   →  12-15min →  ~1700 words across 22 sections
//
// Groq free tier hard limit: 12,000 TPM.
// max_tokens must stay at 8000 to keep total request under 12k.
// We compensate by tightening the prompt (fewer tokens in = more budget for output)
// and targeting 72-92 words/section which Groq can reliably fit in 8000 tokens.
function targetSections(length: string): {
  count: number;
  label: string;
  wordsPerSection: number;
  totalWords: number;
} {
  switch (length) {
    case "short":
      return { count: 10, label: "5-6 minutes",   wordsPerSection: 70, totalWords: 700  };
    case "long":
      return { count: 22, label: "12-15 minutes", wordsPerSection: 78, totalWords: 1700 };
    default:
      return { count: 16, label: "8-10 minutes",  wordsPerSection: 72, totalWords: 1150 };
  }
}

const SYSTEM_PROMPT = `You are a professional YouTube documentary scriptwriter.
Output ONLY a single raw JSON object — no markdown, no code fences, no explanation.
The JSON must be 100% valid. Every property separated by a comma. No trailing commas. No duplicate keys.`;

// ─── Robust JSON repair ───────────────────────────────────────────────────────
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

// ─── Validate and normalise a parsed script ──────────────────────────────────
function normaliseScript(parsed: any): Script {
  if (!parsed || typeof parsed !== "object") throw new Error("Script is not an object");
  if (!Array.isArray(parsed.sections)) throw new Error("Script missing sections array");
  if (parsed.sections.length < 6) throw new Error(`Script has too few sections: ${parsed.sections.length}`);

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
  const { count, label, wordsPerSection, totalWords } = targetSections(length);

  // Prompt kept intentionally compact to stay under Groq's 12k TPM limit.
  // Total request = prompt tokens (~800) + max_tokens (8000) = ~8800, well under 12k.
  const prompt = `Write a ${label} YouTube documentary script for: "${title}"

REQUIREMENTS:
- Exactly ${count} sections, ~${totalWords} total narration words
- Each non-graphic section: ${wordsPerSection}-${wordsPerSection + 20} words of narration (count carefully)
- Hook viewer hard in section 1 with a shocking fact or question
- Include real stats, dates, specific details — no vague filler
- End with strong call to action

JSON format (valid JSON only, no markdown):
{
  "title": "string",
  "description": "string (150-200 chars SEO)",
  "mood": "dramatic|uplifting|neutral|tense",
  "thumbnail_hook": "4-7 punchy words",
  "sections": [
    {
      "id": 1,
      "narration": "${wordsPerSection}-${wordsPerSection + 20} words or empty string for graphic",
      "visual_keywords": ["specific visual 1", "specific visual 2", "specific visual 3"],
      "section_type": "intro|broll|stat|graphic|outro",
      "key_point": "max 8 words or null",
      "estimated_words": ${wordsPerSection},
      "sfx": false
    }
  ]
}

RULES:
- intro: section 1 only. outro: last section only. graphic: empty narration, max 2 uses
- stat: sections with numbers/percentages/dates. broll: everything else
- IDs sequential from 1, no gaps, no duplicates
- Exactly ${count} sections, no more no less`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const message = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        // Kept at 8000 — Groq free tier limit is 12,000 TPM.
        // prompt tokens ~800 + 8000 output = ~8800 total, safely under 12k.
        // Previously set to 16000 which caused 413 rate limit errors.
        max_tokens: 8000,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      });

      const raw = message.choices[0]?.message?.content || "{}";
      let cleaned: string;
      try { cleaned = repairJson(raw); } catch { cleaned = raw; }

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch (jsonErr) {
        console.error(`Attempt ${attempt}: JSON parse failed.\n${cleaned.slice(0, 800)}`);
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

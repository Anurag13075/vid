import type { Script, ScriptSection } from "./types.js";

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";

// ─── Target word counts per length ──────────────────────────────────────────
// 130 words/min is the average TTS narration pace.
// Token budget reality with gpt-oss-120b on Cerebras free tier (100k TPM):
//   - Each section JSON block ≈ 200-250 tokens (narration + metadata)
//   - 12 sections × 250 tokens = ~3000 tokens output — safely under 6000 limit
//   - Keeps 3 retry attempts within 100k TPM (3 × 6000 = 18k per video)
//
// "short"  →  5-6 min  →  10 sections × 65 words  = ~650  words
// "medium" →  8-10 min →  12 sections × 80 words  = ~960  words  ← default
// "long"   →  12-14min →  16 sections × 80 words  = ~1280 words
function targetSections(length: string): {
  count: number;
  label: string;
  wordsPerSection: number;
  totalWords: number;
} {
  switch (length) {
    case "short":
      return { count: 10, label: "5-6 minutes",   wordsPerSection: 65, totalWords: 650  };
    case "long":
      return { count: 16, label: "12-14 minutes", wordsPerSection: 80, totalWords: 1280 };
    default:
      return { count: 12, label: "8-10 minutes",  wordsPerSection: 80, totalWords: 960  };
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
      estimated_words: Number(s.estimated_words) || 80,
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

// ─── Raw fetch call to Cerebras API ─────────────────────────────────────────
async function callCerebras(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error("CEREBRAS_API_KEY env variable is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(CEREBRAS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-oss-120b",
        // 6000 tokens fits a 12-section script with 80 words/section comfortably.
        // Previously 8000 caused truncated JSON on sections 14-16 AND blew
        // the 100k TPM rate limit across 3 retry attempts (3 × 8000 = 24k).
        max_tokens: 6000,
        temperature: 0.7,
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cerebras API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    return (data.choices?.[0]?.message?.content as string) || "{}";
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new Error("Cerebras API request timed out after 60s");
    }
    throw err;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateScript(title: string, length: string): Promise<Script> {
  const { count, label, wordsPerSection, totalWords } = targetSections(length);

  const prompt = `Write a ${label} YouTube documentary script for: "${title}"

REQUIREMENTS:
- Exactly ${count} sections, ~${totalWords} total narration words
- Each non-graphic section: EXACTLY ${wordsPerSection} words of narration — count every word carefully
- Hook viewer hard in section 1 with a shocking fact or question
- Include real stats, dates, specific details — no vague filler
- End with strong call to action
- Keep narration concise — do NOT exceed ${wordsPerSection + 10} words per section

JSON format (valid JSON only, no markdown):
{
  "title": "string",
  "description": "string (150-200 chars SEO)",
  "mood": "dramatic|uplifting|neutral|tense",
  "thumbnail_hook": "4-7 punchy words",
  "sections": [
    {
      "id": 1,
      "narration": "exactly ${wordsPerSection} words or empty string for graphic",
      "visual_keywords": ["keyword1", "keyword2", "keyword3"],
      "section_type": "intro|broll|stat|graphic|outro",
      "key_point": "max 8 words or null",
      "estimated_words": ${wordsPerSection},
      "sfx": false
    }
  ]
}

RULES:
- intro: section 1 only. outro: last section only. graphic: empty narration, max 1 use
- stat: sections with numbers/percentages/dates. broll: everything else
- IDs sequential from 1, no gaps, no duplicates
- Exactly ${count} sections, no more no less
- Output ONLY the JSON object, nothing else`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callCerebras([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: prompt },
      ]);

      console.log(`[cerebras] attempt ${attempt} raw length: ${raw.length} chars`);

      let cleaned: string;
      try { cleaned = repairJson(raw); } catch { cleaned = raw; }

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch (jsonErr) {
        console.error(`Attempt ${attempt}: JSON parse failed.\n${cleaned.slice(0, 500)}`);
        throw new Error(`JSON parse error: ${(jsonErr as Error).message}`);
      }

      return normaliseScript(parsed);
    } catch (err) {
      lastError = err as Error;
      console.error(`Script generation attempt ${attempt} failed:`, (err as Error).message);
      // Longer delay on 429 rate limit errors to let the TPM window reset
      const delay = (err as Error).message.includes("429") ? 15000 : 4000 * attempt;
      if (attempt < 3) await sleep(delay);
    }
  }

  throw lastError || new Error("Script generation failed after 3 attempts");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

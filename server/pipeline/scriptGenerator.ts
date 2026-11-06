import type { Script, ScriptSection } from "./types.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

let cachedGroqModels: string[] | null = null;

export async function resolveGroqModels(apiKey: string): Promise<string[]> {
  if (cachedGroqModels && cachedGroqModels.length > 0) return cachedGroqModels;

  const candidateOrder = [
    process.env.GROQ_MODEL,
    "openai/gpt-oss-120b",
    "qwen/qwen3-32b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
  ].filter(Boolean) as string[];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as any;
      const availableIds = new Set<string>((data.data || []).map((m: any) => m.id));
      const verified = candidateOrder.filter((m) => availableIds.has(m));
      if (verified.length > 0) {
        cachedGroqModels = verified;
        console.log(`[groq] Discovered ${verified.length} verified models for API key: ${verified.join(", ")}`);
        return verified;
      }
    }
  } catch (err: any) {
    console.warn(`[groq] Could not query /models endpoint: ${err.message}`);
  }

  cachedGroqModels = candidateOrder;
  return candidateOrder;
}

function targetSections(length: string): {
  count: number;
  label: string;
  wordsPerSection: number;
  totalWords: number;
} {
  switch (length) {
    case "short":
      return { count: 12, label: "6-8 minutes", wordsPerSection: 105, totalWords: 1260 };
    case "long":
      return { count: 22, label: "12-15 minutes", wordsPerSection: 115, totalWords: 2530 };
    default:
      return { count: 16, label: "8-10 minutes", wordsPerSection: 110, totalWords: 1760 };
  }
}

/**
 * Walks the text character by character and fixes problems INSIDE string values:
 *  - unescaped double quotes in the middle of a string (e.g. He said "stop" and left)
 *  - raw newlines / tabs inside a string (invalid in JSON)
 * A quote is treated as the real end of a string only if the next non-space
 * character is one of , } ] : (or a new "key" on the next line, i.e. a missing comma).
 */
function fixStringContents(s: string): string {
  let out = "";
  let inStr = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (!inStr) {
      out += c;
      if (c === '"') inStr = true;
      continue;
    }

    // Already-escaped character: copy it as-is
    if (c === "\\") {
      out += c + (s[i + 1] ?? "");
      i++;
      continue;
    }

    if (c === '"') {
      let j = i + 1;
      let sawNewline = false;
      while (j < s.length && /\s/.test(s[j])) {
        if (s[j] === "\n") sawNewline = true;
        j++;
      }
      const next = s[j];
      const closes =
        next === undefined ||
        next === "," ||
        next === "}" ||
        next === "]" ||
        next === ":" ||
        (next === '"' && sawNewline); // missing comma between properties

      if (closes) {
        out += c;
        inStr = false;
      } else {
        out += '\\"'; // inner quote, escape it
      }
      continue;
    }

    if (c === "\n") {
      out += "\\n";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\t") {
      out += "\\t";
      continue;
    }

    out += c;
  }

  return out;
}

function repairJson(raw: string): string {
  let s = raw.trim();

  // Reasoning models sometimes leak their thinking into the content
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Strip markdown fences
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Keep only the outermost JSON object or array
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let first = -1;
  let closer = "}";
  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    first = firstObj;
    closer = "}";
  } else if (firstArr !== -1) {
    first = firstArr;
    closer = "]";
  }
  const last = s.lastIndexOf(closer);
  if (first !== -1 && last > first) s = s.slice(first, last + 1);

  // Curly SINGLE quotes -> plain apostrophes (safe inside JSON strings).
  // Curly DOUBLE quotes are left alone: they are valid inside JSON strings,
  // and turning them into " is what used to break the output.
  s = s.replace(/[\u2018\u2019]/g, "'");

  // Remove whole-line // comments only (never touch // inside narration)
  s = s.replace(/^\s*\/\/.*$/gm, "");

  // Fix quotes / newlines inside string values
  s = fixStringContents(s);

  // Missing commas between properties on separate lines
  const missingCommaRe =
    /(\btrue|\bfalse|\bnull|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*")\s*\n(\s*"[^"]*"\s*:)/g;
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(missingCommaRe, "$1,\n$2");
  }

  // Trailing and doubled commas
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/,\s*,/g, ",");

  return s;
}

async function callGroq(
  messages: { role: string; content: string }[],
  maxTokens = 8192,
  jsonMode = true
): Promise<string> {
  const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY environment variable is not set");

  const models = await resolveGroqModels(apiKey);
  let lastError: Error | null = null;

  for (const model of models) {
    // Try JSON mode first; if the model rejects it (400), retry the same model without it
    const modes = jsonMode ? [true, false] : [false];

    for (const useJsonMode of modes) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 85_000);

      try {
        const body: Record<string, any> = {
          model,
          max_tokens: maxTokens,
          temperature: 0.65,
          messages,
        };
        if (useJsonMode) body.response_format = { type: "json_object" };
        if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[groq] model ${model} (jsonMode=${useJsonMode}) status ${response.status}: ${errText}`);

          if (response.status === 400 && useJsonMode) {
            // JSON mode unsupported or JSON validation failed: retry without it
            lastError = new Error(`Groq model ${model} failed (400): ${errText}`);
            continue;
          }
          if (response.status === 404 || response.status === 400) {
            lastError = new Error(`Groq model ${model} failed (${response.status}): ${errText}`);
            break; // next model
          }
          throw new Error(`Groq API error ${response.status}: ${errText}`);
        }

        const responseText = await response.text();
        const data = JSON.parse(responseText) as any;
        const choice = data.choices?.[0];

        if (choice?.finish_reason === "length") {
          console.warn(`[groq] model ${model} hit max_tokens (${maxTokens}); output may be truncated`);
        }

        const content = (choice?.message?.content as string) || "";
        console.log(`[groq] model ${model} returned ${content.length} chars`);
        return content || "{}";
      } catch (err: any) {
        clearTimeout(timer);
        if (err?.name === "AbortError") {
          lastError = new Error(`Groq API timed out after 85s with model ${model}`);
          break; // next model
        }
        lastError = err;
        break; // next model
      }
    }
  }

  throw lastError || new Error("Failed to get response from Groq");
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

  const prompt = `You are a world-class documentary director and investigative journalist (in the style of Vox, Wendover Productions, and Frontline).
Write sections ${startId} to ${startId + count - 1} of a comprehensive, publish-ready documentary script about: "${title}".

Output a JSON object with a single "sections" array containing exactly ${count} section objects:
{
  "sections": [
    {
      "id": ${startId},
      "narration": "Spoken documentary narration...",
      "visual_keywords": ["specific subject action setting", "historical archival cue", "cinematic B-roll cue"],
      "section_type": "${firstType}",
      "key_point": "Key statistic, date, or fact highlight",
      "estimated_words": ${wordsPerSection},
      "sfx": false
    }
  ]
}

DOCUMENTARY NARRATIVE RULES:
${isFirst ? `- Section ${startId} (COLD OPEN HOOK): Begin directly in media res with high stakes, a gripping sensory scene, or an unanswered paradox. NEVER say "In this video", "Welcome back", or "Today we look at". Hook the viewer immediately.` : ""}
${isLast ? `- Section ${startId + count - 1} (CONCLUSION): Provide a powerful philosophical resolution, lasting historical consequences, and an open reflection that leaves an impact. Set its section_type to "outro".` : ""}
- All middle sections: Use "broll" or "stat" (use "stat" whenever specific numbers, dates, megatons, population figures, or historical milestones are mentioned).
- WRITING STYLE: Short spoken sentences (8 to 18 words). Conversational cadence, rhythm, dramatic pauses. Written specifically for natural voiceover narration.
- ACCURACY: Include real historical dates, official operations, names of key figures, geographical coordinates or locations, and verified facts. Do not invent facts.
- RETENTION & PACING: Create tension, open loops between sections ("What the public wasn't told was far worse..."), and satisfying payoffs.
- LENGTH: Each narration MUST be approximately ${wordsPerSection} to ${wordsPerSection + 15} words. Count carefully.
- JSON SAFETY: NEVER use double quote characters inside narration, key_point, or visual_keywords. For quoted speech or titles, use single quotes. Do not put line breaks inside string values.
- VISUAL KEYWORDS: Provide exactly 3 DISTINCT, documentary-grade stock footage search terms per section:
  1. Direct Subject/Action: Specific physical entities and operations (e.g. 'semiconductor cleanroom silicon wafer', 'naval battleship firing ocean').
  2. Macro/Technical Detail: Close-up mechanical, blueprint, or tactile detail (e.g. 'microchip circuit board gold wires macro', 'radar scope sweep dark room').
  3. Atmospheric/Aerial Establishing: Contextual environment or drone viewpoint (e.g. 'aerial top down desert test site', 'industrial data center server racks blue').
  * STRICT NEGATIVES: NEVER use generic filler like 'business person', 'team meeting', 'laptop desk', 'concept', 'abstract background', 'cinematic'. Use only concrete physical nouns.
- Output ONLY the valid JSON object. No markdown fences, no preamble.`;

  const raw = await callGroq([
    {
      role: "system",
      content:
        "You output ONLY a strictly valid JSON object with a 'sections' array of documentary script sections. No markdown, no commentary, no double quotes inside string values.",
    },
    { role: "user", content: prompt },
  ]);

  const cleaned = repairJson(raw);
  const parsed = JSON.parse(cleaned);
  const rawSections: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.sections)
    ? parsed.sections
    : [];

  const sections: ScriptSection[] = rawSections
    .map((sec: any, i: number) => ({
      id: startId + i, // force sequential ids, the model sometimes gets them wrong
      narration: String(sec?.narration || "").trim(),
      visual_keywords:
        Array.isArray(sec?.visual_keywords) && sec.visual_keywords.length > 0
          ? sec.visual_keywords.slice(0, 3).map((k: any) => String(k).trim())
          : [title.toLowerCase().slice(0, 40)],
      section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(sec?.section_type)
        ? sec.section_type
        : "broll",
      key_point: sec?.key_point ? String(sec.key_point).slice(0, 75).trim() : null,
      estimated_words: Number(sec?.estimated_words) || wordsPerSection,
      sfx: Boolean(sec?.sfx),
    }))
    .filter((sec) => sec.narration.length > 0);

  if (sections.length === 0) {
    throw new Error("Model returned no usable sections");
  }

  return sections;
}

export async function generateScript(title: string, length: string): Promise<Script> {
  const { count, wordsPerSection } = targetSections(length);

  // 1. Generate Metadata
  const metaPrompt = `For a high-end YouTube documentary about "${title}", produce metadata as a JSON object with these keys:
{
  "title": "Gripping, high-CTR YouTube documentary title (50-70 chars)",
  "description": "Engaging 180-250 character SEO description highlighting the core mystery and historical stakes",
  "mood": "dramatic",
  "thumbnail_hook": "4-6 powerful words for thumbnail",
  "tags": ["topic", "documentary", "history", "deep dive"]
}
The "mood" value must be exactly one of: dramatic, tense, neutral, uplifting.
Do not use double quote characters inside any string value. Output ONLY valid JSON.`;

  let meta: any = {};
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callGroq(
        [
          { role: "system", content: "Output ONLY a valid JSON object." },
          { role: "user", content: metaPrompt },
        ],
        2048
      );
      const repaired = repairJson(raw);
      meta = JSON.parse(repaired);
      break;
    } catch (err: any) {
      console.warn(`[script] Meta generation attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }

  // 2. Generate Sections in Batches
  const BATCH_SIZE = 4;
  const allSections: ScriptSection[] = [];

  for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, count - batchStart);
    const startId = batchStart + 1;
    const isFirst = batchStart === 0;
    const isLast = batchStart + batchCount >= count;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const adjustedWords = attempt === 1 ? wordsPerSection : Math.floor(wordsPerSection * 0.9);
        const sections = await generateSectionBatch(
          title,
          startId,
          batchCount,
          adjustedWords,
          isFirst,
          isLast
        );
        allSections.push(...sections);
        console.log(
          `[script] Batch ${startId}-${startId + batchCount - 1} generated successfully (${sections.length} sections)`
        );
        break;
      } catch (err: any) {
        const msg = err.message || String(err);
        console.error(`[script] Batch ${startId} attempt ${attempt} failed: ${msg}`);
        const delay = msg.includes("429") ? 15000 : 3500 * attempt;
        if (attempt < 3) await sleep(delay);
        else throw new Error(`Failed to generate sections ${startId}-${startId + batchCount - 1}: ${msg}`);
      }
    }

    if (batchStart + BATCH_SIZE < count) await sleep(1200);
  }

  // Re-number everything so ids are always 1..N with no gaps or duplicates
  allSections.forEach((sec, i) => {
    sec.id = i + 1;
  });

  if (allSections.length < 4) {
    throw new Error(`Only generated ${allSections.length} sections, minimum 4 required`);
  }

  // 3. Generate Researched Sources & Bibliography
  let sources: string[] = [];
  try {
    const sourcesPrompt = `List 5 to 7 real, authoritative historical or scientific sources, archives, government reports, or academic records relevant to: "${title}".
Output a JSON object with a "sources" array of strings:
{ "sources": ["Source 1 with author/agency and title", "Source 2 with author/agency and title"] }
Do not use double quote characters inside the strings. Output ONLY valid JSON.`;

    const rawSources = await callGroq(
      [
        { role: "system", content: "Output ONLY a valid JSON object with a 'sources' array of strings." },
        { role: "user", content: sourcesPrompt },
      ],
      2048
    );

    const clean = repairJson(rawSources);
    const parsedSources = JSON.parse(clean);
    sources = Array.isArray(parsedSources) ? parsedSources : parsedSources?.sources ?? [];
  } catch (err) {
    console.warn("[script] Source bibliography generation optional fallback:", err);
  }

  if (!Array.isArray(sources) || sources.length === 0) {
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
    sources: sources.map(String),
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : ["documentary", "history"],
    sections: allSections,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
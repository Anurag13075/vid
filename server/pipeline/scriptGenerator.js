
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"; // api url endpoint to grok for ai calls


let cachedGroqModels | null = null;  // defining an array for supported models
let lastGroqRequestAt = 0; // checking last grok request initializing from 0 

 
  //type of research pack     

type ResearchPack = {               
  context;    // context of research
  sources;  // sources as a string
};


async function fetchResearch(title) {    //wikemedia featch for research 
  const empty = { context: "No external research was available. Avoid inventing precise facts.", sources: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&srlimit=5&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl, { signal: controller.signal });
    if (!searchResponse.ok) return empty;
    const searchData = (await searchResponse.json());
    const titles = (searchData.query?.search || []).map((item: any) => String(item.title || "")).filter(Boolean); // searching the items and finding and them mapping over them to get the final array 
    if (titles.length === 0) return empty;

    const detailUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&exintro=1&explaintext=1&inprop=url&redirects=1&titles=${encodeURIComponent(titles.join("|"))}&format=json&origin=*`;
    const detailResponse = await fetch(detailUrl, { signal: controller.signal });
    if (!detailResponse.ok) return empty;
    const detailData = (await detailResponse.json());
    const pages = Object.values(detailData.query?.pages || {})[];
    const useful = pages
      .map((page) => ({
        title: String(page.title || ""),
        extract: String(page.extract || "").replace(/\s+/g, " ").trim(),
        url: String(page.fullurl || ""),
      }))
      .filter((page) => page.title && page.extract);

    if (useful.length === 0) return empty;
    const context = useful
      .map((page) => `SOURCE: ${page.title}\n${page.extract.slice(0, 1800)}`)
      .join("\n\n")
      .slice(0, 7000);
    const sources = useful.map((page) => `${page.title} — ${page.url}`).filter((source) => !source.endsWith("— "));
    return { context, sources };
  } catch (err: any) {
    console.warn(`[research] Public research lookup skipped: ${err.message}`);
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForGroqSlot() {
  const minimumGapMs = 1_250;
  const waitMs = Math.max(0, minimumGapMs - (Date.now() - lastGroqRequestAt));
  if (waitMs > 0) await sleep(waitMs);
  lastGroqRequestAt = Date.now();
}

export async function resolveGroqModels(apiKey) {
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
      const data = (await res.json());
      const availableIds = new Set((data.data || []).map((m: any) => m.id));
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

function targetSections(length): {
  count;
  label;
  wordsPerSection;
  totalWords;
} {
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

/**
 * Walks the text character by character and fixes problems INSIDE string values:
 *  - unescaped double quotes in the middle of a string (e.g. He said "stop" and left)
 *  - raw newlines / tabs inside a string (invalid in JSON)
 * A quote is treated as the real end of a string only if the next non-space
 * character is one of , } ] : (or a new "key" on the next line, i.e. a missing comma).
 */
function fixStringContents(s) {
  let out = "";
  let inStr = false;

  for (let i = 0; i [\s\S]*?/gi, "").trim();

  // Strip markdown fences
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Keep only the outermost JSON object or array
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let first = -1;
  let closer = "}";
  if (firstObj !== -1 && (firstArr === -1 || firstObj  first) s = s.slice(first, last + 1);

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
  messages: { role; content }[],
  maxTokens = 8192,
  jsonMode = true
) {
  const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY environment variable is not set");

  const models = await resolveGroqModels(apiKey);
  let lastError: Error | null = null;

  for (const model of models) {
    // Try JSON mode first; if the model rejects it (400), retry the same model without it
    const modes = jsonMode ? [true, false] : [false];

    for (const useJsonMode of modes) {
      await waitForGroqSlot();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 85_000);

      try {
        const body: Record = {
          model,
          // Keep individual responses safely below free-plan output limits.
          max_tokens: Math.min(maxTokens, 4096),
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
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get("retry-after") || 15);
            lastError = new Error(`Groq rate limit reached; retry after ${retryAfter}s`);
            await sleep(Math.min(Math.max(retryAfter, 5), 60) * 1000);
            throw lastError;
          }
          throw new Error(`Groq API error ${response.status}: ${errText}`);
        }

        const responseText = await response.text();
        const data = JSON.parse(responseText);
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
  title,
  startId,
  count,
  wordsPerSection,
  isFirst,
  isLast,
  researchContext
) {
  const firstType = isFirst ? "intro" : "broll";

  const prompt = `You are an elite, award-winning documentary director and investigative screenwriter (in the style of MagnatesMedia, Vox, LEMMiNO, and Frontline).
Write sections ${startId} to ${startId + count - 1} of a cinema-grade, binge-worthy documentary script about: "${title}".
Treat the viewer like an intelligent adult watching a high-stakes thriller. Build genuine suspense, uncover the hidden mechanisms, and expose the human cost.

RESEARCH PACK — treat this as the factual ground truth. Use only facts supported here; if a detail is not present, explain it without inventing precision:
${researchContext}

Output a JSON object with a single "sections" array containing exactly ${count} section objects:
{
  "sections": [
    {
      "id": ${startId},
      "narration": "Spoken documentary narration...",
      "visual_keywords": ["direct subject action", "macro technical detail", "establishing environment", "archival or document cue", "human-scale consequence"],
      "section_type": "${firstType}",
      "key_point": "Key statistic, date, or fact highlight",
      "chapter_title": ${isFirst ? '"CHAPTER 01 · THE ANOMALY"' : (startId % 4 === 1 ? '"ACT II · THE ESCALATION"' : 'null')},
      "location_stamp": ${isFirst ? '"📍 [LOCATION] · [YEAR/DATE]"' : 'null'},
      "estimated_words": ${wordsPerSection},
      "sfx": false
    }
  ]
}

DOCUMENTARY NARRATIVE RULES:
- LOCATION BADGES: In 'location_stamp', if this section references a specific historical location, city, bunker, or date/year from the research pack, format a concise HUD badge like '📍 NORMANDY · JUNE 1944' or '📍 CAPE CANAVERAL · 1969'. If no specific location/date applies to this section, set location_stamp to null. NEVER invent locations not in the research.
- CHAPTER TITLES: In 'chapter_title', provide a high-impact, topic-relevant act or chapter title for transition sections (like 'ACT I · THE INITIAL BREACH' or 'CHAPTER 02 · ESCALATION'), or null for standard middle scenes.
${isFirst ? `- Section ${startId} (COLD OPEN HOOK): Begin directly in media res with high stakes, a gripping sensory scene, or an unanswered paradox. NEVER say "In this video", "Welcome back", or "Today we look at". Hook the viewer immediately.` : ""}
${isLast ? `- Section ${startId + count - 1} (CONCLUSION): Provide a powerful philosophical resolution, lasting historical consequences, and an open reflection that leaves an impact. Set its section_type to "outro".` : ""}
- All middle sections: Use "broll" or "stat" (use "stat" whenever specific numbers, dates, megatons, population figures, or historical milestones are mentioned).
- DOCUMENTARY STORYTELLING (MAGNATESMEDIA / VOX): Write with high narrative tension, visceral sensory scenes, human conflict, and mysterious pacing. NEVER sound like a textbook, corporate explainer, or Wikipedia.
  * BANNED PHRASES: NEVER use academic filler like "In this video", "Moreover", "Furthermore", "In conclusion", "As we can see", "Let's explore", or "It is crucial to note".
  * SENSORY PACING: Open scenes with physical environments and actions (e.g. "Behind the soundproof doors of Room 402...", "At 3:14 AM, the radar went dead..."). End scenes with unanswered questions that build suspense.
- ACCURACY: Include real historical dates, official operations, names of key figures, geographical coordinates or locations, and verified facts. Do not invent facts.
- RETENTION & PACING: Create tension, open loops between sections ("What the public wasn't told was far worse..."), and satisfying payoffs.
- LENGTH: Each narration MUST be approximately ${wordsPerSection} to ${wordsPerSection + 15} words. Count carefully.
- JSON SAFETY: NEVER use double quote characters inside narration, key_point, or visual_keywords. For quoted speech or titles, use single quotes. Do not put line breaks inside string values.
- VISUAL KEYWORDS: Provide 3 to 5 CONCISE, 1-3 word stock footage search terms per section (e.g. 'cleanroom', 'silicon wafer', 'circuit board', 'battleship'). STRICT RULE: Maximum 3 words per keyword. Use ONLY concrete physical nouns, macro details, and specific environments (e.g. 'cleanroom', 'circuit board', 'microscope lens', 'vault door', 'submarine sonar', 'radar display'). NEVER use abstract concepts like 'technology', 'success', 'concept', 'disruption', or 'future'.
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

  const sections = rawSections
    .map((sec: any, i) => ({
      id: startId + i, // force sequential ids, the model sometimes gets them wrong
      narration: String(sec?.narration || "").trim(),
      visual_keywords:
        Array.isArray(sec?.visual_keywords) && sec.visual_keywords.length > 0
          ? Array.from(new Set(sec.visual_keywords.slice(0, 5).map((k: any) => String(k).trim()).filter(Boolean)))
          : [title.toLowerCase().slice(0, 40)],
      section_type: ["intro", "broll", "stat", "graphic", "outro"].includes(sec?.section_type)
        ? sec.section_type
        : "broll",
      key_point: sec?.key_point ? String(sec.key_point).slice(0, 75).trim() : null,
      chapter_title: sec?.chapter_title ? String(sec.chapter_title).slice(0, 60).trim() : null,
      location_stamp: sec?.location_stamp ? String(sec.location_stamp).slice(0, 50).trim() : null,
      estimated_words: Number(sec?.estimated_words) || wordsPerSection,
      sfx: Boolean(sec?.sfx),
    }))
    .filter((sec) => sec.narration.length > 0);

  if (sections.length === 0) {
    throw new Error("Model returned no usable sections");
  }

  return sections;
}

export async function generateScript(title, length) {
  const { count, wordsPerSection } = targetSections(length);
  const research = await fetchResearch(title);

  // 1. Generate Metadata
  const metaPrompt = `For a high-end YouTube documentary about "${title}", produce metadata as a JSON object with these keys:
{
  "title": "Gripping, high-CTR YouTube documentary title (50-70 chars)",
  "description": "Engaging 180-250 character SEO description highlighting the core mystery and historical stakes",
  "mood": "dramatic",
  "thumbnail_hook": "4-6 powerful words for thumbnail",
  "title_variants": ["Alternative title 1", "Alternative title 2", "Alternative title 3"],
  "tags": ["topic", "documentary", "history", "deep dive"]
}
The "mood" value must be exactly one of: dramatic, tense, neutral, uplifting.
Do not use double quote characters inside any string value. Output ONLY valid JSON.`;

  let meta: any = {};
  for (let attempt = 1; attempt = count;

    for (let attempt = 1; attempt  {
    sec.id = i + 1;
  });

  if (allSections.length  value.trim()).filter(Boolean).slice(0, 3)
      : [],
    sources: sources.map(String),
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : ["documentary", "history"],
    sections: allSections,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

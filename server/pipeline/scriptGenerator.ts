import Anthropic from "@anthropic-ai/sdk";
import type { Script } from "./types.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function targetSections(length: string): { min: number; max: number; label: string } {
  switch (length) {
    case "short":  return { min: 16, max: 20, label: "5-8 minutes" };
    case "long":   return { min: 36, max: 44, label: "15-20 minutes" };
    default:       return { min: 24, max: 30, label: "10-12 minutes" };
  }
}

const SYSTEM_PROMPT = `You are a professional YouTube documentary scriptwriter for top-performing faceless channels.
Your scripts are narrative and cinematic — like a Netflix documentary, not a listicle.
Strong hook in the first 30 seconds, a clear 3-act story arc, punchy CTA outro.
Write the script so every section can support fast-paced visual changes every 2-3 seconds, motion graphics for stats, and lower-thirds for key points.
Every section should read like an actual video scene with rich detail and a strong visual beat.
RETURN ONLY VALID JSON. No markdown, no code fences, no explanation. Raw JSON object only.`;

export async function generateScript(title: string, length: string): Promise<Script> {
  const { min, max, label } = targetSections(length);
  const target = Math.floor((min + max) / 2);

  const prompt = `Write a complete documentary-style script for a YouTube video titled: "${title}"

Target: ${target} sections (${label} video)

Return this exact JSON structure with no additional text:
{
  "title": "string",
  "description": "string (150-200 chars, YouTube-optimized SEO description)",
  "mood": "dramatic | uplifting | neutral | tense",
  "thumbnail_hook": "string (punchy 4-7 word phrase for thumbnail text)",
  "sections": [
    {
      "id": 1,
      "narration": "string (spoken narration — 5-9 sentences, 100-180 words. Write rich, detailed, storytelling prose. For section_type graphic, use empty string \\"\\". No bullet points.)",
      "visual_keywords": ["specific visual 1", "specific visual 2", "specific visual 3"],
      "section_type": "intro | broll | stat | graphic | outro",
      "key_point": "string or null",
      "estimated_words": 120,
      "sfx": false
    }
  ]
}

CRITICAL RULES:
1. visual_keywords MUST describe the specific visual for that narration line — cinematically and precisely, NOT the general topic.
   WRONG: ["tesla", "stocks", "money"]
   RIGHT: ["red stock market chart falling sharply", "worried traders staring at screens on exchange floor", "close-up stock ticker numbers dropping"]
2. section_type = "stat" for ANY narration containing a specific number, percentage, dollar figure, date, or measurable claim
3. section_type = "intro" ONLY for the opening hook (1st section) — make it gripping, start in the middle of the action
4. section_type = "outro" ONLY for the final CTA (last section)
5. section_type = "graphic" for 1-2 pure visual transition moments at major act breaks — narration MUST be empty string "" for these
6. key_point: short lower-third callout text (max 8 words) only for truly striking facts or stats — otherwise null
7. sfx: true only when a sound effect enhances the moment (stat reveal, dramatic twist)
8. Write EXACTLY ${target} sections total — no more, no less
9. narration MUST be 100-180 words for non-graphic sections. Count your words.
10. Use the audio narration to suggest a matching visual cut every 2-3 seconds and include at least one specific motion-graphic section for data or stats.`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const raw =
        message.content[0].type === "text" ? message.content[0].text : "{}";

      // Strip markdown fences if the model wrapped the JSON
      let cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      // Heuristics to recover from common model output issues
      // 1) Extract the first {...} block if the model prepended/extraneous text
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }

      // 2) Replace smart quotes with straight quotes
      cleaned = cleaned.replace(/[\u2018\u2019\u201C\u201D]/g, '"');

      // 3) Convert single-quoted strings to double quotes (common model quirk)
      cleaned = cleaned.replace(/:\s*'([^']*)'/g, ': "$1"');
      cleaned = cleaned.replace(/'([^']*)'\s*:/g, '"$1":');

      // 4) Remove trailing commas before } or ]
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

      let parsed: Script;
      try {
        parsed = JSON.parse(cleaned) as Script;
      } catch (jsonErr) {
        console.error("Failed to parse JSON script. Raw model output:\n", raw);
        console.error("Cleaned candidate JSON:\n", cleaned);
        throw jsonErr;
      }

      if (!parsed.sections || !Array.isArray(parsed.sections)) {
        throw new Error("Script missing sections array");
      }
      if (parsed.sections.length < 8) {
        throw new Error(`Script has too few sections: ${parsed.sections.length}`);
      }

      // Normalise and guard each section
      parsed.sections = parsed.sections.map((s, i) => {
        const isGraphic = s.section_type === "graphic";
        return {
          ...s,
          id: i + 1,
          // Graphic sections must have empty narration so voiceover skips them
          narration: isGraphic ? "" : (s.narration || ""),
          visual_keywords: Array.isArray(s.visual_keywords)
            ? s.visual_keywords
            : [String(s.visual_keywords || "")],
          key_point: s.key_point || null,
          sfx: Boolean(s.sfx),
          estimated_words: s.estimated_words || 120,
        };
      });

      return parsed;
    } catch (err) {
      lastError = err as Error;
      console.error(`Script generation attempt ${attempt} failed:`, err);
      if (attempt < 3) await sleep(5000 * attempt);
    }
  }

  throw lastError || new Error("Script generation failed after 3 attempts");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
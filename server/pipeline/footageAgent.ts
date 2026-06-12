import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, Clip } from "./types.js";
import { withDeadline } from "./timeout.js";

const PEXELS_KEY  = process.env.PEXELS_API_KEY  || "";
const PIXABAY_KEY = process.env.PIXABAY_API_KEY  || "";

export function createClipTracker(): Set<string> {
  return new Set<string>();
}

interface PexelsVideo {
  id: number;
  duration: number;
  image: string;
  video_files: Array<{
    quality: string;
    file_type: string;
    width: number;
    height: number;
    link: string;
  }>;
}

interface PixabayVideo {
  id: number;
  duration: number;
  picture_id: string;
  videos: {
    large?:  { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    small?:  { url: string; width: number; height: number };
  };
}

// ── Query cleanup ─────────────────────────────────────────────────────────────
function simplifyQuery(keyword: string): string {
  const first = keyword.split(/[·→\|\n]|\s{2,}/)[0].trim();
  return first
    .replace(/^motion graphic[:]\s*/i, "")
    .replace(/^cgi recreation[:]\s*/i, "")
    .replace(/^artistic rendering[:]\s*/i, "")
    .replace(/^dramatic recreation[:]\s*/i, "")
    .replace(/^animation[:]\s*/i, "")
    .replace(/^infographic[:]\s*/i, "")
    .replace(/^animated\s+/i, "")
    .replace(/^text ['"].*?['"]/i, "")
    .replace(/^number \d+[\s\w]*/i, "")
    .replace(/appearing with impact/i, "")
    // strip leading commas or partial phrases like ",000 appears"
    .replace(/^[,\d,\s]+appears.*$/i, "")
    .replace(/^[,\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function buildSearchQueries(keyword: string): string[] {
  const simplified = simplifyQuery(keyword);
  if (!simplified || simplified.length < 3) {
    return ["cinematic documentary footage", "historical documentary", "cinematic background"];
  }
  return [simplified, `${simplified} cinematic`, `${simplified} footage`];
}

// ── Source searches ───────────────────────────────────────────────────────────
async function searchPexels(query: string, usedIds: Set<string>): Promise<Clip | null> {
  if (!PEXELS_KEY) return null;
  try {
    const url =
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
      `&per_page=15&orientation=landscape&size=large`;
    const res = await fetch(url, {
      headers: { Authorization: PEXELS_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`Pexels non-OK (${res.status}) for: ${query}`);
      return null;
    }
    const data = (await res.json()) as { videos: PexelsVideo[] };
    for (const v of data.videos || []) {
      const clipId = `pexels_${v.id}`;
      if (usedIds.has(clipId)) continue;
      if (v.duration < 5) continue;

      // Prefer 1080p, avoid 4K (too large for Railway free tier)
      const hd = v.video_files
        .filter((f) => f.file_type === "video/mp4" && f.width >= 1280 && f.width <= 1920)
        .sort((a, b) => b.width - a.width)[0];

      // Fallback: any mp4 >= 1280 (smallest viable)
      const fallback = v.video_files
        .filter((f) => f.file_type === "video/mp4" && f.width >= 1280)
        .sort((a, b) => a.width - b.width)[0];

      const best = hd || fallback;
      if (!best?.link) continue;

      return {
        id: v.id,
        keyword: query,
        thumbUrl: v.image,
        videoUrl: best.link,
        source: "pexels",
        externalId: clipId,
        duration: v.duration,
        status: "pending",
      };
    }
  } catch (err) {
    console.error("Pexels error:", err);
  }
  return null;
}

async function searchPixabay(query: string, usedIds: Set<string>): Promise<Clip | null> {
  if (!PIXABAY_KEY) return null;
  try {
    const url =
      `https://pixabay.com/api/videos/?key=${PIXABAY_KEY}` +
      `&q=${encodeURIComponent(query)}&video_type=film&per_page=15`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`Pixabay non-OK (${res.status}) for: ${query}`);
      return null;
    }
    const data = (await res.json()) as { hits: PixabayVideo[] };
    for (const v of data.hits || []) {
      const clipId = `pixabay_${v.id}`;
      if (usedIds.has(clipId)) continue;
      if (v.duration < 5) continue;
      // prefer medium over large to avoid huge files
      const vid = v.videos.medium || v.videos.large || v.videos.small;
      if (!vid?.url) continue;
      const thumb = `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg`;
      return {
        id: v.id,
        keyword: query,
        thumbUrl: thumb,
        videoUrl: vid.url,
        source: "pixabay",
        externalId: clipId,
        duration: v.duration,
        status: "pending",
      };
    }
  } catch (err) {
    console.error("Pixabay error:", err);
  }
  return null;
}

// ── Core clip finder ──────────────────────────────────────────────────────────
async function findOneClip(keyword: string, usedIds: Set<string>): Promise<Clip | null> {
  const queries = buildSearchQueries(keyword);
  for (const query of queries) {
    const clip = await withDeadline(
      searchPexels(query, usedIds).then((c) => c || searchPixabay(query, usedIds)),
      6000,
      null,
      `findOneClip: ${query}`
    );
    // Validate before accepting — reject clips with missing/invalid URLs
    if (clip && clip.videoUrl?.startsWith("http") && clip.externalId) {
      usedIds.add(clip.externalId);
      return { ...clip, localPath: undefined };
    }
  }
  return null;
}

// ── Public: find multiple clips for a section ────────────────────────────────
export async function findMultipleFootage(
  section: ScriptSection,
  count: number,
  _videoId: string,
  usedIds: Set<string>
): Promise<Clip[]> {
  const searchPromise = async (): Promise<Clip[]> => {
    const results: Clip[] = [];

    const keywords =
      section.visual_keywords?.length > 0
        ? section.visual_keywords
        : deriveKeywordsFromNarration(section.narration);

    for (const kw of keywords) {
      if (results.length >= count) break;
      const clip = await findOneClip(kw, usedIds);
      if (clip) results.push(clip);
    }

    // Fallbacks if we didn't get enough
    const fallbacks = [
      "cinematic documentary footage",
      "dramatic background footage",
      "nature cinematic aerial",
      "urban cityscape motion",
      "close-up detail cinematic",
    ];

    for (const q of fallbacks) {
      if (results.length >= count) break;
      const clip = await withDeadline(
        searchPexels(q, usedIds).then((c) => c || searchPixabay(q, usedIds)),
        6000,
        null,
        `fallback: ${q}`
      );
      if (clip && clip.videoUrl?.startsWith("http") && clip.externalId) {
        usedIds.add(clip.externalId);
        results.push({ ...clip, localPath: undefined });
      }
    }

    return results;
  };

  // Hard 25s cap per section — return whatever was found
  return withDeadline(
    searchPromise(),
    25_000,
    [],
    `findMultipleFootage section ${section.id}`
  );
}

function deriveKeywordsFromNarration(narration: string): string[] {
  const phrases = narration
    .replace(/[\r\n]/g, " ")
    .split(/\s*[,.\-–:]\s*/)
    .filter((p) => p.length >= 15 && p.length <= 60);
  return phrases.slice(0, 3).map((p) => p.trim());
}

// ── Downloader ────────────────────────────────────────────────────────────────
export async function downloadClip(
  clip: Clip,
  videoId: string,
  clipKey: string | number
): Promise<string | null> {
  // Hard guard — never attempt a download with an invalid URL
  if (!clip.videoUrl || !clip.videoUrl.startsWith("http")) {
    console.warn(`downloadClip [${clipKey}]: invalid videoUrl "${clip.videoUrl}" — skipping`);
    return null;
  }

  const dir = path.join("/tmp/vidrush", videoId, "footage");
  await fs.mkdir(dir, { recursive: true });
  const localPath = path.join(dir, `clip_${clipKey}.mp4`);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    console.warn(`downloadClip [${clipKey}]: aborted after 20s`);
  }, 20_000);

  try {
    const res = await fetch(clip.videoUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`downloadClip [${clipKey}]: HTTP ${res.status}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
    return localPath;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`downloadClip [${clipKey}]: fetch failed —`, (err as Error).message);
    return null;
  }
}

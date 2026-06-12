import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, Clip } from "./types.js";

const PEXELS_KEY = process.env.PEXELS_API_KEY || "";
const PIXABAY_KEY = process.env.PIXABAY_API_KEY || "";

const usedClipIds = new Set<string>();

export function resetUsedClips() {
  usedClipIds.clear();
}

interface PexelsVideo {
  id: number;
  duration: number;
  image: string;
  video_files: Array<{ quality: string; file_type: string; width: number; height: number; link: string }>;
}

interface PixabayVideo {
  id: number;
  duration: number;
  picture_id: string;
  videos: {
    large?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    small?: { url: string; width: number; height: number };
  };
}

async function searchPexels(query: string): Promise<Clip | null> {
  if (!PEXELS_KEY) return null;
  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`;
    const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (!res.ok) return null;

    const data = await res.json() as { videos: PexelsVideo[] };
    for (const v of data.videos || []) {
      const clipId = `pexels_${v.id}`;
      if (usedClipIds.has(clipId)) continue;
      if (v.duration < 5) continue;

      const best = v.video_files
        .filter((f) => f.file_type === "video/mp4" && f.width >= 1280)
        .sort((a, b) => b.width - a.width)[0];
      if (!best) continue;

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
    console.error("Pexels search error:", err);
  }
  return null;
}

async function searchPixabay(query: string): Promise<Clip | null> {
  if (!PIXABAY_KEY) return null;
  try {
    const url = `https://pixabay.com/api/videos/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&video_type=film&per_page=15`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json() as { hits: PixabayVideo[] };
    for (const v of data.hits || []) {
      const clipId = `pixabay_${v.id}`;
      if (usedClipIds.has(clipId)) continue;
      if (v.duration < 5) continue;

      const vid = v.videos.large || v.videos.medium || v.videos.small;
      if (!vid) continue;

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
    console.error("Pixabay search error:", err);
  }
  return null;
}

function simplifyQuery(keyword: string): string {
  return keyword
    .replace(/^motion graphic[:]\s*/i, "")
    .replace(/^cgi recreation[:]\s*/i, "")
    .replace(/^artistic rendering[:]\s*/i, "")
    .replace(/^dramatic recreation[:]\s*/i, "")
    .replace(/^animation[:]\s*/i, "")
    .replace(/^infographic[:]\s*/i, "")
    .replace(/^text ['"].*?['"]/i, "")
    .replace(/^number \d+[\s\w]*/i, "")
    .replace(/appearing with impact/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function buildSearchQueries(keyword: string): string[] {
  const simplified = simplifyQuery(keyword);
  const base = simplified || "cinematic documentary";
  return [
    base,
    `${base} cinematic`,
    `${base} footage`,
  ];
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  return Promise.race([promise, timeout]);
}

async function findOneClip(keyword: string): Promise<Clip | null> {
  const queries = buildSearchQueries(keyword);
  for (const query of queries) {
    const clip = await withTimeout(
      searchPexels(query).then((c) => c || searchPixabay(query)),
      8000
    );
    if (clip) {
      usedClipIds.add(clip.externalId);
      return { ...clip, localPath: undefined };
    }
  }
  return null;
}

export async function findFootage(section: ScriptSection, _videoId: string): Promise<Clip | null> {
  const keywords = section.visual_keywords.length > 0
    ? section.visual_keywords
    : deriveKeywordsFromNarration(section.narration);

  for (const kw of keywords) {
    const clip = await findOneClip(kw);
    if (clip) return clip;
  }

  const fallbacks = ["cinematic documentary background", "dramatic cinematic footage", "dynamic motion background"];
  for (const q of fallbacks) {
    const clip = await withTimeout(
      searchPexels(q).then((c) => c || searchPixabay(q)),
      8000
    );
    if (clip) {
      usedClipIds.add(clip.externalId);
      return clip;
    }
  }

  return null;
}

export async function findMultipleFootage(
  section: ScriptSection,
  count: number,
  _videoId: string
): Promise<Clip[]> {
  const results: Clip[] = [];

  const keywords = section.visual_keywords.length > 0
    ? section.visual_keywords
    : deriveKeywordsFromNarration(section.narration);

  for (const kw of keywords) {
    if (results.length >= count) break;
    const clip = await findOneClip(kw);
    if (clip) results.push(clip);
  }

  const fallbacks = [
    "cinematic documentary footage",
    "dramatic background footage",
    "nature cinematic aerial",
    "urban cityscape motion",
    "close-up detail cinematic",
  ];

  for (const q of fallbacks) {
    if (results.length >= count) break;
    const clip = await withTimeout(
      searchPexels(q).then((c) => c || searchPixabay(q)),
      8000
    );
    if (clip) {
      usedClipIds.add(clip.externalId);
      results.push({ ...clip, localPath: undefined });
    }
  }

  return results;
}

function deriveKeywordsFromNarration(narration: string): string[] {
  const phrases = narration
    .replace(/[\r\n]/g, " ")
    .split(/\s*[,\.\-–:]\s*/)
    .filter((p) => p.length >= 15 && p.length <= 60);
  return phrases.slice(0, 3).map((p) => p.trim());
}

export async function downloadClip(
  clip: Clip,
  videoId: string,
  clipKey: string | number
): Promise<string> {
  const dir = path.join("/tmp/vidrush", videoId, "footage");
  await fs.mkdir(dir, { recursive: true });

  const localPath = path.join(dir, `clip_${clipKey}.mp4`);

  if (clip.videoUrl.startsWith("http")) {
    const res = await fetch(clip.videoUrl);
    if (!res.ok) throw new Error(`Failed to download clip: ${res.status}`);
    const buffer = await res.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
  }

  return localPath;
}
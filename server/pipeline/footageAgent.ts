import { promises as fs } from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";
import { createWriteStream } from "fs";
import type { ScriptSection, Clip } from "./types.js";
import { getTempDir } from "./tempDir.js";

const CLIPS_PER_SECTION = 6;

export function createClipTracker(): Set<string> {
  return new Set<string>();
}

function pickBestPexelsFile(videoFiles: any[]): string {
  const valid = (videoFiles || []).filter((f: any) => f?.link && f?.width);
  if (valid.length === 0) return "";
  // Prioritize 1080p full HD, then 720p
  valid.sort((a: any, b: any) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920));
  return valid[0].link;
}

function pickBestPixabayUrl(hit: any): string {
  return (
    hit?.videos?.large?.url ||
    hit?.videos?.medium?.url ||
    hit?.videos?.small?.url ||
    hit?.videos?.tiny?.url ||
    ""
  );
}

const STOP_WORDS = new Set([
  "from", "with", "that", "this", "your", "have", "will", "into", "they",
  "them", "then", "than", "when", "what", "which", "how", "for", "and",
  "the", "get", "rid", "but", "not", "can", "its", "are", "was", "has",
  "top", "best", "ways", "tips", "easy", "simple", "ultimate", "guide",
  "about", "some", "more", "very", "just", "been", "also", "over", "such",
]);

const BANNED_TERMS = [
  "cinematic", "background", "footage", "dramatic", "visual",
  "scene", "abstract", "generic", "video", "clip", "broll", "b-roll",
];

function sanitizeKeyword(kw: string): string {
  const lower = kw.toLowerCase().trim();
  if (lower.length < 3) return "";
  if (BANNED_TERMS.some((b) => lower === b)) return "";
  return lower;
}

function buildTopicFallbacks(title: string, section: ScriptSection): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const coreWords = words.slice(0, 3).join(" ");
  const fallbacks: string[] = [];

  if (coreWords) {
    fallbacks.push(coreWords);
    fallbacks.push(`${coreWords} historical`);
    fallbacks.push(`${coreWords} aerial`);
  }

  if (section.key_point) {
    const kpWords = section.key_point
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .slice(0, 3)
      .join(" ");
    if (kpWords.length > 3) fallbacks.push(kpWords);
  }

  return fallbacks.filter(Boolean);
}

async function searchPexels(
  keyword: string,
  needed: number,
  usedIds: Set<string>
): Promise<Clip[]> {
  const clips: Clip[] = [];
  const apiKey = (process.env.PEXELS_API_KEY || "").trim();
  if (!apiKey) return clips;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=30&orientation=landscape&min_duration=3&max_duration=25`,
      {
        headers: { Authorization: apiKey },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[pexels] "${keyword}": HTTP ${response.status}`);
      return clips;
    }

    const data = (await response.json()) as any;
    const videos = (data.videos || [])
      .filter((v: any) => !usedIds.has(`pexels_${v.id}`))
      .sort((a: any, b: any) => {
        const da = Math.abs((a.duration || 10) - 8);
        const db = Math.abs((b.duration || 10) - 8);
        return da - db;
      });

    for (const video of videos) {
      if (clips.length >= needed) break;
      const idStr = `pexels_${video.id}`;
      if (usedIds.has(idStr)) continue;

      const videoUrl = pickBestPexelsFile(video.video_files);
      if (!videoUrl) continue;

      usedIds.add(idStr);
      clips.push({
        id: video.id,
        keyword,
        thumbUrl: video.image || "",
        videoUrl,
        source: "pexels",
        externalId: idStr,
        duration: video.duration || 8,
        license: "Pexels License (Free to use)",
        sourceUrl: video.url || `https://www.pexels.com/video/${video.id}/`,
        status: "pending",
      });
    }
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      console.warn(`[pexels] search error for "${keyword}":`, err.message);
    }
  }

  return clips;
}

async function searchPixabay(
  keyword: string,
  needed: number,
  usedIds: Set<string>
): Promise<Clip[]> {
  const clips: Clip[] = [];
  const apiKey = (process.env.PIXABAY_API_KEY || "").trim();
  if (!apiKey) return clips;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const response = await fetch(
      `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(keyword)}&per_page=30&video_type=all&orientation=horizontal&min_duration=3&max_duration=25`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[pixabay] "${keyword}": HTTP ${response.status}`);
      return clips;
    }

    const data = (await response.json()) as any;
    for (const hit of data.hits || []) {
      if (clips.length >= needed) break;
      const idStr = `pixabay_${hit.id}`;
      if (usedIds.has(idStr)) continue;

      const videoUrl = pickBestPixabayUrl(hit);
      if (!videoUrl) continue;

      usedIds.add(idStr);
      clips.push({
        id: hit.id,
        keyword,
        thumbUrl: hit.videos?.medium?.thumbnail || hit.picture_id || "",
        videoUrl,
        source: "pixabay",
        externalId: idStr,
        duration: hit.duration || 8,
        license: "Pixabay Content License (Free for commercial use)",
        sourceUrl: hit.pageURL || `https://pixabay.com/videos/id-${hit.id}/`,
        status: "pending",
      });
    }
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      console.warn(`[pixabay] search error for "${keyword}":`, err.message);
    }
  }

  return clips;
}

export async function findMultipleFootage(
  section: ScriptSection,
  limit: number,
  videoId: string,
  usedIds: Set<string>,
  title: string
): Promise<Clip[]> {
  const clips: Clip[] = [];
  const clipsNeeded = limit || CLIPS_PER_SECTION;

  const cleanKeywords = section.visual_keywords
    .map(sanitizeKeyword)
    .filter(Boolean);

  const keywordsToTry = cleanKeywords.length > 0
    ? cleanKeywords
    : [section.key_point?.toLowerCase().slice(0, 40) || title.toLowerCase().slice(0, 40)];

  // Phase 1: Pexels API
  for (const keyword of keywordsToTry) {
    if (clips.length >= clipsNeeded) break;
    const found = await searchPexels(keyword, clipsNeeded - clips.length, usedIds);
    clips.push(...found);
  }

  // Phase 2: Pixabay API
  if (clips.length < clipsNeeded) {
    for (const keyword of keywordsToTry) {
      if (clips.length >= clipsNeeded) break;
      const found = await searchPixabay(keyword, clipsNeeded - clips.length, usedIds);
      clips.push(...found);
    }
  }

  // Phase 3: Broad topic-derived fallback searches
  if (clips.length < clipsNeeded) {
    const topicFallbacks = buildTopicFallbacks(title, section);
    for (const keyword of topicFallbacks) {
      if (clips.length >= clipsNeeded) break;
      const pexelsFound = await searchPexels(keyword, clipsNeeded - clips.length, usedIds);
      clips.push(...pexelsFound);
      if (clips.length < clipsNeeded) {
        const pixabayFound = await searchPixabay(keyword, clipsNeeded - clips.length, usedIds);
        clips.push(...pixabayFound);
      }
    }
  }

  console.log(`[footage] Section ${section.id} ("${keywordsToTry[0]}"): ${clips.length}/${clipsNeeded} clips found`);
  return clips;
}

function downloadUrlToFile(url: string, destPath: string, timeoutMs = 35000): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileStream = createWriteStream(destPath);
    const client = url.startsWith("https") ? https : http;

    const request = client.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          fileStream.close();
          return downloadUrlToFile(res.headers.location, destPath, timeoutMs).then(resolve).catch(reject);
        }

        if (res.statusCode && res.statusCode >= 400) {
          fileStream.close();
          return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
        }

        res.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close(() => resolve());
        });
      }
    );

    request.on("error", (err) => {
      fileStream.close();
      fs.unlink(destPath).catch(() => {});
      reject(err);
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy();
      fileStream.close();
      fs.unlink(destPath).catch(() => {});
      reject(new Error(`Download timed out after ${timeoutMs / 1000}s`));
    });
  });
}

export async function downloadClip(
  clip: Clip,
  videoId: string,
  suffix: string
): Promise<string> {
  const tmpDir = getTempDir(videoId);
  await fs.mkdir(tmpDir, { recursive: true });

  const outPath = path.join(tmpDir, `${suffix}.mp4`);
  if (!clip.videoUrl) throw new Error("Clip has no videoUrl");

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await downloadUrlToFile(clip.videoUrl, outPath, 35000);
      const stat = await fs.stat(outPath).catch(() => null);
      if (stat && stat.size > 2000) {
        return outPath;
      }
      throw new Error(`Downloaded file too small (${stat?.size ?? 0} bytes)`);
    } catch (err: any) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  return outPath;
}

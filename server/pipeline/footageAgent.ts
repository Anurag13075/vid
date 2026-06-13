import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, Clip } from "./types.js";

// ─── How many unique clips to fetch per section ──────────────────────────────
// A 9-minute video with 16 sections × 3 cuts each = ~48 cuts total.
// At 4 clips per section × 16 sections = 64 clips downloaded — 16 spare.
// Pexels returns up to 80 results per search, Pixabay up to 200, so we
// will never exhaust the pool even with strict uniqueness enforcement.
const CLIPS_PER_SECTION = 4;

// ─── createClipTracker ───────────────────────────────────────────────────────
// Call this ONCE per video render and pass the same Set to every
// findMultipleFootage call. This is what guarantees global uniqueness —
// once a clip ID enters the Set it will never be downloaded again for
// this video, so no clip can appear twice on screen.
export function createClipTracker(): Set<string> {
  return new Set<string>();
}

// ─── Pick the best HD video file from Pexels ────────────────────────────────
function pickBestPexelsFile(videoFiles: any[]): string {
  const valid = (videoFiles || []).filter((f: any) => f?.link && f?.width);
  if (valid.length === 0) return "";
  // Prefer closest to 1280 wide (720p target)
  valid.sort((a: any, b: any) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280));
  return valid[0].link;
}

// ─── Pick the best video file from Pixabay ──────────────────────────────────
// Pixabay returns a single videoUrl per result (no multi-resolution array),
// so we just use it directly.
function pickBestPixabayUrl(hit: any): string {
  // Prefer medium (640px) → small → tiny in that order for bandwidth
  return (
    hit?.videos?.medium?.url ||
    hit?.videos?.small?.url  ||
    hit?.videos?.tiny?.url   ||
    ""
  );
}

// ─── Generic fallback keywords when specific ones return nothing ─────────────
const FALLBACK_KEYWORDS = [
  "cinematic landscape",
  "aerial city view",
  "documentary footage",
  "dramatic sky timelapse",
  "nature wildlife closeup",
  "ocean waves sunset",
  "mountain forest path",
  "urban architecture abstract",
];

// ─── Search Pexels for footage clips ────────────────────────────────────────
async function searchPexels(
  keyword: string,
  needed: number,
  usedIds: Set<string>
): Promise<Clip[]> {
  const clips: Clip[] = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=20&orientation=landscape&min_duration=4&max_duration=15`,
      {
        headers: { Authorization: process.env.PEXELS_API_KEY || "" },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`Pexels "${keyword}": ${response.status}`);
      return clips;
    }

    const data = (await response.json()) as any;

    const videos = (data.videos || [])
      // Global uniqueness check — skip any ID already used in this video
      .filter((v: any) => !usedIds.has(`pexels_${v.id}`))
      .sort((a: any, b: any) => {
        const da = Math.abs((a.duration || 30) - 15);
        const db = Math.abs((b.duration || 30) - 15);
        return da - db;
      });

    for (const video of videos) {
      if (clips.length >= needed) break;
      const idStr = `pexels_${video.id}`;
      if (usedIds.has(idStr)) continue;

      const videoUrl = pickBestPexelsFile(video.video_files);
      if (!videoUrl) continue;

      // Mark as used immediately so parallel calls don't double-pick
      usedIds.add(idStr);
      clips.push({
        id: video.id,
        keyword,
        thumbUrl: video.image || "",
        videoUrl,
        source: "pexels",
        externalId: idStr,
        duration: video.duration || 15,
        status: "pending",
      });
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn(`Pexels timed out: "${keyword}"`);
    } else {
      console.error(`Pexels search error for "${keyword}":`, err);
    }
  }

  return clips;
}

// ─── Search Pixabay for footage clips ───────────────────────────────────────
async function searchPixabay(
  keyword: string,
  needed: number,
  usedIds: Set<string>
): Promise<Clip[]> {
  const clips: Clip[] = [];
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return clips;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const response = await fetch(
      `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(keyword)}&per_page=20&video_type=film&orientation=horizontal&min_duration=4&max_duration=15`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`Pixabay "${keyword}": ${response.status}`);
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
        thumbUrl: hit.videos?.medium?.thumbnail || "",
        videoUrl,
        source: "pixabay",
        externalId: idStr,
        duration: hit.duration || 15,
        status: "pending",
      });
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn(`Pixabay timed out: "${keyword}"`);
    } else {
      console.error(`Pixabay search error for "${keyword}":`, err);
    }
  }

  return clips;
}

// ─── findMultipleFootage ─────────────────────────────────────────────────────
// Fetches CLIPS_PER_SECTION unique clips for a section.
//
// Strategy:
//   1. Try each of the section's visual_keywords on Pexels first
//   2. If still not enough, try the same keywords on Pixabay
//   3. If still not enough, fall through to generic FALLBACK_KEYWORDS
//      on both Pexels and Pixabay
//
// The usedIds Set is shared across ALL sections for the entire video render,
// so a clip downloaded for section 3 can never appear again in section 7.
// This is what eliminates the looping / repeating clip problem.
export async function findMultipleFootage(
  section: ScriptSection,
  limit: number,
  videoId: string,
  usedIds: Set<string>
): Promise<Clip[]> {
  const clips: Clip[] = [];
  const clipsNeeded = limit || CLIPS_PER_SECTION;

  // Phase 1: section-specific keywords → Pexels
  for (const keyword of section.visual_keywords) {
    if (clips.length >= clipsNeeded) break;
    const needed = clipsNeeded - clips.length;
    const found = await searchPexels(keyword, needed, usedIds);
    clips.push(...found);
  }

  // Phase 2: section-specific keywords → Pixabay (if Pexels wasn't enough)
  if (clips.length < clipsNeeded) {
    for (const keyword of section.visual_keywords) {
      if (clips.length >= clipsNeeded) break;
      const needed = clipsNeeded - clips.length;
      const found = await searchPixabay(keyword, needed, usedIds);
      clips.push(...found);
    }
  }

  // Phase 3: generic fallback keywords → Pexels then Pixabay
  if (clips.length < clipsNeeded) {
    for (const keyword of FALLBACK_KEYWORDS) {
      if (clips.length >= clipsNeeded) break;
      const needed = clipsNeeded - clips.length;

      const pexelsFound = await searchPexels(keyword, needed, usedIds);
      clips.push(...pexelsFound);

      if (clips.length < clipsNeeded) {
        const pixabayFound = await searchPixabay(keyword, clipsNeeded - clips.length, usedIds);
        clips.push(...pixabayFound);
      }
    }
  }

  console.log(
    `[footage] Section "${section.visual_keywords[0]}": ${clips.length}/${clipsNeeded} clips found`
  );

  return clips;
}

// ─── downloadClip ────────────────────────────────────────────────────────────
// Downloads a single clip to disk and returns the local file path.
// We request SD/360p clips that are 4-15s long.
// At SD 640px width, a 15s clip is ~500KB–2MB — fast even on slow connections.
// The assembler's renderCut upscales to 1920×1080, so source resolution is fine.
export async function downloadClip(
  clip: Clip,
  videoId: string,
  suffix: string
): Promise<string> {
  const tmpDir = path.join("/tmp/vidrush", videoId);
  await fs.mkdir(tmpDir, { recursive: true });

  const outPath = path.join(tmpDir, `${suffix}.mp4`);
  if (!clip.videoUrl) throw new Error("Clip has no videoUrl");

  const controller = new AbortController();
  // 25s timeout — enough for a 2MB SD clip at even 0.5 Mbps
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(clip.videoUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 1000) {
      throw new Error(`Downloaded file too small (${buffer.byteLength} B)`);
    }
    await fs.writeFile(outPath, Buffer.from(buffer));
    return outPath;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new Error(`Download timed out after 25s: ${clip.videoUrl}`);
    }
    throw err;
  }
}

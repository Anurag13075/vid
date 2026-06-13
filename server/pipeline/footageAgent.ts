import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, Clip } from "./types.js";

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

// ─── Pick the smallest-filesize acceptable video file from Pexels ────────────
// We target 360p–480p (width 640) because:
//   - The assembler upscales everything to 1280×720 anyway
//   - A 10s SD clip is ~200KB–1MB vs 10–40MB for HD
//   - Even at 1 Mbps, 1 MB downloads in 8 seconds — well within our 20s cap
function pickBestPexelsFile(videoFiles: any[]): string {
  const valid = (videoFiles || []).filter((f: any) => f?.link && f?.width);
  if (valid.length === 0) return "";
  // Prefer width closest to 640 (360p/480p SD) — small file, fast download
  valid.sort((a: any, b: any) => Math.abs(a.width - 640) - Math.abs(b.width - 640));
  return valid[0].link;
}

// ─── Search Pexels for footage clips ────────────────────────────────────────
export async function findMultipleFootage(
  section: ScriptSection,
  limit: number,
  videoId: string,
  usedIds: Set<string>
): Promise<Clip[]> {
  const clips: Clip[] = [];

  // Section keywords first, then generic fallbacks
  const keywords = [...section.visual_keywords, ...FALLBACK_KEYWORDS];

  for (const keyword of keywords) {
    if (clips.length >= limit) break;
    const needed = limit - clips.length;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);

      // max_duration=10 + SD quality (640px) → clips are ~200KB–1MB each.
      // At 1 Mbps that's 1–8 seconds download — safely inside the 20s fetch cap.
      const response = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=15&orientation=landscape&min_duration=4&max_duration=10`,
        {
          headers: { Authorization: process.env.PEXELS_API_KEY || "" },
          signal: controller.signal,
        }
      );
      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`Pexels "${keyword}": ${response.status}`);
        continue;
      }

      const data = (await response.json()) as any;

      // Prefer clips 8-25s — small files that download in a few seconds.
      // Sort by how close to 15s the clip is so we get appropriately-sized clips.
      const videos = (data.videos || [])
        .filter((v: any) => !usedIds.has(String(v.id)))
        .sort((a: any, b: any) => {
          const da = Math.abs((a.duration || 30) - 15);
          const db = Math.abs((b.duration || 30) - 15);
          return da - db;
        });

      for (const video of videos) {
        if (clips.length >= limit) break;
        const idStr = String(video.id);
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
          duration: video.duration || 15,
          status: "pending",
        });
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.warn(`Pexels timed out: "${keyword}"`);
      } else {
        console.error(`Footage search error for "${keyword}":`, err);
      }
    }
  }

  return clips;
}

// ─── Download a clip with fetch + arrayBuffer ────────────────────────────────
// We request SD/360p clips that are only 4-10s long (max_duration=10 in search).
// At SD 640px width, a 10s clip is ~200KB–1MB — fast even on 1 Mbps connections.
// The assembler's buildCut upscales to 1280×720, so source resolution doesn't matter.
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
  // 20s is enough for a 1MB SD clip at even 0.5 Mbps; abort if exceeded
  const timer = setTimeout(() => controller.abort(), 20_000);

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
      throw new Error(`Download timed out after 20s: ${clip.videoUrl}`);
    }
    throw err;
  }
}

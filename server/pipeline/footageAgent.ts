import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, Clip } from "./types.js";

export function createClipTracker(): Set<string> {
  return new Set<string>();
}

// ─── Pick the best HD video file from Pexels ────────────────────────────────
// Pexels returns video_files sorted highest quality first (often 4K).
// We want 720p or 1080p — close to 1280 width.
function pickBestPexelsFile(videoFiles: any[]): string {
  const valid = (videoFiles || []).filter((f: any) => f?.link && f?.width);
  if (valid.length === 0) return "";
  // Sort by closeness to 1280 wide (720p target)
  valid.sort((a: any, b: any) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280));
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

  // Try each visual keyword until we have enough clips
  for (const keyword of section.visual_keywords) {
    if (clips.length >= limit) break;
    const needed = limit - clips.length;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=${needed * 3}&orientation=landscape`,
        {
          headers: { Authorization: process.env.PEXELS_API_KEY || "" },
          signal: controller.signal,
        }
      );
      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`Pexels search failed for "${keyword}": ${response.status}`);
        continue;
      }

      const data = (await response.json()) as any;

      for (const video of data.videos || []) {
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
          duration: video.duration || 10,
          status: "pending",
        });
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        console.warn(`Pexels search timed out for "${keyword}"`);
      } else {
        console.error(`Footage search failed for "${keyword}":`, err);
      }
    }
  }

  return clips;
}

// ─── Download a clip to local disk ──────────────────────────────────────────
export async function downloadClip(
  clip: Clip,
  videoId: string,
  suffix: string
): Promise<string> {
  const tmpDir = path.join("/tmp/vidrush", videoId);
  await fs.mkdir(tmpDir, { recursive: true });

  const outPath = path.join(tmpDir, `${suffix}.mp4`);
  const url = clip.videoUrl;
  if (!url) throw new Error("Clip has no videoUrl");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000); // 60s max per clip

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    // Use arrayBuffer() — works in both Bun and Node without stream compat issues
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 1000) {
      throw new Error(`Downloaded file is too small (${buffer.byteLength} bytes) — likely an error response`);
    }
    await fs.writeFile(outPath, Buffer.from(buffer));
    return outPath;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new Error(`Download timed out after 60s for: ${url}`);
    }
    throw err;
  }
}

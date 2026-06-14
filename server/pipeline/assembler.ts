import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, RenderStep } from "./types.js";
import { ffmpeg, ffprobe, FFMPEG_PATH } from "./ffmpeg.js";

type ProgressFn = (step: number, total: number, label: string) => void | Promise<void>;

// ─── Constants ───────────────────────────────────────────────────────────────
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
// Intermediates rendered at 720p — cuts RAM ~55% during Ken Burns + xfade.
// finalMixWithCaptions upscales back to 1080p at CRF 23 in one pass.
const INTERMEDIATE_WIDTH = 1280;
const INTERMEDIATE_HEIGHT = 720;
const FPS = 30;
const TRANSITION_DURATION = 0.25;
const BGM_VOLUME = 0.12;
const BGM_FADE_IN = 1.0;
const BGM_FADE_OUT = 2.0;

// Railway 1 GB RAM / shared vCPU constraints:
// - THREADS 1: shared vCPU — more threads = context-switching overhead
// - CRF 26 for intermediates: ~20% smaller, quality irrelevant (re-encoded at CRF 23 in final)
// - PRESET "ultrafast": ~60% less RAM on libx264 motion-estimation buffers
// - XFADE_BATCH 2: 2 clips × ~4MB/frame (720p) ≈ 60–80 MB → safe within 1 GB ceiling
const THREADS = 1;
const CRF = 26;
const PRESET = "ultrafast";
const XFADE_BATCH = 2;

const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

// Target duration for each individual visual cut (in seconds)
const CUT_TARGET_SEC = 3.5;
const CUT_MIN_SEC = 2.5;
const CUT_MAX_SEC = 5.0;

// Ken Burns motion types — varied per cut for cinematic energy
type MotionType = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down";
const MOTION_CYCLE: MotionType[] = [
  "zoom-in",
  "pan-right",
  "zoom-out",
  "pan-left",
  "zoom-in",
  "pan-up",
  "zoom-out",
  "pan-down",
];

// ─── Resolve font path ───────────────────────────────────────────────────────
async function resolveFont(): Promise<string> {
  for (const f of [FONT, FONT_FALLBACK]) {
    try { await fs.access(f); return f; } catch {}
  }
  return "";
}

// ─── Build Ken Burns filter string — scale+crop approach (no zoompan) ────────
// Uses INTERMEDIATE dimensions (1280x720) for all intermediate renders.
// ~10x faster than zoompan and uses ~55% less RAM than 1080p equivalents.
function buildKenBurnsFilter(motion: MotionType, durationSec: number): string {
  const totalFrames = Math.ceil(durationSec * FPS);
  const w = INTERMEDIATE_WIDTH;
  const h = INTERMEDIATE_HEIGHT;

  const SCALE = 1.10;
  const sw = Math.round(w * SCALE); // 1408
  const sh = Math.round(h * SCALE); // 792

  const dx = sw - w; // 128px horizontal travel
  const dy = sh - h; // 72px vertical travel

  const prog = `min(n,${totalFrames - 1})/${totalFrames - 1}`;

  switch (motion) {
    case "zoom-in": {
      const cropW = `${sw}-${dx}*${prog}`;
      const cropH = `${sh}-${dy}*${prog}`;
      const cropX = `(${sw}-(${cropW}))/2`;
      const cropY = `(${sh}-(${cropH}))/2`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop='${cropW}':'${cropH}':'${cropX}':'${cropY}',scale=${w}:${h}`;
    }
    case "zoom-out": {
      const cropW = `${w}+${dx}*${prog}`;
      const cropH = `${h}+${dy}*${prog}`;
      const cropX = `(${sw}-(${cropW}))/2`;
      const cropY = `(${sh}-(${cropH}))/2`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop='${cropW}':'${cropH}':'${cropX}':'${cropY}',scale=${w}:${h}`;
    }
    case "pan-right": {
      const cropX = `${dx}*${prog}`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:'${cropX}':${Math.floor(dy / 2)}`;
    }
    case "pan-left": {
      const cropX = `${dx}*(1-${prog})`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:'${cropX}':${Math.floor(dy / 2)}`;
    }
    case "pan-up": {
      const cropY = `${dy}*${prog}`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:${Math.floor(dx / 2)}:'${cropY}'`;
    }
    case "pan-down": {
      const cropY = `${dy}*(1-${prog})`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:${Math.floor(dx / 2)}:'${cropY}'`;
    }
  }
}

// ─── Pre-render a single cut with Ken Burns + color grade ────────────────────
async function renderCut(
  clipPath: string,
  durationSec: number,
  motionType: MotionType,
  outPath: string
): Promise<void> {
  const clipDuration = await ffprobe(clipPath);
  const needsLoop = clipDuration < durationSec;

  const kenBurnsFilter = buildKenBurnsFilter(motionType, durationSec);
  const gradeFilter = `eq=contrast=1.10:brightness=0.015:saturation=1.20`;
  const fullFilter = `${kenBurnsFilter},${gradeFilter},format=yuv420p`;

  console.log(`[assembler] cut (${motionType}) ${path.basename(clipPath)} → ${path.basename(outPath)} (${durationSec.toFixed(2)}s)`);

  const baseArgs = needsLoop
    ? ["-stream_loop", "-1", "-i", clipPath]
    : ["-i", clipPath];

  await ffmpeg([
    ...baseArgs,
    "-vf", fullFilter,
    "-t", String(durationSec),
    "-r", String(FPS),
    "-threads", String(THREADS), "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-an",
    "-y", outPath,
  ]);
}

// ─── Split a section into fast cuts ──────────────────────────────────────────
function sliceCuts(audioDuration: number): number[] {
  if (audioDuration <= CUT_MAX_SEC) return [audioDuration];

  const cuts: number[] = [];
  let remaining = audioDuration;

  while (remaining > 0) {
    if (remaining <= CUT_MAX_SEC) {
      cuts.push(Math.max(remaining, 1.0));
      break;
    }
    const wouldLeave = remaining - CUT_TARGET_SEC;
    if (wouldLeave > 0 && wouldLeave < CUT_MIN_SEC) {
      const half = remaining / 2;
      cuts.push(half, half);
      break;
    }
    cuts.push(CUT_TARGET_SEC);
    remaining -= CUT_TARGET_SEC;
  }

  return cuts;
}

// ─── Generate SRT file from sections + audio durations ───────────────────────
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

async function generateSrt(
  sections: ScriptSection[],
  audioPaths: (string | null)[],
  srtPath: string
): Promise<void> {
  let srtContent = "";
  let index = 1;
  let timeOffset = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const audioPath = audioPaths[i];
    if (!audioPath || !section.narration.trim()) continue;

    const duration = await ffprobe(audioPath);
    if (duration <= 0) continue;

    const words = section.narration.trim().split(/\s+/);
    const chunkSize = 8;
    const chunks: string[] = [];
    for (let w = 0; w < words.length; w += chunkSize) {
      chunks.push(words.slice(w, w + chunkSize).join(" "));
    }

    const chunkDuration = duration / chunks.length;

    for (let c = 0; c < chunks.length; c++) {
      const start = timeOffset + c * chunkDuration;
      const end = start + chunkDuration - 0.05;
      srtContent += `${index}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${chunks[c]}\n\n`;
      index++;
    }

    timeOffset += duration;
  }

  await fs.writeFile(srtPath, srtContent, "utf8");
}

// ─── Concat demuxer: join clips with zero memory overhead ────────────────────
// Stream copy — no re-encode, constant ~200 MB RAM regardless of clip count.
// -fflags +genpts fixes wrong duration metadata in concat output header.
async function concatClips(clipPaths: string[], outputPath: string): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No cuts to concat");
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }

  const listPath = outputPath + ".concat.txt";
  const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  await fs.writeFile(listPath, listContent, "utf8");

  console.log(`[assembler] concat demuxer: ${clipPaths.length} clips → ${path.basename(outputPath)}`);

  await ffmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    "-fflags", "+genpts",
    "-y", outputPath,
  ]);

  await fs.unlink(listPath).catch(() => {});
}

// ─── xfade a small batch (≤ XFADE_BATCH clips) for section-boundary transitions
async function xfadeSmallBatch(
  clipPaths: string[],
  clipDurations: number[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }

  if (clipPaths.length > XFADE_BATCH) {
    return concatClips(clipPaths, outputPath);
  }

  const inputs: string[] = [];
  clipPaths.forEach((p) => inputs.push("-i", p));

  let filterGraph = "";
  let prevLabel = "[0:v]";
  let timeOffset = 0;

  for (let i = 1; i < clipPaths.length; i++) {
    const outLabel = i === clipPaths.length - 1 ? "[vout]" : `[v${i}]`;
    timeOffset += Math.max(clipDurations[i - 1] - TRANSITION_DURATION, 0.01);
    filterGraph += `${prevLabel}[${i}:v]xfade=transition=fade:duration=${TRANSITION_DURATION}:offset=${timeOffset.toFixed(4)}${outLabel};`;
    prevLabel = outLabel;
  }
  filterGraph = filterGraph.slice(0, -1);

  await ffmpeg([
    ...inputs,
    "-filter_complex", filterGraph,
    "-map", "[vout]",
    "-threads", String(THREADS), "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-r", String(FPS),
    "-an",
    "-y", outputPath,
  ]);
}

// ─── Chain xfade transitions across all section videos ───────────────────────
// Phase 1: concat hard cuts within each section (stream copy, zero RAM)
// Phase 2: xfade between section videos in XFADE_BATCH=2 passes
// Multi-pass binary reduction keeps peak RSS flat at ~80 MB per pass (720p).
async function chainXfadeTransitions(
  clipPaths: string[],
  clipDurations: number[],
  outputPath: string,
  sectionBoundaries: number[]
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No cuts to chain");
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }

  const tmpDir = path.dirname(outputPath);

  // Phase 1: concat within each section
  const boundaries = [0, ...sectionBoundaries, clipPaths.length];
  const sectionVideos: string[] = [];
  const sectionDurations: number[] = [];

  for (let s = 0; s < boundaries.length - 1; s++) {
    const start = boundaries[s];
    const end = boundaries[s + 1];
    const sClips = clipPaths.slice(start, end);
    const sDurs = clipDurations.slice(start, end);

    if (sClips.length === 0) continue;

    const sectionOut = path.join(tmpDir, `section_joined_${s}.mp4`);
    await concatClips(sClips, sectionOut);
    sectionVideos.push(sectionOut);
    sectionDurations.push(sDurs.reduce((a, b) => a + b, 0));
  }

  if (sectionVideos.length === 1) {
    await fs.copyFile(sectionVideos[0], outputPath);
    return;
  }

  // Phase 2: xfade between section videos — binary reduction passes
  let currentVideos = sectionVideos;
  let currentDurations = sectionDurations;
  let pass = 0;

  while (currentVideos.length > 1) {
    const nextVideos: string[] = [];
    const nextDurations: number[] = [];

    for (let b = 0; b < currentVideos.length; b += XFADE_BATCH) {
      const bClips = currentVideos.slice(b, b + XFADE_BATCH);
      const bDurs = currentDurations.slice(b, b + XFADE_BATCH);
      const bOut = path.join(tmpDir, `xfade_pass${pass}_b${b}.mp4`);

      await xfadeSmallBatch(bClips, bDurs, bOut);

      const bDur = bDurs.reduce((a, d) => a + d, 0) - (bClips.length - 1) * TRANSITION_DURATION;
      nextVideos.push(bOut);
      nextDurations.push(bDur);
    }

    currentVideos = nextVideos;
    currentDurations = nextDurations;
    pass++;
  }

  await fs.copyFile(currentVideos[0], outputPath);
}

// ─── Merge voiceover audio tracks ────────────────────────────────────────────
async function mergeAudio(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 0) {
    await ffmpeg([
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-t", "5", "-c:a", "aac", "-b:a", "128k", "-y", outputPath,
    ]);
    return;
  }
  if (audioPaths.length === 1) { await fs.copyFile(audioPaths[0], outputPath); return; }

  const inputs: string[] = [];
  audioPaths.forEach((p) => inputs.push("-i", p));
  const filterComplex =
    audioPaths.map((_, i) => `[${i}:a]`).join("") +
    `concat=n=${audioPaths.length}:v=0:a=1[a]`;

  await ffmpeg([
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[a]",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    "-y", outputPath,
  ]);
}

// ─── Burn captions + mix BGM + upscale 720p → 1080p ─────────────────────────
// This is the only step that targets final output quality (CRF 23).
// Upscale from INTERMEDIATE (720p) to OUTPUT (1080p) happens here in one pass —
// no separate upscale step needed, lanczos gives sharp results.
async function finalMixWithCaptions(
  videoPath: string,
  voiceoverPath: string,
  bgmPath: string | null,
  srtPath: string | null,
  outputPath: string
): Promise<void> {
  const font = await resolveFont();

  // Always upscale intermediates (720p) → final output (1080p)
  const upscaleFilter = `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:flags=lanczos`;
  let videoFilter = upscaleFilter;

  if (srtPath) {
    try {
      await fs.access(srtPath);
      const srtContent = await fs.readFile(srtPath, "utf8");
      if (srtContent.trim().length > 0) {
        const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
        const captionFilter = font
          ? `subtitles='${escapedSrt}':force_style='FontName=DejaVu Sans Bold,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,Outline=2,Shadow=1,Alignment=2,MarginV=50'`
          : `subtitles='${escapedSrt}'`;
        // upscale first, then burn captions at full 1080p resolution
        videoFilter = `${upscaleFilter},${captionFilter}`;
      }
    } catch {
      console.warn("[assembler] SRT not found, skipping captions");
    }
  }

  // Always re-encode — upscaling means copy is never valid here
  const videoFilterArgs = ["-vf", videoFilter];
  const videoCodecArgs = [
    "-threads", String(THREADS),
    "-c:v", "libx264",
    "-crf", "23",
    "-preset", "veryfast",
  ];

  if (bgmPath) {
    const voDuration = await ffprobe(voiceoverPath);
    const fadeOutStart = Math.max(voDuration - BGM_FADE_OUT, 0);

    await ffmpeg([
      "-i", videoPath,
      "-i", voiceoverPath,
      "-stream_loop", "-1", "-i", bgmPath,
      "-filter_complex", [
        `[2:a]volume=${BGM_VOLUME},afade=t=in:st=0:d=${BGM_FADE_IN},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${BGM_FADE_OUT}[bgm]`,
        `[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[audio]`,
      ].join(";"),
      "-map", "0:v",
      "-map", "[audio]",
      ...videoFilterArgs,
      ...videoCodecArgs,
      "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
      "-shortest",
      "-movflags", "+faststart",
      "-y", outputPath,
    ]);
  } else {
    await ffmpeg([
      "-i", videoPath,
      "-i", voiceoverPath,
      "-map", "0:v",
      "-map", "1:a",
      ...videoFilterArgs,
      ...videoCodecArgs,
      "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
      "-shortest",
      "-movflags", "+faststart",
      "-y", outputPath,
    ]);
  }
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────
// Pull from final 1080p output — no upscale needed here
async function extractThumbnail(videoPath: string, thumbPath: string): Promise<void> {
  await ffmpeg([
    "-ss", "4", "-i", videoPath,
    "-vframes", "1",
    "-vf", `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
    "-y", thumbPath,
  ]);
}

// ─── Black clip fallback ──────────────────────────────────────────────────────
// Uses INTERMEDIATE dimensions — consistent with all other intermediate renders
async function makeBlackClip(outPath: string, durationSec: number): Promise<void> {
  await ffmpeg([
    "-f", "lavfi", "-i", `color=c=black:size=${INTERMEDIATE_WIDTH}x${INTERMEDIATE_HEIGHT}:rate=${FPS}`,
    "-t", String(durationSec),
    "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
    "-an", "-y", outPath,
  ]);
}

// ─── Unique clip picker (round-robin / max-spacing) ───────────────────────────
// Scores every candidate by how long ago it was last used.
// Guarantees clips are spaced as far apart as possible across the whole video.
function makeUniqueClipPicker(globalClipPool: string[]) {
  const lastUsedAt = new Map<string, number>();
  let callCount = 0;

  return function getUniqueClip(sectionPool: string[]): string | null {
    if (globalClipPool.length === 0) return null;
    callCount++;

    const candidates = sectionPool.length > 0 ? sectionPool : globalClipPool;

    let bestPath = candidates[0];
    let bestAge = -Infinity;

    for (const p of candidates) {
      const age = callCount - (lastUsedAt.get(p) ?? -Infinity);
      if (age > bestAge) {
        bestAge = age;
        bestPath = p;
      }
    }

    // Widen to global pool if section pool is fully exhausted
    if (bestAge <= 1 && sectionPool.length > 0 && globalClipPool.length > sectionPool.length) {
      for (const p of globalClipPool) {
        const age = callCount - (lastUsedAt.get(p) ?? -Infinity);
        if (age > bestAge) {
          bestAge = age;
          bestPath = p;
        }
      }
    }

    lastUsedAt.set(bestPath, callCount);
    return bestPath;
  };
}

// ─── Step manifest ────────────────────────────────────────────────────────────
export const RENDER_STEPS: RenderStep[] = [
  { label: "Slicing sections into fast cuts",           done: false },
  { label: "Pre-rendering cuts with Ken Burns motion",  done: false },
  { label: "Merging voiceover audio tracks",            done: false },
  { label: "Generating SRT captions",                   done: false },
  { label: "Chaining cuts with xfade transitions",      done: false },
  { label: "Mixing audio + burning captions",           done: false },
  { label: "Generating thumbnail",                      done: false },
];

// ─── Main assembly entry point ────────────────────────────────────────────────
export async function assemble(
  videoId: string,
  videoTitle: string,
  sections: ScriptSection[],
  audioPaths: (string | null)[],
  footagePathsPerSection: (string[] | null)[],
  bgmPath: string | null,
  outputDir: string,
  onProgress: ProgressFn
): Promise<{ videoPath: string; thumbPath: string }> {
  const tmpDir = path.join("/tmp/vidrush", videoId);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const total = RENDER_STEPS.length;

  // ── Build global clip pool ───────────────────────────────────────────────
  const globalClipPool: string[] = [];
  for (const paths of footagePathsPerSection) {
    if (paths) {
      for (const p of paths) {
        if (!globalClipPool.includes(p)) globalClipPool.push(p);
      }
    }
  }

  console.log(`[assembler] global clip pool: ${globalClipPool.length} unique clips`);

  // Returns a section's own clips, or borrows from the global pool at a
  // staggered offset so adjacent sections that fall back look different.
  const getClipsForSection = (i: number): string[] => {
    const own = footagePathsPerSection[i];
    if (own && own.length > 0) return own;
    if (globalClipPool.length === 0) return [];
    const offset = (i * 3) % globalClipPool.length;
    const N = Math.min(4, globalClipPool.length);
    const borrowed: string[] = [];
    for (let k = 0; k < N; k++) {
      borrowed.push(globalClipPool[(offset + k) % globalClipPool.length]);
    }
    console.log(`[assembler] Section ${i}: no footage, borrowing ${borrowed.length} clips from pool`);
    return borrowed;
  };

  // Shared unique clip picker — max-spacing across the entire video
  const getUniqueClip = makeUniqueClipPicker(globalClipPool);

  // ── Step 1: Plan cuts ────────────────────────────────────────────────────
  await onProgress(0, total, RENDER_STEPS[0].label);

  type CutInfo = { clipPath: string; durationSec: number };
  const cutPlan: CutInfo[][] = [];
  const validAudioForSection: (string | null)[] = [];

  for (let i = 0; i < sections.length; i++) {
    const audioPath = audioPaths[i];

    if (!audioPath) {
      cutPlan.push([]);
      validAudioForSection.push(null);
      continue;
    }

    const audioDuration = await ffprobe(audioPath);
    if (audioDuration <= 0) {
      cutPlan.push([]);
      validAudioForSection.push(null);
      continue;
    }

    validAudioForSection.push(audioPath);

    const cutDurations = sliceCuts(audioDuration);
    const availableClips = getClipsForSection(i);
    const sectionCuts: CutInfo[] = [];

    for (let ci = 0; ci < cutDurations.length; ci++) {
      const clipPath = getUniqueClip(availableClips);
      sectionCuts.push({ clipPath: clipPath ?? "", durationSec: cutDurations[ci] });
    }

    cutPlan.push(sectionCuts);
  }

  const totalCuts = cutPlan.reduce((sum, c) => sum + c.length, 0);
  console.log(`[assembler] ${sections.length} sections → ${totalCuts} cuts planned`);

  // ── Step 2: Pre-render each cut with Ken Burns ───────────────────────────
  await onProgress(1, total, RENDER_STEPS[1].label);

  const renderedCuts: string[] = [];
  const renderedDurations: number[] = [];
  const audioForRenderedCuts: string[] = [];
  const sectionBoundaries: number[] = [];

  let globalMotionIdx = 0;

  for (let i = 0; i < sections.length; i++) {
    const cuts = cutPlan[i];
    if (cuts.length === 0) continue;

    const audioPath = validAudioForSection[i];
    if (!audioPath) continue;

    if (renderedCuts.length > 0) sectionBoundaries.push(renderedCuts.length);

    for (let ci = 0; ci < cuts.length; ci++) {
      const { clipPath, durationSec } = cuts[ci];
      const motionType = MOTION_CYCLE[globalMotionIdx % MOTION_CYCLE.length];
      globalMotionIdx++;

      const outPath = path.join(tmpDir, `cut_${i}_${ci}.mp4`);

      if (!clipPath) {
        console.warn(`[assembler] Section ${i} cut ${ci}: no clip available, using black`);
        await makeBlackClip(outPath, durationSec);
        renderedCuts.push(outPath);
        renderedDurations.push(durationSec);
        continue;
      }

      try {
        await renderCut(clipPath, durationSec, motionType, outPath);
        renderedCuts.push(outPath);
        renderedDurations.push(durationSec);
      } catch (err) {
        console.error(`[assembler] Ken Burns failed for cut ${i}/${ci}:`, (err as Error).message);

        // Fallback 1: simple scale to intermediate resolution
        const fallbackPath = path.join(tmpDir, `scaled_${i}_${ci}.mp4`);
        try {
          const rawDur = await ffprobe(clipPath);
          const loopArgs = rawDur < durationSec ? ["-stream_loop", "-1"] : [];
          await ffmpeg([
            ...loopArgs, "-i", clipPath,
            "-vf", `scale=${INTERMEDIATE_WIDTH}:${INTERMEDIATE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${INTERMEDIATE_WIDTH}:${INTERMEDIATE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
            "-t", String(durationSec), "-r", String(FPS),
            "-threads", String(THREADS), "-c:v", "libx264", "-crf", "26", "-preset", "ultrafast",
            "-an", "-y", fallbackPath,
          ]);
          renderedCuts.push(fallbackPath);
          renderedDurations.push(durationSec);
        } catch {
          // Fallback 2: black clip
          const blackPath = path.join(tmpDir, `black_${i}_${ci}.mp4`);
          await makeBlackClip(blackPath, durationSec);
          renderedCuts.push(blackPath);
          renderedDurations.push(durationSec);
        }
      }
    }

    audioForRenderedCuts.push(audioPath);
  }

  if (renderedCuts.length === 0) {
    throw new Error("No cuts could be rendered — check that audio was generated.");
  }

  console.log(`[assembler] ${renderedCuts.length} cuts rendered, ${sectionBoundaries.length} section boundaries`);

  // ── Step 3: Merge voiceover audio ────────────────────────────────────────
  await onProgress(2, total, RENDER_STEPS[2].label);
  const mergedAudio = path.join(tmpDir, "voiceover_merged.aac");
  await mergeAudio(audioForRenderedCuts, mergedAudio);

  // ── Step 4: Generate SRT captions ────────────────────────────────────────
  await onProgress(3, total, RENDER_STEPS[3].label);
  const srtPath = path.join(tmpDir, "captions.srt");
  try {
    await generateSrt(sections, audioPaths, srtPath);
    console.log(`[assembler] SRT written to ${srtPath}`);
  } catch (err) {
    console.warn("[assembler] SRT generation failed, captions will be skipped:", err);
  }

  // ── Step 5: Chain all cuts with xfade transitions ────────────────────────
  await onProgress(4, total, RENDER_STEPS[4].label);
  const transitionedVideo = path.join(tmpDir, "transitioned.mp4");
  await chainXfadeTransitions(renderedCuts, renderedDurations, transitionedVideo, sectionBoundaries);

  // ── Step 6: Final mix — upscale + audio + BGM + captions ─────────────────
  await onProgress(5, total, RENDER_STEPS[5].label);
  const finalMp4 = path.join(outputDir, "final.mp4");

  let srtExists = false;
  try {
    const srtStat = await fs.stat(srtPath);
    srtExists = srtStat.size > 0;
  } catch {}

  await finalMixWithCaptions(
    transitionedVideo,
    mergedAudio,
    bgmPath,
    srtExists ? srtPath : null,
    finalMp4
  );

  // ── Step 7: Thumbnail ─────────────────────────────────────────────────────
  await onProgress(6, total, RENDER_STEPS[6].label);
  const thumbPath = path.join(outputDir, "thumb.jpg");
  await extractThumbnail(finalMp4, thumbPath);

  return { videoPath: finalMp4, thumbPath };
}

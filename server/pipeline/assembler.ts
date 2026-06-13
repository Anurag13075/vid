import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, RenderStep } from "./types.js";
import { ffmpeg, ffprobe, FFMPEG_PATH } from "./ffmpeg.js";

type ProgressFn = (step: number, total: number, label: string) => void | Promise<void>;

// ─── Constants ───────────────────────────────────────────────────────────────
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const FPS = 30;
const TRANSITION_DURATION = 0.25; // snappier cuts
const BGM_VOLUME = 0.12;
const BGM_FADE_IN = 1.0;
const BGM_FADE_OUT = 2.0;
const CRF = 23;
const PRESET = "veryfast";
const THREADS = 2;
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
//
// zoompan is notoriously slow/OOM-prone on constrained containers because it
// processes every frame in software at full resolution with floating-point zoom
// math. The replacement approach is equivalent visually but ~10x faster:
//
//   1. Scale the clip to OVERSIZE (e.g. 115% of output) — fast hardware path
//   2. Use crop= with the built-in 'n' (frame number) expression to animate
//      the crop window across the oversize canvas — cheap integer arithmetic
//   3. Apply color grade on the already-cropped 1920x1080 frame
//
// The crop window starts/ends at calculated pixel offsets derived from frame
// number, giving smooth linear pan/zoom without zoompan's overhead.
function buildKenBurnsFilter(motion: MotionType, durationSec: number): string {
  const totalFrames = Math.ceil(durationSec * FPS);
  const w = OUTPUT_WIDTH;   // 1920
  const h = OUTPUT_HEIGHT;  // 1080

  // Scale factor: 1.10 means 10% oversize on each axis = 2112x1188
  // This gives enough headroom for pan travel without black borders.
  const SCALE = 1.10;
  const sw = Math.round(w * SCALE); // 2112
  const sh = Math.round(h * SCALE); // 1188

  // Maximum pan travel in pixels (half the extra space on each axis)
  const dx = sw - w; // 192px horizontal travel budget
  const dy = sh - h; // 108px vertical travel budget

  // n = current frame number (FFmpeg built-in)
  // Progress expression: n/(totalFrames-1), clamped via min/max
  const prog = `min(n,${totalFrames - 1})/${totalFrames - 1}`;

  // For zoom-in/zoom-out we animate the crop SIZE (smaller crop = more zoom),
  // then scale back up to output. For pan motions we animate crop POSITION.
  switch (motion) {
    case "zoom-in": {
      // Crop starts at sw×sh (no zoom), ends at w×h (full zoom-in)
      // crop=w:h:x:y — w/h shrink from SCALE down to 1.0, x/y stay centered
      const cropW = `${sw}-${dx}*${prog}`;
      const cropH = `${sh}-${dy}*${prog}`;
      const cropX = `(${sw}-(${cropW}))/2`;
      const cropY = `(${sh}-(${cropH}))/2`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop='${cropW}':'${cropH}':'${cropX}':'${cropY}',scale=${w}:${h}`;
    }

    case "zoom-out": {
      // Crop starts at w×h (zoomed in), ends at sw×sh (zoomed out)
      const cropW = `${w}+${dx}*${prog}`;
      const cropH = `${h}+${dy}*${prog}`;
      const cropX = `(${sw}-(${cropW}))/2`;
      const cropY = `(${sh}-(${cropH}))/2`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop='${cropW}':'${cropH}':'${cropX}':'${cropY}',scale=${w}:${h}`;
    }

    case "pan-right": {
      // Crop window slides left→right across the oversize canvas
      const cropX = `${dx}*${prog}`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:'${cropX}':${Math.floor(dy / 2)}`;
    }

    case "pan-left": {
      // Crop window slides right→left
      const cropX = `${dx}*(1-${prog})`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:'${cropX}':${Math.floor(dy / 2)}`;
    }

    case "pan-up": {
      // Crop window slides top→bottom
      const cropY = `${dy}*${prog}`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:${Math.floor(dx / 2)}:'${cropY}'`;
    }

    case "pan-down": {
      // Crop window slides bottom→top
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
  // Color grade applied AFTER crop/scale so it runs on 1920x1080 not the oversize frame
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

// ─── Split a section into fast cuts ─────────────────────────────────────────
// Given total audio duration for a section, returns an array of cut durations
// that sum to audioDuration, each between CUT_MIN_SEC and CUT_MAX_SEC.
function sliceCuts(audioDuration: number): number[] {
  if (audioDuration <= CUT_MAX_SEC) {
    // Short section: single cut
    return [audioDuration];
  }

  const cuts: number[] = [];
  let remaining = audioDuration;

  while (remaining > 0) {
    if (remaining <= CUT_MAX_SEC) {
      // Last cut: whatever is left (min 1s to avoid degenerate tiny clips)
      cuts.push(Math.max(remaining, 1.0));
      break;
    }

    // Try to place a cut close to CUT_TARGET_SEC
    // But if only one more cut would remain and it'd be too short, stretch this one
    const wouldLeave = remaining - CUT_TARGET_SEC;
    if (wouldLeave > 0 && wouldLeave < CUT_MIN_SEC) {
      // Split remaining evenly into 2 cuts instead
      const half = remaining / 2;
      cuts.push(half, half);
      break;
    }

    cuts.push(CUT_TARGET_SEC);
    remaining -= CUT_TARGET_SEC;
  }

  return cuts;
}

// ─── Generate SRT file from sections + audio durations ──────────────────────
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

    // Split narration into ~8-word chunks for readable captions
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

// ─── Concat demuxer: join clips with zero memory overhead ───────────────────
// xfade filter_complex OOMs on Railway even with 12 clips at 1080p because FFmpeg
// must hold all decoded frames in memory simultaneously. The concat demuxer reads
// one clip at a time — constant ~200MB regardless of clip count.
// Tradeoff: hard cuts instead of crossfades between every cut. We keep crossfades
// only at section boundaries by pre-merging per-section clips with a tiny xfade
// batch (≤4 clips each), then concat the section videos.
async function concatClips(
  clipPaths: string[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No cuts to concat");
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }

  // Write a concat list file
  const listPath = outputPath + ".concat.txt";
  const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  await fs.writeFile(listPath, listContent, "utf8");

  console.log(`[assembler] concat demuxer: ${clipPaths.length} clips → ${path.basename(outputPath)}`);

  await ffmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",   // stream copy — no re-encode, near-instant
    "-y", outputPath,
  ]);

  // Clean up list file
  await fs.unlink(listPath).catch(() => {});
}

// ─── xfade a small batch (≤4 clips) for section-boundary transitions ─────────
async function xfadeSmallBatch(
  clipPaths: string[],
  clipDurations: number[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }

  // Safety: never try to xfade more than 4 at once
  if (clipPaths.length > 4) {
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

async function chainXfadeTransitions(
  clipPaths: string[],
  clipDurations: number[],
  outputPath: string,
  // sectionBoundaries: indices in clipPaths where a new section starts
  // used to place xfade transitions at section joins, hard cuts within sections
  sectionBoundaries: number[]
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No cuts to chain");
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }

  const tmpDir = path.dirname(outputPath);

  // Split clip list into sections using boundary indices
  // Each section gets its cuts concat'd (hard cuts within section = fast)
  // Then section videos get xfade'd together (smooth transitions at section joins)
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

  // Now xfade between section videos in batches of 4
  const XFADE_BATCH = 4;
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

// ─── Burn captions + mix BGM ──────────────────────────────────────────────────
async function finalMixWithCaptions(
  videoPath: string,
  voiceoverPath: string,
  bgmPath: string | null,
  srtPath: string | null,
  outputPath: string
): Promise<void> {
  const font = await resolveFont();

  let captionFilter = "";
  if (srtPath) {
    try {
      await fs.access(srtPath);
      const srtContent = await fs.readFile(srtPath, "utf8");
      if (srtContent.trim().length > 0) {
        const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
        captionFilter = font
          ? `subtitles='${escapedSrt}':force_style='FontName=DejaVu Sans Bold,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,Outline=2,Shadow=1,Alignment=2,MarginV=50'`
          : `subtitles='${escapedSrt}'`;
      }
    } catch {
      console.warn("[assembler] SRT not found, skipping captions");
    }
  }

  const videoFilterArgs = captionFilter ? ["-vf", captionFilter] : [];
  const videoCodecArgs = captionFilter
    ? ["-threads", String(THREADS), "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET]
    : ["-c:v", "copy"];

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

// ─── Thumbnail ───────────────────────────────────────────────────────────────
async function extractThumbnail(videoPath: string, thumbPath: string): Promise<void> {
  await ffmpeg([
    "-ss", "4", "-i", videoPath,
    "-vframes", "1",
    "-vf", `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
    "-y", thumbPath,
  ]);
}

// ─── Black clip fallback ─────────────────────────────────────────────────────
async function makeBlackClip(outPath: string, durationSec: number): Promise<void> {
  await ffmpeg([
    "-f", "lavfi", "-i", `color=c=black:size=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:rate=${FPS}`,
    "-t", String(durationSec),
    "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
    "-an", "-y", outPath,
  ]);
}

// ─── Step manifest ───────────────────────────────────────────────────────────
export const RENDER_STEPS: RenderStep[] = [
  { label: "Slicing sections into fast cuts",                    done: false },
  { label: "Pre-rendering cuts with Ken Burns motion",           done: false },
  { label: "Merging voiceover audio tracks",                     done: false },
  { label: "Generating SRT captions",                            done: false },
  { label: "Chaining cuts with xfade transitions",               done: false },
  { label: "Mixing audio + burning captions",                    done: false },
  { label: "Generating thumbnail",                               done: false },
];

// ─── Main assembly entry point ───────────────────────────────────────────────
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
  // All downloaded clips flattened into one pool for round-robin assignment
  const globalClipPool: string[] = [];
  for (const paths of footagePathsPerSection) {
    if (paths) {
      for (const p of paths) {
        if (!globalClipPool.includes(p)) globalClipPool.push(p);
      }
    }
  }

  // Returns the best available clips for a section — own clips first, then borrows from pool
  const getClipsForSection = (i: number): string[] => {
    const own = footagePathsPerSection[i];
    if (own && own.length > 0) return own;
    if (globalClipPool.length === 0) return [];
    // Borrow at staggered offset so adjacent sections look different
    const offset = (i * 3) % globalClipPool.length;
    const N = Math.min(4, globalClipPool.length);
    const borrowed: string[] = [];
    for (let k = 0; k < N; k++) {
      borrowed.push(globalClipPool[(offset + k) % globalClipPool.length]);
    }
    console.log(`[assembler] Section ${i}: no footage, borrowing ${borrowed.length} clips from pool`);
    return borrowed;
  };

  // ── Step 1: Plan cuts ────────────────────────────────────────────────────
  await onProgress(0, total, RENDER_STEPS[0].label);

  // cutPlan[i] = array of { clipPath, durationSec } for each cut in section i
  type CutInfo = { clipPath: string; durationSec: number };
  const cutPlan: CutInfo[][] = [];
  const validAudioForSection: (string | null)[] = [];

  // Global cut index used to advance both the clip pool pointer and the motion cycle,
  // ensuring no two adjacent cuts ever get the same motion type or same source clip.
  let globalCutIdx = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
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

    // Determine cut durations for this section
    const cutDurations = sliceCuts(audioDuration);
    const availableClips = getClipsForSection(i);

    const sectionCuts: CutInfo[] = [];

    for (let ci = 0; ci < cutDurations.length; ci++) {
      const cutDur = cutDurations[ci];

      let clipPath: string | null = null;

      if (availableClips.length > 0) {
        // Cycle through available clips for this section — each cut gets a different one
        clipPath = availableClips[ci % availableClips.length];
      } else if (globalClipPool.length > 0) {
        // Last resort: borrow from the global pool at a unique offset
        clipPath = globalClipPool[globalCutIdx % globalClipPool.length];
      }

      sectionCuts.push({ clipPath: clipPath ?? "", durationSec: cutDur });
      globalCutIdx++;
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
  // Track where each new section starts in renderedCuts — used by chainXfadeTransitions
  // to place xfade transitions at section joins and hard cuts within sections
  const sectionBoundaries: number[] = [];

  // globalMotionIdx is separate from globalCutIdx so motion cycles independently
  // of clip assignment — avoids identical motion on back-to-back cuts even when
  // the same source clip is reused.
  let globalMotionIdx = 0;

  for (let i = 0; i < sections.length; i++) {
    const cuts = cutPlan[i];
    if (cuts.length === 0) continue;

    const audioPath = validAudioForSection[i];
    if (!audioPath) continue;

    // Mark where this section starts in the global renderedCuts array
    if (renderedCuts.length > 0) sectionBoundaries.push(renderedCuts.length);

    for (let ci = 0; ci < cuts.length; ci++) {
      const { clipPath, durationSec } = cuts[ci];
      const motionType = MOTION_CYCLE[globalMotionIdx % MOTION_CYCLE.length];
      globalMotionIdx++;

      const outPath = path.join(tmpDir, `cut_${i}_${ci}.mp4`);

      if (!clipPath) {
        // No source footage at all: black clip
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

        // Fallback: plain scale without Ken Burns
        const fallbackPath = path.join(tmpDir, `scaled_${i}_${ci}.mp4`);
        try {
          const rawDur = await ffprobe(clipPath);
          const loopArgs = rawDur < durationSec ? ["-stream_loop", "-1"] : [];
          await ffmpeg([
            ...loopArgs, "-i", clipPath,
            "-vf", `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
            "-t", String(durationSec), "-r", String(FPS),
            "-threads", String(THREADS), "-c:v", "libx264", "-crf", "26", "-preset", "ultrafast",
            "-an", "-y", fallbackPath,
          ]);
          renderedCuts.push(fallbackPath);
          renderedDurations.push(durationSec);
        } catch {
          // Absolute last resort
          const blackPath = path.join(tmpDir, `black_${i}_${ci}.mp4`);
          await makeBlackClip(blackPath, durationSec);
          renderedCuts.push(blackPath);
          renderedDurations.push(durationSec);
        }
      }
    }

    // The section's audio covers all its cuts end-to-end
    audioForRenderedCuts.push(audioPath);
  }

  if (renderedCuts.length === 0) {
    throw new Error("No cuts could be rendered — check that audio was generated.");
  }

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
  console.log(`[assembler] ${renderedCuts.length} cuts, ${sectionBoundaries.length} section boundaries`);
  await chainXfadeTransitions(renderedCuts, renderedDurations, transitionedVideo, sectionBoundaries);

  // ── Step 6: Final mix — audio + BGM + captions ───────────────────────────
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

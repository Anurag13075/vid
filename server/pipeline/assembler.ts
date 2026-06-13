import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, RenderStep } from "./types.js";
import { ffmpeg, ffprobe, FFMPEG_PATH } from "./ffmpeg.js";

type ProgressFn = (step: number, total: number, label: string) => void | Promise<void>;

// ─── Constants ───────────────────────────────────────────────────────────────
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const FPS = 30;
const TRANSITION_DURATION = 0.3;
const BGM_VOLUME = 0.15;
const BGM_FADE_IN = 1.0;
const BGM_FADE_OUT = 2.0;
const CRF = 23;
const PRESET = "slow";
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

// Ken Burns motion types — alternated per clip for cinematic variety
type MotionType = "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
const MOTION_CYCLE: MotionType[] = ["zoom-in", "pan-right", "zoom-out", "pan-left"];

// ─── Escape text for FFmpeg drawtext / subtitles ─────────────────────────────
function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/"/g, "")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/%/g, "")
    .slice(0, 80);
}

// ─── Resolve font path ───────────────────────────────────────────────────────
async function resolveFont(): Promise<string> {
  try {
    await fs.access(FONT);
    return FONT;
  } catch {
    try {
      await fs.access(FONT_FALLBACK);
      return FONT_FALLBACK;
    } catch {
      return "";
    }
  }
}

// ─── Build Ken Burns zoompan filter string for one clip ──────────────────────
// We pre-render each clip to a temp file first to avoid zoompan inside
// a massive filter_complex (which times out on long videos).
function buildKenBurnsFilter(motion: MotionType, durationSec: number): string {
  const totalFrames = Math.ceil(durationSec * FPS);
  // Scale factor: 1.0 → 1.04 (subtle, cinematic)
  const scaleStart = 1.0;
  const scaleEnd = 1.04;

  // zoompan formula: z = zoom expression, x/y = pan expression
  // d = total frames, s = output size
  const d = totalFrames;
  const w = OUTPUT_WIDTH;
  const h = OUTPUT_HEIGHT;

  // Each motion type uses a different zoom/pan combination
  switch (motion) {
    case "zoom-in":
      // Slowly zoom in from center
      return [
        `scale=${w * 2}:${h * 2}`,
        `zoompan=z='${scaleStart}+on/${d}*${scaleEnd - scaleStart}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${w}x${h}:fps=${FPS}`,
      ].join(",");

    case "zoom-out":
      // Start zoomed in, slowly zoom out
      return [
        `scale=${w * 2}:${h * 2}`,
        `zoompan=z='${scaleEnd}-on/${d}*${scaleEnd - scaleStart}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${w}x${h}:fps=${FPS}`,
      ].join(",");

    case "pan-right":
      // Zoom in slightly while panning right
      return [
        `scale=${w * 2}:${h * 2}`,
        `zoompan=z='${scaleStart}+on/${d}*${(scaleEnd - scaleStart) * 0.5}':x='on/${d}*(iw/zoom/4)':y='ih/2-(ih/zoom/2)':d=${d}:s=${w}x${h}:fps=${FPS}`,
      ].join(",");

    case "pan-left":
      // Zoom in slightly while panning left
      return [
        `scale=${w * 2}:${h * 2}`,
        `zoompan=z='${scaleStart}+on/${d}*${(scaleEnd - scaleStart) * 0.5}':x='iw/zoom/4*(1-on/${d})':y='ih/2-(ih/zoom/2)':d=${d}:s=${w}x${h}:fps=${FPS}`,
      ].join(",");
  }
}

// ─── Pre-render a single clip with Ken Burns motion ──────────────────────────
// Returns path to a temp MP4 at OUTPUT_WIDTH x OUTPUT_HEIGHT @ FPS
async function renderClipWithKenBurns(
  clipPath: string,
  durationSec: number,
  motionType: MotionType,
  outPath: string
): Promise<void> {
  const clipDuration = await ffprobe(clipPath);
  // Loop the clip if it's shorter than needed
  const needsLoop = clipDuration < durationSec;

  const kenBurnsFilter = buildKenBurnsFilter(motionType, durationSec);
  // Color grade: slight contrast boost + saturation for cinematic look
  const gradeFilter = `eq=contrast=1.08:brightness=0.02:saturation=1.15,unsharp=3:3:0.5`;
  const fullFilter = `${kenBurnsFilter},${gradeFilter},format=yuv420p`;

  console.log(`[assembler] Ken Burns (${motionType}) on ${path.basename(clipPath)} → ${path.basename(outPath)} (${durationSec.toFixed(2)}s)`);

  const baseArgs = needsLoop
    ? ["-stream_loop", "-1", "-i", clipPath]
    : ["-i", clipPath];

  await ffmpeg([
    ...baseArgs,
    "-vf", fullFilter,
    "-t", String(durationSec),
    "-r", String(FPS),
    "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-an",
    "-y", outPath,
  ]);
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

// ─── Chain xfade transitions across all clips ────────────────────────────────
// For long videos (>20 clips), batch in groups of 10 to avoid filter_complex limits
async function chainXfadeTransitions(
  clipPaths: string[],
  clipDurations: number[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No clips to chain");

  if (clipPaths.length === 1) {
    await fs.copyFile(clipPaths[0], outputPath);
    return;
  }

  // For very long videos, batch xfade in groups then concat the batches
  const BATCH_SIZE = 10;
  if (clipPaths.length > BATCH_SIZE) {
    const batchOutputs: string[] = [];
    const batchDurations: number[] = [];
    const tmpDir = path.dirname(outputPath);

    for (let bStart = 0; bStart < clipPaths.length; bStart += BATCH_SIZE) {
      const bEnd = Math.min(bStart + BATCH_SIZE, clipPaths.length);
      const batchClips = clipPaths.slice(bStart, bEnd);
      const batchDurs = clipDurations.slice(bStart, bEnd);
      const batchOut = path.join(tmpDir, `xfade_batch_${bStart}.mp4`);

      await xfadeBatch(batchClips, batchDurs, batchOut);

      const totalDur = batchDurs.reduce((a, b) => a + b, 0) - (batchClips.length - 1) * TRANSITION_DURATION;
      batchOutputs.push(batchOut);
      batchDurations.push(totalDur);
    }

    // Final xfade pass across batches
    if (batchOutputs.length === 1) {
      await fs.copyFile(batchOutputs[0], outputPath);
    } else {
      await xfadeBatch(batchOutputs, batchDurations, outputPath);
    }
    return;
  }

  await xfadeBatch(clipPaths, clipDurations, outputPath);
}

async function xfadeBatch(
  clipPaths: string[],
  clipDurations: number[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 1) {
    await fs.copyFile(clipPaths[0], outputPath);
    return;
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

  // Remove trailing semicolon
  filterGraph = filterGraph.slice(0, -1);

  console.log(`[assembler] xfade chain: ${clipPaths.length} clips, filter_complex length: ${filterGraph.length}`);

  await ffmpeg([
    ...inputs,
    "-filter_complex", filterGraph,
    "-map", "[vout]",
    "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-r", String(FPS),
    "-an",
    "-y", outputPath,
  ]);
}

// ─── Merge voiceover audio tracks ────────────────────────────────────────────
async function mergeAudio(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 0) {
    await ffmpeg([
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-t", "5", "-c:a", "aac", "-b:a", "128k",
      "-y", outputPath,
    ]);
    return;
  }
  if (audioPaths.length === 1) {
    await fs.copyFile(audioPaths[0], outputPath);
    return;
  }

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

// ─── Burn captions + mix BGM into final MP4 ──────────────────────────────────
async function finalMixWithCaptions(
  videoPath: string,
  voiceoverPath: string,
  bgmPath: string | null,
  srtPath: string | null,
  outputPath: string
): Promise<void> {
  const font = await resolveFont();

  // Build subtitle/caption filter
  // Use subtitles filter with styling for burned-in captions
  let captionFilter = "";
  if (srtPath) {
    try {
      await fs.access(srtPath);
      const srtContent = await fs.readFile(srtPath, "utf8");
      if (srtContent.trim().length > 0) {
        // Escape the path for FFmpeg
        const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
        if (font) {
          captionFilter = `subtitles='${escapedSrt}':force_style='FontName=DejaVu Sans Bold,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,Outline=2,Shadow=1,Alignment=2,MarginV=50'`;
        } else {
          captionFilter = `subtitles='${escapedSrt}'`;
        }
      }
    } catch {
      console.warn("[assembler] SRT file not found or empty, skipping captions");
    }
  }

  const videoFilterArgs = captionFilter
    ? ["-vf", captionFilter]
    : ["-c:v", "copy"];

  const videoCodecArgs = captionFilter
    ? ["-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET]
    : ["-c:v", "copy"];

  if (bgmPath) {
    // Get total voiceover duration for BGM fade out timing
    const voDuration = await ffprobe(voiceoverPath);
    const fadeOutStart = Math.max(voDuration - BGM_FADE_OUT, 0);

    await ffmpeg([
      "-i", videoPath,
      "-i", voiceoverPath,
      "-stream_loop", "-1", "-i", bgmPath,
      "-filter_complex", [
        // BGM: volume + fade in/out
        `[2:a]volume=${BGM_VOLUME},afade=t=in:st=0:d=${BGM_FADE_IN},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${BGM_FADE_OUT}[bgm]`,
        // Mix voiceover + BGM
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

// ─── Step manifest ───────────────────────────────────────────────────────────
export const RENDER_STEPS: RenderStep[] = [
  { label: "Pre-rendering clips with Ken Burns motion",          done: false },
  { label: "Merging voiceover audio tracks",                     done: false },
  { label: "Generating SRT captions",                            done: false },
  { label: "Chaining clips with xfade transitions",              done: false },
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

  // ── Build global clip pool for fallback ──────────────────────────────────
  const globalClipPool: string[] = [];
  for (const paths of footagePathsPerSection) {
    if (paths) {
      for (const p of paths) {
        if (!globalClipPool.includes(p)) globalClipPool.push(p);
      }
    }
  }

  const resolveFootage = (i: number): string[] => {
    const own = footagePathsPerSection[i];
    if (own && own.length > 0) return own;
    if (globalClipPool.length === 0) return [];
    // Borrow from pool at a staggered offset so adjacent sections look different
    const offset = (i * 3) % globalClipPool.length;
    const N = Math.min(3, globalClipPool.length);
    const borrowed: string[] = [];
    for (let k = 0; k < N; k++) {
      borrowed.push(globalClipPool[(offset + k) % globalClipPool.length]);
    }
    console.log(`[assembler] Section ${i}: no footage, borrowing ${borrowed.length} clips from pool`);
    return borrowed;
  };

  // ── Step 1: Pre-render each section clip with Ken Burns ──────────────────
  await onProgress(0, total, RENDER_STEPS[0].label);

  const renderedClips: string[] = [];
  const renderedDurations: number[] = [];
  const validAudio: string[] = [];

  // Track which clip paths have been used for Ken Burns to avoid identical motion
  // on consecutive sections that share the same source file
  let motionIndex = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const audioPath = audioPaths[i];
    if (!audioPath) continue;

    const audioDuration = await ffprobe(audioPath);
    const clipDuration = Math.max(audioDuration + 0.3, 1.0);

    const footage = resolveFootage(i);

    if (footage.length === 0) {
      // Absolute last resort: black clip
      const fallbackPath = path.join(tmpDir, `black_${i}.mp4`);
      await ffmpeg([
        "-f", "lavfi", "-i", `color=c=black:size=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:rate=${FPS}`,
        "-t", String(clipDuration),
        "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
        "-an", "-y", fallbackPath,
      ]);
      renderedClips.push(fallbackPath);
      renderedDurations.push(clipDuration);
      validAudio.push(audioPath);
      motionIndex++;
      continue;
    }

    // Use only the first clip per section (each section has its own unique clip)
    // Multiple clips per section are ignored — one clip per scene, Ken Burns creates motion
    const clipPath = footage[0];
    const motion = MOTION_CYCLE[motionIndex % MOTION_CYCLE.length];
    const outPath = path.join(tmpDir, `kb_section_${i}.mp4`);

    try {
      await renderClipWithKenBurns(clipPath, clipDuration, motion, outPath);
      renderedClips.push(outPath);
      renderedDurations.push(clipDuration);
      validAudio.push(audioPath);
    } catch (err) {
      console.error(`[assembler] Ken Burns failed for section ${i}, using raw clip:`, (err as Error).message);
      // Fallback: just scale the clip without Ken Burns
      const fallbackPath = path.join(tmpDir, `scaled_${i}.mp4`);
      try {
        const rawDuration = await ffprobe(clipPath);
        const loopArgs = rawDuration < clipDuration ? ["-stream_loop", "-1"] : [];
        await ffmpeg([
          ...loopArgs,
          "-i", clipPath,
          "-vf", `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
          "-t", String(clipDuration),
          "-r", String(FPS),
          "-c:v", "libx264", "-crf", "26", "-preset", "ultrafast",
          "-an", "-y", fallbackPath,
        ]);
        renderedClips.push(fallbackPath);
        renderedDurations.push(clipDuration);
        validAudio.push(audioPath);
      } catch (err2) {
        console.error(`[assembler] Fallback scale also failed for section ${i}:`, err2);
        // Black clip as last resort
        const blackPath = path.join(tmpDir, `black_fallback_${i}.mp4`);
        await ffmpeg([
          "-f", "lavfi", "-i", `color=c=black:size=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:rate=${FPS}`,
          "-t", String(clipDuration),
          "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
          "-an", "-y", blackPath,
        ]);
        renderedClips.push(blackPath);
        renderedDurations.push(clipDuration);
        validAudio.push(audioPath);
      }
    }

    motionIndex++;
  }

  if (renderedClips.length === 0) {
    throw new Error("No clips could be rendered — check that audio was generated.");
  }

  // ── Step 2: Merge voiceover audio ────────────────────────────────────────
  await onProgress(1, total, RENDER_STEPS[1].label);
  const mergedAudio = path.join(tmpDir, "voiceover_merged.aac");
  await mergeAudio(validAudio, mergedAudio);

  // ── Step 3: Generate SRT captions ────────────────────────────────────────
  await onProgress(2, total, RENDER_STEPS[2].label);
  const srtPath = path.join(tmpDir, "captions.srt");
  try {
    await generateSrt(sections, audioPaths, srtPath);
    console.log(`[assembler] SRT captions written to ${srtPath}`);
  } catch (err) {
    console.warn("[assembler] SRT generation failed, captions will be skipped:", err);
  }

  // ── Step 4: Chain clips with xfade transitions ───────────────────────────
  await onProgress(3, total, RENDER_STEPS[3].label);
  const transitionedVideo = path.join(tmpDir, "transitioned.mp4");
  await chainXfadeTransitions(renderedClips, renderedDurations, transitionedVideo);

  // ── Step 5: Final mix — audio + BGM + captions ───────────────────────────
  await onProgress(4, total, RENDER_STEPS[4].label);
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

  // ── Step 6: Thumbnail ─────────────────────────────────────────────────────
  await onProgress(5, total, RENDER_STEPS[5].label);
  const thumbPath = path.join(outputDir, "thumb.jpg");
  await extractThumbnail(finalMp4, thumbPath);

  return { videoPath: finalMp4, thumbPath };
}
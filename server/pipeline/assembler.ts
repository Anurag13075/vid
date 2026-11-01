import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { ScriptSection, RenderStep } from "./types.js";
import { ffmpeg, ffprobe, getExactDuration, getFFmpegCapabilities, FFMPEG_PATH } from "./ffmpeg.js";
import { getTempDir } from "./tempDir.js";

export { getTempDir };

type ProgressFn = (step: number, total: number, label: string) => void | Promise<void>;

// ─── Constants ───────────────────────────────────────────────────────────────
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const FPS = 30;
const CRF = 22; // Broadcast 1080p quality
const PRESET = "fast";
const THREADS = 0; // auto-detect cpu cores

const CUT_TARGET_SEC = 4.0;
const CUT_MIN_SEC = 2.5;
const CUT_MAX_SEC = 6.0;

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
];

async function resolveFont(): Promise<string> {
  for (const f of FONT_CANDIDATES) {
    try {
      await fs.access(f);
      return f.replace(/\\/g, "/");
    } catch {}
  }
  return "";
}

type MotionType = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down";
const MOTION_CYCLE: MotionType[] = [
  "zoom-in", "pan-right", "zoom-out", "pan-left",
  "zoom-in", "pan-up",   "zoom-out", "pan-down",
];

// ─── Theme System ─────────────────────────────────────────────────────────────
interface ThemeConfig {
  gradeFilter: string;
  captionAccent: string;
}

const THEME_CONFIGS: Record<string, ThemeConfig> = {
  crime: {
    gradeFilter: "eq=contrast=1.18:brightness=-0.04:saturation=0.88",
    captionAccent: "#ef4444",
  },
  history: {
    gradeFilter: "eq=contrast=1.10:brightness=0.01:saturation=0.82",
    captionAccent: "#eab308",
  },
  modern: {
    gradeFilter: "eq=contrast=1.12:brightness=0.02:saturation=1.20",
    captionAccent: "#8b5cf6",
  },
  minimalist: {
    gradeFilter: "eq=contrast=1.06:brightness=0.01:saturation=0.98",
    captionAccent: "#38bdf8",
  },
  standard: {
    gradeFilter: "eq=contrast=1.10:brightness=0.02:saturation=1.15",
    captionAccent: "#22c55e",
  },
};

function resolveTheme(theme?: string): ThemeConfig {
  return THEME_CONFIGS[theme ?? ""] ?? THEME_CONFIGS.standard;
}

interface SectionTiming {
  startSec: number;
  endSec: number;
  sectionType: string;
  keyPoint: string | null;
}

// ─── ASS SubStation Alpha Helpers ───────────────────────────────────────────
function assTime(seconds: number): string {
  const totalCs = Math.max(0, Math.floor(seconds * 100));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function hexToAss(hex: string, alpha = 0): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 255;
  const g = parseInt(clean.slice(2, 4), 16) || 255;
  const b = parseInt(clean.slice(4, 6), 16) || 255;
  const aa = Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
  return `&H${aa}${b.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${r.toString(16).padStart(2, "0").toUpperCase()}`;
}

function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function escapeFilterPath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "'\\''");
}

// ─── Native 1080p Ken Burns Motion Filter ────────────────────────────────────
function buildKenBurnsFilter(motion: MotionType, durationSec: number): string {
  const totalFrames = Math.max(Math.ceil(durationSec * FPS), 2);
  const denom = totalFrames - 1;
  const w = OUTPUT_WIDTH;
  const h = OUTPUT_HEIGHT;
  const SCALE = 1.12;
  const sw = Math.round(w * SCALE);
  const sh = Math.round(h * SCALE);
  const dx = sw - w;
  const dy = sh - h;
  const prog = `(min(n,${denom})/${denom})`;

  const baseScale = `scale=${sw}:${sh}:force_original_aspect_ratio=increase,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2:color=black`;

  switch (motion) {
    case "zoom-in": {
      const cW = `${sw}-${dx}*${prog}`, cH = `${sh}-${dy}*${prog}`;
      return `${baseScale},crop='${cW}':'${cH}':'(${sw}-(${cW}))/2':'(${sh}-(${cH}))/2',scale=${w}:${h}`;
    }
    case "zoom-out": {
      const cW = `${w}+${dx}*${prog}`, cH = `${h}+${dy}*${prog}`;
      return `${baseScale},crop='${cW}':'${cH}':'(${sw}-(${cW}))/2':'(${sh}-(${cH}))/2',scale=${w}:${h}`;
    }
    case "pan-right":
      return `${baseScale},crop=${w}:${h}:'${dx}*${prog}':${Math.floor(dy / 2)}`;
    case "pan-left":
      return `${baseScale},crop=${w}:${h}:'${dx}*(1-${prog})':${Math.floor(dy / 2)}`;
    case "pan-up":
      return `${baseScale},crop=${w}:${h}:${Math.floor(dx / 2)}:'${dy}*${prog}'`;
    case "pan-down":
      return `${baseScale},crop=${w}:${h}:${Math.floor(dx / 2)}:'${dy}*(1-${prog})'`;
  }
}

// ─── Render One Cut (Stream Loop Enabled to Prevent Duration Truncation) ────
async function renderCut(
  clipPath: string,
  durationSec: number,
  motionType: MotionType,
  outPath: string,
  gradeFilter: string,
  isSectionStart = false,
  isSectionEnd = false,
  options?: { videoId?: string; signal?: AbortSignal }
): Promise<void> {
  let transitionFilter = "";
  if (isSectionStart && durationSec > 1.2) {
    transitionFilter = ",fade=t=in:st=0:d=0.30";
  } else if (isSectionEnd && durationSec > 1.2) {
    transitionFilter = `,fade=t=out:st=${(durationSec - 0.30).toFixed(2)}:d=0.30`;
  }

  const fullFilter = `${buildKenBurnsFilter(motionType, durationSec)},${gradeFilter}${transitionFilter},format=yuv420p`;

  const isImage = /\.(jpe?g|png|webp|avif)$/i.test(clipPath);
  const loopArgs = isImage ? ["-loop", "1"] : ["-stream_loop", "-1"];

  await ffmpeg([
    ...loopArgs,
    "-i", clipPath,
    "-vf", fullFilter,
    "-t", durationSec.toFixed(3),
    "-r", String(FPS),
    "-threads", String(THREADS),
    "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-pix_fmt", "yuv420p",
    "-g", "30", "-keyint_min", "30",
    "-video_track_timescale", "30000",
    "-an", "-y", outPath,
  ], options);
}

// ─── Dark Gradient Scene Fallback ────────────────────────────────────────────
async function makeDarkSceneClip(
  outPath: string,
  durationSec: number,
  options?: { videoId?: string; signal?: AbortSignal }
): Promise<void> {
  await ffmpeg([
    "-f", "lavfi",
    "-i", `color=c=0x0a0c12:size=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:rate=${FPS}`,
    "-t", durationSec.toFixed(3),
    "-r", String(FPS),
    "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-pix_fmt", "yuv420p",
    "-g", "30", "-keyint_min", "30",
    "-video_track_timescale", "30000",
    "-an", "-y", outPath,
  ], options);
}

// ─── Cut Slicer (Ensures Cuts Sum Exactly to Audio Track Duration) ───────────
function sliceCuts(audioDuration: number): number[] {
  if (audioDuration <= CUT_MAX_SEC) return [audioDuration];
  const cuts: number[] = [];
  let remaining = audioDuration;
  while (remaining > 0) {
    if (remaining <= CUT_MAX_SEC) {
      cuts.push(remaining);
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

// ─── ASS Subtitles & Karaoke Generator ───────────────────────────────────────
async function generateAssKaraoke(
  sections: ScriptSection[],
  sectionTimings: SectionTiming[],
  audioPaths: (string | null)[],
  assPath: string,
  accentHex: string,
  includeOverlayFallbacks = true,
  videoTitle = ""
): Promise<void> {
  const accentColor = hexToAss(accentHex, 0);
  const white = "&H00FFFFFF";
  const gray = "&H00D0D0D0";
  const black = "&H00000000";
  const shadowBox = "&HB0000000";
  const cardBox = "&HD810141C";

  let events = "";

  // If drawtext is not available on current build, ASS renders the overlays seamlessly
  if (includeOverlayFallbacks) {
    if (videoTitle.trim()) {
      const cleanTitle = escapeAss(videoTitle.length > 55 ? videoTitle.slice(0, 52) + "..." : videoTitle);
      events += `Dialogue: 3,0:00:00.40,0:00:04.20,TitleCard,,0,0,0,,{\\fad(400,400)}${cleanTitle}\n`;
      events += `Dialogue: 4,0:00:00.60,0:00:04.20,TitleBadge,,0,0,0,,{\\fad(300,400)}━ DOCUMENTARY INVESTIGATION ━\n`;
    }

    for (const t of sectionTimings) {
      const dur = t.endSec - t.startSec;
      if (dur < 1.2) continue;
      if ((t.sectionType === "stat" || t.keyPoint) && t.keyPoint) {
        const showStart = t.startSec + 0.8;
        const showEnd = Math.min(t.startSec + 4.5, t.endSec - 0.4);
        if (showEnd > showStart + 1.0) {
          events += `Dialogue: 2,${assTime(showStart)},${assTime(showEnd)},StatCard,,0,0,0,,{\\fad(300,300)}◆ ${escapeAss(t.keyPoint)}\n`;
        }
      }
      if (t.sectionType === "intro" || t.sectionType === "outro") {
        const isIntro = t.sectionType === "intro";
        const showStart = isIntro ? Math.max(t.startSec + 4.5, 4.5) : t.startSec + 0.4;
        const showEnd = Math.min(showStart + 3.8, t.endSec - 0.3);
        if (showEnd > showStart + 1.0) {
          const badgeLabel = isIntro ? "PROLOGUE" : "CONCLUSION";
          events += `Dialogue: 2,${assTime(showStart)},${assTime(showEnd)},ChapterTag,,0,0,0,,{\\fad(300,300)}[ ${badgeLabel} ]\n`;
        }
      }
    }
  }

  // Word-by-Word Timed Karaoke Subtitles
  const WORDS_PER_LINE = 4;
  let timeOffset = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const audioPath = audioPaths[i];
    if (!audioPath || !section.narration.trim()) continue;

    const duration = await getExactDuration(audioPath);
    if (duration <= 0) continue;

    const words = section.narration.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const charCounts = words.map((w) => Math.max(w.length, 1));
    const totalChars = charCounts.reduce((a, b) => a + b, 0);
    const wordDurs = charCounts.map((c) => (c / totalChars) * duration);

    let wordIdx = 0;
    let wordTimeAcc = 0;

    while (wordIdx < words.length) {
      const chunk = words.slice(wordIdx, wordIdx + WORDS_PER_LINE);
      const chunkDurs = wordDurs.slice(wordIdx, wordIdx + WORDS_PER_LINE);
      const chunkDur = chunkDurs.reduce((a, b) => a + b, 0);
      const lineStart = timeOffset + wordTimeAcc;
      const lineEnd = lineStart + chunkDur;

      const kText = chunk
        .map((word, wi) => {
          const cs = Math.max(Math.round(chunkDurs[wi] * 100), 1);
          return `{\\k${cs}}${escapeAss(word)}`;
        })
        .join(" ");

      events += `Dialogue: 1,${assTime(lineStart)},${assTime(lineEnd)},Default,,0,0,0,,${kText}\n`;

      wordTimeAcc += chunkDur;
      wordIdx += WORDS_PER_LINE;
    }

    timeOffset += duration;
  }

  const assContent = `[Script Info]
Title: VidRush Documentary Subtitles
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,50,${white},${accentColor},${black},${shadowBox},1,0,0,0,100,100,1,0,1,3,2,2,80,80,95,1
Style: TitleCard,DejaVu Sans,58,${white},${white},${black},${shadowBox},1,0,0,0,100,100,2,0,3,4,4,5,100,100,100,1
Style: TitleBadge,DejaVu Sans,26,${accentColor},${white},${black},${shadowBox},1,0,0,0,100,100,3,0,3,2,2,5,100,100,220,1
Style: StatCard,DejaVu Sans,42,${white},${white},${black},${cardBox},1,0,0,0,100,100,1,0,3,3,3,5,120,120,120,1
Style: ChapterTag,DejaVu Sans,24,${accentColor},${white},${black},${cardBox},1,0,0,0,100,100,2,0,3,2,2,7,80,80,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}`;

  await fs.writeFile(assPath, assContent, "utf8");
}

// ─── Concat All Cuts Safely (Zero Duration Truncation) ───────────────────────
async function joinAllCuts(
  clipPaths: string[],
  outputPath: string,
  options?: { videoId?: string; signal?: AbortSignal }
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No cuts to join");
  if (clipPaths.length === 1) {
    await fs.copyFile(clipPaths[0], outputPath);
    return;
  }

  const listPath = outputPath + ".concat.txt";
  const lines = clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  await fs.writeFile(listPath, lines, "utf8");

  console.log(`[assembler] joining ${clipPaths.length} cuts into single stream`);

  try {
    await ffmpeg([
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-fflags", "+genpts",
      "-avoid_negative_ts", "make_zero",
      "-y", outputPath,
    ], options);
  } catch (err: any) {
    if (options?.signal?.aborted) throw err;
    console.warn(`[assembler] Fast concat failed (${err.message}). Retrying with re-encode concat fallback...`);
    await ffmpeg([
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c:v", "libx264", "-crf", String(CRF), "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-an", "-y", outputPath,
    ], options);
  }

  await fs.unlink(listPath).catch(() => {});
}

// ─── Merge Voiceover Audio ──────────────────────────────────────────────────
async function mergeAudio(
  audioPaths: string[],
  outputPath: string,
  options?: { videoId?: string; signal?: AbortSignal }
): Promise<void> {
  if (audioPaths.length === 0) {
    await ffmpeg([
      "-f", "lavfi",
      "-i", "anullsrc=r=44100:cl=stereo",
      "-t", "5",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-y", outputPath,
    ], options);
    return;
  }
  if (audioPaths.length === 1) {
    await ffmpeg([
      "-i", audioPaths[0],
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-ac", "2",
      "-y", outputPath,
    ], options);
    return;
  }

  const inputs: string[] = [];
  const formatFilters: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < audioPaths.length; i++) {
    inputs.push("-i", audioPaths[i]);
    formatFilters.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
    concatInputs.push(`[a${i}]`);
  }

  const fc = `${formatFilters.join(";")};${concatInputs.join("")}concat=n=${audioPaths.length}:v=0:a=1[a]`;

  await ffmpeg([
    ...inputs,
    "-filter_complex", fc,
    "-map", "[a]",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "44100",
    "-y", outputPath,
  ], options);
}

// ─── Final Production Mix (Resilient 3-Tier Mixing Engine) ───────────────────
async function finalProductionMix(
  videoPath: string,
  voiceoverPath: string,
  bgmPath: string | null,
  assPath: string | null,
  outputPath: string,
  videoTitle?: string,
  sectionTimings?: SectionTiming[],
  accentHex?: string,
  options?: { videoId?: string; signal?: AbortSignal }
): Promise<void> {
  const hasBgm = bgmPath && (await fs.stat(bgmPath).catch(() => null))?.size;
  const hasAss = assPath && (await fs.stat(assPath).catch(() => null))?.size;

  const vfFilters: string[] = [];
  if (hasAss && assPath) {
    vfFilters.push(`ass='${escapeFilterPath(assPath)}'`);
    console.log("[assembler] Applied broadcast ASS subtitles & overlays stream");
  }
  vfFilters.push("format=yuv420p");
  const videoFilterStr = vfFilters.join(",");

  // ── Tier 1: Full broadcast mix (ASS subtitles + BGM dynamic ducking + loudnorm) ──
  try {
    if (hasBgm && bgmPath) {
      const voDur = await getExactDuration(voiceoverPath);
      const fadeOutStart = Math.max(voDur - 2.5, 0);

      await ffmpeg([
        "-i", videoPath,
        "-i", voiceoverPath,
        "-stream_loop", "-1", "-i", bgmPath,
        "-filter_complex", [
          `[2:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.10,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.0[bgm]`,
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[vo]`,
          `[vo][bgm]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-14:TP=-1.5:LRA=11[audio]`,
        ].join(";"),
        "-map", "0:v", "-map", "[audio]",
        "-vf", videoFilterStr,
        "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-movflags", "+faststart",
        "-y", outputPath,
      ], options);
    } else {
      await ffmpeg([
        "-i", videoPath,
        "-i", voiceoverPath,
        "-filter_complex", `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,loudnorm=I=-14:TP=-1.5:LRA=11[audio]`,
        "-map", "0:v", "-map", "[audio]",
        "-vf", videoFilterStr,
        "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-movflags", "+faststart",
        "-y", outputPath,
      ], options);
    }
    console.log("[assembler] Tier 1 production mix successful");
    return;
  } catch (err: any) {
    if (options?.signal?.aborted || err?.message?.includes("cancelled") || err?.message?.includes("aborted")) {
      throw err;
    }
    console.warn(`[assembler] Tier 1 mix failed (${err.message}). Retrying Tier 2 (safe mix)...`);
  }

  // ── Tier 2: Safe mix with ASS subtitles + clean voiceover (no complex audio filters) ──
  try {
    await ffmpeg([
      "-i", videoPath,
      "-i", voiceoverPath,
      "-map", "0:v", "-map", "1:a",
      "-vf", videoFilterStr,
      "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
      "-movflags", "+faststart",
      "-y", outputPath,
    ], options);
    console.log("[assembler] Tier 2 safe mix successful");
    return;
  } catch (err: any) {
    if (options?.signal?.aborted || err?.message?.includes("cancelled") || err?.message?.includes("aborted")) {
      throw err;
    }
    console.warn(`[assembler] Tier 2 mix failed (${err.message}). Retrying Tier 3 (direct stream mux)...`);
  }

  // ── Tier 3: Direct stream mux (zero video re-encoding, guaranteed to succeed) ──
  await ffmpeg([
    "-i", videoPath,
    "-i", voiceoverPath,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    "-y", outputPath,
  ], options);
  console.log("[assembler] Tier 3 direct mux completed successfully");
}

// ─── Thumbnail Extraction ────────────────────────────────────────────────────
async function extractThumbnail(
  videoPath: string,
  thumbPath: string,
  options?: { videoId?: string; signal?: AbortSignal }
): Promise<void> {
  const dur = await getExactDuration(videoPath);
  const seekSec = Math.min(3.0, Math.max(dur / 2, 0.5));
  await ffmpeg([
    "-ss", seekSec.toFixed(2),
    "-i", videoPath,
    "-vframes", "1",
    "-vf", `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
    "-y", thumbPath,
  ], options);
}

// ─── Step Manifest ───────────────────────────────────────────────────────────
export const RENDER_STEPS: RenderStep[] = [
  { label: "Slicing sections into fast cuts", done: false },
  { label: "Rendering 1080p cuts with cinematic color grade", done: false },
  { label: "Merging voiceover audio tracks", done: false },
  { label: "Generating broadcast subtitles and graphics (ASS)", done: false },
  { label: "Seamlessly joining video timeline", done: false },
  { label: "Mastering audio & rendering final 1080p video", done: false },
  { label: "Extracting high-resolution thumbnail", done: false },
];

function makeSectionClipResolver(footagePathsPerSection: (string[] | null)[], globalPool: string[]) {
  return (i: number): string[] => {
    const own = footagePathsPerSection[i];
    if (own && own.length > 0) return own;

    for (let radius = 1; radius <= 3; radius++) {
      for (const j of [i - radius, i + radius]) {
        if (j >= 0 && j < footagePathsPerSection.length) {
          const adj = footagePathsPerSection[j];
          if (adj && adj.length > 0) return adj;
        }
      }
    }

    if (globalPool.length === 0) return [];
    const offset = (i * 3) % globalPool.length;
    const count = Math.min(6, globalPool.length);
    return Array.from({ length: count }, (_, k) => globalPool[(offset + k) % globalPool.length]);
  };
}

// ─── Main Assembly Entry Point ──────────────────────────────────────────────
export async function assemble(
  videoId: string,
  videoTitle: string,
  sections: ScriptSection[],
  audioPaths: (string | null)[],
  footagePathsPerSection: (string[] | null)[],
  bgmPath: string | null,
  outputDir: string,
  onProgress: ProgressFn,
  theme?: string,
  signal?: AbortSignal
): Promise<{ videoPath: string; thumbPath: string }> {
  const tmpDir = getTempDir(videoId);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const opts = { videoId, signal };
  if (signal?.aborted) throw new Error("Assembly cancelled by user");

  const { gradeFilter, captionAccent } = resolveTheme(theme);
  const caps = getFFmpegCapabilities();
  console.log(`[assembler] Starting assemble: theme="${theme ?? "standard"}" drawtext=${caps.hasDrawtext}`);

  const total = RENDER_STEPS.length;

  // Build global clip pool
  const globalPool: string[] = [];
  for (const paths of footagePathsPerSection) {
    if (paths) {
      for (const p of paths) {
        if (!globalPool.includes(p)) globalPool.push(p);
      }
    }
  }
  console.log(`[assembler] Global pool has ${globalPool.length} clips`);

  const getSectionClips = makeSectionClipResolver(footagePathsPerSection, globalPool);

  // ── Step 1: Plan Cuts & Exact Section Timings ─────────────────────────────
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(0, total, RENDER_STEPS[0].label);

  type CutInfo = {
    clipPath: string;
    durationSec: number;
    isSectionStart: boolean;
    isSectionEnd: boolean;
  };

  const cutPlan: CutInfo[][] = [];
  const validAudio: string[] = [];
  const sectionTimings: SectionTiming[] = [];
  let runningTime = 0;

  for (let i = 0; i < sections.length; i++) {
    if (signal?.aborted) throw new Error("Assembly cancelled by user");
    const ap = audioPaths[i];
    if (!ap) {
      cutPlan.push([]);
      continue;
    }

    // Measure exact audio duration with sample-accurate decoder
    const dur = await getExactDuration(ap);
    if (dur <= 0) {
      cutPlan.push([]);
      continue;
    }

    validAudio.push(ap);
    sectionTimings.push({
      startSec: runningTime,
      endSec: runningTime + dur,
      sectionType: sections[i].section_type,
      keyPoint: sections[i].key_point,
    });
    runningTime += dur;

    const cuts = sliceCuts(dur);
    const sectionClips = getSectionClips(i);

    cutPlan.push(
      cuts.map((d, ci) => ({
        clipPath: sectionClips.length > 0 ? sectionClips[ci % sectionClips.length] : "",
        durationSec: d,
        isSectionStart: ci === 0,
        isSectionEnd: ci === cuts.length - 1,
      }))
    );
  }

  const totalPlannedCuts = cutPlan.reduce((s, c) => s + c.length, 0);
  console.log(`[assembler] Planned ${totalPlannedCuts} cuts across ${sections.length} sections (${runningTime.toFixed(1)}s total)`);

  // ── Step 2: Render 1080p Cuts with Ken Burns Motion ───────────────────────
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(1, total, RENDER_STEPS[1].label);

  const renderedCuts: string[] = [];
  let motionIdx = 0;

  for (let i = 0; i < sections.length; i++) {
    const cuts = cutPlan[i];
    if (!cuts || cuts.length === 0) continue;

    for (let ci = 0; ci < cuts.length; ci++) {
      if (signal?.aborted) throw new Error("Assembly cancelled by user");

      const { clipPath, durationSec, isSectionStart, isSectionEnd } = cuts[ci];
      const motion = MOTION_CYCLE[motionIdx++ % MOTION_CYCLE.length];
      const outPath = path.join(tmpDir, `cut_${i}_${ci}.mp4`);

      if (!clipPath) {
        await makeDarkSceneClip(outPath, durationSec, opts);
        renderedCuts.push(outPath);
        continue;
      }

      try {
        await renderCut(clipPath, durationSec, motion, outPath, gradeFilter, isSectionStart, isSectionEnd, opts);
        renderedCuts.push(outPath);
      } catch (err: any) {
        if (signal?.aborted || err?.message?.includes("cancelled") || err?.message?.includes("aborted")) {
          throw err;
        }
        console.warn(`[assembler] Cut render failed (${i}_${ci}), falling back to safe clip: ${err.message}`);
        await makeDarkSceneClip(outPath, durationSec, opts);
        renderedCuts.push(outPath);
      }
    }
  }

  if (renderedCuts.length === 0) {
    throw new Error("No video cuts were rendered — check audio generation");
  }

  // ── Step 3: Merge Voiceover Tracks ────────────────────────────────────────
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(2, total, RENDER_STEPS[2].label);
  const mergedAudio = path.join(tmpDir, "voiceover_merged.aac");
  await mergeAudio(validAudio, mergedAudio, opts);

  // ── Step 4: Generate ASS Broadcast Subtitles & Graphics ───────────────────
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(3, total, RENDER_STEPS[3].label);
  const assPath = path.join(tmpDir, "subtitles.ass");
  let assExists = false;
  try {
    await generateAssKaraoke(
      sections,
      sectionTimings,
      audioPaths,
      assPath,
      captionAccent,
      true, // Always include title card, badges, stat cards, and chapter markers in ASS
      videoTitle
    );
    assExists = (await fs.stat(assPath)).size > 0;
    console.log(`[assembler] Generated ASS subtitles file`);
  } catch (err: any) {
    console.warn("[assembler] ASS subtitle generation error:", err.message);
  }

  // ── Step 5: Join All Cuts into Full Video Timeline ────────────────────────
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(4, total, RENDER_STEPS[4].label);
  const joinedVideo = path.join(tmpDir, "timeline_joined.mp4");
  await joinAllCuts(renderedCuts, joinedVideo, opts);

  // ── Sync Verification: Guarantee Video Duration Matches Audio Exactly ────
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  const audioDuration = await getExactDuration(mergedAudio);
  const videoDuration = await getExactDuration(joinedVideo);

  console.log(`[assembler] Sync verification: Video=${videoDuration.toFixed(2)}s, Audio=${audioDuration.toFixed(2)}s`);

  let syncedVideo = joinedVideo;
  if (videoDuration < audioDuration - 0.25) {
    const deficit = audioDuration - videoDuration;
    console.log(`[assembler] Video is shorter than audio by ${deficit.toFixed(2)}s. Padding video with last frame to sync.`);
    const paddedVideo = path.join(tmpDir, "timeline_padded.mp4");
    await ffmpeg([
      "-i", joinedVideo,
      "-vf", `tpad=stop_mode=clone:stop_duration=${deficit.toFixed(3)}`,
      "-c:v", "libx264", "-crf", String(CRF), "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-y", paddedVideo,
    ], opts);
    syncedVideo = paddedVideo;
  }

  // ── Step 6: Master Audio & Final Video Render ─────────────────────────────
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(5, total, RENDER_STEPS[5].label);
  const finalMp4 = path.join(outputDir, "final.mp4");
  await finalProductionMix(
    syncedVideo,
    mergedAudio,
    bgmPath,
    assExists ? assPath : null,
    finalMp4,
    videoTitle,
    sectionTimings,
    captionAccent,
    opts
  );

  // ── Step 7: Thumbnail Extraction ──────────────────────────────────────────
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(6, total, RENDER_STEPS[6].label);
  const thumbPath = path.join(outputDir, "thumb.jpg");
  try {
    await extractThumbnail(finalMp4, thumbPath, opts);
  } catch (err: any) {
    if (signal?.aborted) throw err;
    console.warn(`[assembler] Primary thumbnail seek failed (${err.message}). Attempting fallback frame 0 extraction...`);
    try {
      await ffmpeg([
        "-i", finalMp4,
        "-vframes", "1",
        "-vf", `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
        "-y", thumbPath,
      ], opts);
    } catch (fallbackErr: any) {
      console.warn(`[assembler] Fallback thumbnail extraction failed (${fallbackErr.message}). Continuing with video.`);
    }
  }

  // Rolling cleanup: remove cut files and intermediate timeline
  for (const cut of renderedCuts) {
    await fs.unlink(cut).catch(() => {});
  }
  await fs.unlink(joinedVideo).catch(() => {});
  if (syncedVideo !== joinedVideo) {
    await fs.unlink(syncedVideo).catch(() => {});
  }
  await fs.unlink(mergedAudio).catch(() => {});
  if (assExists) await fs.unlink(assPath).catch(() => {});

  return { videoPath: finalMp4, thumbPath };
}

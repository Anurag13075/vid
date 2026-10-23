import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { ScriptSection, RenderStep } from "./types.js";
import { ffmpeg, ffprobe, FFMPEG_PATH } from "./ffmpeg.js";
import { getTempDir } from "./tempDir.js";

export { getTempDir };

type ProgressFn = (step: number, total: number, label: string) => void | Promise<void>;

// ─── Constants ───────────────────────────────────────────────────────────────
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const INTERMEDIATE_WIDTH = 1280;
const INTERMEDIATE_HEIGHT = 720;
const FPS = 30;
const TRANSITION_DURATION = 0.25;
const BGM_VOLUME = 0.12;
const BGM_FADE_IN = 1.0;
const BGM_FADE_OUT = 2.0;
const THREADS = 0; // 0 = auto-detect cores
const CRF = 26;
const PRESET = "ultrafast";
const XFADE_BATCH = 2;

// Windows & Linux font discovery
const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
];

const CUT_TARGET_SEC = 3.5;
const CUT_MIN_SEC = 2.5;
const CUT_MAX_SEC = 5.0;

type MotionType = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down";
const MOTION_CYCLE: MotionType[] = [
  "zoom-in", "pan-right", "zoom-out", "pan-left",
  "zoom-in", "pan-up",   "zoom-out", "pan-down",
];

// ─── Theme system ─────────────────────────────────────────────────────────────
interface ThemeConfig {
  gradeFilter: string;
  captionAccent: string;
}

const THEME_CONFIGS: Record<string, ThemeConfig> = {
  crime: {
    gradeFilter: "eq=contrast=1.22:brightness=-0.05:saturation=0.85,hue=s=0.85",
    captionAccent: "#e53e3e",
  },
  history: {
    gradeFilter: "eq=contrast=1.08:brightness=0.02:saturation=0.72,hue=h=10:s=0.9",
    captionAccent: "#c6932a",
  },
  modern: {
    gradeFilter: "eq=contrast=1.18:brightness=0.03:saturation=1.45",
    captionAccent: "#6c47ff",
  },
  minimalist: {
    gradeFilter: "eq=contrast=1.05:brightness=0.01:saturation=0.95",
    captionAccent: "#4a90d9",
  },
  standard: {
    gradeFilter: "eq=contrast=1.12:brightness=0.02:saturation=1.25",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function resolveFont(): Promise<string> {
  for (const f of FONT_CANDIDATES) {
    try { await fs.access(f); return f.replace(/\\/g, "/"); } catch {}
  }
  return "";
}

function assTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function hexToAss(hex: string, alpha = 0): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const aa = Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
  return `&H${aa}${b.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${r.toString(16).padStart(2, "0").toUpperCase()}`;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "%%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .slice(0, 80);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) { current = word; continue; }
    if ((current + " " + word).length <= maxChars) current += " " + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Ken Burns filter ─────────────────────────────────────────────────────────
function buildKenBurnsFilter(motion: MotionType, durationSec: number): string {
  const totalFrames = Math.ceil(durationSec * FPS);
  const w = INTERMEDIATE_WIDTH;
  const h = INTERMEDIATE_HEIGHT;
  const SCALE = 1.10;
  const sw = Math.round(w * SCALE);
  const sh = Math.round(h * SCALE);
  const dx = sw - w;
  const dy = sh - h;
  const prog = `min(n,${totalFrames - 1})/${totalFrames - 1}`;

  switch (motion) {
    case "zoom-in": {
      const cW = `${sw}-${dx}*${prog}`, cH = `${sh}-${dy}*${prog}`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop='${cW}':'${cH}':'(${sw}-(${cW}))/2':'(${sh}-(${cH}))/2',scale=${w}:${h}`;
    }
    case "zoom-out": {
      const cW = `${w}+${dx}*${prog}`, cH = `${h}+${dy}*${prog}`;
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop='${cW}':'${cH}':'(${sw}-(${cW}))/2':'(${sh}-(${cH}))/2',scale=${w}:${h}`;
    }
    case "pan-right":
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:'${dx}*${prog}':${Math.floor(dy/2)}`;
    case "pan-left":
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:'${dx}*(1-${prog})':${Math.floor(dy/2)}`;
    case "pan-up":
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:${Math.floor(dx/2)}:'${dy}*${prog}'`;
    case "pan-down":
      return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:${Math.floor(dx/2)}:'${dy}*(1-${prog})'`;
  }
}

// ─── Render one cut with Ken Burns + theme color grade ────────────────────────
async function renderCut(
  clipPath: string,
  durationSec: number,
  motionType: MotionType,
  outPath: string,
  gradeFilter: string
): Promise<void> {
  const clipDuration = await ffprobe(clipPath);
  const needsLoop = clipDuration < durationSec;

  const fullFilter = `${buildKenBurnsFilter(motionType, durationSec)},${gradeFilter},format=yuv420p`;

  console.log(`[assembler] cut (${motionType}) ${path.basename(clipPath)} → ${path.basename(outPath)} (${durationSec.toFixed(2)}s)`);

  await ffmpeg([
    ...(needsLoop ? ["-stream_loop", "-1"] : []),
    "-i", clipPath,
    "-vf", fullFilter,
    "-t", String(durationSec),
    "-r", String(FPS),
    "-threads", String(THREADS),
    "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-pix_fmt", "yuv420p",
    "-an", "-y", outPath,
  ]);
}

// ─── Cut slicer ───────────────────────────────────────────────────────────────
function sliceCuts(audioDuration: number): number[] {
  if (audioDuration <= CUT_MAX_SEC) return [audioDuration];
  const cuts: number[] = [];
  let remaining = audioDuration;
  while (remaining > 0) {
    if (remaining <= CUT_MAX_SEC) { cuts.push(Math.max(remaining, 1.0)); break; }
    const wouldLeave = remaining - CUT_TARGET_SEC;
    if (wouldLeave > 0 && wouldLeave < CUT_MIN_SEC) { const h = remaining / 2; cuts.push(h, h); break; }
    cuts.push(CUT_TARGET_SEC);
    remaining -= CUT_TARGET_SEC;
  }
  return cuts;
}

// ─── Karaoke ASS captions ─────────────────────────────────────────────────────
async function generateAssKaraoke(
  sections: ScriptSection[],
  audioPaths: (string | null)[],
  assPath: string,
  accentHex: string
): Promise<void> {
  const primaryColor   = hexToAss(accentHex);
  const secondaryColor = "&H00AAAAAA";
  const outlineColor   = "&H00000000";
  const backColor      = "&HAA000000";

  const WORDS_PER_LINE = 4;
  let events = "";
  let timeOffset = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const audioPath = audioPaths[i];
    if (!audioPath || !section.narration.trim()) continue;

    const duration = await ffprobe(audioPath);
    if (duration <= 0) continue;

    const words = section.narration.trim().split(/\s+/);
    const charCounts = words.map(w => Math.max(w.length, 1));
    const totalChars = charCounts.reduce((a, b) => a + b, 0);
    const wordDurs = charCounts.map(c => (c / totalChars) * duration);

    let wordIdx = 0;
    let wordTimeAcc = 0;

    while (wordIdx < words.length) {
      const chunk = words.slice(wordIdx, wordIdx + WORDS_PER_LINE);
      const chunkDurs = wordDurs.slice(wordIdx, wordIdx + WORDS_PER_LINE);
      const chunkDur = chunkDurs.reduce((a, b) => a + b, 0);
      const lineStart = timeOffset + wordTimeAcc;
      const lineEnd = lineStart + chunkDur;

      const kText = chunk.map((word, wi) => {
        const cs = Math.max(Math.round(chunkDurs[wi] * 100), 1);
        return `{\\k${cs}}${word}`;
      }).join(" ");

      events += `Dialogue: 0,${assTime(lineStart)},${assTime(lineEnd)},Default,,0,0,0,,${kText}\n`;

      wordTimeAcc += chunkDur;
      wordIdx += WORDS_PER_LINE;
    }

    timeOffset += duration;
  }

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,52,${primaryColor},${secondaryColor},${outlineColor},${backColor},1,0,0,0,100,100,2,0,3,3,1,2,80,80,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}`;

  await fs.writeFile(assPath, ass, "utf8");
}

// ─── Drawtext overlay filters ──────────────────────────────────────────────────
function buildOverlayFilters(
  videoTitle: string,
  sectionTimings: SectionTiming[],
  accentHex: string,
  font: string
): string[] {
  const filters: string[] = [];
  const ff = font ? `fontfile='${font}':` : "";
  const accentRGB = `0x${accentHex.slice(1)}`;

  if (videoTitle.trim()) {
    const titleLine = escapeDrawtext(wrapText(videoTitle, 38)[0] ?? videoTitle.slice(0, 60));
    const alpha = `if(lt(t\\,0.5)\\,t/0.5\\,if(gt(t\\,3.0)\\,(3.5-t)/0.5\\,1))`;
    filters.push(
      `drawtext=${ff}text='${titleLine}':fontsize=60:fontcolor=white@1.0:` +
      `x=(w-tw)/2:y=h/2-th-24:` +
      `box=1:boxcolor=0x000000BB:boxborderw=30:` +
      `borderw=2:bordercolor=black@0.9:` +
      `alpha='${alpha}':enable='between(t\\,0\\,3.5)'`
    );
    filters.push(
      `drawbox=x=(iw-600)/2:y=ih/2+4:w=600:h=4:color=${accentRGB}:t=fill:` +
      `enable='between(t\\,0.4\\,3.5)'`
    );
  }

  for (const t of sectionTimings) {
    if (t.sectionType !== "stat" || !t.keyPoint) continue;
    const dur = t.endSec - t.startSec;
    if (dur < 1.0) continue;

    const showStart = t.startSec + 0.5;
    const showEnd = Math.min(t.startSec + 4.5, t.endSec - 0.3);
    if (showEnd <= showStart) continue;

    const lines = wrapText(t.keyPoint, 34).slice(0, 2);
    const alpha = `if(lt(t\\,${(showStart + 0.3).toFixed(2)})\\,(t-${showStart.toFixed(2)})/0.3\\,if(gt(t\\,${(showEnd - 0.3).toFixed(2)})\\,(${showEnd.toFixed(2)}-t)/0.3\\,1))`;

    const boxH = lines.length * 72 + 44;
    const boxW = 900;
    const boxX = (OUTPUT_WIDTH - boxW) / 2;
    const boxY = (OUTPUT_HEIGHT - boxH) / 2 - 30;
    filters.push(
      `drawbox=x=${boxX.toFixed(0)}:y=${boxY.toFixed(0)}:w=${boxW}:h=${boxH}:color=0x000000CC:t=fill:` +
      `enable='between(t\\,${showStart.toFixed(2)}\\,${showEnd.toFixed(2)})'`
    );
    filters.push(
      `drawbox=x=${boxX.toFixed(0)}:y=${boxY.toFixed(0)}:w=${boxW}:h=5:color=${accentRGB}:t=fill:` +
      `enable='between(t\\,${showStart.toFixed(2)}\\,${showEnd.toFixed(2)})'`
    );

    lines.forEach((line, li) => {
      const esc = escapeDrawtext(line);
      const yPos = (OUTPUT_HEIGHT / 2 - lines.length * 36 + li * 72 - 18).toFixed(0);
      filters.push(
        `drawtext=${ff}text='${esc}':fontsize=54:fontcolor=white@1.0:` +
        `x=(w-tw)/2:y=${yPos}:` +
        `borderw=3:bordercolor=black@0.9:` +
        `alpha='${alpha}':enable='between(t\\,${showStart.toFixed(2)}\\,${showEnd.toFixed(2)})'`
      );
    });
  }

  for (const t of sectionTimings) {
    if (t.sectionType !== "intro" && t.sectionType !== "outro") continue;
    const isIntro = t.sectionType === "intro";
    const showStart = isIntro ? Math.max(t.startSec, 4.0) : t.startSec + 0.3;
    const showEnd = Math.min(showStart + 3.5, t.endSec - 0.3);
    if (showEnd <= showStart) continue;

    const label = escapeDrawtext(isIntro ? "Introduction" : "Conclusion");
    const alpha = `if(lt(t\\,${(showStart + 0.4).toFixed(2)})\\,(t-${showStart.toFixed(2)})/0.4\\,if(gt(t\\,${(showEnd - 0.4).toFixed(2)})\\,(${showEnd.toFixed(2)}-t)/0.4\\,1))`;

    filters.push(
      `drawbox=x=72:y=${OUTPUT_HEIGHT - 138}:w=240:h=44:color=${accentRGB}CC:t=fill:` +
      `enable='between(t\\,${showStart.toFixed(2)}\\,${showEnd.toFixed(2)})'`
    );
    filters.push(
      `drawtext=${ff}text='${label}':fontsize=24:fontcolor=white@1.0:` +
      `x=90:y=${OUTPUT_HEIGHT - 128}:` +
      `borderw=1:bordercolor=black@0.6:` +
      `alpha='${alpha}':enable='between(t\\,${showStart.toFixed(2)}\\,${showEnd.toFixed(2)})'`
    );
  }

  return filters;
}

// ─── Concat demuxer (Windows & Linux path safe) ────────────────────────────────
async function concatClips(clipPaths: string[], outputPath: string): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No cuts to concat");
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }

  const listPath = outputPath + ".concat.txt";
  // Windows-safe forward slashes in concat manifest
  const lines = clipPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  await fs.writeFile(listPath, lines, "utf8");
  console.log(`[assembler] concat: ${clipPaths.length} clips → ${path.basename(outputPath)}`);

  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-fflags", "+genpts", "-y", outputPath]);
  await fs.unlink(listPath).catch(() => {});
}

// ─── xfade small batch ────────────────────────────────────────────────────────
async function xfadeSmallBatch(
  clipPaths: string[], clipDurations: number[], outputPath: string
): Promise<void> {
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }
  if (clipPaths.length > XFADE_BATCH) return concatClips(clipPaths, outputPath);

  const inputs: string[] = [];
  clipPaths.forEach(p => inputs.push("-i", p));
  let fg = "";
  let prev = "[0:v]";
  let t = 0;
  for (let i = 1; i < clipPaths.length; i++) {
    const out = i === clipPaths.length - 1 ? "[vout]" : `[v${i}]`;
    t += Math.max(clipDurations[i - 1] - TRANSITION_DURATION, 0.01);
    fg += `${prev}[${i}:v]xfade=transition=fade:duration=${TRANSITION_DURATION}:offset=${t.toFixed(4)}${out};`;
    prev = out;
  }

  await ffmpeg([
    ...inputs,
    "-filter_complex", fg.slice(0, -1),
    "-map", "[vout]",
    "-threads", String(THREADS), "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-pix_fmt", "yuv420p",
    "-r", String(FPS), "-an", "-y", outputPath,
  ]);
}

// ─── Chain all cuts with xfade section boundaries ────────────────────────────
async function chainXfadeTransitions(
  clipPaths: string[], clipDurations: number[], outputPath: string, sectionBoundaries: number[]
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("No cuts to chain");
  if (clipPaths.length === 1) { await fs.copyFile(clipPaths[0], outputPath); return; }

  const tmpDir = path.dirname(outputPath);
  const bounds = [0, ...sectionBoundaries, clipPaths.length];
  const sectionVids: string[] = [];
  const sectionDurs: number[] = [];

  for (let s = 0; s < bounds.length - 1; s++) {
    const sl = clipPaths.slice(bounds[s], bounds[s + 1]);
    const sd = clipDurations.slice(bounds[s], bounds[s + 1]);
    if (sl.length === 0) continue;
    const out = path.join(tmpDir, `section_joined_${s}.mp4`);
    await concatClips(sl, out);
    sectionVids.push(out);
    sectionDurs.push(sd.reduce((a, b) => a + b, 0));

    // Rolling cleanup: remove the raw cut clips for this section immediately to save gigabytes of space
    for (const p of sl) {
      await fs.unlink(p).catch(() => {});
    }
  }

  if (sectionVids.length === 1) {
    if (sectionVids[0] !== outputPath) {
      await fs.copyFile(sectionVids[0], outputPath);
      await fs.unlink(sectionVids[0]).catch(() => {});
    }
    return;
  }

  let cur = sectionVids, curD = sectionDurs, pass = 0;
  while (cur.length > 1) {
    const nxt: string[] = [], nD: number[] = [];
    for (let b = 0; b < cur.length; b += XFADE_BATCH) {
      const bc = cur.slice(b, b + XFADE_BATCH), bd = curD.slice(b, b + XFADE_BATCH);
      const bo = path.join(tmpDir, `xfade_p${pass}_b${b}.mp4`);
      await xfadeSmallBatch(bc, bd, bo);
      nxt.push(bo);
      nD.push(bd.reduce((a, d) => a + d, 0) - (bc.length - 1) * TRANSITION_DURATION);
    }
    // Delete intermediate files from the previous xfade pass
    for (const f of cur) {
      await fs.unlink(f).catch(() => {});
    }
    cur = nxt; curD = nD; pass++;
  }
  if (cur[0] !== outputPath) {
    await fs.copyFile(cur[0], outputPath);
    await fs.unlink(cur[0]).catch(() => {});
  }
}

// ─── Merge voiceover ──────────────────────────────────────────────────────────
async function mergeAudio(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 0) {
    await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "5", "-c:a", "aac", "-b:a", "128k", "-y", outputPath]);
    return;
  }
  if (audioPaths.length === 1) { await fs.copyFile(audioPaths[0], outputPath); return; }

  const inputs: string[] = [];
  audioPaths.forEach(p => inputs.push("-i", p));
  const fc = audioPaths.map((_, i) => `[${i}:a]`).join("") + `concat=n=${audioPaths.length}:v=0:a=1[a]`;
  await ffmpeg([...inputs, "-filter_complex", fc, "-map", "[a]", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-y", outputPath]);
}

// ─── Pass 1: upscale + burn ASS captions only ────────────────────────────────
async function upscaleAndBurnCaptions(
  videoPath: string,
  assPath: string | null,
  outputPath: string,
): Promise<void> {
  const upscale = `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:flags=bicubic`;

  let captionFilter = "";
  if (assPath) {
    try {
      await fs.access(assPath);
      const content = await fs.readFile(assPath, "utf8");
      if (content.includes("[Events]")) {
        // Windows-safe path escaping for ASS filter: C\:/path/to/file.ass
        const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
        captionFilter = `ass='${escaped}'`;
      }
    } catch {
      console.warn("[assembler] ASS file missing, skipping captions in pass 1");
    }
  }

  const vfParts = [upscale, "format=yuv420p"];
  if (captionFilter) vfParts.push(captionFilter);

  console.log(`[assembler] pass 1: upscale 720→1080 (bicubic) + karaoke=${!!captionFilter}`);

  await ffmpeg([
    "-i", videoPath,
    "-vf", vfParts.join(","),
    "-threads", "0",
    "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-pix_fmt", "yuv420p",
    "-an", "-y", outputPath,
  ]);
}

// ─── Pass 2: drawtext overlays + audio mix ────────────────────────────────────
async function overlayAndMixAudio(
  videoPath: string,
  voiceoverPath: string,
  bgmPath: string | null,
  outputPath: string,
  videoTitle: string,
  sectionTimings: SectionTiming[],
  accentHex: string,
): Promise<void> {
  const font = await resolveFont();
  const overlayFilters = buildOverlayFilters(videoTitle, sectionTimings, accentHex, font);

  console.log(`[assembler] pass 2: overlays=${overlayFilters.length}, theme accent=${accentHex}, bgm=${!!bgmPath}`);

  const encodeArgs = [
    "-threads", "0",
    "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
    "-pix_fmt", "yuv420p",
  ];
  const videoFilter = overlayFilters.length > 0 ? overlayFilters.join(",") : "copy";
  const videoArgs = overlayFilters.length > 0 ? ["-vf", videoFilter] : [];

  if (bgmPath) {
    const voDur = await ffprobe(voiceoverPath);
    const fadeStart = Math.max(voDur - BGM_FADE_OUT, 0);
    await ffmpeg([
      "-i", videoPath, "-i", voiceoverPath, "-stream_loop", "-1", "-i", bgmPath,
      "-filter_complex", [
        `[2:a]volume=${BGM_VOLUME},afade=t=in:st=0:d=${BGM_FADE_IN},afade=t=out:st=${fadeStart.toFixed(2)}:d=${BGM_FADE_OUT}[bgm]`,
        `[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[audio]`,
      ].join(";"),
      "-map", "0:v", "-map", "[audio]",
      ...videoArgs, ...encodeArgs,
      "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
      "-shortest", "-movflags", "+faststart", "-y", outputPath,
    ]);
  } else {
    await ffmpeg([
      "-i", videoPath, "-i", voiceoverPath,
      "-map", "0:v", "-map", "1:a",
      ...videoArgs, ...encodeArgs,
      "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
      "-shortest", "-movflags", "+faststart", "-y", outputPath,
    ]);
  }
}

// ─── Final mix: two-pass ─────────────────────────────────────────────────────
async function finalMixWithCaptions(
  videoPath: string,
  voiceoverPath: string,
  bgmPath: string | null,
  assPath: string | null,
  outputPath: string,
  videoTitle: string,
  sectionTimings: SectionTiming[],
  accentHex: string
): Promise<void> {
  const tmpDir = path.dirname(videoPath);
  const pass1Out = path.join(tmpDir, "pass1_captioned.mp4");

  await upscaleAndBurnCaptions(videoPath, assPath, pass1Out);
  // Free up intermediate transitioned video immediately
  await fs.unlink(videoPath).catch(() => {});

  await overlayAndMixAudio(
    pass1Out, voiceoverPath, bgmPath,
    outputPath, videoTitle, sectionTimings, accentHex
  );

  await fs.unlink(pass1Out).catch(() => {});
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────
async function extractThumbnail(videoPath: string, thumbPath: string): Promise<void> {
  await ffmpeg([
    "-ss", "5", "-i", videoPath, "-vframes", "1",
    "-vf", `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`, "-y", thumbPath,
  ]);
}

// ─── Black clip fallback ──────────────────────────────────────────────────────
async function makeBlackClip(outPath: string, durationSec: number): Promise<void> {
  await ffmpeg([
    "-f", "lavfi", "-i", `color=c=black:size=${INTERMEDIATE_WIDTH}x${INTERMEDIATE_HEIGHT}:rate=${FPS}`,
    "-t", String(durationSec),
    "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-an", "-y", outPath,
  ]);
}

// ─── Per-section clip resolver ────────────────────────────────────────────────
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
    const offset = (i * 4) % globalPool.length;
    const N = Math.min(6, globalPool.length);
    return Array.from({ length: N }, (_, k) => globalPool[(offset + k) % globalPool.length]);
  };
}

// ─── Step manifest ────────────────────────────────────────────────────────────
export const RENDER_STEPS: RenderStep[] = [
  { label: "Slicing sections into fast cuts",                      done: false },
  { label: "Pre-rendering cuts with cinematic color grade",        done: false },
  { label: "Merging voiceover audio tracks",                       done: false },
  { label: "Generating karaoke captions (ASS format)",             done: false },
  { label: "Chaining cuts with xfade transitions",                 done: false },
  { label: "Mixing audio + burning captions + overlays",           done: false },
  { label: "Generating thumbnail",                                 done: false },
];

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function assemble(
  videoId: string,
  videoTitle: string,
  sections: ScriptSection[],
  audioPaths: (string | null)[],
  footagePathsPerSection: (string[] | null)[],
  bgmPath: string | null,
  outputDir: string,
  onProgress: ProgressFn,
  theme?: string
): Promise<{ videoPath: string; thumbPath: string }> {
  const tmpDir = getTempDir(videoId);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const { gradeFilter, captionAccent } = resolveTheme(theme);
  console.log(`[assembler] theme="${theme ?? "standard"}" grade="${gradeFilter}" accent="${captionAccent}"`);

  const total = RENDER_STEPS.length;

  const globalPool: string[] = [];
  for (const paths of footagePathsPerSection) {
    if (paths) for (const p of paths) if (!globalPool.includes(p)) globalPool.push(p);
  }
  console.log(`[assembler] global clip pool: ${globalPool.length} unique clips`);

  const getSectionClips = makeSectionClipResolver(footagePathsPerSection, globalPool);

  // ── Step 1: Plan cuts ────────────────────────────────────────────────────
  await onProgress(0, total, RENDER_STEPS[0].label);

  type CutInfo = { clipPath: string; durationSec: number };
  const cutPlan: CutInfo[][] = [];
  const validAudio: (string | null)[] = [];
  const sectionTimings: SectionTiming[] = [];
  let runningTime = 0;

  for (let i = 0; i < sections.length; i++) {
    const ap = audioPaths[i];
    if (!ap) { cutPlan.push([]); validAudio.push(null); continue; }

    const dur = await ffprobe(ap);
    if (dur <= 0) { cutPlan.push([]); validAudio.push(null); continue; }

    validAudio.push(ap);
    sectionTimings.push({ startSec: runningTime, endSec: runningTime + dur, sectionType: sections[i].section_type, keyPoint: sections[i].key_point });
    runningTime += dur;

    const cuts = sliceCuts(dur);
    const sectionClips = getSectionClips(i);

    cutPlan.push(cuts.map((d, ci) => ({
      clipPath: sectionClips.length > 0 ? sectionClips[ci % sectionClips.length] : "",
      durationSec: d,
    })));
    console.log(`[assembler] section ${i} (${sections[i].section_type}): ${cuts.length} cuts from ${sectionClips.length} clips`);
  }

  console.log(`[assembler] ${sections.length} sections → ${cutPlan.reduce((s, c) => s + c.length, 0)} cuts, total ${runningTime.toFixed(1)}s`);

  // ── Step 2: Pre-render cuts ──────────────────────────────────────────────
  await onProgress(1, total, RENDER_STEPS[1].label);

  const renderedCuts: string[] = [];
  const renderedDurs: number[] = [];
  const audioForCuts: string[] = [];
  const sectionBounds: number[] = [];
  let motionIdx = 0;

  for (let i = 0; i < sections.length; i++) {
    const cuts = cutPlan[i];
    if (cuts.length === 0) continue;
    const ap = validAudio[i];
    if (!ap) continue;

    if (renderedCuts.length > 0) sectionBounds.push(renderedCuts.length);

    for (let ci = 0; ci < cuts.length; ci++) {
      const { clipPath, durationSec } = cuts[ci];
      const motion = MOTION_CYCLE[motionIdx++ % MOTION_CYCLE.length];
      const outPath = path.join(tmpDir, `cut_${i}_${ci}.mp4`);

      if (!clipPath) {
        await makeBlackClip(outPath, durationSec);
        renderedCuts.push(outPath);
        renderedDurs.push(durationSec);
        continue;
      }

      try {
        await renderCut(clipPath, durationSec, motion, outPath, gradeFilter);
        renderedCuts.push(outPath);
        renderedDurs.push(durationSec);
      } catch (err) {
        console.error(`[assembler] Ken Burns failed ${i}/${ci}:`, (err as Error).message);
        const fp = path.join(tmpDir, `scaled_${i}_${ci}.mp4`);
        try {
          const raw = await ffprobe(clipPath);
          await ffmpeg([
            ...(raw < durationSec ? ["-stream_loop", "-1"] : []),
            "-i", clipPath,
            "-vf", `scale=${INTERMEDIATE_WIDTH}:${INTERMEDIATE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${INTERMEDIATE_WIDTH}:${INTERMEDIATE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
            "-t", String(durationSec), "-r", String(FPS),
            "-threads", String(THREADS), "-c:v", "libx264", "-crf", "26", "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-an", "-y", fp,
          ]);
          renderedCuts.push(fp);
          renderedDurs.push(durationSec);
        } catch {
          const bp = path.join(tmpDir, `black_${i}_${ci}.mp4`);
          await makeBlackClip(bp, durationSec);
          renderedCuts.push(bp);
          renderedDurs.push(durationSec);
        }
      }
    }

    audioForCuts.push(ap);
  }

  if (renderedCuts.length === 0) throw new Error("No cuts rendered — check audio generation.");
  console.log(`[assembler] ${renderedCuts.length} cuts rendered, ${sectionBounds.length} boundaries`);

  // ── Step 3: Merge audio ──────────────────────────────────────────────────
  await onProgress(2, total, RENDER_STEPS[2].label);
  const mergedAudio = path.join(tmpDir, "voiceover_merged.aac");
  await mergeAudio(audioForCuts, mergedAudio);

  // ── Step 4: Karaoke ASS captions ────────────────────────────────────────
  await onProgress(3, total, RENDER_STEPS[3].label);
  const assPath = path.join(tmpDir, "karaoke.ass");
  let assExists = false;
  try {
    await generateAssKaraoke(sections, audioPaths, assPath, captionAccent);
    assExists = (await fs.stat(assPath)).size > 0;
    console.log(`[assembler] ASS karaoke written (${captionAccent})`);
  } catch (err) {
    console.warn("[assembler] ASS generation failed:", err);
  }

  // ── Step 5: Chain cuts with xfade ────────────────────────────────────────
  await onProgress(4, total, RENDER_STEPS[4].label);
  const transitioned = path.join(tmpDir, "transitioned.mp4");
  await chainXfadeTransitions(renderedCuts, renderedDurs, transitioned, sectionBounds);

  // ── Step 6: Final mix (two-pass) ─────────────────────────────────────────
  await onProgress(5, total, RENDER_STEPS[5].label);
  const finalMp4 = path.join(outputDir, "final.mp4");
  await finalMixWithCaptions(
    transitioned, mergedAudio, bgmPath,
    assExists ? assPath : null,
    finalMp4, videoTitle, sectionTimings, captionAccent
  );

  // ── Step 7: Thumbnail ────────────────────────────────────────────────────
  await onProgress(6, total, RENDER_STEPS[6].label);
  const thumbPath = path.join(outputDir, "thumb.jpg");
  await extractThumbnail(finalMp4, thumbPath);

  // Clean intermediate artifacts from tmpDir
  await fs.unlink(mergedAudio).catch(() => {});
  if (assExists) await fs.unlink(assPath).catch(() => {});

  return { videoPath: finalMp4, thumbPath };
}

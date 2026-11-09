import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { ffmpeg, getExactDuration, getFFmpegCapabilities } from "./ffmpeg.js";
import { getTempDir } from "./tempDir.js";
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const FPS = 30;
const CRF = 21;
const PRESET = "veryfast";
const THREADS = Math.min(os.cpus()?.length || 2, 2);
const CUT_TARGET_SEC = 3.4;
const CUT_MIN_SEC = 2.4;
const CUT_MAX_SEC = 4;
const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf"
];
async function resolveFont() {
  for (const f of FONT_CANDIDATES) {
    try {
      await fs.access(f);
      return f.replace(/\\/g, "/");
    } catch {
    }
  }
  return "";
}
const MOTION_CYCLE = [
  "zoom-in",
  "pan-right",
  "zoom-out",
  "pan-left",
  "zoom-in",
  "pan-up",
  "zoom-out",
  "pan-down"
];
const THEME_CONFIGS = {
  crime: {
    gradeFilter: "eq=contrast=1.18:brightness=-0.04:saturation=0.82",
    captionAccent: "#ef4444"
  },
  history: {
    gradeFilter: "eq=contrast=1.12:brightness=-0.02:saturation=0.80",
    captionAccent: "#eab308"
  },
  modern: {
    gradeFilter: "eq=contrast=1.14:brightness=-0.03:saturation=0.85",
    captionAccent: "#8b5cf6"
  },
  minimalist: {
    gradeFilter: "eq=contrast=1.08:brightness=-0.01:saturation=0.88",
    captionAccent: "#38bdf8"
  },
  standard: {
    gradeFilter: "eq=contrast=1.12:brightness=-0.02:saturation=0.85",
    captionAccent: "#22c55e"
  }
};
function resolveTheme(theme) {
  return THEME_CONFIGS[theme ?? ""] ?? THEME_CONFIGS.standard;
}
function assTime(seconds) {
  const totalCs = Math.max(0, Math.floor(seconds * 100));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
function hexToAss(hex, alpha = 0) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 255;
  const g = parseInt(clean.slice(2, 4), 16) || 255;
  const b = parseInt(clean.slice(4, 6), 16) || 255;
  const aa = Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
  return `&H${aa}${b.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${r.toString(16).padStart(2, "0").toUpperCase()}`;
}
function escapeAss(text) {
  return text.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}").replace(/[\r\n]+/g, " ").trim();
}
function escapeFilterPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
}
function buildKenBurnsFilter(motion, durationSec) {
  const totalFrames = Math.max(Math.ceil(durationSec * FPS), 2);
  const denom = totalFrames - 1;
  const prog = `(min(n\\,${denom})/${denom})`;
  switch (motion) {
    case "zoom-in":
      return `scale=2112:1188:force_original_aspect_ratio=increase,crop=2112:1188,crop=w=2112-192*${prog}:h=1188-108*${prog}:x=96*${prog}:y=54*${prog},scale=1920:1080`;
    case "zoom-out":
      return `scale=2112:1188:force_original_aspect_ratio=increase,crop=2112:1188,crop=w=1920+192*${prog}:h=1080+108*${prog}:x=96*(1-${prog}):y=54*(1-${prog}),scale=1920:1080`;
    case "pan-right":
      return `scale=2112:1080:force_original_aspect_ratio=increase,crop=1920:1080:x=192*${prog}:y=0`;
    case "pan-left":
      return `scale=2112:1080:force_original_aspect_ratio=increase,crop=1920:1080:x=192*(1-${prog}):y=0`;
    case "pan-down":
      return `scale=1920:1200:force_original_aspect_ratio=increase,crop=1920:1080:x=0:y=120*${prog}`;
    case "pan-up":
      return `scale=1920:1200:force_original_aspect_ratio=increase,crop=1920:1080:x=0:y=120*(1-${prog})`;
  }
}
async function renderCut(clipPath, durationSec, motionType, outPath, gradeFilter, isSectionStart = false, isSectionEnd = false, options, startOffsetSec = 0) {
  const caps = getFFmpegCapabilities();
  let transitionFilter = "";
  if (caps.filters.has("fade")) {
    if (isSectionStart && durationSec > 1.2) {
      transitionFilter = ",fade=t=in:st=0:d=0.30";
    } else if (isSectionEnd && durationSec > 1.2) {
      transitionFilter = `,fade=t=out:st=${(durationSec - 0.3).toFixed(2)}:d=0.30`;
    }
  }
  const gradeStr = caps.filters.has("eq") && gradeFilter ? `,${gradeFilter}` : "";
  const grainFilter = caps.filters.has("noise") ? ",noise=alls=8:allf=t+u" : "";
  const vignetteFilter = caps.filters.has("vignette") ? ",vignette=PI/4.5" : "";
  const letterboxFilter = caps.filters.has("drawbox") ? ",drawbox=x=0:y=0:w=1920:h=131:color=black@1.0:t=fill,drawbox=x=0:y=949:w=1920:h=131:color=black@1.0:t=fill" : "";
  const fullFilter = `${buildKenBurnsFilter(motionType, durationSec)}${gradeStr}${grainFilter}${vignetteFilter}${letterboxFilter}${transitionFilter},format=yuv420p`;
  const isImage = /\.(jpe?g|png|webp|avif)$/i.test(clipPath);
  const offsetArgs = !isImage && startOffsetSec > 0 ? ["-ss", startOffsetSec.toFixed(2)] : [];
  const inputArgs = isImage ? ["-loop", "1"] : ["-stream_loop", "-1"];
  const cutOpts = { ...options, timeoutMs: 12e4 };
  await ffmpeg([
    ...offsetArgs,
    ...inputArgs,
    "-i",
    clipPath,
    "-vf",
    fullFilter,
    "-t",
    durationSec.toFixed(3),
    "-r",
    String(FPS),
    "-threads",
    String(THREADS),
    "-c:v",
    "libx264",
    "-crf",
    "20",
    "-preset",
    PRESET,
    "-pix_fmt",
    "yuv420p",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-video_track_timescale",
    "30000",
    "-an",
    "-y",
    outPath
  ], cutOpts);
}
async function makeEditorialGraphicClip(outPath, durationSec, options) {
  const caps = getFFmpegCapabilities();
  const filter = caps.filters.has("gradients") ? "gradients=s=1920x1080:c0=0x0a101d:c1=0x1e1b4b:x0=0:y0=0:x1=1920:y1=1080:rate=30,noise=alls=10:allf=t+u,vignette=PI/4,drawbox=x=0:y=0:w=1920:h=131:color=black@1.0:t=fill,drawbox=x=0:y=949:w=1920:h=131:color=black@1.0:t=fill,format=yuv420p" : "color=c=0x0f172a:size=1920x1080:rate=30,noise=alls=10:allf=t+u,vignette=PI/4,drawbox=x=0:y=0:w=1920:h=131:color=black@1.0:t=fill,drawbox=x=0:y=949:w=1920:h=131:color=black@1.0:t=fill,format=yuv420p";
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    filter,
    "-t",
    durationSec.toFixed(3),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-crf",
    String(CRF),
    "-preset",
    PRESET,
    "-pix_fmt",
    "yuv420p",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-video_track_timescale",
    "30000",
    "-an",
    "-y",
    outPath
  ], options);
}
async function makeDarkSceneClip(outPath, durationSec, options) {
  const caps = getFFmpegCapabilities();
  const lavfiSrc = caps.filters.has("gradients") ? `gradients=s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:c0=0x1e1b4b:c1=0x312e81:rate=${FPS}` : `color=c=0x181824:size=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:rate=${FPS}`;
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    lavfiSrc,
    "-t",
    durationSec.toFixed(3),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-crf",
    String(CRF),
    "-preset",
    PRESET,
    "-pix_fmt",
    "yuv420p",
    "-g",
    "30",
    "-keyint_min",
    "30",
    "-video_track_timescale",
    "30000",
    "-an",
    "-y",
    outPath
  ], options);
}
function sliceCuts(audioDuration, numClips = 3) {
  const CUT_TARGET_SEC2 = 4.5;
  const CUT_MAX_SEC2 = 5.8;
  if (audioDuration <= CUT_MAX_SEC2) return [audioDuration];
  const count = Math.max(2, Math.round(audioDuration / CUT_TARGET_SEC2));
  const cutDur = audioDuration / count;
  return new Array(count).fill(cutDur);
}
function sanitizeDisplayTitle(raw) {
  let clean = raw.replace(/^(?:create|make|generate|produce)\s+(?:a\s+)?(?:cinematic\s+|documentary\s+|youtube\s+|short\s+|long\s+)*(?:video\s+(?:about\s+|on\s+)?|documentary\s+(?:about\s+|on\s+)?)/i, "").replace(/^(?:subtitle\s*:\s*|title\s*:\s*)/i, "").trim();
  const colonIdx = clean.indexOf(":");
  if (colonIdx > 10 && clean.length > 50) {
    clean = clean.slice(0, colonIdx).trim();
  }
  return clean || raw;
}
async function generateAssKaraoke(sections, sectionTimings, audioPaths, assPath, accentHex, includeOverlayFallbacks = true, videoTitle = "") {
  const accentColor = hexToAss(accentHex, 0);
  const white = "&H00FFFFFF";
  const gray = "&H00D0D0D0";
  const black = "&H00000000";
  const shadowBox = "&HB0000000";
  const cardBox = "&HD810141C";
  let events = "";
  if (includeOverlayFallbacks) {
    if (videoTitle.trim()) {
      const displayTitle = sanitizeDisplayTitle(videoTitle);
      const cleanTitle = escapeAss(displayTitle.length > 50 ? displayTitle.slice(0, 48) + "..." : displayTitle);
      events += `Dialogue: 4,0:00:00.30,0:00:04.50,TitleBadge,,0,0,0,,{\\fad(300,400)}\u2501 DOCUMENTARY INVESTIGATION \u2501
`;
      events += `Dialogue: 3,0:00:00.50,0:00:04.50,TitleCard,,0,0,0,,{\\fad(400,400)}${cleanTitle}
`;
    }
    for (const t of sectionTimings) {
      const dur = t.endSec - t.startSec;
      if (dur < 1.2) continue;
      if (t.statNumber || (t.sectionType === "stat" || t.keyPoint) && t.keyPoint) {
        const showStart = t.startSec + 0.6;
        const showEnd = Math.min(t.startSec + 4.8, t.endSec - 0.3);
        if (showEnd > showStart + 1) {
          if (t.statNumber) {
            const sub = t.statLabel || t.keyPoint || "";
            events += `Dialogue: 2,${assTime(showStart)},${assTime(showEnd)},StatCard,,0,0,0,,{\\fad(200,200)}\u25C6 ${escapeAss(t.statNumber)}${sub ? `\\N{\\fs22\\c&HCCCCCC&}${escapeAss(sub)}` : ""}
`;
          } else {
            events += `Dialogue: 2,${assTime(showStart)},${assTime(showEnd)},StatCard,,0,0,0,,{\\fad(200,200)}\u25C6 ${escapeAss(t.keyPoint)}
`;
          }
        }
      }
      if (t.documentHeadline) {
        const showStart = t.startSec + 0.5;
        const showEnd = Math.min(t.startSec + 4.5, t.endSec - 0.3);
        if (showEnd > showStart + 1) {
          events += `Dialogue: 2,${assTime(showStart)},${assTime(showEnd)},StatCard,,0,0,0,,{\\fad(200,200)}[ ${escapeAss(t.documentHeadline.toUpperCase())} ]${t.highlightedQuote ? `\\N{\\fs24\\c&HFFFFFF&}"${escapeAss(t.highlightedQuote)}"` : ""}
`;
        }
      }
      if (t.chapterTitle) {
        const showStart = t.startSec + 0.1;
        const showEnd = Math.min(t.startSec + 2.8, t.endSec - 0.2);
        if (showEnd > showStart + 0.8) {
          events += `Dialogue: 3,${assTime(showStart)},${assTime(showEnd)},ChapterCard,,0,0,0,,{\\fad(400,400)}\u2501 ${escapeAss(t.chapterTitle.toUpperCase())} \u2501
`;
          events += `Dialogue: 1,${assTime(showStart + 0.2)},${assTime(Math.min(showStart + 4.5, t.endSec))},DossierTag,,0,0,0,,{\\fad(400,400)}[ CASE ARCHIVE // FORENSIC RECON ]
`;
        }
      }
      if (t.locationStamp) {
        const showStart = t.startSec + 0.4;
        const showEnd = Math.min(t.startSec + 4.8, t.endSec - 0.3);
        if (showEnd > showStart + 1) {
          events += `Dialogue: 2,${assTime(showStart)},${assTime(showEnd)},LocationBadge,,0,0,0,,{\\fad(300,300)}${escapeAss(t.locationStamp)}
`;
        }
      }
      if (t.sectionType === "intro" || t.sectionType === "outro") {
        const isIntro = t.sectionType === "intro";
        const showStart = isIntro ? Math.max(t.startSec + 4.5, 4.5) : t.startSec + 0.4;
        const showEnd = Math.min(showStart + 3.8, t.endSec - 0.3);
        if (showEnd > showStart + 1) {
          const badgeLabel = isIntro ? "PROLOGUE" : "CONCLUSION";
          events += `Dialogue: 2,${assTime(showStart)},${assTime(showEnd)},ChapterTag,,0,0,0,,{\\fad(300,300)}[ ${badgeLabel} ]
`;
        }
      }
    }
  }
  const WORDS_PER_LINE = 3;
  let timeOffset = 0;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const audioPath = audioPaths[i];
    if (!audioPath || !section.narration.trim()) continue;
    const duration = await getExactDuration(audioPath);
    if (duration <= 0) continue;
    const words = section.narration.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const charCounts = words.map((w) => Math.max(w.length, 1) + (/[,.!?;:]$/.test(w) ? 4 : 0));
    const totalChars = charCounts.reduce((a, b) => a + b, 0);
    const wordDurs = charCounts.map((c) => c / totalChars * duration);
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
        return `{\\k${cs}}${escapeAss(word)}`;
      }).join(" ");
      events += `Dialogue: 1,${assTime(lineStart)},${assTime(lineEnd)},Default,,0,0,0,,${kText}
`;
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
Style: Default,DejaVu Sans,44,${white},${accentColor},${black},${shadowBox},1,0,0,0,100,100,1,0,1,3.2,1.2,2,100,100,150,1
Style: TitleBadge,DejaVu Sans,24,${accentColor},${white},${black},${shadowBox},1,0,0,0,100,100,3,0,3,2,2,8,80,80,85,1
Style: TitleCard,DejaVu Sans,44,${white},${white},${black},${shadowBox},1,0,0,0,100,100,1,0,3,3,3,8,80,80,135,1
Style: StatCard,DejaVu Sans,38,${white},${white},${black},${cardBox},1,0,0,0,100,100,1,0,3,3,3,8,120,120,80,1
Style: ChapterTag,DejaVu Sans,24,${accentColor},${white},${black},${cardBox},1,0,0,0,100,100,2,0,3,2,2,7,80,80,60,1
Style: ChapterCard,DejaVu Sans,44,${accentColor},${white},${black},${cardBox},1,0,0,0,100,100,3,0,3,3,3,5,80,80,0,1
Style: LocationBadge,DejaVu Sans,22,${white},${white},${black},${shadowBox},1,0,0,0,100,100,2,0,3,2,2,7,100,100,145,1
Style: DossierTag,DejaVu Sans,18,${accentColor},${white},${black},${shadowBox},1,0,0,0,100,100,2,0,3,1.5,1.5,9,100,100,145,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}`;
  await fs.writeFile(assPath, assContent, "utf8");
}
async function joinAllCuts(clipPaths, outputPath, options) {
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
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-fflags",
      "+genpts",
      "-avoid_negative_ts",
      "make_zero",
      "-y",
      outputPath
    ], options);
  } catch (err) {
    if (options?.signal?.aborted) throw err;
    console.warn(`[assembler] Fast concat failed (${err.message}). Retrying with re-encode concat fallback...`);
    await ffmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-crf",
      String(CRF),
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      "-an",
      "-y",
      outputPath
    ], options);
  }
  await fs.unlink(listPath).catch(() => {
  });
  console.log(`[assembler] Cleaning up ${clipPaths.length} intermediate cut files to free disk space`);
  for (const p of clipPaths) {
    fs.unlink(p).catch(() => {
    });
  }
}
async function mergeAudio(audioPaths, outputPath, options) {
  if (audioPaths.length === 0) {
    await ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-t",
      "5",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-y",
      outputPath
    ], options);
    return;
  }
  if (audioPaths.length === 1) {
    await ffmpeg([
      "-i",
      audioPaths[0],
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-y",
      outputPath
    ], options);
    return;
  }
  const inputs = [];
  const formatFilters = [];
  const concatInputs = [];
  for (let i = 0; i < audioPaths.length; i++) {
    const isLastSection = i === audioPaths.length - 1;
    const isChapterBreak = (i + 1) % 4 === 0;
    const pauseDur = isLastSection ? 0.4 : isChapterBreak ? 1.4 : 0.85;
    inputs.push("-i", audioPaths[i]);
    formatFilters.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad=pad_dur=${pauseDur.toFixed(2)}[a${i}]`);
    concatInputs.push(`[a${i}]`);
  }
  const fc = `${formatFilters.join(";")};${concatInputs.join("")}concat=n=${audioPaths.length}:v=0:a=1[a]`;
  await ffmpeg([
    ...inputs,
    "-filter_complex",
    fc,
    "-map",
    "[a]",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-y",
    outputPath
  ], options);
}
async function buildCompositeSfxTrack(sections, sectionTimings, totalDuration, outPath, options) {
  const sfxDir = path.join(__dirname, "..", "..", "assets", "sfx");
  const sfxInputs = [];
  const filterChains = [];
  let inputIndex = 0;
  for (let i = 0; i < sectionTimings.length; i++) {
    const timing = sectionTimings[i];
    const sec = sections[i] || {};
    let sfxName = "whoosh.wav";
    if (sec.visual_type === "STAT_SLAM") sfxName = "braam.wav";
    else if (sec.visual_type === "EVIDENCE_CARD") sfxName = "paper.wav";
    else if (sec.visual_type === "ARCHIVAL_PHOTO") sfxName = "shutter.wav";
    else if (sec.sfx_cue && await fs.stat(path.join(sfxDir, `${sec.sfx_cue}.wav`)).catch(() => null)) {
      sfxName = `${sec.sfx_cue}.wav`;
    } else if (i === 0) {
      sfxName = "whoosh.wav";
    } else {
      continue;
    }
    const sfxFile = path.join(sfxDir, sfxName);
    const fileStat = await fs.stat(sfxFile).catch(() => null);
    if (!fileStat) continue;
    const delayMs = Math.max(0, Math.round(timing.startSec * 1e3));
    sfxInputs.push("-i", sfxFile);
    filterChains.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=0.7[sfx${inputIndex}]`);
    inputIndex++;
  }
  if (inputIndex === 0) return false;
  const mixInputs = Array.from({ length: inputIndex }, (_, k) => `[sfx${k}]`).join("");
  const complexFilter = `${filterChains.join(";")};${mixInputs}amix=inputs=${inputIndex}:dropout_transition=2,volume=1.0[sfxout]`;
  try {
    await ffmpeg([
      ...sfxInputs,
      "-filter_complex",
      complexFilter,
      "-map",
      "[sfxout]",
      "-t",
      totalDuration.toFixed(3),
      "-ar",
      "44100",
      "-ac",
      "2",
      "-y",
      outPath
    ], options);
    return true;
  } catch (err) {
    console.warn(`[assembler] SFX composition failed (${err?.message}). Continuing without SFX.`);
    return false;
  }
}
async function finalProductionMix(videoPath, voiceoverPath, bgmPath, sfxPath, assPath, outputPath, videoTitle, sectionTimings, accentHex, options) {
  const hasBgm = bgmPath && (await fs.stat(bgmPath).catch(() => null))?.size;
  const hasSfx = sfxPath && (await fs.stat(sfxPath).catch(() => null))?.size;
  const hasAss = assPath && (await fs.stat(assPath).catch(() => null))?.size;
  const voDur = await getExactDuration(voiceoverPath).catch(() => 600);
  const caps = getFFmpegCapabilities();
  const broadcastVoiceChain = caps.hasLoudnorm ? ",highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.2,acompressor=threshold=-18dB:ratio=3.5:attack=5:release=60,loudnorm=I=-14:TP=-1.5:LRA=11" : ",highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.2";
  const partOutput = outputPath + ".part.mp4";
  await fs.unlink(partOutput).catch(() => {
  });
  const masteredAudio = outputPath + ".audio.aac";
  await fs.unlink(masteredAudio).catch(() => {
  });
  try {
    if (hasBgm && bgmPath && hasSfx && sfxPath) {
      const fadeOutStart = Math.max(voDur - 2.5, 0);
      console.log(`[assembler] Mastering voiceover + BGM + SFX stems (duration: ${voDur.toFixed(1)}s)...`);
      const hasDucking = caps.filters.has("sidechaincompress");
      const musicVolume = hasDucking ? "0.22" : "0.09";
      const mixFilters = hasDucking ? [
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.0[bgm]`,
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.05[vo]`,
        `[2:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.85[sfx]`,
        `[bgm][vo]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[ducked]`,
        `[vo][ducked][sfx]amix=inputs=3:duration=first:dropout_transition=2${broadcastVoiceChain}[audio]`
      ] : [
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.0[bgm]`,
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.05[vo]`,
        `[2:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.85[sfx]`,
        `[vo][bgm][sfx]amix=inputs=3:duration=first:dropout_transition=2${broadcastVoiceChain}[audio]`
      ];
      await ffmpeg([
        "-i",
        voiceoverPath,
        "-stream_loop",
        "-1",
        "-i",
        bgmPath,
        "-i",
        sfxPath,
        "-filter_complex",
        mixFilters.join(";"),
        "-map",
        "[audio]",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        "-t",
        voDur.toFixed(3),
        "-y",
        masteredAudio
      ], options);
    } else if (hasBgm && bgmPath) {
      const fadeOutStart = Math.max(voDur - 2.5, 0);
      console.log(`[assembler] Mastering voiceover + background music (duration: ${voDur.toFixed(1)}s)...`);
      const hasDucking = caps.filters.has("sidechaincompress");
      const musicVolume = hasDucking ? "0.24" : "0.10";
      const mixFilters = hasDucking ? [
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.0[bgm]`,
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.05[vo]`,
        `[bgm][vo]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[ducked]`,
        `[vo][ducked]amix=inputs=2:duration=first:dropout_transition=2${broadcastVoiceChain}[audio]`
      ] : [
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.0[bgm]`,
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.05[vo]`,
        `[vo][bgm]amix=inputs=2:duration=first:dropout_transition=2${broadcastVoiceChain}[audio]`
      ];
      await ffmpeg([
        "-i",
        voiceoverPath,
        "-stream_loop",
        "-1",
        "-i",
        bgmPath,
        "-filter_complex",
        mixFilters.join(";"),
        "-map",
        "[audio]",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        "-t",
        voDur.toFixed(3),
        "-y",
        masteredAudio
      ], options);
    } else if (hasSfx && sfxPath) {
      console.log(`[assembler] Mastering voiceover + SFX stems (duration: ${voDur.toFixed(1)}s)...`);
      const mixFilters = [
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.05[vo]`,
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.85[sfx]`,
        `[vo][sfx]amix=inputs=2:duration=first:dropout_transition=2${broadcastVoiceChain}[audio]`
      ];
      await ffmpeg([
        "-i",
        voiceoverPath,
        "-i",
        sfxPath,
        "-filter_complex",
        mixFilters.join(";"),
        "-map",
        "[audio]",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        "-t",
        voDur.toFixed(3),
        "-y",
        masteredAudio
      ], options);
    } else {
      console.log(`[assembler] Direct voiceover mastering (duration: ${voDur.toFixed(1)}s)...`);
      await ffmpeg([
        "-i",
        voiceoverPath,
        ...broadcastVoiceChain ? ["-af", broadcastVoiceChain.slice(1)] : [],
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        "-t",
        voDur.toFixed(3),
        "-y",
        masteredAudio
      ], options);
    }
  } catch (audioErr) {
    console.warn(`[assembler] Audio mixing failed (${audioErr.message}). Falling back to direct voiceover...`);
    await ffmpeg([
      "-i",
      voiceoverPath,
      ...broadcastVoiceChain ? ["-af", broadcastVoiceChain.slice(1)] : [],
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-t",
      voDur.toFixed(3),
      "-y",
      masteredAudio
    ], options);
  }
  const canBurnAss = Boolean(caps.hasAss && hasAss && assPath);
  if (canBurnAss) {
    try {
      console.log("[assembler] Burning broadcast ASS subtitles into 1080p timeline...");
      await ffmpeg([
        "-i",
        videoPath,
        "-i",
        masteredAudio,
        "-vf",
        `ass='${escapeFilterPath(assPath)}',format=yuv420p`,
        "-c:v",
        "libx264",
        "-crf",
        String(CRF),
        "-preset",
        "veryfast",
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-c:a",
        "copy",
        "-t",
        voDur.toFixed(3),
        "-movflags",
        "+faststart",
        "-y",
        partOutput
      ], { ...options, timeoutMs: 3e5 });
      await fs.rename(partOutput, outputPath);
      await fs.unlink(masteredAudio).catch(() => {
      });
      console.log("[assembler] Tier 1 production mix (burned ASS subtitles) successful");
      return;
    } catch (burnErr) {
      await fs.unlink(partOutput).catch(() => {
      });
      if (options?.signal?.aborted || burnErr?.message?.includes("cancelled") || burnErr?.message?.includes("aborted")) {
        throw burnErr;
      }
      console.warn(`[assembler] Burned ASS pass skipped (${burnErr.message}). Switching to instant lossless stream mux...`);
    }
  }
  console.log("[assembler] Executing instant lossless stream mux (preserving 1080p cuts & mastered audio)...");
  await ffmpeg([
    "-i",
    videoPath,
    "-i",
    masteredAudio,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-t",
    voDur.toFixed(3),
    "-movflags",
    "+faststart",
    "-y",
    partOutput
  ], options);
  await fs.rename(partOutput, outputPath);
  await fs.unlink(masteredAudio).catch(() => {
  });
  console.log("[assembler] Final production mix completed successfully!");
}
async function extractThumbnail(videoPath, thumbPath, options) {
  const dur = await getExactDuration(videoPath);
  const seekSec = Math.min(3, Math.max(dur / 2, 0.5));
  await extractThumbnailAt(videoPath, thumbPath, seekSec, options);
}
async function extractThumbnailAt(videoPath, thumbPath, seekSec, options) {
  await ffmpeg([
    "-ss",
    Math.max(0.5, seekSec).toFixed(2),
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-vf",
    `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
    "-y",
    thumbPath
  ], options);
}
async function createVerticalShort(videoPath, outputPath, options) {
  const duration = await getExactDuration(videoPath);
  if (duration < 8) return;
  const shortDuration = Math.min(45, duration);
  await ffmpeg([
    "-ss",
    "0",
    "-i",
    videoPath,
    "-t",
    shortDuration.toFixed(3),
    "-vf",
    "crop=608:1080:(iw-608)/2:0,scale=1080:1920:flags=lanczos,format=yuv420p",
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-crf",
    "21",
    "-preset",
    PRESET,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    "-y",
    outputPath
  ], { ...options, timeoutMs: 3e5 });
}
const RENDER_STEPS = [
  { label: "Slicing sections into fast cuts", done: false },
  { label: "Rendering 1080p cuts with cinematic color grade", done: false },
  { label: "Merging voiceover audio tracks", done: false },
  { label: "Generating broadcast subtitles and graphics (ASS)", done: false },
  { label: "Seamlessly joining video timeline", done: false },
  { label: "Mastering audio & rendering final 1080p video", done: false },
  { label: "Extracting high-resolution thumbnail", done: false }
];
function makeSectionClipResolver(footagePathsPerSection, globalPool) {
  return (i) => {
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
    const offset = i * 3 % globalPool.length;
    const count = Math.min(6, globalPool.length);
    return Array.from({ length: count }, (_, k) => globalPool[(offset + k) % globalPool.length]);
  };
}
async function assemble(videoId, videoTitle, sections, audioPaths, footagePathsPerSection, bgmPath, outputDir, onProgress, theme, signal) {
  const tmpDir = getTempDir(videoId);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  const opts = { videoId, signal };
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  const { gradeFilter, captionAccent } = resolveTheme(theme);
  const caps = getFFmpegCapabilities();
  console.log(`[assembler] Starting assemble: theme="${theme ?? "standard"}" drawtext=${caps.hasDrawtext}`);
  const total = RENDER_STEPS.length;
  const globalPool = [];
  for (const paths of footagePathsPerSection) {
    if (paths) {
      for (const p of paths) {
        if (!globalPool.includes(p)) globalPool.push(p);
      }
    }
  }
  console.log(`[assembler] Global pool has ${globalPool.length} clips`);
  const getSectionClips = makeSectionClipResolver(footagePathsPerSection, globalPool);
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(0, total, RENDER_STEPS[0].label);
  const cutPlan = [];
  const validAudio = [];
  const sectionTimings = [];
  let runningTime = 0;
  for (let i = 0; i < sections.length; i++) {
    if (signal?.aborted) throw new Error("Assembly cancelled by user");
    const ap = audioPaths[i];
    if (!ap) {
      cutPlan.push([]);
      continue;
    }
    const dur = await getExactDuration(ap);
    if (dur <= 0) {
      cutPlan.push([]);
      continue;
    }
    validAudio.push(ap);
    const isLastSection = i === sections.length - 1;
    const isChapterBreak = (i + 1) % 4 === 0;
    const pauseDur = isLastSection ? 0.4 : isChapterBreak ? 1.4 : 0.85;
    const totalSlot = dur + pauseDur;
    sectionTimings.push({
      startSec: runningTime,
      endSec: runningTime + dur,
      sectionType: sections[i].section_type,
      keyPoint: sections[i].key_point,
      chapterTitle: sections[i].chapter_title || (i === 0 ? "PROLOGUE \xB7 THE UNTOLD STORY" : i % 4 === 0 ? `ACT ${Math.floor(i / 4) + 1} \xB7 CRITICAL MOMENTUM` : null),
      locationStamp: sections[i].location_stamp || null,
      statNumber: sections[i].stat_number || null,
      statLabel: sections[i].stat_label || null,
      documentHeadline: sections[i].document_headline || null,
      highlightedQuote: sections[i].highlighted_quote || null
    });
    runningTime += totalSlot;
    const sectionClips = getSectionClips(i);
    const cuts = sliceCuts(totalSlot, sectionClips.length);
    cutPlan.push(
      cuts.map((d, ci) => ({
        clipPath: sectionClips.length > 0 ? sectionClips[ci % sectionClips.length] : "",
        durationSec: d,
        isSectionStart: ci === 0,
        isSectionEnd: ci === cuts.length - 1
      }))
    );
  }
  const totalPlannedCuts = cutPlan.reduce((s, c) => s + c.length, 0);
  console.log(`[assembler] Planned ${totalPlannedCuts} cuts across ${sections.length} sections (${runningTime.toFixed(1)}s total)`);
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(1, total, RENDER_STEPS[1].label);
  const renderedCuts = [];
  let motionIdx = 0;
  let completedCuts = 0;
  for (let i = 0; i < sections.length; i++) {
    const cuts = cutPlan[i];
    if (!cuts || cuts.length === 0) continue;
    for (let ci = 0; ci < cuts.length; ci++) {
      if (signal?.aborted) throw new Error("Assembly cancelled by user");
      const { clipPath, durationSec, isSectionStart, isSectionEnd } = cuts[ci];
      const motion = MOTION_CYCLE[motionIdx++ % MOTION_CYCLE.length];
      const outPath = path.join(tmpDir, `cut_${i}_${ci}.mp4`);
      await onProgress(
        1 + completedCuts / Math.max(totalPlannedCuts, 1) * 0.95,
        total,
        `Rendering 1080p cut ${completedCuts + 1}/${totalPlannedCuts}`
      );
      if (!clipPath || clipPath === "procedural:graphic") {
        await makeEditorialGraphicClip(outPath, durationSec, opts);
        renderedCuts.push(outPath);
        completedCuts++;
        continue;
      }
      if (!clipPath) {
        console.warn(`[assembler] Section ${i} cut ${ci}: no clip assigned, using fallback`);
        const fallbackClip = globalPool.length > 0 ? globalPool[(i + ci) % globalPool.length] : "";
        if (fallbackClip) {
          try {
            await renderCut(fallbackClip, durationSec, motion, outPath, gradeFilter, isSectionStart, isSectionEnd, opts);
            renderedCuts.push(outPath);
            completedCuts++;
            continue;
          } catch (e) {
            console.warn(`[assembler] Fallback clip render also failed: ${e.message}`);
          }
        }
        await makeDarkSceneClip(outPath, durationSec, opts);
        renderedCuts.push(outPath);
        completedCuts++;
        continue;
      }
      const clipStat = await fs.stat(clipPath).catch(() => null);
      if (!clipStat || clipStat.size < 2e3) {
        console.warn(`[assembler] Section ${i} cut ${ci}: clip file missing or too small (${clipStat?.size ?? 0} bytes): ${clipPath}`);
        const fallbackClip = globalPool.length > 0 ? globalPool[(i + ci) % globalPool.length] : "";
        if (fallbackClip && fallbackClip !== clipPath) {
          try {
            await renderCut(fallbackClip, durationSec, motion, outPath, gradeFilter, isSectionStart, isSectionEnd, opts);
            renderedCuts.push(outPath);
            completedCuts++;
            continue;
          } catch {
          }
        }
        await makeDarkSceneClip(outPath, durationSec, opts);
        renderedCuts.push(outPath);
        completedCuts++;
        continue;
      }
      try {
        const startOffset = ci * 4.2;
        console.log(`[assembler] Rendering cut ${completedCuts + 1}/${totalPlannedCuts}: section=${i} clip=${path.basename(clipPath)} dur=${durationSec.toFixed(1)}s motion=${motion} offset=${startOffset.toFixed(1)}s`);
        await renderCut(clipPath, durationSec, motion, outPath, gradeFilter, isSectionStart, isSectionEnd, opts, startOffset);
        renderedCuts.push(outPath);
      } catch (err) {
        if (signal?.aborted || err?.message?.includes("cancelled") || err?.message?.includes("aborted")) {
          throw err;
        }
        console.warn(`[assembler] Cut render failed (${i}_${ci}), attempting fallback clip from pool: ${err.message}`);
        const fallbackClip = globalPool.length > 0 ? globalPool[(i + ci + 1) % globalPool.length] : "";
        if (fallbackClip && fallbackClip !== clipPath) {
          try {
            await renderCut(fallbackClip, durationSec, motion, outPath, gradeFilter, isSectionStart, isSectionEnd, opts);
            renderedCuts.push(outPath);
            completedCuts++;
            continue;
          } catch {
          }
        }
        await makeDarkSceneClip(outPath, durationSec, opts);
        renderedCuts.push(outPath);
      }
      completedCuts++;
    }
  }
  if (renderedCuts.length === 0) {
    throw new Error("No video cuts were rendered \u2014 check audio generation");
  }
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(2, total, RENDER_STEPS[2].label);
  const mergedAudio = path.join(tmpDir, "voiceover_merged.aac");
  await mergeAudio(validAudio, mergedAudio, opts);
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
      true,
      // Always include title card, badges, stat cards, and chapter markers in ASS
      videoTitle
    );
    assExists = (await fs.stat(assPath)).size > 0;
    console.log(`[assembler] Generated ASS subtitles file`);
  } catch (err) {
    console.warn("[assembler] ASS subtitle generation error:", err.message);
  }
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(4, total, RENDER_STEPS[4].label);
  const joinedVideo = path.join(tmpDir, "timeline_joined.mp4");
  await joinAllCuts(renderedCuts, joinedVideo, opts);
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
      "-i",
      joinedVideo,
      "-vf",
      `tpad=stop_mode=clone:stop_duration=${deficit.toFixed(3)}`,
      "-c:v",
      "libx264",
      "-crf",
      String(CRF),
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      "-y",
      paddedVideo
    ], opts);
    syncedVideo = paddedVideo;
  }
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(5, total, RENDER_STEPS[5].label);
  const sfxPath = path.join(tmpDir, "sfx_composite.wav");
  let sfxExists = false;
  try {
    sfxExists = await buildCompositeSfxTrack(sections, sectionTimings, audioDuration, sfxPath, opts);
  } catch (sfxErr) {
    console.warn(`[assembler] SFX generation error: ${sfxErr?.message}`);
  }
  const finalMp4 = path.join(outputDir, "final.mp4");
  await finalProductionMix(
    syncedVideo,
    mergedAudio,
    bgmPath,
    sfxExists ? sfxPath : null,
    assExists ? assPath : null,
    finalMp4,
    videoTitle,
    sectionTimings,
    captionAccent,
    opts
  );
  if (signal?.aborted) throw new Error("Assembly cancelled by user");
  await onProgress(6, total, RENDER_STEPS[6].label);
  const thumbPath = path.join(outputDir, "thumb.jpg");
  try {
    await extractThumbnail(finalMp4, thumbPath, opts);
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn(`[assembler] Primary thumbnail seek failed (${err.message}). Attempting fallback frame 0 extraction...`);
    try {
      await ffmpeg([
        "-i",
        finalMp4,
        "-vframes",
        "1",
        "-vf",
        `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
        "-y",
        thumbPath
      ], opts);
    } catch (fallbackErr) {
      console.warn(`[assembler] Fallback thumbnail extraction failed (${fallbackErr.message}). Continuing with video.`);
    }
  }
  const thumbnailPaths = [thumbPath];
  const finalDuration = await getExactDuration(finalMp4).catch(() => 0);
  for (const [index, ratio] of [0.35, 0.7].entries()) {
    const variantPath = path.join(outputDir, `thumb_${index + 2}.jpg`);
    try {
      await extractThumbnailAt(finalMp4, variantPath, Math.max(1, finalDuration * ratio), opts);
      thumbnailPaths.push(variantPath);
    } catch (variantErr) {
      console.warn(`[assembler] Thumbnail variant ${index + 2} failed: ${variantErr.message}`);
    }
  }
  const shortPath = path.join(outputDir, "shorts.mp4");
  try {
    await createVerticalShort(finalMp4, shortPath, opts);
  } catch (shortErr) {
    if (signal?.aborted) throw shortErr;
    console.warn(`[assembler] Vertical Short generation failed: ${shortErr.message}`);
  }
  for (const cut of renderedCuts) {
    await fs.unlink(cut).catch(() => {
    });
  }
  await fs.unlink(joinedVideo).catch(() => {
  });
  if (syncedVideo !== joinedVideo) {
    await fs.unlink(syncedVideo).catch(() => {
    });
  }
  await fs.unlink(mergedAudio).catch(() => {
  });
  if (assExists) await fs.unlink(assPath).catch(() => {
  });
  const shortExists = await fs.stat(shortPath).then((stat) => stat.size > 2e3).catch(() => false);
  return { videoPath: finalMp4, thumbPath, thumbnailPaths, shortPath: shortExists ? shortPath : null };
}
export {
  RENDER_STEPS,
  assemble,
  getTempDir
};

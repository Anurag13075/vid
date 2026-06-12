import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection, RenderStep } from "./types.js";

type ProgressFn = (step: number, total: number, label: string) => void;

const CUT_SECS = 3.5; // seconds per visual cut — YouTube-style fast pacing

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "")
    .replace(/"/g, "")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/%/g, "")
    .slice(0, 52);
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg error (${code}): ${stderr.slice(-800)}`));
    });
    proc.on("error", (e) => reject(new Error(`FFmpeg not found: ${e.message}`)));
  });
}

async function ffprobe(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => resolve(parseFloat(out.trim()) || 5));
    proc.on("error", () => resolve(5));
  });
}

// Build a single 3.5s cut from a footage clip at a given seek offset
async function buildCut(
  clipPath: string,
  startSec: number,
  cutDuration: number,
  outPath: string,
  overlayFilters: string[]
): Promise<void> {
  const filters: string[] = [
    "scale=1280:720:force_original_aspect_ratio=decrease",
    "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black",
    "format=yuv420p",
    "eq=contrast=1.08:brightness=0.02:saturation=1.12",
    "unsharp=3:3:0.5:3:3:0.3",
    ...overlayFilters,
  ];

  await ffmpeg([
    "-ss", String(startSec),
    "-stream_loop", "-1",
    "-i", clipPath,
    "-vf", filters.join(","),
    "-t", String(Math.max(cutDuration, 0.5)),
    "-r", "25",
    "-c:v", "libx264", "-crf", "26", "-preset", "ultrafast",
    "-an", "-y", outPath,
  ]);
}

// Process one script section into a multi-cut video that matches audio duration
async function processSectionClips(
  footagePaths: string[],
  audioPath: string,
  section: ScriptSection,
  sectionIndex: number,
  tmpDir: string,
  videoTitle?: string
): Promise<{ outputPath: string; duration: number }> {
  const audioDuration = await ffprobe(audioPath);
  const totalDuration = audioDuration + 0.3;
  const numCuts = Math.max(1, Math.ceil(totalDuration / CUT_SECS));

  const subClipPaths: string[] = [];

  for (let cut = 0; cut < numCuts; cut++) {
    const cutDuration = cut === numCuts - 1
      ? Math.max(totalDuration - cut * CUT_SECS, 0.5)
      : CUT_SECS;

    // Rotate through available clips, use different start offsets each loop
    const clipIdx = cut % footagePaths.length;
    const loopRound = Math.floor(cut / footagePaths.length);
    const startSec = (loopRound * (CUT_SECS + 3)) % 25;

    const outPath = path.join(tmpDir, `s${sectionIndex}_cut${cut}.mp4`);
    const overlays: string[] = [];

    // Intro: title card on first cut only
    if (section.section_type === "intro" && cut === 0 && videoTitle) {
      const line1 = escapeText(videoTitle.slice(0, 40));
      const line2 = videoTitle.length > 40 ? escapeText(videoTitle.slice(40, 76)) : "";
      overlays.push(
        `drawbox=x=0:y=ih*0.30:w=iw:h=ih*0.40:color=0x000000CC:t=fill`,
        `drawbox=x=0:y=ih*0.30:w=iw:h=4:color=0x7C3AED:t=fill`,
        `drawbox=x=0:y=ih*0.70:w=iw:h=4:color=0x7C3AED:t=fill`,
        `drawtext=text='${line1}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=h*0.40`
      );
      if (line2) {
        overlays.push(`drawtext=text='${line2}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=h*0.50`);
      }
    }

    // Stat sections: show a prominent stat overlay on the footage (NOT a text card)
    if (section.section_type === "stat" && section.key_point && cut === 0) {
      const statText = escapeText(section.key_point);
      overlays.push(
        `drawbox=x=(iw-660)/2:y=ih*0.34:w=660:h=110:color=0x000000D0:t=fill`,
        `drawbox=x=(iw-660)/2:y=ih*0.34:w=7:h=110:color=0x7C3AED:t=fill`,
        `drawtext=text='${statText}':fontsize=30:fontcolor=white:x=(w-text_w)/2:y=h*0.41:fontweight=bold`
      );
    }

    // Key point lower-third on second cut of any section
    if (section.key_point && cut === 1 && section.section_type !== "stat") {
      const kp = escapeText(section.key_point);
      overlays.push(
        `drawbox=x=16:y=ih-80:w=iw-32:h=70:color=0x000000B0:t=fill`,
        `drawbox=x=16:y=ih-80:w=8:h=70:color=0x7C3AED:t=fill`,
        `drawtext=text='${kp}':fontsize=27:fontcolor=white:x=30:y=h-56`
      );
    }

    await buildCut(footagePaths[clipIdx], startSec, cutDuration, outPath, overlays);
    subClipPaths.push(outPath);
  }

  const outputPath = path.join(tmpDir, `section_${sectionIndex}.mp4`);

  if (subClipPaths.length === 1) {
    await fs.copyFile(subClipPaths[0], outputPath);
    return { outputPath, duration: totalDuration };
  }

  // Concat all sub-cuts with quick dissolve transitions between them
  const TRANS = 0.25;
  const inputs = subClipPaths.flatMap((p) => ["-i", p]);
  let filterGraph = "";
  let prevLabel = "[0:v]";
  let offset = 0;

  for (let i = 1; i < subClipPaths.length; i++) {
    const outLabel = i === subClipPaths.length - 1 ? "[vout]" : `[v${i}]`;
    offset += CUT_SECS - TRANS;
    filterGraph += `${prevLabel}[${i}:v]xfade=transition=dissolve:duration=${TRANS}:offset=${offset.toFixed(3)}${outLabel};`;
    prevLabel = outLabel;
  }

  await ffmpeg([
    ...inputs,
    "-filter_complex", filterGraph.slice(0, -1),
    "-map", "[vout]",
    "-c:v", "libx264", "-crf", "26", "-preset", "ultrafast",
    "-r", "25", "-an", "-y", outputPath,
  ]);

  return { outputPath, duration: totalDuration };
}

async function mergeAudio(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 0) {
    await ffmpeg([
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
      "-t", "5", "-q:a", "9", "-acodec", "libmp3lame",
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
    "-c:a", "libmp3lame", "-q:a", "4",
    "-y", outputPath,
  ]);
}

const SECTION_TRANSITIONS = [
  "fade", "fadeblack", "dissolve",
  "wipeleft", "wiperight", "slideleft", "slideright",
  "smoothleft", "smoothright",
];

function pickTransition(idx: number): string {
  return SECTION_TRANSITIONS[idx % SECTION_TRANSITIONS.length];
}

async function concatSectionsWithTransitions(
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

  const TRANS_DUR = 0.5;
  let filterGraph = "";
  let prevLabel = "[0:v]";
  let timeOffset = 0;

  for (let i = 1; i < clipPaths.length; i++) {
    const outLabel = i === clipPaths.length - 1 ? "[vout]" : `[v${i}]`;
    timeOffset += clipDurations[i - 1] - TRANS_DUR;
    const transition = pickTransition(i - 1);
    filterGraph += `${prevLabel}[${i}:v]xfade=transition=${transition}:duration=${TRANS_DUR}:offset=${timeOffset.toFixed(3)}${outLabel};`;
    prevLabel = outLabel;
  }

  await ffmpeg([
    ...inputs,
    "-filter_complex", filterGraph.slice(0, -1),
    "-map", "[vout]",
    "-c:v", "libx264", "-crf", "24", "-preset", "ultrafast",
    "-r", "25", "-an", "-y", outputPath,
  ]);
}

async function finalMix(
  videoPath: string,
  voiceoverPath: string,
  bgmPath: string | null,
  outputPath: string
): Promise<void> {
  const hasBgm = bgmPath !== null;
  const inputs = ["-i", videoPath, "-i", voiceoverPath];
  if (hasBgm) inputs.push("-i", bgmPath!);

  if (hasBgm) {
    await ffmpeg([
      ...inputs,
      "-filter_complex", "[2:a]volume=0.07[bgm];[1:a][bgm]amix=inputs=2:duration=shortest[a]",
      "-map", "0:v",
      "-map", "[a]",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      "-shortest",
      "-movflags", "+faststart",
      "-y", outputPath,
    ]);
  } else {
    await ffmpeg([
      ...inputs,
      "-map", "0:v",
      "-map", "1:a",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      "-shortest",
      "-movflags", "+faststart",
      "-y", outputPath,
    ]);
  }
}

async function extractThumbnail(videoPath: string, thumbPath: string): Promise<void> {
  await ffmpeg([
    "-ss", "4", "-i", videoPath,
    "-vframes", "1",
    "-vf", "scale=1280:720",
    "-y", thumbPath,
  ]);
}

export const RENDER_STEPS: RenderStep[] = [
  { label: "Building multi-cut clips (3-4s shots per section)", done: false },
  { label: "Merging voiceover audio tracks", done: false },
  { label: "Concatenating sections with transitions", done: false },
  { label: "Mixing audio (voiceover + music bed)", done: false },
  { label: "Generating thumbnail", done: false },
  { label: "Encoding final H.264 MP4", done: false },
];

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

  // Step 1: Build multi-cut section videos
  onProgress(0, total, RENDER_STEPS[0].label);
  const sectionVideos: string[] = [];
  const sectionDurations: number[] = [];
  const validAudio: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const audioPath = audioPaths[i];
    if (!audioPath) continue;

    const footage = footagePathsPerSection[i];

    // If no footage and not a graphic section, generate a black fallback clip
    if (!footage || footage.length === 0) {
      const dur = await ffprobe(audioPath) + 0.3;
      const fallbackPath = path.join(tmpDir, `black_${i}.mp4`);
      await ffmpeg([
        "-f", "lavfi", "-i", `color=c=black:size=1280x720:rate=25`,
        "-t", String(dur), "-c:v", "libx264", "-crf", "28",
        "-preset", "ultrafast", "-an", "-y", fallbackPath,
      ]);
      sectionVideos.push(fallbackPath);
      sectionDurations.push(dur);
      validAudio.push(audioPath);
      continue;
    }

    const { outputPath, duration } = await processSectionClips(
      footage,
      audioPath,
      section,
      i,
      tmpDir,
      i === 0 ? videoTitle : undefined
    );

    sectionVideos.push(outputPath);
    sectionDurations.push(duration);
    validAudio.push(audioPath);
  }

  if (sectionVideos.length === 0) {
    throw new Error("No clips could be processed — check MINIMAX_API_KEY, PEXELS_API_KEY and PIXABAY_API_KEY.");
  }

  // Step 2: Merge audio
  onProgress(1, total, RENDER_STEPS[1].label);
  const mergedAudio = path.join(tmpDir, "voiceover_merged.mp3");
  await mergeAudio(validAudio, mergedAudio);

  // Step 3: Concatenate section videos with transitions
  onProgress(2, total, RENDER_STEPS[2].label);
  const concatVideo = path.join(tmpDir, "concat.mp4");
  await concatSectionsWithTransitions(sectionVideos, sectionDurations, concatVideo);

  // Step 4: Mix audio
  onProgress(3, total, RENDER_STEPS[3].label);
  const finalMp4 = path.join(outputDir, "final.mp4");
  await finalMix(concatVideo, mergedAudio, bgmPath, finalMp4);

  // Step 5: Thumbnail
  onProgress(4, total, RENDER_STEPS[4].label);
  const thumbPath = path.join(outputDir, "thumb.jpg");
  await extractThumbnail(finalMp4, thumbPath);

  onProgress(5, total, RENDER_STEPS[5].label);

  return { videoPath: finalMp4, thumbPath };
}

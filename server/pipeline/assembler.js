import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
const TRANSITIONS = [
    "fade", "fadeblack", "fadegrays",
    "slideleft", "slideright", "slideup", "slidedown",
    "wipeleft", "wiperight", "wipeup", "wipedown",
    "smoothleft", "smoothright", "smoothup", "smoothdown",
    "circlecrop", "rectcrop", "distance", "dissolve",
];
function pickTransition(idx) {
    // Use a mix of deterministic-but-varied selection
    const pool = [
        TRANSITIONS[idx % TRANSITIONS.length],
        TRANSITIONS[(idx * 3 + 7) % TRANSITIONS.length],
        TRANSITIONS[(idx * 5 + 2) % TRANSITIONS.length],
    ];
    return pool[idx % pool.length];
}
function escapeText(s) {
    return s
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "") // remove apostrophes — they break ffmpeg single-quoted filter args
        .replace(/"/g, "") // remove double quotes too
        .replace(/:/g, "\\:")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/,/g, "\\,")
        .replace(/%/g, "") // percent signs can also break filter expressions
        .slice(0, 52);
}
function ffmpeg(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        proc.stderr?.on("data", (d) => { stderr += d.toString(); });
        proc.on("close", (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`FFmpeg error (${code}): ${stderr.slice(-800)}`));
        });
        proc.on("error", (e) => reject(new Error(`FFmpeg not found: ${e.message}`)));
    });
}
async function ffprobe(filePath) {
    return new Promise((resolve) => {
        const proc = spawn("ffprobe", [
            "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", filePath,
        ]);
        let out = "";
        proc.stdout.on("data", (d) => { out += d.toString(); });
        proc.on("close", () => resolve(parseFloat(out.trim()) || 5));
        proc.on("error", () => resolve(5));
    });
}
// 4 Ken Burns patterns — each returns { z, x, y } expressions valid in zoompan
// zoompan variables: on (output frame count), zoom, iw, ih, ow, oh, x, y
// NOTE: do NOT use 't' in zoompan x/y/z — use 'on' instead
function kenBurnsPattern(idx) {
    const patterns = [
        // 0: slow zoom-in, locked center
        { z: "min(zoom+0.0015,1.5)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
        // 1: zoom-in, pan right
        { z: "1.25", x: "min(on*0.6,iw-(iw/zoom))", y: "ih/2-(ih/zoom/2)" },
        // 2: zoom-in, pan left
        { z: "1.25", x: "max(iw-(iw/zoom)-on*0.6,0)", y: "ih/2-(ih/zoom/2)" },
        // 3: zoom-in, pan down
        { z: "min(zoom+0.001,1.3)", x: "iw/2-(iw/zoom/2)", y: "min(on*0.4,ih-(ih/zoom))" },
    ];
    return patterns[idx % patterns.length];
}
function buildGraphicText(section) {
    if (section.section_type === "graphic") {
        return section.key_point ? escapeText(section.key_point) : escapeText(section.narration.slice(0, 60));
    }
    return section.key_point ? escapeText(section.key_point) : escapeText(section.narration.slice(0, 80));
}
async function createMotionGraphicClip(section, outputPath, clipDuration) {
    const headline = buildGraphicText(section);
    const detail = section.section_type === "stat"
        ? escapeText(section.narration.slice(0, 120))
        : "";
    const showEnd = Math.max(clipDuration - 0.4, 1.2).toFixed(1);
    const fadeOut = Math.max(clipDuration - 0.8, 0).toFixed(1);
    // Build filter chain — use semicolons inside enable expressions via lte/gte instead of between()
    // to avoid comma conflicts in the -vf chain
    const parts = [
        "format=yuv420p",
        `drawbox=x=0:y=0:w=iw:h=ih:color=0x071a2b:t=fill`,
        `drawbox=x=90:y=140:w=1740:h=10:color=0x7C3AED:t=fill`,
        `drawtext=text='${headline}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=h*0.30`,
    ];
    if (detail) {
        parts.push(`drawtext=text='${detail}':fontsize=30:fontcolor=0xCCCCCC:x=(w-text_w)/2:y=h*0.56`);
    }
    parts.push(`fade=t=in:st=0:d=0.6`, `fade=t=out:st=${fadeOut}:d=0.6`, `format=yuv420p`);
    await ffmpeg([
        "-f", "lavfi",
        "-i", `color=c=0x071a2b:s=1920x1080:r=25`,
        "-t", String(clipDuration),
        "-vf", parts.join(","),
        "-c:v", "libx264", "-crf", "22", "-preset", "ultrafast",
        "-an", "-y", outputPath,
    ]);
    return clipDuration;
}
async function processClip(footagePath, audioPath, section, sectionIndex, outputPath, videoTitle) {
    const audioDuration = await ffprobe(audioPath);
    const clipDuration = Math.max(audioDuration + 0.5, 3.5);
    if (section.section_type === "stat" || section.section_type === "graphic") {
        return await createMotionGraphicClip(section, outputPath, clipDuration);
    }
    const { z: zExpr, x: xExpr, y: yExpr } = kenBurnsPattern(sectionIndex);
    const filters = [
        "scale=1920:1080:force_original_aspect_ratio=decrease",
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
        `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=75:fps=25`,
        "scale=1920:1080", // force exact 1920x1080 after zoompan — xfade requires all inputs same size
        "format=yuv420p",
        "eq=contrast=1.10:brightness=0.02:saturation=1.08",
        "unsharp=5:5:0.8:3:3:0.0",
    ];
    if (section.section_type === "intro" && videoTitle) {
        const tLine1 = escapeText(videoTitle.slice(0, 38));
        const tLine2 = videoTitle.length > 38 ? escapeText(videoTitle.slice(38, 72)) : "";
        const showEnd = Math.min(audioDuration - 0.4, 5.0).toFixed(1);
        const en04 = `gte(t\\,0.4)*lte(t\\,${showEnd})`;
        const en07 = `gte(t\\,0.7)*lte(t\\,${showEnd})`;
        filters.push(`drawbox=x=0:y=ih*0.28:w=iw:h=ih*0.44:color=0x000000B8:t=fill:enable='${en04}'`, `drawbox=x=0:y=ih*0.28:w=iw:h=4:color=0x7C3AED:t=fill:enable='${en04}'`, `drawbox=x=0:y=ih*0.72:w=iw:h=4:color=0x7C3AED:t=fill:enable='${en04}'`, `drawtext=text='${tLine1}':fontsize=62:fontcolor=white:x=(w-text_w)/2:y=h*0.38:enable='${en07}'`);
        if (tLine2) {
            filters.push(`drawtext=text='${tLine2}':fontsize=62:fontcolor=white:x=(w-text_w)/2:y=h*0.48:enable='${en07}'`);
        }
    }
    if (section.key_point) {
        const showEnd = Math.min(audioDuration - 0.4, 5.5).toFixed(1);
        const en10 = `gte(t\\,1.0)*lte(t\\,${showEnd})`;
        const en13 = `gte(t\\,1.3)*lte(t\\,${showEnd})`;
        filters.push(`drawbox=x=22:y=ih-108:w=iw-44:h=96:color=0x000000A6:t=fill:enable='${en10}'`, `drawbox=x=22:y=ih-108:w=10:h=96:color=0x7C3AED:t=fill:enable='${en10}'`, `drawtext=text='${escapeText(section.key_point)}':fontsize=38:fontcolor=white:x=42:y=h-74:enable='${en13}'`);
    }
    await ffmpeg([
        "-stream_loop", "-1", "-i", footagePath,
        "-vf", filters.join(","),
        "-t", String(clipDuration),
        "-r", "25",
        "-c:v", "libx264", "-crf", "22", "-preset", "ultrafast",
        "-an", "-y", outputPath,
    ]);
    return clipDuration;
}
async function mergeAudio(audioPaths, outputPath) {
    if (audioPaths.length === 0) {
        // Generate 5 seconds of silence as emergency fallback
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
    const inputs = [];
    audioPaths.forEach((p) => inputs.push("-i", p));
    const filterComplex = audioPaths
        .map((_, i) => `[${i}:a]`)
        .join("") + `concat=n=${audioPaths.length}:v=0:a=1[a]`;
    await ffmpeg([
        ...inputs,
        "-filter_complex", filterComplex,
        "-map", "[a]",
        "-c:a", "libmp3lame", "-q:a", "4",
        "-y", outputPath,
    ]);
}
async function concatWithTransitions(clipPaths, clipDurations, outputPath) {
    if (clipPaths.length === 1) {
        await fs.copyFile(clipPaths[0], outputPath);
        return;
    }
    const inputs = [];
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
        "-c:v", "libx264", "-crf", "21", "-preset", "fast",
        "-r", "25", "-an", "-y", outputPath,
    ]);
}
async function finalMix(videoPath, voiceoverPath, bgmPath, outputPath) {
    const hasBgm = bgmPath !== null;
    const inputs = ["-i", videoPath, "-i", voiceoverPath];
    if (hasBgm)
        inputs.push("-i", bgmPath);
    // NOTE: never use apad — it creates an infinite stream and hangs FFmpeg.
    // Use -shortest to stop encoding when the video track ends.
    if (hasBgm) {
        await ffmpeg([
            ...inputs,
            "-filter_complex", "[2:a]volume=0.08[bgm];[1:a][bgm]amix=inputs=2:duration=shortest[a]",
            "-map", "0:v",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-shortest",
            "-movflags", "+faststart",
            "-y", outputPath,
        ]);
    }
    else {
        await ffmpeg([
            ...inputs,
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-shortest",
            "-movflags", "+faststart",
            "-y", outputPath,
        ]);
    }
}
async function extractThumbnail(videoPath, thumbPath) {
    await ffmpeg([
        "-ss", "6", "-i", videoPath,
        "-vframes", "1",
        "-vf", "scale=1280:720",
        "-y", thumbPath,
    ]);
}
export const RENDER_STEPS = [
    { label: "Processing video clips (Ken Burns + overlays)", done: false },
    { label: "Merging voiceover audio tracks", done: false },
    { label: "Concatenating clips with transitions", done: false },
    { label: "Mixing audio (voiceover + music bed)", done: false },
    { label: "Generating thumbnail", done: false },
    { label: "Encoding final H.264 MP4", done: false },
];
export async function assemble(videoId, videoTitle, sections, audioPaths, footagePaths, bgmPath, outputDir, onProgress) {
    const tmpDir = path.join("/tmp/vidrush", videoId);
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    const total = RENDER_STEPS.length;
    // Step 1: Process each clip
    onProgress(0, total, RENDER_STEPS[0].label);
    const processedClips = [];
    const clipDurations = [];
    const validAudio = [];
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const audioPath = audioPaths[i];
        let footagePath = footagePaths[i];
        if (!audioPath)
            continue;
        if (!footagePath && section.section_type !== "stat" && section.section_type !== "graphic") {
            footagePath = path.join(tmpDir, `black_${i}.mp4`);
            const dur = await ffprobe(audioPath) + 0.5;
            await ffmpeg([
                "-f", "lavfi", "-i", `color=c=black:size=1920x1080:rate=25`,
                "-t", String(dur), "-c:v", "libx264", "-an", "-y", footagePath,
            ]);
        }
        const outClip = path.join(tmpDir, `processed_${i}.mp4`);
        const duration = await processClip(footagePath || "", audioPath, section, i, outClip, i === 0 ? videoTitle : undefined);
        processedClips.push(outClip);
        clipDurations.push(duration);
        validAudio.push(audioPath);
    }
    if (processedClips.length === 0) {
        throw new Error("No clips could be processed — all audio and footage failed. Check MINIMAX_API_KEY, PEXELS_API_KEY and PIXABAY_API_KEY.");
    }
    // Step 2: Merge audio
    onProgress(1, total, RENDER_STEPS[1].label);
    const mergedAudio = path.join(tmpDir, "voiceover_merged.mp3");
    await mergeAudio(validAudio, mergedAudio);
    // Step 3: Concatenate video
    onProgress(2, total, RENDER_STEPS[2].label);
    const concatVideo = path.join(tmpDir, "concat.mp4");
    await concatWithTransitions(processedClips, clipDurations, concatVideo);
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

import { promises as fs } from "fs";
import path from "path";
import { ffmpeg, ffprobe } from "./ffmpeg.js";
import { getTempDir } from "./tempDir.js";
export { getTempDir };
// ─── Constants ───────────────────────────────────────────────────────────────
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const FPS = 30;
const CRF = 22; // High quality 1080p
const PRESET = "fast";
const THREADS = 0; // auto-detect cpu cores
const CUT_TARGET_SEC = 4.0;
const CUT_MIN_SEC = 2.5;
const CUT_MAX_SEC = 6.0;
const MOTION_CYCLE = [
    "zoom-in", "pan-right", "zoom-out", "pan-left",
    "zoom-in", "pan-up", "zoom-out", "pan-down",
];
const THEME_CONFIGS = {
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
function resolveTheme(theme) {
    return THEME_CONFIGS[theme ?? ""] ?? THEME_CONFIGS.standard;
}
// ─── ASS SubStation Alpha Helpers ───────────────────────────────────────────
function assTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds % 1) * 100);
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
    return text
        .replace(/\\/g, "\\\\")
        .replace(/{/g, "\\{")
        .replace(/}/g, "\\}")
        .replace(/[\r\n]+/g, " ")
        .trim();
}
// ─── Native 1080p Ken Burns Motion Filter ────────────────────────────────────
function buildKenBurnsFilter(motion, durationSec) {
    const totalFrames = Math.max(Math.ceil(durationSec * FPS), 1);
    const w = OUTPUT_WIDTH;
    const h = OUTPUT_HEIGHT;
    const SCALE = 1.12;
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
            return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:'${dx}*${prog}':${Math.floor(dy / 2)}`;
        case "pan-left":
            return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:'${dx}*(1-${prog})':${Math.floor(dy / 2)}`;
        case "pan-up":
            return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:${Math.floor(dx / 2)}:'${dy}*${prog}'`;
        case "pan-down":
            return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:${Math.floor(dx / 2)}:'${dy}*(1-${prog})'`;
    }
}
// ─── Render One Cut (Native 1080p, Uniform GOP & Timebase) ──────────────────
async function renderCut(clipPath, durationSec, motionType, outPath, gradeFilter, isSectionStart = false, isSectionEnd = false) {
    const clipDuration = await ffprobe(clipPath);
    const needsLoop = clipDuration < durationSec;
    let transitionFilter = "";
    if (isSectionStart && durationSec > 1.2) {
        transitionFilter = ",fade=t=in:st=0:d=0.30";
    }
    else if (isSectionEnd && durationSec > 1.2) {
        transitionFilter = `,fade=t=out:st=${(durationSec - 0.30).toFixed(2)}:d=0.30`;
    }
    const fullFilter = `${buildKenBurnsFilter(motionType, durationSec)},${gradeFilter}${transitionFilter},format=yuv420p`;
    await ffmpeg([
        ...(needsLoop ? ["-stream_loop", "-1"] : []),
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
    ]);
}
// ─── Dark Gradient Scene Fallback ────────────────────────────────────────────
async function makeDarkSceneClip(outPath, durationSec) {
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
    ]);
}
// ─── Cut Slicer (Ensures Cuts Match Audio Exactly) ───────────────────────────
function sliceCuts(audioDuration) {
    if (audioDuration <= CUT_MAX_SEC)
        return [audioDuration];
    const cuts = [];
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
// ─── Complete ASS Subtitles + Title + Stats + Badges Generator ──────────────
// Uses 100% ASS formatting — ZERO reliance on external drawtext filter!
async function generateAssKaraokeAndOverlays(videoTitle, sections, sectionTimings, audioPaths, assPath, accentHex) {
    const accentColor = hexToAss(accentHex, 0);
    const white = "&H00FFFFFF";
    const gray = "&H00D0D0D0";
    const black = "&H00000000";
    const shadowBox = "&HB0000000";
    const cardBox = "&HD810141C";
    let events = "";
    // 1. Title Card at Opening (t = 0.5s to 4.2s)
    if (videoTitle.trim()) {
        const cleanTitle = escapeAss(videoTitle.length > 55 ? videoTitle.slice(0, 52) + "..." : videoTitle);
        events += `Dialogue: 3,0:00:00.40,0:00:04.20,TitleCard,,0,0,0,,{\\fad(400,400)}${cleanTitle}\n`;
        events += `Dialogue: 4,0:00:00.60,0:00:04.20,TitleBadge,,0,0,0,,{\\fad(300,400)}━ DOCUMENTARY INVESTIGATION ━\n`;
    }
    // 2. Section Chapter Badges & Key Point Callouts
    for (const t of sectionTimings) {
        const dur = t.endSec - t.startSec;
        if (dur < 1.2)
            continue;
        // Stat / Key Fact Callout
        if ((t.sectionType === "stat" || t.keyPoint) && t.keyPoint) {
            const showStart = t.startSec + 0.8;
            const showEnd = Math.min(t.startSec + 4.5, t.endSec - 0.4);
            if (showEnd > showStart + 1.0) {
                const cleanKp = escapeAss(t.keyPoint);
                events += `Dialogue: 2,${assTime(showStart)},${assTime(showEnd)},StatCard,,0,0,0,,{\\fad(300,300)}◆ ${cleanKp}\n`;
            }
        }
        // Chapter Marker for Intro / Outro
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
    // 3. Word-by-Word Timed Karaoke Captions
    const WORDS_PER_LINE = 4;
    let timeOffset = 0;
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const audioPath = audioPaths[i];
        if (!audioPath || !section.narration.trim())
            continue;
        const duration = await ffprobe(audioPath);
        if (duration <= 0)
            continue;
        const words = section.narration.trim().split(/\s+/).filter(Boolean);
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
async function joinAllCuts(clipPaths, outputPath) {
    if (clipPaths.length === 0)
        throw new Error("No cuts to join");
    if (clipPaths.length === 1) {
        await fs.copyFile(clipPaths[0], outputPath);
        return;
    }
    const listPath = outputPath + ".concat.txt";
    const lines = clipPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
    await fs.writeFile(listPath, lines, "utf8");
    console.log(`[assembler] joining ${clipPaths.length} cuts into single stream`);
    // Concat demuxer with timestamp sanitization
    await ffmpeg([
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        "-fflags", "+genpts",
        "-avoid_negative_ts", "make_zero",
        "-y", outputPath,
    ]);
    await fs.unlink(listPath).catch(() => { });
}
// ─── Merge Voiceover Audio ──────────────────────────────────────────────────
async function mergeAudio(audioPaths, outputPath) {
    if (audioPaths.length === 0) {
        await ffmpeg([
            "-f", "lavfi",
            "-i", "anullsrc=r=44100:cl=stereo",
            "-t", "5",
            "-c:a", "aac",
            "-b:a", "192k",
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
    const fc = audioPaths.map((_, i) => `[${i}:a]`).join("") + `concat=n=${audioPaths.length}:v=0:a=1[a]`;
    await ffmpeg([
        ...inputs,
        "-filter_complex", fc,
        "-map", "[a]",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-y", outputPath,
    ]);
}
// ─── Single-Pass Final Production Mix (Zero Drawtext Error) ─────────────────
async function finalProductionMix(videoPath, voiceoverPath, bgmPath, assPath, outputPath) {
    let vfFilter = "format=yuv420p";
    if (assPath) {
        try {
            await fs.access(assPath);
            const content = await fs.readFile(assPath, "utf8");
            if (content.includes("[Events]")) {
                const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
                vfFilter = `ass='${escaped}',format=yuv420p`;
            }
        }
        catch {
            console.warn("[assembler] ASS subtitle file not found, proceeding without subtitles");
        }
    }
    const hasBgm = bgmPath && (await fs.stat(bgmPath).catch(() => null))?.size;
    console.log(`[assembler] Final render pass (1080p, CRF ${CRF}, ASS overlays, BGM=${!!hasBgm})`);
    if (hasBgm) {
        const voDur = await ffprobe(voiceoverPath);
        const fadeOutStart = Math.max(voDur - 2.5, 0);
        await ffmpeg([
            "-i", videoPath,
            "-i", voiceoverPath,
            "-stream_loop", "-1", "-i", bgmPath,
            "-filter_complex", [
                `[2:a]volume=0.10,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.0[bgm]`,
                `[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-14:TP=-1.5:LRA=11[audio]`,
            ].join(";"),
            "-map", "0:v", "-map", "[audio]",
            "-vf", vfFilter,
            "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
            "-movflags", "+faststart",
            "-y", outputPath,
        ]);
    }
    else {
        await ffmpeg([
            "-i", videoPath,
            "-i", voiceoverPath,
            "-filter_complex", `[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[audio]`,
            "-map", "0:v", "-map", "[audio]",
            "-vf", vfFilter,
            "-c:v", "libx264", "-crf", String(CRF), "-preset", PRESET,
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
            "-movflags", "+faststart",
            "-y", outputPath,
        ]);
    }
}
// ─── Thumbnail Extraction ────────────────────────────────────────────────────
async function extractThumbnail(videoPath, thumbPath) {
    await ffmpeg([
        "-ss", "3.5",
        "-i", videoPath,
        "-vframes", "1",
        "-vf", `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
        "-y", thumbPath,
    ]);
}
// ─── Step Manifest ───────────────────────────────────────────────────────────
export const RENDER_STEPS = [
    { label: "Slicing sections into fast cuts", done: false },
    { label: "Rendering 1080p cuts with cinematic color grade", done: false },
    { label: "Merging voiceover audio tracks", done: false },
    { label: "Generating broadcast subtitles and graphics (ASS)", done: false },
    { label: "Seamlessly joining video timeline", done: false },
    { label: "Mastering audio & rendering final 1080p video", done: false },
    { label: "Extracting high-resolution thumbnail", done: false },
];
function makeSectionClipResolver(footagePathsPerSection, globalPool) {
    return (i) => {
        const own = footagePathsPerSection[i];
        if (own && own.length > 0)
            return own;
        for (let radius = 1; radius <= 3; radius++) {
            for (const j of [i - radius, i + radius]) {
                if (j >= 0 && j < footagePathsPerSection.length) {
                    const adj = footagePathsPerSection[j];
                    if (adj && adj.length > 0)
                        return adj;
                }
            }
        }
        if (globalPool.length === 0)
            return [];
        const offset = (i * 3) % globalPool.length;
        const count = Math.min(6, globalPool.length);
        return Array.from({ length: count }, (_, k) => globalPool[(offset + k) % globalPool.length]);
    };
}
// ─── Main Assembly Entry Point ──────────────────────────────────────────────
export async function assemble(videoId, videoTitle, sections, audioPaths, footagePathsPerSection, bgmPath, outputDir, onProgress, theme) {
    const tmpDir = getTempDir(videoId);
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    const { gradeFilter, captionAccent } = resolveTheme(theme);
    console.log(`[assembler] Starting assemble: theme="${theme ?? "standard"}" accent="${captionAccent}"`);
    const total = RENDER_STEPS.length;
    // Build global clip pool
    const globalPool = [];
    for (const paths of footagePathsPerSection) {
        if (paths) {
            for (const p of paths) {
                if (!globalPool.includes(p))
                    globalPool.push(p);
            }
        }
    }
    console.log(`[assembler] Global pool has ${globalPool.length} clips`);
    const getSectionClips = makeSectionClipResolver(footagePathsPerSection, globalPool);
    // ── Step 1: Plan Cuts & Exact Section Timings ─────────────────────────────
    await onProgress(0, total, RENDER_STEPS[0].label);
    const cutPlan = [];
    const validAudio = [];
    const sectionTimings = [];
    let runningTime = 0;
    for (let i = 0; i < sections.length; i++) {
        const ap = audioPaths[i];
        if (!ap) {
            cutPlan.push([]);
            continue;
        }
        const dur = await ffprobe(ap);
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
        cutPlan.push(cuts.map((d, ci) => ({
            clipPath: sectionClips.length > 0 ? sectionClips[ci % sectionClips.length] : "",
            durationSec: d,
            isSectionStart: ci === 0,
            isSectionEnd: ci === cuts.length - 1,
        })));
    }
    const totalPlannedCuts = cutPlan.reduce((s, c) => s + c.length, 0);
    console.log(`[assembler] Planned ${totalPlannedCuts} cuts across ${sections.length} sections (${runningTime.toFixed(1)}s total)`);
    // ── Step 2: Render 1080p Cuts with Ken Burns Motion ───────────────────────
    await onProgress(1, total, RENDER_STEPS[1].label);
    const renderedCuts = [];
    let motionIdx = 0;
    for (let i = 0; i < sections.length; i++) {
        const cuts = cutPlan[i];
        if (!cuts || cuts.length === 0)
            continue;
        for (let ci = 0; ci < cuts.length; ci++) {
            const { clipPath, durationSec, isSectionStart, isSectionEnd } = cuts[ci];
            const motion = MOTION_CYCLE[motionIdx++ % MOTION_CYCLE.length];
            const outPath = path.join(tmpDir, `cut_${i}_${ci}.mp4`);
            if (!clipPath) {
                await makeDarkSceneClip(outPath, durationSec);
                renderedCuts.push(outPath);
                continue;
            }
            try {
                await renderCut(clipPath, durationSec, motion, outPath, gradeFilter, isSectionStart, isSectionEnd);
                renderedCuts.push(outPath);
            }
            catch (err) {
                console.warn(`[assembler] Cut render failed (${i}_${ci}), falling back to safe clip: ${err.message}`);
                await makeDarkSceneClip(outPath, durationSec);
                renderedCuts.push(outPath);
            }
        }
    }
    if (renderedCuts.length === 0) {
        throw new Error("No video cuts were rendered — check audio generation");
    }
    // ── Step 3: Merge Voiceover Tracks ────────────────────────────────────────
    await onProgress(2, total, RENDER_STEPS[2].label);
    const mergedAudio = path.join(tmpDir, "voiceover_merged.aac");
    await mergeAudio(validAudio, mergedAudio);
    // ── Step 4: Generate ASS Broadcast Subtitles & Graphics ───────────────────
    await onProgress(3, total, RENDER_STEPS[3].label);
    const assPath = path.join(tmpDir, "subtitles.ass");
    let assExists = false;
    try {
        await generateAssKaraokeAndOverlays(videoTitle, sections, sectionTimings, audioPaths, assPath, captionAccent);
        assExists = (await fs.stat(assPath)).size > 0;
        console.log(`[assembler] Generated ASS graphics and subtitles file`);
    }
    catch (err) {
        console.warn("[assembler] ASS subtitle generation error:", err.message);
    }
    // ── Step 5: Join All Cuts into Full Video Timeline ────────────────────────
    await onProgress(4, total, RENDER_STEPS[4].label);
    const joinedVideo = path.join(tmpDir, "timeline_joined.mp4");
    await joinAllCuts(renderedCuts, joinedVideo);
    // ── Step 6: Master Audio & Final Video Render ─────────────────────────────
    await onProgress(5, total, RENDER_STEPS[5].label);
    const finalMp4 = path.join(outputDir, "final.mp4");
    await finalProductionMix(joinedVideo, mergedAudio, bgmPath, assExists ? assPath : null, finalMp4);
    // ── Step 7: Thumbnail Extraction ──────────────────────────────────────────
    await onProgress(6, total, RENDER_STEPS[6].label);
    const thumbPath = path.join(outputDir, "thumb.jpg");
    await extractThumbnail(finalMp4, thumbPath);
    // Rolling cleanup: remove cut files and intermediate timeline
    for (const cut of renderedCuts) {
        await fs.unlink(cut).catch(() => { });
    }
    await fs.unlink(joinedVideo).catch(() => { });
    await fs.unlink(mergedAudio).catch(() => { });
    if (assExists)
        await fs.unlink(assPath).catch(() => { });
    return { videoPath: finalMp4, thumbPath };
}

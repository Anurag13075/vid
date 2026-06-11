import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { generateScript } from "./scriptGenerator.js";
import { generateVoiceover } from "./voiceover.js";
import { findFootage, downloadClip, resetUsedClips } from "./footageAgent.js";
import { assemble, RENDER_STEPS } from "./assembler.js";
import { updateVideo, getVideo } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { jobQueue } from "./queue.js";
async function emit(videoId, event) {
    jobQueue.emit(videoId, event);
    await updateVideo(videoId, {
        stage: event.stage,
        progress: event.progress,
        message: event.message,
        ...(event.script ? { script: JSON.stringify(event.script) } : {}),
        ...(event.clips ? { clips: JSON.stringify(event.clips) } : {}),
        ...(event.renderSteps ? { render_steps: JSON.stringify(event.renderSteps) } : {}),
        ...(event.renderProgress !== undefined ? { render_progress: event.renderProgress } : {}),
        ...(event.videoUrl ? { video_url: event.videoUrl } : {}),
        ...(event.thumbnailUrl ? { thumbnail_url: event.thumbnailUrl } : {}),
        ...(event.errorMessage ? { error_message: event.errorMessage } : {}),
    });
}
async function withRetry(fn, retries = 3) {
    const delays = [5000, 15000, 45000];
    let lastErr = null;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            console.error(`Attempt ${i + 1} failed:`, err);
            if (i < retries - 1) {
                await new Promise((r) => setTimeout(r, delays[i]));
            }
        }
    }
    throw lastErr;
}
export function startPipeline(videoId) {
    jobQueue.enqueue(videoId, () => runPipeline(videoId));
}
async function runPipeline(videoId) {
    const video = await getVideo(videoId);
    if (!video)
        return;
    const { title, voice, length } = video;
    try {
        // ── Phase 1: Script generation ──────────────────────────────────────
        await emit(videoId, {
            stage: "researching",
            progress: 5,
            message: "Analyzing topic and researching angles...",
        });
        await new Promise((r) => setTimeout(r, 1500));
        await emit(videoId, {
            stage: "writing",
            progress: 15,
            message: "Generating script with Claude AI...",
        });
        const script = await withRetry(() => generateScript(title, length));
        await emit(videoId, {
            stage: "writing",
            progress: 30,
            message: `Script ready — ${script.sections.length} sections`,
            script,
        });
        // ── Phase 2: Voiceover ──────────────────────────────────────────────
        const narrationSections = script.sections.filter((s) => s.section_type !== "graphic");
        await emit(videoId, {
            stage: "voiceover",
            progress: 32,
            message: `Generating voiceover with MiniMax TTS...`,
            script,
        });
        const audioPaths = [];
        const audioMap = new Map();
        for (let i = 0; i < script.sections.length; i++) {
            const section = script.sections[i];
            const pct = 32 + Math.round((i / script.sections.length) * 18);
            if (!section.narration.trim() && section.section_type !== "graphic") {
                audioPaths.push(null);
                continue;
            }
            try {
                const { audioPath } = await generateVoiceover(section, videoId, voice);
                audioPaths.push(audioPath);
                audioMap.set(section.id, audioPath);
                await emit(videoId, {
                    stage: "voiceover",
                    progress: pct,
                    message: `Voiceover ${i + 1}/${script.sections.length} done`,
                    script,
                });
            }
            catch (err) {
                console.error(`Voiceover failed for section ${section.id}:`, err);
                audioPaths.push(null);
            }
        }
        // ── Phase 3: Footage search ─────────────────────────────────────────
        resetUsedClips();
        const clips = script.sections.map((s) => ({
            id: s.id,
            keyword: s.visual_keywords.join(" · ") || "cinematic background",
            thumbUrl: "",
            videoUrl: "",
            source: "pexels",
            externalId: "",
            duration: 10,
            status: "pending",
        }));
        await emit(videoId, {
            stage: "footage",
            progress: 50,
            message: "Searching Pexels & Pixabay for matching footage...",
            script,
            clips,
        });
        const footagePaths = [];
        for (let i = 0; i < script.sections.length; i++) {
            const section = script.sections[i];
            const pct = 50 + Math.round((i / script.sections.length) * 18);
            clips[i] = { ...clips[i], status: "downloading" };
            await emit(videoId, {
                stage: "footage",
                progress: pct,
                message: `Finding clip for: "${section.visual_keywords[0]}"`,
                script,
                clips: [...clips],
            });
            try {
                const clip = await findFootage(section, videoId);
                if (clip) {
                    const localPath = await downloadClip(clip, videoId, section.id);
                    clips[i] = { ...clip, localPath, status: "ready" };
                    footagePaths.push(localPath);
                }
                else {
                    clips[i] = { ...clips[i], status: "failed" };
                    footagePaths.push(null);
                }
            }
            catch (err) {
                console.error(`Footage failed for section ${section.id}:`, err);
                clips[i] = { ...clips[i], status: "failed" };
                footagePaths.push(null);
            }
            await emit(videoId, {
                stage: "footage",
                progress: pct,
                message: `${clips.filter((c) => c.status === "ready").length} clips ready`,
                script,
                clips: [...clips],
            });
        }
        // ── Phase 4: Assembly ───────────────────────────────────────────────
        const renderSteps = RENDER_STEPS.map((s) => ({ ...s }));
        await emit(videoId, {
            stage: "rendering",
            progress: 68,
            message: "Starting FFmpeg render pipeline...",
            script,
            clips,
            renderSteps,
            renderProgress: 0,
        });
        const outputDir = path.join(__dirname, "..", "..", "data", "videos", videoId);
        await fs.mkdir(outputDir, { recursive: true });
        const bgmPath = await findBgm(script.mood);
        const validAudioPaths = script.sections.map((_, i) => audioPaths[i] || null);
        const { videoPath, thumbPath } = await assemble(videoId, title, script.sections, validAudioPaths, footagePaths, bgmPath, outputDir, async (step, total, label) => {
            const updatedSteps = renderSteps.map((s, idx) => ({
                ...s,
                done: idx < step,
            }));
            if (step < renderSteps.length)
                updatedSteps[step].done = false;
            const renderPct = Math.round((step / total) * 100);
            const overallPct = 68 + Math.round((step / total) * 28);
            await emit(videoId, {
                stage: "rendering",
                progress: overallPct,
                message: label,
                script,
                clips,
                renderSteps: updatedSteps,
                renderProgress: renderPct,
            });
        });
        // ── Phase 5: Done ───────────────────────────────────────────────────
        const videoUrl = `/videos/${videoId}/final.mp4`;
        const thumbnailUrl = `/videos/${videoId}/thumb.jpg`;
        await emit(videoId, {
            stage: "done",
            progress: 100,
            message: "Video ready — upload to YouTube!",
            script,
            clips,
            renderSteps: RENDER_STEPS.map((s) => ({ ...s, done: true })),
            renderProgress: 100,
            videoUrl,
            thumbnailUrl,
        });
        console.log(`✅ Video ${videoId} complete: ${videoPath}`);
        // Clean up temp working directory to keep /tmp lean
        const tmpDir = path.join("/tmp/vidrush", videoId);
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => { });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Pipeline failed for ${videoId}:`, err);
        await emit(videoId, {
            stage: "error",
            progress: 0,
            message: `Pipeline failed: ${msg}`,
            errorMessage: msg,
        });
    }
}
async function findBgm(mood) {
    const moodDir = path.join(__dirname, "..", "assets", "music", mood);
    const fallbackDir = path.join(__dirname, "..", "assets", "music", "neutral");
    for (const dir of [moodDir, fallbackDir]) {
        try {
            const files = await fs.readdir(dir);
            const mp3s = files.filter((f) => f.endsWith(".mp3"));
            if (mp3s.length > 0) {
                const pick = mp3s[Math.floor(Math.random() * mp3s.length)];
                return path.join(dir, pick);
            }
        }
        catch {
            // directory doesn't exist
        }
    }
    return null;
}

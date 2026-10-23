import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { createVideo, getVideo, listVideos, updateVideo } from "../db.js";
import { startPipeline, startIncrementalReRender } from "../pipeline/orchestrator.js";
import { VOICES } from "../pipeline/voiceover.js";
import { interpretVoiceCommand } from "../pipeline/commandInterpreter.js";
const router = Router();
// GET /api/videos/voices
router.get("/voices", (_req, res) => {
    res.json(VOICES);
});
// POST /api/videos/command — Interpret voice dictation & optionally execute
router.post("/command", async (req, res) => {
    try {
        const { command, videoId, execute } = req.body;
        if (!command || typeof command !== "string" || !command.trim()) {
            return res.status(400).json({ error: "Voice command string is required" });
        }
        // Load project state from Neon if videoId is provided
        let projectState = null;
        if (videoId) {
            const raw = await getVideo(videoId);
            if (raw) {
                projectState = {
                    id: raw.id,
                    title: raw.title,
                    voice: raw.voice,
                    length: raw.length,
                    theme: raw.theme,
                    script: typeof raw.script === "string" ? JSON.parse(raw.script) : raw.script,
                    clips: typeof raw.clips === "string" ? JSON.parse(raw.clips) : raw.clips,
                };
            }
        }
        // Call Groq AI with Zod command interpretation schema
        const interpretation = await interpretVoiceCommand(command.trim(), projectState);
        // If execute flag is requested, apply the actions immediately
        let executionResult = { executed: false };
        if (execute) {
            for (const action of interpretation.actions) {
                if (action.type === "create_video") {
                    const newId = uuidv4();
                    await createVideo({
                        id: newId,
                        title: action.topic,
                        voice: action.voice || "presenter_female",
                        length: action.length || "short",
                        theme: action.theme || "modern",
                        mode: "auto",
                    });
                    startPipeline(newId);
                    executionResult = { executed: true, newVideoId: newId };
                    break;
                }
                if (action.type === "change_voice" && videoId) {
                    await updateVideo(videoId, { voice: action.voice });
                    startIncrementalReRender(videoId, { newVoice: action.voice });
                    executionResult = { executed: true, modified: "voice", videoId };
                }
                if (action.type === "set_theme" && videoId) {
                    await updateVideo(videoId, { theme: action.theme });
                    startIncrementalReRender(videoId, { newTheme: action.theme });
                    executionResult = { executed: true, modified: "theme", videoId };
                }
                if (action.type === "replace_footage" && videoId) {
                    startIncrementalReRender(videoId, {
                        affectedScenes: [action.scene_index],
                        rewriteInstructions: [{ sceneIndex: action.scene_index, newKeywords: action.new_keywords }],
                    });
                    executionResult = { executed: true, modified: "footage", scene: action.scene_index, videoId };
                }
                if (action.type === "rewrite_scene" && videoId) {
                    startIncrementalReRender(videoId, {
                        affectedScenes: [action.scene_index],
                        rewriteInstructions: [{ sceneIndex: action.scene_index, newNarration: action.instruction }],
                    });
                    executionResult = { executed: true, modified: "scene_rewrite", scene: action.scene_index, videoId };
                }
            }
        }
        res.json({
            interpretation,
            execution: executionResult,
        });
    }
    catch (err) {
        console.error("Voice command processing error:", err);
        res.status(500).json({ error: err.message || "Failed to process voice command" });
    }
});
// POST /api/videos/transcribe — Wispr Flow & Groq Whisper fallback audio transcription
router.post("/transcribe", async (req, res) => {
    try {
        const { audioBase64, language, wisprApiKey, mimeType } = req.body;
        if (!audioBase64) {
            return res.status(400).json({ error: "audioBase64 is required" });
        }
        const wisprKey = wisprApiKey || process.env.WISPR_FLOW_API_KEY;
        // 1. Try Wispr Flow Voice Interface API if key is available
        if (wisprKey) {
            try {
                const wisprRes = await fetch("https://platform-api.wisprflow.ai/api/v1/dash/api", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${wisprKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        audio: audioBase64,
                        language: language ? [language] : ["en"],
                        context: { app: { name: "VidRush", type: "ai" } },
                    }),
                });
                if (wisprRes.ok) {
                    const data = await wisprRes.json();
                    const text = data.text || data.transcription || "";
                    return res.json({ text, provider: "wispr-flow" });
                }
            }
            catch (e) {
                console.warn("Wispr Flow transcription failed, trying Whisper fallback:", e.message);
            }
        }
        // 2. Groq Whisper (ultra low-latency fallback using Groq cloud)
        const groqKey = process.env.GROK_API_KEY || process.env.GROQ_API_KEY;
        if (groqKey) {
            const buffer = Buffer.from(audioBase64, "base64");
            const mime = mimeType || "audio/webm";
            const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("wav") ? "wav" : "webm";
            const blob = new Blob([buffer], { type: mime });
            const formData = new FormData();
            formData.append("file", blob, `speech.${ext}`);
            formData.append("model", "whisper-large-v3-turbo");
            const groqWhisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${groqKey}` },
                body: formData,
            });
            if (groqWhisperRes.ok) {
                const groqData = await groqWhisperRes.json();
                return res.json({ text: groqData.text || "", provider: "groq-whisper" });
            }
        }
        res.status(500).json({ error: "No transcription provider available" });
    }
    catch (err) {
        res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
});
// POST /api/videos — create and kick off pipeline
router.post("/", async (req, res) => {
    try {
        const { title, voice, length, theme, background, mode } = req.body;
        if (!title || typeof title !== "string" || !title.trim()) {
            return res.status(400).json({ error: "title is required" });
        }
        const validVoiceIds = VOICES.map((v) => v.id);
        const validVoice = validVoiceIds.includes(voice) ? voice : "presenter_female";
        const validLength = ["short", "medium", "long"].includes(length) ? length : "medium";
        const validTheme = ["crime", "history", "modern", "minimalist", "standard"].includes(theme) ? theme : "modern";
        const validBackground = typeof background === "string" && background ? background : "gradient_dark";
        const validMode = ["auto", "manual"].includes(mode) ? mode : "auto";
        const id = uuidv4();
        await createVideo({
            id,
            title: title.trim(),
            voice: validVoice,
            length: validLength,
            theme: validTheme,
            background: validBackground,
            mode: validMode,
        });
        startPipeline(id);
        res.json({ id, title: title.trim(), voice: validVoice, length: validLength, theme: validTheme, background: validBackground, mode: validMode });
    }
    catch (err) {
        console.error("POST /api/videos error:", err);
        res.status(500).json({ error: "Failed to create video" });
    }
});
// GET /api/videos — list videos
router.get("/", async (_req, res) => {
    try {
        const videos = await listVideos();
        res.json(videos);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to list videos" });
    }
});
// GET /api/videos/:id — get video status
router.get("/:id", async (req, res) => {
    try {
        const video = await getVideo(req.params.id);
        if (!video)
            return res.status(404).json({ error: "Not found" });
        const normalized = {
            id: video.id,
            title: video.title,
            voice: video.voice,
            length: video.length,
            theme: video.theme || "modern",
            background: video.background || "gradient_dark",
            mode: video.mode || "auto",
            stage: video.stage,
            progress: video.progress,
            message: video.message,
            script: typeof video.script === "string" ? JSON.parse(video.script) : video.script,
            clips: typeof video.clips === "string" ? JSON.parse(video.clips) : video.clips,
            renderSteps: typeof video.render_steps === "string"
                ? JSON.parse(video.render_steps)
                : video.render_steps,
            renderProgress: video.render_progress,
            videoUrl: video.video_url,
            thumbnailUrl: video.thumbnail_url,
            durationSeconds: video.duration_seconds,
            errorMessage: video.error_message,
            createdAt: video.created_at,
        };
        res.json(normalized);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to get video" });
    }
});
// DELETE /api/videos/:id
router.delete("/:id", async (req, res) => {
    try {
        await updateVideo(req.params.id, { stage: "error", message: "Deleted" });
        res.json({ ok: true });
    }
    catch {
        res.status(500).json({ error: "Failed to delete video" });
    }
});
export default router;

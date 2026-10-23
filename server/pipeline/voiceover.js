import { promises as fs } from "fs";
import path from "path";
import { ffmpeg, ffprobe } from "./ffmpeg.js";
import { getTempDir } from "./tempDir.js";
export { getTempDir };
// ─── Voice catalogue ────────────────────────────────────────────────────────
// Using official ElevenLabs premade voices (George, Adam) available across all plans
export const VOICES = [
    { id: "presenter_female", label: "Aria · Warm Female", tags: ["Female", "Warm", "American"], elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
    { id: "audiobook_female_1", label: "Ava · Natural Female", tags: ["Female", "Natural", "American"], elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
    { id: "presenter_male", label: "Brian · Deep Male", tags: ["Male", "Deep", "American"], elevenVoiceId: "pNInz6obpgDQGcFmaJgB" },
    { id: "audiobook_male_1", label: "Christopher · Authoritative", tags: ["Male", "Authoritative", "American"], elevenVoiceId: "pNInz6obpgDQGcFmaJgB" },
    { id: "newscast_male", label: "Guy · Neutral Male", tags: ["Male", "Neutral", "American"], elevenVoiceId: "pNInz6obpgDQGcFmaJgB" },
    { id: "casual_guy", label: "Andrew · Conversational Male", tags: ["Male", "Young", "American"], elevenVoiceId: "pNInz6obpgDQGcFmaJgB" },
    { id: "wise_woman", label: "Eleanor · Wise Female", tags: ["Female", "Mature", "British"], elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
    { id: "deep_space_master", label: "Magnus · Epic Narrator", tags: ["Male", "Epic", "American"], elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
    { id: "calm_woman", label: "Serenity · Calm Female", tags: ["Female", "Calm", "American"], elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
    { id: "audiobook_female_2", label: "Grace · Storyteller Female", tags: ["Female", "Young", "American"], elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
    { id: "audiobook_male_2", label: "Drake · Documentary Male", tags: ["Male", "Mature", "American"], elevenVoiceId: "pNInz6obpgDQGcFmaJgB" },
    { id: "newscast_female", label: "Natalie · Professional Female", tags: ["Female", "Professional", "American"], elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
];
const DEFAULT_ELEVEN_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George (reliable narrator)
function resolveElevenVoice(voiceId) {
    const match = VOICES.find(v => v.id === voiceId);
    return match?.elevenVoiceId ?? DEFAULT_ELEVEN_VOICE;
}
// ─── ElevenLabs TTS Generation ──────────────────────────────────────────────
async function generateElevenLabsTTS(text, voiceId, outputPath) {
    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
        throw new Error("ELEVENLABS_API_KEY is not set in environment");
    }
    const elevenVoice = resolveElevenVoice(voiceId);
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoice}?output_format=mp3_44100_128`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": apiKey,
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
    }
    catch (err) {
        clearTimeout(timer);
        throw err;
    }
}
// ─── Public API ─────────────────────────────────────────────────────────────
export async function generateVoiceover(section, videoId, voice) {
    const dir = getTempDir(path.join(videoId, "audio"));
    await fs.mkdir(dir, { recursive: true });
    const audioPath = path.join(dir, `section_${section.id}.mp3`);
    const text = section.narration.trim();
    // Graphic sections / empty narration → silence placeholder
    if (!text || section.section_type === "graphic") {
        await generateSilence(audioPath, 2000);
        return { audioPath, durationMs: 2000 };
    }
    // 1. ElevenLabs TTS
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            console.log(`[tts] ElevenLabs generating narration for section ${section.id}...`);
            await generateElevenLabsTTS(text, voice, audioPath);
            const stat = await fs.stat(audioPath).catch(() => null);
            if (stat && stat.size > 200) {
                const durationMs = await getAudioDurationMs(audioPath);
                console.log(`[tts] ElevenLabs complete for section ${section.id}: ${(durationMs / 1000).toFixed(1)}s, ${stat.size} bytes`);
                return { audioPath, durationMs };
            }
        }
        catch (err) {
            console.warn(`[tts] ElevenLabs attempt ${attempt} failed for section ${section.id}:`, err.message);
            if (attempt < 2)
                await sleep(1500);
        }
    }
    // 2. Safe Fallback: Proportional silence
    console.error(`[tts] Voiceover failed for section ${section.id}, generating proportional silence`);
    await generateSilence(audioPath, estimateDuration(text));
    const durationMs = await getAudioDurationMs(audioPath);
    return { audioPath, durationMs };
}
function estimateDuration(text) {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.round((words / 2.8) * 1000);
}
async function generateSilence(outputPath, durationMs) {
    const sec = Math.max(durationMs / 1000, 0.5);
    await ffmpeg([
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=stereo",
        "-t", String(sec),
        "-q:a", "9",
        "-acodec", "libmp3lame",
        "-y", outputPath,
    ]);
}
async function getAudioDurationMs(filePath) {
    const seconds = await ffprobe(filePath);
    return Math.round(seconds * 1000) || 5000;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

import { promises as fs } from "fs";
import path from "path";
import { ffmpeg, ffprobe } from "./ffmpeg.js";
import { getTempDir } from "./tempDir.js";
export { getTempDir };
// ─── Voice catalogue ────────────────────────────────────────────────────────
export const VOICES = [
    { id: "presenter_female", label: "Aria · Warm Female", tags: ["Female", "Warm", "American"], elevenVoiceId: "21m00Tcm4TlvDq8ikWAM" },
    { id: "audiobook_female_1", label: "Ava · Natural Female", tags: ["Female", "Natural", "American"], elevenVoiceId: "EXAVITQu4vr4xnSDxMaL" },
    { id: "presenter_male", label: "Brian · Deep Male", tags: ["Male", "Deep", "American"], elevenVoiceId: "pNInz6obpgDQGcFmaJgB" },
    { id: "audiobook_male_1", label: "George · Authoritative", tags: ["Male", "Authoritative", "British"], elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
    { id: "newscast_male", label: "Guy · Neutral Male", tags: ["Male", "Neutral", "American"], elevenVoiceId: "ErXwobaYiN019PkySvjV" },
    { id: "casual_guy", label: "Andrew · Conversational Male", tags: ["Male", "Young", "American"], elevenVoiceId: "TxGEqnHWrfWFTfGW9XjX" },
    { id: "wise_woman", label: "Eleanor · Wise Female", tags: ["Female", "Mature", "British"], elevenVoiceId: "MF3mGyEYCl7XYWbV9V6O" },
    { id: "deep_space_master", label: "Magnus · Epic Narrator", tags: ["Male", "Epic", "American"], elevenVoiceId: "VR6AewLTigWG4xSOukaG" },
    { id: "calm_woman", label: "Serenity · Calm Female", tags: ["Female", "Calm", "American"], elevenVoiceId: "LcfcDJNUP1GQjkzn1xUU" },
    { id: "audiobook_female_2", label: "Grace · Storyteller Female", tags: ["Female", "Young", "American"], elevenVoiceId: "AZnzlk1XvdvUeBnXmlld" },
    { id: "audiobook_male_2", label: "Drake · Documentary Male", tags: ["Male", "Mature", "American"], elevenVoiceId: "onwK4e9ZLuTAKqWW03F9" },
    { id: "newscast_female", label: "Natalie · Professional Female", tags: ["Female", "Professional", "American"], elevenVoiceId: "ThT5KcBeYPX3keUQqHPh" },
];
const DEFAULT_ELEVEN_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George (reliable narrator)
function resolveElevenVoice(voiceId) {
    const match = VOICES.find((v) => v.id === voiceId);
    return match?.elevenVoiceId ?? DEFAULT_ELEVEN_VOICE;
}
function cleanNarrationText(text) {
    return text
        .replace(/\*+/g, "") // remove bold / italics
        .replace(/\[\d+\]/g, "") // remove citations
        .replace(/[#_~`]/g, "") // remove markdown symbols
        .replace(/\s+/g, " ")
        .trim();
}
// ─── ElevenLabs TTS Generation ──────────────────────────────────────────────
async function generateElevenLabsTTS(text, voiceId, outputPath) {
    const apiKey = (process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "").trim();
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
                    stability: 0.65,
                    similarity_boost: 0.85,
                    style: 0.15,
                    use_speaker_boost: true,
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
    const rawText = section.narration.trim();
    const text = cleanNarrationText(rawText);
    // Graphic sections / empty narration → short silence placeholder
    if (!text || section.section_type === "graphic") {
        await generateSilence(audioPath, 2500);
        return { audioPath, durationMs: 2500 };
    }
    // 1. ElevenLabs TTS
    const elevenKey = (process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "").trim();
    if (elevenKey) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[tts] ElevenLabs generating narration for section ${section.id} (attempt ${attempt})...`);
                await generateElevenLabsTTS(text, voice, audioPath);
                const stat = await fs.stat(audioPath).catch(() => null);
                if (stat && stat.size > 200) {
                    const durationMs = await getAudioDurationMs(audioPath);
                    console.log(`[tts] ElevenLabs complete for section ${section.id}: ${(durationMs / 1000).toFixed(1)}s`);
                    return { audioPath, durationMs };
                }
            }
            catch (err) {
                console.warn(`[tts] ElevenLabs attempt ${attempt} failed for section ${section.id}:`, err.message);
                if (attempt < 3)
                    await sleep(1500 * attempt);
            }
        }
    }
    else {
        console.warn(`[tts] No ELEVENLABS_API_KEY set. Utilizing natural pacing duration audio for section ${section.id}.`);
    }
    // 2. Fallback: Proportional natural silence pacing (145 WPM documentary speed)
    const estimatedMs = estimateDuration(text);
    console.log(`[tts] Section ${section.id}: pacing duration set to ${(estimatedMs / 1000).toFixed(1)}s`);
    await generateSilence(audioPath, estimatedMs);
    const durationMs = await getAudioDurationMs(audioPath);
    return { audioPath, durationMs };
}
// Natural documentary narration pacing: ~140-150 words per minute (approx 2.4 words per second)
function estimateDuration(text) {
    const words = text.split(/\s+/).filter(Boolean).length;
    // 145 WPM = ~2.42 words per second. Minimum 3.5s.
    const seconds = Math.max(words / 2.4, 3.5);
    return Math.round(seconds * 1000);
}
async function generateSilence(outputPath, durationMs) {
    const sec = Math.max(durationMs / 1000, 0.5);
    await ffmpeg([
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=stereo",
        "-t", sec.toFixed(3),
        "-q:a", "5",
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

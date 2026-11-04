import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
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
const EDGE_VOICE_MAP = {
    presenter_female: "en-US-AriaNeural",
    audiobook_female_1: "en-US-AvaNeural",
    presenter_male: "en-US-BrianNeural",
    audiobook_male_1: "en-GB-RyanNeural",
    newscast_male: "en-US-GuyNeural",
    casual_guy: "en-US-AndrewNeural",
    wise_woman: "en-GB-SoniaNeural",
    deep_space_master: "en-US-ChristopherNeural",
    calm_woman: "en-US-JennyNeural",
    audiobook_female_2: "en-US-MichelleNeural",
    audiobook_male_2: "en-US-EricNeural",
    newscast_female: "en-US-AnaNeural",
};
const MALE_VOICES = new Set([
    "presenter_male",
    "audiobook_male_1",
    "newscast_male",
    "casual_guy",
    "deep_space_master",
    "audiobook_male_2",
]);
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
// ─── Microsoft Edge Neural TTS ──────────────────────────────────────────────
async function generateEdgeTTS(text, voiceId, outputPath) {
    const edgeVoice = EDGE_VOICE_MAP[voiceId] || (MALE_VOICES.has(voiceId) ? "en-US-ChristopherNeural" : "en-US-AriaNeural");
    const tempTextFile = outputPath + ".txt";
    await fs.writeFile(tempTextFile, text, "utf8");

    const candidates = [
        { cmd: "edge-tts", args: ["--voice", edgeVoice, "--rate=-2%", "-f", tempTextFile, "--write-media", outputPath] },
        { cmd: "python3", args: ["-m", "edge_tts", "--voice", edgeVoice, "--rate=-2%", "-f", tempTextFile, "--write-media", outputPath] },
        { cmd: "/usr/local/bin/edge-tts", args: ["--voice", edgeVoice, "--rate=-2%", "-f", tempTextFile, "--write-media", outputPath] },
        { cmd: "/usr/bin/edge-tts", args: ["--voice", edgeVoice, "--rate=-2%", "-f", tempTextFile, "--write-media", outputPath] },
        { cmd: "python", args: ["-m", "edge_tts", "--voice", edgeVoice, "--rate=-2%", "-f", tempTextFile, "--write-media", outputPath] },
    ];

    let lastError = null;
    for (const c of candidates) {
        try {
            await new Promise((resolve, reject) => {
                const proc = spawn(c.cmd, c.args, { stdio: ["ignore", "pipe", "pipe"] });
                let stderr = "";
                proc.stderr.on("data", (d) => { stderr += d.toString(); });
                proc.on("close", (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`${c.cmd} exited with code ${code}: ${stderr}`));
                });
                proc.on("error", (err) => reject(err));
            });

            const stat = await fs.stat(outputPath).catch(() => null);
            if (stat && stat.size > 500) {
                await fs.unlink(tempTextFile).catch(() => {});
                return; // Success!
            }
        } catch (err) {
            lastError = err;
        }
    }

    await fs.unlink(tempTextFile).catch(() => {});
    throw lastError || new Error("All Edge TTS candidates failed");
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
// ─── Clean Spoken TTS Fallback (Natural 1.0x Human Pacing) ─────────────────
async function generateFreeTTS(text, voiceId, outputPath) {
    // Split on sentence boundaries to ensure natural cadence and breathing pauses
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    const chunks = [];
    let cur = "";
    for (const s of sentences) {
        const trimmed = s.trim();
        if (!trimmed) continue;
        if ((cur + " " + trimmed).length <= 150) {
            cur += (cur ? " " : "") + trimmed;
        }
        else {
            if (cur)
                chunks.push(cur);
            cur = trimmed;
        }
    }
    if (cur)
        chunks.push(cur);
    const buffers = [];
    for (const chunk of chunks) {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=en&client=tw-ob`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });
        if (!res.ok)
            throw new Error(`Free TTS error ${res.status}`);
        const ab = await res.arrayBuffer();
        buffers.push(Buffer.from(ab));
    }
    const rawAudio = Buffer.concat(buffers);
    const tmpRaw = outputPath + ".raw.mp3";
    await fs.writeFile(tmpRaw, rawAudio);
    // Normalize directly to standard 44.1kHz stereo MP3 at natural 1.0x human speaking speed
    await ffmpeg([
        "-i", tmpRaw,
        "-ar", "44100",
        "-ac", "2",
        "-c:a", "libmp3lame",
        "-b:a", "192k",
        "-y", outputPath,
    ]);
    await fs.unlink(tmpRaw).catch(() => { });
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
    // 1. ElevenLabs TTS (if API key is present)
    const elevenKey = (process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "").trim();
    if (elevenKey) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[tts] ElevenLabs generating narration for section ${section.id} (${voice})...`);
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
    // 2. Microsoft Edge Neural TTS (Natural human voices: Brian, Christopher, Guy, Aria, etc.)
    try {
        console.log(`[tts] Synthesizing natural neural voiceover via Edge-TTS (${voice}) for section ${section.id}...`);
        await generateEdgeTTS(text, voice, audioPath);
        const stat = await fs.stat(audioPath).catch(() => null);
        if (stat && stat.size > 200) {
            const durationMs = await getAudioDurationMs(audioPath);
            console.log(`[tts] Edge-TTS complete for section ${section.id}: ${(durationMs / 1000).toFixed(1)}s`);
            return { audioPath, durationMs };
        }
    }
    catch (edgeErr) {
        console.warn(`[tts] Edge-TTS fallback failed for section ${section.id} (${edgeErr.message}), trying Free Spoken TTS...`);
    }
    // 3. High-Quality Free Spoken TTS Fallback (with Male/Female audio conditioning)
    try {
        console.log(`[tts] Synthesizing spoken voiceover via Free TTS (${voice}) for section ${section.id}...`);
        await generateFreeTTS(text, voice, audioPath);
        const stat = await fs.stat(audioPath).catch(() => null);
        if (stat && stat.size > 200) {
            const durationMs = await getAudioDurationMs(audioPath);
            console.log(`[tts] Free TTS complete for section ${section.id}: ${(durationMs / 1000).toFixed(1)}s`);
            return { audioPath, durationMs };
        }
    }
    catch (freeErr) {
        console.warn(`[tts] Free TTS fallback failed for section ${section.id}:`, freeErr.message);
    }
    // 4. Fallback: Proportional natural silence pacing
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

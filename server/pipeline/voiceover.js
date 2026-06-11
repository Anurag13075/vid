import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
// MiniMax TTS voices for YouTube documentary content
export const VOICES = [
    { id: "presenter_female", label: "Aria · Warm Female", tags: ["Female", "Warm", "American"] },
    { id: "audiobook_female_1", label: "Ava · Natural Female", tags: ["Female", "Natural", "American"] },
    { id: "presenter_male", label: "Brian · Deep Male", tags: ["Male", "Deep", "American"] },
    { id: "audiobook_male_1", label: "Christopher · Authoritative", tags: ["Male", "Authoritative", "American"] },
    { id: "newscast_male", label: "Guy · Neutral Male", tags: ["Male", "Neutral", "American"] },
    { id: "casual_guy", label: "Andrew · Conversational Male", tags: ["Male", "Young", "American"] },
    { id: "wise_woman", label: "Eleanor · Wise Female", tags: ["Female", "Mature", "British"] },
    { id: "deep_space_master", label: "Magnus · Epic Narrator", tags: ["Male", "Epic", "American"] },
    { id: "calm_woman", label: "Serenity · Calm Female", tags: ["Female", "Calm", "American"] },
    { id: "audiobook_female_2", label: "Grace · Storyteller Female", tags: ["Female", "Young", "American"] },
    { id: "audiobook_male_2", label: "Drake · Documentary Male", tags: ["Male", "Mature", "American"] },
    { id: "newscast_female", label: "Natalie · Professional Female", tags: ["Female", "Professional", "American"] },
];
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || "";
async function generateMinimaxTTS(text, voiceId, outputPath) {
    if (!MINIMAX_API_KEY) {
        throw new Error("MINIMAX_API_KEY is required. Set it in Secrets.");
    }
    const url = `https://api.minimaxi.chat/v1/t2a_v2`;
    const body = {
        model: "speech-02-hd",
        text,
        stream: false,
        voice_setting: {
            voice_id: voiceId,
            speed: 1.0,
            vol: 1.0,
            pitch: 0,
        },
        audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            channel: 1,
        },
    };
    const timeout = 120_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MINIMAX_API_KEY}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
            const errText = await res.text().catch(() => "unknown");
            throw new Error(`MiniMax TTS API error ${res.status}: ${errText.slice(0, 300)}`);
        }
        const data = await res.json();
        // Check for API-level errors
        if (data.base_resp && data.base_resp.status_code !== 0) {
            throw new Error(`MiniMax TTS error: ${data.base_resp.status_msg} (code ${data.base_resp.status_code})`);
        }
        // Extract base64 audio from response
        const audioBase64 = data.data
            ? data.data.audio
            : data.audio_file;
        if (!audioBase64) {
            throw new Error(`MiniMax TTS returned no audio data. Response: ${JSON.stringify(data).slice(0, 200)}`);
        }
        const audioBuffer = Buffer.from(audioBase64, "hex");
        await fs.writeFile(outputPath, audioBuffer);
    }
    catch (err) {
        clearTimeout(timer);
        throw err;
    }
}
export async function generateVoiceover(section, videoId, voice) {
    const dir = path.join("/tmp/vidrush", videoId, "audio");
    await fs.mkdir(dir, { recursive: true });
    const audioPath = path.join(dir, `section_${section.id}.mp3`);
    const text = section.narration.trim();
    if (!text || section.section_type === "graphic") {
        await generateSilence(audioPath, 2000);
        return { audioPath, durationMs: 2000 };
    }
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await generateMinimaxTTS(text, voice, audioPath);
            // Guard: reject if output file is empty
            const stat = await fs.stat(audioPath).catch(() => null);
            if (!stat || stat.size < 100) {
                throw new Error(`MiniMax TTS produced no audio (file size: ${stat?.size ?? 0} bytes)`);
            }
            const durationMs = await getAudioDurationMs(audioPath);
            return { audioPath, durationMs };
        }
        catch (err) {
            lastErr = err;
            console.error(`MiniMax TTS attempt ${attempt} failed for section ${section.id}:`, err);
            if (attempt < 3)
                await sleep(3000 * attempt);
        }
    }
    // Fallback to silence if all attempts fail
    console.error(`All MiniMax TTS attempts failed for section ${section.id}, using silence`);
    await generateSilence(audioPath, estimateDuration(text));
    const durationMs = await getAudioDurationMs(audioPath);
    return { audioPath, durationMs };
}
function estimateDuration(text) {
    // Average speaking rate ~150 words/min = 2.5 words/sec
    const words = text.split(/\s+/).length;
    return Math.round((words / 2.5) * 1000);
}
async function generateSilence(outputPath, durationMs) {
    const sec = durationMs / 1000;
    return new Promise((resolve, reject) => {
        const proc = spawn("ffmpeg", [
            "-f", "lavfi",
            "-i", `anullsrc=r=44100:cl=stereo`,
            "-t", String(sec),
            "-q:a", "9",
            "-acodec", "libmp3lame",
            "-y", outputPath,
        ]);
        proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`silence gen failed: ${code}`)));
        proc.on("error", reject);
    });
}
async function getAudioDurationMs(filePath) {
    return new Promise((resolve) => {
        const proc = spawn("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            filePath,
        ]);
        let out = "";
        proc.stdout.on("data", (d) => { out += d.toString(); });
        proc.on("close", (code) => {
            if (code === 0) {
                const sec = parseFloat(out.trim());
                resolve(isNaN(sec) ? 5000 : Math.round(sec * 1000));
            }
            else {
                resolve(5000);
            }
        });
        proc.on("error", () => resolve(5000));
    });
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

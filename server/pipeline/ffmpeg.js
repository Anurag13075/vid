import { spawn, spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";
// Resolve FFmpeg binary cross-platform
const FFMPEG_PATH = (() => {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }
    // Use ffmpeg-static npm binary if present
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        return ffmpegStatic;
    }
    // Known Windows paths
    if (process.platform === "win32") {
        const commonWinPaths = [
            "C:\\Program Files\\VideoCompress\\bin\\ffmpeg.exe",
            "C:\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
            path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Links\\ffmpeg.exe"),
        ];
        for (const p of commonWinPaths) {
            if (p && fs.existsSync(p))
                return p;
        }
    }
    // System fallback
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "where.exe" : "which";
    try {
        const result = spawnSync(cmd, ["ffmpeg"], { encoding: "utf8" });
        if (result.status === 0 && result.stdout?.trim()) {
            return result.stdout.trim().split("\r\n")[0].split("\n")[0];
        }
    }
    catch { }
    return "ffmpeg";
})();
const FFPROBE_PATH = (() => {
    if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
        return process.env.FFPROBE_PATH;
    }
    // Check sibling of ffmpeg
    const sibling = FFMPEG_PATH.replace(/ffmpeg(\.exe)?$/i, (m) => (m.endsWith(".exe") ? "ffprobe.exe" : "ffprobe"));
    if (fs.existsSync(sibling)) {
        return sibling;
    }
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "where.exe" : "which";
    try {
        const result = spawnSync(cmd, ["ffprobe"], { encoding: "utf8" });
        if (result.status === 0 && result.stdout?.trim()) {
            return result.stdout.trim().split("\r\n")[0].split("\n")[0];
        }
    }
    catch { }
    return FFMPEG_PATH;
})();
export { FFMPEG_PATH, FFPROBE_PATH };
const FFMPEG_TIMEOUT_MS = 15 * 60 * 1000;
function runProcess(command, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        proc.stdout?.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr?.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        const timer = setTimeout(() => {
            proc.kill("SIGKILL");
            reject(new Error(`${command} timed out after ${FFMPEG_TIMEOUT_MS / 1000}s`));
        }, FFMPEG_TIMEOUT_MS);
        proc.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve({ stdout, stderr });
            }
            else {
                reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-3000)}`));
            }
        });
        proc.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
export async function ffmpeg(args) {
    try {
        await runProcess(FFMPEG_PATH, args);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`FFmpeg failed: ${message}\nCommand: ffmpeg ${args.join(" ")}`);
    }
}
// ─── Fast, reliable audio/video duration probe ──────────────────────────────
export async function ffprobe(filePath) {
    try {
        const isProbe = FFPROBE_PATH.toLowerCase().includes("ffprobe");
        const args = isProbe
            ? ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath]
            : ["-hide_banner", "-i", filePath];
        const res = spawnSync(FFPROBE_PATH, args, { encoding: "utf8", timeout: 12000 });
        if (isProbe && res.stdout?.trim()) {
            const dur = parseFloat(res.stdout.trim());
            if (Number.isFinite(dur) && dur > 0)
                return dur;
        }
        const match = (res.stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/i);
        if (match) {
            const dur = Number(match[1]) * 3600 + Number(match[2]) * 60 + parseFloat(match[3]);
            if (Number.isFinite(dur) && dur > 0)
                return dur;
        }
    }
    catch (err) {
        console.warn(`[ffprobe] probing ${filePath} failed:`, err.message);
    }
    console.warn(`[ffprobe] could not determine duration for ${filePath}, defaulting to 5s`);
    return 5;
}

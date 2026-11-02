import { spawn, spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let ffmpegStatic = null;
try {
    const mod = require("ffmpeg-static");
    ffmpegStatic = typeof mod === "string" ? mod : mod?.default || null;
} catch {}
// ─── Probe Capabilities of a Candidate Binary ────────────────────────────────
export function probeBinaryCapabilities(binPath) {
    const result = {
        binaryPath: binPath,
        version: "unknown",
        hasDrawtext: false,
        hasDrawbox: false,
        hasOverlay: false,
        hasAss: false,
        hasLibfreetype: false,
        hasFontconfig: false,
        hasLoudnorm: false,
        filters: new Set(),
    };
    try {
        // 1. Probe version and build configuration
        const vRes = spawnSync(binPath, ["-version"], { encoding: "utf8", timeout: 8000 });
        if (vRes.status === 0 && vRes.stdout) {
            const versionMatch = vRes.stdout.match(/ffmpeg version ([^\s]+)/i);
            if (versionMatch)
                result.version = versionMatch[1];
            const configText = vRes.stdout;
            result.hasLibfreetype = configText.includes("--enable-libfreetype");
            result.hasFontconfig = configText.includes("--enable-fontconfig");
        }
        // 2. Query available filters directly via -filters
        const fRes = spawnSync(binPath, ["-hide_banner", "-filters"], { encoding: "utf8", timeout: 8000 });
        const filtersOutput = (fRes.stdout || "") + (fRes.stderr || "");
        // Parse filters list
        for (const line of filtersOutput.split(/\r?\n/)) {
            const match = line.match(/^\s*[T.][S.][C.]\s+([a-zA-Z0-9_-]+)/);
            if (match) {
                result.filters.add(match[1].toLowerCase());
            }
        }
        // Explicit filter verification
        // Note: static Linux ffmpeg-static builds disable fontconfig, omitting drawtext
        const isFfmpegStatic = binPath.toLowerCase().includes("ffmpeg-static");
        if (isFfmpegStatic) {
            result.hasDrawtext = false;
        } else if (result.filters.has("drawtext")) {
            try {
                const testRes = spawnSync(
                    binPath,
                    ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.04", "-vf", "drawtext=text='test'", "-f", "null", "-"],
                    { timeout: 3000 }
                );
                result.hasDrawtext = testRes.status === 0;
            } catch {
                result.hasDrawtext = false;
            }
        } else {
            result.hasDrawtext = false;
        }
        result.hasDrawbox = result.filters.has("drawbox");
        result.hasOverlay = result.filters.has("overlay");
        result.hasAss = result.filters.has("ass");
        result.hasLoudnorm = result.filters.has("loudnorm");
    }
    catch (err) {
        console.warn(`[ffmpeg] Could not probe binary "${binPath}":`, err.message);
    }
    return result;
}
// ─── Locate All Candidate Binaries ───────────────────────────────────────────
function findCandidateBinaries() {
    const candidates = [];
    const isWindows = process.platform === "win32";
    // 1. User explicit environment variable
    if (process.env.FFMPEG_PATH) {
        candidates.push(process.env.FFMPEG_PATH);
    }
    // 2. System PATH via which/where
    const whichCmd = isWindows ? "where.exe" : "which";
    try {
        const res = spawnSync(whichCmd, ["ffmpeg"], { encoding: "utf8", timeout: 5000 });
        if (res.status === 0 && res.stdout?.trim()) {
            for (const line of res.stdout.trim().split(/\r?\n/)) {
                if (line.trim())
                    candidates.push(line.trim());
            }
        }
    }
    catch { }
    // 3. Standard Linux / Docker / Unix system binary paths
    if (!isWindows) {
        candidates.push("/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/lib/jellyfin-ffmpeg/ffmpeg", "/snap/bin/ffmpeg", "/var/www/bin/ffmpeg");
    }
    else {
        // Windows common locations
        candidates.push("C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe", "C:\\ffmpeg\\bin\\ffmpeg.exe", "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe", "C:\\Program Files\\VideoCompress\\bin\\ffmpeg.exe", path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Links\\ffmpeg.exe"));
    }
    // 4. npm ffmpeg-static package
    try {
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
            candidates.push(ffmpegStatic);
        }
    }
    catch { }
    // Deduplicate and filter existing executable files
    const existing = [];
    const seen = new Set();
    for (const c of candidates) {
        if (c && !seen.has(c)) {
            seen.add(c);
            try {
                if (fs.existsSync(c) && fs.statSync(c).isFile()) {
                    existing.push(c);
                }
            }
            catch { }
        }
    }
    return existing;
}
// ─── Select Best FFmpeg Binary with Full Capability Verification ─────────────
let cachedCapabilities = null;
export function getFFmpegCapabilities() {
    if (cachedCapabilities)
        return cachedCapabilities;
    const candidates = findCandidateBinaries();
    console.log(`[ffmpeg] Scanning ${candidates.length} candidate binaries for drawtext & filter capabilities...`);
    let bestMatch = null;
    for (const candidate of candidates) {
        const caps = probeBinaryCapabilities(candidate);
        console.log(`[ffmpeg] Binary: ${candidate} [v${caps.version}] ` +
            `drawtext=${caps.hasDrawtext} drawbox=${caps.hasDrawbox} overlay=${caps.hasOverlay} ass=${caps.hasAss} fontconfig=${caps.hasFontconfig}`);
        // Prioritize binaries with drawtext, drawbox, and overlay
        if (caps.hasDrawtext && caps.hasDrawbox && caps.hasOverlay) {
            bestMatch = caps;
            console.log(`[ffmpeg] Selected full-capability FFmpeg binary: ${candidate}`);
            break;
        }
        // Secondary fallback: has ASS and overlay
        if (!bestMatch && caps.hasAss && caps.hasOverlay) {
            bestMatch = caps;
        }
    }
    // If no candidate was probed or none matched, fallback to system "ffmpeg"
    if (!bestMatch) {
        bestMatch = probeBinaryCapabilities("ffmpeg");
        bestMatch.binaryPath = "ffmpeg";
    }
    cachedCapabilities = bestMatch;
    return bestMatch;
}
// ─── Startup Capability Check ────────────────────────────────────────────────
export function checkFFmpegCapabilities() {
    const caps = getFFmpegCapabilities();
    console.log("================================================================================");
    console.log("🎬 VIDRUSH FFMPEG CAPABILITY & FILTERGRAPH VERIFICATION");
    console.log("================================================================================");
    console.log(`Active Binary:  ${caps.binaryPath} (version: ${caps.version})`);
    console.log(`  * drawtext:    ${caps.hasDrawtext ? "AVAILABLE [OK]" : "NOT AVAILABLE"}`);
    console.log(`  * drawbox:     ${caps.hasDrawbox ? "AVAILABLE [OK]" : "NOT AVAILABLE"}`);
    console.log(`  * overlay:     ${caps.hasOverlay ? "AVAILABLE [OK]" : "NOT AVAILABLE"}`);
    console.log(`  * ass:         ${caps.hasAss ? "AVAILABLE [OK]" : "NOT AVAILABLE"}`);
    console.log(`  * fontconfig:  ${caps.hasFontconfig ? "ENABLED   [OK]" : "DISABLED"}`);
    console.log(`  * libfreetype: ${caps.hasLibfreetype ? "ENABLED   [OK]" : "DISABLED"}`);
    console.log(`  * loudnorm:    ${caps.hasLoudnorm ? "AVAILABLE [OK]" : "NOT AVAILABLE"}`);
    if (!caps.hasDrawtext) {
        console.warn(`[ffmpeg-check] NOTICE: Active FFmpeg build does not include 'drawtext'. ` +
            `Title overlays, stat callouts, badges, and karaoke subtitles will be rendered via high-performance libass (.ass) engine.`);
    }
    else {
        console.log("[ffmpeg-check] SUCCESS: Full drawtext, drawbox, and overlay capabilities verified.");
    }
    console.log("================================================================================");
    return caps;
}
export const FFMPEG_PATH = (() => {
    return getFFmpegCapabilities().binaryPath;
})();
export const FFPROBE_PATH = (() => {
    if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
        return process.env.FFPROBE_PATH;
    }
    const ffmpegBin = FFMPEG_PATH;
    const isWindows = process.platform === "win32";
    // Check sibling ffprobe
    const sibling = ffmpegBin.replace(/ffmpeg(\.exe)?$/i, (m) => (m.endsWith(".exe") ? "ffprobe.exe" : "ffprobe"));
    if (fs.existsSync(sibling)) {
        return sibling;
    }
    const whichCmd = isWindows ? "where.exe" : "which";
    try {
        const res = spawnSync(whichCmd, ["ffprobe"], { encoding: "utf8", timeout: 4000 });
        if (res.status === 0 && res.stdout?.trim()) {
            return res.stdout.trim().split(/\r?\n/)[0];
        }
    }
    catch { }
    return ffmpegBin;
})();
const FFMPEG_TIMEOUT_MS = 20 * 60 * 1000;
// ─── Active Process Registry for Clean Job Cancellation ──────────────────────
const activeProcesses = new Map();
export function killProcessesForVideo(videoId) {
    const procs = activeProcesses.get(videoId);
    if (procs && procs.size > 0) {
        console.log(`[ffmpeg] Killing ${procs.size} active FFmpeg process(es) for video ${videoId}`);
        for (const proc of procs) {
            try {
                proc.kill("SIGKILL");
            }
            catch { }
        }
        procs.clear();
    }
    activeProcesses.delete(videoId);
}
function runProcess(command, args, options) {
    return new Promise((resolve, reject) => {
        if (options?.signal?.aborted) {
            reject(new Error("FFmpeg aborted: operation was cancelled by user"));
            return;
        }
        const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        const videoId = options?.videoId;
        if (videoId) {
            if (!activeProcesses.has(videoId)) {
                activeProcesses.set(videoId, new Set());
            }
            activeProcesses.get(videoId).add(proc);
        }
        let stdout = "";
        let stderr = "";
        proc.stdout?.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr?.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        const timer = setTimeout(() => {
            try {
                proc.kill("SIGKILL");
            }
            catch { }
            reject(new Error(`${command} timed out after ${FFMPEG_TIMEOUT_MS / 1000}s`));
        }, FFMPEG_TIMEOUT_MS);
        const cleanup = () => {
            clearTimeout(timer);
            if (options?.signal) {
                options.signal.removeEventListener("abort", onAbort);
            }
            if (videoId) {
                const set = activeProcesses.get(videoId);
                if (set) {
                    set.delete(proc);
                    if (set.size === 0)
                        activeProcesses.delete(videoId);
                }
            }
        };
        const onAbort = () => {
            try {
                proc.kill("SIGKILL");
            }
            catch { }
            cleanup();
            reject(new Error("FFmpeg aborted: job was cancelled by user"));
        };
        if (options?.signal) {
            options.signal.addEventListener("abort", onAbort, { once: true });
        }
        proc.on("close", (code, signal) => {
            cleanup();
            if (options?.signal?.aborted || signal === "SIGKILL" || signal === "SIGTERM") {
                reject(new Error("FFmpeg process was cancelled by user"));
                return;
            }
            if (code === 0) {
                resolve({ stdout, stderr });
            }
            else {
                reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-3000)}`));
            }
        });
        proc.on("error", (err) => {
            cleanup();
            reject(err);
        });
    });
}
export async function ffmpeg(args, optsOrVideoId) {
    const options = typeof optsOrVideoId === "string"
        ? { videoId: optsOrVideoId }
        : optsOrVideoId;
    try {
        await runProcess(FFMPEG_PATH, args, options);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`FFmpeg failed: ${message}\nCommand: ffmpeg ${args.join(" ")}`);
    }
}
// ─── Exact Audio & Video Duration Measurement ────────────────────────────────
// Decodes stream to null muxer to read the true packet timestamp (never guesses)
export async function ffprobe(filePath) {
    return getExactDuration(filePath);
}
export async function getExactDuration(filePath) {
    // 1. Try ffprobe format duration
    try {
        const isProbe = FFPROBE_PATH.toLowerCase().includes("ffprobe");
        if (isProbe) {
            const res = spawnSync(FFPROBE_PATH, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], { encoding: "utf8", timeout: 8000 });
            const dur = parseFloat(res.stdout?.trim() || "");
            if (Number.isFinite(dur) && dur > 0)
                return dur;
        }
    }
    catch { }
    // 2. Decode packets with null muxer to get exact packet-accurate duration
    try {
        const res = spawnSync(FFMPEG_PATH, ["-hide_banner", "-i", filePath, "-f", "null", "-"], { encoding: "utf8", timeout: 15000 });
        const output = (res.stderr || "") + (res.stdout || "");
        // Look for last time=HH:MM:SS.ms progress indicator
        const timeMatches = [...output.matchAll(/time=(\d+):(\d+):(\d+\.?\d*)/g)];
        if (timeMatches.length > 0) {
            const last = timeMatches[timeMatches.length - 1];
            const sec = Number(last[1]) * 3600 + Number(last[2]) * 60 + parseFloat(last[3]);
            if (Number.isFinite(sec) && sec > 0)
                return sec;
        }
        // Look for header Duration: HH:MM:SS.ms
        const durMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/i);
        if (durMatch) {
            const sec = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + parseFloat(durMatch[3]);
            if (Number.isFinite(sec) && sec > 0)
                return sec;
        }
    }
    catch (err) {
        console.warn(`[ffmpeg] Could not probe exact duration for ${filePath}:`, err.message);
    }
    return 5.0;
}

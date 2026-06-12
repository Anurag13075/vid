import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_PATH = ffmpegStatic || "ffmpeg";
const FFPROBES: string[] = ["ffprobe", "ffprobe-static", "ffprobe-static/bin/ffprobe"];

function runProcess(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

export async function ffmpeg(args: string[]): Promise<void> {
  try {
    await runProcess(FFMPEG_PATH, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FFmpeg failed: ${message}\nCommand: ${FFMPEG_PATH} ${args.join(" ")}`);
  }
}

async function probeWithBinary(binary: string, filePath: string): Promise<number> {
  const { stdout } = await runProcess(binary, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const sec = parseFloat(stdout.trim());
  return Number.isFinite(sec) && sec > 0 ? sec : 0;
}

async function probeWithFallback(filePath: string): Promise<number> {
  const { stderr } = await runProcess(FFMPEG_PATH, [
    "-hide_banner",
    "-loglevel", "error",
    "-i", filePath,
    "-f", "null",
    "-",
  ]);

  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/i);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + parseFloat(seconds);
}

export async function ffprobe(filePath: string): Promise<number> {
  for (const binary of ["ffprobe", FFMPEG_PATH]) {
    try {
      if (binary === FFMPEG_PATH) {
        const duration = await probeWithFallback(filePath);
        if (duration > 0) return duration;
      } else {
        const duration = await probeWithBinary(binary, filePath);
        if (duration > 0) return duration;
      }
    } catch {
      continue;
    }
  }

  return 0;
}

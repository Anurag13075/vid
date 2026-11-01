export interface FFmpegCapabilities {
    binaryPath: string;
    version: string;
    hasDrawtext: boolean;
    hasDrawbox: boolean;
    hasOverlay: boolean;
    hasAss: boolean;
    hasLibfreetype: boolean;
    hasFontconfig: boolean;
    hasLoudnorm: boolean;
    filters: Set<string>;
}
export declare function probeBinaryCapabilities(binPath: string): FFmpegCapabilities;
export declare function getFFmpegCapabilities(): FFmpegCapabilities;
export declare function checkFFmpegCapabilities(): FFmpegCapabilities;
export declare const FFMPEG_PATH: string;
export declare const FFPROBE_PATH: any;
export interface FFmpegOptions {
    videoId?: string;
    signal?: AbortSignal;
}
export declare function killProcessesForVideo(videoId: string): void;
export declare function ffmpeg(args: string[], optsOrVideoId?: string | FFmpegOptions): Promise<void>;
export declare function ffprobe(filePath: string): Promise<number>;
export declare function getExactDuration(filePath: string): Promise<number>;

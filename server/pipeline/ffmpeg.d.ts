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
export declare function ffmpeg(args: string[]): Promise<void>;
export declare function ffprobe(filePath: string): Promise<number>;
export declare function getExactDuration(filePath: string): Promise<number>;

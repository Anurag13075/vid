declare const FFMPEG_PATH: string;
export { FFMPEG_PATH };
export declare function ffmpeg(args: string[]): Promise<void>;
export declare function ffprobe(filePath: string): Promise<number>;

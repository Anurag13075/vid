declare const FFMPEG_PATH: any;
declare const FFPROBE_PATH: any;
export { FFMPEG_PATH, FFPROBE_PATH };
export declare function ffmpeg(args: string[]): Promise<void>;
export declare function ffprobe(filePath: string): Promise<number>;

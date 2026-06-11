import type { ScriptSection, RenderStep } from "./types.js";
type ProgressFn = (step: number, total: number, label: string) => void;
export declare const RENDER_STEPS: RenderStep[];
export declare function assemble(videoId: string, videoTitle: string, sections: ScriptSection[], audioPaths: (string | null)[], footagePaths: (string | null)[], bgmPath: string | null, outputDir: string, onProgress: ProgressFn): Promise<{
    videoPath: string;
    thumbPath: string;
}>;
export {};

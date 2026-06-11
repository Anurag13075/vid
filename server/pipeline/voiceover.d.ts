import type { ScriptSection } from "./types.js";
export declare const VOICES: {
    id: string;
    label: string;
    tags: string[];
}[];
export declare function generateVoiceover(section: ScriptSection, videoId: string, voice: string): Promise<{
    audioPath: string;
    durationMs: number;
}>;

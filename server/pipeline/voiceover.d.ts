import type { ScriptSection } from "./types.js";
export declare function getTempDir(subpath?: string): string;
export declare const VOICES: {
    id: string;
    label: string;
    tags: string[];
    elevenVoiceId: string;
}[];
export declare function generateVoiceover(section: ScriptSection, videoId: string, voice: string): Promise<{
    audioPath: string;
    durationMs: number;
}>;

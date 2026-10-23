import type { ScriptSection } from "./types.js";
import { getTempDir } from "./tempDir.js";
export { getTempDir };
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

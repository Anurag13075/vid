export declare function startPipeline(videoId: string): void;
export declare function startIncrementalReRender(videoId: string, options: {
    affectedScenes?: number[];
    newVoice?: string;
    newTheme?: string;
    rewriteInstructions?: Array<{
        sceneIndex: number;
        newNarration?: string;
        newKeywords?: string[];
    }>;
}): void;

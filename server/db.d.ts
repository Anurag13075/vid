interface VideoRecord {
    id: string;
    title: string;
    voice: string;
    length: string;
    theme?: string;
    background?: string;
    mode?: string;
    stage: string;
    progress: number;
    message?: string;
    script?: any;
    clips?: any;
    render_steps?: any;
    render_progress?: number;
    video_url?: string;
    thumbnail_url?: string;
    duration_seconds?: number;
    error_message?: string;
    created_at: string;
    updated_at: string;
}
export declare function query(text: string, params?: unknown[], retries?: number): Promise<any>;
export declare function initDb(): Promise<void>;
export declare function getVideo(id: string): Promise<VideoRecord | null>;
export declare function updateVideo(id: string, fields: Record<string, unknown>): Promise<void>;
export declare function createVideo(data: {
    id: string;
    title: string;
    voice: string;
    length: string;
    theme?: string;
    background?: string;
    mode?: string;
}): Promise<void>;
export declare function listVideos(): Promise<any[]>;
export {};

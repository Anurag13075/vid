import { z } from "zod";
export declare const CreateVideoAction: z.ZodObject<{
    type: z.ZodLiteral<"create_video">;
    topic: z.ZodString;
    voice: z.ZodOptional<z.ZodString>;
    length: z.ZodOptional<z.ZodEnum<["short", "medium", "long"]>>;
    theme: z.ZodOptional<z.ZodEnum<["crime", "history", "modern", "minimalist", "standard"]>>;
}, "strip", z.ZodTypeAny, {
    type: "create_video";
    topic: string;
    length?: "short" | "medium" | "long" | undefined;
    voice?: string | undefined;
    theme?: "modern" | "crime" | "history" | "minimalist" | "standard" | undefined;
}, {
    type: "create_video";
    topic: string;
    length?: "short" | "medium" | "long" | undefined;
    voice?: string | undefined;
    theme?: "modern" | "crime" | "history" | "minimalist" | "standard" | undefined;
}>;
export declare const RewriteSceneAction: z.ZodObject<{
    type: z.ZodLiteral<"rewrite_scene">;
    scene_index: z.ZodNumber;
    instruction: z.ZodString;
    new_narration: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "rewrite_scene";
    scene_index: number;
    instruction: string;
    new_narration?: string | undefined;
}, {
    type: "rewrite_scene";
    scene_index: number;
    instruction: string;
    new_narration?: string | undefined;
}>;
export declare const ChangeVoiceAction: z.ZodObject<{
    type: z.ZodLiteral<"change_voice">;
    voice: z.ZodString;
}, "strip", z.ZodTypeAny, {
    voice: string;
    type: "change_voice";
}, {
    voice: string;
    type: "change_voice";
}>;
export declare const ReplaceFootageAction: z.ZodObject<{
    type: z.ZodLiteral<"replace_footage">;
    scene_index: z.ZodNumber;
    new_keywords: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type: "replace_footage";
    scene_index: number;
    new_keywords: string[];
}, {
    type: "replace_footage";
    scene_index: number;
    new_keywords: string[];
}>;
export declare const SetThemeAction: z.ZodObject<{
    type: z.ZodLiteral<"set_theme">;
    theme: z.ZodEnum<["crime", "history", "modern", "minimalist", "standard"]>;
}, "strip", z.ZodTypeAny, {
    theme: "modern" | "crime" | "history" | "minimalist" | "standard";
    type: "set_theme";
}, {
    theme: "modern" | "crime" | "history" | "minimalist" | "standard";
    type: "set_theme";
}>;
export declare const SetCaptionsAction: z.ZodObject<{
    type: z.ZodLiteral<"set_captions">;
    enabled: z.ZodBoolean;
    accent_color: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "set_captions";
    enabled: boolean;
    accent_color?: string | undefined;
}, {
    type: "set_captions";
    enabled: boolean;
    accent_color?: string | undefined;
}>;
export declare const SetPacingAction: z.ZodObject<{
    type: z.ZodLiteral<"set_pacing">;
    speed: z.ZodEnum<["fast", "normal", "slow"]>;
}, "strip", z.ZodTypeAny, {
    type: "set_pacing";
    speed: "fast" | "normal" | "slow";
}, {
    type: "set_pacing";
    speed: "fast" | "normal" | "slow";
}>;
export declare const UndoAction: z.ZodObject<{
    type: z.ZodLiteral<"undo">;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "undo";
    description?: string | undefined;
}, {
    type: "undo";
    description?: string | undefined;
}>;
export declare const ExportAction: z.ZodObject<{
    type: z.ZodLiteral<"export">;
    format: z.ZodDefault<z.ZodEnum<["mp4", "webm", "audio_only"]>>;
    resolution: z.ZodDefault<z.ZodEnum<["1080p", "720p", "4k"]>>;
}, "strip", z.ZodTypeAny, {
    type: "export";
    format: "mp4" | "webm" | "audio_only";
    resolution: "1080p" | "720p" | "4k";
}, {
    type: "export";
    format?: "mp4" | "webm" | "audio_only" | undefined;
    resolution?: "1080p" | "720p" | "4k" | undefined;
}>;
export declare const NavigateAction: z.ZodObject<{
    type: z.ZodLiteral<"navigate">;
    action: z.ZodEnum<["play", "pause", "toggle_playback", "jump_scene", "seek", "mute", "unmute"]>;
    target_time_sec: z.ZodOptional<z.ZodNumber>;
    scene_index: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "navigate";
    action: "pause" | "play" | "toggle_playback" | "jump_scene" | "seek" | "mute" | "unmute";
    scene_index?: number | undefined;
    target_time_sec?: number | undefined;
}, {
    type: "navigate";
    action: "pause" | "play" | "toggle_playback" | "jump_scene" | "seek" | "mute" | "unmute";
    scene_index?: number | undefined;
    target_time_sec?: number | undefined;
}>;
export declare const PipelineAction: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"create_video">;
    topic: z.ZodString;
    voice: z.ZodOptional<z.ZodString>;
    length: z.ZodOptional<z.ZodEnum<["short", "medium", "long"]>>;
    theme: z.ZodOptional<z.ZodEnum<["crime", "history", "modern", "minimalist", "standard"]>>;
}, "strip", z.ZodTypeAny, {
    type: "create_video";
    topic: string;
    length?: "short" | "medium" | "long" | undefined;
    voice?: string | undefined;
    theme?: "modern" | "crime" | "history" | "minimalist" | "standard" | undefined;
}, {
    type: "create_video";
    topic: string;
    length?: "short" | "medium" | "long" | undefined;
    voice?: string | undefined;
    theme?: "modern" | "crime" | "history" | "minimalist" | "standard" | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"rewrite_scene">;
    scene_index: z.ZodNumber;
    instruction: z.ZodString;
    new_narration: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "rewrite_scene";
    scene_index: number;
    instruction: string;
    new_narration?: string | undefined;
}, {
    type: "rewrite_scene";
    scene_index: number;
    instruction: string;
    new_narration?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"change_voice">;
    voice: z.ZodString;
}, "strip", z.ZodTypeAny, {
    voice: string;
    type: "change_voice";
}, {
    voice: string;
    type: "change_voice";
}>, z.ZodObject<{
    type: z.ZodLiteral<"replace_footage">;
    scene_index: z.ZodNumber;
    new_keywords: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type: "replace_footage";
    scene_index: number;
    new_keywords: string[];
}, {
    type: "replace_footage";
    scene_index: number;
    new_keywords: string[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"set_theme">;
    theme: z.ZodEnum<["crime", "history", "modern", "minimalist", "standard"]>;
}, "strip", z.ZodTypeAny, {
    theme: "modern" | "crime" | "history" | "minimalist" | "standard";
    type: "set_theme";
}, {
    theme: "modern" | "crime" | "history" | "minimalist" | "standard";
    type: "set_theme";
}>, z.ZodObject<{
    type: z.ZodLiteral<"set_captions">;
    enabled: z.ZodBoolean;
    accent_color: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "set_captions";
    enabled: boolean;
    accent_color?: string | undefined;
}, {
    type: "set_captions";
    enabled: boolean;
    accent_color?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"set_pacing">;
    speed: z.ZodEnum<["fast", "normal", "slow"]>;
}, "strip", z.ZodTypeAny, {
    type: "set_pacing";
    speed: "fast" | "normal" | "slow";
}, {
    type: "set_pacing";
    speed: "fast" | "normal" | "slow";
}>, z.ZodObject<{
    type: z.ZodLiteral<"undo">;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "undo";
    description?: string | undefined;
}, {
    type: "undo";
    description?: string | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"export">;
    format: z.ZodDefault<z.ZodEnum<["mp4", "webm", "audio_only"]>>;
    resolution: z.ZodDefault<z.ZodEnum<["1080p", "720p", "4k"]>>;
}, "strip", z.ZodTypeAny, {
    type: "export";
    format: "mp4" | "webm" | "audio_only";
    resolution: "1080p" | "720p" | "4k";
}, {
    type: "export";
    format?: "mp4" | "webm" | "audio_only" | undefined;
    resolution?: "1080p" | "720p" | "4k" | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"navigate">;
    action: z.ZodEnum<["play", "pause", "toggle_playback", "jump_scene", "seek", "mute", "unmute"]>;
    target_time_sec: z.ZodOptional<z.ZodNumber>;
    scene_index: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "navigate";
    action: "pause" | "play" | "toggle_playback" | "jump_scene" | "seek" | "mute" | "unmute";
    scene_index?: number | undefined;
    target_time_sec?: number | undefined;
}, {
    type: "navigate";
    action: "pause" | "play" | "toggle_playback" | "jump_scene" | "seek" | "mute" | "unmute";
    scene_index?: number | undefined;
    target_time_sec?: number | undefined;
}>]>;
export type PipelineActionType = z.infer<typeof PipelineAction>;
export declare const CommandInterpretationResult: z.ZodObject<{
    intent_summary: z.ZodString;
    actions: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"create_video">;
        topic: z.ZodString;
        voice: z.ZodOptional<z.ZodString>;
        length: z.ZodOptional<z.ZodEnum<["short", "medium", "long"]>>;
        theme: z.ZodOptional<z.ZodEnum<["crime", "history", "modern", "minimalist", "standard"]>>;
    }, "strip", z.ZodTypeAny, {
        type: "create_video";
        topic: string;
        length?: "short" | "medium" | "long" | undefined;
        voice?: string | undefined;
        theme?: "modern" | "crime" | "history" | "minimalist" | "standard" | undefined;
    }, {
        type: "create_video";
        topic: string;
        length?: "short" | "medium" | "long" | undefined;
        voice?: string | undefined;
        theme?: "modern" | "crime" | "history" | "minimalist" | "standard" | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"rewrite_scene">;
        scene_index: z.ZodNumber;
        instruction: z.ZodString;
        new_narration: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "rewrite_scene";
        scene_index: number;
        instruction: string;
        new_narration?: string | undefined;
    }, {
        type: "rewrite_scene";
        scene_index: number;
        instruction: string;
        new_narration?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"change_voice">;
        voice: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        voice: string;
        type: "change_voice";
    }, {
        voice: string;
        type: "change_voice";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"replace_footage">;
        scene_index: z.ZodNumber;
        new_keywords: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        type: "replace_footage";
        scene_index: number;
        new_keywords: string[];
    }, {
        type: "replace_footage";
        scene_index: number;
        new_keywords: string[];
    }>, z.ZodObject<{
        type: z.ZodLiteral<"set_theme">;
        theme: z.ZodEnum<["crime", "history", "modern", "minimalist", "standard"]>;
    }, "strip", z.ZodTypeAny, {
        theme: "modern" | "crime" | "history" | "minimalist" | "standard";
        type: "set_theme";
    }, {
        theme: "modern" | "crime" | "history" | "minimalist" | "standard";
        type: "set_theme";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"set_captions">;
        enabled: z.ZodBoolean;
        accent_color: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "set_captions";
        enabled: boolean;
        accent_color?: string | undefined;
    }, {
        type: "set_captions";
        enabled: boolean;
        accent_color?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"set_pacing">;
        speed: z.ZodEnum<["fast", "normal", "slow"]>;
    }, "strip", z.ZodTypeAny, {
        type: "set_pacing";
        speed: "fast" | "normal" | "slow";
    }, {
        type: "set_pacing";
        speed: "fast" | "normal" | "slow";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"undo">;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "undo";
        description?: string | undefined;
    }, {
        type: "undo";
        description?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"export">;
        format: z.ZodDefault<z.ZodEnum<["mp4", "webm", "audio_only"]>>;
        resolution: z.ZodDefault<z.ZodEnum<["1080p", "720p", "4k"]>>;
    }, "strip", z.ZodTypeAny, {
        type: "export";
        format: "mp4" | "webm" | "audio_only";
        resolution: "1080p" | "720p" | "4k";
    }, {
        type: "export";
        format?: "mp4" | "webm" | "audio_only" | undefined;
        resolution?: "1080p" | "720p" | "4k" | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"navigate">;
        action: z.ZodEnum<["play", "pause", "toggle_playback", "jump_scene", "seek", "mute", "unmute"]>;
        target_time_sec: z.ZodOptional<z.ZodNumber>;
        scene_index: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "navigate";
        action: "pause" | "play" | "toggle_playback" | "jump_scene" | "seek" | "mute" | "unmute";
        scene_index?: number | undefined;
        target_time_sec?: number | undefined;
    }, {
        type: "navigate";
        action: "pause" | "play" | "toggle_playback" | "jump_scene" | "seek" | "mute" | "unmute";
        scene_index?: number | undefined;
        target_time_sec?: number | undefined;
    }>]>, "many">;
    requires_re_render: z.ZodBoolean;
    affected_scenes: z.ZodArray<z.ZodNumber, "many">;
}, "strip", z.ZodTypeAny, {
    intent_summary: string;
    actions: ({
        type: "create_video";
        topic: string;
        length?: "short" | "medium" | "long" | undefined;
        voice?: string | undefined;
        theme?: "modern" | "crime" | "history" | "minimalist" | "standard" | undefined;
    } | {
        type: "rewrite_scene";
        scene_index: number;
        instruction: string;
        new_narration?: string | undefined;
    } | {
        voice: string;
        type: "change_voice";
    } | {
        type: "replace_footage";
        scene_index: number;
        new_keywords: string[];
    } | {
        theme: "modern" | "crime" | "history" | "minimalist" | "standard";
        type: "set_theme";
    } | {
        type: "set_captions";
        enabled: boolean;
        accent_color?: string | undefined;
    } | {
        type: "set_pacing";
        speed: "fast" | "normal" | "slow";
    } | {
        type: "undo";
        description?: string | undefined;
    } | {
        type: "export";
        format: "mp4" | "webm" | "audio_only";
        resolution: "1080p" | "720p" | "4k";
    } | {
        type: "navigate";
        action: "pause" | "play" | "toggle_playback" | "jump_scene" | "seek" | "mute" | "unmute";
        scene_index?: number | undefined;
        target_time_sec?: number | undefined;
    })[];
    requires_re_render: boolean;
    affected_scenes: number[];
}, {
    intent_summary: string;
    actions: ({
        type: "create_video";
        topic: string;
        length?: "short" | "medium" | "long" | undefined;
        voice?: string | undefined;
        theme?: "modern" | "crime" | "history" | "minimalist" | "standard" | undefined;
    } | {
        type: "rewrite_scene";
        scene_index: number;
        instruction: string;
        new_narration?: string | undefined;
    } | {
        voice: string;
        type: "change_voice";
    } | {
        type: "replace_footage";
        scene_index: number;
        new_keywords: string[];
    } | {
        theme: "modern" | "crime" | "history" | "minimalist" | "standard";
        type: "set_theme";
    } | {
        type: "set_captions";
        enabled: boolean;
        accent_color?: string | undefined;
    } | {
        type: "set_pacing";
        speed: "fast" | "normal" | "slow";
    } | {
        type: "undo";
        description?: string | undefined;
    } | {
        type: "export";
        format?: "mp4" | "webm" | "audio_only" | undefined;
        resolution?: "1080p" | "720p" | "4k" | undefined;
    } | {
        type: "navigate";
        action: "pause" | "play" | "toggle_playback" | "jump_scene" | "seek" | "mute" | "unmute";
        scene_index?: number | undefined;
        target_time_sec?: number | undefined;
    })[];
    requires_re_render: boolean;
    affected_scenes: number[];
}>;
export type CommandInterpretation = z.infer<typeof CommandInterpretationResult>;
export declare function interpretVoiceCommand(dictatedCommand: string, currentProjectState?: {
    id?: string;
    title?: string;
    voice?: string;
    theme?: string;
    length?: string;
    script?: any;
    clips?: any;
}): Promise<CommandInterpretation>;

import { z } from "zod";
// ─── Zod Action Schemas for Video Pipeline Voice Commands ───────────────────
export const CreateVideoAction = z.object({
    type: z.literal("create_video"),
    topic: z.string().describe("The topic or prompt for creating a new video"),
    voice: z.string().optional().describe("Voice id (e.g., presenter_female, presenter_male, audiobook_male_1)"),
    length: z.enum(["short", "medium", "long"]).optional().describe("Video duration length tier"),
    theme: z.enum(["crime", "history", "modern", "minimalist", "standard"]).optional().describe("Visual theme styling"),
});
export const RewriteSceneAction = z.object({
    type: z.literal("rewrite_scene"),
    scene_index: z.number().int().describe("1-based index of the scene to rewrite"),
    instruction: z.string().describe("How the narration or visual keywords should be rewritten"),
    new_narration: z.string().optional().describe("Optionally updated narration text if generated"),
});
export const ChangeVoiceAction = z.object({
    type: z.literal("change_voice"),
    voice: z.string().describe("New voice id to apply (e.g., presenter_female, presenter_male, audiobook_male_1, deep_space_master)"),
});
export const ReplaceFootageAction = z.object({
    type: z.literal("replace_footage"),
    scene_index: z.number().int().describe("1-based index of the scene whose footage needs replacing"),
    new_keywords: z.array(z.string()).describe("New specific stock video search keywords"),
});
export const SetThemeAction = z.object({
    type: z.literal("set_theme"),
    theme: z.enum(["crime", "history", "modern", "minimalist", "standard"]).describe("Color grade and motion theme"),
});
export const SetCaptionsAction = z.object({
    type: z.literal("set_captions"),
    enabled: z.boolean().describe("Whether subtitles / karaoke captions should be burned in"),
    accent_color: z.string().optional().describe("Hex color code for karaoke highlight (e.g. #6c47ff)"),
});
export const SetPacingAction = z.object({
    type: z.literal("set_pacing"),
    speed: z.enum(["fast", "normal", "slow"]).describe("Pacing of cuts (fast = 2-3s, normal = 3-4s, slow = 5-6s)"),
});
export const UndoAction = z.object({
    type: z.literal("undo"),
    description: z.string().optional().describe("What to undo"),
});
export const ExportAction = z.object({
    type: z.literal("export"),
    format: z.enum(["mp4", "webm", "audio_only"]).default("mp4").describe("Export output target"),
    resolution: z.enum(["1080p", "720p", "4k"]).default("1080p"),
});
export const NavigateAction = z.object({
    type: z.literal("navigate"),
    action: z.enum(["play", "pause", "toggle_playback", "jump_scene", "seek", "mute", "unmute"]).describe("Timeline or player control action"),
    target_time_sec: z.number().optional().describe("Seconds to seek to in video"),
    scene_index: z.number().int().optional().describe("1-based scene index to jump to"),
});
export const PipelineAction = z.discriminatedUnion("type", [
    CreateVideoAction,
    RewriteSceneAction,
    ChangeVoiceAction,
    ReplaceFootageAction,
    SetThemeAction,
    SetCaptionsAction,
    SetPacingAction,
    UndoAction,
    ExportAction,
    NavigateAction,
]);
export const CommandInterpretationResult = z.object({
    intent_summary: z.string().describe("Short 1-sentence human explanation of what the command does"),
    actions: z.array(PipelineAction).describe("List of executable pipeline actions identified"),
    requires_re_render: z.boolean().describe("Whether executing these actions will require FFmpeg re-rendering"),
    affected_scenes: z.array(z.number()).describe("List of 1-based scene indices modified by this action, if any"),
});
// ─── Groq Prompt & Interpretation Function ──────────────────────────────────
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export async function interpretVoiceCommand(dictatedCommand, currentProjectState) {
    const apiKey = process.env.GROK_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey)
        throw new Error("GROK_API_KEY is not configured");
    const systemPrompt = `You are the AI Command Director for VidRush, an automated YouTube documentary video creator.
The user speaks voice commands (transcribed via Wispr Flow dictation) to generate or edit video projects in real time.

Your job is to analyze the user's natural language command and output a strictly valid JSON object matching this schema:
{
  "intent_summary": "Clean concise summary of what was requested",
  "actions": [
    // Array of actions. Possible action types:
    // 1. { "type": "create_video", "topic": "string", "voice": "presenter_female", "length": "short"|"medium"|"long", "theme": "crime"|"history"|"modern"|"minimalist"|"standard" }
    // 2. { "type": "rewrite_scene", "scene_index": 1, "instruction": "string" }
    // 3. { "type": "change_voice", "voice": "presenter_female"|"presenter_male"|"audiobook_male_1"|"wise_woman"|"deep_space_master" }
    // 4. { "type": "replace_footage", "scene_index": 2, "new_keywords": ["nebula stars space"] }
    // 5. { "type": "set_theme", "theme": "crime"|"history"|"modern"|"minimalist"|"standard" }
    // 6. { "type": "set_captions", "enabled": true, "accent_color": "#6c47ff" }
    // 7. { "type": "set_pacing", "speed": "fast"|"normal"|"slow" }
    // 8. { "type": "undo", "description": "revert previous change" }
    // 9. { "type": "export", "format": "mp4", "resolution": "1080p" }
    // 10. { "type": "navigate", "action": "play"|"pause"|"toggle_playback"|"jump_scene"|"seek"|"mute"|"unmute", "scene_index": 2, "target_time_sec": 45 }
  ],
  "requires_re_render": boolean, // false for navigate actions!
  "affected_scenes": [number] // 1-based indices of scenes modified (empty for global settings or navigate)
}

CURRENT VIDEO STATE:
${JSON.stringify(currentProjectState || { state: "No active project loaded" }, null, 2)}

STRICT RULES:
- Output ONLY valid JSON. No markdown ticks, no preamble, no commentary.
- Be smart with voice names: "male voice" -> "presenter_male" or "audiobook_male_1", "deep narrator" -> "deep_space_master", "female voice" -> "presenter_female".
- If the user says "Make a video about X", output create_video with topic X.
- If the user says "Change the background clips in scene 2 to sports cars", output replace_footage.
- If the user says "Make scene 1 more energetic and punchy", output rewrite_scene.
- If the user asks to play, pause, seek, jump to a scene or timestamp, output navigate (requires_re_render: false).
`;
    const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: dictatedCommand },
            ],
            temperature: 0.2,
            max_tokens: 1500,
        }),
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq interpretation error ${response.status}: ${errText}`);
    }
    const data = await response.json();
    let raw = data.choices?.[0]?.message?.content || "{}";
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(raw);
    return CommandInterpretationResult.parse(parsed);
}

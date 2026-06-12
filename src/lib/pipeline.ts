// Real API client
export type Stage =
  | "queued"
  | "researching"
  | "writing"
  | "voiceover"
  | "footage"
  | "rendering"
  | "done"
  | "error";

export interface ScriptSection {
  id: number;
  narration: string;
  visual_keyword: string;
  visual_keywords: string[];
  on_screen_text: string;
  duration: number;
  section_type: string;
  key_point: string | null;
}

export interface Script {
  title: string;
  hook: string;
  sections: ScriptSection[];
  outro: string;
  description: string;
  mood?: string;
  thumbnail_hook?: string;
}

export interface Clip {
  id: number;
  keyword: string;
  thumbUrl: string;
  status: "pending" | "downloading" | "ready" | "failed" | "skipped";
}

export interface RenderStep {
  label: string;
  done: boolean;
}

export interface Job {
  id: string;
  topic: string;
  voice: string;
  length: string;
  theme?: string;
  background?: string;
  mode?: string;
  stage: Stage;
  progress: number;
  message: string;
  script?: Script;
  clips?: Clip[];
  renderSteps?: RenderStep[];
  renderProgress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  createdAt: number;
}

function normalizeSection(s: Record<string, unknown>, idx: number): ScriptSection {
  const keywords = Array.isArray(s.visual_keywords)
    ? (s.visual_keywords as string[])
    : [String(s.visual_keyword || s.visual_keywords || "")];
  const words = Number(s.estimated_words) || 60;
  return {
    id: Number(s.id) || idx + 1,
    narration: String(s.narration || ""),
    visual_keyword: keywords[0] || "",
    visual_keywords: keywords,
    on_screen_text: keywords[0]?.toUpperCase() || "",
    duration: Math.round(words / 2.5),
    section_type: String(s.section_type || "broll"),
    key_point: (s.key_point as string) || null,
  };
}

function normalizeScript(raw: Record<string, unknown> | null): Script | undefined {
  if (!raw) return undefined;
  const sections = Array.isArray(raw.sections)
    ? (raw.sections as Record<string, unknown>[]).map(normalizeSection)
    : [];
  return {
    title: String(raw.title || ""),
    hook: String(raw.thumbnail_hook || raw.hook || ""),
    sections,
    outro: sections[sections.length - 1]?.narration || "",
    description: String(raw.description || ""),
    mood: String(raw.mood || "neutral"),
    thumbnail_hook: String(raw.thumbnail_hook || ""),
  };
}

export function normalizeApiResponse(data: Record<string, unknown>): Job {
  return {
    id: String(data.id),
    topic: String(data.title || data.topic || ""),
    voice: String(data.voice || "presenter_female"),
    length: String(data.length || "medium"),
    theme: String(data.theme || "modern"),
    background: String(data.background || "gradient_dark"),
    mode: String(data.mode || "auto"),
    stage: (data.stage as Stage) || "queued",
    progress: Number(data.progress) || 0,
    message: String(data.message || ""),
    script: normalizeScript((data.script as Record<string, unknown>) || null),
    clips: Array.isArray(data.clips) ? (data.clips as Clip[]) : undefined,
    renderSteps: Array.isArray(data.renderSteps)
      ? (data.renderSteps as RenderStep[])
      : undefined,
    renderProgress: Number(data.renderProgress) || 0,
    videoUrl: (data.videoUrl as string) || undefined,
    thumbnailUrl: (data.thumbnailUrl as string) || undefined,
    durationSec: (data.durationSeconds as number) || undefined,
    createdAt: data.createdAt ? new Date(data.createdAt as string).getTime() : Date.now(),
  };
}

export async function createJob(input: {
  topic: string;
  voice: string;
  length: string;
  theme?: string;
  background?: string;
  mode?: string;
}): Promise<string> {
  const res = await fetch("/api/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.topic,
      voice: input.voice,
      length: input.length,
      theme: input.theme || "modern",
      background: input.background || "gradient_dark",
      mode: input.mode || "auto",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to create video");
  }
  const data = await res.json() as { id: string };
  return data.id;
}

export async function fetchJob(id: string): Promise<Job | null> {
  try {
    const res = await fetch(`/api/videos/${id}`);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return normalizeApiResponse(data);
  } catch {
    return null;
  }
}

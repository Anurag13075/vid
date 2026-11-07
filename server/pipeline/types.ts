export type Stage =
  | "queued"
  | "researching"
  | "writing"
  | "voiceover"
  | "footage"
  | "rendering"
  | "done"
  | "error";

export type SectionType = "intro" | "broll" | "stat" | "graphic" | "outro";

export interface ScriptSection {
  id: number;
  narration: string;
  visual_keywords: string[];
  section_type: SectionType;
  key_point: string | null;
  chapter_title?: string | null;
  location_stamp?: string | null;
  estimated_words: number;
  sfx: boolean;
}

export interface Script {
  title: string;
  description: string;
  mood: "dramatic" | "uplifting" | "neutral" | "tense";
  thumbnail_hook: string;
  title_variants?: string[];
  sources?: string[];
  tags?: string[];
  sections: ScriptSection[];
}

export interface Clip {
  id: number;
  keyword: string;
  thumbUrl: string;
  videoUrl?: string;
  source?: "pexels" | "pixabay" | "wikimedia" | "archive";
  externalId?: string;
  duration?: number;
  localPath?: string;
  license?: string;
  sourceUrl?: string;
  status: "pending" | "downloading" | "ready" | "failed" | "skipped";
}

export interface RenderStep {
  label: string;
  done: boolean;
}

export interface VideoJob {
  id: string;
  title: string;
  voice: string;
  length: "short" | "medium" | "long";
  stage: Stage;
  progress: number;
  message: string;
  script?: Script;
  clips?: Clip[];
  renderSteps?: RenderStep[];
  renderProgress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  shortVideoUrl?: string;
  durationSeconds?: number;
  errorMessage?: string;
  createdAt: string;
}

export type SseListener = (data: SseEvent) => void;

export interface SseEvent {
  stage: Stage;
  progress: number;
  message: string;
  script?: Script;
  clips?: Clip[];
  renderSteps?: RenderStep[];
  renderProgress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  shortVideoUrl?: string;
  errorMessage?: string;
}

import { promises as fs } from "fs";

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

export type VisualType =
  | "ARCHIVAL_PHOTO"
  | "ARCHIVAL_FILM"
  | "B_ROLL"
  | "DOC_CLIP"
  | "STAT_SLAM"
  | "EVIDENCE_CARD"
  | "MAP"
  | "ACT_TITLE"
  | "TEXT_VOID";

export interface ScriptSection {
  id: number;
  narration: string;
  visual_keywords: string[];
  section_type: SectionType;
  visual_type?: VisualType;
  visual_intent?: string;
  queries?: string[];
  avoid?: string[];
  fact_ids?: string[];
  motion?: "push_in" | "pull_back" | "pan_left" | "pan_right" | "static_drift";
  sfx_cues?: string[];
  pause_after?: number;
  key_point: string | null;
  chapter_title?: string | null;
  location_stamp?: string | null;
  document_headline?: string | null;
  highlighted_quote?: string | null;
  stat_number?: string | null;
  stat_label?: string | null;
  estimated_words: number;
  sfx: boolean;
}

export interface Script {
  title: string;
  description: string;
  mood: "dramatic" | "uplifting" | "neutral" | "tense";
  thumbnail_hook: string;
  logline?: string;
  central_question?: string;
  acts?: { title: string; turn: string }[];
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
  source?: "pexels" | "pixabay" | "wikimedia" | "nasa" | "archive" | "graphic";
  externalId?: string;
  duration?: number;
  localPath?: string;
  license?: string;
  author?: string;
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
  length: "short" | "medium" | "long" | "extended";
  stage: Stage;
  progress: number;
  message: string;
  script?: Script;
  clips?: Clip[];
  renderSteps?: RenderStep[];
  renderProgress?: number;
  error?: string;
  outputPath?: string;
  thumbPath?: string;
  shortPath?: string;
  createdAt: string;
  updatedAt: string;
}

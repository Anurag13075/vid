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

export type SfxCue = "braam" | "whoosh" | "shutter" | "marker" | "paper" | "none";

export interface RemotionSubtitleWord {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface RemotionScene {
  id: string;
  visual_type: VisualType;
  mediaUrl?: string;
  durationInSeconds: number;
  durationInFrames: number;
  narration: string;
  stat_number?: string;
  stat_label?: string;
  document_headline?: string;
  highlighted_quote?: string;
  act_title?: string;
  sfx_cue?: SfxCue;
  words?: RemotionSubtitleWord[];
}

export interface DocumentaryCompositionProps {
  title: string;
  fps: number;
  width: number;
  height: number;
  scenes: RemotionScene[];
  voiceAudioUrl?: string;
  bgmAudioUrl?: string;
  aspectRatio?: "2.35:1" | "16:9";
}

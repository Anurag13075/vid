import React from "react";
import { Composition } from "remotion";
import { DocumentaryComposition } from "./DocumentaryComposition";
import { DocumentaryCompositionProps } from "./types";

const defaultProps: DocumentaryCompositionProps = {
  title: "Documentary Masterpiece",
  fps: 30,
  width: 1920,
  height: 1080,
  aspectRatio: "2.35:1",
  scenes: [
    {
      id: "intro-01",
      visual_type: "ARCHIVAL_PHOTO",
      durationInSeconds: 5,
      durationInFrames: 150,
      narration: "In 1974, a secret memorandum crossed the desk of the Attorney General.",
      sfx_cue: "whoosh",
      mediaUrl: "https://images.pexels.com/photos/2156881/pexels-photo-2156881.jpeg",
    },
    {
      id: "stat-02",
      visual_type: "STAT_SLAM",
      durationInSeconds: 4,
      durationInFrames: 120,
      narration: "Over four billion dollars had vanished from the treasury overnight.",
      stat_number: "$4.2 BILLION",
      stat_label: "FUNDS UNACCOUNTED FOR IN FEDERAL AUDIT",
      sfx_cue: "braam",
    },
    {
      id: "memo-03",
      visual_type: "EVIDENCE_CARD",
      durationInSeconds: 5,
      durationInFrames: 150,
      narration: "The declassified file contained one instruction: do not investigate.",
      document_headline: "EXECUTIVE MEMORANDUM 94-B",
      highlighted_quote: "Under no circumstances should external auditors review ledger 7.",
      sfx_cue: "paper",
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Documentary"
      component={DocumentaryComposition}
      durationInFrames={420}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />
  );
};

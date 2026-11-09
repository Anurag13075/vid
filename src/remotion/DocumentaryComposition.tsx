import React from "react";
import { Audio, Sequence } from "remotion";
import { DocumentaryCompositionProps, RemotionScene } from "./types";
import { Letterbox } from "./components/Letterbox";
import { StatSlam } from "./components/StatSlam";
import { EvidenceCard } from "./components/EvidenceCard";
import { ArchivalParallax } from "./components/ArchivalParallax";
import { CinematicSubtitles } from "./components/CinematicSubtitles";

export const DocumentaryComposition: React.FC<DocumentaryCompositionProps> = ({
  scenes,
  voiceAudioUrl,
  bgmAudioUrl,
  aspectRatio = "2.35:1",
}) => {
  let currentFrameOffset = 0;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#000000",
        overflow: "hidden",
      }}
    >
      {/* 1. Main Scene Sequence Flow */}
      {scenes.map((scene: RemotionScene) => {
        const fromFrame = currentFrameOffset;
        currentFrameOffset += scene.durationInFrames;
        const sceneStartInSeconds = fromFrame / 30;

        const isVideo =
          Boolean(scene.mediaUrl && scene.mediaUrl.match(/\.(mp4|webm|mov)(\?|$)/i));

        return (
          <Sequence
            key={scene.id}
            from={fromFrame}
            durationInFrames={scene.durationInFrames}
            name={`${scene.visual_type}: ${scene.id}`}
          >
            {/* Visual Renderer according to scene type */}
            {scene.visual_type === "STAT_SLAM" && (
              <StatSlam
                statNumber={scene.stat_number || "$4.2B"}
                statLabel={scene.stat_label || scene.narration}
              />
            )}

            {scene.visual_type === "EVIDENCE_CARD" && (
              <EvidenceCard
                headline={scene.document_headline || "CONFIDENTIAL REPORT"}
                quote={scene.highlighted_quote || scene.narration}
              />
            )}

            {scene.visual_type !== "STAT_SLAM" &&
              scene.visual_type !== "EVIDENCE_CARD" && (
                <ArchivalParallax
                  mediaUrl={
                    scene.mediaUrl ||
                    "https://images.pexels.com/photos/2156881/pexels-photo-2156881.jpeg"
                  }
                  isVideo={isVideo}
                  motion="push_in"
                  label={
                    scene.visual_type === "ARCHIVAL_PHOTO"
                      ? "NATIONAL ARCHIVE // PHOTOGRAPH"
                      : "INVESTIGATIVE RECORD"
                  }
                />
              )}

            {/* Subtitles for this scene */}
            <CinematicSubtitles
              narration={scene.narration}
              words={scene.words}
              sceneStartInSeconds={sceneStartInSeconds}
            />

            {/* Frame-accurate SFX trigger at the start of this scene */}
            {scene.sfx_cue && scene.sfx_cue !== "none" && (
              <Audio
                src={`/sfx/${scene.sfx_cue}.wav`}
                volume={0.8}
              />
            )}
          </Sequence>
        );
      })}

      {/* 2. Global Voiceover Track */}
      {voiceAudioUrl && <Audio src={voiceAudioUrl} volume={1.0} />}

      {/* 3. Global Ambient BGM Track (Subtly ducked) */}
      {bgmAudioUrl && <Audio src={bgmAudioUrl} volume={0.16} loop />}

      {/* 4. True 2.35:1 Theatrical Letterbox Overlay */}
      {aspectRatio === "2.35:1" && <Letterbox matteHeight={131} />}
    </div>
  );
};

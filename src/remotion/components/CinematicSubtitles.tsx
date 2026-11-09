import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { RemotionSubtitleWord } from "../types";

interface CinematicSubtitlesProps {
  narration: string;
  words?: RemotionSubtitleWord[];
  sceneStartInSeconds: number;
}

export const CinematicSubtitles: React.FC<CinematicSubtitlesProps> = ({
  narration,
  words,
  sceneStartInSeconds,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = sceneStartInSeconds + frame / fps;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "148px", // Above the 131px matte bar
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 120px",
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      <div
        style={{
          fontFamily: "'Geist', sans-serif",
          fontSize: "30px",
          fontWeight: 600,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.4,
          textShadow:
            "0 2px 4px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.8), 0 0 1px #000000",
          backgroundColor: "rgba(0,0,0,0.45)",
          padding: "6px 20px",
          borderRadius: "6px",
          maxWidth: "1300px",
          backdropFilter: "blur(4px)",
        }}
      >
        {words && words.length > 0 ? (
          words.map((w, idx) => {
            const isActive = currentTime >= w.start && currentTime <= w.end;
            return (
              <span
                key={idx}
                style={{
                  color: isActive ? "#fbbf24" : "#f3f4f6",
                  textShadow: isActive
                    ? "0 0 12px rgba(251,191,36,0.6)"
                    : "none",
                  marginRight: "7px",
                  transition: "color 0.1s ease",
                }}
              >
                {w.word}
              </span>
            );
          })
        ) : (
          <span>{narration}</span>
        )}
      </div>
    </div>
  );
};

import React from "react";
import { Img, Video, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface ArchivalParallaxProps {
  mediaUrl: string;
  isVideo?: boolean;
  motion?: "push_in" | "pan_right" | "slow_drift";
  label?: string;
}

export const ArchivalParallax: React.FC<ArchivalParallaxProps> = ({
  mediaUrl,
  isVideo = false,
  motion = "push_in",
  label = "ARCHIVE FOOTAGE",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Smooth cinematic Ken Burns easing
  const progress = frame / Math.max(1, durationInFrames);

  let scale = 1.0;
  let translateX = 0;
  let translateY = 0;

  if (motion === "push_in") {
    scale = interpolate(progress, [0, 1], [1.0, 1.12]);
  } else if (motion === "pan_right") {
    scale = 1.08;
    translateX = interpolate(progress, [0, 1], [-20, 20]);
  } else {
    scale = interpolate(progress, [0, 1], [1.05, 1.14]);
    translateY = interpolate(progress, [0, 1], [10, -10]);
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#000000",
        overflow: "hidden",
      }}
    >
      {/* Background / Subject Media */}
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transition: "transform 0.05s linear",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isVideo ? (
          <Video
            src={mediaUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted
          />
        ) : (
          <Img
            src={mediaUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>

      {/* Cinematic Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.65) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* 35mm Gritty Film Grain Simulation */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "4px 4px",
          mixBlendMode: "overlay",
          pointerEvents: "none",
          opacity: 0.7,
        }}
      />

      {/* Archival metadata stamp */}
      <div
        style={{
          position: "absolute",
          top: "148px",
          left: "48px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "rgba(0,0,0,0.7)",
          border: "1px solid rgba(255,255,255,0.2)",
          padding: "4px 12px",
          borderRadius: "4px",
          fontFamily: "'Geist Mono', monospace",
          fontSize: "11px",
          color: "#e5e7eb",
          letterSpacing: "2px",
          textTransform: "uppercase",
          zIndex: 40,
        }}
      >
        <div
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#22c55e",
          }}
        />
        {label}
      </div>
    </div>
  );
};

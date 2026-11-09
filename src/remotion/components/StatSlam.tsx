import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface StatSlamProps {
  statNumber: string;
  statLabel: string;
}

export const StatSlam: React.FC<StatSlamProps> = ({ statNumber, statLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring animation for impactful slam landing
  const slamSpring = spring({
    frame,
    fps,
    config: {
      damping: 14,
      stiffness: 180,
      mass: 0.8,
    },
  });

  const scale = interpolate(slamSpring, [0, 1], [1.45, 1.0]);
  const opacity = interpolate(frame, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle camera shake on the first 12 frames
  const shakeX = frame < 12 ? Math.sin(frame * 3.5) * (12 - frame) * 0.8 : 0;
  const shakeY = frame < 12 ? Math.cos(frame * 4.0) * (12 - frame) * 0.5 : 0;

  // Label delayed fade in
  const labelOpacity = interpolate(frame, [10, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelTranslateY = interpolate(frame, [10, 22], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#07070a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transform: `translate(${shakeX}px, ${shakeY}px)`,
        fontFamily: "'Geist Mono', 'Courier New', monospace",
        color: "#f3f4f6",
        padding: "0 100px",
      }}
    >
      {/* Background forensic grid texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at center, rgba(108,71,255,0.08) 0%, transparent 70%), linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 60px 60px, 60px 60px",
          opacity: 0.8,
        }}
      />

      {/* Forensic header badge */}
      <div
        style={{
          fontSize: "14px",
          letterSpacing: "4px",
          textTransform: "uppercase",
          color: "#9ca3af",
          marginBottom: "24px",
          borderBottom: "1px solid rgba(255,255,255,0.15)",
          paddingBottom: "8px",
          opacity: labelOpacity,
        }}
      >
        EXHIBIT 01 // FORENSIC METRIC
      </div>

      {/* Massive slam number */}
      <div
        style={{
          fontSize: "110px",
          fontWeight: 900,
          letterSpacing: "-3px",
          color: "#ffffff",
          transform: `scale(${scale})`,
          opacity,
          textShadow: "0 0 40px rgba(108,71,255,0.4), 0 10px 30px rgba(0,0,0,0.8)",
          lineHeight: 1,
        }}
      >
        {statNumber}
      </div>

      {/* Explanatory sub-label */}
      <div
        style={{
          marginTop: "28px",
          fontSize: "26px",
          fontWeight: 600,
          letterSpacing: "1px",
          color: "#e5e7eb",
          textAlign: "center",
          maxWidth: "960px",
          lineHeight: 1.4,
          opacity: labelOpacity,
          transform: `translateY(${labelTranslateY}px)`,
          textTransform: "uppercase",
        }}
      >
        {statLabel}
      </div>
    </div>
  );
};

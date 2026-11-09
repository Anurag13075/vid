import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface EvidenceCardProps {
  headline: string;
  quote: string;
}

export const EvidenceCard: React.FC<EvidenceCardProps> = ({ headline, quote }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const entry = spring({
    frame,
    fps,
    config: {
      damping: 16,
      stiffness: 140,
    },
  });

  const cardScale = interpolate(entry, [0, 1], [0.92, 1.0]);
  const cardOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Highlighter sweep animation: starts at frame 15, completes at frame 35
  const highlightProgress = interpolate(frame, [15, 38], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#08080c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Geist Mono', 'Courier New', monospace",
      }}
    >
      {/* Background vignette & desk shadow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at center, #111118 0%, #050508 100%)",
        }}
      />

      {/* Dossier Card Container */}
      <div
        style={{
          width: "1120px",
          backgroundColor: "#16161f",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "8px",
          padding: "54px 64px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)",
          transform: `scale(${cardScale})`,
          opacity: cardOpacity,
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Top Header / Classification */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.14)",
            paddingBottom: "18px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              letterSpacing: "3px",
              color: "#9ca3af",
              textTransform: "uppercase",
            }}
          >
            DOCUMENT ARCHIVE // EVIDENCE LOG
          </div>
          <div
            style={{
              fontSize: "12px",
              letterSpacing: "2.5px",
              color: "#ef4444",
              fontWeight: 700,
              border: "1px solid #ef4444",
              padding: "4px 10px",
              borderRadius: "3px",
              textTransform: "uppercase",
            }}
          >
            DECLASSIFIED
          </div>
        </div>

        {/* Memo Subject Headline */}
        <div
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "#6c47ff",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginBottom: "28px",
          }}
        >
          {headline}
        </div>

        {/* Highlighted Quote Area */}
        <div
          style={{
            fontSize: "36px",
            lineHeight: 1.45,
            fontWeight: 500,
            color: "#ffffff",
            position: "relative",
            display: "inline",
            background: `linear-gradient(90deg, rgba(234, 179, 8, 0.45) ${highlightProgress}%, transparent ${highlightProgress}%)`,
            padding: "4px 8px",
            borderRadius: "4px",
            boxDecorationBreak: "clone",
          }}
        >
          "{quote}"
        </div>

        {/* Bottom verification watermark */}
        <div
          style={{
            marginTop: "40px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "12px",
            color: "#6b7280",
            letterSpacing: "1px",
          }}
        >
          <div>SOURCE VERIFICATION: CASE_FILE_PRIMARY</div>
          <div>STATUS: CONFIRMED</div>
        </div>
      </div>
    </div>
  );
};

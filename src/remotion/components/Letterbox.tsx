import React from "react";

interface LetterboxProps {
  matteHeight?: number; // 131px for 1080p 2.35:1
}

export const Letterbox: React.FC<LetterboxProps> = ({ matteHeight = 131 }) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {/* Top Matte Bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: `${matteHeight}px`,
          backgroundColor: "#000000",
        }}
      />
      {/* Bottom Matte Bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${matteHeight}px`,
          backgroundColor: "#000000",
        }}
      />
    </div>
  );
};

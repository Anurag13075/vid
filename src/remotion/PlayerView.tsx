import React from "react";
import { Player } from "@remotion/player";
import { DocumentaryComposition } from "./DocumentaryComposition";
import { DocumentaryCompositionProps } from "./types";

interface PlayerViewProps {
  props: DocumentaryCompositionProps;
  autoPlay?: boolean;
}

export const DocumentaryPlayerView: React.FC<PlayerViewProps> = ({
  props,
  autoPlay = false,
}) => {
  const totalFrames = props.scenes.reduce(
    (acc, scene) => acc + scene.durationInFrames,
    0
  );

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1100px",
        margin: "0 auto",
        backgroundColor: "#000000",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <Player
        component={DocumentaryComposition}
        inputProps={props}
        durationInFrames={Math.max(30, totalFrames)}
        fps={props.fps || 30}
        compositionWidth={props.width || 1920}
        compositionHeight={props.height || 1080}
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
        }}
        controls
        autoPlay={autoPlay}
        loop
      />
    </div>
  );
};

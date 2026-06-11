import { useEffect, useState } from "react";
import type { Clip, Stage } from "@/lib/pipeline";

export function Timeline({
  clips,
  stage,
}: {
  clips: Clip[] | undefined;
  stage: Stage;
}) {
  const [playhead, setPlayhead] = useState(0);
  useEffect(() => {
    if (stage !== "done") {
      const t = setInterval(() => setPlayhead((p) => (p + 0.6) % 100), 80);
      return () => clearInterval(t);
    }
  }, [stage]);

  const tracks = clips && clips.length > 0 ? clips : Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    keyword: "—",
    thumbUrl: "",
    status: "pending" as const,
  }));

  return (
    <div className="h-[100px] border-t border-[var(--border)] bg-[var(--bg-surface)]/95 backdrop-blur px-5 py-3 relative overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-caption text-[var(--text-muted)]">Timeline</span>
        <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
          00:00 / 01:00
        </span>
      </div>
      <div className="relative space-y-1">
        <Track
          color="bg-[var(--teal)]/70"
          items={tracks.map((c) => ({ label: c.keyword, on: c.status !== "pending" }))}
        />
        <Track
          color="bg-[var(--orange)]/70"
          items={tracks.map(() => ({ label: "", on: stage !== "researching" && stage !== "writing" }))}
          variant="wave"
        />
        <Track
          color="bg-[var(--accent)]/70"
          items={tracks.map(() => ({ label: "", on: stage === "rendering" || stage === "done" }))}
        />
      </div>
      <div
        className="absolute top-7 bottom-2 w-px bg-white/80 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.6)]"
        style={{ left: `calc(${playhead}% )` }}
      >
        <div className="absolute -top-1 -left-[3px] h-2 w-2 rounded-full bg-white" />
      </div>
    </div>
  );
}

function Track({
  color,
  items,
  variant,
}: {
  color: string;
  items: { label: string; on: boolean }[];
  variant?: "wave";
}) {
  return (
    <div className="grid gap-[2px] h-4" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((it, i) => (
        <div
          key={i}
          className={`h-full rounded-[3px] transition-opacity ${
            it.on ? `${color} opacity-100` : "bg-[var(--bg-card)] opacity-60"
          } flex items-center px-1 overflow-hidden`}
        >
          {variant === "wave" && it.on ? (
            <div className="flex gap-[1px] items-center h-full w-full">
              {Array.from({ length: 8 }).map((_, j) => (
                <span
                  key={j}
                  className="w-[1px] bg-black/40"
                  style={{ height: `${30 + ((i * 7 + j * 13) % 70)}%` }}
                />
              ))}
            </div>
          ) : (
            <span className="text-[8px] text-black/70 font-medium truncate">{it.label}</span>
          )}
        </div>
      ))}
    </div>
  );
}

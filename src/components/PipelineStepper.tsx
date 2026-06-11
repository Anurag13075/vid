import { Check, FileSearch, PenLine, Mic2, Film, Sparkles, Wand2 } from "lucide-react";
import type { Stage } from "@/lib/pipeline";

const STAGES: { key: Stage; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "researching", name: "Researcher", icon: FileSearch },
  { key: "writing", name: "Writer", icon: PenLine },
  { key: "voiceover", name: "Voice Over", icon: Mic2 },
  { key: "footage", name: "Footage Collection", icon: Film },
  { key: "rendering", name: "Motion & Render", icon: Wand2 },
  { key: "done", name: "Final Cut", icon: Sparkles },
];

const ORDER: Stage[] = ["queued", "researching", "writing", "voiceover", "footage", "rendering", "done"];

export function PipelineStepper({ stage, message }: { stage: Stage; message: string }) {
  const currentIdx = ORDER.indexOf(stage);
  return (
    <div className="relative">
      {STAGES.map((s, i) => {
        const Icon = s.icon;
        const status: "done" | "active" | "pending" =
          i < currentIdx || stage === "done" && i === STAGES.length - 1
            ? "done"
            : i === currentIdx
            ? "active"
            : i < currentIdx
            ? "done"
            : "pending";
        return (
          <div key={s.key} className="relative flex gap-4 pb-8 last:pb-0">
            {i < STAGES.length - 1 && (
              <div
                className={`absolute left-[19px] top-10 bottom-0 w-px ${
                  i < currentIdx ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              />
            )}
            <div
              className={`relative h-10 w-10 shrink-0 rounded-full border flex items-center justify-center transition-all ${
                status === "done"
                  ? "bg-[var(--accent)] border-[var(--accent)]"
                  : status === "active"
                  ? "bg-[var(--bg-card)] border-[var(--accent)] animate-pulse-glow"
                  : "bg-[var(--bg-card)] border-[var(--border)]"
              }`}
            >
              {status === "done" ? (
                <Check className="h-4 w-4 text-white animate-check-pop" />
              ) : status === "active" ? (
                <Icon className="h-4 w-4 text-[var(--accent)]" />
              ) : (
                <Icon className="h-4 w-4 text-[var(--text-muted)]" />
              )}
              {status === "active" && (
                <span className="absolute inset-0 rounded-full border border-[var(--accent)] animate-ping opacity-30" />
              )}
            </div>
            <div className="flex-1 pt-1.5">
              <div
                className={`text-[14px] font-semibold ${
                  status === "pending" ? "text-[var(--text-muted)]" : "text-white"
                }`}
              >
                {s.name}
              </div>
              <div className="text-[12px] text-[var(--text-secondary)] mt-0.5 min-h-[16px]">
                {status === "active" ? message : status === "done" ? "Complete" : "Waiting..."}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

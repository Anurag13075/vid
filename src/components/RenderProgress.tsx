import { Check, Loader2 } from "lucide-react";
import type { RenderStep } from "@/lib/pipeline";

export function RenderProgress({
  steps,
  progress,
}: {
  steps: RenderStep[];
  progress: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-caption text-[var(--text-muted)]">FFmpeg pipeline</span>
          <span className="text-[13px] font-mono tabular-nums text-white">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--bg-card)] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-black/40 p-4 font-mono text-[12.5px] leading-7">
        {steps.map((s, i) => {
          const inProgress = !s.done && (i === 0 || steps[i - 1].done);
          return (
            <div key={i} className="flex items-center gap-3 animate-fade-in">
              <span className="w-4">
                {s.done ? (
                  <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                ) : inProgress ? (
                  <Loader2 className="h-3.5 w-3.5 text-[var(--accent-hover)] animate-spin" />
                ) : (
                  <span className="block h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] mx-auto" />
                )}
              </span>
              <span
                className={
                  s.done
                    ? "text-[var(--text-secondary)]"
                    : inProgress
                    ? "text-white"
                    : "text-[var(--text-muted)]"
                }
              >
                {s.label}
                {inProgress && <span className="caret ml-1">▌</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

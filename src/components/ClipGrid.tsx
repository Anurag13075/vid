import { Check, Download, Loader2 } from "lucide-react";
import type { Clip } from "@/lib/pipeline";

export function ClipGrid({ clips }: { clips: Clip[] }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
      {clips.map((c) => (
        <div
          key={c.id}
          className="relative aspect-video rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]"
        >
          {c.status === "pending" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-card)]/95 text-[11px] text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
              <div className="text-center px-3">Searching for clip preview…</div>
            </div>
          ) : (
            <>
              {c.thumbUrl ? (
                <img
                  src={c.thumbUrl}
                  alt={c.keyword}
                  className="w-full h-full object-cover animate-fade-in"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-card)]/90 text-[11px] text-[var(--text-muted)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                    <Download className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <span>No thumbnail available</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-white truncate">{c.keyword}</span>
                {c.status === "ready" ? (
                  <Check className="h-3 w-3 text-[var(--success)]" />
                ) : (
                  <Download className="h-3 w-3 text-[var(--accent-hover)] animate-pulse" />
                )}
              </div>
            </>
          )}
          <span className="absolute top-1.5 left-1.5 text-[9px] font-mono text-white/60 bg-black/40 rounded px-1">
            {String(c.id).padStart(2, "0")}
          </span>
        </div>
      ))}
    </div>
  );
}

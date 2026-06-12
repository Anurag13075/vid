import { Check, Download, Loader2, SkipForward } from "lucide-react";
import type { Clip } from "@/lib/pipeline";

export function ClipGrid({ clips }: { clips: Clip[] }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
      {clips.map((c) => (
        <div
          key={c.id}
          className="relative aspect-video rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]"
        >
          {/* ── Skipped (graphic/empty sections) ── */}
          {c.status === "skipped" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-card)]/95 text-[11px] text-[var(--text-muted)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 border border-white/10">
                <SkipForward className="h-4 w-4 text-[var(--text-muted)]" />
              </div>
              <div className="text-center px-3">Graphic section</div>
            </div>

          ) : c.status === "pending" ? (
            /* ── Pending ── */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-card)]/95 text-[11px] text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
              <div className="text-center px-3">Searching for clip preview…</div>
            </div>

          ) : c.status === "downloading" ? (
            /* ── Downloading ── */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-card)]/95 text-[11px] text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
              <div className="text-center px-3">Downloading…</div>
            </div>

          ) : c.status === "failed" ? (
            /* ── Failed ── */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-card)]/95 text-[11px] text-[var(--text-muted)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                <Download className="h-4 w-4 text-red-400/60" />
              </div>
              <div className="text-center px-3">No clip found</div>
            </div>

          ) : (
            /* ── Ready ── */
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
                <Check className="h-3 w-3 shrink-0 text-[var(--success)]" />
              </div>
            </>
          )}

          {/* ── Clip ID badge (always visible) ── */}
          <span className="absolute top-1.5 left-1.5 text-[9px] font-mono text-white/60 bg-black/40 rounded px-1 z-10">
            {String(c.id).padStart(2, "0")}
          </span>
        </div>
      ))}
    </div>
  );
} 
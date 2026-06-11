import type { Script } from "@/lib/pipeline";

export function ScriptPreview({ script }: { script: Script }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 animate-fade-up">
        <div className="text-caption text-[var(--accent)] mb-2">Hook</div>
        <p className="text-[18px] leading-snug">{script.hook}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {script.sections.map((s, i) => (
          <div
            key={s.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--border-active)] transition-colors animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-caption text-[var(--text-muted)]">
                Section {String(s.id).padStart(2, "0")}
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
                {s.duration}s
              </span>
            </div>
            <span className="inline-block text-[11px] px-2 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent-hover)] mb-2 font-medium">
              {s.visual_keyword}
            </span>
            <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed">
              {s.narration}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { PipelineStepper } from "@/components/PipelineStepper";
import { ClipGrid } from "@/components/ClipGrid";
import { Waveform } from "@/components/Waveform";
import { RenderProgress } from "@/components/RenderProgress";
import { Timeline } from "@/components/Timeline";
import { useJob } from "@/lib/usePipeline";
import { Loader2, RotateCcw, FileText, Film } from "lucide-react";
import type { Script, Clip } from "@/lib/pipeline";

export const Route = createFileRoute("/generate/$jobId")({
  head: () => ({ meta: [{ title: "Generating · VidRush" }] }),
  component: GeneratePage,
});

function GeneratePage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const job = useJob(jobId);

  useEffect(() => {
    if (job?.stage === "done") {
      const t = setTimeout(() => navigate({ to: "/result/$jobId", params: { jobId } }), 1200);
      return () => clearTimeout(t);
    }
  }, [job?.stage, jobId, navigate]);

  if (!job) {
    return (
      <div className="dark-app min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {/* Queue screen while loading */}
          <div className="text-center max-w-md px-5">
            <div className="relative mx-auto mb-8 h-20 w-20">
              <div className="absolute inset-0 rounded-full bg-[var(--accent)]/20 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-[var(--accent)]/30 animate-ping" style={{ animationDelay: "0.2s" }} />
              <div className="relative h-full w-full rounded-full bg-[var(--accent)] flex items-center justify-center shadow-[0_0_40px_var(--accent-glow)]">
                <div className="h-5 w-5 rounded-full bg-white/80 animate-pulse" />
              </div>
            </div>
            <h2 className="text-[28px] font-bold text-white mb-3">You're in queue</h2>
            <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-4">
              Your video is being processed. You can close this page and return later to check the progress.
            </p>
            <p className="text-[12px] text-[var(--text-muted)]">
              Processing time may vary based on current demand
            </p>
            <div className="mt-6 flex items-center justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                  style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (job.stage === "error") {
    return (
      <div className="dark-app min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-5">
          <div className="text-[12px] text-[var(--accent)] mb-2">Pipeline Error</div>
          <h1 className="text-h1 text-white mb-3">Video generation failed</h1>
          <p className="text-[14px] text-[var(--text-secondary)] mb-6">{job.message}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors font-medium text-white"
          >
            <RotateCcw className="h-4 w-4" /> Try again
          </Link>
        </div>
      </div>
    );
  }

  const readyClips = job.clips?.filter((c) => c.status === "ready").length ?? 0;
  const totalClips = job.clips?.length ?? 0;

  // Show queue screen while still in early stages
  const isQueued = job.stage === "queued" || job.stage === "researching";

  if (isQueued) {
    return (
      <div className="dark-app min-h-screen flex flex-col">
        <header className="h-14 border-b border-[var(--border)] flex items-center px-5 justify-between shrink-0">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[12px] text-[var(--text-secondary)]">In queue</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-5">
            <div className="relative mx-auto mb-8 h-20 w-20">
              <div className="absolute inset-0 rounded-full bg-[var(--accent)]/20 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-[var(--accent)]/30 animate-ping" style={{ animationDelay: "0.2s" }} />
              <div className="relative h-full w-full rounded-full bg-[var(--accent)] flex items-center justify-center shadow-[0_0_40px_var(--accent-glow)]">
                <div className="h-5 w-5 rounded-full bg-white/80 animate-pulse" />
              </div>
            </div>
            <h2 className="text-[28px] font-bold text-white mb-3">You're in queue</h2>
            <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-4">
              Your video is being processed. You can close this page and return later to check the progress.
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mb-2">{job.message}</p>
            <p className="text-[12px] text-[var(--text-muted)]">
              Processing time may vary based on current demand
            </p>
            <div className="mt-6 flex items-center justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                  style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark-app min-h-screen flex flex-col">
      <header className="h-14 border-b border-[var(--border)] flex items-center px-5 justify-between shrink-0">
        <div className="flex items-center gap-5">
          <Logo />
          <div className="h-5 w-px bg-[var(--border)]" />
          <div className="text-[13px] text-[var(--text-secondary)] truncate max-w-[420px]">
            <span className="text-[var(--text-muted)]">Topic:</span>{" "}
            <span className="text-white">{job.topic}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-[var(--text-secondary)]">
          {totalClips > 0 && (
            <span className="flex items-center gap-1.5">
              <Film className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              {readyClips}/{totalClips} clips
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            {job.stage === "done" ? "Complete" : "Live render"}
          </span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* sidebar */}
        <aside className="w-[300px] shrink-0 border-r border-[var(--border)] p-5 overflow-y-auto flex flex-col gap-5">
          <div>
            <div className="text-caption text-[var(--text-muted)] mb-4">Pipeline</div>
            <PipelineStepper stage={job.stage} message={job.message} />
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-[var(--text-muted)]">Overall progress</span>
              <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">{job.progress}%</span>
            </div>
            <div className="h-1 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>

          {/* Persistent script outline — visible once script is generated */}
          {job.script && <ScriptOutline script={job.script} />}
        </aside>

        {/* main */}
        <main className="flex-1 overflow-y-auto p-8">
          <StageView jobId={jobId} />
        </main>
      </div>

      <Timeline clips={job.clips} stage={job.stage} />
    </div>
  );
}

function ScriptOutline({ script }: { script: Script }) {
  const nonGraphic = script.sections.filter((s) => s.section_type !== "graphic");
  return (
    <div className="border-t border-[var(--border)] pt-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-caption text-[var(--text-muted)]">
          <FileText className="h-3 w-3" />
          Script
        </div>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
          {nonGraphic.length} sections
        </span>
      </div>
      <div className="space-y-0.5 max-h-[380px] overflow-y-auto pr-0.5">
        {script.sections.map((s, i) => (
          <div
            key={s.id}
            className={`flex items-start gap-2 px-2 py-2 rounded-lg transition-colors ${
              s.section_type === "graphic"
                ? "opacity-40"
                : "hover:bg-[var(--bg-hover)]"
            }`}
          >
            <span className="text-[9px] font-mono text-[var(--text-muted)] w-5 shrink-0 pt-0.5 tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                    s.section_type === "stat"
                      ? "bg-amber-500/15 text-amber-400"
                      : s.section_type === "intro"
                      ? "bg-[var(--accent)]/15 text-[var(--accent-hover)]"
                      : s.section_type === "outro"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : s.section_type === "graphic"
                      ? "bg-white/10 text-[var(--text-muted)]"
                      : "bg-white/8 text-[var(--text-muted)]"
                  }`}
                >
                  {s.section_type}
                </span>
              </div>
              <div className="text-[10px] text-[var(--accent-hover)] truncate leading-tight">
                {s.visual_keyword || s.visual_keywords?.[0]}
              </div>
              {s.narration && (
                <div className="text-[10px] text-[var(--text-muted)] leading-relaxed mt-0.5 line-clamp-2">
                  {s.narration}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageView({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  if (!job) return null;

  if (job.stage === "writing") {
    return (
      <div className="max-w-4xl">
        <Header
          eyebrow="Claude AI Writer"
          title={job.script?.title || "Generating script..."}
          subtitle={
            job.script
              ? `${job.script.sections.length} sections drafted · mood: ${job.script.mood || "neutral"}`
              : job.message
          }
        />
        {job.script ? (
          <ScriptFullPreview script={job.script} />
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 font-mono text-[14px] text-[var(--text-secondary)]">
            <TypingLines
              lines={[
                "→ crafting documentary narrative with Claude AI...",
                "→ structuring 3-act story arc...",
                "→ writing rich narration sections...",
                "→ selecting visual keywords per line...",
              ]}
            />
          </div>
        )}
      </div>
    );
  }

  if (job.stage === "voiceover") {
    const match = job.message.match(/(\d+)\/(\d+)/);
    const currentIdx = match ? parseInt(match[1]) - 1 : 0;
    const currentSection = job.script?.sections[currentIdx];
    const total = match ? parseInt(match[2]) : (job.script?.sections.length ?? 0);

    return (
      <div className="max-w-2xl space-y-5">
        <Header
          eyebrow="MiniMax TTS Voice Over"
          title={`${job.voice} · MiniMax Neural TTS`}
          subtitle={`Section ${(currentIdx + 1)} of ${total}`}
        />
        {currentSection && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                {String(currentSection.id).padStart(2, "0")}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent-hover)] font-medium">
                {currentSection.visual_keyword}
              </span>
            </div>
            <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
              {currentSection.narration}
            </p>
          </div>
        )}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <Waveform />
          <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--text-secondary)] font-mono">
            <span>{job.progress}%</span>
            <span>MiniMax Speech-02-HD</span>
            <span>MP3 · 32kHz</span>
          </div>
        </div>
      </div>
    );
  }

  if (job.stage === "footage" && job.clips) {
    const ready = job.clips.filter((c) => c.status === "ready").length;
    return (
      <div className="max-w-5xl">
        <Header
          eyebrow="Footage Agent"
          title="Searching Pexels & Pixabay"
          subtitle={`${ready} of ${job.clips.length} clips sourced · ${job.message}`}
        />
        <ClipGrid clips={job.clips} />
      </div>
    );
  }

  if (job.stage === "rendering" && job.renderSteps) {
    return (
      <div className="max-w-3xl">
        <Header eyebrow="Render Engine" title="FFmpeg pipeline running" subtitle="1920×1080 · H.264 · AAC 192k · Ken Burns + xfade transitions" />
        <RenderProgress steps={job.renderSteps} progress={job.renderProgress ?? 0} />
      </div>
    );
  }

  if (job.stage === "done" && job.videoUrl) {
    return (
      <div className="max-w-3xl">
        <Header eyebrow="Done" title="Render complete" subtitle="Redirecting to result..." />
        <video
          src={job.videoUrl}
          className="w-full rounded-xl border border-[var(--border)] aspect-video bg-black animate-fade-in"
          controls
          autoPlay
          muted
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Header eyebrow="Pipeline" title={job.message || "Processing..."} />
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 font-mono text-[14px] text-[var(--text-secondary)]">
        <TypingLines lines={["→ " + (job.message || "initializing...")]} />
      </div>
    </div>
  );
}

function ScriptFullPreview({ script }: { script: Script }) {
  return (
    <div className="space-y-3">
      {script.sections.map((s, i) => (
        <div
          key={s.id}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--border-active)] transition-colors animate-fade-up"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-[var(--text-muted)] w-6">
              {String(s.id).padStart(2, "0")}
            </span>
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                s.section_type === "stat"
                  ? "bg-amber-500/15 text-amber-400"
                  : s.section_type === "intro"
                  ? "bg-[var(--accent)]/15 text-[var(--accent-hover)]"
                  : s.section_type === "outro"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-white/8 text-[var(--text-muted)]"
              }`}
            >
              {s.section_type}
            </span>
            <span className="text-[10px] text-[var(--accent-hover)] truncate flex-1">
              {s.visual_keyword}
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">~{s.duration}s</span>
          </div>
          {s.narration ? (
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed pl-8">
              {s.narration}
            </p>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)] italic pl-8">✦ Visual transition</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Header({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-7">
      <div className="text-caption text-[var(--accent)] mb-2">{eyebrow}</div>
      <h1 className="text-h1 text-white">{title}</h1>
      {subtitle && <p className="mt-2 text-[14px] text-[var(--text-secondary)]">{subtitle}</p>}
    </div>
  );
}

function TypingLines({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="animate-fade-up" style={{ animationDelay: `${i * 350}ms` }}>
          {l}
          {i === lines.length - 1 && <span className="caret ml-1">▌</span>}
        </div>
      ))}
    </div>
  );
}

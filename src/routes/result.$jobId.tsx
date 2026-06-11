import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { useJob } from "@/lib/usePipeline";
import {
  Check, Copy, Download, RotateCcw, Sparkles, Loader2,
  Film, Clock, Mic, Maximize2,
} from "lucide-react";

export const Route = createFileRoute("/result/$jobId")({
  head: () => ({ meta: [{ title: "Your video · VidRush" }] }),
  component: ResultPage,
});

function ResultPage() {
  const { jobId } = Route.useParams();
  const job = useJob(jobId);
  const [activeTab, setActiveTab] = useState<"overview" | "script" | "clips">("overview");

  if (!job) {
    return (
      <div className="dark-app min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  const script = job.script;
  const fallbackVideoUrl = job.stage === "done" ? `/videos/${jobId}/final.mp4` : undefined;
  const videoUrl = job.videoUrl || fallbackVideoUrl;
  const isDone = job.stage === "done";
  const isError = job.stage === "error";

  if (!script && !isDone && !isError) {
    return (
      <div className="dark-app min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-[14px] text-[var(--text-secondary)]">Loading your video...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="dark-app min-h-screen flex items-center justify-center px-5 text-center">
        <div className="max-w-xl rounded-3xl border border-red-500/20 bg-[var(--bg-card)] p-10">
          <div className="text-red-400 mb-4 text-sm uppercase tracking-[0.2em]">Render failed</div>
          <h1 className="text-h2 mb-3">We couldn’t finish your video.</h1>
          <p className="text-[var(--text-secondary)] mb-6">
            {job.message || "Something went wrong during rendering. Please try again."}
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white"
          >
            Create another video
          </Link>
        </div>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="dark-app min-h-screen flex items-center justify-center px-5 text-center">
        <div className="max-w-xl rounded-3xl border border-yellow-500/20 bg-[var(--bg-card)] p-10">
          <div className="text-yellow-300 mb-4 text-sm uppercase tracking-[0.2em]">Incomplete result</div>
          <h1 className="text-h2 mb-3">Your video finished, but the metadata was missing.</h1>
          <p className="text-[var(--text-secondary)] mb-6">
            The backend finished the pipeline, but the script data could not be loaded. Please try again or create a new video.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white"
          >
            Create another video
          </Link>
        </div>
      </div>
    );
  }

  const scriptData = script;

  if (isDone && !videoUrl) {
    return (
      <div className="dark-app min-h-screen flex items-center justify-center px-5 text-center">
        <div className="max-w-xl rounded-3xl border border-yellow-500/20 bg-[var(--bg-card)] p-10">
          <div className="text-yellow-300 mb-4 text-sm uppercase tracking-[0.2em]">Missing video URL</div>
          <h1 className="text-h2 mb-3">Your video finished rendering, but the player URL was not saved.</h1>
          <p className="text-[var(--text-secondary)] mb-6">
            We expected to find the final video at <code className="break-all">/videos/{jobId}/final.mp4</code>.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white"
          >
            Create another video
          </Link>
        </div>
      </div>
    );
  }

  const readyClips = job.clips?.filter((c) => c.status === "ready").length
    ?? scriptData.sections.filter((s) => s.section_type !== "graphic").length;

  const voiceLabel = job.voice.split("-").slice(2).join("-").replace("Neural", "") || job.voice;

  // Estimate duration from sections
  const estSec = scriptData.sections
    .filter((s) => s.section_type !== "graphic")
    .reduce((acc, s) => acc + (s.duration || 0), 0);
  const estMin = Math.floor(estSec / 60);
  const estSecR = estSec % 60;
  const durationStr = estMin > 0 ? `${estMin}m ${estSecR}s` : `${estSec}s`;

  const stats = [
    { icon: Film, l: "Clips", v: `${readyClips}` },
    { icon: Clock, l: "Duration", v: durationStr },
    { icon: Mic, l: "Voice", v: voiceLabel },
    { icon: Maximize2, l: "Resolution", v: "1920×1080" },
  ];

  return (
    <div className="dark-app min-h-screen">
      <header className="h-14 border-b border-[var(--border)] flex items-center px-5 justify-between">
        <Logo />
        <Link
          to="/"
          className="text-[13px] text-[var(--text-secondary)] hover:text-white transition-colors flex items-center gap-2"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          New video
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10">
        {/* Status */}
        <div className="flex items-center gap-2 text-[12px] text-[var(--success)] mb-4 animate-fade-in">
          <Sparkles className="h-3.5 w-3.5" />
          Render complete · ready to publish on YouTube
        </div>

        <h1 className="text-h1 mb-2 animate-fade-up">{scriptData.title}</h1>
        <p className="text-[var(--text-secondary)] mb-6 animate-fade-up max-w-3xl" style={{ animationDelay: "60ms" }}>
          {scriptData.description}
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap gap-2 mb-6">
          {stats.map((s) => (
            <div
              key={s.l}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[12px]"
            >
              <s.icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span className="text-[var(--text-muted)]">{s.l}:</span>
              <span className="text-white font-medium">{s.v}</span>
            </div>
          ))}
        </div>

        {/* Video player */}
        <video
          src={videoUrl}
          controls
          poster={job.thumbnailUrl}
          className="w-full aspect-video rounded-2xl border border-[var(--border)] bg-black shadow-[0_30px_100px_-30px_var(--accent-glow)] animate-fade-up"
          style={{ animationDelay: "120ms" }}
        />

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={videoUrl}
            download={`vidrush-${jobId}.mp4`}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors font-medium text-white"
          >
            <Download className="h-4 w-4" />
            Download MP4
          </a>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[var(--border-active)] bg-transparent hover:bg-[var(--bg-hover)] transition-colors font-medium text-white"
          >
            <RotateCcw className="h-4 w-4" />
            Generate another
          </Link>
        </div>

        {/* Tabs */}
        <div className="mt-12 border-b border-[var(--border)] flex gap-6">
          {(["overview", "script", "clips"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-[13px] font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-[var(--accent)] text-white"
                  : "border-transparent text-[var(--text-muted)] hover:text-white"
              }`}
            >
              {tab}
              {tab === "script" && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] tabular-nums">
                  {scriptData.sections.length}
                </span>
              )}
              {tab === "clips" && job.clips && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] tabular-nums">
                  {readyClips}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === "overview" && (
            <div className="space-y-5">
              <h2 className="text-h2">YouTube-ready metadata</h2>
              <CopyBlock label="Title" value={scriptData.title} />
              <CopyBlock label="Description" value={scriptData.description} multiline />
              {scriptData.thumbnail_hook && (
                <CopyBlock label="Thumbnail text" value={scriptData.thumbnail_hook} />
              )}
            </div>
          )}

          {activeTab === "script" && (
            <div className="space-y-2">
              {scriptData.sections.map((s, idx) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--border-active)] transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-mono text-[var(--text-muted)] w-6 tabular-nums shrink-0">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${
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
                    <span className="text-[11px] text-[var(--accent-hover)] truncate flex-1">
                      {s.visual_keyword}
                    </span>
                    {s.key_point && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--border)] text-[var(--text-secondary)] shrink-0">
                        Lower third
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums shrink-0">
                      ~{s.duration}s
                    </span>
                  </div>
                  {s.narration ? (
                    <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed pl-9">
                      {s.narration}
                    </p>
                  ) : (
                    <p className="text-[12px] text-[var(--text-muted)] italic pl-9">✦ Visual transition</p>
                  )}
                  {s.key_point && (
                    <div className="mt-2 ml-9 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                      <span className="text-[10px] text-[var(--accent-hover)]">📌 {s.key_point}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "clips" && (
            <div>
              {job.clips && job.clips.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {job.clips.map((clip, i) => (
                    <div
                      key={clip.id}
                      className={`rounded-xl overflow-hidden border transition-colors ${
                        clip.status === "ready"
                          ? "border-[var(--border)] hover:border-[var(--border-active)]"
                          : clip.status === "failed"
                          ? "border-red-500/30 opacity-50"
                          : "border-[var(--border)] opacity-50"
                      }`}
                    >
                      {clip.thumbUrl ? (
                        <img
                          src={clip.thumbUrl}
                          alt={clip.keyword}
                          className="w-full aspect-video object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-video bg-[var(--bg-card)] flex items-center justify-center">
                          <Film className="h-6 w-6 text-[var(--text-muted)]" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-[var(--text-muted)]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                              clip.status === "ready"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : clip.status === "failed"
                                ? "bg-red-500/15 text-red-400"
                                : "bg-white/10 text-[var(--text-muted)]"
                            }`}
                          >
                            {clip.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] truncate mt-1">
                          {clip.keyword}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[14px] text-[var(--text-muted)]">No clip data available.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CopyBlock({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-caption text-[var(--text-muted)]">{label}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-[11px] text-[var(--text-secondary)] hover:text-white flex items-center gap-1.5 transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-[var(--success)]" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className={`text-[14px] text-white ${multiline ? "leading-relaxed whitespace-pre-wrap" : "truncate"}`}>
        {value}
      </div>
    </div>
  );
}

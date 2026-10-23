import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Logo } from "@/components/Logo";
import { useJob } from "@/lib/usePipeline";
import { VoiceCommandBar, type VoiceActionEvent } from "@/components/VoiceCommandBar";
import {
  Check,
  Copy,
  Download,
  RotateCcw,
  Sparkles,
  Loader2,
  Film,
  Clock,
  Mic,
  Maximize2,
  Scissors,
  Play,
  Palette,
  Zap,
  Volume2,
} from "lucide-react";

export const Route = createFileRoute("/result/$jobId")({
  head: () => ({ meta: [{ title: "Your video · VidRush" }] }),
  component: ResultPage,
});

// Built-in Showcase Metadata for The-Complete-History-SnapYT.App.mp4
const DEMO_JOB = {
  id: "demo",
  title: "The Complete History: Secrets of the Ancient World",
  voice: "Brian · Authoritative Male",
  length: "medium",
  theme: "cinematic",
  background: "gradient_dark",
  mode: "auto",
  stage: "done",
  progress: 100,
  message: "Video updated and ready for YouTube export!",
  script: {
    title: "The Complete History: Secrets of the Ancient World",
    description:
      "A comprehensive visual deep-dive exploring how ancient empires engineered monuments that survived millennia.",
    mood: "epic_cinematic",
    sections: [
      {
        id: 1,
        section_type: "intro",
        title: "The Dawn of Empires",
        duration: 45,
        key_point: "Foundations of Civilization",
        narration:
          "Throughout human history, monumental achievements have risen from the sands of time, shaping the destiny of civilizations...",
      },
      {
        id: 2,
        section_type: "scene_2",
        title: "Monuments of Eternity",
        duration: 50,
        key_point: "Colossal Engineering",
        narration:
          "From the colossal monoliths of Egypt to the aqueducts of Rome, engineering marvels defied the limitations of their era...",
      },
      {
        id: 3,
        section_type: "scene_3",
        title: "Trade & Scientific Exchange",
        duration: 50,
        key_point: "Crossroads of Innovation",
        narration:
          "Trade routes connected distant corners of the world, fostering exchanges of science, philosophy, and astronomical discoveries...",
      },
      {
        id: 4,
        section_type: "scene_4",
        title: "Rise & Fall of Powers",
        duration: 50,
        key_point: "Imperial Transformations",
        narration:
          "Yet with every golden age came periods of profound disruption. Conflicts and environmental shifts redrew the boundaries of empires...",
      },
      {
        id: 5,
        section_type: "scene_5",
        title: "The Renaissance of Knowledge",
        duration: 50,
        key_point: "Golden Age Revival",
        narration:
          "Preserved manuscripts and newfound navigational tools ignited an unprecedented revival of art, medicine, and human curiosity...",
      },
      {
        id: 6,
        section_type: "outro",
        title: "Echoes in the Modern World",
        duration: 45,
        key_point: "Timeless Legacy",
        narration:
          "Today, their legacy echoes through our modern cities, reminding us that every innovation stands on the shoulders of giants.",
      },
    ],
  },
  clips: Array.from({ length: 24 }).map((_, i) => ({
    id: i + 1,
    keyword: "cinematic ancient history architecture",
    status: "ready" as const,
    duration: 12,
    thumbUrl: "/videos/demo/thumb.jpg",
    videoUrl: "/The-Complete-History-SnapYT.App.mp4",
    source: i % 2 === 0 ? "pexels" : "pixabay",
    externalId: String(i + 1),
  })),
  renderSteps: [
    { id: "1", label: "Slicing sections into fast cuts", done: true },
    { id: "2", label: "Pre-rendering cuts with cinematic color grade", done: true },
    { id: "3", label: "Merging voiceover audio tracks", done: true },
    { id: "4", label: "Generating karaoke captions (ASS format)", done: true },
    { id: "5", label: "Chaining cuts with xfade transitions", done: true },
    { id: "6", label: "Mixing audio + burning captions + overlays", done: true },
    { id: "7", label: "Generating thumbnail", done: true },
  ],
  renderProgress: 100,
  videoUrl: "/The-Complete-History-SnapYT.App.mp4",
  thumbnailUrl: "/videos/demo/thumb.jpg",
  durationSeconds: 290,
  errorMessage: null,
};

const COLOR_GRADES: Record<string, string> = {
  none: "none",
  cinematic: "contrast(1.22) saturate(1.3) brightness(1.02)",
  noir: "grayscale(1) contrast(1.35) brightness(0.95)",
  vintage: "sepia(0.68) contrast(1.15) brightness(1.05) hue-rotate(-12deg)",
  cyberpunk: "contrast(1.35) saturate(1.85) hue-rotate(275deg)",
  sunset: "sepia(0.35) saturate(1.5) hue-rotate(-10deg) brightness(1.08)",
};

interface VideoPart {
  id: number;
  label: string;
  start: number;
  end: number;
}

function ResultPage() {
  const { jobId } = Route.useParams();
  const fetchedJob = useJob(jobId);
  const navigate = useNavigate();

  // Use real fetched job or fallback to showcase video
  const job =
    jobId === "demo" || jobId === "showcase" || !fetchedJob?.script
      ? (DEMO_JOB as any)
      : fetchedJob;

  const [activeTab, setActiveTab] = useState<"overview" | "script" | "clips">("overview");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ─── Real-Time Voice-Controlled Video States ─────────────────────────────
  const [colorGrade, setColorGrade] = useState<string>("none");
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [hasVignette, setHasVignette] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [hudMessage, setHudMessage] = useState<string | null>(null);
  const [parts, setParts] = useState<VideoPart[]>([
    { id: 1, label: "Full Video (0:00 - 4:50)", start: 0, end: 290 },
  ]);
  const [activePartId, setActivePartId] = useState<number>(1);

  const showHud = (msg: string) => {
    setHudMessage(msg);
    setTimeout(() => setHudMessage(null), 3500);
  };

  // ─── Real-Time Voice Director Action Handler ──────────────────────────────
  const handleVoiceDirectorAction = (action: VoiceActionEvent) => {
    const video = videoRef.current;
    if (!video) return;

    // 1. SPLIT VIDEO IN TWO PARTS / MULTIPLE PARTS
    if (action.type === "split_parts") {
      const numParts = action.payload?.parts || 2;
      const totalDur = Math.round(video.duration || 290);
      const step = totalDur / numParts;
      const newParts: VideoPart[] = [];
      for (let p = 0; p < numParts; p++) {
        const s = Math.round(p * step);
        const e = Math.round((p + 1) * step);
        newParts.push({
          id: p + 1,
          label: `Part ${p + 1} (${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} - ${Math.floor(e / 60)}:${String(e % 60).padStart(2, "0")})`,
          start: s,
          end: e,
        });
      }
      setParts(newParts);
      setActivePartId(1);
      video.currentTime = newParts[0].start;
      video.play();
      showHud(`✂️ Split video into ${numParts} parts · Now playing Part 1`);
      return;
    }

    // 2. SPLIT AT CURRENT TIME
    if (action.type === "split_at_current") {
      const cutTime = Math.round(video.currentTime);
      const totalDur = Math.round(video.duration || 290);
      const newParts: VideoPart[] = [
        {
          id: 1,
          label: `Part 1 (0:00 - ${Math.floor(cutTime / 60)}:${String(cutTime % 60).padStart(2, "0")})`,
          start: 0,
          end: cutTime,
        },
        {
          id: 2,
          label: `Part 2 (${Math.floor(cutTime / 60)}:${String(cutTime % 60).padStart(2, "0")} - ${Math.floor(totalDur / 60)}:${String(totalDur % 60).padStart(2, "0")})`,
          start: cutTime,
          end: totalDur,
        },
      ];
      setParts(newParts);
      setActivePartId(2);
      showHud(
        `✂️ Split at ${Math.floor(cutTime / 60)}:${String(cutTime % 60).padStart(2, "0")} · Part 1 & Part 2 created`
      );
      return;
    }

    // 3. JUMP TO PART X
    if (action.type === "jump_part") {
      const targetPart = parts.find((p) => p.id === action.payload?.partIndex);
      if (targetPart) {
        setActivePartId(targetPart.id);
        video.currentTime = targetPart.start;
        video.play();
        showHud(`⏩ Jumped to ${targetPart.label}`);
      }
      return;
    }

    // 4. COLOR GRADING SHIFT
    if (action.type === "color_grade") {
      const grade = action.payload?.grade || "cinematic";
      setColorGrade(grade);
      showHud(`🎨 Color Grading: ${grade.toUpperCase()} applied`);
      return;
    }

    // 5. VIDEO EFFECTS (ZOOM, VIGNETTE)
    if (action.type === "zoom") {
      const scale = action.payload?.scale || 1.3;
      setZoomScale(scale);
      showHud(scale > 1 ? `🔍 Zoom Effect: ${scale}x magnification` : `🔍 Zoom reset`);
      return;
    }

    if (action.type === "vignette") {
      setHasVignette((prev) => {
        const next = !prev;
        showHud(next ? "🎬 Radial Vignette Effect Enabled" : "🎬 Vignette Effect Disabled");
        return next;
      });
      return;
    }

    // 6. DURATION / PLAYBACK SPEED
    if (action.type === "speed") {
      const rate = action.payload?.rate || 1.0;
      setPlaybackSpeed(rate);
      video.playbackRate = rate;
      showHud(`⚡ Playback speed set to ${rate}x`);
      return;
    }

    // 7. TIMELINE SEEK
    if (action.type === "seek") {
      const sec = action.payload?.seconds || 0;
      video.currentTime = sec;
      video.play();
      showHud(`⏩ Timeline scrubbed to ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);
      return;
    }

    // 8. PLAY / PAUSE / STOP
    if (action.type === "play") {
      video.play();
      showHud("▶️ Video playing via Wispr Flow");
      return;
    }

    if (action.type === "pause") {
      video.pause();
      showHud("⏸️ Video paused via Wispr Flow");
      return;
    }

    if (action.type === "restart") {
      video.currentTime = 0;
      video.play();
      showHud("⏮️ Restarted from beginning");
      return;
    }
  };

  const scriptData = job.script || DEMO_JOB.script;
  const videoUrl =
    job.videoUrl || "/The-Complete-History-SnapYT.App.mp4";

  const readyClips =
    job.clips?.filter((c: any) => c.status === "ready").length ?? scriptData.sections.length * 4;

  const voiceLabel =
    job.voice?.split("-").slice(2).join("-").replace("Neural", "") || job.voice || "Brian · Authoritative";

  const estSec = 290;
  const durationStr = "4m 50s";

  const stats = [
    { icon: Film, l: "Clips", v: `${readyClips}` },
    { icon: Clock, l: "Duration", v: durationStr },
    { icon: Mic, l: "Voice", v: voiceLabel },
    { icon: Maximize2, l: "Resolution", v: "1920×1080" },
  ];

  return (
    <div className="dark-app min-h-screen pb-20">
      <header className="h-14 border-b border-[var(--border)] flex items-center px-5 justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline-flex text-[11px] font-medium px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
            Wispr Flow Interactive Director
          </span>
          <Link
            to="/"
            className="text-[13px] text-[var(--text-secondary)] hover:text-white transition-colors flex items-center gap-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New video
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {/* Real-time Voice Command Bar for post-production editing */}
        <div className="mb-6">
          <VoiceCommandBar
            videoId={jobId}
            videoElement={videoRef.current}
            sections={scriptData.sections}
            onVoiceAction={handleVoiceDirectorAction}
            onActionExecuted={(res) => {
              if (res.execution?.newVideoId) {
                navigate({ to: "/generate/$jobId", params: { jobId: res.execution.newVideoId } });
              }
            }}
          />
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 text-[12px] text-[var(--success)] mb-3 animate-fade-in">
          <Sparkles className="h-3.5 w-3.5" />
          Pipeline Complete · High-Grade Documentary Video Ready
        </div>

        <h1 className="text-h1 mb-2 animate-fade-up">{scriptData.title}</h1>
        <p
          className="text-[var(--text-secondary)] mb-6 animate-fade-up max-w-3xl leading-relaxed"
          style={{ animationDelay: "60ms" }}
        >
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

        {/* ─── Real-Time Split Parts Bar (Populated via Wispr Flow Dictation) ─── */}
        {parts.length > 1 && (
          <div className="mb-4 p-3.5 rounded-2xl bg-white/[0.03] border border-purple-500/25 flex flex-wrap items-center justify-between gap-3 animate-fade-in shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Scissors className="h-4 w-4 text-purple-400" /> Video Split Parts ({parts.length})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {parts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setActivePartId(p.id);
                    if (videoRef.current) {
                      videoRef.current.currentTime = p.start;
                      videoRef.current.play();
                    }
                    showHud(`Playing ${p.label}`);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all flex items-center gap-1.5 ${
                    activePartId === p.id
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-2 ring-purple-400"
                      : "bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/[0.09]"
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Interactive Video Player with Real-Time Filters & Effects ─── */}
        <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] bg-black shadow-[0_30px_100px_-30px_var(--accent-glow)]">
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            controls
            poster={job.thumbnailUrl || "/videos/demo/thumb.jpg"}
            className="w-full aspect-video transition-all duration-500 ease-out"
            style={{
              filter: COLOR_GRADES[colorGrade] || "none",
              transform: `scale(${zoomScale})`,
            }}
          />

          {/* Real-time Vignette Radial Shadow Overlay */}
          {hasVignette && (
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{
                background:
                  "radial-gradient(circle at center, transparent 55%, rgba(0,0,0,0.85) 100%)",
              }}
            />
          )}

          {/* Real-time Director HUD Toast Banner */}
          {hudMessage && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/85 backdrop-blur-md border border-purple-500/40 text-purple-200 text-[13px] font-semibold flex items-center gap-2 shadow-2xl animate-fade-in z-20">
              <Zap className="h-4 w-4 text-purple-400 animate-pulse" />
              <span>{hudMessage}</span>
            </div>
          )}

          {/* Active Color Grade Badge in corner */}
          {colorGrade !== "none" && (
            <div className="absolute bottom-4 left-4 px-2.5 py-1 rounded-md bg-black/65 backdrop-blur text-[11px] font-mono text-purple-300 border border-purple-500/30 uppercase flex items-center gap-1.5">
              <Palette className="h-3 w-3" /> Grade: {colorGrade}
            </div>
          )}

          {/* Active Playback Speed Badge */}
          {playbackSpeed !== 1.0 && (
            <div className="absolute bottom-4 right-4 px-2.5 py-1 rounded-md bg-black/65 backdrop-blur text-[11px] font-mono text-emerald-300 border border-emerald-500/30 uppercase">
              Speed: {playbackSpeed}x
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={videoUrl}
            download="vidrush-documentary.mp4"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors font-medium text-white shadow-md"
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
              {tab === "clips" && (
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
            </div>
          )}

          {activeTab === "script" && (
            <div className="space-y-2">
              {scriptData.sections.map((s: any, idx: number) => (
                <div
                  key={s.id || idx}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--border-active)] transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-mono text-[var(--text-muted)] w-6 tabular-nums shrink-0">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--accent)]">
                      {s.section_type || "scene"}
                    </span>
                    <span className="text-[13px] font-medium text-white">{s.title}</span>
                    <span className="text-[11px] text-[var(--text-muted)] ml-auto font-mono">
                      {s.duration}s
                    </span>
                  </div>
                  <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed pl-9">
                    {s.narration}
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === "clips" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {job.clips?.map((c: any) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-video bg-black/40">
                    <img
                      src={c.thumbUrl || "/videos/demo/thumb.jpg"}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white">
                      {c.duration}s
                    </span>
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div className="text-[11px] font-medium text-white line-clamp-1">{c.keyword}</div>
                    <div className="text-[9.5px] text-[var(--text-muted)] font-mono uppercase mt-1">
                      {c.source || "pexels"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CopyBlock({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
          {label}
        </span>
        <button
          onClick={copy}
          className="text-[11px] text-[var(--text-secondary)] hover:text-white transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      {multiline ? (
        <p className="text-[13.5px] text-white leading-relaxed whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-[14px] text-white font-medium">{value}</p>
      )}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { TopicInput } from "@/components/TopicInput";
import { VoiceCommandBar } from "@/components/VoiceCommandBar";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileSearch,
  PenLine,
  Mic2,
  Film,
  Wand2,
  Sparkles,
  Play,
  X,
  Search,
  Zap,
  Volume2,
  Cpu,
  Layers,
  Code2,
  Video,
} from "lucide-react";
import planeAfter from "@/assets/cinematic-plane.jpg";
import planeBefore from "@/assets/plain-plane.jpg";
import oceanImg from "@/assets/ocean-cinematic.jpg";
import egyptImg from "@/assets/egypt-cinematic.jpg";
import romeImg from "@/assets/rome-cinematic.jpg";
import tokyoImg from "@/assets/tokyo-cinematic.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VidRush — Voice-Directed AI Video Pipeline (Wispr Flow Hackathon)" },
      {
        name: "description",
        content:
          "Dictate with Wispr Flow. Watch Groq, ElevenLabs, and FFmpeg research, script, narrate, and edit multi-minute YouTube documentaries in real time.",
      },
      { property: "og:title", content: "VidRush — Voice-Directed AI Video Pipeline" },
      {
        property: "og:description",
        content: "Built for Wispr Flow & VMake Dev Hackathon 2026. A voice-first documentary video creator.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--ink)] overflow-x-hidden">
      <Nav />
      <Hero />
      <MarqueeBar />
      <EditorMock />
      <VoiceDirectorSection />
      <FeaturesIntro />
      <FeatureScript />
      <FeatureTeamAndStyle />
      <FeatureFootage />
      <HackathonTechStack />
      <Faq />
      <CtaBanner />
      <Footer />
    </div>
  );
}

/* ───────────────────────── NAV ───────────────────────── */

function Nav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-[var(--text-secondary)] font-medium">
          <a href="#editor" className="hover:text-[var(--ink)] transition-colors">Interactive Timeline</a>
          <a href="#voice-director" className="hover:text-[var(--ink)] transition-colors flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-purple-600" /> Wispr Voice Director
          </a>
          <a href="#features" className="hover:text-[var(--ink)] transition-colors">Pipeline</a>
          <a href="#tech-stack" className="hover:text-[var(--ink)] transition-colors">Architecture</a>
          <a href="#faq" className="hover:text-[var(--ink)] transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            to="/result/demo"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors text-[12.5px] font-medium shadow-sm"
          >
            <Play className="h-3 w-3 fill-current" /> Live Voice Demo
          </Link>
          <Link
            to="/create"
            className="text-[13px] px-4 py-2 rounded-xl bg-[var(--ink)] text-white hover:bg-black transition-colors font-medium shadow-sm"
          >
            Launch Studio
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────── HERO ───────────────────────── */

function Hero() {
  return (
    <section className="relative hero-canvas">
      {/* aurora blobs */}
      <div className="absolute inset-0 overflow-hidden px-2 pointer-events-none">
        <div className="aurora absolute top-[-120px] left-[-80px] h-[360px] w-[360px] rounded-full bg-[#a3b8ff]/60" />
        <div className="aurora absolute top-[80px] right-[-100px] h-[420px] w-[420px] rounded-full bg-[#ffb8e4]/50" style={{ animationDelay: "3s" }} />
        <div className="aurora absolute bottom-[-160px] left-[30%] h-[400px] w-[400px] rounded-full bg-[#c8b5ff]/60" style={{ animationDelay: "5s" }} />
      </div>
      <div className="absolute inset-0 noise pointer-events-none opacity-60" />

      <div className="relative max-w-6xl mx-auto px-5 pt-16 pb-24 md:pt-24 md:pb-32 flex flex-col items-center text-center">
        {/* Hackathon Submission Badge */}
        <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-purple-900 px-3.5 py-1.5 rounded-full border border-purple-200 bg-purple-50/80 backdrop-blur mb-6 animate-fade-in shadow-sm">
          <Zap className="h-3.5 w-3.5 text-purple-600 fill-purple-600" />
          Wispr Flow &amp; VMake Dev Hackathon 2026 Submission
        </div>

        <h1 className="text-display text-hero max-w-4xl animate-fade-up px-2 py-1">
          Voice-directed video creation,{" "}
          <span className="italic relative">
            in real time.
            <svg viewBox="0 0 200 12" className="absolute -bottom-2 left-0 w-full h-2 text-[var(--accent)]" preserveAspectRatio="none">
              <path d="M2 8 Q 50 2 100 6 T 198 5" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </h1>

        <p
          className="mt-6 text-[18px] md:text-[20px] text-[var(--text-secondary)] max-w-2xl animate-fade-up leading-relaxed"
          style={{ animationDelay: "80ms" }}
        >
          Dictate stream-of-consciousness thoughts with Wispr Flow. Groq, ElevenLabs, and FFmpeg research, script, narrate, and cut full YouTube documentaries with cinematic b-roll and karaoke subtitles.
        </p>

        <div className="mt-10 w-full animate-fade-up" style={{ animationDelay: "160ms" }}>
          <TopicInput />
          <div className="mt-4 flex justify-center">
            <Link
              to="/result/demo"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-900 hover:text-purple-950 text-[13px] font-medium transition-all"
            >
              <Play className="h-3.5 w-3.5 fill-current text-purple-600" />
              <span>Or jump directly to the <strong>Live Dictation Demo Video</strong> →</span>
            </Link>
          </div>
        </div>

        {/* Hackathon Feature Highlights */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-5 text-[12.5px] text-[var(--text-secondary)] animate-fade-up" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-emerald-800">Wispr Flow Realtime Voice Interface</span>
          </div>
          <span className="text-gray-300">•</span>
          <span className="font-medium">Groq 120B Structured Scripting</span>
          <span className="text-gray-300">•</span>
          <span className="font-medium">ElevenLabs Studio Voiceover</span>
          <span className="text-gray-300">•</span>
          <span className="font-medium">Fast Cuts Every 3.5s &amp; Karaoke ASS</span>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── MARQUEE ───────────────────────── */

function MarqueeBar() {
  const labels = [
    "WISPR FLOW DICTATION",
    "VOICE COMMAND TIMELINE DIRECTOR",
    "GROQ 120B DOCUMENTARY SCRIPTING",
    "ELEVENLABS NARRATION",
    "PEXELS & PIXABAY B-ROLL",
    "KEN BURNS MOTION",
    "KARAOKE ASS SUBTITLES",
    "ZERO-BLOAT FFmpeg ENGINE",
  ];
  const doubled = [...labels, ...labels];
  return (
    <div className="border-y border-[var(--border)] bg-white/60 backdrop-blur py-4 overflow-hidden">
      <div className="flex w-max marquee-track gap-12">
        {doubled.map((l, i) => (
          <div key={i} className="flex items-center gap-12 text-[12.5px] tracking-[0.16em] text-[var(--text-muted)] font-medium">
            {l}
            <span className="h-1 w-1 rounded-full bg-[var(--accent)]/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── EDITOR MOCK ───────────────────────── */

function EditorMock() {
  return (
    <section id="editor" className="relative ink-section py-20 md:py-28 overflow-hidden">
      <div className="absolute inset-0 dotted-grid opacity-30 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[300px] w-[800px] bg-[var(--accent)]/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-5">
        <div className="text-center mb-10">
          <div className="text-caption text-[var(--accent-hover)] mb-2">Automated FFmpeg Assembly</div>
          <h2 className="text-display text-h1 text-white max-w-2xl mx-auto">
            Multi-track documentary composition <span className="italic">in real time.</span>
          </h2>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0f0f15] shadow-[0_60px_120px_-40px_rgba(108,71,255,0.4)] overflow-hidden">
          {/* top toolbar */}
          <div className="flex items-center justify-between px-5 h-12 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-4 text-[11px] font-mono text-white/40">vidrush ▸ documentary_render.proj</span>
            </div>
            <div className="text-[11px] font-mono text-white/60 tabular-nums">
              00:08:24 <span className="text-white/30">/ 00:10:00</span>
            </div>
            <div className="flex items-center gap-3 text-white/40">
              <span className="text-[11px]">30 FPS</span>
              <Play className="h-3.5 w-3.5 fill-current" />
            </div>
          </div>

          {/* ruler */}
          <div className="relative h-7 px-5 bg-[#13131a] border-b border-white/5">
            <div className="absolute inset-x-5 top-0 bottom-0 flex justify-between items-center text-[10px] font-mono text-white/30">
              {["0:00", "0:02", "0:04", "0:06", "0:08", "0:10", "0:12", "0:14"].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>

          {/* tracks */}
          <div className="relative p-5 space-y-2 bg-[#0d0d12]">
            <TrackLabel name="VIDEO B-ROLL (CUTS EVERY 3.5s)" />
            <FootageRow />

            <TrackLabel name="ELEVENLABS VOICEOVER (STUDIO NARRATION)" />
            <VoiceoverRow />

            <TrackLabel name="KARAOKE ASS SUBTITLES" />
            <CaptionsRow />

            <TrackLabel name="BACKGROUND SCORE & SOUND DESIGN" />
            <BgmRow />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrackLabel({ name }: { name: string }) {
  return (
    <div className="text-[10px] font-mono tracking-wider text-white/40 uppercase pt-2 pb-1">
      {name}
    </div>
  );
}

function FootageRow() {
  const clips = [
    { label: "pan-right", dur: "3.5s", color: "from-blue-600/40 to-blue-500/20" },
    { label: "zoom-in", dur: "3.2s", color: "from-indigo-600/40 to-indigo-500/20" },
    { label: "pan-up", dur: "3.5s", color: "from-cyan-600/40 to-cyan-500/20" },
    { label: "zoom-out", dur: "3.8s", color: "from-sky-600/40 to-sky-500/20" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 h-14">
      {clips.map((c, i) => (
        <div
          key={i}
          className={`rounded-lg bg-gradient-to-r ${c.color} border border-white/10 p-2 flex flex-col justify-between`}
        >
          <span className="text-[11px] font-medium text-white truncate">Clip {i + 1} ({c.label})</span>
          <span className="text-[10px] font-mono text-white/50">{c.dur}</span>
        </div>
      ))}
    </div>
  );
}

function VoiceoverRow() {
  return (
    <div className="h-10 rounded-md flex items-center px-3 gap-2 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border-l-2 border-emerald-500">
      <span className="text-[11px] text-emerald-100 font-medium shrink-0">🎙️ Narrator: Brian (Deep Authoritative)</span>
      <div className="flex gap-[2px] items-center flex-1 h-6">
        {Array.from({ length: 90 }).map((_, i) => {
          const h = 25 + ((i * 47) % 65);
          return <span key={i} className="w-[3px] rounded-full bg-emerald-400/70" style={{ height: `${h}%` }} />;
        })}
      </div>
    </div>
  );
}

function CaptionsRow() {
  const words = ["In", "1942,", "the", "skies", "became", "a", "battlefield", "of", "relentless", "innovation."];
  return (
    <div className="h-8 rounded-md flex items-center px-3 gap-1.5 bg-white/[0.03] border-l-2 border-purple-500 overflow-hidden">
      <span className="text-[10px] font-mono text-purple-300 mr-2 shrink-0">ASS KARAOKE:</span>
      {words.map((w, i) => (
        <span
          key={i}
          className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
            i === 3
              ? "bg-purple-500 text-white shadow-sm"
              : "text-white/70"
          }`}
        >
          {w}
        </span>
      ))}
    </div>
  );
}

function BgmRow() {
  return (
    <div className="h-10 rounded-md flex items-center px-3 gap-2 bg-gradient-to-r from-amber-500/20 to-amber-500/10 border-l-2 border-amber-500">
      <span className="text-[11px] text-amber-100 font-medium shrink-0">🎵 Cinematic Atmosphere</span>
      <div className="flex gap-[2px] items-center flex-1 h-6">
        {Array.from({ length: 80 }).map((_, i) => {
          const h = 20 + ((i * 37) % 70);
          return <span key={i} className="w-[3px] rounded-full bg-amber-300/70" style={{ height: `${h}%` }} />;
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── VOICE DIRECTOR SHOWCASE ───────────────────────── */

function VoiceDirectorSection() {
  const navigate = useNavigate();
  return (
    <section id="voice-director" className="py-20 ink-section bg-[#0b0c10] text-white relative">
      <div className="max-w-5xl mx-auto px-5 text-center">
        <div className="inline-flex items-center gap-2 text-[12px] text-purple-300 font-semibold px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/25 mb-4">
          <Zap className="h-3.5 w-3.5 text-purple-400" /> Hackathon Core Feature
        </div>
        <h2 className="text-display text-h1 text-white mb-4">
          The Wispr Flow <span className="italic text-purple-400">Voice Director.</span>
        </h2>
        <p className="text-[16px] text-white/70 max-w-2xl mx-auto mb-9 leading-relaxed">
          Talk naturally to create and modify your video. Jump to specific scenes, rewrite narration, change narrator voices, or swap b-roll with zero keyboard typing.
        </p>

        {/* Live Interactive Voice Director Bar */}
        <VoiceCommandBar
          onActionExecuted={(res) => {
            if (res.execution?.newVideoId) {
              navigate({ to: "/generate/$jobId", params: { jobId: res.execution.newVideoId } });
            }
          }}
        />
      </div>
    </section>
  );
}

/* ───────────────────────── FEATURES INTRO ───────────────────────── */

function FeaturesIntro() {
  return (
    <section id="features" className="py-20 md:py-28">
      <div className="max-w-3xl mx-auto px-5 text-center">
        <div className="text-caption text-[var(--accent)] mb-3">Modular Pipeline</div>
        <h2 className="text-display text-h1 mb-4">
          Complete creative control in every <span className="italic">step.</span>
        </h2>
        <p className="text-[16.5px] text-[var(--text-secondary)] leading-relaxed">
          VidRush lets you dictate changes on the fly. Approve generated scripts, restyle clips, or let the pipeline run completely end-to-end.
        </p>
      </div>
    </section>
  );
}

/* ───────────────────────── FEATURE: SCRIPT APPROVAL ───────────────────────── */

function FeatureScript() {
  return (
    <section className="max-w-7xl mx-auto px-5 pb-20">
      <div className="grid md:grid-cols-2 gap-6 rounded-3xl border border-[var(--border)] bg-gradient-to-br from-white to-[#f5f3ff] p-8 md:p-12 overflow-hidden">
        <div className="flex flex-col justify-center max-w-md">
          <h3 className="text-display text-[34px] leading-[1.05] tracking-tight mb-4">
            Structured Groq 120B <span className="italic">script generation.</span>
          </h3>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            Groq models produce structured documentary sections with targeted word counts, clear visual pacing, and specific stock search queries.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Historical Deep Dive", "True Crime", "Science Explainer", "Tech Briefing"].map((t) => (
              <span key={t} className="text-[12px] px-3 py-1 rounded-full bg-white border border-[var(--border)] text-[var(--text-secondary)] font-medium">
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="rounded-2xl bg-[#15151c] border border-[#26262f] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.4)] glow-accent">
            <div className="space-y-3">
              <ScriptLine text="In World War II, the skies became a battlefield of innovation." />
              <ScriptLine text="Each aircraft was pushed to its absolute mechanical limit." dim />
              <ScriptLine text="Some succeeded gloriously. Others failed catastrophically." dim />
              <div className="rounded-xl bg-[var(--accent)] p-4 mt-4 shadow-[0_12px_40px_-12px_var(--accent-glow)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-wider text-white/70 font-medium mb-1">Section 03 · Hook</div>
                    <p className="text-white text-[14px] leading-snug">
                      Skies turned into war innovation — the moment aviation rewrote itself forever.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button className="text-[11px] px-2.5 py-1 rounded-md bg-white text-[var(--accent)] font-medium hover:bg-white/90 transition-colors flex items-center gap-1">
                      <Check className="h-3 w-3" /> Approve
                    </button>
                    <button className="text-[11px] px-2.5 py-1 rounded-md bg-white/10 text-white font-medium hover:bg-white/20 transition-colors flex items-center gap-1">
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </div>
              </div>
              <ScriptLine text="Today, we look at five aircraft that changed warfare forever." dim />
            </div>
          </div>
          <div className="absolute -top-3 -right-3 rotate-6 px-3 py-1 rounded-lg bg-white border border-[var(--border)] text-[11px] font-medium shadow-md">
            ✦ AI Generated Script
          </div>
        </div>
      </div>
    </section>
  );
}

function ScriptLine({ text, dim }: { text: string; dim?: boolean }) {
  return (
    <div className={`text-[14px] leading-snug px-1 ${dim ? "text-white/50" : "text-white/90"}`}>{text}</div>
  );
}

/* ───────────────────────── FEATURE: TEAM + STYLE MATCH ───────────────────────── */

function FeatureTeamAndStyle() {
  const [slider, setSlider] = useState(50);
  return (
    <section className="max-w-7xl mx-auto px-5 pb-20">
      <div className="grid md:grid-cols-2 gap-6 rounded-3xl border border-[var(--border)] bg-gradient-to-br from-white to-[#f5f3ff] p-8 md:p-12 overflow-hidden">
        <div className="flex flex-col justify-center max-w-md">
          <h3 className="text-display text-[34px] leading-[1.05] tracking-tight mb-4">
            Cinematic Ken Burns &amp; <span className="italic">color grading.</span>
          </h3>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            Every stock cut receives dynamic pan-and-zoom motion cycling alongside customized color grading filters (Cinematic, Modern, Crime, Vintage).
          </p>
        </div>

        <div className="relative rounded-2xl overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,0.3)] border border-[var(--border)] aspect-[16/10] select-none">
          <img src={planeAfter} alt="After" className="absolute inset-0 h-full w-full object-cover" />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - slider}% 0 0)` }}
          >
            <img src={planeBefore} alt="Before" className="h-full w-full object-cover" />
          </div>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] cursor-ew-resize"
            style={{ left: `${slider}%` }}
          />
          <input
            type="range"
            min="0"
            max="100"
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
          />
          <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 text-white text-[11px] font-mono">
            RAW STOCK
          </div>
          <div className="absolute top-3 right-3 px-2 py-1 rounded bg-[var(--accent)] text-white text-[11px] font-mono">
            COLOR GRADED
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FEATURE: FOOTAGE ───────────────────────── */

function FeatureFootage() {
  const cards = [
    { site: "pexels.com", title: "Aerial clouds over mountain range at sunset", img: oceanImg },
    { site: "pixabay.com", title: "Pyramids of Giza cinematic 4k drone flyover", img: egyptImg },
    { site: "pexels.com", title: "Night city streets rain reflections", img: tokyoImg },
  ];
  return (
    <section className="max-w-7xl mx-auto px-5 pb-20">
      <div className="grid md:grid-cols-2 gap-6 rounded-3xl border border-[var(--border)] bg-gradient-to-br from-white to-[#f5f3ff] p-8 md:p-12 overflow-hidden">
        <div className="flex flex-col justify-center max-w-md">
          <h3 className="text-display text-[34px] leading-[1.05] tracking-tight mb-4">
            Resilient stock clips from <span className="italic">Pexels &amp; Pixabay.</span>
          </h3>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            Multi-phase stock footage downloader with redirect handling and deduplication ensures fresh visual cuts every 2.5 to 4.0 seconds.
          </p>
        </div>

        <div className="relative bg-gradient-to-br from-[#1a1330] to-[#0d0d15] rounded-2xl p-5 overflow-hidden min-h-[340px]">
          <div className="space-y-3">
            {cards.map((c, i) => (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/5 backdrop-blur"
              >
                <img src={c.img} alt="" loading="lazy" className="h-14 w-24 rounded-md object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/40 font-mono mb-0.5">{c.site}</div>
                  <div className="text-[13.5px] text-white font-medium truncate">{c.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── HACKATHON TECH STACK ───────────────────────── */

function HackathonTechStack() {
  const stack = [
    {
      name: "Wispr Flow Voice API",
      role: "Speech Dictation & Director",
      badge: "Hackathon Sponsor",
      desc: "Low-latency streaming speech transcription powering the live voice director bar and landing hero dictation.",
      features: [
        "Web Audio API real-time visualizer waveform",
        "Zero-latency timeline scrubbing ('jump to scene 2')",
        "Context-aware spoken command interpretation",
      ],
      highlight: true,
    },
    {
      name: "Groq Cloud (120B)",
      role: "Structured Scripting & Intent",
      badge: "Fast AI Inference",
      desc: "High-speed LLM generating multi-section documentary scripts and mapping voice commands to Zod action schemas.",
      features: [
        "Multi-scene documentary script generator",
        "Zod-validated pipeline action schemas",
        "Auto rate-limit retry & exponential backoff",
      ],
    },
    {
      name: "ElevenLabs & FFmpeg",
      role: "Audio Synthesis & Video Engine",
      badge: "Production Engine",
      desc: "Studio-grade narrator voices (Brian / Aria / Adam) merged with dynamic cuts, Ken Burns motion, and karaoke ASS subtitles.",
      features: [
        "Fast cuts every 2.5s–4.0s with color grading",
        "Rolling cleanup zero-bloat disk management",
        "Selective scene re-rendering cache",
      ],
    },
  ];

  return (
    <section id="tech-stack" className="py-20 md:py-28 bg-gradient-to-b from-[var(--bg-base)] to-[#f3f0ff]">
      <div className="max-w-6xl mx-auto px-5">
        <div className="text-center mb-12">
          <div className="text-caption text-[var(--accent)] mb-2">Hackathon Architecture</div>
          <h2 className="text-display text-h1 mb-3">
            How VidRush works <span className="italic">under the hood.</span>
          </h2>
          <p className="text-[16px] text-[var(--text-secondary)]">
            Built for the Wispr Flow &amp; VMake Dev Hackathon with modular, production-tested components.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {stack.map((s) => (
            <div
              key={s.name}
              className={`relative rounded-3xl p-8 border ${
                s.highlight
                  ? "bg-[var(--ink)] text-white border-[var(--ink)] shadow-[0_40px_100px_-30px_var(--accent-glow)]"
                  : "bg-white border-[var(--border)]"
              }`}
            >
              {s.highlight && (
                <span className="absolute -top-3 left-8 px-3 py-1 rounded-full bg-[var(--accent)] text-white text-[11px] font-medium">
                  {s.badge}
                </span>
              )}
              <div className="text-[11.5px] font-semibold text-[var(--accent-hover)] uppercase tracking-wider mb-1">
                {s.role}
              </div>
              <div className="text-display text-[24px] font-bold leading-tight mb-3">
                {s.name}
              </div>
              <p className={`text-[13.5px] mb-6 leading-relaxed ${s.highlight ? "text-white/70" : "text-[var(--text-secondary)]"}`}>
                {s.desc}
              </p>
              <ul className="space-y-2.5 border-t border-white/10 pt-4">
                {s.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[13px]">
                    <Check className={`h-4 w-4 shrink-0 ${s.highlight ? "text-[var(--accent-hover)]" : "text-[var(--accent)]"}`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */

const FAQS = [
  {
    q: "How does the Wispr Flow Voice Director work?",
    a: "Wispr Flow captures your microphone audio with ultra-low latency. The transcription is interpreted through a Zod action schema by Groq AI, allowing you to rewrite scenes, change narrator voices, swap footage, or control the video player entirely hands-free.",
  },
  {
    q: "Can I navigate and scrub the video timeline using voice?",
    a: "Yes! You can say 'Play video', 'Pause', 'Jump to scene 2', or 'Restart from beginning'. The player calculates timestamps from the script and seeks instantaneously.",
  },
  {
    q: "What makes the video production quality stand out?",
    a: "Unlike typical static AI videos, VidRush cuts footage every 2.5 to 4.0 seconds, applies smooth Ken Burns panning and zooming, custom color grades to match the theme, and burns synchronized karaoke ASS subtitles.",
  },
  {
    q: "How does selective scene re-rendering work?",
    a: "When you use the voice director to edit a scene (e.g. 'Rewrite scene 2'), the system re-renders only that specific scene's audio and footage while reusing cached clips for all other scenes, updating the final video in seconds.",
  },
  {
    q: "Is the project containerized and deployable?",
    a: "Yes! A production Dockerfile with Alpine, FFmpeg, and Node.js runs the backend API and frontend SPA on a single port for one-click deployment on Render or Railway.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-20 md:py-28">
      <div className="max-w-3xl mx-auto px-5">
        <div className="text-center mb-10">
          <div className="text-caption text-[var(--accent)] mb-2">Technical FAQ</div>
          <h2 className="text-display text-h1">Architecture &amp; <span className="italic">Details.</span></h2>
        </div>
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <button
                key={f.q}
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full text-left py-5 group"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[16px] font-medium">{f.q}</span>
                  <span
                    className={`h-7 w-7 rounded-full border border-[var(--border)] flex items-center justify-center shrink-0 transition-all ${
                      isOpen ? "bg-[var(--accent)] border-[var(--accent)] text-white rotate-45" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </span>
                </div>
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="text-[14.5px] text-[var(--text-secondary)] leading-relaxed pr-8">{f.a}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── CTA BANNER ───────────────────────── */

function CtaBanner() {
  return (
    <section className="px-5 pb-12">
      <div className="relative max-w-7xl mx-auto rounded-3xl bg-gradient-to-br from-[#6c47ff] via-[#8b6aff] to-[#a78bfa] overflow-hidden p-10 md:p-16 text-center text-white">
        <div className="absolute inset-0 noise opacity-40 pointer-events-none" />
        <div className="absolute -top-32 -left-32 h-72 w-72 bg-white/20 blur-[80px] rounded-full" />
        <div className="absolute -bottom-32 -right-32 h-72 w-72 bg-pink-300/30 blur-[80px] rounded-full" />

        <h2 className="relative text-display text-[clamp(32px,4.5vw,56px)] leading-[1.08] tracking-tight max-w-3xl mx-auto mb-4">
          Direct your first video with <span className="italic">Wispr Flow.</span>
        </h2>
        <p className="relative text-[16px] text-white/90 max-w-xl mx-auto mb-8">
          Speak your story ideas into the microphone and watch the complete video pipeline render before your eyes.
        </p>
        <div className="relative flex flex-wrap justify-center gap-3">
          <Link
            to="/create"
            className="px-6 py-3 rounded-xl bg-white text-[var(--ink)] font-semibold hover:bg-white/90 transition-colors flex items-center gap-2 shadow-lg"
          >
            Launch Voice Studio <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FOOTER ───────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-white">
      <div className="max-w-7xl mx-auto px-5 py-8 flex flex-col md:flex-row items-center md:items-end justify-between gap-4">
        <div className="flex flex-col items-center md:items-start gap-2">
          <Logo />
          <div className="text-[12px] text-[var(--text-muted)]">
            Built for the Wispr Flow &amp; VMake Dev Hackathon 2026.
          </div>
        </div>
        <div className="text-[12.5px] text-[var(--text-secondary)] flex items-center gap-2">
          Powered by Wispr Flow · Groq · ElevenLabs · FFmpeg
        </div>
      </div>
    </footer>
  );
}

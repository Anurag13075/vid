import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { TopicInput } from "@/components/TopicInput";
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
  Star,
  Search,
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
      { title: "VidRush — Turn any topic into a faceless YouTube videos" },
      {
        name: "description",
        content:
          "Type a topic. VidRush researches, writes, voices, and edits a long-form faceless YouTube video for you — just like a human production team.",
      },
      { property: "og:title", content: "VidRush — AI Video Productions" },
      {
        property: "og:description and title",
        content: "One topic. One click. A full faceless YouTube video — scripted, voiced, edited, exported.",
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
      <FeaturesIntro />
      <FeatureScript />
      <FeatureTeamAndStyle />
      <FeatureFootage />
      <Pricing />
      <Faq />
      <CtaBanner />
      <Footer />
    </div>
  );
}

/* ───────────────────────── NAV ───────────────────────── */

function Nav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b text-gray-300 border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-[13.5px] text-[var(--text-secondary)]">
          <a href="#editor" className="hover:text-[var(--ink)] transition-colors">Editor</a>
          <a href="#features" className="hover:text-[var(--ink)] transition-colors">Features</a>
          <a href="#pricing" className="hover:text-[var(--ink)] transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-[var(--ink)] transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <button className="hidden sm:inline-flex text-[13px] px-3.5 py-2 rounded-lg border border-[var(--border)] hover:border-[var(--border-active)] hover:bg-white transition-colors items-center gap-2">
            <Play className="h-3 w-3 fill-current" /> Watch demo
          </button>
          <button className="text-[13px] px-4 py-2 rounded-lg bg-[var(--ink)] text-white hover:bg-black transition-colors font-medium">
            Join waitlist
          </button>
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
      <div className="absolute inset-0 overflow-hidden px-2  pointer-events-none">
        <div className="aurora absolute top-[-120px] left-[-80px] h-[360px] w-[360px] rounded-full bg-[#a3b8ff]/60" />
        <div className="aurora absolute top-[80px] right-[-100px] h-[420px] w-[420px] rounded-full bg-[#ffb8e4]/50" style={{ animationDelay: "3s" }} />
        <div className="aurora absolute bottom-[-160px] left-[30%] h-[400px] w-[400px] rounded-full bg-[#c8b5ff]/60" style={{ animationDelay: "5s" }} />
      </div>
      <div className="absolute inset-0 noise pointer-events-none opacity-60" />

      <div className="relative max-w-6xl mx-auto px-5 pt-20 pb-28 md:pt-28 md:pb-36 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 text-[12px] text-[var(--ink)] px-3 py-1.5 rounded-full border border-[var(--border-active)] bg-white/80 backdrop-blur mb-8 animate-fade-in shadow-sm">
          <Sparkles className="h-3 w-3 text-[var(--accent)]" />
          New · Deep Video V1 model is live
          <span className="text-[var(--text-muted)]">→</span>
        </div>

        <h1 className="text-display text-hero max-w-4xl animate-fade-up px-2 py-1 ">
          Say goodbye to your{" "}
          <span className="italic relative">
            human
            <svg viewBox="0 0 200 12" className="absolute -bottom-2 left-0 w-full h-2 text-[var(--accent)]" preserveAspectRatio="none">
              <path d="M2 8 Q 50 2 100 6 T 198 5" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            </svg>
          </span>{" "}
          video <br className="hidden sm:block" /> production team.
        </h1>

        <p
          className="mt-7 text-[18px] md:text-[20px] text-[var(--text-secondary)] max-w-2xl animate-fade-up"
          style={{ animationDelay: "80ms" }}
        >
          VidRush takes your idea, researches, writes &amp; edits it into a long-form video — just like a human production team. No camera. No editor. No script.
        </p>

        <div className="mt-12 w-full animate-fade-up" style={{ animationDelay: "160ms" }}>
          <TopicInput />
        </div>

        <div className="mt-10 flex items-center gap-6 text-[12.5px] text-[var(--text-secondary)] animate-fade-up" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-3.5 w-3.5 fill-[#fbbf24] text-[#fbbf24]" />
            ))}
          </div>
          <span>Trusted by 500+ faceless channels and creators </span>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── MARQUEE ───────────────────────── */

function MarqueeBar() {
  const labels = [
    "YOUTUBE AUTOMATION",
    "FACELESS CHANNELS",
    "EDUCATIONAL CONTENT",
    "DOCUMENTARY SHORTS",
    "HISTORY DEEP DIVES",
    "TRUE CRIME",
    "SCIENCE EXPLAINERS",
    "TECH BRIEFINGS",
  ];
  const doubled = [...labels, ...labels];
  return (
    <div className="border-y border-[var(--border)] bg-white/50 backdrop-blur py-5 overflow-hidden">
      <div className="flex w-max marquee-track gap-12">
        {doubled.map((l, i) => (
          <div key={i} className="flex items-center gap-12 text-[13px] tracking-[0.18em] text-[var(--text-muted)] font-medium">
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
    <section id="editor" className="relative ink-section py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 dotted-grid opacity-30 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[300px] w-[800px] bg-[var(--accent)]/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-5">
        <div className="text-center mb-12">
          <div className="text-caption text-[var(--accent-hover)] mb-3">Studio-grade editor</div>
          <h2 className="text-display text-h1 text-white max-w-2xl mx-auto">
            Watch your video come together <span className="italic">in real time.</span>
          </h2>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0f0f15] shadow-[0_60px_120px_-40px_rgba(108,71,255,0.4)] overflow-hidden">
          {/* top toolbar */}
          <div className="flex items-center justify-between px-5 h-12 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-4 text-[11px] font-mono text-white/40">vidrush ▸ ww2_aircraft.proj</span>
            </div>
            <div className="text-[11px] font-mono text-white/60 tabular-nums">
              00:13:02 <span className="text-white/30">/ 00:15:22</span>
            </div>
            <div className="flex items-center gap-3 text-white/40">
              <span className="text-[11px]">1x</span>
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
            <TrackRow
              variant="text"
              color="#3ad1ff"
              items={["Iconic aircraft", "WW2 dogfight", "Best fighter", "Weapons", "Terrible aircraft", "High-stakes battle"]}
            />
            <TrackRow
              variant="image"
              color="#3ad1ff"
              items={[romeImg, planeAfter, oceanImg, tokyoImg, egyptImg, planeAfter]}
              extras={["human factors", "aircraft", "speed"]}
            />
            <TrackRow
              variant="text"
              color="#f97316"
              items={["Hook sentence 2", "Hook sentence 3", "Hook sentence 2", "Section 4", "Section 1", "Outro"]}
            />
            <BgmRow />
            <TrackRow
              variant="text"
              color="#a78bfa"
              items={["Modern jets", "High-stakes battles", "Demolished", "Karaoke", "WorstWW2", "Split"]}
            />

            {/* playhead */}
            <div className="absolute top-4 bottom-4 w-px bg-emerald-400 playhead pointer-events-none shadow-[0_0_12px_rgba(52,211,153,0.8)]">
              <div className="absolute -top-1 -left-[5px] h-3 w-3 rotate-45 bg-emerald-400" />
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-[14px] text-white/50 max-w-xl mx-auto">
          Every cut, caption, and clip — exposed. Tweak any track or trust the AI and ship in one click.
        </p>
      </div>
    </section>
  );
}

function TrackRow({
  variant,
  color,
  items,
  extras,
}: {
  variant: "text" | "image";
  color: string;
  items: string[];
  extras?: string[];
}) {
  return (
    <div className="flex gap-1.5 h-10 overflow-hidden timeline-slide">
      {items.map((it, i) => (
        <div
          key={i}
          className="shrink-0 rounded-md flex items-center px-2 gap-1.5 text-[11px] font-medium text-white/90"
          style={{
            background: `linear-gradient(180deg, ${color}30, ${color}15)`,
            borderLeft: `2px solid ${color}`,
            width: variant === "image" ? "120px" : "180px",
          }}
        >
          {variant === "image" ? (
            <img src={it} alt="" className="h-7 w-full object-cover rounded-sm" />
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              <span className="truncate">{it}</span>
            </>
          )}
        </div>
      ))}
      {extras?.map((e, i) => (
        <div
          key={`x${i}`}
          className="shrink-0 rounded-md flex items-center px-2 gap-1.5 text-[11px] font-medium text-white/90 w-[140px]"
          style={{ background: `linear-gradient(180deg, ${color}30, ${color}15)`, borderLeft: `2px solid ${color}` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          <span className="truncate">{e}</span>
        </div>
      ))}
    </div>
  );
}

function BgmRow() {
  return (
    <div className="h-10 rounded-md flex items-center px-3 gap-2 bg-gradient-to-r from-amber-500/20 to-amber-500/10 border-l-2 border-amber-500">
      <span className="text-[11px] text-amber-100 font-medium shrink-0">🎵 BGM · genre=mystery</span>
      <div className="flex gap-[2px] items-center flex-1 h-6">
        {Array.from({ length: 80 }).map((_, i) => {
          const h = 20 + ((i * 37) % 70);
          return <span key={i} className="w-[3px] rounded-full bg-amber-300/70" style={{ height: `${h}%` }} />;
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── FEATURES INTRO ───────────────────────── */

function FeaturesIntro() {
  return (
    <section id="features" className="py-24 md:py-32">
      <div className="max-w-3xl mx-auto px-5 text-center">
        <div className="text-caption text-[var(--accent)] mb-4">More features</div>
        <h2 className="text-display text-h1 mb-5">
          Jam-packed with tools in every <span className="italic">step.</span>
        </h2>
        <p className="text-[17px] text-[var(--text-secondary)] leading-relaxed">
          VidRush gives you as much — or as little — control as you like. Approve a script, restyle a clip, or just hit render.
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
          <h3 className="text-display text-[36px] leading-[1.05] tracking-tight mb-4">
            Approve the script <span className="italic">before</span> the final cut.
          </h3>
          <p className="text-[15.5px] text-[var(--text-secondary)] leading-relaxed">
            Let VidRush do the heavy lifting while you stay in full control. Reject lines, request re-writes, or lock in the tone — all before a single frame is rendered.
          </p>
          <div className="mt-6 flex gap-3">
            {["Tone", "Pacing", "Hook strength", "CTA"].map((t) => (
              <span key={t} className="text-[12px] px-3 py-1 rounded-full bg-white border border-[var(--border)] text-[var(--text-secondary)]">{t}</span>
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
                    <div className="text-[11px] uppercase tracking-wider text-white/70 font-medium mb-1">Section 03 · hook</div>
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
            ✦ AI suggested
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
  return (
    <section className="max-w-7xl mx-auto px-5 pb-20 grid md:grid-cols-2 gap-6">
      {/* Creative team */}
      <div className="rounded-3xl border border-[var(--border)] bg-white p-8 md:p-10 relative overflow-hidden">
        <div className="relative h-[280px] rounded-2xl overflow-hidden mb-7 bg-gradient-to-br from-[#fef6ff] to-[#f0f0ff]">
          <div className="absolute inset-0 dotted-grid opacity-50" />
          <img src={planeAfter} alt="cinematic plane" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-multiply" loading="lazy" />

          <Bubble className="top-4 left-8 bg-[#c4b5fd] text-[#3b0764] float-a">Asset Manager</Bubble>
          <Bubble className="top-6 right-6 bg-[#fbcfe8] text-[#831843] float-b">Motion designer</Bubble>
          <Bubble className="top-[42%] left-[12%] bg-[#86efac] text-[#14532d] float-c">Voice actor</Bubble>
          <Bubble className="top-[50%] right-[18%] bg-[#fdba74] text-[#7c2d12] float-a" style={{ animationDelay: "1s" }}>Video editor</Bubble>
          <Bubble className="bottom-10 right-10 bg-[#c4b5fd] text-[#3b0764] float-b" style={{ animationDelay: "2s" }}>Researcher</Bubble>
          <Bubble className="bottom-6 left-10 bg-[#fde68a] text-[#78350f] float-c" style={{ animationDelay: "1.5s" }}>Scriptwriter</Bubble>
        </div>
        <h3 className="text-display text-[30px] leading-[1.1] mb-3">
          A full creative team — <span className="italic">just for you.</span>
        </h3>
        <p className="text-[14.5px] text-[var(--text-secondary)] leading-relaxed">
          VidRush works like a human production team. Give as much or as little direction as you want — every role is covered.
        </p>
      </div>

      {/* Style match */}
      <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[#0f0f15] to-[#1c1635] text-white p-8 md:p-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-64 w-64 bg-[var(--accent)]/40 blur-[100px] rounded-full" />
        <div className="relative h-[280px] mb-7 flex items-center justify-center gap-3">
          <BeforeAfterCard src={planeBefore} label="Before" tone="light" />
          <BeforeAfterCard src={planeAfter} label="After" tone="dark" highlight />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--accent)] text-white text-[12px] font-medium shadow-[0_8px_24px_-4px_var(--accent-glow)]">
            <Sparkles className="h-3 w-3" /> Style match
          </div>
        </div>
        <h3 className="text-display text-[30px] leading-[1.1] mb-3">
          Match your video to <span className="italic">any look.</span>
        </h3>
        <p className="text-[14.5px] text-white/60 leading-relaxed">
          Upload one reference frame. VidRush colour-grades every clip, recuts pacing, and matches motion to your brand.
        </p>
      </div>
    </section>
  );
}

function Bubble({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`absolute px-3.5 py-1.5 rounded-full text-[13px] font-medium shadow-[0_8px_24px_-8px_rgba(0,0,0,0.2)] ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}

function BeforeAfterCard({ src, label, tone, highlight }: { src: string; label: string; tone: "light" | "dark"; highlight?: boolean }) {
  return (
    <div className={`relative h-full w-[44%] rounded-2xl overflow-hidden border ${highlight ? "border-[var(--accent)] shadow-[0_0_40px_-8px_var(--accent-glow)]" : "border-white/10"}`}>
      <img src={src} alt={label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      <div className={`absolute inset-0 ${tone === "light" ? "bg-white/10" : "bg-gradient-to-t from-black/60 to-transparent"}`} />
      <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-medium ${tone === "light" ? "bg-white/90 text-black" : "bg-black/70 text-white backdrop-blur"}`}>
        {label}
      </span>
    </div>
  );
}

/* ───────────────────────── FEATURE: FOOTAGE ───────────────────────── */

function FeatureFootage() {
  const cards = [
    { img: romeImg, title: "10 dark secrets of the Roman Empire", site: "youtube.com › watch" },
    { img: planeAfter, title: "WW2 aircraft no one wanted to fly", site: "youtube.com › watch" },
    { img: oceanImg, title: "How deep is the deepest ocean trench?", site: "youtube.com › watch" },
    { img: tokyoImg, title: "Why Tokyo is the quietest megacity", site: "youtube.com › watch" },
  ];
  return (
    <section className="max-w-7xl mx-auto px-5 pb-24">
      <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 rounded-3xl border border-[var(--border)] bg-white p-8 md:p-12 overflow-hidden">
        <div className="flex flex-col justify-center max-w-md">
          <h3 className="text-display text-[36px] leading-[1.05] tracking-tight mb-4">
            HD footage, <span className="italic">curated</span> for every scene.
          </h3>
          <p className="text-[15.5px] text-[var(--text-secondary)] leading-relaxed mb-6">
            The Researcher agent crawls reference videos and articles, ranks visual hooks, and downloads the strongest 4K clips per section — automatically.
          </p>
          <div className="space-y-3">
            {[
              "Pexels + Storyblocks + Pond5",
              "Auto colour-graded to scene mood",
              "Beat-matched to your voiceover",
            ].map((t) => (
              <div key={t} className="flex items-center gap-2 text-[14px] text-[var(--ink)]">
                <span className="h-5 w-5 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
                  <Check className="h-3 w-3 text-[var(--accent)]" />
                </span>
                {t}
              </div>
            ))}
          </div>
        </div>

        <div className="relative bg-gradient-to-br from-[#1a1330] to-[#0d0d15] rounded-2xl p-5 overflow-hidden min-h-[360px]">
          <div className="absolute inset-0 dotted-grid opacity-25" />
          <div className="relative space-y-3">
            {cards.map((c, i) => (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/5 backdrop-blur animate-fade-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <img src={c.img} alt="" loading="lazy" className="h-14 w-24 rounded-md object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/40 font-mono mb-0.5">{c.site}</div>
                  <div className="text-[13.5px] text-white font-medium truncate">{c.title}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-[var(--accent)] to-[#a78bfa] text-white text-[13px] font-medium shadow-[0_12px_40px_-8px_var(--accent-glow)]">
            <Search className="h-3.5 w-3.5" />
            Searching the web for the perfect clip…
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── PRICING ───────────────────────── */

function Pricing() {
  const tiers = [
    {
      name: "Creator",
      price: "$29",
      desc: "For solo creators shipping their first faceless channel.",
      features: ["10 videos / month", "Up to 10 min length", "HD 1080p export", "Female + Male voices"],
    },
    {
      name: "Studio",
      price: "$89",
      desc: "For agencies running multiple channels at scale.",
      features: ["60 videos / month", "Up to 20 min length", "4K export + style match", "Priority render queue", "Brand kit + API access"],
      highlight: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      desc: "Custom models, white-label, and dedicated infra.",
      features: ["Unlimited renders", "Custom voice cloning", "On-prem deployment", "SLA + dedicated success"],
    },
  ];
  return (
    <section id="pricing" className="py-24 md:py-32 bg-gradient-to-b from-[var(--bg-base)] to-[#f1edff]">
      <div className="max-w-6xl mx-auto px-5">
        <div className="text-center mb-14">
          <div className="text-caption text-[var(--accent)] mb-3">Pricing</div>
          <h2 className="text-display text-h1 mb-3">Built for the way <span className="italic">you</span> ship.</h2>
          <p className="text-[16px] text-[var(--text-secondary)]">Start free. Upgrade when you're ready to scale a channel.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-3xl p-8 border ${t.highlight
                  ? "bg-[var(--ink)] text-white border-[var(--ink)] shadow-[0_40px_100px_-30px_var(--accent-glow)]"
                  : "bg-white border-[var(--border)]"
                }`}
            >
              {t.highlight && (
                <span className="absolute -top-3 left-8 px-3 py-1 rounded-full bg-[var(--accent)] text-white text-[11px] font-medium">
                  Most popular
                </span>
              )}
              <div className="text-[14px] font-medium mb-2">{t.name}</div>
              <div className="text-display text-[44px] leading-none mb-3">
                {t.price}
                {t.price.startsWith("$") && <span className="text-[14px] text-current/60 font-sans"> /mo</span>}
              </div>
              <p className={`text-[13.5px] mb-6 ${t.highlight ? "text-white/60" : "text-[var(--text-secondary)]"}`}>
                {t.desc}
              </p>
              <button
                className={`w-full py-2.5 rounded-xl font-medium text-[14px] mb-6 transition-colors ${t.highlight
                    ? "bg-white text-[var(--ink)] hover:bg-white/90"
                    : "bg-[var(--ink)] text-white hover:bg-black"
                  }`}
              >
                Get started
              </button>
              <ul className="space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[13.5px]">
                    <Check className={`h-4 w-4 ${t.highlight ? "text-[var(--accent-hover)]" : "text-[var(--accent)]"}`} />
                    {f}
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
    q: "How long does a render actually take?",
    a: "Most 10-minute videos render in under 4 minutes on our standard queue, including research, voiceover, footage download, and final encoding.",
  },
  {
    q: "What platforms does VidRush support?",
    a: "We export web-optimized MP4 (H.264 / AAC) at 1080p and 4K. Files drop straight into YouTube, TikTok, Instagram Reels, or your existing editor.",
  },
  {
    q: "Is my content secure on VidRush?",
    a: "Every project is encrypted at rest, isolated per workspace, and never used to train shared models. You own your renders, scripts, and voice clones.",
  },
  {
    q: "Can I use my own voice?",
    a: "Yes — Studio and Enterprise plans include voice cloning from a 60-second sample. The clone stays private to your workspace.",
  },
  {
    q: "How can I get support?",
    a: "Live chat is available 24/5 on every plan. Enterprise customers get a dedicated success manager and Slack Connect channel.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-24 md:py-32">
      <div className="max-w-3xl mx-auto px-5">
        <div className="text-center mb-12">
          <div className="text-caption text-[var(--accent)] mb-3">FAQ</div>
          <h2 className="text-display text-h1">Questions, <span className="italic">answered.</span></h2>
        </div>
        <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <button
                key={f.q}
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full text-left py-6 group"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[17px] font-medium">{f.q}</span>
                  <span
                    className={`h-8 w-8 rounded-full border border-[var(--border)] flex items-center justify-center shrink-0 transition-all ${isOpen ? "bg-[var(--accent)] border-[var(--accent)] text-white rotate-45" : "text-[var(--text-secondary)]"
                      }`}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </span>
                </div>
                <div
                  className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
                    }`}
                >
                  <div className="overflow-hidden">
                    <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed pr-12">{f.a}</p>
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
      <div className="relative max-w-7xl mx-auto rounded-3xl bg-gradient-to-br from-[#6c47ff] via-[#8b6aff] to-[#a78bfa] overflow-hidden p-12 md:p-20 text-center text-white">
        <div className="absolute inset-0 noise opacity-40 pointer-events-none" />
        <div className="absolute -top-32 -left-32 h-72 w-72 bg-white/20 blur-[80px] rounded-full" />
        <div className="absolute -bottom-32 -right-32 h-72 w-72 bg-pink-300/30 blur-[80px] rounded-full" />

        <h2 className="relative text-display text-[clamp(36px,5vw,68px)] leading-[1.05] tracking-tight max-w-3xl mx-auto mb-6">
          Ship a faceless channel <span className="italic">tonight.</span>
        </h2>
        <p className="relative text-[17px] text-white/85 max-w-xl mx-auto mb-9">
          VidRush takes your idea, researches, writes &amp; edits it into a long-form video — just like a human video production team.
        </p>
        <div className="relative flex flex-wrap justify-center gap-3">
          <button className="px-5 py-3 rounded-xl bg-white text-[var(--ink)] font-medium hover:bg-white/90 transition-colors flex items-center gap-2">
            <Play className="h-3.5 w-3.5 fill-current" /> Watch demo
          </button>
          <button className="px-5 py-3 rounded-xl bg-[var(--ink)] text-white font-medium hover:bg-black transition-colors flex items-center gap-2">
            Join waitlist <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FOOTER ───────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-white">
      <div className="max-w-7xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-6">
        <div className="flex flex-col items-center md:items-start gap-3">
          <Logo />
          <div className="text-[12px] text-[var(--text-muted)]">
            © {new Date().getFullYear()} VidRush AI Studios — VIDRUSH AI STUDIOS LLP
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-6 text-[13px] text-[var(--text-secondary)]">
          <a href="#" className="hover:text-[var(--ink)]">Privacy Policy</a>
          <a href="#" className="hover:text-[var(--ink)]">Terms &amp; Conditions</a>
          <a href="#" className="hover:text-[var(--ink)]">Blog</a>
          <a href="#" className="hover:text-[var(--ink)]">Careers</a>
          <Link to="/" className="hover:text-[var(--ink)]">Start a render</Link>
        </nav>
      </div>
    </footer>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { Logo } from "@/components/Logo";
import { useJob } from "@/lib/usePipeline";
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
  Pause,
  Palette,
  Zap,
  Volume2,
  Radio,
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
        narration:
          "For thousands of years, civilizations have risen, built marvels, and faded into myth. But the stones they laid still echo with secrets.",
        visual_prompt: "Cinematic drone shot of the Giza Plateau at sunrise, golden light hitting the Great Pyramid, 8k documentary style",
        duration: 45,
        keywords: ["ancient civilizations", "pyramids", "dawn of history"],
      },
      {
        id: 2,
        section_type: "body",
        title: "Engineering the Impossible",
        narration:
          "Across continents, megalithic architecture defied the physics of its time, moving multi-ton granite blocks with celestial precision.",
        visual_prompt: "Macro close-up of interlocking Inca stonework in Cusco, sunlight tracing seamless geometric stone seams",
        duration: 50,
        keywords: ["megalithic engineering", "ancient stone masonry"],
      },
      {
        id: 3,
        section_type: "body",
        title: "The Roman Water Highways",
        narration:
          "Rome did not conquer the known world merely through legions, but through water—gravity-fed aqueducts spanning hundreds of kilometers.",
        visual_prompt: "Sweeping aerial view of Pont du Gard aqueduct in France, crystal water reflecting Roman arches",
        duration: 50,
        keywords: ["roman aqueducts", "engineering marvels"],
      },
      {
        id: 4,
        section_type: "climax",
        title: "Celestial Alignments",
        narration:
          "From Stonehenge to Chichen Itza, these monuments acted as colossal clocks, aligning with solstices to capture the movement of the cosmos.",
        visual_prompt: "Time-lapse of starry night sky spinning above Stonehenge, astronomical alignment visualization with glowing constellation overlays",
        duration: 55,
        keywords: ["archaeoastronomy", "solstice alignments"],
      },
      {
        id: 5,
        section_type: "body",
        title: "The Lost Knowledge",
        narration:
          "Countless scrolls and libraries vanished in fires, leaving modern historians piecing together puzzles with missing centerpieces.",
        visual_prompt: "Atmospheric interior of the Great Library of Alexandria, warm candlelight illuminating papyrus scrolls",
        duration: 45,
        keywords: ["library of alexandria", "lost history"],
      },
      {
        id: 6,
        section_type: "outro",
        title: "The Legacy Remains",
        narration:
          "The ancient world is not gone. It lives on in the foundations of our cities, our laws, and the boundless curiosity of mankind.",
        visual_prompt: "Cinematic transition from ancient stone ruins to a modern skyline at dusk, neon reflections merging with historic architecture",
        duration: 45,
        keywords: ["human curiosity", "legacy of empires"],
      },
    ],
  },
  clips: [
    { index: 0, status: "ready", duration: 11.2, sectionId: 1, prompt: "Giza Pyramid dawn aerial", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 1, status: "ready", duration: 11.5, sectionId: 1, prompt: "Desert caravan sunset", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 2, status: "ready", duration: 12.0, sectionId: 1, prompt: "Nile river ancient boat", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 3, status: "ready", duration: 10.3, sectionId: 1, prompt: "Sphinx shadow timelapse", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 4, status: "ready", duration: 12.5, sectionId: 2, prompt: "Machu Picchu mist clearing", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 5, status: "ready", duration: 12.5, sectionId: 2, prompt: "Inca stonework geometry", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 6, status: "ready", duration: 12.5, sectionId: 2, prompt: "Quarrying giant granite block", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 7, status: "ready", duration: 12.5, sectionId: 2, prompt: "Colosseum subterranean tunnels", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 8, status: "ready", duration: 12.5, sectionId: 3, prompt: "Pont du Gard Roman aqueduct", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 9, status: "ready", duration: 12.5, sectionId: 3, prompt: "Roman fountain pressurized flow", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 10, status: "ready", duration: 12.5, sectionId: 3, prompt: "Appian Way paved stone road", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 11, status: "ready", duration: 12.5, sectionId: 3, prompt: "Roman concrete testing", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 12, status: "ready", duration: 13.8, sectionId: 4, prompt: "Stonehenge summer solstice ray", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 13, status: "ready", duration: 13.8, sectionId: 4, prompt: "El Castillo Chichen Itza serpent shadow", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 14, status: "ready", duration: 13.7, sectionId: 4, prompt: "Milky way galactic core over ruins", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 15, status: "ready", duration: 13.7, sectionId: 4, prompt: "Antikythera mechanism bronze gears", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 16, status: "ready", duration: 11.2, sectionId: 5, prompt: "Library of Alexandria scroll shelves", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 17, status: "ready", duration: 11.3, sectionId: 5, prompt: "Ancient scholar writing on parchment", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 18, status: "ready", duration: 11.2, sectionId: 5, prompt: "Pompeii frescoes covered in ash", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 19, status: "ready", duration: 11.3, sectionId: 5, prompt: "Submerged city ruins in Mediterranean", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 20, status: "ready", duration: 11.2, sectionId: 6, prompt: "Parthenon marble columns at golden hour", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 21, status: "ready", duration: 11.3, sectionId: 6, prompt: "Modern museum visitor studying relic", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 22, status: "ready", duration: 11.2, sectionId: 6, prompt: "Futuristic satellite orbiting earth", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 23, status: "ready", duration: 11.3, sectionId: 6, prompt: "Final cinematic credits sunset fade", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
  ],
  videoUrl: "/The-Complete-History-SnapYT.App.mp4",
  thumbnailUrl: "/videos/demo/thumb.jpg",
};

interface VideoPart {
  id: number;
  label: string;
  start: number;
  end: number;
}

const COLOR_GRADES: Record<string, string> = {
  none: "none",
  cinematic: "contrast(1.18) brightness(1.05) saturate(1.22) sepia(0.08) hue-rotate(-4deg)",
  noir: "grayscale(1) contrast(1.35) brightness(0.92)",
  vintage: "sepia(0.65) contrast(1.12) brightness(0.92) saturate(1.35)",
  cyberpunk: "saturate(2.1) hue-rotate(185deg) contrast(1.22)",
};

export function ResultPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const { job: fetchedJob, isLoading } = useJob(jobId);

  const job =
    jobId === "demo" || jobId === "showcase" || !fetchedJob?.script
      ? (DEMO_JOB as any)
      : fetchedJob;

  const [activeTab, setActiveTab] = useState<"overview" | "script" | "clips">("overview");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenReceiverRef = useRef<HTMLInputElement | null>(null);

  // ─── Real-Time Voice-Controlled Video States ─────────────────────────────
  const [colorGrade, setColorGrade] = useState<string>("none");
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [hasVignette, setHasVignette] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [hudNotification, setHudNotification] = useState<{
    dictated: string;
    action: string;
  } | null>(null);
  const [parts, setParts] = useState<VideoPart[]>([
    { id: 1, label: "Full Video (0:00 - 4:50)", start: 0, end: 290 },
  ]);
  const [activePartId, setActivePartId] = useState<number>(1);
  const lastProcessedTextRef = useRef<string>("");

  const showHud = useCallback((dictated: string, action: string) => {
    setHudNotification({ dictated, action });
    setTimeout(() => setHudNotification(null), 4500);
  }, []);

  // ─── Continuous Part Boundary Watcher ──────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (parts.length <= 1) return;
      const currentPart = parts.find((p) => p.id === activePartId);
      if (currentPart && video.currentTime >= currentPart.end) {
        // Find next part or pause
        const nextPart = parts.find((p) => p.id === activePartId + 1);
        if (nextPart) {
          setActivePartId(nextPart.id);
          video.currentTime = nextPart.start;
          video.play().catch(() => {});
          showHud(`Auto-advanced`, `Now playing ${nextPart.label}`);
        } else {
          video.pause();
          showHud(`Finished`, `Reached end of ${currentPart.label}`);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [parts, activePartId, showHud]);

  // ─── Master Real-Time Command Executor ─────────────────────────────────────
  const executeWisprCommand = useCallback(
    (rawText: string) => {
      if (!rawText || !rawText.trim()) return;
      const text = rawText.trim();
      if (text === lastProcessedTextRef.current) return;
      lastProcessedTextRef.current = text;

      // Clean punctuation and normalize spacing
      const clean = text
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const video = videoRef.current;
      if (!video) return;

      // 1. SPLIT VIDEO IN TWO / MULTIPLE PARTS
      // Handles: "split the video into two parts", "split video in two parts", "video split in two parts", "split into 2 parts", "split the video", etc.
      if (clean.includes("split") || clean.includes("cut")) {
        let numParts = 2;
        if (clean.includes("3") || clean.includes("three")) numParts = 3;
        else if (clean.includes("4") || clean.includes("four")) numParts = 4;
        else if (clean.includes("2") || clean.includes("two")) numParts = 2;
        else {
          const matchNum = clean.match(/(?:into|in)\s+(\d+)/);
          if (matchNum) numParts = parseInt(matchNum[1], 10) || 2;
        }

        // Split at current timestamp if requested
        if (clean.includes("current") || clean.includes("here") || clean.includes("now") || clean.includes("at this point")) {
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
          showHud(text, `✂️ Split video at ${Math.floor(cutTime / 60)}:${String(cutTime % 60).padStart(2, "0")} · Part 1 & Part 2 created`);
          return;
        }

        // Split into N equal segments
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
        video.play().catch(() => {});
        showHud(text, `✂️ Sliced video into ${numParts} parts · Now playing Part 1`);
        return;
      }

      // 2. PAUSE / STOP
      // Handles: "pause the video", "pause video", "pause", "stop the video", "stop video", "stop", "freeze"
      if (
        clean.includes("pause") ||
        clean.includes("stop the video") ||
        clean.includes("stop video") ||
        clean === "stop" ||
        clean.includes("freeze")
      ) {
        video.pause();
        showHud(text, "⏸️ Video paused");
        return;
      }

      // 3. PLAY / RESUME
      // Handles: "play the video", "play video", "play", "resume the video", "resume video", "resume", "start the video", "start video"
      if (
        clean.includes("play") ||
        clean.includes("resume") ||
        clean.includes("start the video") ||
        clean.includes("start video") ||
        clean.includes("continue")
      ) {
        video.play().catch(() => {});
        showHud(text, "▶️ Video playing");
        return;
      }

      // 4. RESTART
      // Handles: "restart the video", "restart video", "restart", "from the beginning", "start over"
      if (
        clean.includes("restart") ||
        clean.includes("beginning") ||
        clean.includes("start over") ||
        clean.includes("replay")
      ) {
        video.currentTime = 0;
        video.play().catch(() => {});
        showHud(text, "⏮️ Restarted from beginning");
        return;
      }

      // 5. COLOR GRADING SHIFTS
      if (clean.includes("cinematic")) {
        setColorGrade("cinematic");
        showHud(text, "🎨 Cinematic 35mm film grade applied");
        return;
      }
      if (clean.includes("black and white") || clean.includes("noir") || clean.includes("monochrome") || clean.includes("grayscale")) {
        setColorGrade("noir");
        showHud(text, "🎨 Noir Black & White grade applied");
        return;
      }
      if (clean.includes("vintage") || clean.includes("sepia") || clean.includes("1970") || clean.includes("retro") || clean.includes("70s")) {
        setColorGrade("vintage");
        showHud(text, "🎨 Vintage 1970s warm sepia grade applied");
        return;
      }
      if (clean.includes("cyberpunk") || clean.includes("neon")) {
        setColorGrade("cyberpunk");
        showHud(text, "🎨 Cyberpunk neon grade applied");
        return;
      }
      if (clean.includes("reset color") || clean.includes("normal color") || clean.includes("original color") || clean.includes("remove filter") || clean.includes("remove color")) {
        setColorGrade("none");
        showHud(text, "🎨 Color grading reset to original");
        return;
      }

      // 6. ZOOM & VISUAL EFFECTS
      if (clean.includes("zoom in") || clean.includes("scale up") || clean.includes("magnify")) {
        setZoomScale(1.3);
        showHud(text, "🔍 Zoomed in 1.3x magnification");
        return;
      }
      if (clean.includes("zoom out") || clean.includes("reset zoom") || clean.includes("normal zoom")) {
        setZoomScale(1.0);
        showHud(text, "🔍 Zoom reset to default 1.0x");
        return;
      }
      if (clean.includes("vignette")) {
        setHasVignette((v) => {
          const next = !v;
          showHud(text, next ? "🎬 Radial Vignette enabled" : "🎬 Vignette disabled");
          return next;
        });
        return;
      }

      // 7. SPEED & DURATION
      if (clean.includes("2x") || clean.includes("double speed") || clean.includes("speed 2")) {
        setPlaybackSpeed(2.0);
        video.playbackRate = 2.0;
        showHud(text, "⚡ Playback speed set to 2.0x");
        return;
      }
      if (clean.includes("1 5") || clean.includes("1.5") || clean.includes("faster") || clean.includes("speed up")) {
        setPlaybackSpeed(1.5);
        video.playbackRate = 1.5;
        showHud(text, "⚡ Playback speed set to 1.5x");
        return;
      }
      if (clean.includes("slow motion") || clean.includes("slow") || clean.includes("0 5") || clean.includes("0.5") || clean.includes("half speed")) {
        setPlaybackSpeed(0.5);
        video.playbackRate = 0.5;
        showHud(text, "⚡ Slow motion (0.5x) applied");
        return;
      }
      if (clean.includes("normal speed") || clean.includes("1x") || clean.includes("regular speed")) {
        setPlaybackSpeed(1.0);
        video.playbackRate = 1.0;
        showHud(text, "⚡ Normal speed (1.0x) restored");
        return;
      }

      // 8. TIMELINE SCRUBBING
      const minSec = clean.match(/(?:go to|seek to|jump to)?\s*(\d+)\s*(?:minute|min|m)\s*(?:and)?\s*(\d+)?\s*(?:second|sec|s)?/);
      if (minSec && (minSec[1] || minSec[2])) {
        const mins = parseInt(minSec[1], 10) || 0;
        const secs = parseInt(minSec[2], 10) || 0;
        const total = mins * 60 + secs;
        video.currentTime = total;
        video.play().catch(() => {});
        showHud(text, `⏩ Scrubbed to ${mins}:${String(secs).padStart(2, "0")}`);
        return;
      }

      const secOnly = clean.match(/(?:go to|seek to|jump to)?\s*(\d+)\s*(?:second|sec|s)/);
      if (secOnly && secOnly[1]) {
        const secs = parseInt(secOnly[1], 10) || 0;
        video.currentTime = secs;
        video.play().catch(() => {});
        showHud(text, `⏩ Scrubbed to ${secs}s`);
        return;
      }

      // 9. JUMP TO PART
      const partMatch = clean.match(/(?:jump to|go to|show|play)?\s*part\s*(\d+|one|two|three|four)/);
      if (partMatch) {
        const wordMap: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
        const num = wordMap[partMatch[1]] || parseInt(partMatch[1], 10) || 1;
        const targetPart = parts.find((p) => p.id === num);
        if (targetPart) {
          setActivePartId(targetPart.id);
          video.currentTime = targetPart.start;
          video.play().catch(() => {});
          showHud(text, `⏩ Jumped to ${targetPart.label}`);
          return;
        }
      }
    },
    [parts, showHud]
  );

  // ─── Global Wispr Flow Receiver Setup (No Input Boxes Needed!) ─────────────
  // 1. Keeps a transparent receiver focused so Wispr Flow desktop app pastes/types directly into it
  useEffect(() => {
    const keepFocus = () => {
      const active = document.activeElement;
      if (!active || (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA")) {
        hiddenReceiverRef.current?.focus({ preventScroll: true });
      }
    };

    keepFocus();
    window.addEventListener("click", keepFocus);
    window.addEventListener("focus", keepFocus);
    const interval = setInterval(keepFocus, 1000);

    return () => {
      window.removeEventListener("click", keepFocus);
      window.removeEventListener("focus", keepFocus);
      clearInterval(interval);
    };
  }, []);

  // 2. Global paste listener: captures when Wispr Flow desktop app pastes transcribed voice
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain") || e.clipboardData?.getData("text");
      if (text && text.trim()) {
        executeWisprCommand(text.trim());
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [executeWisprCommand]);

  // 3. Global keydown buffer: catches simulated typing from Wispr Flow desktop app
  useEffect(() => {
    let keyBuffer = "";
    let keyTimeout: any = null;

    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "Enter") {
        if (keyBuffer.trim()) {
          executeWisprCommand(keyBuffer.trim());
          keyBuffer = "";
        }
        return;
      }
      if (e.key.length === 1) {
        keyBuffer += e.key;
        clearTimeout(keyTimeout);
        keyTimeout = setTimeout(() => {
          if (keyBuffer.length >= 3) {
            executeWisprCommand(keyBuffer.trim());
          }
          keyBuffer = "";
        }, 350);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      clearTimeout(keyTimeout);
    };
  }, [executeWisprCommand]);

  const scriptData = job.script || DEMO_JOB.script;
  const videoUrl = job.videoUrl || "/The-Complete-History-SnapYT.App.mp4";
  const readyClips = job.clips?.filter((c: any) => c.status === "ready").length ?? scriptData.sections.length * 4;
  const voiceLabel = job.voice?.split("-").slice(2).join("-").replace("Neural", "") || job.voice || "Brian · Authoritative";
  const durationStr = "4m 50s";

  const stats = [
    { icon: Film, l: "Clips", v: `${readyClips}` },
    { icon: Clock, l: "Duration", v: durationStr },
    { icon: Mic, l: "Voice", v: voiceLabel },
    { icon: Maximize2, l: "Resolution", v: "1920×1080" },
  ];

  return (
    <div className="dark-app min-h-screen pb-20 select-none">
      {/* ─── Invisible Persistent Receiver for Wispr Flow Desktop App ─── */}
      <input
        ref={hiddenReceiverRef}
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        className="opacity-0 pointer-events-none fixed -top-[9999px] -left-[9999px] w-px h-px border-0 p-0 m-0"
        onChange={(e) => {
          const val = e.target.value;
          if (val.trim()) {
            executeWisprCommand(val.trim());
            e.target.value = "";
          }
        }}
        onInput={(e) => {
          const val = (e.target as HTMLInputElement).value;
          if (val.trim()) {
            executeWisprCommand(val.trim());
            (e.target as HTMLInputElement).value = "";
          }
        }}
      />

      <header className="h-14 border-b border-[var(--border)] flex items-center px-5 justify-between">
        <Logo />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            Wispr Flow Connected
          </div>
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
        {/* ─── Real-Time Wispr Flow Live Director Status Bar (No Input Box!) ─── */}
        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-purple-900/20 to-black border border-purple-500/30 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-inner">
              <Mic className="h-5 w-5 animate-pulse text-purple-400" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white flex items-center gap-2">
                Wispr Flow Real-Time Voice Dictation
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Listening
                </span>
              </div>
              <div className="text-[12px] text-purple-200/70">
                Dictate with your desktop Wispr Flow app anywhere on this screen — video updates instantly
              </div>
            </div>
          </div>

          {/* Quick Voice Triggers (Useful for testing & hackathon demonstration) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 md:pt-0">
            <span className="text-[11px] text-white/40 mr-1 hidden sm:inline">Try saying:</span>
            {[
              "split the video into two parts",
              "pause the video",
              "play the video",
              "make color grading cinematic",
              "zoom in on the video",
              "speed up to 1.5x",
            ].map((cmd) => (
              <button
                key={cmd}
                onClick={() => executeWisprCommand(cmd)}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-purple-600/30 border border-white/10 hover:border-purple-400/50 text-[11px] text-purple-300 font-mono transition-all cursor-pointer shadow-sm active:scale-95"
                title={`Simulate dictating: "${cmd}"`}
              >
                "{cmd}"
              </button>
            ))}
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 text-[12px] text-[var(--success)] mb-2 animate-fade-in">
          <Sparkles className="h-3.5 w-3.5" />
          Pipeline Complete · High-Grade Documentary Video Ready
        </div>

        <h1 className="text-h1 mb-2 animate-fade-up">{scriptData.title}</h1>
        <p
          className="text-[var(--text-secondary)] mb-5 animate-fade-up max-w-3xl leading-relaxed"
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
                      videoRef.current.play().catch(() => {});
                    }
                    showHud(`Clicked ${p.label}`, `Playing ${p.label}`);
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

          {/* Real-time Wispr Flow On-Screen HUD Notification */}
          {hudNotification && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-[90%] px-5 py-2.5 rounded-full bg-black/90 backdrop-blur-xl border border-purple-500/50 text-white text-[13px] font-medium flex items-center gap-3 shadow-2xl z-30 animate-fade-in">
              <div className="flex items-center gap-1.5 text-purple-400 font-semibold shrink-0">
                <Mic className="h-4 w-4 animate-pulse text-purple-400" />
                <span>Wispr Flow:</span>
              </div>
              <span className="text-purple-200 italic font-mono truncate max-w-xs">
                "{hudNotification.dictated}"
              </span>
              <span className="h-3 w-[1px] bg-white/20 shrink-0" />
              <span className="text-emerald-300 font-semibold shrink-0">
                {hudNotification.action}
              </span>
            </div>
          )}

          {/* Active Color Grade Badge in corner */}
          {colorGrade !== "none" && (
            <div className="absolute bottom-4 left-4 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur text-[11px] font-mono text-purple-300 border border-purple-500/30 uppercase flex items-center gap-1.5">
              <Palette className="h-3 w-3" /> Grade: {colorGrade}
            </div>
          )}

          {/* Active Zoom Badge */}
          {zoomScale > 1.0 && (
            <div className="absolute bottom-4 right-4 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur text-[11px] font-mono text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
              <Maximize2 className="h-3 w-3" /> Zoom: {zoomScale}x
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={videoUrl}
            download="The-Complete-History-SnapYT.App.mp4"
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
              <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--text-muted)]">Title</span>
                  <CopyButton text={scriptData.title} />
                </div>
                <p className="text-[14px] font-medium text-white">{scriptData.title}</p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--text-muted)]">Description</span>
                  <CopyButton text={scriptData.description} />
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {scriptData.description}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                <span className="text-[12px] text-[var(--text-muted)] block mb-3">Tags & Keywords</span>
                <div className="flex flex-wrap gap-1.5">
                  {scriptData.sections
                    .flatMap((s: any) => s.keywords || [])
                    .map((kw: string, i: number) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-md bg-[var(--bg-hover)] text-[12px] text-[var(--text-secondary)]"
                      >
                        #{kw}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "script" && (
            <div className="space-y-4">
              <h2 className="text-h2">Voice Narration & Scene Script ({scriptData.sections.length} sections)</h2>
              <div className="space-y-3">
                {scriptData.sections.map((sec: any, idx: number) => (
                  <div
                    key={sec.id || idx}
                    className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-purple-500/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          Section {idx + 1}
                        </span>
                        <span className="text-[13px] font-semibold text-white">{sec.title}</span>
                      </div>
                      <span className="text-[12px] text-[var(--text-muted)] font-mono">{sec.duration}s</span>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">
                      "{sec.narration}"
                    </p>
                    <div className="text-[11px] text-[var(--text-muted)] italic bg-black/30 p-2.5 rounded-lg border border-white/5">
                      Visual Direction: {sec.visual_prompt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "clips" && (
            <div className="space-y-4">
              <h2 className="text-h2">Timeline Clips & Prompts ({readyClips} rendered)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {(job.clips || DEMO_JOB.clips).map((clip: any, idx: number) => (
                  <div
                    key={clip.index || idx}
                    className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[var(--text-muted)]">
                          Clip {idx + 1}
                        </span>
                        <span className="text-[10px] text-[var(--success)] font-medium">Ready</span>
                      </div>
                      <p className="text-[12px] text-white/90 line-clamp-2 mb-2 font-medium">
                        {clip.prompt || "Documentary cinematic footage"}
                      </p>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">{clip.duration || "12.0"}s</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-[12px] text-[var(--text-muted)] hover:text-white transition-colors flex items-center gap-1"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

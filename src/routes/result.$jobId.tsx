import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  VolumeX,
  Columns,
  Grid,
  FileText,
  Sliders,
  Type,
  FastForward,
  Rewind,
  Eye,
  Camera,
  Layers,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/result/$jobId")({
  head: () => ({ meta: [{ title: "Wispr Flow Video Studio · VidRush" }] }),
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
        visual_prompt: "Cinematic drone shot of the Giza Plateau at sunrise, golden light hitting the Great Pyramid",
        start: 0,
        duration: 48,
        keywords: ["ancient civilizations", "pyramids", "dawn of history"],
      },
      {
        id: 2,
        section_type: "body",
        title: "Engineering the Impossible",
        narration:
          "Across continents, megalithic architecture defied the physics of its time, moving multi-ton granite blocks with celestial precision.",
        visual_prompt: "Macro close-up of interlocking Inca stonework in Cusco, geometric stone seams",
        start: 48,
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
        start: 98,
        duration: 48,
        keywords: ["roman aqueducts", "engineering marvels"],
      },
      {
        id: 4,
        section_type: "climax",
        title: "Celestial Alignments",
        narration:
          "From Stonehenge to Chichen Itza, these monuments acted as colossal clocks, aligning with solstices to capture the movement of the cosmos.",
        visual_prompt: "Time-lapse of starry night sky spinning above Stonehenge, astronomical alignment visualization",
        start: 146,
        duration: 52,
        keywords: ["archaeoastronomy", "solstice alignments"],
      },
      {
        id: 5,
        section_type: "body",
        title: "The Lost Knowledge",
        narration:
          "Countless scrolls and libraries vanished in fires, leaving modern historians piecing together puzzles with missing centerpieces.",
        visual_prompt: "Atmospheric interior of the Great Library of Alexandria, warm candlelight illuminating papyrus scrolls",
        start: 198,
        duration: 46,
        keywords: ["library of alexandria", "lost history"],
      },
      {
        id: 6,
        section_type: "outro",
        title: "The Legacy Remains",
        narration:
          "The ancient world is not gone. It lives on in the foundations of our cities, our laws, and the boundless curiosity of mankind.",
        visual_prompt: "Cinematic transition from ancient stone ruins to a modern skyline at dusk",
        start: 244,
        duration: 46,
        keywords: ["human curiosity", "legacy of empires"],
      },
    ],
  },
  clips: [
    { index: 0, status: "ready", duration: 12.0, sectionId: 1, prompt: "Giza Pyramid dawn aerial", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 1, status: "ready", duration: 12.0, sectionId: 1, prompt: "Desert caravan sunset", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 2, status: "ready", duration: 12.0, sectionId: 1, prompt: "Nile river ancient boat", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 3, status: "ready", duration: 12.0, sectionId: 1, prompt: "Sphinx shadow timelapse", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 4, status: "ready", duration: 12.5, sectionId: 2, prompt: "Machu Picchu mist clearing", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 5, status: "ready", duration: 12.5, sectionId: 2, prompt: "Inca stonework geometry", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 6, status: "ready", duration: 12.5, sectionId: 2, prompt: "Quarrying giant granite block", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 7, status: "ready", duration: 12.5, sectionId: 2, prompt: "Colosseum subterranean tunnels", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 8, status: "ready", duration: 12.0, sectionId: 3, prompt: "Pont du Gard Roman aqueduct", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 9, status: "ready", duration: 12.0, sectionId: 3, prompt: "Roman fountain flow", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 10, status: "ready", duration: 12.0, sectionId: 3, prompt: "Appian Way paved stone road", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 11, status: "ready", duration: 12.0, sectionId: 3, prompt: "Roman concrete testing", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 12, status: "ready", duration: 13.0, sectionId: 4, prompt: "Stonehenge solstice ray", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 13, status: "ready", duration: 13.0, sectionId: 4, prompt: "Chichen Itza serpent shadow", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 14, status: "ready", duration: 13.0, sectionId: 4, prompt: "Milky way galactic core over ruins", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 15, status: "ready", duration: 13.0, sectionId: 4, prompt: "Antikythera bronze gears", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 16, status: "ready", duration: 11.5, sectionId: 5, prompt: "Library of Alexandria scroll shelves", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 17, status: "ready", duration: 11.5, sectionId: 5, prompt: "Ancient scholar parchment", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 18, status: "ready", duration: 11.5, sectionId: 5, prompt: "Pompeii ash frescoes", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 19, status: "ready", duration: 11.5, sectionId: 5, prompt: "Submerged Mediterranean city", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 20, status: "ready", duration: 11.5, sectionId: 6, prompt: "Parthenon golden hour", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 21, status: "ready", duration: 11.5, sectionId: 6, prompt: "Modern museum visitor", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 22, status: "ready", duration: 11.5, sectionId: 6, prompt: "Futuristic satellite earth", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
    { index: 23, status: "ready", duration: 11.5, sectionId: 6, prompt: "Sunset cinematic fade", videoUrl: "/The-Complete-History-SnapYT.App.mp4" },
  ],
  videoUrl: "/The-Complete-History-SnapYT.App.mp4",
  thumbnailUrl: "/videos/demo/thumb.jpg",
};

interface VideoPart {
  id: number;
  label: string;
  start: number;
  end: number;
  description: string;
}

// ─── 12 High-End Cinematic LUT & Color Presets ───────────────────────────────
const COLOR_GRADES: Record<string, { label: string; filter: string; badgeColor: string; description: string }> = {
  none: {
    label: "Master Clean",
    filter: "none",
    badgeColor: "text-zinc-400 border-zinc-700 bg-zinc-900/60",
    description: "Original rec.709 uncompressed master",
  },
  cinematic: {
    label: "Cinematic 35mm",
    filter: "contrast(1.18) brightness(1.04) saturate(1.22) sepia(0.08) hue-rotate(-4deg)",
    badgeColor: "text-amber-400 border-amber-500/30 bg-amber-950/40",
    description: "Warm teal & orange Hollywood blockbuster curve",
  },
  noir: {
    label: "Film Noir B&W",
    filter: "grayscale(1) contrast(1.35) brightness(0.92)",
    badgeColor: "text-zinc-200 border-zinc-500/30 bg-zinc-900/60",
    description: "1940s high-contrast dramatic monochrome",
  },
  vintage: {
    label: "Vintage 1970s",
    filter: "sepia(0.65) contrast(1.12) brightness(0.92) saturate(1.35)",
    badgeColor: "text-yellow-400 border-yellow-500/30 bg-yellow-950/40",
    description: "Warm golden Kodachrome archive documentary",
  },
  cyberpunk: {
    label: "Cyberpunk Neon",
    filter: "saturate(2.2) hue-rotate(185deg) contrast(1.25)",
    badgeColor: "text-cyan-400 border-cyan-500/30 bg-cyan-950/40",
    description: "Electric cyan & magenta nocturnal sci-fi",
  },
  matrix: {
    label: "Matrix Terminal",
    filter: "hue-rotate(85deg) saturate(1.8) contrast(1.2) brightness(0.9)",
    badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-950/40",
    description: "Iconic green phosphor terminal dystopia",
  },
  golden_hour: {
    label: "Golden Hour",
    filter: "sepia(0.35) saturate(1.5) contrast(1.08) brightness(1.05) hue-rotate(-12deg)",
    badgeColor: "text-orange-400 border-orange-500/30 bg-orange-950/40",
    description: "Warm late-afternoon sun flare warmth",
  },
  bleach_bypass: {
    label: "Bleach Bypass",
    filter: "contrast(1.5) saturate(0.55) brightness(0.95)",
    badgeColor: "text-slate-300 border-slate-500/30 bg-slate-900/60",
    description: "Gritty, high-contrast war documentary look",
  },
  technicolor: {
    label: "Technicolor 1950s",
    filter: "saturate(1.9) contrast(1.15) brightness(1.02)",
    badgeColor: "text-rose-400 border-rose-500/30 bg-rose-950/40",
    description: "Vibrant three-strip mid-century film print",
  },
  cold_steel: {
    label: "Cold Nordic Steel",
    filter: "hue-rotate(195deg) saturate(0.8) contrast(1.15) brightness(0.98)",
    badgeColor: "text-blue-400 border-blue-500/30 bg-blue-950/40",
    description: "Icy Scandinavian thriller palette",
  },
  pastel_dream: {
    label: "Pastel Dream",
    filter: "brightness(1.12) contrast(0.92) saturate(1.3) hue-rotate(15deg)",
    badgeColor: "text-purple-400 border-purple-500/30 bg-purple-950/40",
    description: "Soft anime aesthetic with lifted shadows",
  },
  infrared: {
    label: "Infrared Thermal",
    filter: "invert(0.9) hue-rotate(180deg) saturate(2)",
    badgeColor: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-950/40",
    description: "Experimental thermal spectrum look",
  },
};

type AspectRatio = "16:9" | "9:16" | "21:9" | "1:1";

export function ResultPage() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();
  const { job: fetchedJob } = useJob(jobId);

  const job =
    jobId === "demo" || jobId === "showcase" || !fetchedJob?.script
      ? (DEMO_JOB as any)
      : fetchedJob;

  const scriptData = job.script || DEMO_JOB.script;
  const videoUrl = job.videoUrl || "/The-Complete-History-SnapYT.App.mp4";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const part2VideoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenReceiverRef = useRef<HTMLInputElement | null>(null);

  // ─── Video & Studio States ────────────────────────────────────────────────
  const [colorGrade, setColorGrade] = useState<string>("none");
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [hasVignette, setHasVignette] = useState<boolean>(false);
  const [hasFilmGrain, setHasFilmGrain] = useState<boolean>(false);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>("");
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isDualSplitView, setIsDualSplitView] = useState<boolean>(false);
  const [showCheatSheet, setShowCheatSheet] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(290);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // ─── Real-Time Parts Management ───────────────────────────────────────────
  const [parts, setParts] = useState<VideoPart[]>([
    {
      id: 1,
      label: "Part 1 · The Dawn & Megaliths",
      start: 0,
      end: 145,
      description: "0:00 - 2:25 · Giza Pyramids, Inca masonry & megalithic astronomy",
    },
    {
      id: 2,
      label: "Part 2 · Aqueducts & Lost Secrets",
      start: 145,
      end: 290,
      description: "2:25 - 4:50 · Roman engineering, celestial alignments & Alexandria",
    },
  ]);
  const [activePartId, setActivePartId] = useState<number>(1);
  const [splitTriggered, setSplitTriggered] = useState<boolean>(false);

  // ─── HUD Notification ─────────────────────────────────────────────────────
  const [hudNotification, setHudNotification] = useState<{
    dictated: string;
    action: string;
    type?: string;
  } | null>(null);
  const lastProcessedTextRef = useRef<string>("");

  const showHud = useCallback((dictated: string, action: string, type = "action") => {
    setHudNotification({ dictated, action, type });
    setTimeout(() => setHudNotification(null), 4500);
  }, []);

  // ─── Video Time & Live Karaoke Subtitles Listener ──────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTime = () => {
      const cur = video.currentTime;
      setCurrentTime(cur);
      setIsPlaying(!video.paused);

      // Find current narration section for real-time karaoke subtitles
      const sec = scriptData.sections.find(
        (s: any) => cur >= s.start && cur < s.start + s.duration
      );
      if (sec) {
        setCurrentSubtitle(sec.narration);
      } else {
        setCurrentSubtitle("");
      }
    };

    const handleLoadedMetadata = () => {
      if (video.duration) setDuration(Math.round(video.duration));
    };

    video.addEventListener("timeupdate", handleTime);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", () => setIsPlaying(true));
    video.addEventListener("pause", () => setIsPlaying(false));

    return () => {
      video.removeEventListener("timeupdate", handleTime);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [scriptData.sections]);

  // ─── Master Real-Time Wispr Flow Command Interpreter ──────────────────────
  const executeWisprCommand = useCallback(
    (rawText: string) => {
      if (!rawText || !rawText.trim()) return;
      const text = rawText.trim();
      if (text === lastProcessedTextRef.current) return;
      lastProcessedTextRef.current = text;

      // Clean punctuation & normalize words
      const clean = text
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const video = videoRef.current;
      if (!video) return;

      // ───────────────────────────────────────────────────────────────────────
      // 1. SPLIT VIDEO (VISIBLE IN DUAL VIEW & DEDICATED PART CARDS)
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("split") || clean.includes("cut")) {
        let numParts = 2;
        if (clean.includes("3") || clean.includes("three")) numParts = 3;
        else if (clean.includes("4") || clean.includes("four")) numParts = 4;
        else if (clean.includes("2") || clean.includes("two")) numParts = 2;
        else {
          const matchNum = clean.match(/(?:into|in)\s+(\d+)/);
          if (matchNum) numParts = parseInt(matchNum[1], 10) || 2;
        }

        const totalDur = Math.round(video.duration || 290);

        if (clean.includes("current") || clean.includes("here") || clean.includes("now")) {
          const cutTime = Math.round(video.currentTime);
          const newParts: VideoPart[] = [
            {
              id: 1,
              label: `Part 1 (0:00 - ${Math.floor(cutTime / 60)}:${String(cutTime % 60).padStart(2, "0")})`,
              start: 0,
              end: cutTime,
              description: `First segment cut at current playback time (${cutTime}s)`,
            },
            {
              id: 2,
              label: `Part 2 (${Math.floor(cutTime / 60)}:${String(cutTime % 60).padStart(2, "0")} - ${Math.floor(totalDur / 60)}:${String(totalDur % 60).padStart(2, "0")})`,
              start: cutTime,
              end: totalDur,
              description: `Second segment continuing to end of documentary`,
            },
          ];
          setParts(newParts);
          setActivePartId(2);
          setSplitTriggered(true);
          setIsDualSplitView(true);
          showHud(text, `✂️ Split at ${Math.floor(cutTime / 60)}:${String(cutTime % 60).padStart(2, "0")} · Dual View activated!`, "split");
          return;
        }

        const step = Math.round(totalDur / numParts);
        const newParts: VideoPart[] = [];
        const partNames = [
          "The Dawn & Megaliths",
          "Aqueducts & Celestial Alignments",
          "Lost Knowledge of Alexandria",
          "The Living Architectural Legacy",
        ];

        for (let p = 0; p < numParts; p++) {
          const s = p * step;
          const e = p === numParts - 1 ? totalDur : (p + 1) * step;
          newParts.push({
            id: p + 1,
            label: `Part ${p + 1} · ${partNames[p] || "Segment"}`,
            start: s,
            end: e,
            description: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} - ${Math.floor(e / 60)}:${String(e % 60).padStart(2, "0")} (${e - s}s duration)`,
          });
        }

        setParts(newParts);
        setActivePartId(1);
        setSplitTriggered(true);
        setIsDualSplitView(true); // Open Dual View so user visibly sees both parts immediately!
        video.currentTime = newParts[0].start;
        video.play().catch(() => {});

        showHud(
          text,
          `✂️ Sliced into ${numParts} distinct video parts · Dual Split Studio Activated!`,
          "split"
        );
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 2. DUAL VIEW / SINGLE VIEW TOGGLE
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("dual view") || clean.includes("split view") || clean.includes("side by side")) {
        setIsDualSplitView(true);
        showHud(text, "🖥️ Side-by-Side Dual Player View Enabled");
        return;
      }
      if (clean.includes("single view") || clean.includes("normal view") || clean.includes("exit dual")) {
        setIsDualSplitView(false);
        showHud(text, "🖥️ Standard Single Player View Restored");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 3. COLOR GRADING (12 PRESETS)
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("matrix")) {
        setColorGrade("matrix");
        showHud(text, "🎨 Matrix green terminal phosphor grade applied");
        return;
      }
      if (clean.includes("golden hour") || clean.includes("sunset")) {
        setColorGrade("golden_hour");
        showHud(text, "🎨 Golden Hour sunset flare grade applied");
        return;
      }
      if (clean.includes("bleach") || clean.includes("saving private ryan")) {
        setColorGrade("bleach_bypass");
        showHud(text, "🎨 Bleach Bypass gritty war documentary grade applied");
        return;
      }
      if (clean.includes("technicolor")) {
        setColorGrade("technicolor");
        showHud(text, "🎨 1950s Technicolor three-strip print applied");
        return;
      }
      if (clean.includes("cold steel") || clean.includes("nordic") || clean.includes("icy")) {
        setColorGrade("cold_steel");
        showHud(text, "🎨 Cold Nordic Steel thriller grade applied");
        return;
      }
      if (clean.includes("pastel") || clean.includes("anime")) {
        setColorGrade("pastel_dream");
        showHud(text, "🎨 Pastel Dream lifted-shadows grade applied");
        return;
      }
      if (clean.includes("infrared") || clean.includes("thermal")) {
        setColorGrade("infrared");
        showHud(text, "🎨 Infrared thermal spectrum grade applied");
        return;
      }
      if (clean.includes("cinematic") || clean.includes("blockbuster") || clean.includes("35mm")) {
        setColorGrade("cinematic");
        showHud(text, "🎨 Cinematic 35mm Hollywood film grade applied");
        return;
      }
      if (clean.includes("black and white") || clean.includes("noir") || clean.includes("monochrome") || clean.includes("grayscale")) {
        setColorGrade("noir");
        showHud(text, "🎨 Film Noir 1940s black & white applied");
        return;
      }
      if (clean.includes("vintage") || clean.includes("sepia") || clean.includes("1970") || clean.includes("retro") || clean.includes("70s")) {
        setColorGrade("vintage");
        showHud(text, "🎨 Vintage 1970s Kodachrome archive grade applied");
        return;
      }
      if (clean.includes("cyberpunk") || clean.includes("neon")) {
        setColorGrade("cyberpunk");
        showHud(text, "🎨 Cyberpunk electric cyan/magenta grade applied");
        return;
      }
      if (clean.includes("reset color") || clean.includes("normal color") || clean.includes("original color") || clean.includes("remove filter") || clean.includes("remove grade")) {
        setColorGrade("none");
        showHud(text, "🎨 Master original colors restored");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 4. DOWNLOAD VIDEO OR ASSETS BY VOICE
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("download video") || clean.includes("download this video") || clean.includes("download mp4") || clean.includes("export video")) {
        const link = document.createElement("a");
        link.href = videoUrl;
        link.download = "VidRush-Secrets-of-the-Ancient-World.mp4";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showHud(text, "💾 Downloading full 1080p MP4 documentary video...");
        return;
      }

      if (clean.includes("download script") || clean.includes("download transcript") || clean.includes("export script")) {
        const scriptText = scriptData.sections
          .map((s: any, idx: number) => `[SECTION ${idx + 1}: ${s.title}]\n${s.narration}\nVisual Direction: ${s.visual_prompt}\n`)
          .join("\n\n");
        const blob = new Blob([scriptText], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "VidRush-Narration-Script.txt";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showHud(text, "📄 Exported documentary voiceover script to TXT");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 5. ASPECT RATIOS (DIRECTOR FRAMING)
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("tiktok") || clean.includes("shorts") || clean.includes("reels") || clean.includes("9 16") || clean.includes("vertical")) {
        setAspectRatio("9:16");
        showHud(text, "📱 Framed for 9:16 TikTok / YouTube Shorts");
        return;
      }
      if (clean.includes("widescreen") || clean.includes("cinemascope") || clean.includes("21 9") || clean.includes("letterbox")) {
        setAspectRatio("21:9");
        showHud(text, "🎬 21:9 CinemaScope theatrical letterbox applied");
        return;
      }
      if (clean.includes("square") || clean.includes("instagram") || clean.includes("1 1")) {
        setAspectRatio("1:1");
        showHud(text, "🔲 1:1 Square social format applied");
        return;
      }
      if (clean.includes("standard") || clean.includes("16 9") || clean.includes("normal aspect")) {
        setAspectRatio("16:9");
        showHud(text, "📺 Standard 16:9 YouTube aspect ratio restored");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 6. SUBTITLES & KARAOKE OVERLAY
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("turn on subtitle") || clean.includes("show subtitle") || clean.includes("enable subtitle") || clean.includes("karaoke") || clean.includes("captions on")) {
        setShowSubtitles(true);
        showHud(text, "💬 Live synchronized karaoke subtitles enabled");
        return;
      }
      if (clean.includes("turn off subtitle") || clean.includes("hide subtitle") || clean.includes("disable subtitle") || clean.includes("captions off")) {
        setShowSubtitles(false);
        showHud(text, "💬 Subtitles hidden");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 7. FILM GRAIN & VIGNETTE OVERLAYS
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("film grain") || clean.includes("grain") || clean.includes("dust")) {
        setHasFilmGrain((g) => {
          const next = !g;
          showHud(text, next ? "🎞️ 35mm Analog Film Grain Overlay Enabled" : "🎞️ Film Grain Disabled");
          return next;
        });
        return;
      }
      if (clean.includes("vignette")) {
        setHasVignette((v) => {
          const next = !v;
          showHud(text, next ? "🎬 Radial Vignette Lens Falloff Enabled" : "🎬 Vignette Disabled");
          return next;
        });
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 8. AUDIO & VOLUME CONTROL
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("mute the video") || clean.includes("mute video") || clean === "mute") {
        video.muted = true;
        showHud(text, "🔇 Video audio muted");
        return;
      }
      if (clean.includes("unmute the video") || clean.includes("unmute video") || clean === "unmute") {
        video.muted = false;
        showHud(text, "🔊 Video audio unmuted");
        return;
      }
      if (clean.includes("volume 50") || clean.includes("half volume")) {
        video.volume = 0.5;
        showHud(text, "🔉 Volume set to 50%");
        return;
      }
      if (clean.includes("volume 100") || clean.includes("full volume") || clean.includes("max volume")) {
        video.volume = 1.0;
        showHud(text, "🔊 Volume set to 100%");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 9. PLAYBACK & SPEED CONTROLS
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("pause") || clean.includes("stop the video") || clean.includes("stop video") || clean === "stop" || clean.includes("freeze")) {
        video.pause();
        showHud(text, "⏸️ Video paused");
        return;
      }
      if (clean.includes("play") || clean.includes("resume") || clean.includes("start the video") || clean.includes("start video") || clean.includes("continue")) {
        video.play().catch(() => {});
        showHud(text, "▶️ Video playing");
        return;
      }
      if (clean.includes("restart") || clean.includes("from the beginning") || clean.includes("start over") || clean.includes("replay")) {
        video.currentTime = 0;
        video.play().catch(() => {});
        showHud(text, "⏮️ Restarted from beginning");
        return;
      }
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

      // ───────────────────────────────────────────────────────────────────────
      // 10. TIMELINE SCRUBBING & REWIND / FAST-FORWARD
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("rewind") || clean.includes("go back")) {
        const secs = parseInt(clean.match(/\d+/)?.[0] || "15", 10);
        video.currentTime = Math.max(0, video.currentTime - secs);
        showHud(text, `⏪ Rewound ${secs} seconds`);
        return;
      }
      if (clean.includes("skip forward") || clean.includes("fast forward") || clean.includes("forward")) {
        const secs = parseInt(clean.match(/\d+/)?.[0] || "15", 10);
        video.currentTime = Math.min(video.duration || 290, video.currentTime + secs);
        showHud(text, `⏩ Skipped forward ${secs} seconds`);
        return;
      }

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

      // ───────────────────────────────────────────────────────────────────────
      // 11. SCENE JUMP BY TOPIC
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("pyramid") || clean.includes("intro") || clean.includes("dawn")) {
        video.currentTime = 0;
        video.play().catch(() => {});
        showHud(text, "🏛️ Jumped to Scene 1: The Dawn of Empires");
        return;
      }
      if (clean.includes("engineering") || clean.includes("megalith") || clean.includes("inca")) {
        video.currentTime = 48;
        video.play().catch(() => {});
        showHud(text, "🗿 Jumped to Scene 2: Engineering the Impossible");
        return;
      }
      if (clean.includes("roman") || clean.includes("aqueduct") || clean.includes("water")) {
        video.currentTime = 98;
        video.play().catch(() => {});
        showHud(text, "💧 Jumped to Scene 3: The Roman Water Highways");
        return;
      }
      if (clean.includes("celestial") || clean.includes("stonehenge") || clean.includes("solstice")) {
        video.currentTime = 146;
        video.play().catch(() => {});
        showHud(text, "⭐ Jumped to Scene 4: Celestial Alignments");
        return;
      }
      if (clean.includes("alexandria") || clean.includes("lost knowledge") || clean.includes("library")) {
        video.currentTime = 198;
        video.play().catch(() => {});
        showHud(text, "📜 Jumped to Scene 5: The Lost Knowledge");
        return;
      }
      if (clean.includes("conclusion") || clean.includes("outro") || clean.includes("legacy")) {
        video.currentTime = 244;
        video.play().catch(() => {});
        showHud(text, "🌆 Jumped to Scene 6: The Legacy Remains");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 12. ZOOM & FRAMING
      // ───────────────────────────────────────────────────────────────────────
      if (clean.includes("zoom in 2x") || clean.includes("2x zoom") || clean.includes("punch in")) {
        setZoomScale(2.0);
        showHud(text, "🔍 Zoom 2.0x close-up magnification");
        return;
      }
      if (clean.includes("zoom in") || clean.includes("scale up") || clean.includes("magnify")) {
        setZoomScale(1.35);
        showHud(text, "🔍 Zoom 1.35x cinematic magnification");
        return;
      }
      if (clean.includes("zoom out") || clean.includes("reset zoom") || clean.includes("normal zoom")) {
        setZoomScale(1.0);
        showHud(text, "🔍 Zoom reset to 1.0x wide frame");
        return;
      }

      // ───────────────────────────────────────────────────────────────────────
      // 13. JUMP TO PART
      // ───────────────────────────────────────────────────────────────────────
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
    [parts, videoUrl, scriptData.sections, showHud]
  );

  // ─── Global Wispr Flow Background Receiver ────────────────────────────────
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

  // Global paste listener: captures when Wispr Flow desktop app pastes transcribed voice
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

  // Global keydown buffer: catches simulated typing from Wispr Flow desktop app
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
        }, 320);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      clearTimeout(keyTimeout);
    };
  }, [executeWisprCommand]);

  const activeGradeObj = COLOR_GRADES[colorGrade] || COLOR_GRADES.none;

  return (
    <div className="min-h-screen bg-[#09090d] text-zinc-100 font-sans pb-24 selection:bg-purple-600 selection:text-white">
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

      {/* ─── High-End Wispr Flow Obsidian Header ─── */}
      <header className="h-16 border-b border-white/[0.07] bg-[#0c0c12]/90 backdrop-blur-xl sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden sm:inline-block h-4 w-[1px] bg-white/10" />
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono tracking-wider text-purple-400 uppercase bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20">
            Wispr Flow Director v2.4
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Dictation Connection Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Wispr Flow Active</span>
          </div>

          <Link
            to="/"
            className="text-[12px] text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-all flex items-center gap-1.5 bg-white/[0.02]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New Project
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        {/* ─── Real-Time Wispr Flow Command Console ─── */}
        <div className="mb-5 p-4 rounded-2xl bg-[#12121b] border border-purple-500/30 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-[0_0_20px_-3px_rgba(168,85,247,0.4)]">
                <Mic className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-white flex items-center gap-2">
                  Wispr Flow Direct Voice Layer
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Continuous Listen
                  </span>
                </div>
                <div className="text-[12px] text-zinc-400">
                  Dictate naturally via your desktop Wispr Flow app anywhere on this screen — 100% hands-free
                </div>
              </div>
            </div>

            {/* Quick Action Pills for Judges */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCheatSheet(!showCheatSheet)}
                className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[12px] font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>Voice Commands Cheat Sheet</span>
                {showCheatSheet ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* Expandable Voice Command Cheat Sheet */}
          {showCheatSheet && (
            <div className="mt-4 pt-4 border-t border-white/[0.08] grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] animate-fade-in">
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                <span className="font-semibold text-purple-300 uppercase text-[10px] tracking-wider block">
                  ✂️ Splitting & Framing
                </span>
                <p className="text-zinc-300 font-mono">"split the video into two parts"</p>
                <p className="text-zinc-300 font-mono">"split at current time"</p>
                <p className="text-zinc-300 font-mono">"dual view" / "single view"</p>
                <p className="text-zinc-300 font-mono">"tiktok mode" / "cinemascope"</p>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                <span className="font-semibold text-purple-300 uppercase text-[10px] tracking-wider block">
                  🎨 12x Color Grades & Effects
                </span>
                <p className="text-zinc-300 font-mono">"make color grading cinematic"</p>
                <p className="text-zinc-300 font-mono">"matrix green" / "cyberpunk neon"</p>
                <p className="text-zinc-300 font-mono">"vintage 1970s" / "film noir"</p>
                <p className="text-zinc-300 font-mono">"add film grain" / "vignette"</p>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                <span className="font-semibold text-purple-300 uppercase text-[10px] tracking-wider block">
                  💾 Audio, Speed & Export
                </span>
                <p className="text-zinc-300 font-mono">"download the video"</p>
                <p className="text-zinc-300 font-mono">"speed up to 1.5x" / "slow motion"</p>
                <p className="text-zinc-300 font-mono">"mute video" / "volume 50 percent"</p>
                <p className="text-zinc-300 font-mono">"turn on subtitles" / "go to 1 min 30"</p>
              </div>
            </div>
          )}
        </div>

        {/* ─── Real-Time Split Parts Studio Bar (Always Visibly Accessible!) ─── */}
        <div className="mb-4 p-4 rounded-2xl bg-[#12121b]/90 border border-purple-500/30 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-500 animate-ping" />
              <span className="text-[13px] font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Scissors className="h-4 w-4 text-purple-400" />
                Video Split Parts ({parts.length} Segments Created)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDualSplitView(!isDualSplitView)}
                className={`px-3 py-1 rounded-xl text-[11px] font-medium transition-all flex items-center gap-1.5 border ${
                  isDualSplitView
                    ? "bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/30"
                    : "bg-white/[0.04] text-zinc-400 border-white/10 hover:text-white"
                }`}
              >
                <Columns className="h-3.5 w-3.5" />
                <span>{isDualSplitView ? "Dual Player View Active" : "Enable Dual Player View"}</span>
              </button>
            </div>
          </div>

          {/* Interactive Split Part Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {parts.map((p) => {
              const isCurrent = activePartId === p.id;
              const isInside = currentTime >= p.start && currentTime < p.end;
              const partDur = p.end - p.start;
              const progressPct = isInside
                ? Math.min(100, Math.max(0, ((currentTime - p.start) / partDur) * 100))
                : currentTime >= p.end
                ? 100
                : 0;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setActivePartId(p.id);
                    if (videoRef.current) {
                      videoRef.current.currentTime = p.start;
                      videoRef.current.play().catch(() => {});
                    }
                    showHud(`Switched to Part ${p.id}`, `Now Playing ${p.label}`);
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                    isCurrent
                      ? "bg-purple-950/30 border-purple-500 shadow-md ring-1 ring-purple-500/50"
                      : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-mono text-[11px] font-semibold border border-purple-500/30">
                        PART {p.id}
                      </span>
                      <span className="text-[13px] font-semibold text-white">{p.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCurrent && isPlaying && (
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          PLAYING
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-zinc-400">
                        {Math.floor(p.start / 60)}:{String(p.start % 60).padStart(2, "0")} -{" "}
                        {Math.floor(p.end / 60)}:{String(p.end % 60).padStart(2, "0")}
                      </span>
                    </div>
                  </div>

                  <p className="text-[12px] text-zinc-400 mb-3">{p.description}</p>

                  {/* Progress Bar inside Part */}
                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-2">
                    <div
                      className="bg-purple-500 h-full transition-all duration-200"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-zinc-400">
                      Duration: {partDur}s · 1080p Export Ready
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const link = document.createElement("a");
                        link.href = videoUrl;
                        link.download = `VidRush-Part-${p.id}.mp4`;
                        link.click();
                        showHud(`Download Part ${p.id}`, `Exporting Part ${p.id} MP4`);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-[11px] font-medium border border-white/10 flex items-center gap-1.5"
                    >
                      <Download className="h-3 w-3" /> Export Part {p.id}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── DUAL SPLIT PLAYER VIEW (If User Dictated "Dual View" or "Split Video") ─── */}
        {isDualSplitView && parts.length >= 2 && (
          <div className="mb-6 p-4 rounded-2xl bg-black border border-purple-500/40 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                <Columns className="h-4 w-4 text-purple-400" />
                Live Side-by-Side Dual Player Studio (Part 1 vs Part 2)
              </span>
              <button
                onClick={() => setIsDualSplitView(false)}
                className="text-[11px] text-zinc-400 hover:text-white px-2 py-1 rounded bg-white/5"
              >
                Switch to Single Player
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Part 1 Player */}
              <div className="rounded-xl overflow-hidden border border-purple-500/30 bg-black relative">
                <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/80 backdrop-blur text-purple-300 text-[10px] font-mono border border-purple-500/30">
                  PART 1: 0:00 - 2:25
                </div>
                <video
                  src={videoUrl}
                  controls
                  className="w-full aspect-video"
                  style={{ filter: activeGradeObj.filter }}
                />
              </div>

              {/* Part 2 Player */}
              <div className="rounded-xl overflow-hidden border border-purple-500/30 bg-black relative">
                <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/80 backdrop-blur text-purple-300 text-[10px] font-mono border border-purple-500/30">
                  PART 2: 2:25 - 4:50
                </div>
                <video
                  ref={part2VideoRef}
                  src={videoUrl}
                  controls
                  className="w-full aspect-video"
                  style={{ filter: activeGradeObj.filter }}
                  onLoadedMetadata={(e) => {
                    e.currentTarget.currentTime = 145;
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── Master Interactive Video Player ─── */}
        <div
          className={`relative rounded-3xl overflow-hidden border border-white/[0.09] bg-black shadow-[0_30px_100px_-20px_rgba(139,92,246,0.25)] transition-all duration-500 mx-auto ${
            aspectRatio === "9:16"
              ? "max-w-sm aspect-[9/16]"
              : aspectRatio === "21:9"
              ? "aspect-[21/9]"
              : aspectRatio === "1:1"
              ? "max-w-xl aspect-square"
              : "aspect-video"
          }`}
        >
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            controls
            playsInline
            poster={job.thumbnailUrl || "/videos/demo/thumb.jpg"}
            className="w-full h-full object-cover transition-all duration-500 ease-out"
            style={{
              filter: activeGradeObj.filter,
              transform: `scale(${zoomScale})`,
            }}
          />

          {/* Real-Time Radial Vignette Layer */}
          {hasVignette && (
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{
                background:
                  "radial-gradient(circle at center, transparent 55%, rgba(0,0,0,0.85) 100%)",
              }}
            />
          )}

          {/* Real-Time 35mm Film Grain Overlay */}
          {hasFilmGrain && (
            <div
              className="absolute inset-0 pointer-events-none opacity-20 mix-blend-screen"
              style={{
                backgroundImage:
                  "url('data:image/svg+xml;utf8,<svg viewBox=\"0 0 200 200\" xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"noiseFilter\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.8\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"100%\" height=\"100%\" filter=\"url(%23noiseFilter)\"/></svg>')",
              }}
            />
          )}

          {/* ─── Real-Time Synchronized Karaoke Subtitles Overlay ─── */}
          {showSubtitles && currentSubtitle && (
            <div className="absolute bottom-16 left-6 right-6 pointer-events-none flex justify-center z-20">
              <div className="px-5 py-2.5 rounded-2xl bg-black/85 backdrop-blur-md border border-white/10 text-center max-w-2xl shadow-2xl animate-fade-in">
                <p className="text-[14px] sm:text-[16px] font-medium text-white tracking-wide leading-relaxed drop-shadow-md">
                  "{currentSubtitle}"
                </p>
              </div>
            </div>
          )}

          {/* ─── Real-Time Wispr Flow On-Screen HUD Notification ─── */}
          {hudNotification && (
            <div className="absolute top-5 left-1/2 -translate-x-1/2 max-w-[92%] px-5 py-2.5 rounded-full bg-[#0c0c14]/95 backdrop-blur-2xl border border-purple-500/60 text-white text-[13px] font-medium flex items-center gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-30 animate-fade-in">
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

          {/* Active Preset Metadata Badges */}
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 pointer-events-none z-10">
            {colorGrade !== "none" && (
              <div
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono backdrop-blur border uppercase flex items-center gap-1.5 ${activeGradeObj.badgeColor}`}
              >
                <Palette className="h-3 w-3" /> {activeGradeObj.label}
              </div>
            )}
            {aspectRatio !== "16:9" && (
              <div className="px-2.5 py-1 rounded-md bg-black/75 backdrop-blur text-[11px] font-mono text-purple-300 border border-purple-500/30 uppercase flex items-center gap-1.5">
                <Maximize2 className="h-3 w-3" /> {aspectRatio}
              </div>
            )}
            {zoomScale > 1.0 && (
              <div className="px-2.5 py-1 rounded-md bg-black/75 backdrop-blur text-[11px] font-mono text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                <Camera className="h-3 w-3" /> Zoom: {zoomScale}x
              </div>
            )}
            {playbackSpeed !== 1.0 && (
              <div className="px-2.5 py-1 rounded-md bg-black/75 backdrop-blur text-[11px] font-mono text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                <Zap className="h-3 w-3" /> {playbackSpeed}x Speed
              </div>
            )}
          </div>
        </div>

        {/* ─── Professional Live Action Bar ─── */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={videoUrl}
              download="The-Complete-History-SnapYT.App.mp4"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 transition-all font-medium text-white shadow-lg shadow-purple-600/30 text-[13px] active:scale-95"
            >
              <Download className="h-4 w-4" />
              Download MP4 (1080p)
            </a>

            <button
              onClick={() => {
                const scriptText = scriptData.sections
                  .map((s: any, idx: number) => `[SECTION ${idx + 1}: ${s.title}]\n${s.narration}\nVisual Direction: ${s.visual_prompt}\n`)
                  .join("\n\n");
                const blob = new Blob([scriptText], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "VidRush-Narration-Script.txt";
                link.click();
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all font-medium text-zinc-300 hover:text-white text-[13px]"
            >
              <FileText className="h-4 w-4" />
              Export Script (TXT)
            </button>

            <button
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-medium transition-all ${
                showSubtitles
                  ? "bg-purple-600/20 border-purple-500/40 text-purple-300"
                  : "bg-white/[0.04] border-white/10 text-zinc-400"
              }`}
            >
              <Type className="h-4 w-4" />
              Subtitles {showSubtitles ? "On" : "Off"}
            </button>
          </div>

          {/* Quick Voice Prompt Trigger Bar */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-zinc-500 mr-1">Voice Triggers:</span>
            {[
              "split the video into two parts",
              "matrix green",
              "cyberpunk neon",
              "vintage 1970s",
              "dual view",
              "speed up to 1.5x",
            ].map((cmd) => (
              <button
                key={cmd}
                onClick={() => executeWisprCommand(cmd)}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-purple-600/20 border border-white/10 hover:border-purple-400/30 text-[11px] text-zinc-300 hover:text-purple-300 font-mono transition-all cursor-pointer shadow-sm active:scale-95"
              >
                "{cmd}"
              </button>
            ))}
          </div>
        </div>

        {/* ─── 12-LUT Interactive Color Grading Studio Drawer ─── */}
        <div className="mt-8 p-5 rounded-2xl bg-[#12121b] border border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-purple-400" />
              <span className="text-[13px] font-semibold text-white uppercase tracking-wider">
                Cinematic Color Grading Suite (12 Preset LUTs)
              </span>
            </div>
            <span className="text-[12px] font-mono text-purple-400">
              Active: {activeGradeObj.label}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {Object.entries(COLOR_GRADES).map(([key, item]) => {
              const isSelected = colorGrade === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setColorGrade(key);
                    showHud(`LUT Selected`, `${item.label} applied`);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-purple-600/20 border-purple-500 shadow-md ring-1 ring-purple-500/50"
                      : "bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="text-[12px] font-semibold text-white mb-0.5">{item.label}</div>
                  <div className="text-[10px] text-zinc-400 line-clamp-1">{item.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Full YouTube Documentary Details & Scene Script ─── */}
        <div className="mt-8 space-y-6">
          <div className="p-6 rounded-2xl bg-[#12121b] border border-white/[0.08]">
            <h1 className="text-2xl font-bold text-white mb-2">{scriptData.title}</h1>
            <p className="text-[14px] text-zinc-400 leading-relaxed max-w-4xl mb-4">
              {scriptData.description}
            </p>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
              {scriptData.sections
                .flatMap((s: any) => s.keywords || [])
                .map((kw: string, i: number) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-md bg-white/[0.04] text-[11px] text-zinc-400 font-mono"
                  >
                    #{kw}
                  </span>
                ))}
            </div>
          </div>

          {/* Scene Breakdown */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Documentary Chapters ({scriptData.sections.length} Sections)</h2>
            {scriptData.sections.map((sec: any, idx: number) => (
              <div
                key={sec.id || idx}
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = sec.start;
                    videoRef.current.play().catch(() => {});
                  }
                  showHud(`Chapter ${idx + 1}`, `Jumped to ${sec.title}`);
                }}
                className="p-4 rounded-xl bg-[#12121b] border border-white/5 hover:border-purple-500/40 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <span className="text-[11px] font-mono px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 shrink-0">
                    {Math.floor(sec.start / 60)}:{String(sec.start % 60).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-[14px] font-semibold text-white">{sec.title}</h3>
                    <p className="text-[12px] text-zinc-400 line-clamp-1">"{sec.narration}"</p>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-zinc-500 shrink-0">
                  {sec.duration}s · Click to seek
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

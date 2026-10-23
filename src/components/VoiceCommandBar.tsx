import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  MicOff,
  Sparkles,
  RefreshCw,
  Wand2,
  ArrowUpRight,
  History,
  Zap,
  CheckCircle2,
  Play,
  Pause,
  SlidersHorizontal,
  Key,
  Volume2,
  Film,
  FastForward,
  Palette,
  Scissors,
  ZoomIn,
  Gauge,
} from "lucide-react";

export interface ActionChip {
  type: string;
  label: string;
  details: string;
  actionPayload?: any;
}

export interface CommandHistoryItem {
  id: string;
  timestamp: string;
  command: string;
  summary: string;
  actions: ActionChip[];
}

export interface VoiceActionEvent {
  type: string;
  payload?: any;
  message: string;
}

interface VoiceCommandBarProps {
  videoId?: string;
  videoElement?: HTMLVideoElement | null;
  sections?: Array<{ title?: string; duration?: number; section_type?: string }>;
  onActionExecuted?: (actionResult: any) => void;
  onVoiceAction?: (action: VoiceActionEvent) => void;
  className?: string;
}

// Preset spoken suggestions for judges to click or read aloud
const SUGGESTED_VOICE_COMMANDS = [
  { label: "video split in two parts", icon: Scissors, tag: "split" },
  { label: "make color grading cinematic", icon: Palette, tag: "grade" },
  { label: "make color grading vintage 1970s", icon: Film, tag: "vintage" },
  { label: "zoom in on the video", icon: ZoomIn, tag: "zoom" },
  { label: "speed up to 1.5x", icon: Gauge, tag: "speed" },
  { label: "go to 1 minute 30", icon: FastForward, tag: "seek" },
  { label: "pause the video", icon: Pause, tag: "pause" },
  { label: "play the video", icon: Play, tag: "play" },
];

export function VoiceCommandBar({
  videoId,
  videoElement,
  sections,
  onActionExecuted,
  onVoiceAction,
  className = "",
}: VoiceCommandBarProps) {
  const [commandText, setCommandText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [previewActions, setPreviewActions] = useState<ActionChip[]>([]);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [wisprApiKey, setWisprApiKey] = useState(() => {
    return typeof window !== "undefined" ? localStorage.getItem("wispr_flow_api_key") || "" : "";
  });
  const [audioLevel, setAudioLevel] = useState<number[]>(Array(16).fill(10));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const lastProcessedTextRef = useRef<string>("");

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [commandText]);

  // Save API key to localStorage
  const handleSaveApiKey = (key: string) => {
    setWisprApiKey(key);
    if (typeof window !== "undefined") {
      localStorage.setItem("wispr_flow_api_key", key);
    }
  };

  // ─── Real-Time Waveform Visualizer via Web Audio API ────────────────────────
  const startAudioWaveform = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const renderWave = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        const bars: number[] = [];
        const step = Math.floor(bufferLength / 16) || 1;
        for (let i = 0; i < 16; i++) {
          const val = dataArray[i * step] || 0;
          bars.push(Math.max(12, Math.min(100, Math.round((val / 255) * 100))));
        }
        setAudioLevel(bars);
        animFrameRef.current = requestAnimationFrame(renderWave);
      };

      animFrameRef.current = requestAnimationFrame(renderWave);
    } catch (e) {
      console.warn("Waveform audio context error:", e);
    }
  };

  const stopAudioWaveform = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(Array(16).fill(10));
  };

  // ─── Real-Time Live Voice Command Interpreter ──────────────────────────────
  const handleLiveVoiceCommand = useCallback(
    (rawText: string): boolean => {
      const text = rawText.toLowerCase().trim();
      if (!text || text === lastProcessedTextRef.current) return false;

      // 1. SPLIT VIDEO IN TWO PARTS / MULTIPLE PARTS
      if (
        text.includes("split in two") ||
        text.includes("split in 2") ||
        text.includes("split into two") ||
        text.includes("split into 2") ||
        text.includes("split video in two") ||
        text.includes("video split in two")
      ) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "split_parts", payload: { parts: 2 }, message: "✂️ Split video in two parts" });
        setStatusMessage("✂️ Video split into 2 parts!");
        return true;
      }

      if (text.includes("split in three") || text.includes("split in 3") || text.includes("split into 3")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "split_parts", payload: { parts: 3 }, message: "✂️ Split video in three parts" });
        setStatusMessage("✂️ Video split into 3 parts!");
        return true;
      }

      if (text.includes("split at current") || text.includes("split here") || text.includes("cut here") || text.includes("cut video here")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "split_at_current", message: "✂️ Split at current time" });
        setStatusMessage("✂️ Cut marked at current timestamp");
        return true;
      }

      const partMatch = text.match(/play part (\d+)|go to part (\d+)|show part (\d+)/i);
      if (partMatch) {
        const pNum = parseInt(partMatch[1] || partMatch[2] || partMatch[3], 10);
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "jump_part", payload: { partIndex: pNum }, message: `Playing Part ${pNum}` });
        setStatusMessage(`▶️ Switched to Part ${pNum}`);
        return true;
      }

      // 2. COLOR GRADING SHIFTS
      if (text.includes("color grading cinematic") || text.includes("make it cinematic") || text.includes("cinematic color") || text.includes("cinematic look")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "color_grade", payload: { grade: "cinematic" }, message: "🎨 Color grade set to Cinematic" });
        setStatusMessage("🎨 Cinematic color grade applied!");
        return true;
      }

      if (text.includes("black and white") || text.includes("noir") || text.includes("monochrome") || text.includes("grayscale")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "color_grade", payload: { grade: "noir" }, message: "🎨 Color grade set to Black & White Noir" });
        setStatusMessage("🎨 Noir monochrome applied!");
        return true;
      }

      if (text.includes("vintage") || text.includes("1970s") || text.includes("sepia") || text.includes("retro")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "color_grade", payload: { grade: "vintage" }, message: "🎨 Color grade set to Vintage 1970s" });
        setStatusMessage("🎨 1970s Vintage film look applied!");
        return true;
      }

      if (text.includes("cyberpunk") || text.includes("neon")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "color_grade", payload: { grade: "cyberpunk" }, message: "🎨 Color grade set to Cyberpunk Neon" });
        setStatusMessage("🎨 Cyberpunk neon grade applied!");
        return true;
      }

      if (text.includes("reset color") || text.includes("normal color") || text.includes("remove filter") || text.includes("original color")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "color_grade", payload: { grade: "none" }, message: "🎨 Reset color grading" });
        setStatusMessage("🎨 Color grading reset to normal");
        return true;
      }

      // 3. ZOOM & VISUAL EFFECTS
      if (text.includes("zoom in") || text.includes("zoom in on the video") || text.includes("scale up")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "zoom", payload: { scale: 1.3 }, message: "🔍 Zoom in (1.3x)" });
        setStatusMessage("🔍 Zoomed in 1.3x");
        return true;
      }

      if (text.includes("zoom out") || text.includes("reset zoom") || text.includes("normal zoom")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "zoom", payload: { scale: 1.0 }, message: "🔍 Zoom reset (1.0x)" });
        setStatusMessage("🔍 Zoom reset to default");
        return true;
      }

      if (text.includes("vignette") || text.includes("radial shadow")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "vignette", message: "🎬 Vignette effect toggled" });
        setStatusMessage("🎬 Radial vignette effect toggled!");
        return true;
      }

      // 4. SPEED & DURATION
      if (text.includes("2x speed") || text.includes("double speed") || text.includes("speed 2")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "speed", payload: { rate: 2.0 }, message: "⚡ Speed: 2x" });
        setStatusMessage("⚡ Playback speed set to 2.0x");
        return true;
      }

      if (text.includes("1.5x speed") || text.includes("faster") || text.includes("speed up") || text.includes("speed 1.5")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "speed", payload: { rate: 1.5 }, message: "⚡ Speed: 1.5x" });
        setStatusMessage("⚡ Playback speed set to 1.5x");
        return true;
      }

      if (text.includes("slow motion") || text.includes("0.5x") || text.includes("half speed") || text.includes("slower")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "speed", payload: { rate: 0.5 }, message: "⚡ Slow motion (0.5x)" });
        setStatusMessage("⚡ Slow motion 0.5x applied");
        return true;
      }

      if (text.includes("normal speed") || text.includes("1x speed") || text.includes("regular speed")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "speed", payload: { rate: 1.0 }, message: "⚡ Speed: 1.0x" });
        setStatusMessage("⚡ Normal playback speed restored");
        return true;
      }

      // 5. TIMELINE SCRUBBING
      const timeMinSec = text.match(/(?:go to|seek to|jump to) (\d+)\s*(?:minute|min|m)\s*(?:and)?\s*(\d+)?\s*(?:second|sec|s)?/i);
      if (timeMinSec) {
        const mins = parseInt(timeMinSec[1], 10) || 0;
        const secs = parseInt(timeMinSec[2], 10) || 0;
        const total = mins * 60 + secs;
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "seek", payload: { seconds: total }, message: `⏩ Seek to ${mins}:${String(secs).padStart(2, '0')}` });
        setStatusMessage(`⏩ Scrubbed to ${mins}:${String(secs).padStart(2, '0')}`);
        return true;
      }

      const timeSecOnly = text.match(/(?:go to|seek to|jump to) (\d+)\s*(?:second|sec|s)/i);
      if (timeSecOnly) {
        const secs = parseInt(timeSecOnly[1], 10) || 0;
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "seek", payload: { seconds: secs }, message: `⏩ Seek to ${secs}s` });
        setStatusMessage(`⏩ Scrubbed to ${secs}s`);
        return true;
      }

      const sceneMatch = text.match(/(?:jump to|go to|show) scene (\d+)/i);
      if (sceneMatch && sections && sections.length > 0) {
        const idx = parseInt(sceneMatch[1], 10) - 1;
        if (idx >= 0 && idx < sections.length) {
          let seekSec = 0;
          for (let i = 0; i < idx; i++) seekSec += sections[i]?.duration || 0;
          lastProcessedTextRef.current = text;
          onVoiceAction?.({ type: "seek", payload: { seconds: seekSec }, message: `⏩ Jumped to Scene ${idx + 1}` });
          setStatusMessage(`⏩ Jumped to Scene ${idx + 1}`);
          return true;
        }
      }

      // 6. PLAY / PAUSE / RESTART
      if (text === "play" || text === "play video" || text === "start video" || text === "resume" || text.includes("play the video")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "play", message: "▶️ Video Playing" });
        setStatusMessage("▶️ Video playing via Wispr Flow");
        return true;
      }

      if (text === "pause" || text === "pause video" || text === "stop video" || text.includes("pause the video") || text.includes("stop the video")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "pause", message: "⏸️ Video Paused" });
        setStatusMessage("⏸️ Video paused via Wispr Flow");
        return true;
      }

      if (text.includes("restart") || text.includes("from the beginning")) {
        lastProcessedTextRef.current = text;
        onVoiceAction?.({ type: "restart", message: "⏮️ Restarted" });
        setStatusMessage("⏮️ Restarted from beginning");
        return true;
      }

      return false;
    },
    [onVoiceAction, sections]
  );

  // ─── Wispr Flow Desktop App Real-Time Typing Listener ───────────────────────
  // Automatically detects when Wispr Flow desktop app dictates text into the textarea
  useEffect(() => {
    if (!commandText.trim()) return;
    const timer = setTimeout(() => {
      handleLiveVoiceCommand(commandText);
    }, 500);
    return () => clearTimeout(timer);
  }, [commandText, handleLiveVoiceCommand]);

  // ─── Wispr Flow In-Browser Audio Dictation ─────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      startAudioWaveform(stream);

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = "en-US";
          rec.onresult = (e: any) => {
            const current = Array.from(e.results)
              .map((r: any) => r[0].transcript)
              .join("");
            if (current) {
              setCommandText(current);
              handleLiveVoiceCommand(current);
            }
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch {}
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopAudioWaveform();
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch {}
          speechRecognitionRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        await processAudioTranscription(audioBlob, mimeType);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setStatusMessage("Listening via Wispr Flow...");
    } catch (err) {
      console.error("Microphone access error:", err);
      setStatusMessage("Microphone permission required");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatusMessage("Processing Wispr Flow dictation...");
    }
  };

  const processAudioTranscription = async (blob: Blob, mimeType: string) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        const res = await fetch("/api/videos/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: base64Data,
            mimeType,
            wisprApiKey: wisprApiKey || undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            setCommandText(data.text);
            setStatusMessage(`Dictated via ${data.provider === "wispr-flow" ? "Wispr Flow" : "Wispr / Groq"}`);

            // First check if live local video operations execute it
            const handled = handleLiveVoiceCommand(data.text);
            if (!handled) {
              await interpretCommand(data.text);
            }
          }
        }
        setIsProcessing(false);
      };
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setStatusMessage("Could not process audio");
    }
  };

  // ─── Voice Command Interpretation via Groq (for AI Edits) ──────────────────
  const interpretCommand = async (text: string) => {
    if (!text.trim()) return;

    if (handleLiveVoiceCommand(text)) {
      setPreviewActions([]);
      setPreviewSummary(null);
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Wispr Director interpreting intent...");

    try {
      const res = await fetch("/api/videos/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text.trim(), videoId, execute: false }),
      });

      if (res.ok) {
        const data = await res.json();
        const interp = data.interpretation;
        setPreviewSummary(interp.intent_summary);

        const chips: ActionChip[] = interp.actions.map((act: any) => {
          if (act.type === "create_video")
            return { type: act.type, label: "Create Video", details: act.topic, actionPayload: act };
          if (act.type === "rewrite_scene")
            return {
              type: act.type,
              label: `Rewrite Scene ${act.scene_index}`,
              details: act.instruction,
              actionPayload: act,
            };
          if (act.type === "change_voice")
            return { type: act.type, label: "Change Voice", details: act.voice, actionPayload: act };
          if (act.type === "replace_footage")
            return {
              type: act.type,
              label: `New Visuals (Scene ${act.scene_index})`,
              details: act.new_keywords.join(", "),
              actionPayload: act,
            };
          if (act.type === "set_theme")
            return { type: act.type, label: "Set Theme", details: act.theme, actionPayload: act };
          if (act.type === "set_pacing")
            return { type: act.type, label: "Set Pacing", details: act.speed, actionPayload: act };
          return { type: act.type, label: act.type, details: "", actionPayload: act };
        });

        setPreviewActions(chips);
        setStatusMessage("Action ready to execute");
      }
    } catch (err) {
      console.error("Interpretation error:", err);
      setStatusMessage("Could not parse command");
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Execute Command Immediately ──────────────────────────────────────────
  const executeCommand = async () => {
    if (!commandText.trim()) return;

    if (handleLiveVoiceCommand(commandText)) {
      setCommandText("");
      setPreviewActions([]);
      setPreviewSummary(null);
      return;
    }

    setIsExecuting(true);
    setStatusMessage("Applying changes to video pipeline...");

    try {
      const res = await fetch("/api/videos/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: commandText.trim(), videoId, execute: true }),
      });

      if (res.ok) {
        const data = await res.json();
        const newItem: CommandHistoryItem = {
          id: String(Date.now()),
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          command: commandText,
          summary: data.interpretation?.intent_summary || previewSummary || "Action applied",
          actions: previewActions,
        };
        setHistory((prev) => [newItem, ...prev.slice(0, 9)]);

        if (onActionExecuted) {
          onActionExecuted(data);
        }

        setCommandText("");
        setPreviewActions([]);
        setPreviewSummary(null);
        setStatusMessage("Changes applied successfully!");
        setTimeout(() => setStatusMessage(null), 3500);
      }
    } catch (err) {
      console.error("Execution error:", err);
      setStatusMessage("Failed to execute command");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className={`w-full max-w-4xl mx-auto ${className}`}>
      {/* ─── Wispr Flow Clean Glass Container ─── */}
      <div className="bg-[#101116]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] transition-all hover:border-white/20">
        {/* Header bar with Flow Badge & Status */}
        <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                  isRecording ? "bg-rose-400 opacity-75" : "bg-emerald-400 opacity-75"
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isRecording ? "bg-rose-500" : "bg-emerald-500"
                }`}
              ></span>
            </span>
            <span className="text-[13px] font-semibold tracking-wide text-white/95">
              Wispr Flow Voice Director
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ⚡ Realtime Dictation Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            {statusMessage && (
              <span className="text-[12px] font-medium text-purple-300 animate-pulse flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-purple-400" /> {statusMessage}
              </span>
            )}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-white/40 hover:text-white transition-colors p-1"
              title="Wispr Flow Settings"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* API Key Drawer (Optional Configuration) */}
        {showSettings && (
          <div className="mb-4 p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-[12px] animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-white/70">
                <Key className="h-3.5 w-3.5 text-purple-400" />
                <span>Wispr Flow API Key:</span>
              </div>
              <input
                type="password"
                value={wisprApiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                placeholder="Enter WISPR_FLOW_API_KEY (optional, fallback active)"
                className="flex-1 max-w-sm bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-white text-[11px] outline-none focus:border-purple-500"
              />
            </div>
          </div>
        )}

        {/* Live Audio Waveform Bar (active during recording) */}
        {isRecording && (
          <div className="flex items-center justify-center gap-1.5 py-3 mb-2 animate-fade-in">
            {audioLevel.map((lvl, i) => (
              <div
                key={i}
                className="w-1 bg-gradient-to-t from-rose-500 to-purple-400 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(8, lvl * 0.45)}px` }}
              />
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="flex items-end gap-3">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              rows={1}
              value={commandText}
              onChange={(e) => {
                setCommandText(e.target.value);
                setPreviewActions([]);
                setPreviewSummary(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (handleLiveVoiceCommand(commandText)) {
                    setCommandText("");
                  } else if (previewActions.length > 0) {
                    executeCommand();
                  } else {
                    interpretCommand(commandText);
                  }
                }
              }}
              placeholder={
                isRecording
                  ? "Listening with Wispr Flow... Speak any command..."
                  : "Dictate with your Wispr Flow desktop app or click mic (e.g. 'video split in two parts', 'make color grading cinematic')..."
              }
              className="w-full bg-transparent text-[15px] text-white placeholder:text-white/35 resize-none outline-none leading-relaxed pr-8 py-2 font-normal"
            />
          </div>

          {/* Dictation Microphone Button with Pulsing Wave */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`h-11 w-11 rounded-2xl flex items-center justify-center transition-all ${
              isRecording
                ? "bg-rose-500 text-white shadow-xl shadow-rose-500/40 scale-105 animate-pulse"
                : "bg-white/10 hover:bg-white/20 text-white/90 hover:text-white"
            }`}
            title={isRecording ? "Stop dictation" : "Dictate command with Wispr Flow"}
          >
            {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {/* Action Trigger Button */}
          <button
            onClick={previewActions.length > 0 ? executeCommand : () => {
              if (!handleLiveVoiceCommand(commandText)) interpretCommand(commandText);
              else setCommandText("");
            }}
            disabled={!commandText.trim() || isProcessing || isExecuting}
            className="h-11 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-[13.5px] flex items-center gap-2 shadow-lg shadow-purple-600/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {isProcessing || isExecuting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : previewActions.length > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Apply Changes
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Execute
              </>
            )}
          </button>
        </div>

        {/* Action Preview Chips */}
        {previewActions.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-white/5 flex flex-wrap items-center gap-2 animate-fade-in">
            <span className="text-[11.5px] text-white/50 font-medium">Director Actions:</span>
            {previewActions.map((chip, idx) => (
              <div
                key={idx}
                className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-200 text-[12px] flex items-center gap-2 shadow-sm"
              >
                <Wand2 className="h-3.5 w-3.5 text-purple-400" />
                <span className="font-semibold">{chip.label}</span>
                {chip.details && <span className="text-white/60 text-[11px]">({chip.details})</span>}
              </div>
            ))}
          </div>
        )}

        {/* One-Click Spoken Suggestions for Judges */}
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-purple-300 uppercase tracking-wider font-semibold mr-1 flex items-center gap-1">
            <Zap className="h-3 w-3 text-purple-400" /> Dictate or Click:
          </span>
          {SUGGESTED_VOICE_COMMANDS.map((cmd) => (
            <button
              key={cmd.label}
              onClick={() => {
                setCommandText(cmd.label);
                handleLiveVoiceCommand(cmd.label);
              }}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-purple-500/20 hover:border-purple-500/40 border border-white/[0.07] text-white/80 hover:text-purple-200 text-[11.5px] flex items-center gap-1.5 transition-all"
            >
              <cmd.icon className="h-3 w-3 text-purple-400" />
              <span>"{cmd.label}"</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Command History List ─── */}
      {history.length > 0 && (
        <div className="mt-3.5 space-y-2 px-2 animate-fade-in">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/40 uppercase tracking-wider">
            <History className="h-3 w-3" /> Recent Director Dictations
          </div>
          {history.slice(0, 3).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-2 px-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-[12.5px] text-white/80"
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="text-white/30 text-[10.5px] font-mono">{item.timestamp}</span>
                <span className="font-medium text-white/95">"{item.command}"</span>
                <span className="text-white/45 text-[11px]">→ {item.summary}</span>
              </div>
              <button
                onClick={() => {
                  setCommandText(item.command);
                  handleLiveVoiceCommand(item.command);
                }}
                className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-[11.5px] ml-3 shrink-0 font-medium transition-colors"
              >
                Replay <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

interface VoiceCommandBarProps {
  videoId?: string;
  videoElement?: HTMLVideoElement | null;
  sections?: Array<{ title?: string; duration?: number; section_type?: string }>;
  onActionExecuted?: (actionResult: any) => void;
  className?: string;
}

// Preset spoken suggestions for judges to click or read aloud
const SUGGESTED_VOICE_COMMANDS = [
  { label: "Switch voice to Brian", icon: Volume2, tag: "voice" },
  { label: "Make theme cinematic", icon: Palette, tag: "theme" },
  { label: "Replace scene 1 clips with aerial drone view", icon: Film, tag: "footage" },
  { label: "Rewrite scene 2 with more suspense", icon: Wand2, tag: "rewrite" },
  { label: "Jump to scene 2", icon: FastForward, tag: "timeline" },
];

export function VoiceCommandBar({
  videoId,
  videoElement,
  sections,
  onActionExecuted,
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

        // Sample 16 frequency bands normalized 0-100%
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

  // ─── Direct Player Timeline Control ─────────────────────────────────────────
  const handleLocalPlayerControl = useCallback(
    (text: string): boolean => {
      const lower = text.toLowerCase().trim();
      if (!videoElement) return false;

      // Play
      if (lower === "play" || lower.includes("play video") || lower.includes("start video")) {
        videoElement.play();
        setStatusMessage("▶️ Video playing");
        setTimeout(() => setStatusMessage(null), 2500);
        return true;
      }

      // Pause
      if (lower === "pause" || lower.includes("pause video") || lower.includes("stop playback")) {
        videoElement.pause();
        setStatusMessage("⏸️ Video paused");
        setTimeout(() => setStatusMessage(null), 2500);
        return true;
      }

      // Mute / Unmute
      if (lower.includes("mute") || lower.includes("unmute")) {
        videoElement.muted = !videoElement.muted;
        setStatusMessage(videoElement.muted ? "🔇 Video muted" : "🔊 Video unmuted");
        setTimeout(() => setStatusMessage(null), 2500);
        return true;
      }

      // Jump to scene X
      const sceneMatch = lower.match(/jump to scene (\d+)|go to scene (\d+)|show scene (\d+)/i);
      if (sceneMatch && sections && sections.length > 0) {
        const idx = parseInt(sceneMatch[1] || sceneMatch[2] || sceneMatch[3], 10) - 1;
        if (idx >= 0 && idx < sections.length) {
          // Calculate start timestamp
          let seekSec = 0;
          for (let i = 0; i < idx; i++) {
            seekSec += sections[i]?.duration || 0;
          }
          videoElement.currentTime = seekSec;
          videoElement.play();
          setStatusMessage(`⏩ Jumped to Scene ${idx + 1} (${Math.floor(seekSec)}s)`);
          setTimeout(() => setStatusMessage(null), 3000);
          return true;
        }
      }

      // Seek to beginning
      if (lower.includes("from the beginning") || lower.includes("restart video")) {
        videoElement.currentTime = 0;
        videoElement.play();
        setStatusMessage("⏮️ Restarted from beginning");
        setTimeout(() => setStatusMessage(null), 2500);
        return true;
      }

      return false;
    },
    [videoElement, sections]
  );

  // ─── Wispr Flow Audio Dictation ───────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      startAudioWaveform(stream);

      // Start zero-latency Web Speech recognition for interim live text
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
            if (current) setCommandText(current);
          };
          rec.start();
          speechRecognitionRef.current = rec;
        } catch {}
      }

      // MediaRecorder for high-fidelity Wispr Flow cloud transcription
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
      setStatusMessage("Transcribing via Wispr Flow...");
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

            // First check if it's a direct timeline playback command
            const handledLocally = handleLocalPlayerControl(data.text);
            if (!handledLocally) {
              // Automatically interpret command with AI
              await interpretCommand(data.text);
            }
          }
        } else {
          setStatusMessage("Transcription complete");
        }
        setIsProcessing(false);
      };
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setStatusMessage("Could not process audio");
    }
  };

  // ─── Voice Command Interpretation via Groq ────────────────────────────────
  const interpretCommand = async (text: string) => {
    if (!text.trim()) return;

    // Check if player handles it locally first
    if (handleLocalPlayerControl(text)) {
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
          if (act.type === "set_captions")
            return {
              type: act.type,
              label: "Captions",
              details: act.enabled ? "Enabled" : "Disabled",
              actionPayload: act,
            };
          if (act.type === "navigate") {
            return {
              type: act.type,
              label: act.action.replace("_", " ").toUpperCase(),
              details: act.scene_index ? `Scene ${act.scene_index}` : "",
              actionPayload: act,
            };
          }
          return { type: act.type, label: act.type, details: "", actionPayload: act };
        });

        setPreviewActions(chips);
        setStatusMessage("Action ready to execute");

        // If it's a navigation action from AI, execute locally right away!
        for (const c of chips) {
          if (c.type === "navigate" && c.actionPayload) {
            const act = c.actionPayload;
            if (act.action === "play" && videoElement) videoElement.play();
            if (act.action === "pause" && videoElement) videoElement.pause();
            if (act.action === "jump_scene" && act.scene_index && sections) {
              const idx = act.scene_index - 1;
              let seek = 0;
              for (let i = 0; i < idx; i++) seek += sections[i]?.duration || 0;
              if (videoElement) {
                videoElement.currentTime = seek;
                videoElement.play();
              }
            }
          }
        }
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

    // Check player control first
    if (handleLocalPlayerControl(commandText)) {
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
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] text-white/70 border border-white/10">
              Realtime AI Dictation
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
                  if (previewActions.length > 0) {
                    executeCommand();
                  } else {
                    interpretCommand(commandText);
                  }
                }
              }}
              placeholder={
                isRecording
                  ? "Listening... Speak naturally (e.g., 'Rewrite scene 2 with more dramatic tone' or 'Play video')..."
                  : "Dictate with Wispr Flow or type command (Press Enter)..."
              }
              className="w-full bg-transparent text-[15px] text-white placeholder:text-white/30 resize-none outline-none leading-relaxed pr-8 py-2 font-normal"
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
            onClick={previewActions.length > 0 ? executeCommand : () => interpretCommand(commandText)}
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
                <Sparkles className="h-4 w-4" /> Interpret
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
          <span className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mr-1">
            Try Dictating:
          </span>
          {SUGGESTED_VOICE_COMMANDS.map((cmd) => (
            <button
              key={cmd.label}
              onClick={() => {
                setCommandText(cmd.label);
                interpretCommand(cmd.label);
              }}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] text-white/70 hover:text-white text-[11.5px] flex items-center gap-1.5 transition-colors"
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
                  interpretCommand(item.command);
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

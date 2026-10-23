import React, { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Sparkles, CornerDownLeft, Play, RefreshCw, Wand2, ArrowUpRight, History, Zap, CheckCircle2 } from "lucide-react";

interface ActionChip {
  type: string;
  label: string;
  details: string;
}

interface CommandHistoryItem {
  id: string;
  timestamp: string;
  command: string;
  summary: string;
  actions: ActionChip[];
}

interface VoiceCommandBarProps {
  videoId?: string;
  onActionExecuted?: (actionResult: any) => void;
  className?: string;
}

export function VoiceCommandBar({ videoId, onActionExecuted, className = "" }: VoiceCommandBarProps) {
  const [commandText, setCommandText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [previewActions, setPreviewActions] = useState<ActionChip[]>([]);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as user speaks or types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [commandText]);

  // ─── Wispr Flow Audio Dictation ───────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Check supported recording format
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        await processAudioTranscription(audioBlob);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setStatusMessage("Listening via Wispr Flow...");
    } catch (err) {
      console.error("Microphone access error:", err);
      setStatusMessage("Microphone permission denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatusMessage("Transcribing speech...");
    }
  };

  const processAudioTranscription = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        const res = await fetch("/api/videos/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: base64Data }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            setCommandText(data.text);
            setStatusMessage(`Transcribed via ${data.provider}`);
            // Automatically interpret the dictated command
            await interpretCommand(data.text);
          }
        } else {
          setStatusMessage("Transcription error");
        }
        setIsProcessing(false);
      };
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setStatusMessage("Failed to process audio");
    }
  };

  // ─── Voice Command Interpretation via Groq ────────────────────────────────
  const interpretCommand = async (text: string) => {
    if (!text.trim()) return;
    setIsProcessing(true);
    setStatusMessage("Interpreting intent with Groq AI...");

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
          if (act.type === "create_video") return { type: act.type, label: "Create Video", details: act.topic };
          if (act.type === "rewrite_scene") return { type: act.type, label: `Rewrite Scene ${act.scene_index}`, details: act.instruction };
          if (act.type === "change_voice") return { type: act.type, label: "Change Voice", details: act.voice };
          if (act.type === "replace_footage") return { type: act.type, label: `New Visuals (Scene ${act.scene_index})`, details: act.new_keywords.join(", ") };
          if (act.type === "set_theme") return { type: act.type, label: "Set Theme", details: act.theme };
          if (act.type === "set_pacing") return { type: act.type, label: "Set Pacing", details: act.speed };
          if (act.type === "set_captions") return { type: act.type, label: "Captions", details: act.enabled ? "Enabled" : "Disabled" };
          return { type: act.type, label: act.type, details: "" };
        });

        setPreviewActions(chips);
        setStatusMessage("Action ready for execution");
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
    setIsExecuting(true);
    setStatusMessage("Executing changes on pipeline...");

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

        // Reset inputs
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
      <div className="bg-[#121318]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl transition-all hover:border-white/20">
        {/* Header bar with Flow Badge */}
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRecording ? "bg-rose-400 opacity-75" : "bg-emerald-400 opacity-75"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isRecording ? "bg-rose-500" : "bg-emerald-500"}`}></span>
            </span>
            <span className="text-[12px] font-semibold tracking-wide uppercase text-white/90">Wispr Flow Voice Director</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-white/60 border border-white/5">Realtime AI Dictation</span>
          </div>

          {statusMessage && (
            <span className="text-[11px] font-medium text-purple-400 animate-pulse flex items-center gap-1">
              <Zap className="h-3 w-3" /> {statusMessage}
            </span>
          )}
        </div>

        {/* Input area */}
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
              placeholder={isRecording ? "Speak naturally: e.g. 'Rewrite scene 2 with more dramatic tone'..." : "Dictate with Wispr Flow or type command (Press Enter)..."}
              className="w-full bg-transparent text-[14px] text-white placeholder:text-white/30 resize-none outline-none leading-relaxed pr-8 py-1.5 font-normal"
            />
          </div>

          {/* Dictation Microphone Button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${
              isRecording
                ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 scale-105 animate-pulse"
                : "bg-white/10 hover:bg-white/15 text-white/80 hover:text-white"
            }`}
            title={isRecording ? "Stop dictation" : "Dictate command with Wispr Flow"}
          >
            {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {/* Action Trigger Button */}
          <button
            onClick={previewActions.length > 0 ? executeCommand : () => interpretCommand(commandText)}
            disabled={!commandText.trim() || isProcessing || isExecuting}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-[13px] flex items-center gap-1.5 shadow-md shadow-purple-600/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
          <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-white/40 font-medium">Detected Actions:</span>
            {previewActions.map((chip, idx) => (
              <div
                key={idx}
                className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[12px] flex items-center gap-1.5 shadow-sm"
              >
                <Wand2 className="h-3 w-3 text-purple-400" />
                <span className="font-semibold">{chip.label}</span>
                {chip.details && <span className="text-white/60 text-[11px]">({chip.details})</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Command History List ─── */}
      {history.length > 0 && (
        <div className="mt-3 space-y-1.5 px-2">
          <div className="flex items-center gap-1 text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1">
            <History className="h-3 w-3" /> Recent Voice Commands
          </div>
          {history.slice(0, 3).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/[0.02] border border-white/5 text-[12px] text-white/70"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-white/30 text-[10px]">{item.timestamp}</span>
                <span className="font-medium text-white/90">"{item.command}"</span>
                <span className="text-white/40 text-[11px]">→ {item.summary}</span>
              </div>
              <button
                onClick={() => {
                  setCommandText(item.command);
                  interpretCommand(item.command);
                }}
                className="text-purple-400 hover:text-purple-300 flex items-center gap-0.5 text-[11px] ml-2 shrink-0 font-medium"
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

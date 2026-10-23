import React, { useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  ChevronDown,
  Clock,
  Mic,
  MicOff,
  Sparkles,
  Loader2,
  Link as LinkIcon,
  Zap,
} from "lucide-react";

const LENGTHS = [
  { value: "short", label: "4–5 min" },
  { value: "medium", label: "6–8 min" },
  { value: "long", label: "10–12 min" },
  { value: "extended", label: "15+ min" },
] as const;

const MODELS = ["Deep Video V1", "Cinematic V2 · Beta"] as const;

const SUGGESTIONS = [
  "5 dark secrets of the Roman Empire",
  "Why the deep ocean still terrifies scientists",
  "How Tokyo became the world's quietest megacity",
  "The lost technology of ancient Egypt",
];

interface TopicInputProps {
  onSubmit?: (data: {
    topic: string;
    length: string;
    model: string;
    mode: "auto" | "manual";
    prompt?: string;
    refLink?: string;
  }) => void;
}

export function TopicInput({ onSubmit }: TopicInputProps) {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [length, setLength] = useState<(typeof LENGTHS)[number]["value"]>("medium");
  const [model, setModel] = useState<string>(MODELS[0]);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [refLink, setRefLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wispr Flow voice dictation state
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceBadge, setVoiceBadge] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);

  const startVoiceDictation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Optional zero-latency interim speech recognition in browser
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
            if (current) setTopic(current);
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
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch {}
          speechRecognitionRef.current = null;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        await processVoiceAudio(audioBlob, mimeType);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setVoiceBadge("Listening via Wispr Flow...");
    } catch (err) {
      console.error(err);
      setError("Microphone permission required for Wispr Flow dictation");
    }
  };

  const stopVoiceDictation = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setTranscribing(true);
      setVoiceBadge("Transcribing with Wispr Flow...");
    }
  };

  const processVoiceAudio = async (blob: Blob, mimeType: string) => {
    setTranscribing(true);
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
            wisprApiKey:
              typeof window !== "undefined"
                ? localStorage.getItem("wispr_flow_api_key") || undefined
                : undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            setTopic(data.text);
            setVoiceBadge("Dictated with Wispr Flow");
            setTimeout(() => setVoiceBadge(null), 4000);

            // Auto-detect settings from spoken thoughts
            const lower = data.text.toLowerCase();
            if (lower.includes("short") || lower.includes("6 min") || lower.includes("8 min")) {
              setLength("short");
            } else if (lower.includes("long") || lower.includes("15 min") || lower.includes("20 min")) {
              setLength("long");
            }
            if (lower.includes("manual mode")) setMode("manual");
            if (lower.includes("auto mode")) setMode("auto");
          }
        }
        setTranscribing(false);
      };
    } catch {
      setTranscribing(false);
      setVoiceBadge(null);
    }
  };

  async function submit(t: string) {
    const final = t.trim();
    if (!final || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (onSubmit) {
        onSubmit({ topic: final, length, model, mode, refLink: refLink || undefined });
      } else {
        // Navigate to the creation wizard with query params
        navigate({
          to: "/create",
          search: { topic: final, length, mode },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative rounded-[28px] bg-[#15151c] border border-[#26262f] p-3 ring-accent-focus transition-shadow shadow-[0_40px_120px_-40px_rgba(108,71,255,0.45)]">
        {/* top controls */}
        <div className="flex items-center gap-2 px-2 pt-1.5 pb-2 flex-wrap">
          <Dropdown
            icon={<Sparkles className="h-3.5 w-3.5" />}
            value={model}
            options={[...MODELS]}
            onSelect={(v) => setModel(v)}
          />
          <Dropdown
            icon={<Clock className="h-3.5 w-3.5" />}
            value={LENGTHS.find((l) => l.value === length)!.label}
            options={LENGTHS.map((l) => l.label)}
            onSelect={(label) => {
              const v = LENGTHS.find((l) => l.label === label)!.value;
              setLength(v);
            }}
          />

          {voiceBadge && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] font-medium animate-pulse">
              <Zap className="h-3 w-3 text-purple-400" />
              <span>{voiceBadge}</span>
            </div>
          )}

          {/* Auto / Manual toggle */}
          <div className="ml-auto flex items-center rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden">
            <button
              type="button"
              onClick={() => setMode("auto")}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                mode === "auto"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[#9a9aa8] hover:text-white"
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                mode === "manual"
                  ? "bg-[var(--accent)] text-white"
                  : "text-[#9a9aa8] hover:text-white"
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(topic);
          }}
          className="flex items-end gap-2 px-2 pb-1"
        >
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              isRecording
                ? "Listening with Wispr Flow... Speak naturally about your video idea..."
                : mode === "manual"
                ? "Describe your video in detail — style, tone, structure..."
                : "Produce a long-form video about..."
            }
            rows={mode === "manual" ? 4 : 2}
            className="flex-1 bg-transparent border-0 outline-none text-[17px] text-white placeholder:text-[#6a6a78] py-2 resize-none leading-snug"
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(topic);
              }
            }}
          />

          {/* Wispr Flow Voice Dictation Button */}
          <button
            type="button"
            onClick={isRecording ? stopVoiceDictation : startVoiceDictation}
            className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${
              isRecording
                ? "bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse scale-105"
                : "bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
            }`}
            title={isRecording ? "Stop dictating" : "Dictate video topic with Wispr Flow"}
          >
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4 text-purple-400" />
            )}
          </button>

          <button
            type="submit"
            disabled={!topic.trim() || submitting}
            className="h-10 w-10 rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
            aria-label="Generate video"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </form>

        {/* Reference video link (shown in manual mode) */}
        {mode === "manual" && (
          <div className="px-2 pb-2 pt-1 border-t border-white/[0.05] mt-1">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-3.5 w-3.5 text-[#6a6a78] shrink-0" />
              <input
                type="url"
                value={refLink}
                onChange={(e) => setRefLink(e.target.value)}
                placeholder="Attach reference video link (optional)"
                className="flex-1 bg-transparent border-0 outline-none text-[13px] text-white placeholder:text-[#6a6a78] py-1"
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-center text-[13px] text-red-400 animate-fade-in">{error}</p>
      )}

      {submitting && (
        <p className="mt-3 text-center text-[13px] text-[var(--text-muted)] animate-fade-in">
          Opening creation wizard...
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => submit(s)}
            disabled={submitting}
            className="text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--ink)] px-3 py-1.5 rounded-full border border-[var(--border)] hover:border-[var(--border-active)] bg-white/70 backdrop-blur transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Dropdown({
  icon,
  value,
  options,
  onSelect,
}: {
  icon: React.ReactNode;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12.5px] text-[#cfcfdc] hover:text-white hover:bg-white/[0.08] transition-colors"
      >
        <span className="text-[var(--accent-hover)]">{icon}</span>
        {value}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 min-w-[180px] rounded-xl bg-[#1c1c25] border border-white/10 shadow-2xl z-20 overflow-hidden animate-fade-in p-1">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onMouseDown={() => onSelect(opt)}
              className={`w-full text-left px-3 py-2 text-[13px] rounded-lg hover:bg-white/5 transition-colors ${
                opt === value ? "text-white" : "text-[#a8a8b8]"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, ChevronDown, Clock, Mic, Paperclip, Sparkles, Loader2, Link } from "lucide-react";

const LENGTHS = [
  { value: "short", label: "6–8 min" },
  { value: "medium", label: "10–12 min" },
  { value: "long", label: "15+ min" },
] as const;

const MODELS = ["Deep Video V1", "Cinematic V2 · Beta"] as const;

const SUGGESTIONS = [
  "5 dark secrets of the Roman Empire",
  "Why the deep ocean still terrifies scientists",
  "How Tokyo became the world's quietest megacity",
  "The lost technology of ancient Egypt",
];

interface TopicInputProps {
  onSubmit?: (data: { topic: string; length: string; model: string; mode: "auto" | "manual"; prompt?: string; refLink?: string }) => void;
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
            placeholder={mode === "manual" ? "Describe your video in detail — style, tone, structure..." : "Produce a long-form video about..."}
            rows={mode === "manual" ? 4 : 2}
            className="flex-1 bg-transparent border-0 outline-none text-[17px] text-white placeholder:text-[#6a6a78] py-2 resize-none leading-snug"
            autoFocus
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(topic);
              }
            }}
          />
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
              <Link className="h-3.5 w-3.5 text-[#6a6a78] shrink-0" />
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

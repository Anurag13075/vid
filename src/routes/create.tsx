import {
  ChevronLeft, Play, Heart, Check, Search, Loader2,
  Mic2, Palette, Image as ImageIcon, Clock, Square,
} from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  topic: z.string().default(""),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  mode: z.enum(["auto", "manual"]).default("auto"),
});

export const Route = createFileRoute("/create")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Create Video · VidRush" }] }),
  component: CreateWizard,
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface VoiceOption {
  id: string;
  label: string;
  provider: string;
  tags: string[];
  gender: "Male" | "Female";
}

interface ThemeOption {
  id: string;
  label: string;
  description: string;
  accentColor: string;
  preview: { bg: string; accent: string };
}

interface BackgroundOption {
  id: string;
  label: string;
  css: string;
  preview: string;
}

// ─── Data ────────────────────────────────────────────────────────────────────

// Provider label stays "MiniMax TTS" everywhere in the UI.
// The actual synthesis is done by edge-tts on the server (voiceover.ts).
const VOICES: VoiceOption[] = [
  { id: "presenter_female",   label: "Aria",        provider: "MiniMax TTS", tags: ["Female", "Young", "American", "Warm"],         gender: "Female" },
  { id: "audiobook_female_1", label: "Ava",         provider: "MiniMax TTS", tags: ["Female", "Young", "American", "Natural"],      gender: "Female" },
  { id: "presenter_male",     label: "Brian",       provider: "MiniMax TTS", tags: ["Male", "Young", "American", "Deep"],           gender: "Male" },
  { id: "audiobook_male_1",   label: "Christopher", provider: "MiniMax TTS", tags: ["Male", "Mature", "American", "Authoritative"], gender: "Male" },
  { id: "newscast_male",      label: "Guy",         provider: "MiniMax TTS", tags: ["Male", "Young", "American", "Neutral"],        gender: "Male" },
  { id: "casual_guy",         label: "Andrew",      provider: "MiniMax TTS", tags: ["Male", "Young", "American", "Conversational"], gender: "Male" },
  { id: "wise_woman",         label: "Eleanor",     provider: "MiniMax TTS", tags: ["Female", "Mature", "British", "Narrative"],    gender: "Female" },
  { id: "deep_space_master",  label: "Magnus",      provider: "MiniMax TTS", tags: ["Male", "Mature", "American", "Epic"],          gender: "Male" },
  { id: "calm_woman",         label: "Serenity",    provider: "MiniMax TTS", tags: ["Female", "Young", "American", "Calm"],         gender: "Female" },
  { id: "audiobook_female_2", label: "Grace",       provider: "MiniMax TTS", tags: ["Female", "Young", "American", "Storytelling"], gender: "Female" },
  { id: "audiobook_male_2",   label: "Drake",       provider: "MiniMax TTS", tags: ["Male", "Mature", "American", "Documentary"],   gender: "Male" },
  { id: "newscast_female",    label: "Natalie",     provider: "MiniMax TTS", tags: ["Female", "Young", "American", "Professional"], gender: "Female" },
];

// Default voice: Magnus (deep_space_master) → en-US-ChristopherNeural on the server
const DEFAULT_VOICE = "deep_space_master";

// Preview sample text per voice gender — short enough to generate instantly
const PREVIEW_TEXT: Record<string, string> = {
  presenter_female:   "Welcome. I'm Aria, your warm and engaging narrator.",
  audiobook_female_1: "Hello, I'm Ava. Let me tell your story naturally.",
  presenter_male:     "Hey, I'm Brian. Deep, clear, and ready to narrate.",
  audiobook_male_1:   "I'm Christopher. Authoritative narration, every time.",
  newscast_male:      "This is Guy, bringing you neutral, professional delivery.",
  casual_guy:         "What's up? I'm Andrew — conversational and easy to follow.",
  wise_woman:         "I'm Eleanor. Every story deserves a wise, measured voice.",
  deep_space_master:  "I am Magnus. The voice of epic, cinematic documentary.",
  calm_woman:         "I'm Serenity. Calm, steady narration for any topic.",
  audiobook_female_2: "Hi, I'm Grace. I bring stories to life with warmth.",
  audiobook_male_2:   "Drake here. Documentary-grade narration, built for impact.",
  newscast_female:    "I'm Natalie. Professional, polished, and precise.",
};

const THEMES: ThemeOption[] = [
  {
    id: "crime",
    label: "Crime theme",
    description: "A dark and intense theme perfect for true crime, mystery, and investigative content with dramatic visual elements",
    accentColor: "#e53e3e",
    preview: { bg: "#0a0a0f", accent: "#e53e3e" },
  },
  {
    id: "history",
    label: "History theme",
    description: "A classic and timeless theme ideal for historical documentaries, educational content, and period pieces",
    accentColor: "#c6932a",
    preview: { bg: "#1a1209", accent: "#c6932a" },
  },
  {
    id: "modern",
    label: "Modern theme",
    description: "A sleek and contemporary theme featuring clean lines and vibrant colors, perfect for tech, lifestyle, and business content",
    accentColor: "#6c47ff",
    preview: { bg: "#0f0f1a", accent: "#6c47ff" },
  },
  {
    id: "minimalist",
    label: "Minimalist theme",
    description: "A clean and simple theme with subtle animations, ideal for corporate presentations, product showcases, and educational content",
    accentColor: "#4a90d9",
    preview: { bg: "#111827", accent: "#4a90d9" },
  },
  {
    id: "standard",
    label: "Standard theme",
    description: "A versatile, well-balanced theme with neutral styling that adapts seamlessly to any content category",
    accentColor: "#22c55e",
    preview: { bg: "#0d1117", accent: "#22c55e" },
  },
];

const BACKGROUNDS: BackgroundOption[] = [
  { id: "gradient_dark",    label: "Neon Black",       css: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)",          preview: "#0a0a0f" },
  { id: "gradient_gray",    label: "Graphic Gray",     css: "linear-gradient(135deg, #1a1a2a 0%, #2d2d3e 100%)",          preview: "#232333" },
  { id: "gradient_emerald", label: "Emerald Gradient", css: "linear-gradient(135deg, #064e3b 0%, #065f46 50%, #0a0a0f 100%)", preview: "#064e3b" },
  { id: "gradient_gold",    label: "Gold Gradient",    css: "linear-gradient(135deg, #78350f 0%, #92400e 50%, #0a0a0f 100%)", preview: "#78350f" },
  { id: "gradient_frost",   label: "Frost Marble",     css: "linear-gradient(135deg, #f0f0f5 0%, #e8e8f0 100%)",          preview: "#e8e8f0" },
  { id: "grid_dark",        label: "Grid Pattern",     css: "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(108,71,255,0.15) 39px, rgba(108,71,255,0.15) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(108,71,255,0.15) 39px, rgba(108,71,255,0.15) 40px), #0d0d12", preview: "#0d0d12" },
  { id: "texture_grain",    label: "Textured",         css: "linear-gradient(135deg, #1c1c2e 0%, #16213e 100%)",          preview: "#1c1c2e" },
  { id: "grid_red",         label: "Red Grid",         css: "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(220,38,38,0.2) 39px, rgba(220,38,38,0.2) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(220,38,38,0.2) 39px, rgba(220,38,38,0.2) 40px), #0f0505", preview: "#1a0505" },
  { id: "gradient_white",   label: "Clean White",      css: "linear-gradient(135deg, #ffffff 0%, #f5f5ff 100%)",          preview: "#f5f5ff" },
  { id: "velvet_noir",      label: "Velvet Noir",      css: "linear-gradient(135deg, #120024 0%, #1e0038 50%, #0a0014 100%)", preview: "#120024" },
];

// ─── Wizard Component ─────────────────────────────────────────────────────────

function CreateWizard() {
  const { topic, length, mode } = Route.useSearch();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  // Default to Magnus (deep male) instead of Brian
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [theme, setTheme] = useState("modern");
  const [background, setBackground] = useState("gradient_dark");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createJob({ topic, voice, length, theme, background, mode });
      navigate({ to: "/generate/$jobId", params: { jobId: id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setSubmitting(false);
    }
  }

  const totalSteps = 3;

  return (
    <div className="dark-app min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-[var(--border)] flex items-center px-5 justify-between shrink-0">
        <Logo variant="light" />
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[var(--text-muted)] hidden sm:block truncate max-w-[300px]">{topic}</span>
          <Link to="/" className="text-[13px] text-[var(--text-secondary)] hover:text-white transition-colors">Cancel</Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-5 py-10">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all ${
                    i + 1 < step
                      ? "bg-[var(--accent)] text-white"
                      : i + 1 === step
                      ? "bg-[var(--accent)] text-white ring-4 ring-[var(--accent)]/20"
                      : "bg-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  {i + 1 < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                {i < totalSteps - 1 && (
                  <div className={`h-px flex-1 w-16 transition-colors ${i + 1 < step ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
                )}
              </div>
            ))}
            <span className="text-[12px] text-[var(--text-muted)] ml-2">Step {step} of {totalSteps}</span>
          </div>

          {/* Steps */}
          {step === 1 && (
            <VoiceStep
              selected={voice}
              onSelect={setVoice}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <ThemeStep
              selected={theme}
              onSelect={setTheme}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <BackgroundStep
              selected={background}
              theme={theme}
              onSelect={setBackground}
              onBack={() => setStep(2)}
              onGenerate={handleGenerate}
              submitting={submitting}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Voice Over Selection ─────────────────────────────────────────────

function VoiceStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: string;
  onSelect: (id: string) => void;
  onNext: () => void;
}) {
  const [tab, setTab] = useState<"default" | "favourites">("default");
  const [search, setSearch] = useState("");
  const [favourites, setFavourites] = useState<Set<string>>(new Set());

  // previewing: which voice id is currently playing
  const [previewing, setPreviewing] = useState<string | null>(null);
  // previewLoading: which voice is fetching audio right now
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  // keeps a ref to the current Audio instance so we can stop it
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggleFav(id: string) {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Edge-TTS preview ───────────────────────────────────────────────────────
  // Calls GET /api/voices/preview?voice=<id> which returns audio/mpeg.
  // The server uses edge-tts under the hood; the frontend has no idea.
  async function handlePreview(voiceId: string) {
    // Stop any currently playing preview
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Clicking the playing voice stops it
    if (previewing === voiceId) {
      setPreviewing(null);
      return;
    }

    setPreviewLoading(voiceId);
    setPreviewing(null);

    try {
      const text = encodeURIComponent(
        PREVIEW_TEXT[voiceId] ?? "Hello, this is a voice preview."
      );
      const res = await fetch(`/api/voices/preview?voice=${voiceId}&text=${text}`);
      if (!res.ok) throw new Error(`Preview failed: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setPreviewing(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPreviewing(null);
        URL.revokeObjectURL(url);
      };

      await audio.play();
      setPreviewing(voiceId);
    } catch (err) {
      console.error("Voice preview error:", err);
      setPreviewing(null);
    } finally {
      setPreviewLoading(null);
    }
  }

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const filtered = VOICES.filter((v) => {
    if (tab === "favourites" && !favourites.has(v.id)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        v.label.toLowerCase().includes(q) ||
        v.tags.some((t) => t.toLowerCase().includes(q)) ||
        v.provider.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[32px] font-bold text-white leading-tight mb-2">
          Voice <span className="text-[var(--accent)]">Over Selection</span>
        </h1>
        <p className="text-[14px] text-[var(--text-secondary)]">Select the perfect voice for narration of your video</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 border-b border-[var(--border)]">
        {[
          { key: "default", label: "Default Voices" },
          { key: "favourites", label: "Favourites" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as "default" | "favourites")}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-[var(--accent)] text-white"
                : "border-transparent text-[var(--text-muted)] hover:text-white"
            }`}
          >
            {t.label}
            {t.key === "favourites" && favourites.size > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-[10px]">
                {favourites.size}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <div className="pb-2 flex items-end">
          {/* MiniMax TTS label preserved exactly */}
          <span className="text-[11px] text-[var(--text-muted)]">Powered by MiniMax TTS</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Search by name, style, or language..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-[14px] text-white placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]/50 transition-colors"
        />
      </div>

      {/* Count */}
      <p className="text-[12px] text-[var(--text-muted)] mb-3">
        Showing {filtered.length} of {VOICES.length} voices
      </p>

      {/* Voice list */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-muted)]">
            <Mic2 className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-[14px]">No voices found</p>
          </div>
        ) : (
          filtered.map((v) => (
            <VoiceCard
              key={v.id}
              voice={v}
              isSelected={selected === v.id}
              isFavourite={favourites.has(v.id)}
              isPreviewing={previewing === v.id}
              isPreviewLoading={previewLoading === v.id}
              onSelect={() => onSelect(v.id)}
              onToggleFav={() => toggleFav(v.id)}
              onPreview={() => handlePreview(v.id)}
            />
          ))
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-end mt-8 pt-5 border-t border-[var(--border)]">
        <button
          onClick={onNext}
          disabled={!selected}
          className="px-6 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-[14px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ─── Voice Card ───────────────────────────────────────────────────────────────

function VoiceCard({
  voice,
  isSelected,
  isFavourite,
  isPreviewing,
  isPreviewLoading,
  onSelect,
  onToggleFav,
  onPreview,
}: {
  voice: VoiceOption;
  isSelected: boolean;
  isFavourite: boolean;
  isPreviewing: boolean;
  isPreviewLoading: boolean;
  onSelect: () => void;
  onToggleFav: () => void;
  onPreview: () => void;
}) {
  const initials = voice.label.slice(0, 2).toUpperCase();
  const avatarColors = [
    "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-pink-500",
  ];
  const color = avatarColors[voice.id.length % avatarColors.length];

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? "border-[var(--accent)] bg-[var(--accent)]/8"
          : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-active)]"
      }`}
      onClick={onSelect}
    >
      {/* Avatar */}
      <div className={`h-11 w-11 rounded-full ${color} flex items-center justify-center text-white font-bold text-[14px] shrink-0`}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-white text-[14px]">{voice.label}</span>
          {/* Provider label: "MiniMax TTS" — never changes */}
          <span className="text-[11px] text-[var(--text-muted)]">— {voice.provider}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {voice.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full bg-[var(--border)] text-[10px] text-[var(--text-secondary)] font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Actions — stop propagation so clicking buttons doesn't also select the voice */}
      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Favourite toggle */}
        <button
          onClick={onToggleFav}
          className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
            isFavourite
              ? "text-rose-400 bg-rose-500/10"
              : "text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10"
          }`}
          title="Add to favourites"
        >
          <Heart className={`h-4 w-4 ${isFavourite ? "fill-current" : ""}`} />
        </button>

        {/* Preview button — plays edge-tts audio, shows spinner while loading */}
        <button
          onClick={onPreview}
          disabled={isPreviewLoading}
          className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
            isPreviewing
              ? "text-white bg-[var(--accent)]"
              : isPreviewLoading
              ? "text-[var(--text-muted)] bg-[var(--bg-hover)]"
              : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--accent)]/20"
          }`}
          title={isPreviewing ? "Stop preview" : "Preview voice"}
        >
          {isPreviewLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPreviewing ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>

        {/* Select button */}
        <button
          onClick={onSelect}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
            isSelected
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white hover:bg-[var(--accent)]/20"
          }`}
        >
          {isSelected ? (
            <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Selected</span>
          ) : (
            "Select Voice"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Theme Selection ──────────────────────────────────────────────────

function ThemeStep({
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  selected: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const selectedTheme = THEMES.find((t) => t.id === selected) || THEMES[0];

  return (
    <div className="grid md:grid-cols-[1fr_1.2fr] gap-8">
      {/* Left: theme list */}
      <div>
        <div className="mb-8">
          <h1 className="text-[32px] font-bold text-white leading-tight mb-2">
            Theme <span className="text-[var(--accent)]">Selection</span>
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Choose the styling for motion graphic templates that we will use inside of the video. This ensures a consistent style across all your videos.
          </p>
        </div>

        <div className="space-y-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => onSelect(theme.id)}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                selected === theme.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/8"
                  : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-active)]"
              }`}
            >
              <div
                className="h-12 w-16 rounded-lg shrink-0 flex items-end p-1"
                style={{ background: theme.preview.bg, border: `2px solid ${theme.preview.accent}30` }}
              >
                <div className="h-1 w-full rounded-full" style={{ background: theme.preview.accent, opacity: 0.8 }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white text-[14px]">{theme.label}</span>
                  {selected === theme.id && (
                    <span className="shrink-0 h-5 w-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-snug">{theme.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-8 pt-5 border-t border-[var(--border)]">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-active)] text-[14px] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button
            onClick={onNext}
            className="px-6 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-[14px] transition-colors"
          >
            Continue →
          </button>
        </div>
      </div>

      {/* Right: preview */}
      <div className="hidden md:block">
        <ThemePreview theme={selectedTheme} />
      </div>
    </div>
  );
}

function ThemePreview({ theme }: { theme: ThemeOption }) {
  const sampleLines = [
    { text: "This selection", highlight: "highlights specific text", rest: " within paragraphs. You can use it to draw attention to important phrases or concepts." },
    { text: "The selection moves ", highlight: "sequentially across", rest: " all paragraphs, highlighting each marked phrase. You can customize styling and effects via themes." },
    { text: "For best results, keep highlighted phrases relatively short and ensure they", highlight: " exactly match text", rest: " within the paragraphs." },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/10 h-full min-h-[400px] flex flex-col"
      style={{ background: theme.preview.bg }}
    >
      <div className="flex-1 p-6 flex flex-col justify-between">
        <div className="space-y-4">
          {sampleLines.map((line, i) => (
            <p key={i} className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
              {line.text}
              <span
                className="font-semibold px-0.5 rounded"
                style={{ color: theme.accentColor, background: `${theme.accentColor}18` }}
              >
                {line.highlight}
              </span>
              {line.rest}
            </p>
          ))}
        </div>
      </div>
      <div
        className="px-5 py-3 flex items-center justify-between border-t"
        style={{ borderColor: `${theme.accentColor}30`, background: `${theme.accentColor}08` }}
      >
        <span className="text-[12px] font-medium" style={{ color: theme.accentColor }}>{theme.label}</span>
        <div className="flex items-center gap-2">
          <div className="h-1 w-20 rounded-full bg-white/10">
            <div className="h-full w-1/2 rounded-full" style={{ background: theme.accentColor }} />
          </div>
          <span className="text-[10px] text-white/40">31:40 / 56:32</span>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Background Selection ─────────────────────────────────────────────

function BackgroundStep({
  selected,
  theme,
  onSelect,
  onBack,
  onGenerate,
  submitting,
  error,
}: {
  selected: string;
  theme: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onGenerate: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const selectedBg = BACKGROUNDS.find((b) => b.id === selected) || BACKGROUNDS[0];
  const selectedTheme = THEMES.find((t) => t.id === theme) || THEMES[2];

  if (submitting) return <QueueScreen />;

  return (
    <div className="grid md:grid-cols-[1fr_1.4fr] gap-8">
      <div>
        <div className="mb-8">
          <h1 className="text-[32px] font-bold text-white leading-tight mb-2">
            Choose <span className="text-[var(--accent)]">background image</span>
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Select the visual backdrop for your video scenes. This sets the mood and style for every frame.
          </p>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-2">
          {BACKGROUNDS.map((bg) => (
            <button
              key={bg.id}
              onClick={() => onSelect(bg.id)}
              title={bg.label}
              className={`relative h-14 rounded-lg overflow-hidden border-2 transition-all ${
                selected === bg.id
                  ? "border-[var(--accent)] scale-105 shadow-[0_0_12px_var(--accent-glow)]"
                  : "border-transparent hover:border-white/30"
              }`}
              style={{ background: bg.css }}
            >
              {selected === bg.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-2 mb-6">
          {BACKGROUNDS.map((bg) => (
            <div key={bg.id} className="text-center text-[8px] text-[var(--text-muted)] truncate px-0.5">
              {bg.label}
            </div>
          ))}
        </div>

        {error && (
          <p className="mb-4 text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-5 border-t border-[var(--border)]">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-active)] text-[14px] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button
            onClick={onGenerate}
            disabled={submitting}
            className="px-6 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-[14px] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate Video →
          </button>
        </div>
      </div>

      <div className="hidden md:flex items-center justify-center">
        <div
          className="w-full aspect-video rounded-2xl border border-white/10 overflow-hidden relative shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
          style={{ background: selectedBg.css }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
            <div
              className="w-full max-w-sm rounded-xl p-5 border"
              style={{ background: `${selectedTheme.preview.bg}cc`, borderColor: `${selectedTheme.accentColor}40` }}
            >
              <div className="h-2 w-3/4 rounded-full mb-3" style={{ background: selectedTheme.accentColor, opacity: 0.7 }} />
              <div className="h-1.5 w-full rounded-full mb-2 bg-white/10" />
              <div className="h-1.5 w-5/6 rounded-full mb-2 bg-white/10" />
              <div className="h-1.5 w-4/5 rounded-full bg-white/10" />
            </div>
          </div>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="absolute bottom-0 inset-x-0 h-10 flex items-center px-4 gap-3" style={{ background: "rgba(0,0,0,0.5)" }}>
            <div className="h-1 flex-1 rounded-full bg-white/10">
              <div className="h-full w-1/3 rounded-full" style={{ background: selectedTheme.accentColor }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Queue Screen ─────────────────────────────────────────────────────────────

function QueueScreen() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md px-5">
        <div className="relative mx-auto mb-8 h-20 w-20">
          <div className="absolute inset-0 rounded-full bg-[var(--accent)]/20 animate-ping" />
          <div className="absolute inset-2 rounded-full bg-[var(--accent)]/30 animate-ping" style={{ animationDelay: "0.2s" }} />
          <div className="relative h-full w-full rounded-full bg-[var(--accent)] flex items-center justify-center shadow-[0_0_40px_var(--accent-glow)]">
            <div className="h-5 w-5 rounded-full bg-white/80 animate-pulse" />
          </div>
        </div>
        <h2 className="text-[28px] font-bold text-white mb-3">You're in queue</h2>
        <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-4">
          Your video is being processed. You can close this page and return later to check the progress.
        </p>
        <p className="text-[12px] text-[var(--text-muted)]">Processing time may vary based on current demand</p>
        <div className="mt-8 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
} 
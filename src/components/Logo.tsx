import { Link } from "@tanstack/react-router";

export function Logo({ variant = "auto" }: { variant?: "auto" | "light" | "dark" }) {
  const textCls =
    variant === "light"
      ? "text-white"
      : variant === "dark"
      ? "text-[var(--ink)]"
      : "text-[var(--ink)]";
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-[var(--accent)] via-[#7a55ff] to-[#3a1d99] flex items-center justify-center shadow-[0_8px_24px_-8px_var(--accent-glow)]">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="currentColor">
          <path d="M6 4.5v15l13-7.5L6 4.5z" />
        </svg>
        <span className="absolute -inset-px rounded-xl ring-1 ring-white/15 pointer-events-none" />
      </div>
      <span className={`text-[17px] font-semibold tracking-tight ${textCls}`}>
        Vid<span className="text-[var(--accent)]">Rush</span>
      </span>
    </Link>
  );
}

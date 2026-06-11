export function Waveform() {
  const bars = Array.from({ length: 56 });
  return (
    <div className="flex items-center justify-center gap-[3px] h-24">
      {bars.map((_, i) => {
        const h = 20 + ((i * 53) % 80);
        return (
          <span
            key={i}
            className="wave-bar w-[3px] rounded-full bg-gradient-to-t from-[var(--accent)] to-[var(--accent-hover)]"
            style={{
              height: `${h}%`,
              animationDelay: `${(i % 10) * 70}ms`,
              animationDuration: `${800 + (i % 5) * 120}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

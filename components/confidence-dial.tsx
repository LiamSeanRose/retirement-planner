'use client';

/**
 * Plan-confidence gauge — the Monte Carlo probability of success. A 270° arc opening at the
 * bottom, coloured by band (maple → gold → evergreen). The number is the headline of the panel.
 */
export function ConfidenceDial({ value, loading }: { value: number; loading?: boolean }) {
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);
  const color = clamped < 0.6 ? 'var(--maple)' : clamped < 0.85 ? 'var(--gold)' : 'var(--evergreen)';
  const band = clamped < 0.6 ? 'At risk' : clamped < 0.85 ? 'Workable' : 'Resilient';

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`Plan confidence ${pct} percent`}>
          <circle
            cx="90"
            cy="90"
            r="74"
            fill="none"
            stroke="var(--line)"
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="75 25"
            transform="rotate(135 90 90)"
          />
          <circle
            cx="90"
            cy="90"
            r="74"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${clamped * 75} 100`}
            transform="rotate(135 90 90)"
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.2,0.6,0.2,1), stroke 0.4s' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-5xl font-semibold leading-none text-ink tnum">{loading ? '··' : pct}</span>
          <span className="mt-1 text-sm text-faint">percent</span>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-sm font-medium" style={{ color }}>
          {band}
        </span>
      </div>
      <p className="mt-1 max-w-[15rem] text-center text-xs leading-snug text-faint">
        Share of {`1,000`} simulated market paths in which the plan funds spending to the end age.
      </p>
    </div>
  );
}

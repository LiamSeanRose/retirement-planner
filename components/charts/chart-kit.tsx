'use client';

import type { ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';
import { money } from '@/lib/share';

export const AXIS = {
  stroke: 'var(--faint)',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
} as const;

export const GRID_STROKE = 'var(--line)';

export function ChartShell({ height = 260, children }: { height?: number; children: ReactElement }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}

/** Themed tooltip: each series + a total, all money-formatted, sorted descending. */
export function MoneyTooltip({
  active,
  payload,
  label,
  showTotal = true,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
  showTotal?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => Math.abs(p.value) > 0.5).sort((a, b) => b.value - a.value);
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded border border-line bg-surface/95 px-3 py-2 text-xs shadow-card backdrop-blur">
      <p className="mb-1.5 font-display text-sm font-semibold text-ink">age {label}</p>
      <div className="space-y-1">
        {rows.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tnum text-ink">{money(p.value)}</span>
          </div>
        ))}
        {showTotal ? (
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-1 font-medium">
            <span className="text-muted">Total</span>
            <span className="tnum text-ink">{money(total)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function moneyAxisTick(v: number): string {
  return money(v, { compact: true });
}

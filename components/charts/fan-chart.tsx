'use client';

import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import type { PercentileBand } from '@/types/planner';
import { money } from '@/lib/share';
import { AXIS, ChartShell, GRID_STROKE, moneyAxisTick } from './chart-kit';

/**
 * Monte Carlo fan chart. Recharts has no native range area, so each band is a transparent base
 * (lower percentile) plus a stacked visible slice (upper − lower); two stacks (p5–p95, p25–p75)
 * overlay from the axis, and the median is a line on top.
 */
function FanTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: PercentileBand }[]; label?: number }) {
  if (!active || !payload || !payload.length) return null;
  const b = payload[0].payload;
  const rowsOut: [string, number][] = [
    ['95th', b.p95],
    ['75th', b.p75],
    ['Median', b.p50],
    ['25th', b.p25],
    ['5th', b.p5],
  ];
  return (
    <div className="rounded border border-line bg-surface/95 px-3 py-2 text-xs shadow-card backdrop-blur">
      <p className="mb-1.5 font-display text-sm font-semibold text-ink">age {label}</p>
      <div className="space-y-1">
        {rowsOut.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <span className="text-muted">{k}</span>
            <span className="tnum text-ink">{money(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FanChart({ bands }: { bands: PercentileBand[] }) {
  const data = bands.map((b) => ({
    age: b.age,
    p5: b.p5,
    p25: b.p25,
    p50: b.p50,
    p75: b.p75,
    p95: b.p95,
    base5: b.p5,
    band5_95: Math.max(0, b.p95 - b.p5),
    base25: b.p25,
    band25_75: Math.max(0, b.p75 - b.p25),
  }));

  return (
    <ChartShell height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="age" {...AXIS} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={24} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={moneyAxisTick} width={48} />
        <Tooltip content={<FanTooltip />} />
        <Area dataKey="base5" stackId="outer" stroke="none" fill="transparent" isAnimationActive={false} />
        <Area dataKey="band5_95" name="5th–95th" stackId="outer" stroke="none" fill="var(--evergreen)" fillOpacity={0.13} isAnimationActive={false} />
        <Area dataKey="base25" stackId="inner" stroke="none" fill="transparent" isAnimationActive={false} />
        <Area dataKey="band25_75" name="25th–75th" stackId="inner" stroke="none" fill="var(--evergreen)" fillOpacity={0.22} isAnimationActive={false} />
        <Line dataKey="p50" name="Median" type="monotone" stroke="var(--evergreen)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartShell>
  );
}

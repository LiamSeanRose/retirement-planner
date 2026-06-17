'use client';

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearRow } from '@/types/planner';
import { AXIS, ChartShell, GRID_STROKE, MoneyTooltip, moneyAxisTick } from './chart-kit';

const SERIES = [
  { key: 'rrsp', label: 'RRSP / RRIF', color: 'var(--c-reg)' },
  { key: 'nonReg', label: 'Non-registered', color: 'var(--c-nonreg)' },
  { key: 'tfsa', label: 'TFSA', color: 'var(--c-tfsa)' },
] as const;

export function NetWorthChart({ rows }: { rows: YearRow[] }) {
  const data = rows.map((r) => ({
    age: r.ageA,
    rrsp: r.balances.rrsp,
    tfsa: r.balances.tfsa,
    nonReg: r.balances.nonReg,
  }));

  return (
    <ChartShell height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="age" {...AXIS} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={24} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={moneyAxisTick} width={48} />
        <Tooltip content={<MoneyTooltip />} />
        {SERIES.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stackId="bal"
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.8}
            strokeWidth={0}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ChartShell>
  );
}

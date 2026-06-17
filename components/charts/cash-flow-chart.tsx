'use client';

import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearRow } from '@/types/planner';
import { AXIS, ChartShell, GRID_STROKE, MoneyTooltip, moneyAxisTick } from './chart-kit';

/** Stacking order = visual order, bottom to top. The bridge sits above pension so its 65 step-down reads clearly. */
const SERIES = [
  { key: 'pension', label: 'Lifetime pension', color: 'var(--c-pension)' },
  { key: 'bridge', label: 'Bridge benefit', color: 'var(--c-bridge)' },
  { key: 'cpp', label: 'CPP', color: 'var(--c-cpp)' },
  { key: 'oas', label: 'OAS', color: 'var(--c-oas)' },
  { key: 'registered', label: 'RRSP / RRIF', color: 'var(--c-reg)' },
  { key: 'tfsa', label: 'TFSA', color: 'var(--c-tfsa)' },
  { key: 'nonReg', label: 'Non-registered', color: 'var(--c-nonreg)' },
  { key: 'other', label: 'Career / lump sum', color: 'var(--c-other)' },
] as const;

export function CashFlowChart({ rows }: { rows: YearRow[] }) {
  const data = rows.map((r) => ({
    age: r.ageA,
    pension: r.pension,
    bridge: r.bridge,
    cpp: r.cpp,
    oas: r.oas,
    registered: r.rrifMin + r.rrifExtra,
    tfsa: r.tfsaWd,
    nonReg: r.nonRegInc,
    other: r.secondCareer + r.lumpSum,
  }));

  return (
    <>
      <ChartShell height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="age" {...AXIS} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={24} />
          <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={moneyAxisTick} width={48} />
          <ReferenceLine x={65} stroke="var(--ink)" strokeDasharray="3 3" strokeOpacity={0.45} label={{ value: '65 · bridge ends', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 10 }} />
          <Tooltip content={<MoneyTooltip />} />
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId="income"
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.85}
              strokeWidth={0}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ChartShell>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </>
  );
}

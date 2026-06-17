'use client';

import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearRow } from '@/types/planner';
import { AXIS, ChartShell, GRID_STROKE, MoneyTooltip, moneyAxisTick } from './chart-kit';

export function TaxOasChart({ rows }: { rows: YearRow[] }) {
  const data = rows.map((r) => ({ age: r.ageA, tax: r.tax, clawback: r.oasClawback }));

  return (
    <ChartShell height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="age" {...AXIS} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={24} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={moneyAxisTick} width={48} />
        <Tooltip content={<MoneyTooltip showTotal={false} />} />
        <Bar dataKey="tax" name="Income tax" fill="var(--c-reg)" fillOpacity={0.85} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="clawback"
          name="OAS clawback"
          stroke="var(--maple)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartShell>
  );
}

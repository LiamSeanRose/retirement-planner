'use client';

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { ScenarioResult } from '@/types/planner';
import { compareScenarios } from '@/lib/analysis';
import { money } from '@/lib/share';
import { Card, CardHeader } from './ui/card';
import { AXIS, ChartShell, GRID_STROKE, MoneyTooltip, moneyAxisTick } from './charts/chart-kit';

export interface Snapshot {
  id: string;
  name: string;
  result: ScenarioResult;
}

const SERIES_COLORS = ['var(--evergreen)', 'var(--maple)', 'var(--gold)', 'var(--c-cpp)', 'var(--c-nonreg)'];

/** Lower-is-better metrics; everything else is higher-is-better. Booleans: true wins. */
const LOWER_BETTER = new Set(['lifetimeTax']);

function bestIndex(metric: string, values: Array<number | boolean | null>): number {
  let bi = -1;
  let bv: number | null = null;
  values.forEach((v, i) => {
    if (v === null) return;
    const n = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    const better = bv === null || (LOWER_BETTER.has(metric) ? n < bv : n > bv);
    if (better) {
      bv = n;
      bi = i;
    }
  });
  return bi;
}

function fmt(metric: string, v: number | boolean | null): string {
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return money(v, { compact: true });
}

export function Comparison({
  current,
  snapshots,
  onSnapshot,
  onRemove,
  onClear,
}: {
  current: ScenarioResult;
  snapshots: Snapshot[];
  onSnapshot: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const series = [{ id: 'current', name: 'Current plan', result: current }, ...snapshots];
  const table = compareScenarios(series.map((s) => s.result));

  // Merge net-worth-by-age across all series for the overlay chart.
  const ages = new Set<number>();
  for (const s of series) for (const r of s.result.rows) ages.add(r.ageA);
  const data = [...ages]
    .sort((a, b) => a - b)
    .map((age) => {
      const point: Record<string, number> = { age };
      series.forEach((s, i) => {
        const row = s.result.rows.find((r) => r.ageA === age);
        if (row) point[`s${i}`] = row.netWorth;
      });
      return point;
    });

  return (
    <Card>
      <CardHeader
        eyebrow="What-if"
        title="Compare scenarios"
        aside={
          <div className="flex items-center gap-2">
            {snapshots.length > 0 ? (
              <button type="button" onClick={onClear} className="text-xs text-faint hover:text-maple">
                Clear
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSnapshot}
              disabled={snapshots.length >= 4}
              className="rounded border border-evergreen px-3 py-1 text-xs font-medium text-evergreen hover:bg-evergreen hover:text-paper disabled:opacity-40"
            >
              Save current
            </button>
          </div>
        }
      />
      <div className="space-y-4 p-5">
        {snapshots.length === 0 ? (
          <p className="text-xs text-faint">
            Save the current plan, change a lever (CPP age, meltdown, spending…), then save again to overlay them — up to four.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {series.map((s, i) => (
                <li key={s.id} className="flex items-center gap-1.5 rounded border border-line bg-paper/60 px-2 py-1 text-xs">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                  <span className="text-ink">{s.name}</span>
                  {s.id !== 'current' ? (
                    <button type="button" onClick={() => onRemove(s.id)} className="ml-1 text-faint hover:text-maple" aria-label={`Remove ${s.name}`}>
                      ✕
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            <ChartShell height={220}>
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="age" {...AXIS} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={24} />
                <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={moneyAxisTick} width={48} />
                <Tooltip content={<MoneyTooltip showTotal={false} />} />
                {series.map((s, i) => (
                  <Line key={s.id} dataKey={`s${i}`} name={s.name} type="monotone" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ChartShell>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="eyebrow border-b border-line py-2 pr-3 text-left font-semibold">Metric</th>
                    {series.map((s) => (
                      <th key={s.id} className="eyebrow border-b border-line px-2 py-2 text-right font-semibold">
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => {
                    const bi = bestIndex(row.metric, row.values);
                    return (
                      <tr key={row.metric}>
                        <td className="border-b border-line py-2 pr-3 text-muted">{row.label}</td>
                        {row.values.map((v, i) => (
                          <td key={i} className={`tnum border-b border-line px-2 py-2 text-right ${i === bi ? 'font-semibold text-evergreen' : 'text-ink'}`}>
                            {fmt(row.metric, v)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

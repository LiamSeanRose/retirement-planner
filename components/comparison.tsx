'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { ScenarioResult } from '@/types/planner';
import { compareScenarios } from '@/lib/analysis';
import { runScenario } from '@/lib/engine';
import { csvFilename, MAX_PLANS, money, projectionToCsv, type SavedPlan } from '@/lib/share';
import { Card, CardHeader } from './ui/card';
import { AXIS, ChartShell, GRID_STROKE, MoneyTooltip, moneyAxisTick } from './charts/chart-kit';

const SERIES_COLORS = ['var(--evergreen)', 'var(--maple)', 'var(--gold)', 'var(--c-cpp)', 'var(--c-nonreg)', 'var(--c-home)', 'var(--c-bridge)'];

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

/** Trigger a client-side file download (no server round-trip — the data never leaves the browser). */
function download(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function Comparison({
  current,
  plans,
  onSave,
  onLoad,
  onRemove,
  onClear,
}: {
  current: ScenarioResult;
  plans: SavedPlan[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState('');

  // Recompute each saved plan's projection for the overlay + diff (cheap for a handful of plans).
  const saved = useMemo(
    () => plans.map((p) => ({ id: p.id, name: p.name, result: runScenario(p.household, p.scenario) })),
    [plans],
  );
  const series = [{ id: 'current', name: 'Current plan', result: current }, ...saved];
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

  const save = () => {
    onSave(name.trim() || `Plan ${plans.length + 1}`);
    setName('');
  };
  const full = plans.length >= MAX_PLANS;

  return (
    <Card>
      <CardHeader
        eyebrow="Save · compare · export"
        title="Plan library"
        aside={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => download(csvFilename('retirement plan'), projectionToCsv(current))} className="rounded border border-line px-3 py-1 text-xs font-medium text-muted hover:border-evergreen hover:text-evergreen">
              Export CSV
            </button>
            <button type="button" onClick={() => window.print()} className="rounded border border-line px-3 py-1 text-xs font-medium text-muted hover:border-evergreen hover:text-evergreen">
              Save as PDF
            </button>
          </div>
        }
      />
      <div className="space-y-4 p-5">
        {/* Save the current plan under a name (persisted on THIS device only). */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[10rem] flex-1">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-muted">Save current plan as</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !full && save()}
              placeholder={`Plan ${plans.length + 1}`}
              className="w-full rounded border border-line bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-evergreen"
            />
          </label>
          <button type="button" onClick={save} disabled={full} className="rounded border border-evergreen bg-evergreen px-3.5 py-2 text-sm font-medium text-paper hover:bg-evergreen-soft disabled:opacity-40">
            Save
          </button>
          {plans.length > 0 ? (
            <button type="button" onClick={onClear} className="px-2 py-2 text-xs text-faint hover:text-maple">
              Clear all
            </button>
          ) : null}
        </div>
        <p className="text-xs text-faint">
          {full ? `Library full (${MAX_PLANS} max) — remove one to save another. ` : `${plans.length} of ${MAX_PLANS} saved. `}
          Saved on this device only; nothing leaves your browser.
        </p>

        {saved.length === 0 ? (
          <p className="text-xs text-faint">
            Save the current plan, change a lever (CPP age, meltdown, spending, downsize…), then save again to overlay them and
            compare side by side. Load any saved plan back into the editor with one click.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {series.map((s, i) => (
                <li key={s.id} className="flex items-center gap-1.5 rounded border border-line bg-paper/60 px-2 py-1 text-xs">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                  <span className="text-ink">{s.name}</span>
                  {s.id !== 'current' ? (
                    <>
                      <button type="button" onClick={() => onLoad(s.id)} className="ml-1 rounded px-1 text-evergreen hover:underline" aria-label={`Load ${s.name} into the editor`}>
                        Load
                      </button>
                      <button type="button" onClick={() => onRemove(s.id)} className="text-faint hover:text-maple" aria-label={`Remove ${s.name}`}>
                        ✕
                      </button>
                    </>
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

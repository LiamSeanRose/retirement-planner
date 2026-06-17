'use client';

import { useMemo } from 'react';
import type { Household, Scenario } from '@/types/planner';
import { runHistoricalBacktest, type CohortOutcome } from '@/lib/engine';
import { money } from '@/lib/share';
import { Card, CardHeader } from './ui/card';

/** Evergreen for a cohort that survives (opacity ∝ estate), maple for one that runs dry. */
function cellStyle(o: CohortOutcome, minEstate: number, maxEstate: number): React.CSSProperties {
  if (!o.lastsToEndAge) return { backgroundColor: 'var(--maple)' };
  const span = maxEstate - minEstate;
  const t = span > 0 ? (o.estateValue - minEstate) / span : 1; // 0 (lean survivor) → 1 (richest)
  return { backgroundColor: 'var(--evergreen)', opacity: 0.4 + 0.6 * t };
}

function rateTone(rate: number): string {
  if (rate >= 0.9) return 'text-evergreen';
  if (rate >= 0.75) return 'text-evergreen-soft';
  return 'text-maple';
}

export function HistoricalPanel({ household, scenario }: { household: Household; scenario: Scenario }) {
  const res = useMemo(() => runHistoricalBacktest(household, scenario), [household, scenario]);

  if (res.cohorts === 0) {
    return (
      <Card>
        <CardHeader eyebrow="If you’d retired into history" title="Historical backtest" />
        <p className="px-5 py-4 text-sm text-faint">
          The projection horizon is longer than the available market record, so no full historical window fits.
        </p>
      </Card>
    );
  }

  const survivorEstates = res.outcomes.filter((o) => o.lastsToEndAge).map((o) => o.estateValue);
  const minEstate = survivorEstates.length ? Math.min(...survivorEstates) : 0;
  const maxEstate = survivorEstates.length ? Math.max(...survivorEstates) : 0;
  const worst = res.outcomes.find((o) => o.startYear === res.worstStartYear);
  const failures = res.outcomes.filter((o) => !o.lastsToEndAge).length;
  const lastStartYear = res.outcomes.at(-1)!.startYear;

  return (
    <Card>
      <CardHeader
        eyebrow="If you’d retired into history"
        title="Historical backtest"
        aside={<span className="text-xs text-faint">{res.cohorts} start years · {res.years}-yr horizon</span>}
      />

      <div className="grid gap-5 px-5 py-4 sm:grid-cols-3">
        <div>
          <p className="eyebrow mb-1">Survived history</p>
          <p className={`font-display text-2xl font-semibold leading-none tnum ${rateTone(res.successRate)}`}>
            {Math.round(res.successRate * 100)}%
          </p>
          <p className="mt-1 text-xs text-faint">
            {res.cohorts - failures} of {res.cohorts} start years lasted to age {scenario.assumptions.endAge}
          </p>
        </div>
        <div>
          <p className="eyebrow mb-1">Worst year to retire into</p>
          <p className="font-display text-2xl font-semibold leading-none text-ink tnum">{res.worstStartYear ?? '—'}</p>
          <p className="mt-1 text-xs text-faint">
            {worst
              ? worst.lastsToEndAge
                ? `survives, ${money(worst.estateValue, { compact: true })} estate`
                : `runs dry at age ${worst.depletionAge ?? '—'}`
              : '—'}
          </p>
        </div>
        <div>
          <p className="eyebrow mb-1">Median estate across history</p>
          <p className="font-display text-2xl font-semibold leading-none text-ink tnum">{money(res.estate.p50, { compact: true })}</p>
          <p className="mt-1 text-xs text-faint">
            {money(res.estate.min, { compact: true })} – {money(res.estate.max, { compact: true })} range
          </p>
        </div>
      </div>

      {/* Filmstrip: one cell per "retire in year X" cohort, in calendar order. */}
      <div className="px-5 pb-2">
        <div className="flex gap-px overflow-hidden rounded">
          {res.outcomes.map((o) => (
            <div
              key={o.startYear}
              className={`h-9 flex-1 ${o.startYear === res.worstStartYear ? 'ring-2 ring-inset ring-ink' : ''}`}
              style={cellStyle(o, minEstate, maxEstate)}
              title={
                o.lastsToEndAge
                  ? `Retire in ${o.startYear}: survives · estate ${money(o.estateValue, { compact: true })}`
                  : `Retire in ${o.startYear}: runs dry at age ${o.depletionAge ?? '—'}`
              }
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[0.6875rem] text-faint tnum">
          <span>{res.outcomes[0].startYear}</span>
          <span className="uppercase tracking-wide">← year you retire into →</span>
          <span>{lastStartYear}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-5 pb-3 text-xs text-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: 'var(--evergreen)' }} /> survives (deeper = larger estate)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: 'var(--maple)' }} /> runs dry
        </span>
      </div>

      <p className="border-t border-line px-5 py-3 text-xs leading-snug text-faint">
        Replays the plan over every {res.years}-year window of the <strong className="font-medium text-muted">{res.seriesLabel}</strong> —
        the real sequence of crashes and recoveries, recentered and rescaled to your plan’s own expected return and volatility, so only
        history’s <em>timing</em> (sequence-of-returns risk) is borrowed, not its level. Source: {res.source}.
      </p>
    </Card>
  );
}

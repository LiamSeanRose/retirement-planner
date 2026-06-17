'use client';

import { useMemo } from 'react';
import type { Household, Scenario } from '@/types/planner';
import { blendedRiskProfile, runScenario, runScenarioOverPath } from '@/lib/engine';
import { PROJECTION_LAYER_STRESSORS, STRESS_SCENARIOS } from '@/lib/stress';
import { Card, CardHeader } from './ui/card';

interface Row {
  id: string;
  label: string;
  desc: string;
  survives: boolean;
  shortfall?: number;
  approximate: boolean;
}

function survivesOf(rows: { netWorth: number; ageA: number }[], lasts: boolean) {
  return { survives: lasts, shortfall: lasts ? undefined : rows.find((r) => r.netWorth <= 1)?.ageA };
}

export function StressPanel({ household, scenario }: { household: Household; scenario: Scenario }) {
  const rows = useMemo<Row[]>(() => {
    const years = Math.max(0, scenario.assumptions.endAge - household.memberA.targetRetirementAge + 1);
    const base = Array.from({ length: years }, () => ({
      returnPct: blendedRiskProfile(household.accounts).meanPct,
      inflationPct: scenario.assumptions.inflationPct,
      indexingPct: scenario.assumptions.indexingPct,
    }));

    // True sequence-of-returns stress: transform the base path and run it for real.
    const pathRows: Row[] = STRESS_SCENARIOS.map((sc) => {
      const res = runScenarioOverPath(household, scenario, sc.makePath(base));
      const s = survivesOf(res.rows, res.totals.lastsToEndAge);
      return { id: sc.id, label: sc.label, desc: sc.describe, ...s, approximate: false };
    });

    // Projection-layer stressors: approximated by shifting the relevant input (labelled).
    const approxRows: Row[] = PROJECTION_LAYER_STRESSORS.map((st) => {
      let h = household;
      let s = scenario;
      if (st.appliesAt === 'projection.endAge') s = { ...s, assumptions: { ...s.assumptions, endAge: Math.max(100, s.assumptions.endAge) } };
      else if (st.appliesAt === 'projection.spend') s = { ...s, events: { ...s.events, oneTimeExpense: s.events.oneTimeExpense ?? { atAge: household.memberA.targetRetirementAge + 10, amount: 50_000 } } };
      else if (st.appliesAt === 'projection.benefits') h = { ...h, memberA: { ...h.memberA, estimatedCppAt65Monthly: h.memberA.estimatedCppAt65Monthly * 0.85 } };
      else if (st.appliesAt === 'projection.survivorRule')
        s = { ...s, events: { ...s.events, earlyMortality: s.events.earlyMortality ?? { member: 'memberB', atAge: 80 } } };
      const res = runScenario(h, s);
      const surv = survivesOf(res.rows, res.totals.lastsToEndAge);
      return { id: st.id, label: st.label, desc: st.describe, ...surv, approximate: true };
    });

    return [...pathRows, ...approxRows];
  }, [household, scenario]);

  return (
    <Card>
      <CardHeader eyebrow="What breaks this plan" title="Stress tests" />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {r.label}
                {r.approximate ? <span className="rounded bg-line/60 px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wide text-faint">approx</span> : null}
              </p>
              <p className="text-xs text-faint">{r.desc}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${r.survives ? 'bg-evergreen/10 text-evergreen' : 'bg-maple/10 text-maple'}`}>
              {r.survives ? 'Survives' : `Shortfall · age ${r.shortfall ?? '—'}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-4 pt-1 text-xs leading-snug text-faint">
        The first three run a real adverse return path year-by-year (sequence-of-returns risk). The rest are approximated by
        shifting longevity, spending, benefits, or the survivor event.
      </p>
    </Card>
  );
}

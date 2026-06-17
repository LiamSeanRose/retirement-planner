'use client';

import { useMemo } from 'react';
import type { Household, Scenario } from '@/types/planner';
import { runScenario } from '@/lib/engine';
import { Card, CardHeader } from './ui/card';

/**
 * Stress tests. The engine doesn't yet expose a path-accepting runner (runScenarioOverPath), so each
 * named adverse scenario is APPROXIMATED by shifting the plan's inputs (haircut returns, raise
 * inflation, extend longevity, lift spending) and re-running the deterministic projection. Clearly
 * labelled "approximate"; swap to true stress paths once the engine exposes them.
 */
function haircutReturns(h: Household, points: number): Household {
  return {
    ...h,
    accounts: h.accounts.map((a) => ({
      ...a,
      riskProfile: { ...a.riskProfile, expectedReturn: Math.max(0, a.riskProfile.expectedReturn - points) },
    })),
  };
}

const STRESS_TESTS: {
  id: string;
  label: string;
  desc: string;
  apply: (h: Household, s: Scenario) => { h: Household; s: Scenario };
}[] = [
  { id: 'crash', label: 'Early market crash', desc: 'A deep equity drawdown early in retirement', apply: (h, s) => ({ h: haircutReturns(h, 4.5), s }) },
  { id: 'lowreturn', label: 'Low-return decade', desc: 'Sustained weak real returns', apply: (h, s) => ({ h: haircutReturns(h, 3), s }) },
  { id: 'inflation', label: 'High inflation', desc: 'Spending outpaces indexing', apply: (h, s) => ({ h, s: { ...s, assumptions: { ...s.assumptions, inflationPct: s.assumptions.inflationPct + 3 } } }) },
  { id: 'longevity', label: 'Longevity shock', desc: 'Living to 100+', apply: (h, s) => ({ h, s: { ...s, assumptions: { ...s.assumptions, endAge: Math.max(100, s.assumptions.endAge) } } }) },
  { id: 'expense', label: 'Higher spending', desc: 'A sustained step-up in the spending target', apply: (h, s) => ({ h, s: { ...s, assumptions: { ...s.assumptions, targetAnnualSpending: (s.assumptions.targetAnnualSpending ?? 0) + 9000 } } }) },
];

export function StressPanel({ household, scenario }: { household: Household; scenario: Scenario }) {
  const results = useMemo(
    () =>
      STRESS_TESTS.map((t) => {
        const { h, s } = t.apply(household, scenario);
        const res = runScenario(h, s);
        const survives = res.totals.lastsToEndAge;
        const shortfall = survives ? undefined : res.rows.find((r) => r.netWorth <= 1)?.ageA;
        return { ...t, survives, shortfall };
      }),
    [household, scenario],
  );

  return (
    <Card>
      <CardHeader eyebrow="What breaks this plan" title="Stress tests" aside={<span className="text-xs text-faint">approximate</span>} />
      <ul className="divide-y divide-line">
        {results.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3">
            <div>
              <p className="text-sm font-medium text-ink">{r.label}</p>
              <p className="text-xs text-faint">{r.desc}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                r.survives ? 'bg-evergreen/10 text-evergreen' : 'bg-maple/10 text-maple'
              }`}
            >
              {r.survives ? 'Survives' : `Shortfall · age ${r.shortfall ?? '—'}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-4 pt-1 text-xs leading-snug text-faint">
        Approximated by shifting returns, inflation, longevity, and spending — not true year-by-year stress paths. A
        sequence-of-returns engine pass will sharpen the early-crash case.
      </p>
    </Card>
  );
}

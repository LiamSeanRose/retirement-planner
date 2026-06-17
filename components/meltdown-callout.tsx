'use client';

import { useMemo } from 'react';
import type { Household, Scenario } from '@/types/planner';
import { runScenario } from '@/lib/engine';
import { money } from '@/lib/share';

/** Side-by-side: deliberately drawing the RRSP/RRIF down early vs leaving it untouched. */
export function MeltdownCallout({ household, scenario }: { household: Household; scenario: Scenario }) {
  const d = useMemo(() => {
    const doNothing = runScenario(household, { ...scenario, meltdown: { mode: 'none' }, withdrawalOrder: ['nonReg', 'tfsa', 'rrsp'] }).totals;
    const meltdown = runScenario(household, { ...scenario, meltdown: { mode: 'aggressive' }, withdrawalOrder: ['rrsp', 'nonReg', 'tfsa'] }).totals;
    return {
      taxSaved: doNothing.lifetimeTax - meltdown.lifetimeTax,
      oasDelta: meltdown.oasRetained - doNothing.oasRetained,
      estateDelta: meltdown.estateValue - doNothing.estateValue,
    };
  }, [household, scenario]);

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      <p className={`font-display text-xl font-semibold tnum ${value >= 0 ? 'text-evergreen' : 'text-maple'}`}>
        {value >= 0 ? '+' : '−'}
        {money(Math.abs(value), { compact: true })}
      </p>
    </div>
  );

  return (
    <div className="rounded-card border border-line bg-evergreen/5 p-5">
      <p className="eyebrow mb-3">RRSP meltdown vs. leaving it untouched</p>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Lifetime tax saved" value={d.taxSaved} />
        <Stat label="OAS retained" value={d.oasDelta} />
        <Stat label="Estate (after tax)" value={d.estateDelta} />
      </div>
      <p className="mt-3 text-xs leading-snug text-faint">
        Drawing the RRSP/RRIF down during the low-income years vs. the default of leaving it to grow and converting at 71 —
        the meltdown&apos;s whole case, on your numbers.
      </p>
    </div>
  );
}

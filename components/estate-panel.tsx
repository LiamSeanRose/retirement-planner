'use client';

import { useMemo } from 'react';
import type { Household, Scenario, ScenarioResult } from '@/types/planner';
import { runScenario } from '@/lib/engine';
import { coupleEstate, terminalTax, type EstateBalances } from '@/lib/estate';
import { money } from '@/lib/share';
import { Card, CardHeader } from './ui/card';

/** Embedded-gain assumption for the non-registered deemed disposition (≈ half of a long-held balance). */
const ASSUMED_GAIN_FRACTION = 0.5;

function Line({ label, value, tone = 'ink', strong }: { label: string; value: string; tone?: 'ink' | 'maple' | 'evergreen' | 'faint'; strong?: boolean }) {
  const color = tone === 'maple' ? 'text-maple' : tone === 'evergreen' ? 'text-evergreen' : tone === 'faint' ? 'text-faint' : 'text-ink';
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${strong ? 'border-t border-line pt-2' : ''}`}>
      <span className={`text-sm ${strong ? 'font-medium text-ink' : 'text-muted'}`}>{label}</span>
      <span className={`tnum text-sm ${strong ? 'font-semibold' : ''} ${color}`}>{value}</span>
    </div>
  );
}

export function EstatePanel({ household, scenario, result }: { household: Household; scenario: Scenario; result: ScenarioResult }) {
  const data = useMemo(() => {
    const final = result.rows.at(-1)?.balances ?? { rrsp: 0, tfsa: 0, nonReg: 0, lira: 0 };
    const endAge = result.rows.at(-1)?.ageA ?? scenario.assumptions.endAge;
    // LIRA/LIF is registered: it joins the deemed disposition at death, like RRSP/RRIF.
    const balances: EstateBalances = { registered: final.rrsp + final.lira, nonRegistered: final.nonReg, tfsa: final.tfsa };
    const gain = ASSUMED_GAIN_FRACTION * final.nonReg;
    const province = household.province;
    const totalBalances = balances.registered + balances.nonRegistered + balances.tfsa;

    const noSpouseTax = terminalTax({ registeredBalance: balances.registered, accruedNonRegGain: gain, province, hasSurvivingSpouse: false, ageAtDeath: endAge });
    const couple = household.memberB
      ? coupleEstate({ balances, accruedNonRegGain: gain, province, ageAtDeath: endAge }, { balances, accruedNonRegGain: gain, province, ageAtDeath: endAge })
      : null;

    // Drawdown comparison: meltdown (draw registered first) vs preserve registered.
    const meltdown = runScenario(household, { ...scenario, withdrawalOrder: ['rrsp', 'nonReg', 'tfsa'] }).totals.estateValue;
    const preserve = runScenario(household, { ...scenario, withdrawalOrder: ['nonReg', 'tfsa', 'rrsp'] }).totals.estateValue;

    return { balances, totalBalances, gain, noSpouseTax, couple, endAge, meltdown, preserve };
  }, [household, scenario, result]);

  return (
    <Card>
      <CardHeader eyebrow="At the end" title="Estate after terminal tax" aside={<span className="text-xs text-faint">at age {data.endAge}</span>} />
      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">Winding up the accounts {household.memberB ? '(second death)' : ''}</p>
          <Line label="RRSP / RRIF — deemed disposition" value={money(data.balances.registered)} />
          <Line label={`Non-registered gain (≈${Math.round(ASSUMED_GAIN_FRACTION * 100)}% of balance)`} value={money(data.gain)} tone="faint" />
          <Line label="TFSA — passes tax-free" value={money(data.balances.tfsa)} tone="evergreen" />
          <Line label="Terminal tax" value={`− ${money(data.noSpouseTax)}`} tone="maple" />
          <Line label="After-tax estate" value={money(data.totalBalances - data.noSpouseTax)} strong tone="evergreen" />
        </div>
        <div>
          <p className="eyebrow mb-2">The levers</p>
          <Line label="If a spouse survives (full rollover)" value={money(data.totalBalances)} tone="evergreen" />
          {data.couple ? (
            <>
              <Line label="First death — rolls to survivor" value={`tax ${money(data.couple.firstDeath.terminalTax)}`} tone="faint" />
              <Line label="Second death — full disposition" value={money(data.couple.secondDeath.afterTaxEstateValue)} />
            </>
          ) : null}
          <Line label="Estate · draw registered first" value={money(data.meltdown)} strong />
          <Line label="Estate · preserve registered" value={money(data.preserve)} />
          <p className="mt-3 text-xs leading-snug text-faint">
            Drawing the RRSP/RRIF down earlier shrinks the registered balance taxed at death — the meltdown&apos;s estate
            case. A surviving spouse defers all terminal tax via rollover.
          </p>
        </div>
      </div>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import type { Household, Scenario } from '@/types/planner';
import { OBJECTIVES, type Objective } from '@/lib/optimize';
import { money } from '@/lib/share';
import { Card, CardHeader } from './ui/card';
import { SelectField } from './ui/controls';
import { useOptimizer } from './use-optimizer';

const OBJECTIVE_LABELS: Record<Objective, string> = {
  maxLifetimeAfterTax: 'Maximize lifetime after-tax income',
  maxEstateValue: 'Maximize estate value',
  minLifetimeTax: 'Minimize lifetime tax',
  maxOasRetained: 'Maximize OAS retained',
  maxSustainableSpend: 'Maximize sustainable spending',
  smoothestIncome: 'Smoothest income',
};

const WITHDRAWAL_LABELS: Record<string, string> = { rrsp: 'RRSP', tfsa: 'TFSA', nonReg: 'Non-reg' };

function CompareRow({ label, base, opt, lowerBetter = false }: { label: string; base: number; opt: number; lowerBetter?: boolean }) {
  const delta = opt - base;
  const better = lowerBetter ? delta < 0 : delta > 0;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tnum text-faint">{money(base, { compact: true })}</span>
      <span className={`tnum text-right font-medium ${Math.abs(delta) < 1 ? 'text-ink' : better ? 'text-evergreen' : 'text-maple'}`}>
        {money(opt, { compact: true })}
      </span>
    </div>
  );
}

export function OptimizerPanel({
  household,
  scenario,
  onApply,
}: {
  household: Household;
  scenario: Scenario;
  onApply: (s: Scenario) => void;
}) {
  const [objective, setObjective] = useState<Objective>('maxLifetimeAfterTax');
  const { optimize, running, result } = useOptimizer();

  return (
    <Card>
      <CardHeader eyebrow="Solve for the best plan" title="Optimizer" />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[15rem] flex-1">
            <SelectField label="Objective" value={objective} options={OBJECTIVES.map((o) => ({ value: o, label: OBJECTIVE_LABELS[o] }))} onChange={setObjective} />
          </div>
          <button
            type="button"
            onClick={() => optimize(household, scenario, objective)}
            disabled={running}
            className="rounded border border-evergreen bg-evergreen px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-evergreen-soft disabled:opacity-60"
          >
            {running ? 'Optimizing…' : 'Optimize'}
          </button>
        </div>

        {result ? (
          <div className="rounded border border-line bg-paper/60 p-4">
            <div className="mb-3 grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line pb-2 text-xs">
              <span className="eyebrow">Metric</span>
              <span className="eyebrow text-right">Current</span>
              <span className="eyebrow text-right">Optimized</span>
            </div>
            <CompareRow label="Lifetime after-tax" base={result.baselineTotals.lifetimeAfterTax} opt={result.optimizedTotals.lifetimeAfterTax} />
            <CompareRow label="Lifetime tax" base={result.baselineTotals.lifetimeTax} opt={result.optimizedTotals.lifetimeTax} lowerBetter />
            <CompareRow label="OAS retained" base={result.baselineTotals.oasRetained} opt={result.optimizedTotals.oasRetained} />
            <CompareRow label="Estate at end" base={result.baselineTotals.estateValue} opt={result.optimizedTotals.estateValue} />

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
              <span>
                CPP <strong className="text-ink">{result.cppStartAge}</strong>
              </span>
              <span>
                OAS <strong className="text-ink">{result.oasStartAge}</strong>
              </span>
              <span>
                Meltdown <strong className="text-ink">{result.meltdownMode}</strong>
              </span>
              {result.withdrawalOrder ? (
                <span>
                  Order <strong className="text-ink">{result.withdrawalOrder.map((t) => WITHDRAWAL_LABELS[t] ?? t).join(' → ')}</strong>
                </span>
              ) : null}
              <button type="button" onClick={() => onApply(result.optimizedScenario)} className="ml-auto rounded border border-evergreen px-3 py-1 font-medium text-evergreen hover:bg-evergreen hover:text-paper">
                Apply this plan
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-faint">
            Searches CPP/OAS start ages (exhaustively) and the withdrawal/meltdown knobs for the plan that best meets your objective, then shows it against your current plan.
          </p>
        )}
      </div>
    </Card>
  );
}

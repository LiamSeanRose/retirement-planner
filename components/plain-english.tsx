'use client';

import { useMemo } from 'react';
import type { Household, Scenario, ScenarioResult } from '@/types/planner';
import { narratePlan } from '@/lib/analysis/narrative';
import { Card } from './ui/card';

/** A warm, plain-English read of the plan — the friendly on-ramp before the charts and dials. */
export function PlainEnglish({
  household,
  scenario,
  result,
  successProbability,
}: {
  household: Household;
  scenario: Scenario;
  result: ScenarioResult;
  successProbability?: number;
}) {
  const lines = useMemo(
    () => narratePlan({ household, scenario, result, successProbability }),
    [household, scenario, result, successProbability],
  );
  if (lines.length === 0) return null;
  const [lead, ...rest] = lines;

  return (
    <Card className="animate-rise-in bg-evergreen/[0.035]">
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <p className="eyebrow mb-2.5">Your plan, in plain English</p>
        <p className="font-display text-xl font-medium leading-snug tracking-tight text-ink sm:text-2xl">{lead}</p>
        <div className="mt-3.5 max-w-2xl space-y-2.5">
          {rest.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted">
              {line}
            </p>
          ))}
        </div>
      </div>
    </Card>
  );
}

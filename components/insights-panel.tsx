'use client';

import { useMemo } from 'react';
import type { Household, Scenario } from '@/types/planner';
import { generateInsights } from '@/lib/analysis/insights';
import { Card, CardHeader } from './ui/card';

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-evergreen/10 text-evergreen',
  medium: 'bg-gold/10 text-gold',
  low: 'bg-line/60 text-faint',
};

export function InsightsPanel({ household, scenario }: { household: Household; scenario: Scenario }) {
  const report = useMemo(() => generateInsights(household, scenario), [household, scenario]);

  return (
    <Card>
      <CardHeader
        eyebrow="What you could do"
        title="Recommendations"
        aside={<span className="text-xs text-faint">{report.insights.length ? 'ranked by impact' : ''}</span>}
      />
      {report.insights.length === 0 ? (
        <p className="px-5 py-6 text-sm text-faint">
          Your current plan looks well-tuned — no change moves the needle by more than a rounding amount. Try a different
          retirement age, spending level, or CPP/OAS timing on the left to surface trade-offs.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {report.insights.map((ins) => (
            <li key={ins.id} className="px-5 py-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-medium text-ink">{ins.title}</p>
                <span className={`tnum shrink-0 text-sm font-semibold ${ins.impact >= 0 ? 'text-evergreen' : 'text-maple'}`}>
                  {ins.impactLabel}
                </span>
              </div>
              <div className="mt-1 flex items-start justify-between gap-4">
                <p className="text-xs leading-snug text-muted">{ins.detail}</p>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide ${CONFIDENCE_STYLE[ins.confidence] ?? CONFIDENCE_STYLE.low}`}>
                  {ins.confidence}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-5 py-3 text-xs text-faint">
        Conditional on {report.assumptions.province}, {report.assumptions.inflationPct}% inflation, and spending{' '}
        {report.assumptions.targetAnnualSpending ? `~$${Math.round(report.assumptions.targetAnnualSpending).toLocaleString('en-CA')}/yr` : 'as set'} to age {report.assumptions.endAge}.
      </p>
    </Card>
  );
}

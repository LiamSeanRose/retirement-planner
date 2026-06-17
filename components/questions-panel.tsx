'use client';

import { useMemo } from 'react';
import type { Household, Scenario } from '@/types/planner';
import { answerPlanQuestions } from '@/lib/analysis/solve';
import { money } from '@/lib/share';
import { Card, CardHeader } from './ui/card';

type Tone = 'evergreen' | 'maple' | 'ink';

function QA({ q, a, sub, tone }: { q: string; a: string; sub: string; tone: Tone }) {
  const color = tone === 'evergreen' ? 'text-evergreen' : tone === 'maple' ? 'text-maple' : 'text-ink';
  return (
    <div className="bg-surface p-5">
      <p className="text-sm font-medium text-muted">{q}</p>
      <p className={`mt-1.5 font-display text-2xl font-semibold leading-none ${color}`}>{a}</p>
      <p className="mt-2 text-xs leading-relaxed text-faint">{sub}</p>
    </div>
  );
}

const m = (n: number) => money(n, { compact: true });
const yrs = (n: number) => `${n} year${n === 1 ? '' : 's'}`;

export function QuestionsPanel({ household, scenario }: { household: Household; scenario: Scenario }) {
  const ans = useMemo(() => answerPlanQuestions(household, scenario), [household, scenario]);
  const endAge = scenario.assumptions.endAge;

  const room = ans.maxSpend - ans.targetSpend;
  const spendSub =
    room >= 0
      ? `You're targeting ${m(ans.targetSpend)} — about ${m(room)}/yr of headroom.`
      : `That's ${m(-room)}/yr under your ${m(ans.targetSpend)} target — trim spending or save a bit more.`;

  const ageAnswer = ans.earliestAge === null ? `After ${ans.targetAge}` : `Age ${ans.earliestAge}`;
  const ageSub =
    ans.earliestAge === null
      ? `At ${m(ans.targetSpend)}/yr your savings don't quite sustain retiring at ${ans.targetAge} — retire a little later or spend less.`
      : ans.earliestAge === ans.targetAge
        ? `Your target age. Retiring earlier wouldn't sustain ${m(ans.targetSpend)}/yr.`
        : `You could go ${yrs(ans.targetAge - ans.earliestAge)} earlier than planned and still fund ${m(ans.targetSpend)}/yr.`;

  return (
    <Card>
      <CardHeader eyebrow="The answers people actually want" title="Your questions, answered" />
      <div className="grid gap-px bg-line sm:grid-cols-3">
        <QA q="How much can you spend?" a={`${m(ans.maxSpend)}/yr`} sub={spendSub} tone={room >= 0 ? 'evergreen' : 'maple'} />
        <QA q="When can you retire?" a={ageAnswer} sub={ageSub} tone={ans.earliestAge !== null ? 'evergreen' : 'maple'} />
        <QA q="If returns disappoint?" a={`${m(ans.maxSpendLowerReturns)}/yr`} sub="The most you could safely spend if returns came in 1% lower than assumed." tone="ink" />
      </div>
      <p className="border-t border-line px-5 py-3 text-xs leading-snug text-faint">
        Computed exactly from your pension, CPP/OAS, tax, and portfolio — on the expected (median) path, to age {endAge}. Not the rough 4% rule.
      </p>
    </Card>
  );
}

'use client';

import type { ScenarioResult } from '@/types/planner';
import { money } from '@/lib/share';

function Stat({ label, value, tone = 'ink', sub }: { label: string; value: string; tone?: 'ink' | 'maple' | 'evergreen'; sub?: string }) {
  const color = tone === 'maple' ? 'text-maple' : tone === 'evergreen' ? 'text-evergreen' : 'text-ink';
  return (
    <div className="border-l border-line pl-3">
      <p className="eyebrow mb-1">{label}</p>
      <p className={`font-display text-xl font-semibold leading-tight ${color} tnum`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-faint">{sub}</p> : null}
    </div>
  );
}

export function MetricsSummary({ result }: { result: ScenarioResult }) {
  const { rows, totals } = result;
  const afterTaxAt = (age: number) => rows.find((r) => r.ageA === age)?.afterTax;
  const endAge = rows.length ? rows[rows.length - 1].ageA : 0;
  const fmt = (n: number | undefined) => (n === undefined ? '—' : money(n, { compact: true }));

  return (
    <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4">
      <Stat label="After-tax income · 60" value={fmt(afterTaxAt(60))} />
      <Stat label="After-tax income · 65" value={fmt(afterTaxAt(65))} sub="bridge has ended" />
      <Stat label="After-tax income · 70" value={fmt(afterTaxAt(70))} />
      <Stat
        label="Plan sustains"
        value={totals.lastsToEndAge ? `to ${endAge}` : 'shortfall'}
        tone={totals.lastsToEndAge ? 'evergreen' : 'maple'}
      />
      <Stat label="Lifetime after-tax" value={fmt(totals.lifetimeAfterTax)} tone="evergreen" />
      <Stat label="Lifetime tax" value={fmt(totals.lifetimeTax)} tone="maple" />
      <Stat label="OAS retained" value={fmt(totals.oasRetained)} />
      <Stat label="Estate at end (after tax)" value={fmt(totals.estateValue)} />
    </div>
  );
}

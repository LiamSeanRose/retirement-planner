'use client';

import type { MonteCarloResult, ScenarioResult } from '@/types/planner';
import { money } from '@/lib/share';
import { Card, CardHeader } from './ui/card';
import { ConfidenceDial } from './confidence-dial';
import { MetricsSummary } from './metrics-summary';
import { CashFlowChart } from './charts/cash-flow-chart';
import { NetWorthChart } from './charts/net-worth-chart';
import { TaxOasChart } from './charts/tax-oas-chart';

function BigStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      <p className="font-display text-2xl font-semibold leading-none text-ink tnum">{value}</p>
      {sub ? <p className="mt-1 text-xs text-faint">{sub}</p> : null}
    </div>
  );
}

export function AnalyticsPanel({
  result,
  mc,
  mcLoading,
}: {
  result: ScenarioResult;
  mc: MonteCarloResult | null;
  mcLoading: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Hero: confidence + headline distribution numbers */}
      <Card className="animate-rise-in">
        <CardHeader eyebrow="Monte Carlo" title="Plan confidence" aside={<span className="text-xs text-faint">{mcLoading ? 'simulating…' : 'live'}</span>} />
        <div className="grid items-center gap-6 p-6 sm:grid-cols-[auto_1fr]">
          <ConfidenceDial value={mc?.probabilityOfSuccess ?? 0} loading={mcLoading} />
          <div className="grid grid-cols-2 gap-6">
            <BigStat label="Median estate at end" value={mc ? money(mc.estateValue.p50, { compact: true }) : '—'} sub="after terminal tax" />
            <BigStat label="Median lifetime tax" value={mc ? money(mc.lifetimeTax.p50, { compact: true }) : '—'} />
            <BigStat label="Estate · 5th–95th" value={mc ? `${money(mc.estateValue.p5, { compact: true })} – ${money(mc.estateValue.p95, { compact: true })}` : '—'} sub="range across market paths" />
            <BigStat label="Deterministic estate" value={money(result.totals.estateValue, { compact: true })} sub="single expected path" />
          </div>
        </div>
      </Card>

      {/* Signature: lifetime cash-flow by source */}
      <Card>
        <CardHeader eyebrow="The signature view" title="Lifetime income by source" aside={<span className="text-xs text-faint">to age {result.rows.at(-1)?.ageA}</span>} />
        <div className="p-5">
          <CashFlowChart rows={result.rows} />
        </div>
      </Card>

      {/* Metrics */}
      <Card>
        <CardHeader eyebrow="At a glance" title="Plan summary" />
        <div className="p-5">
          <MetricsSummary result={result} />
        </div>
      </Card>

      {/* Secondary charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Balances" title="Net worth over time" />
          <div className="p-5">
            <NetWorthChart rows={result.rows} />
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="The tax story" title="Tax paid & OAS clawed back" />
          <div className="p-5">
            <TaxOasChart rows={result.rows} />
          </div>
        </Card>
      </div>
    </div>
  );
}

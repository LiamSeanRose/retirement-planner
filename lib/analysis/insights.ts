/**
 * Insights / recommendations engine (`/lib/analysis/insights.ts`).
 *
 * From a Household + Scenario, run the read-only engine to produce plain-language, DOLLAR-QUANTIFIED,
 * ranked recommendations and warnings (plan §9/§10). Each insight is a serializable plain object the
 * UI renders directly: a title, a dollar impact (signed — positive = gain from acting, negative =
 * dollars at risk), a confidence, and the lever to pull. Pure: no React/IO; never edits the engine.
 */

import type { AccountType, Household, Scenario, ScenarioResult } from '../../types/planner';
import { runScenario } from '../engine';
import { breakEven } from './index';

export type Confidence = 'high' | 'medium' | 'low';

export interface Insight {
  /** Stable machine key. */
  id: string;
  /** Plain-language headline. */
  title: string;
  /** One-line explanation. */
  detail: string;
  /** Lifetime dollar impact, signed: positive = gain from acting; negative = dollars at risk. */
  impact: number;
  /** Pre-formatted dollar label for the UI. */
  impactLabel: string;
  confidence: Confidence;
  /** The Scenario lever to pull (or 'none' for a pure warning). */
  lever: string;
}

export interface InsightsReport {
  /** Insights ranked by |impact| descending. */
  insights: Insight[];
  /** The assumptions the figures are conditional on (stated for the UI). */
  assumptions: {
    province: string;
    inflationPct: number;
    indexingPct: number;
    endAge: number;
    targetAnnualSpending: number;
  };
}

/** Suppress insights smaller than this (avoid noise). */
const MIN_IMPACT = 500;

const WITHDRAWAL_ORDERS: AccountType[][] = [
  ['nonReg', 'rrsp', 'tfsa'],
  ['nonReg', 'tfsa', 'rrsp'],
  ['rrsp', 'nonReg', 'tfsa'],
  ['rrsp', 'tfsa', 'nonReg'],
  ['tfsa', 'nonReg', 'rrsp'],
  ['tfsa', 'rrsp', 'nonReg'],
];

function money(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString('en-CA');
}

const withCpp = (s: Scenario, age: number): Scenario => ({ ...s, cppStartAge: { ...s.cppStartAge, memberA: age } });
const withOas = (s: Scenario, age: number): Scenario => ({ ...s, oasStartAge: { ...s.oasStartAge, memberA: age } });
const withOrder = (s: Scenario, order: AccountType[]): Scenario => ({ ...s, withdrawalOrder: order });

/** Confidence in a timing deferral: high when the break-even is comfortably before the end age. */
function timingConfidence(breakEvenAge: number | undefined, endAge: number): Confidence {
  if (breakEvenAge === undefined) return 'medium';
  if (breakEvenAge < endAge - 5) return 'high';
  if (breakEvenAge < endAge) return 'medium';
  return 'low';
}

/**
 * Produce ranked, dollar-quantified insights for a household's plan: CPP/OAS timing, withdrawal
 * sequencing (the RRSP meltdown), the OAS-clawback exposure, and a sustainability warning.
 */
export function generateInsights(household: Household, scenario: Scenario): InsightsReport {
  const base = runScenario(household, scenario);
  const baseLat = base.totals.lifetimeAfterTax;
  const insights: Insight[] = [];

  // 1. CPP timing — the start age (60–70) that maximises lifetime after-tax income.
  {
    const current = scenario.cppStartAge.memberA;
    let best = { age: current, lat: baseLat };
    for (let age = 60; age <= 70; age++) {
      const lat = runScenario(household, withCpp(scenario, age)).totals.lifetimeAfterTax;
      if (lat > best.lat) best = { age, lat };
    }
    const impact = best.lat - baseLat;
    if (best.age !== current && impact >= MIN_IMPACT) {
      const be = breakEven(household, scenario).cppBreakEvenAge;
      insights.push({
        id: 'cppTiming',
        title: best.age > current ? `Delay CPP to ${best.age} (from ${current})` : `Start CPP earlier at ${best.age} (from ${current})`,
        detail: `Starting CPP at ${best.age} adds ${money(impact)} of lifetime after-tax income${be !== undefined ? ` (break-even age ~${be.toFixed(0)})` : ''}.`,
        impact,
        impactLabel: `${money(impact)} more lifetime after-tax`,
        confidence: timingConfidence(be, scenario.assumptions.endAge),
        lever: 'cppStartAge',
      });
    }
  }

  // 2. OAS timing — the start age (65–70) that maximises lifetime after-tax income.
  {
    const current = scenario.oasStartAge.memberA;
    let best = { age: current, lat: baseLat, oasRetained: base.totals.oasRetained };
    for (let age = 65; age <= 70; age++) {
      const r = runScenario(household, withOas(scenario, age));
      if (r.totals.lifetimeAfterTax > best.lat) best = { age, lat: r.totals.lifetimeAfterTax, oasRetained: r.totals.oasRetained };
    }
    const impact = best.lat - baseLat;
    if (best.age !== current && impact >= MIN_IMPACT) {
      const be = breakEven(household, scenario).oasBreakEvenAge;
      const oasGain = best.oasRetained - base.totals.oasRetained;
      insights.push({
        id: 'oasTiming',
        title: `Delay OAS to ${best.age} (from ${current})`,
        detail: `Deferring OAS to ${best.age} adds ${money(impact)} lifetime after-tax and ${money(oasGain)} more OAS retained${be !== undefined ? ` (break-even age ~${be.toFixed(0)})` : ''}.`,
        impact,
        impactLabel: `${money(impact)} more lifetime after-tax`,
        confidence: timingConfidence(be, scenario.assumptions.endAge),
        lever: 'oasStartAge',
      });
    }
  }

  // 3. Withdrawal sequencing (the RRSP meltdown) — the order that maximises lifetime after-tax income.
  {
    let best = { order: scenario.withdrawalOrder, lat: baseLat, tax: base.totals.lifetimeTax, estate: base.totals.estateValue };
    for (const order of WITHDRAWAL_ORDERS) {
      const r = runScenario(household, withOrder(scenario, order));
      if (r.totals.lifetimeAfterTax > best.lat) best = { order, lat: r.totals.lifetimeAfterTax, tax: r.totals.lifetimeTax, estate: r.totals.estateValue };
    }
    const impact = best.lat - baseLat;
    if (best.order !== undefined && impact >= MIN_IMPACT) {
      const taxSaved = base.totals.lifetimeTax - best.tax;
      insights.push({
        id: 'withdrawalSequencing',
        title: `Draw accounts in the order ${best.order.join(' → ')}`,
        detail: `This decumulation order (an RRSP meltdown) adds ${money(impact)} lifetime after-tax${taxSaved > 0 ? ` and saves ${money(taxSaved)} lifetime tax` : ''}.`,
        impact,
        impactLabel: `${money(impact)} more lifetime after-tax`,
        confidence: 'medium',
        lever: 'withdrawalOrder',
      });
    }
  }

  // 4. OAS clawback exposure — dollars lost to the recovery tax under the current plan (a warning).
  {
    const clawback = base.rows.reduce((s, r) => s + r.oasClawback, 0);
    if (clawback >= MIN_IMPACT) {
      insights.push({
        id: 'oasClawback',
        title: `You lose ${money(clawback)} to the OAS clawback`,
        detail: `Over the plan, ${money(clawback)} of OAS is recovered. Funding a high-income year from the TFSA (excluded from net income) keeps you under the threshold.`,
        impact: -clawback,
        impactLabel: `${money(clawback)} of OAS recovered`,
        confidence: 'high',
        lever: 'withdrawalOrder',
      });
    }
  }

  // 5. Sustainability — does the money last to the end age? (a warning when it does not).
  if (!base.totals.lastsToEndAge) {
    const depleted = base.rows.find((r) => r.netWorth <= 0);
    const atAge = depleted ? depleted.ageA : scenario.assumptions.endAge;
    const annualGap = scenario.assumptions.targetAnnualSpending ?? 0;
    insights.push({
      id: 'sustainability',
      title: `Plan may run short around age ${atAge}`,
      detail: `Spending is not sustained to the end age (${scenario.assumptions.endAge}). Lower the spend, delay retirement, or defer CPP/OAS to close the gap.`,
      impact: -Math.max(annualGap, MIN_IMPACT),
      impactLabel: `~${money(annualGap)}/yr of spending at risk`,
      confidence: 'high',
      lever: 'assumptions.targetAnnualSpending',
    });
  }

  insights.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return {
    insights,
    assumptions: {
      province: household.province,
      inflationPct: scenario.assumptions.inflationPct,
      indexingPct: scenario.assumptions.indexingPct,
      endAge: scenario.assumptions.endAge,
      targetAnnualSpending: scenario.assumptions.targetAnnualSpending ?? 0,
    },
  };
}

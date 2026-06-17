/**
 * Engine entry point (`/lib/engine`) — the public API the UI calls.
 *
 * Composes the tested leaf modules into two end-to-end runs:
 *   - `runScenario`           — one deterministic projection over a flat return path.
 *   - `runMonteCarloScenario` — N sampled runs aggregated into a probability of success + bands.
 *
 * This module only COMPOSES (it imports the engines read-only; it never edits them). It supplies
 * the two integration seams the leaf modules left open: the real tax engine as the projection's
 * injected `TaxFn`, and the projection itself as the Monte Carlo layer's injected `makeRun`.
 *
 * Return assumptions: `Scenario.assumptions` carries no scenario-level return — returns live on each
 * account's `riskProfile`. The projection applies a single return to all balances, so we collapse
 * the accounts into ONE balance-weighted return/volatility (correlation ignored — consistent with
 * the single-path projection; per-asset paths are a later refinement).
 */

import type { Account, Household, MonteCarloResult, Scenario, ScenarioResult } from '../../types/planner';
import { DEFAULT_CONFIG, type YearConfig } from '../config';
import { flatPath } from '../paths';
import { runProjection, type TaxFn } from '../projection';
import { runMonteCarlo, type MakeRun } from '../montecarlo';
import { totalTax } from '../tax';

/**
 * The real tax seam: the projection asks for total federal + provincial tax on the year's taxable
 * income; we answer with `lib/tax`. Single-filer (the projection is single-person — couple-mode
 * splitting via `householdTaxWithSplitting` plugs in here when the projection models a spouse).
 */
const taxAdapter: TaxFn = (ctx) =>
  totalTax(ctx.taxableIncome, ctx.province, {
    age: ctx.age,
    netIncome: ctx.taxableIncome,
    eligiblePensionIncome: ctx.pensionIncome,
  });

/** Number of projected years = retirement age … end age, inclusive (matches the projection loop). */
function projectionYears(household: Household, scenario: Scenario): number {
  return Math.max(0, scenario.assumptions.endAge - household.memberA.targetRetirementAge + 1);
}

/** Collapse the accounts into one balance-weighted return/volatility (percent), for the single-path model. */
export function blendedRiskProfile(accounts: Account[]): { meanPct: number; volPct: number } {
  let totalBalance = 0;
  let weightedReturn = 0;
  let weightedVol = 0;
  for (const a of accounts) {
    totalBalance += a.currentBalance;
    weightedReturn += a.riskProfile.expectedReturn * a.currentBalance;
    weightedVol += a.riskProfile.volatility * a.currentBalance;
  }
  if (totalBalance > 0) return { meanPct: weightedReturn / totalBalance, volPct: weightedVol / totalBalance };
  // No balances to weight by: fall back to a simple average (or 0 with no accounts).
  if (accounts.length === 0) return { meanPct: 0, volPct: 0 };
  const avg = (sel: (a: Account) => number) => accounts.reduce((s, a) => s + sel(a), 0) / accounts.length;
  return { meanPct: avg((a) => a.riskProfile.expectedReturn), volPct: avg((a) => a.riskProfile.volatility) };
}

/**
 * One deterministic projection of `household` under `scenario`: build a flat return path from the
 * blended account return + the scenario's inflation/indexing, taxed by the real tax engine.
 */
export function runScenario(household: Household, scenario: Scenario, config: YearConfig = DEFAULT_CONFIG): ScenarioResult {
  const path = flatPath({
    years: projectionYears(household, scenario),
    returnPct: blendedRiskProfile(household.accounts).meanPct,
    inflationPct: scenario.assumptions.inflationPct,
    indexingPct: scenario.assumptions.indexingPct,
  });
  return runProjection(household, scenario, path, taxAdapter, config);
}

/**
 * Monte Carlo over the same projection: the aggregator samples each run's return path from the
 * blended Normal(meanPct, volPct) and we run the real projection over it. Returns the canonical §12
 * `MonteCarloResult` — relabelling the aggregator's 0-based year bands to ages. Reproducible under
 * a fixed `seed`. After-tax bands are deferred (the injected run reports net worth, not an after-tax
 * series; adding it needs the Monte Carlo `RunOutcome` extended — a follow-up).
 */
export function runMonteCarloScenario(
  household: Household,
  scenario: Scenario,
  seed = 0,
  config: YearConfig = DEFAULT_CONFIG,
): MonteCarloResult {
  const retirementAge = household.memberA.targetRetirementAge;
  const years = projectionYears(household, scenario);
  const { meanPct, volPct } = blendedRiskProfile(household.accounts);

  const makeRun: MakeRun = (path) => {
    const result = runProjection(household, scenario, path, taxAdapter, config);
    return {
      netWorthByYear: result.rows.map((r) => r.netWorth),
      lastsToEndAge: result.totals.lastsToEndAge,
      estateValue: result.totals.estateValue,
      lifetimeTax: result.totals.lifetimeTax,
    };
  };

  const mc = runMonteCarlo(makeRun, {
    years,
    runs: scenario.assumptions.runs,
    seed,
    distribution: { meanPct, volPct },
    assumptions: { inflationPct: scenario.assumptions.inflationPct, indexingPct: scenario.assumptions.indexingPct },
  });

  return {
    probabilityOfSuccess: mc.probabilityOfSuccess,
    netWorth: mc.netWorth.map((b) => ({ age: retirementAge + b.year, p5: b.p5, p25: b.p25, p50: b.p50, p75: b.p75, p95: b.p95 })),
    afterTax: [], // deferred — see note above
    estateValue: { p5: mc.estateValue.p5, p50: mc.estateValue.p50, p95: mc.estateValue.p95, mean: mc.estateValue.mean },
    lifetimeTax: { p5: mc.lifetimeTax.p5, p50: mc.lifetimeTax.p50, p95: mc.lifetimeTax.p95, mean: mc.lifetimeTax.mean },
  };
}

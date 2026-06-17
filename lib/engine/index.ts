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

import type {
  Account,
  AccountType,
  Household,
  MonteCarloResult,
  ReturnPathByType,
  Scenario,
  ScenarioResult,
} from '../../types/planner';
import { DEFAULT_CONFIG, type YearConfig } from '../config';
import { runProjection, type TaxFn } from '../projection';
import { runMonteCarlo, type MakeRun } from '../montecarlo';
import { householdTaxWithSplitting, totalTax } from '../tax';

/**
 * The real tax seam: the projection asks for the year's total federal + provincial tax; we answer
 * with `lib/tax`. For a couple (both spouses alive) the projection hands over per-member profiles
 * and we apply the automated pension split (`householdTaxWithSplitting`); otherwise we file a single
 * return. The per-member profile shape matches `lib/tax`'s `TaxProfile` exactly.
 */
const taxAdapter: TaxFn = (ctx) => {
  if (ctx.filingStatus === 'couple' && ctx.members) {
    return householdTaxWithSplitting(ctx.members[0], ctx.members[1], ctx.province).tax;
  }
  return totalTax(ctx.taxableIncome, ctx.province, {
    age: ctx.age,
    netIncome: ctx.taxableIncome,
    eligiblePensionIncome: ctx.pensionIncome,
  });
};

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

/** Balance-weighted return/volatility (percent) for EACH account type — drives per-account growth. */
export function blendedRiskProfileByType(accounts: Account[]): Record<AccountType, { meanPct: number; volPct: number }> {
  const forType = (type: AccountType) => blendedRiskProfile(accounts.filter((a) => a.type === type));
  return { rrsp: forType('rrsp'), tfsa: forType('tfsa'), nonReg: forType('nonReg') };
}

/**
 * One deterministic projection of `household` under `scenario`: build a flat path whose returns are
 * PER ACCOUNT TYPE (each type's balance-weighted expected return), with the scenario's
 * inflation/indexing, taxed by the real tax engine.
 */
export function runScenario(household: Household, scenario: Scenario, config: YearConfig = DEFAULT_CONFIG): ScenarioResult {
  const years = projectionYears(household, scenario);
  const byType = blendedRiskProfileByType(household.accounts);
  const blended = blendedRiskProfile(household.accounts);
  const { inflationPct, indexingPct } = scenario.assumptions;
  const path: ReturnPathByType = Array.from({ length: years }, () => ({
    returnPct: blended.meanPct, // fallback for any consumer that ignores returnByType
    inflationPct,
    indexingPct,
    returnByType: { rrsp: byType.rrsp.meanPct, tfsa: byType.tfsa.meanPct, nonReg: byType.nonReg.meanPct },
  }));
  return runProjection(household, scenario, path, taxAdapter, config);
}

/**
 * Run one projection over a CALLER-SUPPLIED return path (stress scenarios, what-ifs, replays). The
 * path may carry per-type returns (`returnByType`) or just a single `returnPct` per year. Same tax
 * seam as `runScenario`; `runScenario` is the flat-path convenience over this.
 */
export function runScenarioOverPath(
  household: Household,
  scenario: Scenario,
  path: ReturnPathByType,
  config: YearConfig = DEFAULT_CONFIG,
): ScenarioResult {
  return runProjection(household, scenario, path, taxAdapter, config);
}

/**
 * Monte Carlo over the same projection: the aggregator samples each run's return path PER ACCOUNT
 * TYPE (independent draws from each type's Normal(meanPct, volPct)) and we run the real projection
 * over it. Returns the canonical §12 `MonteCarloResult` with net-worth AND after-tax fan-chart bands
 * (0-based year bands relabelled to ages). Reproducible under a fixed `seed`.
 */
export function runMonteCarloScenario(
  household: Household,
  scenario: Scenario,
  seed = 0,
  config: YearConfig = DEFAULT_CONFIG,
): MonteCarloResult {
  const retirementAge = household.memberA.targetRetirementAge;
  const years = projectionYears(household, scenario);
  const distributionByType = blendedRiskProfileByType(household.accounts);

  const makeRun: MakeRun = (path) => {
    const result = runProjection(household, scenario, path, taxAdapter, config);
    return {
      netWorthByYear: result.rows.map((r) => r.netWorth),
      afterTaxByYear: result.rows.map((r) => r.afterTax),
      lastsToEndAge: result.totals.lastsToEndAge,
      estateValue: result.totals.estateValue,
      lifetimeTax: result.totals.lifetimeTax,
    };
  };

  const mc = runMonteCarlo(makeRun, {
    years,
    runs: scenario.assumptions.runs,
    seed,
    distributionByType,
    assumptions: { inflationPct: scenario.assumptions.inflationPct, indexingPct: scenario.assumptions.indexingPct },
  });

  const toAgeBand = (b: { year: number; p5: number; p25: number; p50: number; p75: number; p95: number }) => ({
    age: retirementAge + b.year,
    p5: b.p5,
    p25: b.p25,
    p50: b.p50,
    p75: b.p75,
    p95: b.p95,
  });
  return {
    probabilityOfSuccess: mc.probabilityOfSuccess,
    netWorth: mc.netWorth.map(toAgeBand),
    afterTax: mc.afterTax.map(toAgeBand),
    estateValue: { p5: mc.estateValue.p5, p50: mc.estateValue.p50, p95: mc.estateValue.p95, mean: mc.estateValue.mean },
    lifetimeTax: { p5: mc.lifetimeTax.p5, p50: mc.lifetimeTax.p50, p95: mc.lifetimeTax.p95, mean: mc.lifetimeTax.mean },
  };
}

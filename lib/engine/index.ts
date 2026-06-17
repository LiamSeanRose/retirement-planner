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
import { runMonteCarlo, percentile, type MakeRun } from '../montecarlo';
import { householdTaxWithSplitting, totalTax } from '../tax';
import { buildCohorts, HISTORICAL_SERIES, SP500_TOTAL_RETURN } from '../historical';

/**
 * The real tax seam: the projection asks for the year's total federal + provincial tax; we answer
 * with `lib/tax`. For a couple (both spouses alive) the projection hands over per-member profiles
 * and we apply the automated pension split (`householdTaxWithSplitting`); otherwise we file a single
 * return.
 *
 * BRACKET INDEXING: tax brackets, credits, and thresholds are CPI-indexed annually in reality. The
 * projection hands us `bracketIndexFactor` = (1+CPI)^years-since-retirement; we DEFLATE the year's
 * nominal income by it, tax at the dated (config-year) brackets, then RE-INFLATE the tax by the same
 * factor. Because the tax function is piecewise-linear and homogeneous in (income, thresholds), this
 * is exactly equivalent to indexing every bracket/credit/threshold by the factor — neutralising the
 * bracket creep that fixed brackets impose on inflating income. (Minor known wrinkle: the Ontario
 * Health Premium isn't indexed in law, so it's slightly over-stated in late years — second-order vs
 * the total; see lib/ENGINE-NOTES.)
 */
const taxAdapter: TaxFn = (ctx) => {
  const f = ctx.bracketIndexFactor && ctx.bracketIndexFactor > 0 ? ctx.bracketIndexFactor : 1;
  if (ctx.filingStatus === 'couple' && ctx.members) {
    const deflate = (m: typeof ctx.members[0]) => ({
      age: m.age,
      ordinaryIncome: m.ordinaryIncome / f,
      psppPension: m.psppPension / f,
      rrifIncome: m.rrifIncome / f,
    });
    return f * householdTaxWithSplitting(deflate(ctx.members[0]), deflate(ctx.members[1]), ctx.province).tax;
  }
  return (
    f *
    totalTax(ctx.taxableIncome / f, ctx.province, {
      age: ctx.age,
      netIncome: ctx.taxableIncome / f,
      eligiblePensionIncome: ctx.pensionIncome / f,
    })
  );
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
  return { rrsp: forType('rrsp'), tfsa: forType('tfsa'), nonReg: forType('nonReg'), lira: forType('lira') };
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
    returnByType: { rrsp: byType.rrsp.meanPct, tfsa: byType.tfsa.meanPct, nonReg: byType.nonReg.meanPct, lira: byType.lira.meanPct },
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
 *
 * `correlation` ∈ [0, 1] (optional, default 0) links the per-account return draws via a shared
 * market factor, so a market-wide down year hits accounts together (fatter tail risk). 0 keeps the
 * prior independent-draw behaviour exactly. Appended last to keep the public signature additive.
 */
export function runMonteCarloScenario(
  household: Household,
  scenario: Scenario,
  seed = 0,
  config: YearConfig = DEFAULT_CONFIG,
  correlation = 0,
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
    correlation,
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

/** Outcome of replaying the plan over ONE historical cohort (one "retire in year X" window). */
export interface CohortOutcome {
  /** Calendar year this cohort retired into. */
  startYear: number;
  /** Did the money last to the end age? */
  lastsToEndAge: boolean;
  /** After-tax estate at the end of the window (terminal tax applied). */
  estateValue: number;
  /** Total lifetime tax over the window. */
  lifetimeTax: number;
  /** Age at which net worth first hit zero — present only when the cohort failed. */
  depletionAge?: number;
}

/** Aggregate of a historical backtest: the plan replayed over every dated start year that fits. */
export interface HistoricalBacktestResult {
  seriesId: string;
  seriesLabel: string;
  source: string;
  /** Projection horizon (years) — the cohort window length. */
  years: number;
  /** Number of cohorts (start years) tested. */
  cohorts: number;
  /** Share of cohorts whose money lasted to the end age, in [0, 1]. */
  successRate: number;
  /** The worst start year (a failure with the lowest estate, else the lowest estate overall). */
  worstStartYear: number | null;
  /** Estate distribution across cohorts. */
  estate: { p5: number; p50: number; p95: number; min: number; max: number };
  /** Per-cohort detail, in start-year order — drives the "retire-in-year" filmstrip. */
  outcomes: CohortOutcome[];
}

/**
 * Replay the plan over real market history. For each dated start year that fits the horizon, build a
 * cohort whose returns are the historical sequence recentered/rescaled to the plan's own per-account
 * return and volatility (see `/lib/historical`), run the real projection over it, then aggregate the
 * success rate, the worst starting year, and the estate distribution. Pure and deterministic — a
 * replay over a fixed record, no RNG. Fast enough for the main thread (≈100 cheap projections).
 */
export function runHistoricalBacktest(
  household: Household,
  scenario: Scenario,
  config: YearConfig = DEFAULT_CONFIG,
  seriesId: string = SP500_TOTAL_RETURN.id,
): HistoricalBacktestResult {
  const years = projectionYears(household, scenario);
  const series = HISTORICAL_SERIES.find((s) => s.id === seriesId) ?? SP500_TOTAL_RETURN;
  const distributionByType = blendedRiskProfileByType(household.accounts);
  const cohorts = buildCohorts(series, years, distributionByType, {
    inflationPct: scenario.assumptions.inflationPct,
    indexingPct: scenario.assumptions.indexingPct,
  });

  const outcomes: CohortOutcome[] = cohorts.map((c) => {
    const res = runScenarioOverPath(household, scenario, c.path, config);
    return {
      startYear: c.startYear,
      lastsToEndAge: res.totals.lastsToEndAge,
      estateValue: res.totals.estateValue,
      lifetimeTax: res.totals.lifetimeTax,
      depletionAge: res.totals.lastsToEndAge ? undefined : res.rows.find((r) => r.netWorth <= 1)?.ageA,
    };
  });

  const n = outcomes.length;
  const successRate = n === 0 ? 0 : outcomes.filter((o) => o.lastsToEndAge).length / n;
  // Worst cohort: failures rank ahead of survivors (false < true), then lowest estate within each group.
  const worst = n === 0 ? null : [...outcomes].sort((a, b) => Number(a.lastsToEndAge) - Number(b.lastsToEndAge) || a.estateValue - b.estateValue)[0];
  const estates = outcomes.map((o) => o.estateValue).sort((a, b) => a - b);

  return {
    seriesId: series.id,
    seriesLabel: series.label,
    source: series.source,
    years,
    cohorts: n,
    successRate,
    worstStartYear: worst ? worst.startYear : null,
    estate: {
      p5: percentile(estates, 0.05),
      p50: percentile(estates, 0.5),
      p95: percentile(estates, 0.95),
      min: estates[0] ?? 0,
      max: estates[estates.length - 1] ?? 0,
    },
    outcomes,
  };
}

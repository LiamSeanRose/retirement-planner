/**
 * Scenario analysis (`/lib/analysis`) — the what-if comparison layer (plan §10 what-if, §13).
 *   - `compareScenarios` — a metrics diff table (one row per metric) across 2–4 overlaid scenarios.
 *   - `breakEven`        — CPP and OAS break-even ages, by running start-age variants through the
 *     read-only engine and finding where the deferred option's cumulative benefit overtakes the
 *     early option's.
 *
 * Pure: no React/IO. Calls only the current 2-arg public engine API (`runScenario`); never edits the
 * engine or projection.
 */

import type { Household, Scenario, ScenarioResult, YearRow } from '../../types/planner';
import { runScenario } from '../engine';

// --- Scenario comparison diff table -------------------------------------------------------------

export interface MetricRow {
  /** Stable machine key. */
  metric: string;
  /** Human-readable label. */
  label: string;
  /** One value per compared scenario, in input order (null where the metric doesn't apply). */
  values: Array<number | boolean | null>;
}

export interface ComparisonTable {
  scenarioCount: number;
  rows: MetricRow[];
}

/** After-tax (net spendable) income in the projection year the member is `age` — null if not projected. */
function afterTaxAtAge(result: ScenarioResult, age: number): number | null {
  const row = result.rows.find((r) => r.ageA === age);
  return row ? row.afterTax : null;
}

interface MetricDef {
  metric: string;
  label: string;
  get: (r: ScenarioResult) => number | boolean | null;
}

/** The diff-table metrics (plan §9 summary metrics), one row each. */
const METRICS: MetricDef[] = [
  { metric: 'incomeAt60', label: 'After-tax income at 60', get: (r) => afterTaxAtAge(r, 60) },
  { metric: 'incomeAt65', label: 'After-tax income at 65', get: (r) => afterTaxAtAge(r, 65) },
  { metric: 'incomeAt70', label: 'After-tax income at 70', get: (r) => afterTaxAtAge(r, 70) },
  { metric: 'lifetimeAfterTax', label: 'Lifetime after-tax income', get: (r) => r.totals.lifetimeAfterTax },
  { metric: 'lifetimeTax', label: 'Lifetime tax', get: (r) => r.totals.lifetimeTax },
  { metric: 'oasRetained', label: 'OAS retained (net of clawback)', get: (r) => r.totals.oasRetained },
  { metric: 'estateValue', label: 'After-tax estate value', get: (r) => r.totals.estateValue },
  { metric: 'lastsToEndAge', label: 'Money lasts to end age', get: (r) => r.totals.lastsToEndAge },
];

/** The metric keys, in table order. */
export const COMPARISON_METRICS: string[] = METRICS.map((m) => m.metric);

/**
 * Build a metrics diff table over 2–4 scenario results: one row per metric, each row carrying one
 * value per scenario (in input order). Income at 60/65/70 is the after-tax income that year, or null
 * if that age isn't in the projection.
 */
export function compareScenarios(results: ScenarioResult[]): ComparisonTable {
  return {
    scenarioCount: results.length,
    rows: METRICS.map((m) => ({
      metric: m.metric,
      label: m.label,
      values: results.map((r) => m.get(r)),
    })),
  };
}

// --- CPP / OAS break-even ages ------------------------------------------------------------------

export interface BreakEvenResult {
  /** Age at which deferring CPP from 60 to 65 overtakes in cumulative CPP received. */
  cppBreakEvenAge?: number;
  /** Age at which deferring OAS from 65 to 70 overtakes in cumulative OAS received. */
  oasBreakEvenAge?: number;
}

/**
 * First age at which the deferred run's cumulative benefit reaches the early run's — the break-even.
 * Benefits are aligned by age; the early run leads until the larger deferred payments catch up.
 */
function crossoverAge(
  early: ScenarioResult,
  deferred: ScenarioResult,
  pick: (r: YearRow) => number,
): number | undefined {
  const earlyByAge = new Map(early.rows.map((r) => [r.ageA, pick(r)]));
  const deferredByAge = new Map(deferred.rows.map((r) => [r.ageA, pick(r)]));
  const ages = [...new Set([...earlyByAge.keys(), ...deferredByAge.keys()])].sort((a, b) => a - b);

  let cumEarly = 0;
  let cumDeferred = 0;
  for (const age of ages) {
    cumEarly += earlyByAge.get(age) ?? 0;
    cumDeferred += deferredByAge.get(age) ?? 0;
    // Once the deferred benefit has started and caught up, that's the break-even age.
    if (cumDeferred > 0 && cumDeferred >= cumEarly) return age;
  }
  return undefined;
}

/**
 * CPP and OAS break-even ages for this household/scenario. CPP compares starting at 60 vs 65, OAS at
 * 65 vs 70 (OAS cannot start before 65), holding all other levers fixed. For the canonical figures
 * the projection must span the start ages (retire ≤ 60, end age past the crossover); a household that
 * retires later will shift the CPP figure since the early benefit can't be received pre-retirement.
 */
export function breakEven(household: Household, scenario: Scenario): BreakEvenResult {
  const withCpp = (age: number): Scenario => ({
    ...scenario,
    cppStartAge: { ...scenario.cppStartAge, memberA: age },
  });
  const withOas = (age: number): Scenario => ({
    ...scenario,
    oasStartAge: { ...scenario.oasStartAge, memberA: age },
  });

  const cppBreakEvenAge = crossoverAge(
    runScenario(household, withCpp(60)),
    runScenario(household, withCpp(65)),
    (r) => r.cpp,
  );
  const oasBreakEvenAge = crossoverAge(
    runScenario(household, withOas(65)),
    runScenario(household, withOas(70)),
    (r) => r.oas,
  );

  return { cppBreakEvenAge, oasBreakEvenAge };
}

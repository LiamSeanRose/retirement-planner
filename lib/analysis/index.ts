/**
 * Scenario analysis (`/lib/analysis`) — the what-if comparison layer (plan §10 what-if, §13).
 *   - `compareScenarios`          — a metrics diff table (one row per metric) across 2–4 scenarios.
 *   - `compareScenariosDetailed`  — the same, enriched with per-metric deltas, % differences, and
 *     winner flags relative to a baseline scenario.
 *   - `breakEven`                 — CPP and OAS break-even ages via cumulative-benefit crossover with
 *     linear interpolation (a fractional age, not just the first integer year past the crossover).
 *
 * Every output is a plain, serializable object the UI can render directly. Pure: no React/IO; calls
 * only the current 2-arg public engine API (`runScenario`); never edits the engine or projection.
 */

import type { Household, Scenario, ScenarioResult, YearRow } from '../../types/planner';
import { runScenario } from '../engine';

// --- Scenario comparison diff table -------------------------------------------------------------

/** Whether a higher value, a lower value, or `true` is "better" for a metric (drives winner flags). */
export type MetricDirection = 'higher' | 'lower' | 'boolean';

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
  direction: MetricDirection;
  get: (r: ScenarioResult) => number | boolean | null;
}

/** The diff-table metrics (plan §9 summary metrics), one row each. */
const METRICS: MetricDef[] = [
  { metric: 'incomeAt60', label: 'After-tax income at 60', direction: 'higher', get: (r) => afterTaxAtAge(r, 60) },
  { metric: 'incomeAt65', label: 'After-tax income at 65', direction: 'higher', get: (r) => afterTaxAtAge(r, 65) },
  { metric: 'incomeAt70', label: 'After-tax income at 70', direction: 'higher', get: (r) => afterTaxAtAge(r, 70) },
  { metric: 'lifetimeAfterTax', label: 'Lifetime after-tax income', direction: 'higher', get: (r) => r.totals.lifetimeAfterTax },
  { metric: 'lifetimeTax', label: 'Lifetime tax', direction: 'lower', get: (r) => r.totals.lifetimeTax },
  { metric: 'oasRetained', label: 'OAS retained (net of clawback)', direction: 'higher', get: (r) => r.totals.oasRetained },
  { metric: 'estateValue', label: 'After-tax estate value', direction: 'higher', get: (r) => r.totals.estateValue },
  { metric: 'lastsToEndAge', label: 'Money lasts to end age', direction: 'boolean', get: (r) => r.totals.lastsToEndAge },
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

// --- Richer comparison: deltas, % differences, winner flags -------------------------------------

export interface ScenarioCell {
  value: number | boolean | null;
  /** value − baseline value (numeric metrics only; null otherwise). */
  deltaVsBaseline: number | null;
  /** Fractional difference vs baseline, e.g. 0.1 = +10% (null when baseline is 0 / non-numeric). */
  pctVsBaseline: number | null;
  /** True when this scenario is best (or tied-best) for the metric, per its direction. */
  isWinner: boolean;
}

export interface DetailedMetricRow {
  metric: string;
  label: string;
  direction: MetricDirection;
  cells: ScenarioCell[];
}

export interface DetailedComparison {
  scenarioCount: number;
  baselineIndex: number;
  rows: DetailedMetricRow[];
}

function isWinnerValue(value: number | boolean | null, best: number | boolean | null, direction: MetricDirection): boolean {
  if (value === null || best === null) return false;
  if (direction === 'boolean') return value === true && best === true;
  return value === best;
}

/** The best value among a metric's values, per direction (null if no comparable values). */
function bestValue(values: Array<number | boolean | null>, direction: MetricDirection): number | boolean | null {
  if (direction === 'boolean') return values.some((v) => v === true) ? true : null;
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return direction === 'higher' ? Math.max(...nums) : Math.min(...nums);
}

/**
 * Enriched comparison for 2–4 scenarios: per-metric deltas and % differences against a baseline
 * scenario (default the first), plus a winner flag on the best scenario for each metric. A plain
 * serializable object for the diff table / overlay UI.
 */
export function compareScenariosDetailed(results: ScenarioResult[], baselineIndex = 0): DetailedComparison {
  const base = Math.min(Math.max(0, baselineIndex), Math.max(0, results.length - 1));
  return {
    scenarioCount: results.length,
    baselineIndex: base,
    rows: METRICS.map((m) => {
      const values = results.map((r) => m.get(r));
      const best = bestValue(values, m.direction);
      const baselineValue = values[base] ?? null;
      const cells: ScenarioCell[] = values.map((value) => {
        const numeric = typeof value === 'number' && typeof baselineValue === 'number';
        const deltaVsBaseline = numeric ? value - baselineValue : null;
        const pctVsBaseline = numeric && baselineValue !== 0 ? (value - baselineValue) / Math.abs(baselineValue) : null;
        return { value, deltaVsBaseline, pctVsBaseline, isWinner: isWinnerValue(value, best, m.direction) };
      });
      return { metric: m.metric, label: m.label, direction: m.direction, cells };
    }),
  };
}

// --- CPP / OAS break-even ages (interpolated) ---------------------------------------------------

export interface BreakEvenResult {
  /** Fractional age at which deferring CPP from 60 to 65 overtakes in cumulative CPP received. */
  cppBreakEvenAge?: number;
  /** Fractional age at which deferring OAS from 65 to 70 overtakes in cumulative OAS received. */
  oasBreakEvenAge?: number;
}

/**
 * Fractional age at which the deferred run's cumulative benefit reaches the early run's. The early
 * run leads until the larger deferred payments catch up; we track the cumulative gap by age and
 * LINEARLY INTERPOLATE the exact crossover between the last age it is negative and the first age it
 * turns non-negative — so the break-even is a fractional age (e.g. 73.4), not just the integer year.
 */
function crossoverAge(early: ScenarioResult, deferred: ScenarioResult, pick: (r: YearRow) => number): number | undefined {
  const earlyByAge = new Map(early.rows.map((r) => [r.ageA, pick(r)]));
  const deferredByAge = new Map(deferred.rows.map((r) => [r.ageA, pick(r)]));
  const ages = [...new Set([...earlyByAge.keys(), ...deferredByAge.keys()])].sort((a, b) => a - b);

  let cumEarly = 0;
  let cumDeferred = 0;
  let prevAge: number | undefined;
  let prevGap: number | undefined; // cumDeferred − cumEarly at the previous age
  for (const age of ages) {
    cumEarly += earlyByAge.get(age) ?? 0;
    cumDeferred += deferredByAge.get(age) ?? 0;
    const gap = cumDeferred - cumEarly;
    if (cumDeferred > 0 && gap >= 0) {
      if (prevGap !== undefined && prevGap < 0 && prevAge !== undefined) {
        // Interpolate where the gap crosses zero between prevAge (gap<0) and age (gap>=0).
        const fraction = -prevGap / (gap - prevGap);
        return prevAge + fraction * (age - prevAge);
      }
      return age;
    }
    prevAge = age;
    prevGap = gap;
  }
  return undefined;
}

/**
 * CPP and OAS break-even ages for this household/scenario. CPP compares starting at 60 vs 65, OAS at
 * 65 vs 70 (OAS cannot start before 65), holding all other levers fixed. For the canonical figures
 * the projection must span the start ages (retire ≤ 60, end age past the crossover); a household that
 * retires later shifts the CPP figure since the early benefit can't be received pre-retirement.
 */
export function breakEven(household: Household, scenario: Scenario): BreakEvenResult {
  const withCpp = (age: number): Scenario => ({ ...scenario, cppStartAge: { ...scenario.cppStartAge, memberA: age } });
  const withOas = (age: number): Scenario => ({ ...scenario, oasStartAge: { ...scenario.oasStartAge, memberA: age } });

  return {
    cppBreakEvenAge: crossoverAge(runScenario(household, withCpp(60)), runScenario(household, withCpp(65)), (r) => r.cpp),
    oasBreakEvenAge: crossoverAge(runScenario(household, withOas(65)), runScenario(household, withOas(70)), (r) => r.oas),
  };
}

/**
 * Optimizer (`/lib/optimize`) — search the scenario levers for the best plan under an objective
 * (plan §10 optimizers). Two solvers, both scoring candidates by running the read-only engine:
 *   - `cppOasOptimizer`  — EXACT enumeration of CPP start 60–70 × OAS start 65–70 (66 pairs).
 *   - `strategyOptimizer` — coordinate-descent over a small knob set (withdrawal order, meltdown
 *     pace), never returning a plan worse than the do-nothing baseline.
 *
 * Pure: no React/IO. Calls only the current 2-arg public engine API (`runScenario`); never edits the
 * engine or projection. A `Scorer` maps a `ScenarioResult` to a number where HIGHER IS ALWAYS BETTER
 * (minimize-objectives are negated), so every solver is a plain argmax.
 */

import type { AccountType, Household, Scenario, ScenarioResult, YearRow } from '../../types/planner';
import { runScenario } from '../engine';

export type Objective =
  | 'maxLifetimeAfterTax'
  | 'maxEstateValue'
  | 'minLifetimeTax'
  | 'maxOasRetained'
  | 'maxSustainableSpend'
  | 'smoothestIncome';

export const OBJECTIVES: Objective[] = [
  'maxLifetimeAfterTax',
  'maxEstateValue',
  'minLifetimeTax',
  'maxOasRetained',
  'maxSustainableSpend',
  'smoothestIncome',
];

// --- Scorers (higher is always better) ----------------------------------------------------------

/** A plan that lasts to the end age must dominate one that doesn't, whatever the buffer. */
const SUSTAIN_BONUS = 1e12;

function minNetWorth(rows: YearRow[]): number {
  let m = Infinity;
  for (const r of rows) m = Math.min(m, r.netWorth);
  return Number.isFinite(m) ? m : 0;
}

/** Total year-over-year variation in after-tax income — lower is smoother. */
function incomeRoughness(rows: YearRow[]): number {
  let variation = 0;
  for (let i = 1; i < rows.length; i++) variation += Math.abs(rows[i].afterTax - rows[i - 1].afterTax);
  return variation;
}

const SCORERS: Record<Objective, (r: ScenarioResult) => number> = {
  maxLifetimeAfterTax: (r) => r.totals.lifetimeAfterTax,
  maxEstateValue: (r) => r.totals.estateValue,
  minLifetimeTax: (r) => -r.totals.lifetimeTax,
  maxOasRetained: (r) => r.totals.oasRetained,
  // Proxy for "max sustainable spend": any plan that lasts beats any that doesn't; among those that
  // last, more cushion (higher minimum net worth) ranks higher.
  maxSustainableSpend: (r) => (r.totals.lastsToEndAge ? SUSTAIN_BONUS : 0) + minNetWorth(r.rows),
  smoothestIncome: (r) => -incomeRoughness(r.rows),
};

/** Score a result under an objective (higher = better). */
export function scoreScenario(objective: Objective, result: ScenarioResult): number {
  return SCORERS[objective](result);
}

// --- CPP / OAS exact optimizer ------------------------------------------------------------------

const CPP_START_MIN = 60;
const CPP_START_MAX = 70;
const OAS_START_MIN = 65;
const OAS_START_MAX = 70;

export interface CppOasOptimizerResult {
  objective: Objective;
  bestCppStartAge: number;
  bestOasStartAge: number;
  /** The winning scenario (baseline with the best start-age pair applied). */
  scenario: Scenario;
  result: ScenarioResult;
  score: number;
  /** Number of (cpp, oas) pairs enumerated. */
  evaluated: number;
}

/**
 * Exhaustively enumerate every CPP start (60–70) × OAS start (65–70) pair — 66 in total — run the
 * deterministic engine for each, and return the best pair for the objective. Member A only (the
 * single-person engine); member B's start ages are left as the scenario sets them.
 */
export function cppOasOptimizer(
  household: Household,
  scenario: Scenario,
  objective: Objective,
): CppOasOptimizerResult {
  let best: CppOasOptimizerResult | null = null;
  let evaluated = 0;
  for (let cpp = CPP_START_MIN; cpp <= CPP_START_MAX; cpp++) {
    for (let oas = OAS_START_MIN; oas <= OAS_START_MAX; oas++) {
      const candidate: Scenario = {
        ...scenario,
        cppStartAge: { ...scenario.cppStartAge, memberA: cpp },
        oasStartAge: { ...scenario.oasStartAge, memberA: oas },
      };
      const result = runScenario(household, candidate);
      const score = scoreScenario(objective, result);
      evaluated++;
      if (best === null || score > best.score) {
        best = { objective, bestCppStartAge: cpp, bestOasStartAge: oas, scenario: candidate, result, score, evaluated };
      }
    }
  }
  // The loop bounds guarantee ≥1 iteration, so `best` is always assigned.
  return { ...(best as CppOasOptimizerResult), evaluated };
}

// --- Strategy optimizer (coordinate descent over a small knob set) ------------------------------

/** Decumulation orderings searched (the 6 permutations of the three account types). */
const WITHDRAWAL_ORDERS: AccountType[][] = [
  ['nonReg', 'rrsp', 'tfsa'],
  ['nonReg', 'tfsa', 'rrsp'],
  ['rrsp', 'nonReg', 'tfsa'],
  ['rrsp', 'tfsa', 'nonReg'],
  ['tfsa', 'nonReg', 'rrsp'],
  ['tfsa', 'rrsp', 'nonReg'],
];

/**
 * Meltdown paces searched. NOTE: the current projection does not yet consume `scenario.meltdown`
 * (only `withdrawalOrder` moves outputs), so varying this is presently inert — kept here so the
 * search picks it up automatically once the engine wires the meltdown in. RRIF-conversion timing is
 * deliberately NOT searched: the engine fixes conversion at 71 with no scenario lever to vary it.
 */
const MELTDOWN_MODES: Scenario['meltdown']['mode'][] = ['none', 'conservative', 'moderate', 'aggressive'];

const IMPROVE_EPS = 1e-6;
const MAX_SWEEPS = 4;

export interface StrategyPlan {
  scenario: Scenario;
  result: ScenarioResult;
  score: number;
}

export interface StrategyOptimizerResult {
  objective: Objective;
  /** The unchanged input scenario and its score — always returned for comparison. */
  baseline: StrategyPlan;
  /** The best plan found; never scores worse than the baseline. */
  best: StrategyPlan;
}

/**
 * Coordinate descent over the strategy knobs: sweep each knob, adopting any single-knob change that
 * improves the objective, repeating until a full sweep finds no improvement. Because the search
 * starts AT the baseline and only ever moves to a strictly better score, `best` is guaranteed ≥
 * `baseline`. Not a brute force over dollar amounts — only the discrete knob set is explored.
 */
export function strategyOptimizer(
  household: Household,
  scenario: Scenario,
  objective: Objective,
): StrategyOptimizerResult {
  const evaluate = (s: Scenario): StrategyPlan => {
    const result = runScenario(household, s);
    return { scenario: s, result, score: scoreScenario(objective, result) };
  };

  const baseline = evaluate(scenario);
  let current = baseline;

  const knobs: Array<(s: Scenario) => Scenario[]> = [
    (s) => WITHDRAWAL_ORDERS.map((order) => ({ ...s, withdrawalOrder: order })),
    (s) => MELTDOWN_MODES.map((mode) => ({ ...s, meltdown: { ...s.meltdown, mode } })),
  ];

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let improved = false;
    for (const candidatesOf of knobs) {
      for (const candidate of candidatesOf(current.scenario)) {
        const plan = evaluate(candidate);
        if (plan.score > current.score + IMPROVE_EPS) {
          current = plan;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  return { objective, baseline, best: current };
}

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

import type { AccountType, Household, Province, Scenario, ScenarioResult, YearRow } from '../../types/planner';
import { runMonteCarloScenario, runScenario } from '../engine';

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

// --- Optimizer depth: Monte-Carlo scoring + broadened multi-knob search --------------------------

/** How candidates are scored: a deterministic objective, or the Monte Carlo probability of success. */
export type ScoringStrategy =
  | { kind: 'deterministic'; objective: Objective }
  | { kind: 'monteCarlo'; seed?: number };

/** Accept either a bare Objective (⇒ deterministic) or a full ScoringStrategy. */
export type ScoringInput = Objective | ScoringStrategy;

function asStrategy(input: ScoringInput): ScoringStrategy {
  return typeof input === 'string' ? { kind: 'deterministic', objective: input } : input;
}

/** Build a candidate scorer (higher is always better) from a scoring strategy. */
function makeCandidateScorer(strategy: ScoringStrategy): (h: Household, s: Scenario) => number {
  if (strategy.kind === 'monteCarlo') {
    const seed = strategy.seed ?? 0;
    return (h, s) => runMonteCarloScenario(h, s, seed).probabilityOfSuccess;
  }
  const { objective } = strategy;
  return (h, s) => scoreScenario(objective, runScenario(h, s));
}

/** Fixed seed for the displayed confidence (probability of success) on the headline plans. */
const PROBABILITY_SEED = 0;

function inclusiveRange(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max; v++) out.push(v);
  return out;
}

/** The "do-nothing" default plan: CPP/OAS at 65, no meltdown, engine-default withdrawal order. */
function doNothingScenario(user: Scenario): Scenario {
  const cppStartAge: Scenario['cppStartAge'] = { memberA: 65 };
  if (user.cppStartAge.memberB !== undefined) cppStartAge.memberB = 65;
  const oasStartAge: Scenario['oasStartAge'] = { memberA: 65 };
  if (user.oasStartAge.memberB !== undefined) oasStartAge.memberB = 65;
  return { ...user, cppStartAge, oasStartAge, meltdown: { mode: 'none' }, withdrawalOrder: undefined };
}

/** Which knobs the broadened search explores (all on by default). */
export interface SearchKnobs {
  cppStart?: boolean;
  oasStart?: boolean;
  withdrawalOrder?: boolean;
  meltdownPace?: boolean;
}

export interface OptimizedPlan {
  label: string;
  scenario: Scenario;
  /** Deterministic projection of this plan (for the metrics table). */
  result: ScenarioResult;
  /** Score under the chosen scoring strategy (higher = better). */
  score: number;
  /** Monte Carlo plan-success probability in [0, 1] — always computed for the headline plans. */
  probabilityOfSuccess: number;
}

export interface OptimizePlanResult {
  scoring: ScoringStrategy;
  /** The assumptions the result is conditional on (stated for the UI). */
  assumptions: {
    province: Province;
    inflationPct: number;
    indexingPct: number;
    endAge: number;
    monteCarloRuns?: number;
  };
  /** The optimized plan; never scores worse than the user's plan OR the do-nothing baseline. */
  winner: OptimizedPlan;
  /** The do-nothing default (CPP/OAS at 65, no meltdown). */
  doNothing: OptimizedPlan;
  /** The user's input scenario, unchanged. */
  yourPlan: OptimizedPlan;
  /** Number of candidate evaluations the search performed. */
  evaluated: number;
}

const MAX_PLAN_SWEEPS = 5;

/**
 * The comprehensive optimizer: coordinate descent over the broadened knob set (CPP start, OAS start,
 * withdrawal order, meltdown pace), scored deterministically OR by Monte Carlo probability of success.
 * Always returns the winner alongside the do-nothing baseline and the user's own plan, with the
 * scoring and the assumptions it is conditional on. The search seeds from the better of {user plan,
 * do-nothing}, so the winner is guaranteed ≥ both.
 *
 * NOTE: meltdown pace is searched for forward compatibility — the projection does not yet consume
 * `scenario.meltdown`, so varying it is currently inert; RRIF-conversion age has no scenario lever at
 * all (the engine fixes 71), so it is not searched.
 */
export function optimizePlan(
  household: Household,
  userScenario: Scenario,
  scoring: ScoringInput = 'maxLifetimeAfterTax',
  knobs: SearchKnobs = {},
): OptimizePlanResult {
  const strategy = asStrategy(scoring);
  const score = makeCandidateScorer(strategy);

  const candidateGenerators: Array<(s: Scenario) => Scenario[]> = [];
  if (knobs.cppStart ?? true)
    candidateGenerators.push((s) =>
      inclusiveRange(CPP_START_MIN, CPP_START_MAX).map((age) => ({ ...s, cppStartAge: { ...s.cppStartAge, memberA: age } })),
    );
  if (knobs.oasStart ?? true)
    candidateGenerators.push((s) =>
      inclusiveRange(OAS_START_MIN, OAS_START_MAX).map((age) => ({ ...s, oasStartAge: { ...s.oasStartAge, memberA: age } })),
    );
  if (knobs.withdrawalOrder ?? true)
    candidateGenerators.push((s) => WITHDRAWAL_ORDERS.map((order) => ({ ...s, withdrawalOrder: order })));
  if (knobs.meltdownPace ?? true)
    candidateGenerators.push((s) => MELTDOWN_MODES.map((mode) => ({ ...s, meltdown: { ...s.meltdown, mode } })));

  // Seed from the better of {user plan, do-nothing} so the winner can never lose to either.
  const doNothing = doNothingScenario(userScenario);
  const userScore = score(household, userScenario);
  const dnScore = score(household, doNothing);
  let evaluated = 2;

  let bestScenario = userScore >= dnScore ? userScenario : doNothing;
  let bestScore = Math.max(userScore, dnScore);

  for (let sweep = 0; sweep < MAX_PLAN_SWEEPS; sweep++) {
    let improved = false;
    for (const generate of candidateGenerators) {
      for (const candidate of generate(bestScenario)) {
        const s = score(household, candidate);
        evaluated++;
        if (s > bestScore + 1e-9) {
          bestScenario = candidate;
          bestScore = s;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const summarize = (label: string, scenario: Scenario, scoreValue: number): OptimizedPlan => ({
    label,
    scenario,
    result: runScenario(household, scenario),
    score: scoreValue,
    probabilityOfSuccess: runMonteCarloScenario(household, scenario, PROBABILITY_SEED).probabilityOfSuccess,
  });

  return {
    scoring: strategy,
    assumptions: {
      province: household.province,
      inflationPct: userScenario.assumptions.inflationPct,
      indexingPct: userScenario.assumptions.indexingPct,
      endAge: userScenario.assumptions.endAge,
      monteCarloRuns: userScenario.assumptions.runs,
    },
    winner: summarize('winner', bestScenario, bestScore),
    doNothing: summarize('do-nothing', doNothing, dnScore),
    yourPlan: summarize('your plan', userScenario, userScore),
    evaluated,
  };
}

/**
 * Direct answers to the questions people actually ask (`/lib/analysis/solve.ts`).
 *
 * "When can I retire?" and "How much can I spend?" — answered EXACTLY off the real engine (pension +
 * CPP/OAS + tax + the actual portfolio), not the rough 4%/25× rule of thumb. Each solver runs the
 * deterministic projection (the expected path) and searches an input until the plan just sustains to
 * the end age. Pure; the UI memoizes the result.
 */

import type { Household, Scenario } from '../../types/planner';
import { DEFAULT_CONFIG, type YearConfig } from '../config';
import { runScenario } from '../engine';

/** Does the plan, at this annual spend, last to the end age on the expected path? */
function sustains(household: Household, scenario: Scenario, spend: number, config: YearConfig): boolean {
  return runScenario(household, { ...scenario, assumptions: { ...scenario.assumptions, targetAnnualSpending: spend } }, config).totals.lastsToEndAge;
}

/**
 * The highest annual spend (year-0 $) the plan sustains to the end age, by bisection. Spend 0 always
 * lasts (no withdrawals), so the lower bound is always feasible; we grow an upper bound until it fails,
 * then bisect. Rounded DOWN to the nearest $500 so the answer is conservative.
 */
export function maxSustainableSpending(household: Household, scenario: Scenario, config: YearConfig = DEFAULT_CONFIG): number {
  let hi = Math.max(scenario.assumptions.targetAnnualSpending ?? 0, 10_000);
  let guard = 0;
  while (sustains(household, scenario, hi, config) && guard++ < 24) hi *= 1.6; // grow until it fails (or the plan is very rich)
  let lo = 0;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (sustains(household, scenario, mid, config)) lo = mid;
    else hi = mid;
  }
  return Math.max(0, Math.floor(lo / 500) * 500);
}

/**
 * The earliest retirement age (≥ 50) that still sustains the CURRENT target spend to the end age, or
 * `null` if even the current age doesn't sustain it. Earlier retirement means fewer years of
 * pensionable service, so service is reduced one-for-one as the age drops — a realistic trade.
 */
export function earliestRetirementAge(household: Household, scenario: Scenario, config: YearConfig = DEFAULT_CONFIG): number | null {
  const currentAge = household.memberA.targetRetirementAge;
  const fullService = household.memberA.pensionableServiceYears;
  for (let age = 50; age <= currentAge; age++) {
    const service = Math.max(2, fullService - (currentAge - age));
    const h: Household = { ...household, memberA: { ...household.memberA, targetRetirementAge: age, pensionableServiceYears: service } };
    if (runScenario(h, scenario, config).totals.lastsToEndAge) return age;
  }
  return null;
}

/** Max sustainable spend if every account's expected return were shifted by `deltaPct` (e.g. −1 for a stress check). */
export function maxSpendingAtReturnDelta(household: Household, scenario: Scenario, deltaPct: number, config: YearConfig = DEFAULT_CONFIG): number {
  const shifted: Household = {
    ...household,
    accounts: household.accounts.map((a) => ({ ...a, riskProfile: { ...a.riskProfile, expectedReturn: a.riskProfile.expectedReturn + deltaPct } })),
  };
  return maxSustainableSpending(shifted, scenario, config);
}

export interface PlanAnswers {
  /** Highest sustainable annual spend (year-0 $). */
  maxSpend: number;
  /** The plan's current target spend, for comparison. */
  targetSpend: number;
  /** Earliest retirement age that sustains the target spend, or null if the current age already falls short. */
  earliestAge: number | null;
  /** The plan's current target retirement age. */
  targetAge: number;
  /** Max sustainable spend if returns came in 1% lower (a built-in sensitivity check). */
  maxSpendLowerReturns: number;
}

/** Compute the headline "your questions, answered" figures in one pass. */
export function answerPlanQuestions(household: Household, scenario: Scenario, config: YearConfig = DEFAULT_CONFIG): PlanAnswers {
  return {
    maxSpend: maxSustainableSpending(household, scenario, config),
    targetSpend: scenario.assumptions.targetAnnualSpending ?? 0,
    earliestAge: earliestRetirementAge(household, scenario, config),
    targetAge: household.memberA.targetRetirementAge,
    maxSpendLowerReturns: maxSpendingAtReturnDelta(household, scenario, -1, config),
  };
}

/**
 * Survivor rule (`/lib/survivor`) — the PSPP survivor allowance and the couple→single filing
 * transition triggered by a member's death (plan §19; edge-cases §2). Pure functions.
 *
 * The survivor allowance is ≈ HALF the member's UNREDUCED lifetime pension — computed WITHOUT the
 * early-retirement reduction and WITHOUT the CPP-coordination reduction: `1% × service(≤35) ×
 * best-5` annually (= ½ × the 2% accrual). It does NOT carry the deceased's bridge.
 */

import { DEFAULT_CONFIG, type YearConfig } from '../config';

/**
 * PSPP survivor fraction: 50% of the unreduced lifetime pension (edge-cases §2). A dated plan rule
 * that belongs in the shared config once it is wired in — kept local here for now (same pattern as
 * lib/estate's inclusion rate).
 */
const SURVIVOR_FRACTION = 0.5;

/** The pieces of a member needed to size the survivor allowance. */
export interface SurvivorInput {
  pensionableServiceYears: number;
  bestFiveAvgSalary: number;
}

/**
 * Annual survivor allowance = ½ × (2% accrual) × best-5 × service(≤35) — i.e. 1% × service × best-5.
 * No early-retirement reduction, no CPP coordination (per edge-cases §2 / plan §19).
 */
export function survivorAllowanceAnnual(member: SurvivorInput, config: YearConfig = DEFAULT_CONFIG): number {
  const cappedService = Math.min(Math.max(0, member.pensionableServiceYears), config.pension.maxServiceYears);
  return SURVIVOR_FRACTION * config.pension.accrualAboveAmpe * Math.max(0, member.bestFiveAvgSalary) * cappedService;
}

/** Monthly survivor allowance = annual ÷ 12. */
export function survivorAllowanceMonthly(member: SurvivorInput, config: YearConfig = DEFAULT_CONFIG): number {
  return survivorAllowanceAnnual(member, config) / 12;
}

/**
 * Household filing status for a year: a couple files jointly (pension splitting) while BOTH spouses
 * are alive, and flips to a single filer from the year a spouse dies — the §19 couple→single
 * transition. A single-person household is always a single filer.
 */
export function householdFilingStatus(isCouple: boolean, bothAlive: boolean): 'couple' | 'single' {
  return isCouple && bothAlive ? 'couple' : 'single';
}

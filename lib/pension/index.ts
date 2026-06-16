/**
 * Federal PSPP pension engine — pure functions, no React/IO.
 *
 * FEDERAL ONLY. Unreduced eligibility is age-and-service thresholds; there is NO rule of 85.
 * Constants come from the dated config — never inline rates here. See the project notes and
 * docs/retirement-financial-planning-tool-plan.md.md §4 / edge-cases §1.
 */

import { DEFAULT_CONFIG, type PensionConfig, type YearConfig } from '../config';
import type { Group } from '../types';

/** Round to the nearest tenth of a year — ages/service are measured to 0.1 yr in the official calc. */
export function roundTenth(years: number): number {
  return Math.round(years * 10) / 10;
}

/**
 * Determine pension group from plan-join date.
 *
 * Group 1: joined on/before Dec 31, 2012. Group 2: joined on/after Jan 1, 2013.
 * Edge case (re-employment after a return of contributions / transfer value / PTA on/after
 * 2013) can move a Group 1 member to Group 2 — not derivable from the join date alone, so the
 * caller may pass an explicit override.
 */
export function determineGroup(planJoinDate: string, override?: Group): Group {
  if (override !== undefined) return override;
  const joined = new Date(planJoinDate);
  const cutoff = new Date('2013-01-01T00:00:00Z');
  return joined.getTime() < cutoff.getTime() ? 1 : 2;
}

/** Whether the member qualifies for an UNREDUCED immediate annuity (no early-retirement reduction). */
export function isUnreducedEligible(group: Group, age: number, service: number): boolean {
  if (group === 1) {
    // Age 60 + 2 yrs service, OR age 55 + 30 yrs.
    return (age >= 60 && service >= 2) || (age >= 55 && service >= 30);
  }
  // Group 2: age 65 + 2 yrs, OR age 60 + 30 yrs.
  return (age >= 65 && service >= 2) || (age >= 60 && service >= 30);
}

/** Service used in the accrual, capped at the plan maximum (default 35 yrs). */
export function cappedService(service: number, cfg: PensionConfig): number {
  return Math.min(service, cfg.maxServiceYears);
}

/**
 * Annual LIFETIME pension (coordinated with CPP), before any early-retirement reduction.
 *
 *   lifetime = accrualUpToAmpe × min(best5, AMPE)        × service(≤cap)
 *            + accrualAboveAmpe × max(best5 − AMPE, 0)    × service(≤cap)
 */
export function lifetimePension(best5Salary: number, service: number, cfg: PensionConfig): number {
  const s = cappedService(service, cfg);
  const upTo = Math.min(best5Salary, cfg.ampe);
  const above = Math.max(best5Salary - cfg.ampe, 0);
  return cfg.accrualUpToAmpe * upTo * s + cfg.accrualAboveAmpe * above * s;
}

/**
 * Annual BRIDGE benefit, paid from retirement until the month after 65 only.
 *
 *   bridge = bridgeAccrual × min(best5, AMPE) × service(≤cap)
 *
 * Identity (pre-65): lifetime + bridge = accrualAboveAmpe × best5 × service.
 */
export function bridgeBenefit(best5Salary: number, service: number, cfg: PensionConfig): number {
  const s = cappedService(service, cfg);
  const upTo = Math.min(best5Salary, cfg.ampe);
  return cfg.bridgeAccrual * upTo * s;
}

/**
 * Permanent early-retirement reduction (annual allowance), as a fraction in [0, 1).
 * Returns 0 when the member is eligible for an unreduced annuity.
 *
 * Group 2:
 *   F1 (service < 25): 5% × (65 − age)
 *   F2 (service ≥ 25): greater of 5% × (60 − age) or 5% × (30 − service);
 *                      at age 60+ take the LOWER of F1 and F2.
 * Group 1 (same shape, anchors 60/55 instead of 65/60):
 *   F1 (service < 25): 5% × (60 − age)
 *   F2 (service ≥ 25): greater of 5% × (55 − age) or 5% × (30 − service);
 *                      at age 55+ take the LOWER of F1 and F2.
 *
 * ⚠️ Group 1 Formula 1 anchor (60) is inferred from age-60 normal retirement — verify against
 * the official Group 1 page before shipping that path.
 */
export function earlyRetirementReduction(group: Group, ageRaw: number, serviceRaw: number, cfg: PensionConfig): number {
  if (isUnreducedEligible(group, ageRaw, serviceRaw)) return 0;

  const age = roundTenth(ageRaw);
  const service = roundTenth(serviceRaw);
  const rate = cfg.reductionPerYear;
  const clamp = (x: number) => Math.max(0, Math.min(x, 1));

  const ageAnchorF1 = group === 1 ? 60 : 65;
  const ageAnchorF2 = group === 1 ? 55 : 60;
  const lowerOfBothFloor = group === 1 ? 55 : 60;

  const f1 = rate * (ageAnchorF1 - age);
  if (service < 25) return clamp(f1);

  const f2 = rate * Math.max(ageAnchorF2 - age, 30 - service);
  if (age >= lowerOfBothFloor) return clamp(Math.min(f1, f2));
  return clamp(f2);
}

export interface PensionAtRetirement {
  group: Group;
  /** Early-retirement reduction applied, as a fraction (0 = unreduced). */
  reductionPct: number;
  /** Annual lifetime pension after reduction (the amount that continues past 65). */
  lifetimeAnnual: number;
  /** Annual bridge benefit after reduction (paid before 65 only; 0 once stopped). */
  bridgeAnnual: number;
  /** Combined annual pension before 65 (lifetime + bridge, after reduction). */
  preAge65Annual: number;
  /** Combined annual pension at/after 65 (lifetime only, after reduction). */
  postAge65Annual: number;
}

/**
 * Full pension at the point of retirement: groups the formula, reduction, and the
 * pre-65 vs post-65 split (the bridge step-down at 65) into one result.
 *
 * `ageAtRetirement` and `service` to the nearest tenth of a year. The reduction is permanent
 * and applies to the WHOLE pre-65 pension (lifetime + bridge).
 */
export function pensionAtRetirement(
  params: {
    group: Group;
    best5Salary: number;
    service: number;
    ageAtRetirement: number;
  },
  config: YearConfig = DEFAULT_CONFIG,
): PensionAtRetirement {
  const cfg = config.pension;
  const { group, best5Salary, service, ageAtRetirement } = params;

  const reductionPct = earlyRetirementReduction(group, ageAtRetirement, service, cfg);
  const factor = 1 - reductionPct;

  const lifetimeAnnual = lifetimePension(best5Salary, service, cfg) * factor;
  const bridgeAnnual = bridgeBenefit(best5Salary, service, cfg) * factor;

  return {
    group,
    reductionPct,
    lifetimeAnnual,
    bridgeAnnual,
    preAge65Annual: lifetimeAnnual + bridgeAnnual,
    postAge65Annual: lifetimeAnnual,
  };
}

/**
 * Indexed pension value after `yearsElapsed` full years of CPI indexing.
 *
 * Index is applied to the component (lifetime or bridge) — so when the bridge ends at 65 the
 * indexed amount steps down with it. `firstYearProrationMonths` (0-12) prorates the first
 * indexing year by months since retirement (default 12 = full year).
 */
export function indexedValue(
  baseAnnual: number,
  yearsElapsed: number,
  indexingPct: number,
  firstYearProrationMonths = 12,
): number {
  if (yearsElapsed <= 0) return baseAnnual;
  const proration = Math.min(Math.max(firstYearProrationMonths, 0), 12) / 12;
  const firstYear = baseAnnual * (1 + indexingPct * proration);
  return firstYear * Math.pow(1 + indexingPct, yearsElapsed - 1);
}

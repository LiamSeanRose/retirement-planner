/**
 * Public-service workforce events (`/lib/workforce`) — the §18 levers, consolidated as pure
 * helpers the projection calls for BOTH members each year:
 *   - WFA/VDP package → a taxable Transition Support Measure (TSM) lump sum in the departure year.
 *   - ERI waiver      → waives the early-retirement reduction (applied in the pension setup).
 *   - Second-career / consulting income for a bounded age window.
 */

import type { Scenario } from '../../types/planner';

type MemberId = 'memberA' | 'memberB';

/**
 * Transition Support Measure lump sum: weeks of pay × weekly salary (salary ÷ 52). Taxable income
 * in the departure year. Negative inputs clamp to 0.
 */
export function tsmLumpSum(weeksOfPay: number, salary: number): number {
  return Math.max(0, weeksOfPay) * (Math.max(0, salary) / 52);
}

/** Whether the ERI waiver applies to this member (waives the permanent early-retirement reduction). */
export function eriWaiverApplies(scenario: Scenario, member: MemberId): boolean {
  return scenario.events.eriWaiver?.member === member;
}

/** Second-career / consulting income for a member in a given year — 0 outside the configured window. */
export function secondCareerIncomeForYear(scenario: Scenario, member: MemberId, age: number): number {
  const sc = scenario.events.secondCareerIncome;
  return sc && sc.member === member && age >= sc.startAge && age <= sc.endAge ? sc.annualAmount : 0;
}

/** WFA/TSM lump sum for a member in a given year — paid only in the departure-age year. */
export function wfaLumpSumForYear(scenario: Scenario, member: MemberId, age: number, salary: number): number {
  const wfa = scenario.events.wfaPackage;
  return wfa && wfa.member === member && age === wfa.departureAge ? tsmLumpSum(wfa.tsmPayoutWeeks, salary) : 0;
}

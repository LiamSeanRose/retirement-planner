/**
 * OAS — deferral bump, the 75+ increase, and the clawback (recovery tax). Pure functions.
 *
 * Clawback runs off PRIOR-year net world income (one-year lag) and TFSA withdrawals are
 * EXCLUDED from that income base — both are core to the meltdown. The income base itself is
 * assembled by the tax/projection layer; here we just apply the recovery-tax formula.
 */

import { DEFAULT_CONFIG, type YearConfig } from '../config';

/** Deferral factor relative to starting at 65: +deferralPerMonth per month past 65, capped at 70. */
export function oasDeferralFactor(startAge: number, config: YearConfig = DEFAULT_CONFIG): number {
  const cfg = config.oas;
  const monthsPast65 = Math.max(0, (startAge - cfg.startAge) * 12);
  const months = Math.min(monthsPast65, cfg.maxDeferralMonths);
  return 1 + months * cfg.deferralPerMonth;
}

/**
 * Monthly OAS at a given current age, having elected to start at `startAge`.
 * Applies the deferral factor and the +bump75Pct increase once the recipient is 75+.
 */
export function oasMonthly(
  startAge: number,
  currentAge: number,
  config: YearConfig = DEFAULT_CONFIG,
): number {
  const cfg = config.oas;
  if (currentAge < startAge) return 0; // not yet receiving
  const base = cfg.maxMonthly65to74 * oasDeferralFactor(startAge, config);
  return currentAge >= 75 ? base * (1 + cfg.bump75Pct) : base;
}

/**
 * OAS recovery tax (clawback) for a payment period, driven by the relevant income year's net
 * world income. Returns the amount clawed back, capped at the annual OAS received.
 *
 *   clawback = min(annualOasReceived, clawbackRate × max(0, netIncome − threshold[incomeYear]))
 */
export function oasClawback(
  netIncome: number,
  incomeYear: number,
  annualOasReceived: number,
  config: YearConfig = DEFAULT_CONFIG,
): number {
  const cfg = config.oas;
  const threshold = cfg.clawbackThresholdByIncomeYear[incomeYear];
  if (threshold === undefined) {
    throw new Error(`No OAS clawback threshold configured for income year ${incomeYear}`);
  }
  const recovery = cfg.clawbackRate * Math.max(0, netIncome - threshold);
  return Math.min(annualOasReceived, recovery);
}

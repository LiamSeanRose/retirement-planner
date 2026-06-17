/**
 * Dated config — FEDERAL (PBSA / OSFI) LIF maximum-withdrawal factors for 2026.
 *
 * A LIF (Life Income Fund) is a locked-in RRIF: it has both a MANDATORY MINIMUM (same as the RRIF
 * minimum, see rrif-factors) AND a MAXIMUM annual withdrawal — the defining difference from a RRIF.
 * A PSPP *transfer value* is FEDERALLY regulated, so the federal LIF rules apply.
 *
 * The maximum % is reference-rate-dependent (CANSIM long-Canada bond yield; 3.49% for 2026) and is
 * republished each year — re-verify against OSFI. It rises to 100% at 89+ (the fund must be able to
 * deplete by ~90). ⚠️ Sourced from LifeAnnuities.com's 2026 federal table; one secondary source gave
 * different anchors, so confirm against the OSFI life-income-funds guidance before relying on it.
 */

export interface LifFactorConfig {
  asOf: string;
  /** Federal LIF maximum withdrawal % of the Jan-1 balance, by age. 89+ = 100%. */
  maxWithdrawalPctByAge: Record<number, number>;
}

export const LIF_FACTORS_2026: LifFactorConfig = {
  asOf: '2026',
  maxWithdrawalPctByAge: {
    55: 4.88, 56: 5.15, 57: 5.21, 58: 5.27, 59: 5.34,
    60: 5.42, 61: 5.5, 62: 5.59, 63: 5.68, 64: 5.79,
    65: 5.91, 66: 6.04, 67: 6.19, 68: 6.35, 69: 6.53,
    70: 6.73, 71: 6.96, 72: 7.22, 73: 7.52, 74: 7.86,
    75: 8.27, 76: 8.73, 77: 9.26, 78: 9.88, 79: 10.62,
    80: 11.5, 81: 12.59, 82: 13.95, 83: 15.7, 84: 18.03,
    85: 21.3, 86: 26.22, 87: 34.41, 88: 50.8, 89: 100,
  },
};

/** Federal LIF maximum-withdrawal factor (fraction of Jan-1 balance) for a holder of `age`. */
export function lifMaxFactor(age: number, cfg: LifFactorConfig = LIF_FACTORS_2026): number {
  const a = Math.floor(age);
  if (a < 55) return cfg.maxWithdrawalPctByAge[55] / 100; // LIF generally not available before 55 federally
  const capped = Math.min(a, 89);
  return cfg.maxWithdrawalPctByAge[capped] / 100;
}

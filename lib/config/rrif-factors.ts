/**
 * Dated config — RRIF minimum-withdrawal factors (post-1992 RRIFs).
 *
 * For ages UNDER 71 the prescribed factor is the formula 1 / (90 − age); from 71 on it is a
 * legislated per-age percentage of the Jan-1 fair-market value. Values below are the official
 * non-Quebec percentages, cross-checked against the plan §6 / edge-cases §5 tables.
 *
 * These are 2026 figures — re-verify against canada.ca / CRA each year. Never inline them.
 */

export interface RrifFactorConfig {
  asOf: string;
  /** For ages < 71, factor = 1 / (under71AgeBase − age). The base is the legislated 90. */
  under71AgeBase: number;
  /** Legislated minimum-withdrawal percentage of the Jan-1 balance, by age 71..95 (95 = 95+). */
  minWithdrawalPctByAge: Record<number, number>;
}

export const RRIF_FACTORS_2026: RrifFactorConfig = {
  asOf: '2026',
  under71AgeBase: 90,
  minWithdrawalPctByAge: {
    71: 5.28,
    72: 5.4,
    73: 5.53,
    74: 5.67,
    75: 5.82,
    76: 5.98,
    77: 6.17,
    78: 6.36,
    79: 6.58,
    80: 6.82,
    81: 7.08,
    82: 7.38,
    83: 7.71,
    84: 8.08,
    85: 8.51,
    86: 8.99,
    87: 9.55,
    88: 10.21,
    89: 10.99,
    90: 11.92,
    91: 13.06,
    92: 14.49,
    93: 16.34,
    94: 18.79,
    95: 20.0, // 95 and older
  },
};

/**
 * RRIF minimum-withdrawal factor as a fraction of the Jan-1 balance, for a holder of the given
 * age at the start of the year. Under 71 uses 1/(90−age); 71+ uses the legislated table (capped at 95+).
 */
export function rrifFactor(ageAtStartOfYear: number, cfg: RrifFactorConfig = RRIF_FACTORS_2026): number {
  const age = Math.floor(ageAtStartOfYear);
  if (age < 71) return 1 / (cfg.under71AgeBase - age);
  const capped = Math.min(age, 95);
  return cfg.minWithdrawalPctByAge[capped] / 100;
}

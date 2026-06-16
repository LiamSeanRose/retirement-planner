/**
 * Dated config — 2026 constants for the FEDERAL Public Service Pension Plan (PSPP)
 * and related federal benefits (CPP, OAS).
 *
 * FEDERAL ONLY. Do not mix in rules from similarly named provincial plans (BC PSPP,
 * Alberta PSPP, NS PSSP). The federal plan has NO rule of 85. See the project notes guardrail.
 *
 * Every value here is a 2026 figure set/indexed/legislated annually. Re-verify each year
 * against canada.ca / PSPC / CRA / Service Canada. Never inline these numbers elsewhere.
 *
 * Sourced June 16, 2026 (see docs/ References).
 */

export interface PensionConfig {
  /** Accrual rate applied to best-5 salary up to the AMPE breakpoint (coordinated with CPP). */
  accrualUpToAmpe: number;
  /** Accrual rate applied to best-5 salary above the AMPE breakpoint. */
  accrualAboveAmpe: number;
  /** Bridge-benefit accrual rate (up to AMPE), paid before 65 only. */
  bridgeAccrual: number;
  /** Salary breakpoint between the two accrual tiers: 5-yr average of the YMPE. */
  ampe: number;
  /** Year's Maximum Pensionable Earnings (CPP) for the config year. */
  ympe: number;
  /** Year's Additional Maximum Pensionable Earnings (CPP2 second ceiling). */
  yampe: number;
  /** Pensionable-service cap, in years. */
  maxServiceYears: number;
  /** Per-year-short early-retirement reduction rate (annual allowance). */
  reductionPerYear: number;
  /** Default annual CPI indexing rate (assumption; user-adjustable). */
  defaultIndexingPct: number;
}

export interface CppConfig {
  earliestStartAge: number;
  latestStartAge: number;
  /** Reduction per month for starting before 65. */
  reductionPerMonthBefore65: number;
  /** Increase per month for starting after 65. */
  increasePerMonthAfter65: number;
  /** Maximum monthly retirement benefit at 65 (reference only; CPP is taken as input). */
  maxMonthlyAt65: number;
}

export interface OasConfig {
  startAge: number;
  latestStartAge: number;
  /** Deferral increase per month past 65. */
  deferralPerMonth: number;
  /** Maximum deferral months (65 -> 70). */
  maxDeferralMonths: number;
  /** Maximum monthly amount, ages 65-74. */
  maxMonthly65to74: number;
  /** Additional bump applied at age 75+. */
  bump75Pct: number;
  /** Recovery-tax (clawback) rate on net income above the threshold. */
  clawbackRate: number;
  /**
   * Clawback threshold keyed by INCOME year. Clawback on a July-June payment period runs off
   * the PRIOR tax year's net world income (one-year lag) — wire it that way, not same-year.
   */
  clawbackThresholdByIncomeYear: Record<number, number>;
}

export interface YearConfig {
  /** Human-readable "rules current as of" stamp to surface in-app. */
  asOf: string;
  year: number;
  pension: PensionConfig;
  cpp: CppConfig;
  oas: OasConfig;
}

// YMPE history used to derive the 2026 AMPE (5-yr average of YMPE 2022-2026):
// 64,900 / 66,600 / 68,500 / 71,300 / 74,600 -> 69,180.
export const CONFIG_2026: YearConfig = {
  asOf: '2026-06-16',
  year: 2026,
  pension: {
    accrualUpToAmpe: 0.01375,
    accrualAboveAmpe: 0.02,
    bridgeAccrual: 0.00625,
    ampe: 69_180,
    ympe: 74_600,
    yampe: 85_000,
    maxServiceYears: 35,
    reductionPerYear: 0.05,
    defaultIndexingPct: 0.02,
  },
  cpp: {
    earliestStartAge: 60,
    latestStartAge: 70,
    reductionPerMonthBefore65: 0.006,
    increasePerMonthAfter65: 0.007,
    maxMonthlyAt65: 1_507.65,
  },
  oas: {
    startAge: 65,
    latestStartAge: 70,
    deferralPerMonth: 0.006,
    maxDeferralMonths: 60,
    maxMonthly65to74: 742.31,
    bump75Pct: 0.1,
    clawbackRate: 0.15,
    clawbackThresholdByIncomeYear: {
      2025: 93_454,
      2026: 95_323,
    },
  },
};

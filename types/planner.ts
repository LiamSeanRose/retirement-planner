/**
 * Canonical planner data model (plan §12). The household, the scenario levers, and the
 * year-by-year result shapes that the projection produces and the analysis layer composes.
 *
 * Path types (`YearPath`, `ReturnPath`) are owned by `lib/paths` — imported and re-exported
 * here so consumers can take the whole model from one place, never redefined. `Group` and
 * `Province` are owned by `lib/types`, likewise re-exported.
 *
 * Single mode = a household with `memberB` omitted.
 */

import type { Group, Province } from '../lib/types';
import type { YearPath } from '../lib/paths';

export type { Group, Province } from '../lib/types';
export type { YearPath, ReturnPath } from '../lib/paths';

/**
 * A year of path conditions that may additionally carry PER-ACCOUNT-TYPE returns. A plain
 * `YearPath` (no `returnByType`) is a valid `YearReturns`, so every existing `ReturnPath` is still
 * a `ReturnPathByType` — the projection grows each account type by its own return when present, and
 * falls back to the single `returnPct` otherwise.
 */
export interface YearReturns extends YearPath {
  returnByType?: { rrsp: number; tfsa: number; nonReg: number };
}
export type ReturnPathByType = YearReturns[];

/** Which member (or jointly) owns an account — drives splitting + survivor logic in couple mode. */
export type Owner = 'memberA' | 'memberB' | 'joint';

/** The three account tax-wrappers modelled. */
export type AccountType = 'rrsp' | 'tfsa' | 'nonReg';

export interface Member {
  /** Display name. */
  label?: string;
  birthDate: string;
  /** Plan-join date → pension group (override-able for the re-employment edge, §4). */
  planJoinDate: string;
  group?: Group;
  currentSalary: number;
  bestFiveAvgSalary: number;
  pensionableServiceYears: number;
  targetRetirementAge: number;
  /** Estimated CPP at 65 from the Service Canada statement (§5) — taken as input, not recomputed. */
  estimatedCppAt65Monthly: number;
  oasEligible: boolean;
}

export interface Account {
  id: string;
  owner: Owner;
  type: AccountType;
  currentBalance: number;
  /** Expected return % and volatility (stdev) %, used by the Monte Carlo layer (§20). */
  riskProfile: { expectedReturn: number; volatility: number };
}

export interface Household {
  province: Province; // drives the cross-provincial tax matrix (§7)
  memberA: Member;
  memberB?: Member; // omit for single mode; enables splitting + survivor logic
  accounts: Account[]; // owner-tagged, unlimited count
}

/** Scenario toggles — the levers the "Scenario Lab" exposes (§18, §21). */
export interface Scenario {
  cppStartAge: { memberA: number; memberB?: number }; // 60..70
  oasStartAge: { memberA: number; memberB?: number }; // 65..70
  meltdown: { mode: 'none' | 'conservative' | 'moderate' | 'aggressive' | 'custom'; startAge?: number };
  /** Decumulation order; defaults to the §20 heuristic (non-reg → RRSP → TFSA) when omitted. */
  withdrawalOrder?: AccountType[];
  assumptions: {
    inflationPct: number;
    indexingPct: number;
    endAge: number;
    mode: 'deterministic' | 'monteCarlo';
    runs?: number;
    /**
     * Optional annual spending the drawdown funds (year-0 dollars, grown by inflation). Extends
     * §12 so the projection can size discretionary withdrawals and report `lastsToEndAge`.
     * Omitted ⇒ no discretionary withdrawals (only mandatory RRIF minimums draw accounts down).
     */
    targetAnnualSpending?: number;
    /**
     * Variable retirement spending across the "go-go / slow-go / no-go" phases (the empirical pattern
     * that spending holds early then tapers with age). Scales `targetAnnualSpending`: 100% in the
     * go-go years, `slowGoPct` from `slowGoAge`, `noGoPct` from `noGoAge`. Omitted ⇒ flat spending.
     */
    spendingPhases?: {
      slowGoAge: number; // e.g. 75
      noGoAge: number; // e.g. 85
      slowGoPct: number; // fraction of the go-go base, e.g. 0.85
      noGoPct: number; // e.g. 0.70
    };
  };
  events: {
    /** WFA/VDP package → taxable Transition Support Measure lump sum in the departure year (§18). */
    wfaPackage?: { member: 'memberA' | 'memberB'; tsmPayoutWeeks: number; departureAge: number };
    /** ERI waiver → waive the permanent early-retirement reduction (§18). */
    eriWaiver?: { member: 'memberA' | 'memberB' };
    secondCareerIncome?: { member: 'memberA' | 'memberB'; annualAmount: number; startAge: number; endAge: number };
    /** Triggers the survivor rule (§19) — couple mode. */
    earlyMortality?: { member: 'memberA' | 'memberB'; atAge: number };
  };
}

/** One simulated year. Income lines, the tax result, end-of-year balances, and net worth. */
export interface YearRow {
  year: number;
  ageA: number;
  ageB?: number;
  pension: number; // lifetime pension (continues past 65)
  bridge: number; // bridge benefit (pre-65 only; steps down to 0 at 65)
  cpp: number;
  oas: number;
  secondCareer: number; // second-career / consulting income (§18)
  lumpSum: number; // WFA/TSM cash event (§18)
  rrifMin: number; // mandatory RRIF minimum (taxable)
  rrifExtra: number; // discretionary registered withdrawal (taxable)
  tfsaWd: number; // TFSA withdrawal (tax-free, excluded from net income)
  nonRegInc: number; // non-registered withdrawal / realization (cash)
  taxableIncome: number;
  tax: number;
  oasClawback: number;
  afterTax: number; // spendable cash after tax and clawback
  filingStatus: 'couple' | 'single'; // flips on the survivor transition (§19)
  balances: Record<AccountType, number>;
  netWorth: number;
}

export interface PercentileBand {
  age: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface DistributionSummary {
  p5: number;
  p50: number;
  p95: number;
  mean: number;
}

/** Monte Carlo aggregate over N runs (plan §12); populated only in Monte Carlo mode. */
export interface MonteCarloResult {
  probabilityOfSuccess: number; // % of runs lasting to the end age
  netWorth: PercentileBand[];
  afterTax: PercentileBand[];
  estateValue: DistributionSummary;
  lifetimeTax: DistributionSummary;
}

/** Result of ONE run over ONE path (deterministic, or the median under Monte Carlo). */
export interface ScenarioResult {
  scenario: Scenario;
  reductionPct: { memberA: number; memberB?: number };
  rows: YearRow[];
  totals: {
    lifetimeAfterTax: number;
    lifetimeTax: number;
    oasRetained: number;
    estateValue: number;
    lastsToEndAge: boolean;
  };
  cppBreakEvenAge?: number;
  oasBreakEvenAge?: number;
  monteCarlo?: MonteCarloResult;
}

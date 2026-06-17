/**
 * Strategy module — the rule-based logic that drives discretionary withdrawals (plan §8).
 *
 * Pure helpers over primitive inputs / current-year state; the projection wires them into the
 * year loop later. Three pieces:
 *   - meltdownWithdrawal  — RRSP/RRIF bracket-fill with an OAS-clawback guard.
 *   - withdrawalSequence  — drain accounts in a given order to fund a cash need.
 *   - cppOasTimingCompare — compare CPP/OAS start-age choices on lifetime income + break-even.
 *
 * All rates/brackets/thresholds come from the dated config (lib/config) — never inlined here.
 */

import { DEFAULT_CONFIG, type YearConfig } from '../config';
import { TAX_CONFIG_2026, type Province, type TaxBracket, type TaxConfig } from '../config/tax-2026';
import { cppMonthlyAtStart } from '../cpp';
import { oasMonthly } from '../oas';
import { totalTax } from '../tax';

/** Most-recent configured OAS recovery-tax threshold (from lib/config) — the meltdown's default guard. */
const DEFAULT_OAS_THRESHOLD = (() => {
  const map = DEFAULT_CONFIG.oas.clawbackThresholdByIncomeYear;
  return map[Math.max(...Object.keys(map).map(Number))];
})();

/**
 * Top of the bracket that the NEXT dollar of `income` falls into (the income ceiling at the
 * current marginal rate). Income at a boundary belongs to the upper bracket. Top bracket = ∞.
 */
export function bracketTop(income: number, brackets: TaxBracket[]): number {
  const x = Math.max(0, income);
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (x < upper) return upper;
  }
  return Infinity;
}

export interface MeltdownOpts {
  /** Tax config providing federal (and provincial) brackets; defaults to the dated 2026 config. */
  taxConfig?: TaxConfig;
  /** Cap the withdrawal at the available registered balance (default: unlimited). */
  available?: number;
  /** Apply the OAS-clawback guard (default true). */
  oasGuard?: boolean;
  /** OAS clawback threshold for the guard; defaults to the latest configured threshold. */
  oasClawbackThreshold?: number;
  /** Also stop at the current PROVINCIAL bracket top (lower of fed/prov edge). Default false. */
  respectProvincialBracket?: boolean;
}

/**
 * RRSP/RRIF amount to withdraw this year to FILL the current federal bracket to its top — never
 * beyond (overshooting into a higher bracket defeats the meltdown). An OAS-clawback GUARD caps the
 * target at the clawback threshold unless base income already exceeds it. Optionally also stops at
 * the current provincial bracket edge, and at the available registered balance.
 *
 * @param currentTaxableIncome base taxable income for the year, BEFORE this withdrawal.
 */
export function meltdownWithdrawal(
  currentTaxableIncome: number,
  province: Province,
  opts: MeltdownOpts = {},
): number {
  const config = opts.taxConfig ?? TAX_CONFIG_2026;
  const income = Math.max(0, currentTaxableIncome);

  let target = bracketTop(income, config.federal.brackets);
  if (opts.respectProvincialBracket) {
    target = Math.min(target, bracketTop(income, config.provinces[province].brackets));
  }

  // OAS guard: don't push income past the clawback threshold (unless it is already past it).
  const guard = opts.oasGuard ?? true;
  if (guard) {
    const threshold = opts.oasClawbackThreshold ?? DEFAULT_OAS_THRESHOLD;
    if (income < threshold) target = Math.min(target, threshold);
  }

  const room = Math.max(0, target - income);
  const available = opts.available ?? Infinity;
  return Math.min(room, Math.max(0, available));
}

export interface Balances {
  rrsp: number;
  tfsa: number;
  nonReg: number;
}

export type AccountKind = keyof Balances;

/** §20 default decumulation order: non-registered first, RRSP/RRIF next, TFSA last. */
export const DEFAULT_WITHDRAWAL_ORDER: AccountKind[] = ['nonReg', 'rrsp', 'tfsa'];

export interface SequenceResult {
  /** Amount drawn from each account. */
  draws: Balances;
  /** Total drawn (= need − shortfall). */
  total: number;
  /** Unmet need if the accounts could not cover it. */
  shortfall: number;
}

/**
 * Fund a cash `need` by drawing from `balances` in `order`, never exceeding any balance. Returns
 * the per-account draws, the total funded, and any shortfall.
 */
export function withdrawalSequence(
  need: number,
  balances: Balances,
  order: AccountKind[] = DEFAULT_WITHDRAWAL_ORDER,
): SequenceResult {
  const draws: Balances = { rrsp: 0, tfsa: 0, nonReg: 0 };
  let remaining = Math.max(0, need);
  for (const account of order) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Math.max(0, balances[account] - draws[account]));
    draws[account] += take;
    remaining -= take;
  }
  return { draws, total: Math.max(0, need) - remaining, shortfall: remaining };
}

export interface TimingChoice {
  cppStartAge: number;
  oasStartAge: number;
}

export interface TimingInputs {
  /** Estimated CPP at 65 from the Service Canada statement (§5). */
  estimatedCppAt65Monthly: number;
  /** Whether OAS is received at all (default true). */
  oasEligible?: boolean;
  optionA: TimingChoice;
  optionB: TimingChoice;
  /** Horizon to accumulate lifetime income to (default 90). */
  toAge?: number;
  config?: YearConfig;
}

export interface TimingOptionResult {
  choice: TimingChoice;
  lifetimeTotal: number;
}

export interface TimingComparison {
  a: TimingOptionResult;
  b: TimingOptionResult;
  /** Which option yields more cumulative CPP+OAS by `toAge`. */
  better: 'a' | 'b' | 'equal';
  /** Age at which the initially-trailing option overtakes the other; null if no crossover by toAge. */
  breakEvenAge: number | null;
}

/**
 * Compare two CPP/OAS start-age choices on cumulative lifetime income and the approximate
 * break-even age (where the option that starts behind overtakes the one that starts ahead).
 * Uses the start-age factors from lib/cpp / lib/oas. CPP/OAS are held at their start-age nominal
 * amounts (CPI indexing is a later refinement and nets out of the break-even comparison).
 */
export function cppOasTimingCompare(inputs: TimingInputs): TimingComparison {
  const { estimatedCppAt65Monthly: est, optionA, optionB } = inputs;
  const oasEligible = inputs.oasEligible ?? true;
  const toAge = inputs.toAge ?? 90;
  const config = inputs.config ?? DEFAULT_CONFIG;

  const annual = (choice: TimingChoice, age: number): number => {
    const cpp = age >= choice.cppStartAge ? cppMonthlyAtStart(est, choice.cppStartAge, config) * 12 : 0;
    const oas = oasEligible && age >= choice.oasStartAge ? oasMonthly(choice.oasStartAge, age, config) * 12 : 0;
    return cpp + oas;
  };

  const startAge = Math.min(
    optionA.cppStartAge,
    optionA.oasStartAge,
    optionB.cppStartAge,
    optionB.oasStartAge,
  );

  let cumA = 0;
  let cumB = 0;
  let leaderSign = 0; // sign of (cumA − cumB) at the first age they diverge
  let breakEvenAge: number | null = null;
  for (let age = startAge; age <= toAge; age++) {
    cumA += annual(optionA, age);
    cumB += annual(optionB, age);
    const diff = cumA - cumB;
    if (leaderSign === 0) {
      if (diff !== 0) leaderSign = Math.sign(diff);
    } else if (breakEvenAge === null && Math.sign(diff) === -leaderSign) {
      breakEvenAge = age; // the trailing option has overtaken
    }
  }

  const better = cumA > cumB ? 'a' : cumB > cumA ? 'b' : 'equal';
  return {
    a: { choice: optionA, lifetimeTotal: cumA },
    b: { choice: optionB, lifetimeTotal: cumB },
    better,
    breakEvenAge,
  };
}

// --- Meltdown year-policy: bracket-fill withdrawal + RRSP→TFSA pipeline --------------------------

export interface MeltdownPolicyInput {
  /** Base taxable income for the year, BEFORE the meltdown withdrawal. */
  baseTaxableIncome: number;
  province: Province;
  /** Current age — available to the projection to gate the meltdown window (echoed in the result). */
  age: number;
  /** RRSP/RRIF balance available to withdraw this year. */
  registeredBalance: number;
  /** OAS recovery-tax threshold for the guard — the caller supplies the year's value from config. */
  oasClawbackThreshold: number;
  /** Discretionary cash already needed this year (funded first); the remainder feeds the TFSA. Default 0. */
  spendingNeed?: number;
  /** Also stop at the provincial bracket edge (lower of fed/prov). Default false. */
  respectProvincialBracket?: boolean;
  /** Tax config (brackets); defaults to the dated 2026 config. */
  taxConfig?: TaxConfig;
}

export interface MeltdownPolicyResult {
  age: number;
  /** RRSP/RRIF withdrawal to fill the bracket — guarded and capped at the available balance. */
  withdrawal: number;
  /** The bracket ceiling targeted (federal, or min(fed, prov) when respectProvincialBracket). */
  bracketCeiling: number;
  /** The OAS-clawback threshold used as the guard. */
  guardThreshold: number;
  /** True when the OAS guard capped the fill below the bracket ceiling. */
  guardBinding: boolean;
  /** Incremental income tax caused by the withdrawal (real federal + provincial, from lib/tax). */
  incrementalTax: number;
  /** Base income + withdrawal — the resulting taxable income. */
  newTaxableIncome: number;
  /** After-tax proceeds not needed for spending, redirected into the TFSA (the RRSP→TFSA pipeline). */
  tfsaPipeline: number;
}

/**
 * The full meltdown year-policy the projection (and the optimizer) call: how much RRSP/RRIF to draw
 * this year to fill the current federal bracket to its top — never beyond — capped by the OAS-clawback
 * guard (unless base income already exceeds the threshold) and by the available registered balance;
 * plus the RRSP→TFSA pipeline, the after-tax proceeds beyond the year's spending need that are
 * redirected into the TFSA to keep compounding tax-free. All bracket/tax numbers come from lib/tax /
 * lib/config; the threshold is supplied by the caller. Pure.
 */
export function meltdownPolicy(input: MeltdownPolicyInput): MeltdownPolicyResult {
  const config = input.taxConfig ?? TAX_CONFIG_2026;
  const base = Math.max(0, input.baseTaxableIncome);
  const threshold = input.oasClawbackThreshold;

  const fedTop = bracketTop(base, config.federal.brackets);
  const provTop = input.respectProvincialBracket
    ? bracketTop(base, config.provinces[input.province].brackets)
    : Infinity;
  const bracketCeiling = Math.min(fedTop, provTop);
  // The OAS guard binds only when base is under the threshold AND the threshold sits below the ceiling.
  const guardBinding = base < threshold && threshold < bracketCeiling;

  const withdrawal = meltdownWithdrawal(base, input.province, {
    taxConfig: config,
    available: Math.max(0, input.registeredBalance),
    oasGuard: true,
    oasClawbackThreshold: threshold,
    respectProvincialBracket: input.respectProvincialBracket,
  });

  const newTaxableIncome = base + withdrawal;
  // Real incremental tax the withdrawal stacks on top of base income (age gates the 65+ age amount).
  const incrementalTax =
    totalTax(newTaxableIncome, input.province, { age: input.age }) -
    totalTax(base, input.province, { age: input.age });

  const afterTaxProceeds = Math.max(0, withdrawal - incrementalTax);
  const spendingNeed = Math.max(0, input.spendingNeed ?? 0);
  const tfsaPipeline = Math.max(0, afterTaxProceeds - spendingNeed);

  return {
    age: input.age,
    withdrawal,
    bracketCeiling,
    guardThreshold: threshold,
    guardBinding,
    incrementalTax,
    newTaxableIncome,
    tfsaPipeline,
  };
}

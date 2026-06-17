/**
 * Estate projector (`/lib/estate`) — the after-tax estate value at death, the meltdown's headline
 * metric (plan §10 "Estate projector"; edge-cases §5 "At death").
 *
 * Terminal tax = the income tax triggered on the final return by winding up the accounts:
 *  - Registered (RRSP/RRIF/LIF): the FULL fair-market value is a deemed disposition added to income
 *    — UNLESS a spouse survives, in which case it rolls TAX-DEFERRED to them ($0 now).
 *  - Non-registered: accrued capital GAINS realize at 50% inclusion — likewise deferred (transfers
 *    at adjusted cost base) when a spouse survives.
 *  - TFSA: always passes tax-free.
 *
 * The real federal + provincial tax comes from `/lib/tax` (no rates inlined here). Pure functions;
 * inputs are primitive, so this module stays independent of the household types.
 */

import { totalTax, type CreditOpts, type Province } from '../tax';

export type { Province };

/**
 * Capital-gains inclusion rate for the deemed disposition of non-registered assets at death: 50% for
 * 2026 (the proposed 66.67% hike was cancelled in March 2025). Dated — re-verify yearly; belongs in
 * the shared dated config once this module is wired into it.
 */
const NON_REG_INCLUSION_RATE = 0.5;

/** Account fair-market values at death. Registered = RRSP + RRIF + LIF/LIRA. */
export interface EstateBalances {
  /** RRSP / RRIF / LIF FMV — deemed disposition into income unless it rolls to a surviving spouse. */
  registered: number;
  /** Non-registered market value (only the accrued GAIN is taxed; see accruedNonRegGain). */
  nonRegistered: number;
  /** TFSA — passes tax-free. */
  tfsa: number;
}

/** The pieces of a final (date-of-death) return needed to size the terminal tax. */
export interface FinalReturn {
  /** RRSP/RRIF/LIF FMV at death. */
  registeredBalance: number;
  /** Unrealized capital gain in non-registered accounts (only the positive part is taxed). */
  accruedNonRegGain: number;
  province: Province;
  /** A surviving spouse defers everything (registered rollover + non-reg at cost) → $0 terminal tax. */
  hasSurvivingSpouse: boolean;
  /** Other income already on the final return (pension/CPP to date of death). Default 0. */
  otherTaxableIncome?: number;
  /** Age at death — only affects the 65+ age amount, which is fully ground away at these incomes. */
  ageAtDeath?: number;
}

/** Terminal-tax breakdown for one death. */
export interface EstateStage {
  totalBalances: number;
  terminalTax: number;
  afterTaxEstateValue: number;
}

/** Inputs describing one death in couple mode. */
export interface CoupleDeathInput {
  balances: EstateBalances;
  accruedNonRegGain: number;
  province: Province;
  otherTaxableIncome?: number;
  ageAtDeath?: number;
}

export interface CoupleEstateResult {
  /** First death: assets roll to the survivor tax-deferred → $0 terminal tax. */
  firstDeath: EstateStage;
  /** Second death: full deemed disposition on the survivor's estate. */
  secondDeath: EstateStage;
}

/**
 * Tax triggered at death by winding up the accounts (the "terminal tax bomb"). Computed as the
 * INCREMENTAL tax the deemed disposition stacks on top of any other final-return income, so it
 * reflects the real marginal brackets the disposition lands in. With a surviving spouse everything
 * rolls over and this is $0.
 */
export function terminalTax(finalReturn: FinalReturn): number {
  const { province, hasSurvivingSpouse } = finalReturn;
  const other = Math.max(0, finalReturn.otherTaxableIncome ?? 0);

  // A surviving spouse defers the registered rollover AND the non-registered gain (transfer at ACB).
  const deemedRegistered = hasSurvivingSpouse ? 0 : Math.max(0, finalReturn.registeredBalance);
  const realizedGain = hasSurvivingSpouse ? 0 : Math.max(0, finalReturn.accruedNonRegGain);
  const dispositionIncome = deemedRegistered + NON_REG_INCLUSION_RATE * realizedGain;
  if (dispositionIncome <= 0) return 0;

  const opts: CreditOpts = { age: finalReturn.ageAtDeath };
  return totalTax(other + dispositionIncome, province, opts) - totalTax(other, province, opts);
}

function stage(
  balances: EstateBalances,
  accruedNonRegGain: number,
  province: Province,
  hasSurvivingSpouse: boolean,
  otherTaxableIncome?: number,
  ageAtDeath?: number,
): EstateStage {
  const totalBalances = balances.registered + balances.nonRegistered + balances.tfsa;
  const tax = terminalTax({
    registeredBalance: balances.registered,
    accruedNonRegGain,
    province,
    hasSurvivingSpouse,
    otherTaxableIncome,
    ageAtDeath,
  });
  return { totalBalances, terminalTax: tax, afterTaxEstateValue: totalBalances - tax };
}

/**
 * After-tax estate value = total account balances − terminal tax. TFSA is in the total but never
 * taxed; registered/non-reg tax is suppressed when a spouse survives (full rollover).
 */
export function afterTaxEstateValue(
  balances: EstateBalances,
  accruedNonRegGain: number,
  province: Province,
  opts: { hasSurvivingSpouse: boolean; otherTaxableIncome?: number; ageAtDeath?: number },
): number {
  return stage(
    balances,
    accruedNonRegGain,
    province,
    opts.hasSurvivingSpouse,
    opts.otherTaxableIncome,
    opts.ageAtDeath,
  ).afterTaxEstateValue;
}

/**
 * Couple-mode estate in two stages: the FIRST death rolls everything to the survivor tax-deferred
 * ($0 terminal tax), then the SECOND death is the full deemed disposition on the survivor's estate.
 * Each death's balances are supplied by the caller (the projection tracks how assets move and grow
 * between the two deaths).
 */
export function coupleEstate(
  firstDeath: CoupleDeathInput,
  secondDeath: CoupleDeathInput,
): CoupleEstateResult {
  return {
    firstDeath: stage(
      firstDeath.balances,
      firstDeath.accruedNonRegGain,
      firstDeath.province,
      true, // a spouse survives the first death
      firstDeath.otherTaxableIncome,
      firstDeath.ageAtDeath,
    ),
    secondDeath: stage(
      secondDeath.balances,
      secondDeath.accruedNonRegGain,
      secondDeath.province,
      false, // no surviving spouse at the second death
      secondDeath.otherTaxableIncome,
      secondDeath.ageAtDeath,
    ),
  };
}

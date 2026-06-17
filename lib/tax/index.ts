/**
 * Tax engine — federal + provincial income tax, credits, Ontario surtax + health premium, and
 * automated pension income splitting. Pure functions, no React/IO. Inputs are primitive (numbers
 * + a province code) so this module has no dependency on the household types.
 *
 * Constants come from the dated config (lib/config/tax-2026) — never inline rates here. Federal +
 * Ontario are verified; other provinces are flagged unverified in the config. See plan §7 /
 * edge-cases §6.
 */

import {
  ONTARIO_HEALTH_PREMIUM,
  TAX_CONFIG_2026,
  type FederalTax,
  type Province,
  type TaxBracket,
  type TaxConfig,
} from '../config/tax-2026';

export type { Province };

export interface CreditOpts {
  /** Net income for income-tested credits (defaults to taxable income). */
  netIncome?: number;
  /** Age at year-end — gates the 65+ age amount. */
  age?: number;
  /** Eligible pension income for the pension income amount credit. */
  eligiblePensionIncome?: number;
}

/** Marginal bracket tax on an amount of taxable income. */
export function bracketTax(income: number, brackets: TaxBracket[]): number {
  if (income <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (income <= lower) break;
    tax += (Math.min(income, upper) - lower) * b.rate;
    lower = upper;
  }
  return tax;
}

/** Age amount (65+), reduced as net income exceeds the threshold; 0 below 65 or once fully ground down. */
function ageAmount(netIncome: number, age: number, max: number, threshold: number, rate: number): number {
  if (age < 65) return 0;
  return Math.max(0, max - Math.max(0, netIncome - threshold) * rate);
}

/**
 * Federal basic personal amount with the high-income grind: the enhanced BPA reduces linearly from
 * `basicPersonalAmount` to `basicPersonalAmountMin` as net income runs from `bpaGrindStart` to
 * `bpaGrindEnd` (the 29%→33% bracket band; the CRA enhanced-BPA phase-out).
 */
export function federalBasicPersonalAmount(netIncome: number, f: FederalTax): number {
  if (netIncome <= f.bpaGrindStart) return f.basicPersonalAmount;
  if (netIncome >= f.bpaGrindEnd) return f.basicPersonalAmountMin;
  const frac = (netIncome - f.bpaGrindStart) / (f.bpaGrindEnd - f.bpaGrindStart);
  return f.basicPersonalAmount - (f.basicPersonalAmount - f.basicPersonalAmountMin) * frac;
}

/** Net federal tax after non-refundable credits (BPA with grind + age amount + pension income amount). */
export function federalTax(taxableIncome: number, opts: CreditOpts = {}, config: TaxConfig = TAX_CONFIG_2026): number {
  const f = config.federal;
  const netIncome = opts.netIncome ?? taxableIncome;
  const grossCredits =
    federalBasicPersonalAmount(netIncome, f) +
    ageAmount(netIncome, opts.age ?? 0, f.ageAmountMax, f.ageAmountThreshold, f.ageAmountReductionRate) +
    Math.min(opts.eligiblePensionIncome ?? 0, f.pensionIncomeAmount);
  return Math.max(0, bracketTax(taxableIncome, f.brackets) - grossCredits * f.creditRate);
}

/** Ontario Health Premium for a given taxable income (income-tested, max $900). */
export function ontarioHealthPremium(taxableIncome: number): number {
  for (const band of ONTARIO_HEALTH_PREMIUM) {
    const upper = band.upTo ?? Infinity;
    if (taxableIncome <= upper) {
      return Math.min(band.base + Math.max(0, taxableIncome - band.over) * band.marginal, band.cap);
    }
  }
  return 900;
}

/**
 * Net provincial tax after credits, INCLUDING the Ontario surtax (on tax after credits) and the
 * Ontario Health Premium (on taxable income). Provinces flagged `verified: false` in the config use
 * unconfirmed bracket values — treat their output as provisional.
 */
export function provincialTax(
  taxableIncome: number,
  province: Province,
  opts: CreditOpts = {},
  config: TaxConfig = TAX_CONFIG_2026,
): number {
  const p = config.provinces[province];
  const netIncome = opts.netIncome ?? taxableIncome;
  const grossCredits =
    p.basicPersonalAmount +
    (p.ageAmountMax ? ageAmount(netIncome, opts.age ?? 0, p.ageAmountMax, p.ageAmountThreshold ?? Infinity, 0.15) : 0) +
    (p.pensionIncomeAmount ? Math.min(opts.eligiblePensionIncome ?? 0, p.pensionIncomeAmount) : 0);

  const afterCredits = Math.max(0, bracketTax(taxableIncome, p.brackets) - grossCredits * p.creditRate);
  let total = afterCredits;
  if (p.surtax) {
    for (const tier of p.surtax) {
      total += Math.max(0, afterCredits - tier.overProvincialTax) * tier.rate;
    }
  }
  if (p.hasHealthPremium) total += ontarioHealthPremium(taxableIncome);
  return total;
}

/**
 * Combined federal + provincial tax for one person. Quebec residents get the 16.5% federal abatement
 * (a reduction of BASIC federal tax) before the Quebec provincial tax is added.
 */
export function totalTax(taxableIncome: number, province: Province, opts: CreditOpts = {}, config: TaxConfig = TAX_CONFIG_2026): number {
  const abatement = config.provinces[province].federalAbatementRate ?? 0;
  return federalTax(taxableIncome, opts, config) * (1 - abatement) + provincialTax(taxableIncome, province, opts, config);
}

/** One person's income, split by how each source is treated for pension income splitting. */
export interface TaxProfile {
  age: number;
  /** Fully taxable, NOT splittable: CPP, OAS, RRSP withdrawals, employment, interest, etc. */
  ordinaryIncome: number;
  /** RPP / superannuation (the PSPP pension): eligible to split at ANY age. */
  psppPension: number;
  /** RRIF / LIF income: eligible to split only if the transferring spouse is 65+. */
  rrifIncome: number;
}

const totalIncome = (m: TaxProfile) => m.ordinaryIncome + m.psppPension + m.rrifIncome;
/** Pension income eligible to be split FROM this member (RPP any age; RRIF only at 65+). */
const splittableEligible = (m: TaxProfile) => m.psppPension + (m.age >= 65 ? m.rrifIncome : 0);

export interface HouseholdTaxResult {
  tax: number;
  splitAmount: number;
  splitFraction: number;
  /** memberA/memberB taxable income after the optimal split. */
  taxableA: number;
  taxableB: number;
}

/**
 * Combined household tax, choosing the pension-income split (0–50% of the higher earner's eligible
 * pension, moved to the lower earner) that MINIMIZES total federal + provincial tax. The receiving
 * spouse can claim the pension credit on received pension only if they are 65+. Searches fractions
 * 0..0.5 in 5% steps (fine enough; exact optimum is monotone within a bracket).
 */
export function householdTaxWithSplitting(
  memberA: TaxProfile,
  memberB: TaxProfile,
  province: Province,
  config: TaxConfig = TAX_CONFIG_2026,
): HouseholdTaxResult {
  // Split from the higher-income spouse to the lower one (the only direction that can help).
  const [hi, lo] = totalIncome(memberA) >= totalIncome(memberB) ? [memberA, memberB] : [memberB, memberA];
  const splittable = splittableEligible(hi);

  let best: HouseholdTaxResult | null = null;
  for (let step = 0; step <= 10; step++) {
    const fraction = step * 0.05;
    const amount = splittable * fraction;

    const hiTaxable = totalIncome(hi) - amount;
    const loTaxable = totalIncome(lo) + amount;
    // Pension income eligible for each return's credit after the transfer.
    const hiEligible = Math.max(0, splittableEligible(hi) - amount) + (hi.age >= 65 ? 0 : 0);
    const loEligible = splittableEligible(lo) + (lo.age >= 65 ? amount : 0);

    const tax =
      totalTax(hiTaxable, province, { age: hi.age, eligiblePensionIncome: hiEligible }, config) +
      totalTax(loTaxable, province, { age: lo.age, eligiblePensionIncome: loEligible }, config);

    if (best === null || tax < best.tax) {
      best = {
        tax,
        splitAmount: amount,
        splitFraction: fraction,
        taxableA: hi === memberA ? hiTaxable : loTaxable,
        taxableB: hi === memberA ? loTaxable : hiTaxable,
      };
    }
  }
  return best!;
}

import { describe, expect, it } from 'vitest';
import { TAX_CONFIG_2026, type Province } from '../config/tax-2026';
import {
  bracketTax,
  federalTax,
  householdTaxWithSplitting,
  ontarioHealthPremium,
  provincialTax,
  totalTax,
} from './index';

const near = (a: number, b: number, tol = 0.5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const ALL: Province[] = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];

describe('config sanity', () => {
  it('covers all 13 provinces/territories with brackets', () => {
    for (const p of ALL) {
      expect(TAX_CONFIG_2026.provinces[p].brackets.length).toBeGreaterThan(0);
    }
  });
  it('ON, BC, AB are verified for 2026; the rest are flagged for confirmation', () => {
    const verified = ['ON', 'BC', 'AB'];
    for (const p of ALL) {
      expect(TAX_CONFIG_2026.provinces[p].verified).toBe(verified.includes(p));
    }
  });
});

describe('bracketTax', () => {
  it('is 0 at/below 0', () => {
    expect(bracketTax(0, TAX_CONFIG_2026.federal.brackets)).toBe(0);
  });
  it('federal first bracket: 14% flat below $58,523', () => {
    near(bracketTax(50_000, TAX_CONFIG_2026.federal.brackets), 7_000);
  });
});

describe('federalTax (after credits)', () => {
  it('$50k, under 65: 14% − BPA credit', () => {
    // 7,000 − 16,452×14% = 7,000 − 2,303.28 = 4,696.72
    near(federalTax(50_000), 4_696.72);
  });
  it('age 65+ lowers tax via the age amount', () => {
    expect(federalTax(50_000, { age: 70 })).toBeLessThan(federalTax(50_000, { age: 60 }));
  });
  it('age amount is fully phased out by ~$108k (age 70 == under 65 there)', () => {
    near(federalTax(120_000, { age: 70 }), federalTax(120_000, { age: 60 }));
  });
});

describe('Ontario provincial tax', () => {
  it('$50k: brackets − BPA credit + health premium, no surtax yet', () => {
    // 2,525 − 12,747×5.05% = 1,881.28 ; + $600 health premium = 2,481.28
    near(provincialTax(50_000, 'ON'), 2_481.28, 1);
  });
  it('$150k: surtax + health premium materially raise the bill', () => {
    near(provincialTax(150_000, 'ON'), 15_189.46, 2);
    // sanity: well above brackets-after-credits alone (~11,720) because of surtax
    expect(provincialTax(150_000, 'ON')).toBeGreaterThan(14_000);
  });
});

describe('ontarioHealthPremium (income-tested, max $900)', () => {
  it.each([
    [15_000, 0],
    [25_000, 300],
    [40_000, 450],
    [50_000, 600],
    [300_000, 900],
  ])('income %i -> $%i', (income, premium) => {
    near(ontarioHealthPremium(income), premium);
  });
});

describe('householdTaxWithSplitting', () => {
  const ON: Province = 'ON';

  it('splitting a large PSPP pension to a low-income spouse lowers combined tax', () => {
    const a = { age: 66, ordinaryIncome: 10_000, psppPension: 80_000, rrifIncome: 0 };
    const b = { age: 64, ordinaryIncome: 5_000, psppPension: 0, rrifIncome: 0 };
    const baseline = totalTax(90_000, ON, { age: 66, eligiblePensionIncome: 80_000 }) + totalTax(5_000, ON, { age: 64 });
    const split = householdTaxWithSplitting(a, b, ON);
    expect(split.tax).toBeLessThan(baseline);
    expect(split.splitAmount).toBeGreaterThan(0);
  });

  it('RPP (PSPP) pension is splittable at ANY age', () => {
    const a = { age: 58, ordinaryIncome: 0, psppPension: 70_000, rrifIncome: 0 };
    const b = { age: 56, ordinaryIncome: 0, psppPension: 0, rrifIncome: 0 };
    expect(householdTaxWithSplitting(a, b, ON).splitAmount).toBeGreaterThan(0);
  });

  it('RRIF income is NOT splittable before 65 (no benefit found)', () => {
    const a = { age: 60, ordinaryIncome: 0, psppPension: 0, rrifIncome: 60_000 };
    const b = { age: 60, ordinaryIncome: 0, psppPension: 0, rrifIncome: 0 };
    expect(householdTaxWithSplitting(a, b, ON).splitAmount).toBe(0);
  });

  it('RRIF income BECOMES splittable at 65+', () => {
    const a = { age: 66, ordinaryIncome: 0, psppPension: 0, rrifIncome: 60_000 };
    const b = { age: 66, ordinaryIncome: 0, psppPension: 0, rrifIncome: 0 };
    expect(householdTaxWithSplitting(a, b, ON).splitAmount).toBeGreaterThan(0);
  });
});

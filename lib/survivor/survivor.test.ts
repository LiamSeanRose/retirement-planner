import { describe, expect, it } from 'vitest';
import { householdFilingStatus, survivorAllowanceAnnual, survivorAllowanceMonthly } from './index';

describe('survivorAllowanceAnnual', () => {
  it('is 1% × service(≤35) × best-5 (= half the unreduced 2% lifetime)', () => {
    expect(survivorAllowanceAnnual({ pensionableServiceYears: 30, bestFiveAvgSalary: 100_000 })).toBeCloseTo(30_000, 6);
  });

  it('caps pensionable service at 35 years', () => {
    expect(survivorAllowanceAnnual({ pensionableServiceYears: 40, bestFiveAvgSalary: 100_000 })).toBeCloseTo(35_000, 6);
  });

  it('monthly is the annual ÷ 12', () => {
    const m = { pensionableServiceYears: 30, bestFiveAvgSalary: 100_000 };
    expect(survivorAllowanceMonthly(m)).toBeCloseTo(survivorAllowanceAnnual(m) / 12, 6);
  });
});

describe('householdFilingStatus', () => {
  it('files jointly only while a couple are both alive', () => {
    expect(householdFilingStatus(true, true)).toBe('couple');
    expect(householdFilingStatus(true, false)).toBe('single'); // a spouse has died → §19 flip
    expect(householdFilingStatus(false, true)).toBe('single'); // single-person household
  });
});

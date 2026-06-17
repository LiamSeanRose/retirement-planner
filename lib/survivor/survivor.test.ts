import { describe, expect, it } from 'vitest';
import { householdFilingStatus, survivorAllowanceAnnual, survivorAllowanceMonthly, survivorCppBenefitAnnual } from './index';
import { DEFAULT_CONFIG } from '../config';

const near = (a: number, b: number, tol = 1e-6): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

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

describe('survivorCppBenefitAnnual', () => {
  const maxAnnual = DEFAULT_CONFIG.cpp.maxMonthlyAt65 * 12;

  it('pays 60% of the deceased CPP when there is headroom under the combined max', () => {
    near(survivorCppBenefitAnnual(10_000, 2_000), 6_000); // 0.6 × 10,000, well under the cap
  });

  it('caps the survivor + own CPP at the combined-benefit maximum', () => {
    near(survivorCppBenefitAnnual(20_000, maxAnnual - 1_000), 1_000); // only 1,000 of headroom left
    expect(survivorCppBenefitAnnual(20_000, maxAnnual)).toBe(0); // survivor already at the max
  });
});

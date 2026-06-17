import { describe, expect, it } from 'vitest';
import { RRIF_FACTORS_2026, rrifFactor } from '../config/rrif-factors';
import {
  applyWithdrawal,
  capitalGainTaxableAmount,
  eligibleDividendTaxableAmount,
  growAccount,
  interestTaxableAmount,
  rrifMinimum,
  rrifWithholding,
  tfsaWithdrawal,
} from './index';

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('rrifFactor', () => {
  it('under 71 uses 1/(90−age)', () => {
    near(rrifFactor(55), 1 / 35); // 2.857%
    near(rrifFactor(60), 1 / 30); // 3.333%
    near(rrifFactor(65), 0.04); // exactly 4%
    near(rrifFactor(70), 0.05); // exactly 5%
  });
  it('71+ uses the legislated table', () => {
    near(rrifFactor(71), 0.0528);
    near(rrifFactor(72), 0.054);
    near(rrifFactor(85), 0.0851);
    near(rrifFactor(90), 0.1192);
  });
  it('95+ caps at 20%', () => {
    near(rrifFactor(95), 0.2);
    near(rrifFactor(101), 0.2);
  });
  it('factor table covers every age 71..95', () => {
    for (let age = 71; age <= 95; age++) {
      expect(RRIF_FACTORS_2026.minWithdrawalPctByAge[age]).toBeGreaterThan(0);
    }
  });
});

describe('rrifMinimum', () => {
  it('Jan-1 balance × factor', () => {
    near(rrifMinimum(100_000, 71), 5_280);
    near(rrifMinimum(100_000, 65), 4_000);
    near(rrifMinimum(200_000, 95), 40_000);
  });
  it('no minimum in the opening year', () => {
    expect(rrifMinimum(100_000, 72, { isOpeningYear: true })).toBe(0);
  });
});

describe('rrifWithholding (above the minimum only; single rate on the whole over-amount)', () => {
  it('no withholding when nothing is over the minimum', () => {
    expect(rrifWithholding(0)).toBe(0);
    expect(rrifWithholding(-100)).toBe(0);
  });
  it('10% up to $5k over', () => {
    near(rrifWithholding(4_000), 400);
    near(rrifWithholding(5_000), 500); // boundary stays in the 10% tier
  });
  it('20% between $5k and $15k over', () => {
    near(rrifWithholding(10_000), 2_000);
    near(rrifWithholding(15_000), 3_000); // boundary stays in the 20% tier
  });
  it('30% beyond $15k over', () => {
    near(rrifWithholding(20_000), 6_000);
  });
});

describe('growAccount & applyWithdrawal', () => {
  it('grows by the return rate (fraction)', () => {
    near(growAccount(1_000, 0.05), 1_050);
  });
  it('withdrawal is clamped to the available balance', () => {
    expect(applyWithdrawal(1_000, 1_500)).toEqual({ balance: 0, withdrawn: 1_000 });
    expect(applyWithdrawal(1_000, 400)).toEqual({ balance: 600, withdrawn: 400 });
    expect(applyWithdrawal(1_000, -50)).toEqual({ balance: 1_000, withdrawn: 0 });
  });
});

describe('non-registered taxable amounts by income type', () => {
  it('interest is fully taxable', () => {
    near(interestTaxableAmount(100), 100);
  });
  it('eligible dividends gross up 38%', () => {
    near(eligibleDividendTaxableAmount(100), 138);
  });
  it('capital gains include 50% of realized gains only', () => {
    near(capitalGainTaxableAmount(100), 50);
    expect(capitalGainTaxableAmount(-100)).toBe(0); // unrealized/loss not a positive inclusion
  });
});

describe('TFSA withdrawal is tax-free and excluded from net income', () => {
  it('never adds to taxable income or the clawback base', () => {
    expect(tfsaWithdrawal(10_000)).toEqual({ cash: 10_000, taxableIncome: 0, netIncomeImpact: 0 });
  });
});

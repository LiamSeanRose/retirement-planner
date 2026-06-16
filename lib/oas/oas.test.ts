import { describe, expect, it } from 'vitest';
import { CONFIG_2026 } from '../config';
import { oasClawback, oasDeferralFactor, oasMonthly } from './index';

const O = CONFIG_2026.oas;
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('oasDeferralFactor', () => {
  it('no deferral at 65', () => {
    expect(oasDeferralFactor(65)).toBe(1);
  });
  it('+0.6%/month, max +36% at 70', () => {
    near(oasDeferralFactor(70), 1.36);
    near(oasDeferralFactor(67), 1 + 24 * 0.006); // 1.144
  });
});

describe('oasMonthly', () => {
  it('pays 0 before the elected start age', () => {
    expect(oasMonthly(70, 68)).toBe(0);
  });
  it('base max at 65-74', () => {
    near(oasMonthly(65, 66), O.maxMonthly65to74);
  });
  it('+10% at 75', () => {
    near(oasMonthly(65, 75), O.maxMonthly65to74 * 1.1);
  });
  it('deferral and the 75+ bump stack', () => {
    near(oasMonthly(70, 76), O.maxMonthly65to74 * 1.36 * 1.1);
  });
});

describe('oasClawback (recovery tax, prior-year income)', () => {
  it('no clawback below the threshold', () => {
    expect(oasClawback(80_000, 2026, 9_000)).toBe(0);
  });
  it('15% of income above the threshold', () => {
    // 2026 income-year threshold 95,323; income 105,323 -> 15% × 10,000 = 1,500
    near(oasClawback(105_323, 2026, 9_000), 1_500);
  });
  it('capped at the OAS actually received', () => {
    // huge income would claw back far more than received -> capped at the OAS amount
    expect(oasClawback(500_000, 2026, 9_000)).toBe(9_000);
  });
  it('uses the income-year threshold (one-year lag is the caller’s responsibility)', () => {
    // 2025 income-year threshold 93,454; income 103,454 -> 15% × 10,000 = 1,500
    near(oasClawback(103_454, 2025, 9_000), 1_500);
  });
  it('throws for an unconfigured income year', () => {
    expect(() => oasClawback(100_000, 2099, 9_000)).toThrow();
  });
});

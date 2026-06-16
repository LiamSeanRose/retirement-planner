import { describe, expect, it } from 'vitest';
import { cppMonthlyAtStart, cppStartFactor } from './index';

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('cppStartFactor', () => {
  it('factor is 1.0 at 65', () => {
    expect(cppStartFactor(65)).toBe(1);
  });
  it('−0.6%/month before 65: max −36% at 60', () => {
    near(cppStartFactor(60), 0.64);
    near(cppStartFactor(63), 1 - 24 * 0.006); // 0.856
  });
  it('+0.7%/month after 65: max +42% at 70', () => {
    near(cppStartFactor(70), 1.42);
    near(cppStartFactor(67), 1 + 24 * 0.007); // 1.168
  });
  it('clamps outside the 60-70 window', () => {
    expect(cppStartFactor(58)).toBe(cppStartFactor(60));
    expect(cppStartFactor(72)).toBe(cppStartFactor(70));
  });
});

describe('cppMonthlyAtStart (applies factor to the Service Canada estimate)', () => {
  it('scales the estimated amount at 65 by the start factor', () => {
    near(cppMonthlyAtStart(1000, 60), 640);
    near(cppMonthlyAtStart(1000, 70), 1420);
    near(cppMonthlyAtStart(1507.65, 65), 1507.65);
  });
});

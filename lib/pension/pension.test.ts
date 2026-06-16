import { describe, expect, it } from 'vitest';
import { CONFIG_2026 } from '../config';
import {
  bridgeBenefit,
  determineGroup,
  earlyRetirementReduction,
  indexedValue,
  isUnreducedEligible,
  lifetimePension,
  pensionAtRetirement,
  roundTenth,
} from './index';

const P = CONFIG_2026.pension;
// Helper: assert within a small dollar tolerance (golden tests vs the official calculator).
const near = (actual: number, expected: number, tol = 0.5) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);

describe('config sanity (2026 dated constants)', () => {
  it('AMPE 2026 = $69,180 (5-yr average of YMPE 2022-2026)', () => {
    const ympeHistory = [64_900, 66_600, 68_500, 71_300, 74_600];
    const avg = ympeHistory.reduce((a, b) => a + b, 0) / ympeHistory.length;
    expect(avg).toBe(69_180);
    expect(P.ampe).toBe(69_180);
  });
});

describe('determineGroup', () => {
  it('joined on/before Dec 31 2012 -> Group 1', () => {
    expect(determineGroup('2012-12-31')).toBe(1);
    expect(determineGroup('2005-06-01')).toBe(1);
  });
  it('joined on/after Jan 1 2013 -> Group 2', () => {
    expect(determineGroup('2013-01-01')).toBe(2);
    expect(determineGroup('2020-09-15')).toBe(2);
  });
  it('explicit override wins (re-employment edge case)', () => {
    expect(determineGroup('2005-06-01', 2)).toBe(2);
  });
});

describe('isUnreducedEligible (federal thresholds, NO rule of 85)', () => {
  it('Group 1: age 60 + 2 yrs OR age 55 + 30 yrs', () => {
    expect(isUnreducedEligible(1, 60, 2)).toBe(true);
    expect(isUnreducedEligible(1, 55, 30)).toBe(true);
    expect(isUnreducedEligible(1, 59, 30)).toBe(true); // satisfies the 55+30 rule
    expect(isUnreducedEligible(1, 59, 29)).toBe(false); // age<60 with 29 yrs: neither rule met
    expect(isUnreducedEligible(1, 54, 31)).toBe(false); // age<55: 55+30 rule not met
  });
  it('Group 2: age 65 + 2 yrs OR age 60 + 30 yrs', () => {
    expect(isUnreducedEligible(2, 65, 2)).toBe(true);
    expect(isUnreducedEligible(2, 60, 30)).toBe(true);
    expect(isUnreducedEligible(2, 64, 25)).toBe(false);
    expect(isUnreducedEligible(2, 59, 31)).toBe(false);
  });
  it('age 25 + 30 service is NOT unreduced (no rule of 85: 25+30=55 would pass a rule-of-85 plan)', () => {
    expect(isUnreducedEligible(1, 25, 30)).toBe(false);
    expect(isUnreducedEligible(2, 25, 30)).toBe(false);
  });
});

describe('lifetimePension formula', () => {
  it('salary above AMPE, 30 yrs: two-tier accrual', () => {
    // 1.375% × 69,180 × 30  +  2.0% × (90,000 − 69,180) × 30 = 28,536.75 + 12,492 = 41,028.75
    near(lifetimePension(90_000, 30, P), 41_028.75);
  });
  it('salary below AMPE, 35 yrs: single-tier accrual', () => {
    // 1.375% × 60,000 × 35 = 28,875
    near(lifetimePension(60_000, 35, P), 28_875);
  });
  it('service capped at 35 yrs', () => {
    expect(lifetimePension(90_000, 40, P)).toBe(lifetimePension(90_000, 35, P));
  });
});

describe('bridge identity: lifetime + bridge = 2.0% × best5 × service (pre-65)', () => {
  it.each([
    [90_000, 30],
    [60_000, 35],
    [74_600, 20],
    [120_000, 35],
  ])('best5=%i service=%i', (best5, service) => {
    const total = lifetimePension(best5, service, P) + bridgeBenefit(best5, service, P);
    const cappedService = Math.min(service, P.maxServiceYears);
    near(total, P.accrualAboveAmpe * best5 * cappedService);
  });
});

describe('earlyRetirementReduction — Group 2', () => {
  it('F1 (service < 25): 5% × (65 − age)', () => {
    near(earlyRetirementReduction(2, 60, 20, P), 0.25);
    near(earlyRetirementReduction(2, 62, 10, P), 0.15);
  });
  it('F2 (service ≥ 25, age < 60): greater of 5%×(60−age) or 5%×(30−service)', () => {
    // age 58, service 30: max(5%×2, 5%×0) = 0.10
    near(earlyRetirementReduction(2, 58, 30, P), 0.1);
    // age 56, service 26: max(5%×4, 5%×4) = 0.20
    near(earlyRetirementReduction(2, 56, 26, P), 0.2);
  });
  it('F2 at age 60+: take the LOWER of F1 and F2', () => {
    // age 62, service 27: F1=5%×3=0.15, F2=max(5%×-2,5%×3)=0.15 -> 0.15
    near(earlyRetirementReduction(2, 62, 27, P), 0.15);
  });
  it('no reduction when unreduced-eligible', () => {
    expect(earlyRetirementReduction(2, 65, 10, P)).toBe(0);
    expect(earlyRetirementReduction(2, 60, 30, P)).toBe(0);
  });
});

describe('earlyRetirementReduction — Group 1', () => {
  it('F1 (service < 25): 5% × (60 − age)', () => {
    near(earlyRetirementReduction(1, 55, 20, P), 0.25);
  });
  it('F2 (service ≥ 25, age < 55): greater of 5%×(55−age) or 5%×(30−service)', () => {
    // age 53, service 28: max(5%×2, 5%×2) = 0.10
    near(earlyRetirementReduction(1, 53, 28, P), 0.1);
  });
  it('F2 at age 55+: take the LOWER of F1 and F2', () => {
    // age 57, service 27: F1=5%×3=0.15, F2=max(5%×-2,5%×3)=0.15 -> 0.15
    near(earlyRetirementReduction(1, 57, 27, P), 0.15);
  });
  it('no reduction when unreduced-eligible', () => {
    expect(earlyRetirementReduction(1, 60, 2, P)).toBe(0);
    expect(earlyRetirementReduction(1, 55, 30, P)).toBe(0);
  });
});

describe('roundTenth (ages/service to nearest 0.1 yr)', () => {
  it('rounds to the nearest tenth', () => {
    expect(roundTenth(57.04)).toBe(57.0);
    expect(roundTenth(57.06)).toBe(57.1);
    expect(roundTenth(29.95)).toBe(30.0);
  });
});

describe('pensionAtRetirement — assembled result', () => {
  it('reduced Group 2 early retirement splits pre/post-65 correctly', () => {
    const r = pensionAtRetirement({ group: 2, best5Salary: 90_000, service: 27, ageAtRetirement: 60 });
    // service 27 ≥ 25, age 60 -> lower of F1=5%×5=0.25, F2=max(0, 5%×3)=0.15 -> 0.15
    near(r.reductionPct, 0.15);
    const lifetimeFull = lifetimePension(90_000, 27, P);
    const bridgeFull = bridgeBenefit(90_000, 27, P);
    near(r.lifetimeAnnual, lifetimeFull * 0.85);
    near(r.bridgeAnnual, bridgeFull * 0.85);
    near(r.preAge65Annual, r.lifetimeAnnual + r.bridgeAnnual);
    near(r.postAge65Annual, r.lifetimeAnnual);
    // post-65 step-down equals the (reduced) bridge amount
    near(r.preAge65Annual - r.postAge65Annual, r.bridgeAnnual);
  });

  it('unreduced retirement has reductionPct 0 and pre-65 identity holds', () => {
    const r = pensionAtRetirement({ group: 1, best5Salary: 100_000, service: 30, ageAtRetirement: 60 });
    expect(r.reductionPct).toBe(0);
    near(r.preAge65Annual, P.accrualAboveAmpe * 100_000 * 30);
  });
});

describe('indexedValue — CPI indexing', () => {
  it('no elapsed years returns the base', () => {
    expect(indexedValue(40_000, 0, 0.02)).toBe(40_000);
  });
  it('compounds annually after a full first year', () => {
    near(indexedValue(40_000, 2, 0.02), 40_000 * 1.02 * 1.02);
  });
  it('prorates the first indexing year by months since retirement', () => {
    // retire with 1 of 12 months -> first-year index is 1/12 of 2%
    near(indexedValue(40_000, 1, 0.02, 1), 40_000 * (1 + 0.02 * (1 / 12)));
  });
});

/**
 * PENSION GOLDEN TESTS — federal PSPP, hand-worked from the PSSA formula so they can be re-checked
 * against the official Basic Pension Calculator (canada.ca → PSPC pension tools). Each case documents
 * its inputs (group via plan-join date, best-5 average salary, pensionable service, retirement age)
 * and the expected ANNUAL pension. The formula (2026 constants from lib/config/2026.ts):
 *
 *   lifetime = 1.375% × min(best5, AMPE) × service(≤35)  +  2.0% × max(best5 − AMPE, 0) × service(≤35)
 *   bridge   = 0.625% × min(best5, AMPE) × service(≤35)            (paid before 65 only)
 *   AMPE 2026 = $69,180   |   service cap = 35 yrs   |   early-retirement reduction = 5% per year short
 *   pre-65 identity: lifetime + bridge = 2.0% × best5 × service(≤35) × (1 − reduction)
 *
 * FEDERAL ONLY — there is NO rule of 85; unreduced eligibility is age-and-service thresholds.
 * Group 1 = joined ≤ 2012-12-31 (unreduced at 60+2 or 55+30). Group 2 = joined ≥ 2013-01-01
 * (unreduced at 65+2 or 60+30).
 */

import { describe, expect, it } from 'vitest';
import { earlyRetirementReduction, pensionAtRetirement } from './index';
import { DEFAULT_CONFIG } from '../config';

const near = (a: number, b: number, tol = 0.01): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const PCFG = DEFAULT_CONFIG.pension;

interface GoldenCase {
  name: string;
  group: 1 | 2;
  best5Salary: number;
  service: number;
  ageAtRetirement: number;
  expect: { reductionPct: number; lifetimeAnnual: number; bridgeAnnual: number; preAge65Annual: number };
}

// Inputs Dad can type straight into the official calculator; expected values are the PSSA formula.
const CASES: GoldenCase[] = [
  {
    name: 'A — Group 1, $90k best-5, 30 yrs, retire 60 (unreduced: 60+2)',
    group: 1, best5Salary: 90_000, service: 30, ageAtRetirement: 60,
    expect: { reductionPct: 0, lifetimeAnnual: 41_028.75, bridgeAnnual: 12_971.25, preAge65Annual: 54_000 },
  },
  {
    name: 'B — Group 2, $75k best-5, 35 yrs, retire 65 (unreduced: 65+2)',
    group: 2, best5Salary: 75_000, service: 35, ageAtRetirement: 65,
    expect: { reductionPct: 0, lifetimeAnnual: 37_366.875, bridgeAnnual: 15_133.125, preAge65Annual: 52_500 },
  },
  {
    name: 'C — Group 2, $100k best-5, 20 yrs, retire 60 (reduced: F1 5%×(65−60)=25%)',
    group: 2, best5Salary: 100_000, service: 20, ageAtRetirement: 60,
    expect: { reductionPct: 0.25, lifetimeAnnual: 23_514.375, bridgeAnnual: 6_485.625, preAge65Annual: 30_000 },
  },
  {
    name: 'D — Group 2, $80k best-5, 28 yrs, retire 60 (reduced: ≥25 yrs → lower of F1/F2 = 10%)',
    group: 2, best5Salary: 80_000, service: 28, ageAtRetirement: 60,
    expect: { reductionPct: 0.1, lifetimeAnnual: 29_424.15, bridgeAnnual: 10_895.85, preAge65Annual: 40_320 },
  },
  {
    name: 'E — Group 1, $85k best-5, 22 yrs, retire 55 (reduced: F1 5%×(60−55)=25%)',
    group: 1, best5Salary: 85_000, service: 22, ageAtRetirement: 55,
    // before reduction: lifetime 0.01375×69180×22 + 0.02×15820×22 = 20926.95 + 6960.8 = 27887.75; ×0.75
    //                   bridge 0.00625×69180×22 = 9512.25; ×0.75
    expect: { reductionPct: 0.25, lifetimeAnnual: 20_915.8125, bridgeAnnual: 7_134.1875, preAge65Annual: 28_050 },
  },
  {
    name: 'F — Group 1, $70k best-5, 40 yrs (capped 35), retire 60 (unreduced; tests the 35-yr cap)',
    group: 1, best5Salary: 70_000, service: 40, ageAtRetirement: 60,
    expect: { reductionPct: 0, lifetimeAnnual: 33_866.875, bridgeAnnual: 15_133.125, preAge65Annual: 49_000 },
  },
];

describe('pension golden cases (vs the official PSPP Basic Pension Calculator)', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const par = pensionAtRetirement(
        { group: c.group, best5Salary: c.best5Salary, service: c.service, ageAtRetirement: c.ageAtRetirement },
        DEFAULT_CONFIG,
      );
      it('early-retirement reduction matches', () => {
        near(par.reductionPct, c.expect.reductionPct, 1e-9);
      });
      it('lifetime (post-65) annual matches', () => {
        near(par.lifetimeAnnual, c.expect.lifetimeAnnual);
        near(par.postAge65Annual, c.expect.lifetimeAnnual);
      });
      it('bridge annual matches', () => {
        near(par.bridgeAnnual, c.expect.bridgeAnnual);
      });
      it('pre-65 total matches AND satisfies the 2% × best5 × service bridge identity', () => {
        near(par.preAge65Annual, c.expect.preAge65Annual);
        const cappedService = Math.min(c.service, PCFG.maxServiceYears);
        near(par.preAge65Annual, PCFG.accrualAboveAmpe * c.best5Salary * cappedService * (1 - c.expect.reductionPct), 0.02);
      });
    });
  }
});

describe('pension self-consistency', () => {
  it('no reduction at the unreduced-eligibility points (Group 1: 60+2, 55+30)', () => {
    expect(earlyRetirementReduction(1, 60, 2, PCFG)).toBe(0);
    expect(earlyRetirementReduction(1, 55, 30, PCFG)).toBe(0);
  });
  it('no reduction at the unreduced-eligibility points (Group 2: 65+2, 60+30)', () => {
    expect(earlyRetirementReduction(2, 65, 2, PCFG)).toBe(0);
    expect(earlyRetirementReduction(2, 60, 30, PCFG)).toBe(0);
  });
  it('the reduction grows the further short of the age anchor (Group 2, <25 yrs)', () => {
    // F1: 5%/yr short of 65.
    near(earlyRetirementReduction(2, 64, 10, PCFG), 0.05, 1e-9);
    near(earlyRetirementReduction(2, 62, 10, PCFG), 0.15, 1e-9);
  });
});

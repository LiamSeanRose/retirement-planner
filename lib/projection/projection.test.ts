import { describe, expect, it } from 'vitest';
import { runProjection, type TaxFn } from './index';
import { flatPath } from '../paths';
import { rrifFactor } from '../accounts';
import { DEFAULT_CONFIG } from '../config';
import type { Household, Scenario } from '../../types/planner';

const near = (a: number, b: number, tol = 1e-6): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

// Stub tax engine: flat 25% of taxable income — keeps the worked numbers hand-checkable.
const stubTax: TaxFn = (ctx) => ctx.taxableIncome * 0.25;

// Group 1 (joined 2005), retires at 60 with 30 yrs service → unreduced (age 60 + 2 yrs).
// lifetime = 1.375% × 69,180 × 30 + 2% × (100,000 − 69,180) × 30 = 47,028.75
// bridge   = 0.625% × 69,180 × 30                                = 12,971.25  (pre-65 total = 60,000)
const household: Household = {
  province: 'ON',
  memberA: {
    birthDate: '1966-01-01', // turns 60 in 2026
    planJoinDate: '2005-01-01', // Group 1
    currentSalary: 100_000,
    bestFiveAvgSalary: 100_000,
    pensionableServiceYears: 30,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 1_000,
    oasEligible: true,
  },
  accounts: [
    { id: 'r', owner: 'memberA', type: 'rrsp', currentBalance: 500_000, riskProfile: { expectedReturn: 4, volatility: 10 } },
    { id: 't', owner: 'memberA', type: 'tfsa', currentBalance: 50_000, riskProfile: { expectedReturn: 4, volatility: 10 } },
    { id: 'n', owner: 'memberA', type: 'nonReg', currentBalance: 300_000, riskProfile: { expectedReturn: 4, volatility: 10 } },
  ],
};

const baseAssumptions = { inflationPct: 2, indexingPct: 2, endAge: 95, mode: 'deterministic' as const };
const path = flatPath({ years: 40, returnPct: 4, inflationPct: 2, indexingPct: 2 });

const baseScenario: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: baseAssumptions,
  events: {},
};

describe('runProjection — pension, bridge step-down, and totals', () => {
  const result = runProjection(household, baseScenario, path, stubTax);

  it('runs one row per year from retirement age to end age', () => {
    expect(result.rows).toHaveLength(95 - 60 + 1);
    expect(result.reductionPct.memberA).toBe(0); // unreduced
  });

  it('year 0 (age 60): lifetime + bridge, no CPP/OAS yet, 25% stub tax', () => {
    const r0 = result.rows[0];
    near(r0.pension, 47_028.75);
    near(r0.bridge, 12_971.25);
    expect(r0.cpp).toBe(0);
    expect(r0.oas).toBe(0);
    expect(r0.rrifMin).toBe(0);
    near(r0.taxableIncome, 60_000);
    near(r0.afterTax, 45_000); // 60,000 − 25%
  });

  it('the bridge steps down to zero at 65 while the lifetime pension continues (indexed)', () => {
    expect(result.rows[4].ageA).toBe(64);
    expect(result.rows[4].bridge).toBeGreaterThan(0);
    expect(result.rows[5].ageA).toBe(65);
    expect(result.rows[5].bridge).toBe(0); // step-down
    near(result.rows[5].pension, 47_028.75 * Math.pow(1.02, 5)); // lifetime indexed 5 yrs
  });

  it('totals are the aggregation of the rows', () => {
    near(result.totals.lifetimeAfterTax, result.rows.reduce((s, r) => s + r.afterTax, 0));
    near(result.totals.lifetimeTax, result.rows.reduce((s, r) => s + r.tax, 0));
    expect(result.totals.lastsToEndAge).toBe(true); // no spending target ⇒ nothing to under-fund
  });
});

describe('runProjection — mandatory RRIF minimum', () => {
  const rows = runProjection(household, baseScenario, path, stubTax).rows;

  it('is zero before 71 and in the RRIF opening year, then keys off the Jan-1 balance at 72', () => {
    expect(rows[10].ageA).toBe(70);
    expect(rows[10].rrifMin).toBe(0); // still an RRSP
    expect(rows[11].ageA).toBe(71);
    expect(rows[11].rrifMin).toBe(0); // opening year — no minimum
    expect(rows[12].ageA).toBe(72);
    expect(rows[12].rrifMin).toBeGreaterThan(0);
    // minimum = previous year-end (Jan-1) registered balance × the age-72 factor
    near(rows[12].rrifMin, rows[11].balances.rrsp * rrifFactor(72), 1e-4);
  });
});

describe('runProjection — OAS clawback runs off the PRIOR year income (one-year lag)', () => {
  // A one-year second-career income spike at age 66.
  const spikeScenario: Scenario = {
    ...baseScenario,
    events: { secondCareerIncome: { member: 'memberA', annualAmount: 100_000, startAge: 66, endAge: 66 } },
  };
  const rows = runProjection(household, spikeScenario, path, stubTax).rows;

  // Projected clawback threshold for an income year (mirrors the engine: index 2026 base by inflation).
  const thresholds = DEFAULT_CONFIG.oas.clawbackThresholdByIncomeYear;
  const baseYear = Math.max(...Object.keys(thresholds).map(Number));
  const thresholdFor = (incomeYear: number) =>
    thresholds[incomeYear] ?? thresholds[baseYear] * Math.pow(1.02, incomeYear - baseYear);

  it('no clawback in the spike year (prior year was low income)', () => {
    expect(rows[6].ageA).toBe(66);
    expect(rows[6].secondCareer).toBe(100_000);
    near(rows[6].oasClawback, 0); // driven by age-65 income, which is below the threshold
  });

  it('clawback appears the following year, computed from the spike year income', () => {
    expect(rows[7].ageA).toBe(67);
    expect(rows[7].oas).toBeGreaterThan(0);
    const incomeYear = rows[7].year - 1; // = the spike (age-66) year
    const expected = Math.min(
      rows[7].oas,
      DEFAULT_CONFIG.oas.clawbackRate * Math.max(0, rows[6].taxableIncome - thresholdFor(incomeYear)),
    );
    expect(rows[7].oasClawback).toBeGreaterThan(0);
    near(rows[7].oasClawback, expected, 1e-4);
  });
});

describe('runProjection — discretionary withdrawals fund spending and draw balances down', () => {
  const spendScenario: Scenario = {
    ...baseScenario,
    withdrawalOrder: ['rrsp', 'nonReg', 'tfsa'], // RRSP first
    assumptions: { ...baseAssumptions, targetAnnualSpending: 120_000 },
  };
  const result = runProjection(household, spendScenario, path, stubTax);
  const rows = result.rows;

  it('draws the spending gap from the first account in the order (RRSP), taxed and grown correctly', () => {
    const r0 = rows[0];
    near(r0.rrifExtra, 60_000); // 120,000 target − 60,000 pension
    near(r0.taxableIncome, 120_000); // pension + bridge + discretionary RRSP
    near(r0.afterTax, 90_000); // 120,000 − 25%
    near(r0.balances.rrsp, (500_000 - 60_000) * 1.04); // withdraw then grow
  });

  it('net worth draws down over time and the aggressive target is not sustained to 95', () => {
    expect(rows[5].netWorth).toBeLessThan(rows[0].netWorth);
    expect(rows[rows.length - 1].netWorth).toBeLessThan(rows[5].netWorth);
    expect(result.totals.lastsToEndAge).toBe(false);
  });
});

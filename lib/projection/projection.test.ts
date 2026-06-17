import { describe, expect, it } from 'vitest';
import { runProjection, type TaxFn, type TaxMemberProfile } from './index';
import { flatPath } from '../paths';
import { capitalGainTaxableAmount, eligibleDividendTaxableAmount, interestTaxableAmount, rrifFactor } from '../accounts';
import { DEFAULT_CONFIG } from '../config';
import { householdTaxWithSplitting, totalTax } from '../tax';
import { survivorAllowanceAnnual } from '../survivor';
import type { Household, ReturnPathByType, Scenario } from '../../types/planner';

const near = (a: number, b: number, tol = 1e-6): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

// Stub tax engine: flat 25% of taxable income — keeps the worked numbers hand-checkable.
const stubTax: TaxFn = (ctx) => ctx.taxableIncome * 0.25;

// Annual non-registered taxable income (interest + grossed-up dividends) on a held balance — the
// tax drag the projection now adds to taxable income each year (B1). Driven by the dated config.
const nonRegDistrib = (balance: number): number =>
  interestTaxableAmount(balance * DEFAULT_CONFIG.nonRegistered.interestYield) +
  eligibleDividendTaxableAmount(balance * DEFAULT_CONFIG.nonRegistered.eligibleDividendYield);

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
    // pension (60,000) + the non-registered tax drag on the 300k balance.
    const taxable = 60_000 + nonRegDistrib(300_000);
    near(r0.taxableIncome, taxable);
    near(r0.afterTax, 60_000 - 0.25 * taxable); // grossCash 60,000 − 25% stub tax
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
    // pension + bridge + discretionary RRSP (120,000) + the non-registered tax drag.
    const taxable = 120_000 + nonRegDistrib(300_000);
    near(r0.taxableIncome, taxable);
    near(r0.afterTax, 120_000 - 0.25 * taxable); // grossCash 120,000 − 25% stub tax
    near(r0.balances.rrsp, (500_000 - 60_000) * 1.04); // withdraw then grow
  });

  it('net worth draws down over time and the aggressive target is not sustained to 95', () => {
    expect(rows[5].netWorth).toBeLessThan(rows[0].netWorth);
    expect(rows[rows.length - 1].netWorth).toBeLessThan(rows[5].netWorth);
    expect(result.totals.lastsToEndAge).toBe(false);
  });
});

// ---- Couple mode (member A + member B), survivor rule, and automated pension splitting ----

const couple: Household = {
  province: 'ON',
  memberA: {
    birthDate: '1962-01-01',
    planJoinDate: '2000-01-01', // Group 1, unreduced at 60 + 35 yrs
    currentSalary: 130_000,
    bestFiveAvgSalary: 130_000,
    pensionableServiceYears: 35,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 1_300,
    oasEligible: true,
  },
  memberB: {
    birthDate: '1962-01-01',
    planJoinDate: '2008-01-01', // Group 1, unreduced at 60 + 2 yrs
    currentSalary: 55_000,
    bestFiveAvgSalary: 55_000,
    pensionableServiceYears: 10,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 500,
    oasEligible: true,
  },
  accounts: [
    { id: 'ra', owner: 'memberA', type: 'rrsp', currentBalance: 500_000, riskProfile: { expectedReturn: 4, volatility: 10 } },
    { id: 'rb', owner: 'memberB', type: 'rrsp', currentBalance: 150_000, riskProfile: { expectedReturn: 4, volatility: 10 } },
    { id: 't', owner: 'joint', type: 'tfsa', currentBalance: 80_000, riskProfile: { expectedReturn: 4, volatility: 10 } },
    { id: 'n', owner: 'joint', type: 'nonReg', currentBalance: 120_000, riskProfile: { expectedReturn: 4, volatility: 10 } },
  ],
};

const coupleScenario: Scenario = {
  cppStartAge: { memberA: 65, memberB: 65 },
  oasStartAge: { memberA: 65, memberB: 65 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic', targetAnnualSpending: 70_000 },
  events: {},
};

// Real tax with vs without the pension split — mirrors how the engine wires lib/tax for a couple.
const profileTax = (m: TaxMemberProfile): number =>
  totalTax(m.ordinaryIncome + m.psppPension + m.rrifIncome, 'ON', {
    age: m.age,
    eligiblePensionIncome: m.psppPension + (m.age >= 65 ? m.rrifIncome : 0),
  });
const splitTax: TaxFn = (ctx) =>
  ctx.filingStatus === 'couple' && ctx.members
    ? householdTaxWithSplitting(ctx.members[0], ctx.members[1], ctx.province).tax
    : totalTax(ctx.taxableIncome, ctx.province, { age: ctx.age, eligiblePensionIncome: ctx.pensionIncome });
const noSplitTax: TaxFn = (ctx) =>
  ctx.filingStatus === 'couple' && ctx.members
    ? profileTax(ctx.members[0]) + profileTax(ctx.members[1])
    : totalTax(ctx.taxableIncome, ctx.province, { age: ctx.age, eligiblePensionIncome: ctx.pensionIncome });

describe('runProjection — couple mode', () => {
  it("projects BOTH members' pensions/bridges and files as a couple while both are alive", () => {
    const r0 = runProjection(couple, coupleScenario, path, splitTax).rows[0];
    expect(r0.ageA).toBe(60);
    expect(r0.ageB).toBe(60);
    expect(r0.filingStatus).toBe('couple');
    near(r0.pension, 75_866.875 + 7_562.5); // member A lifetime + member B lifetime
    near(r0.bridge, 15_133.125 + 3_437.5); // both bridges
  });
});

describe('runProjection — survivor rule (§19)', () => {
  const death: Scenario = { ...coupleScenario, events: { earlyMortality: { member: 'memberB', atAge: 63 } } };
  const alive = runProjection(couple, coupleScenario, path, splitTax);
  const widowed = runProjection(couple, death, path, splitTax);

  it('flips filing couple → single from the year of death', () => {
    expect(widowed.rows[2].filingStatus).toBe('couple'); // both alive at 62
    expect(widowed.rows[3].ageB).toBe(63);
    expect(widowed.rows[3].filingStatus).toBe('single'); // member B died at 63
  });

  it('cuts the deceased pension to the survivor allowance and stops their bridge', () => {
    expect(widowed.rows[3].pension).toBeLessThan(alive.rows[3].pension);
    expect(widowed.rows[3].bridge).toBeLessThan(alive.rows[3].bridge);
    // The pension drop = member B's lifetime − survivor allowance, both indexed to year 3.
    const drop = (7_562.5 - survivorAllowanceAnnual(couple.memberB!)) * Math.pow(1.02, 3);
    near(alive.rows[3].pension - widowed.rows[3].pension, drop, 1e-3);
  });
});

describe('runProjection — automated pension splitting', () => {
  it("lowers a couple's tax versus filing two single returns", () => {
    const split = runProjection(couple, coupleScenario, path, splitTax);
    const noSplit = runProjection(couple, coupleScenario, path, noSplitTax);
    expect(split.totals.lifetimeTax).toBeLessThan(noSplit.totals.lifetimeTax);
    expect(split.rows[0].tax).toBeLessThan(noSplit.rows[0].tax); // helps in an ordinary both-alive year too
  });
});

describe('runProjection — single-person regression', () => {
  it('a household with no member B still files single, with no member-B fields', () => {
    const single: Household = { province: 'ON', memberA: couple.memberA, accounts: [couple.accounts[0]] };
    const res = runProjection(single, coupleScenario, path, splitTax);
    expect(res.rows[0].filingStatus).toBe('single');
    expect(res.rows[0].ageB).toBeUndefined();
    expect(res.reductionPct.memberB).toBeUndefined();
  });
});

// ---- B1: per-account-type stochastic-ready returns + non-registered taxation ----

describe('runProjection — per-account-type returns', () => {
  it('grows each account type by its own return when the path carries returnByType', () => {
    const hh: Household = {
      province: 'ON',
      memberA: { ...household.memberA, bestFiveAvgSalary: 0, pensionableServiceYears: 0, estimatedCppAt65Monthly: 0 },
      accounts: [
        { id: 'r', owner: 'memberA', type: 'rrsp', currentBalance: 100_000, riskProfile: { expectedReturn: 0, volatility: 0 } },
        { id: 't', owner: 'memberA', type: 'tfsa', currentBalance: 100_000, riskProfile: { expectedReturn: 0, volatility: 0 } },
        { id: 'n', owner: 'memberA', type: 'nonReg', currentBalance: 100_000, riskProfile: { expectedReturn: 0, volatility: 0 } },
      ],
    };
    const perType: ReturnPathByType = [
      { returnPct: 0, inflationPct: 2, indexingPct: 2, returnByType: { rrsp: 10, tfsa: 0, nonReg: 5 } },
    ];
    const r0 = runProjection(hh, baseScenario, perType, stubTax).rows[0];
    near(r0.balances.rrsp, 110_000); // +10%
    near(r0.balances.tfsa, 100_000); // +0%
    near(r0.balances.nonReg, 105_000); // +5%
  });
});

describe('runProjection — non-registered taxation', () => {
  it('taxes annual interest + dividends on the balance and capital gains on a withdrawal', () => {
    const hh: Household = {
      province: 'ON',
      memberA: { ...household.memberA, bestFiveAvgSalary: 0, pensionableServiceYears: 0, estimatedCppAt65Monthly: 0 },
      accounts: [{ id: 'n', owner: 'memberA', type: 'nonReg', currentBalance: 200_000, riskProfile: { expectedReturn: 4, volatility: 10 } }],
    };
    const scn: Scenario = {
      ...baseScenario,
      withdrawalOrder: ['nonReg', 'rrsp', 'tfsa'],
      assumptions: { ...baseAssumptions, targetAnnualSpending: 20_000 },
    };
    const r0 = runProjection(hh, scn, path, stubTax).rows[0];
    near(r0.nonRegInc, 20_000); // withdrew 20,000 to fund the target (no other income)
    // taxable = annual distributions on the 200k balance + the realized gain content of the 20k draw.
    const expected = nonRegDistrib(200_000) + capitalGainTaxableAmount(20_000 * DEFAULT_CONFIG.nonRegistered.unrealizedGainFraction);
    near(r0.taxableIncome, expected, 1e-3);
    expect(r0.taxableIncome).toBeGreaterThan(0);
  });
});

// ---- B2: couple-mode numeric checks ----

describe('runProjection — couple numeric checks', () => {
  it('both members receive OAS once eligible (household OAS ≈ two single OAS)', () => {
    const at66 = runProjection(couple, coupleScenario, path, splitTax).rows.find((r) => r.ageA === 66)!;
    near(at66.oas, 2 * DEFAULT_CONFIG.oas.maxMonthly65to74 * 12, 1); // both 66 (<75, no bump), both eligible
  });

  it('the survivor receives a CPP survivor benefit, capped at the combined-benefit maximum', () => {
    const death: Scenario = { ...coupleScenario, events: { earlyMortality: { member: 'memberB', atAge: 70 } } };
    const aliveCpp = runProjection(couple, coupleScenario, path, splitTax).rows.find((r) => r.ageA === 71)!.cpp;
    const widowedCpp = runProjection(couple, death, path, splitTax).rows.find((r) => r.ageA === 71)!.cpp;
    expect(widowedCpp).toBeLessThan(aliveCpp); // lost most of member B's CPP
    // member A's own CPP (15,600) + 60% of B's (3,600) would exceed the max ⇒ capped at it.
    near(widowedCpp, DEFAULT_CONFIG.cpp.maxMonthlyAt65 * 12, 1);
  });
});

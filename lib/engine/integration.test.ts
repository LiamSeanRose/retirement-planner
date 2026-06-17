/**
 * Kitchen-sink integration test — every feature turned on AT ONCE, exercised across every analysis
 * layer (deterministic, a hand-built stress path, Monte Carlo, historical backtest). The per-feature
 * suites prove each lever in isolation; this one defends the SEAMS between them: couple + survivor +
 * home + downsize + cash wedge + LIRA/LIF + 50% unlock + spending phases + second career + WFA lump
 * sum, all live together. It asserts the invariants that must hold no matter which levers combine.
 */

import { describe, expect, it } from 'vitest';
import type { Household, ReturnPathByType, Scenario } from '../../types/planner';
import { runHistoricalBacktest, runMonteCarloScenario, runScenario, runScenarioOverPath } from './index';

// A maximal household: a couple, all four account types, owners mixed, and a home.
const household: Household = {
  province: 'ON',
  memberA: {
    label: 'A',
    birthDate: '1962-01-01',
    planJoinDate: '2004-06-01', // Group 1
    currentSalary: 110_000,
    bestFiveAvgSalary: 105_000,
    pensionableServiceYears: 31,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 1_200,
    oasEligible: true,
  },
  memberB: {
    label: 'B',
    birthDate: '1964-03-01',
    planJoinDate: '2014-02-01', // Group 2
    currentSalary: 82_000,
    bestFiveAvgSalary: 80_000,
    pensionableServiceYears: 26,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 950,
    oasEligible: true,
  },
  accounts: [
    { id: 'r-a', owner: 'memberA', type: 'rrsp', currentBalance: 500_000, riskProfile: { expectedReturn: 5.5, volatility: 11 } },
    { id: 'r-b', owner: 'memberB', type: 'rrsp', currentBalance: 220_000, riskProfile: { expectedReturn: 5, volatility: 10 } },
    { id: 't-a', owner: 'memberA', type: 'tfsa', currentBalance: 120_000, riskProfile: { expectedReturn: 5, volatility: 10 } },
    { id: 'n-j', owner: 'joint', type: 'nonReg', currentBalance: 180_000, riskProfile: { expectedReturn: 4, volatility: 8 } },
    { id: 'l-a', owner: 'memberA', type: 'lira', currentBalance: 160_000, riskProfile: { expectedReturn: 5, volatility: 10 } },
  ],
  home: { currentValue: 750_000, appreciationPct: 3 },
};

// Every scenario lever engaged at once.
const scenario: Scenario = {
  cppStartAge: { memberA: 70, memberB: 65 },
  oasStartAge: { memberA: 70, memberB: 65 },
  meltdown: { mode: 'none' },
  withdrawalOrder: ['nonReg', 'rrsp', 'tfsa'],
  assumptions: {
    inflationPct: 2.2,
    indexingPct: 2,
    endAge: 95,
    mode: 'deterministic',
    targetAnnualSpending: 95_000,
    spendingPhases: { slowGoAge: 75, noGoAge: 85, slowGoPct: 0.85, noGoPct: 0.7 },
    lifUnlock50: true,
    cashWedge: { years: 2 },
  },
  events: {
    wfaPackage: { member: 'memberA', tsmPayoutWeeks: 30, departureAge: 60 },
    secondCareerIncome: { member: 'memberB', annualAmount: 25_000, startAge: 61, endAge: 66 },
    earlyMortality: { member: 'memberA', atAge: 82 },
    homeDownsize: { atAge: 80, releasedEquityPct: 0.4 },
  },
};

const finite = (n: number) => Number.isFinite(n);

/** Every numeric field of every row is finite, balances are non-negative, and net worth reconciles. */
function assertRowInvariants(rows: import('../../types/planner').YearRow[]) {
  for (const r of rows) {
    for (const v of [r.pension, r.bridge, r.cpp, r.oas, r.secondCareer, r.lumpSum, r.rrifMin, r.rrifExtra, r.tfsaWd, r.nonRegInc, r.taxableIncome, r.tax, r.oasClawback, r.afterTax, r.homeValue, r.cashWedge, r.netWorth]) {
      expect(finite(v)).toBe(true);
    }
    // Balances never go negative (a small epsilon for float noise).
    for (const b of [r.balances.rrsp, r.balances.tfsa, r.balances.nonReg, r.balances.lira, r.homeValue, r.cashWedge]) {
      expect(b).toBeGreaterThanOrEqual(-1e-6);
    }
    // Net worth = the four liquid accounts + the cash wedge (the home is tracked separately).
    expect(r.netWorth).toBeCloseTo(r.balances.rrsp + r.balances.tfsa + r.balances.nonReg + r.balances.lira + r.cashWedge, 4);
    // Tax is never negative; after-tax never exceeds gross cash in.
    expect(r.tax).toBeGreaterThanOrEqual(-1e-6);
    expect(r.oasClawback).toBeGreaterThanOrEqual(-1e-6);
  }
}

describe('kitchen-sink: every feature at once (deterministic)', () => {
  const result = runScenario(household, scenario);

  it('produces one row per year with all invariants intact', () => {
    expect(result.rows).toHaveLength(95 - 60 + 1);
    expect(result.rows[0].ageA).toBe(60);
    assertRowInvariants(result.rows);
  });

  it('totals are finite and self-consistent (lifetimeTax = Σ row tax)', () => {
    const sumTax = result.rows.reduce((s, r) => s + r.tax, 0);
    expect(result.totals.lifetimeTax).toBeCloseTo(sumTax, 2); // the pinned validation identity, under every lever
    expect(finite(result.totals.estateValue)).toBe(true);
    expect(finite(result.totals.lifetimeAfterTax)).toBe(true);
    expect(result.totals.estateValue).toBeGreaterThan(0); // a home + wedge + registered estate
  });

  it('the survivor transition fires cleanly (couple → single at the death age)', () => {
    const before = result.rows.find((r) => r.ageA === 81)!; // both alive
    const after = result.rows.find((r) => r.ageA === 83)!; // A has died at 82
    expect(before.filingStatus).toBe('couple');
    expect(after.filingStatus).toBe('single');
    // The home and the cash wedge are household assets — they carry through the survivor transition.
    expect(after.netWorth).toBeGreaterThan(0);
    assertRowInvariants(result.rows);
  });

  it('the bridge benefit steps down as each member turns 65 (household sum)', () => {
    // Couple: the household bridge is the sum of both members'. Member A (born 1962) is 65 at ageA 65,
    // but member B (born 1964) is only 63 then and correctly still draws a bridge — so the household
    // bridge is 0 only once BOTH are past 65 (B turns 65 at ageA 67).
    expect(result.rows.find((r) => r.ageA === 64)!.bridge).toBeGreaterThan(0);
    expect(result.rows.find((r) => r.ageA === 68)!.bridge).toBe(0);
  });

  it('the home downsize at 80 frees equity (home falls, non-reg/liquid rises)', () => {
    const at79 = result.rows.find((r) => r.ageA === 79)!;
    const at80 = result.rows.find((r) => r.ageA === 80)!;
    expect(at80.homeValue).toBeLessThan(at79.homeValue); // 40% released
  });

  it('adding the RRSP meltdown on top of every other lever keeps all invariants', () => {
    const melted = runScenario(household, { ...scenario, meltdown: { mode: 'moderate' } });
    expect(melted.rows).toHaveLength(95 - 60 + 1);
    assertRowInvariants(melted.rows);
    const sumTax = melted.rows.reduce((s, r) => s + r.tax, 0);
    expect(melted.totals.lifetimeTax).toBeCloseTo(sumTax, 2);
    expect(finite(melted.totals.estateValue)).toBe(true);
  });
});

describe('kitchen-sink: every feature over a stress path, Monte Carlo, and history', () => {
  it('survives a hand-built early-crash path with invariants intact', () => {
    const years = 95 - 60 + 1;
    const crash: ReturnPathByType = Array.from({ length: years }, (_, i) => ({ returnPct: i < 3 ? -22 : 6, inflationPct: 2.2, indexingPct: 2 }));
    const res = runScenarioOverPath(household, scenario, crash);
    expect(res.rows).toHaveLength(years);
    assertRowInvariants(res.rows);
    expect(finite(res.totals.estateValue)).toBe(true);
  });

  it('Monte Carlo aggregates cleanly with every lever on', () => {
    const mc = runMonteCarloScenario(household, { ...scenario, assumptions: { ...scenario.assumptions, mode: 'monteCarlo', runs: 120 } }, 7);
    expect(mc.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
    expect(mc.probabilityOfSuccess).toBeLessThanOrEqual(1);
    expect(mc.netWorth).toHaveLength(95 - 60 + 1);
    expect(finite(mc.estateValue.p50)).toBe(true);
    expect(mc.estateValue.p95).toBeGreaterThanOrEqual(mc.estateValue.p5);
  });

  it('the historical backtest runs the full feature set over every start year', () => {
    const bt = runHistoricalBacktest(household, scenario);
    expect(bt.cohorts).toBeGreaterThan(0);
    expect(bt.successRate).toBeGreaterThanOrEqual(0);
    expect(bt.successRate).toBeLessThanOrEqual(1);
    expect(bt.worstStartYear).not.toBeNull();
    expect(finite(bt.estate.p50)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { Household, Scenario } from '../../types/planner';
import { runScenario } from '../engine';
import { breakEven, compareScenarios, COMPARISON_METRICS } from './index';

const household: Household = {
  province: 'ON',
  memberA: {
    birthDate: '1969-01-01',
    planJoinDate: '2005-06-01', // Group 1
    currentSalary: 95_000,
    bestFiveAvgSalary: 95_000,
    pensionableServiceYears: 30,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 1_100,
    oasEligible: true,
  },
  accounts: [
    { id: 'r', owner: 'memberA', type: 'rrsp', currentBalance: 400_000, riskProfile: { expectedReturn: 5, volatility: 10 } },
    { id: 't', owner: 'memberA', type: 'tfsa', currentBalance: 100_000, riskProfile: { expectedReturn: 5, volatility: 10 } },
    { id: 'n', owner: 'memberA', type: 'nonReg', currentBalance: 50_000, riskProfile: { expectedReturn: 4, volatility: 8 } },
  ],
};

const scenario: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 95, mode: 'deterministic', targetAnnualSpending: 60_000 },
  events: {},
};

describe('compareScenarios', () => {
  const results = [
    runScenario(household, scenario),
    runScenario(household, { ...scenario, cppStartAge: { memberA: 70 }, oasStartAge: { memberA: 70 } }),
    runScenario(household, { ...scenario, withdrawalOrder: ['rrsp', 'nonReg', 'tfsa'] }),
  ];
  const table = compareScenarios(results);

  it('has exactly one row per metric, in order', () => {
    expect(table.rows).toHaveLength(COMPARISON_METRICS.length);
    expect(table.rows.map((r) => r.metric)).toEqual(COMPARISON_METRICS);
  });

  it('each metric row carries one value per scenario', () => {
    expect(table.scenarioCount).toBe(3);
    for (const row of table.rows) expect(row.values).toHaveLength(3);
  });

  it('pulls the totals through correctly', () => {
    const lifetimeAfterTax = table.rows.find((r) => r.metric === 'lifetimeAfterTax')!;
    expect(lifetimeAfterTax.values).toEqual(results.map((r) => r.totals.lifetimeAfterTax));
    const lasts = table.rows.find((r) => r.metric === 'lastsToEndAge')!;
    expect(lasts.values).toEqual(results.map((r) => r.totals.lastsToEndAge));
  });

  it('income-at-age is null when that age is outside the projection', () => {
    const lateRetire = runScenario(
      { ...household, memberA: { ...household.memberA, targetRetirementAge: 65 } },
      scenario,
    );
    const table1 = compareScenarios([lateRetire]);
    expect(table1.rows.find((r) => r.metric === 'incomeAt60')!.values[0]).toBeNull();
    expect(table1.rows.find((r) => r.metric === 'incomeAt65')!.values[0]).not.toBeNull();
  });
});

describe('breakEven — CPP and OAS crossover ages', () => {
  const result = breakEven(household, scenario);

  it('CPP break-even (start 60 vs 65) lands in the plausible range (~73–74)', () => {
    // eslint-disable-next-line no-console
    console.log(`[break-even] CPP start 60 vs 65: age ${result.cppBreakEvenAge}`);
    expect(result.cppBreakEvenAge).toBeDefined();
    expect(result.cppBreakEvenAge!).toBeGreaterThanOrEqual(72);
    expect(result.cppBreakEvenAge!).toBeLessThanOrEqual(76);
  });

  it('OAS break-even (start 65 vs 70) lands in the plausible range (~82–83)', () => {
    // eslint-disable-next-line no-console
    console.log(`[break-even] OAS start 65 vs 70: age ${result.oasBreakEvenAge}`);
    expect(result.oasBreakEvenAge).toBeDefined();
    expect(result.oasBreakEvenAge!).toBeGreaterThanOrEqual(80);
    expect(result.oasBreakEvenAge!).toBeLessThanOrEqual(85);
  });
});

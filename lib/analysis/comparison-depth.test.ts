import { describe, expect, it } from 'vitest';
import type { Household, Scenario } from '../../types/planner';
import { runScenario } from '../engine';
import { breakEven, compareScenariosDetailed, COMPARISON_METRICS } from './index';

const household: Household = {
  province: 'ON',
  memberA: {
    birthDate: '1969-01-01',
    planJoinDate: '2005-06-01',
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

describe('compareScenariosDetailed', () => {
  const results = [
    runScenario(household, scenario), // baseline (index 0)
    runScenario(household, { ...scenario, cppStartAge: { memberA: 70 }, oasStartAge: { memberA: 70 } }),
    runScenario(household, { ...scenario, cppStartAge: { memberA: 60 } }),
  ];
  const table = compareScenariosDetailed(results);

  it('has one row per metric and one cell per scenario', () => {
    expect(table.rows).toHaveLength(COMPARISON_METRICS.length);
    expect(table.baselineIndex).toBe(0);
    for (const row of table.rows) expect(row.cells).toHaveLength(3);
  });

  it('baseline cell has zero delta and zero %; deltas are value − baseline', () => {
    const lat = table.rows.find((r) => r.metric === 'lifetimeAfterTax')!;
    expect(lat.cells[0].deltaVsBaseline).toBe(0);
    expect(lat.cells[0].pctVsBaseline).toBe(0);
    expect(lat.cells[1].deltaVsBaseline).toBeCloseTo(results[1].totals.lifetimeAfterTax - results[0].totals.lifetimeAfterTax, 6);
  });

  it('% difference matches delta / |baseline|', () => {
    const tax = table.rows.find((r) => r.metric === 'lifetimeTax')!;
    const base = results[0].totals.lifetimeTax;
    expect(tax.cells[1].pctVsBaseline).toBeCloseTo((results[1].totals.lifetimeTax - base) / Math.abs(base), 9);
  });

  it('flags exactly the best scenario per metric, respecting direction', () => {
    const tax = table.rows.find((r) => r.metric === 'lifetimeTax')!; // lower is better
    const taxes = results.map((r) => r.totals.lifetimeTax);
    const minIdx = taxes.indexOf(Math.min(...taxes));
    expect(tax.cells[minIdx].isWinner).toBe(true);
    expect(tax.cells.filter((c) => c.isWinner).length).toBeGreaterThanOrEqual(1);

    const estate = table.rows.find((r) => r.metric === 'estateValue')!; // higher is better
    const estates = results.map((r) => r.totals.estateValue);
    const maxIdx = estates.indexOf(Math.max(...estates));
    expect(estate.cells[maxIdx].isWinner).toBe(true);
  });

  it('is a serializable plain object (round-trips through JSON)', () => {
    expect(JSON.parse(JSON.stringify(table))).toEqual(table);
  });
});

describe('breakEven — interpolated (fractional) crossover', () => {
  const result = breakEven(household, scenario);

  it('CPP break-even is a fractional age strictly below the integer crossover (~73), in range', () => {
    // eslint-disable-next-line no-console
    console.log(`[break-even/interp] CPP: ${result.cppBreakEvenAge}`);
    expect(result.cppBreakEvenAge!).toBeGreaterThan(72);
    expect(result.cppBreakEvenAge!).toBeLessThan(73); // interpolation places it inside year 72→73
  });

  it('OAS break-even is a fractional age strictly below the integer crossover (~83), in range', () => {
    // eslint-disable-next-line no-console
    console.log(`[break-even/interp] OAS: ${result.oasBreakEvenAge}`);
    expect(result.oasBreakEvenAge!).toBeGreaterThan(82);
    expect(result.oasBreakEvenAge!).toBeLessThan(83);
  });
});

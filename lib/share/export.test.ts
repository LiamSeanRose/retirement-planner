import { describe, expect, it } from 'vitest';
import type { Household, Scenario } from '../../types/planner';
import { runScenario } from '../engine';
import { csvFilename, projectionToCsv } from './export';
import { loadPlans, newPlanId, persistPlans } from './plans';

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
  accounts: [{ id: 'r', owner: 'memberA', type: 'rrsp', currentBalance: 400_000, riskProfile: { expectedReturn: 5, volatility: 10 } }],
  home: { currentValue: 500_000, appreciationPct: 3 },
};
const scenario: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic', targetAnnualSpending: 60_000 },
  events: {},
};

describe('projectionToCsv', () => {
  const result = runScenario(household, scenario);
  const csv = projectionToCsv(result);
  const lines = csv.split('\n');

  it('emits a header plus one row per projected year', () => {
    expect(lines).toHaveLength(result.rows.length + 1);
  });

  it('has a stable, rectangular shape (every row matches the header column count)', () => {
    const cols = lines[0].split(',').length;
    expect(cols).toBeGreaterThan(20); // the full income + balances + home + net-worth set
    for (const line of lines) expect(line.split(',')).toHaveLength(cols);
  });

  it('carries the home value and key columns', () => {
    expect(lines[0]).toContain('Home value');
    expect(lines[0]).toContain('After-tax income');
    expect(lines[0]).toContain('Liquid net worth');
    // First data row starts with the retirement year and age 60.
    const first = lines[1].split(',');
    expect(Number(first[0])).toBe(result.rows[0].year);
    expect(Number(first[1])).toBe(60);
  });
});

describe('csvFilename', () => {
  it('slugifies a plan name', () => {
    expect(csvFilename('Retire at 60')).toBe('retire-at-60-projection.csv');
    expect(csvFilename('  weird/name!! ')).toBe('weird-name-projection.csv');
    expect(csvFilename('')).toBe('plan-projection.csv');
  });
});

describe('plan store (SSR-safe localStorage guards)', () => {
  it('loadPlans returns [] and persistPlans no-ops without a window (never throws)', () => {
    expect(loadPlans()).toEqual([]);
    expect(() => persistPlans([{ id: 'x', name: 'A', savedAt: 0, household, scenario }])).not.toThrow();
  });
  it('newPlanId produces distinct ids', () => {
    expect(newPlanId()).not.toBe(newPlanId());
  });
});

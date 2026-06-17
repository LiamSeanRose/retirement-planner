import { describe, expect, it } from 'vitest';
import type { Household, Scenario } from '../../types/planner';
import { optimizePlan } from './index';

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

// A "your plan" that is deliberately sub-optimal (CPP/OAS at 67), with small MC runs for test speed.
const yourScenario: Scenario = {
  cppStartAge: { memberA: 67 },
  oasStartAge: { memberA: 67 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic', runs: 40, targetAnnualSpending: 60_000 },
  events: {},
};

describe('optimizePlan — deterministic scoring', () => {
  const out = optimizePlan(household, yourScenario, 'maxLifetimeAfterTax');

  it('the winner never scores worse than the user plan or the do-nothing baseline', () => {
    expect(out.winner.score).toBeGreaterThanOrEqual(out.yourPlan.score - 1e-6);
    expect(out.winner.score).toBeGreaterThanOrEqual(out.doNothing.score - 1e-6);
  });

  it('returns all three plans with a confidence in [0,1] and stated assumptions', () => {
    for (const plan of [out.winner, out.doNothing, out.yourPlan]) {
      expect(plan.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
      expect(plan.probabilityOfSuccess).toBeLessThanOrEqual(1);
      expect(Number.isFinite(plan.result.totals.lifetimeAfterTax)).toBe(true);
    }
    expect(out.scoring).toEqual({ kind: 'deterministic', objective: 'maxLifetimeAfterTax' });
    expect(out.assumptions.province).toBe('ON');
    expect(out.assumptions.endAge).toBe(90);
    expect(out.evaluated).toBeGreaterThan(2);
  });

  it('the do-nothing baseline uses CPP/OAS at 65 and no meltdown', () => {
    expect(out.doNothing.scenario.cppStartAge.memberA).toBe(65);
    expect(out.doNothing.scenario.oasStartAge.memberA).toBe(65);
    expect(out.doNothing.scenario.meltdown.mode).toBe('none');
  });

  it('the user plan echoes the input unchanged', () => {
    expect(out.yourPlan.scenario).toEqual(yourScenario);
  });
});

describe('optimizePlan — Monte-Carlo scoring (probability of success)', () => {
  it('maximises probability of success; winner ≥ both baselines; reproducible under a seed', () => {
    const a = optimizePlan(household, yourScenario, { kind: 'monteCarlo', seed: 7 });
    expect(a.scoring).toEqual({ kind: 'monteCarlo', seed: 7 });
    expect(a.winner.score).toBeGreaterThanOrEqual(a.yourPlan.score - 1e-9);
    expect(a.winner.score).toBeGreaterThanOrEqual(a.doNothing.score - 1e-9);
    expect(a.winner.score).toBeGreaterThanOrEqual(0);
    expect(a.winner.score).toBeLessThanOrEqual(1);

    const b = optimizePlan(household, yourScenario, { kind: 'monteCarlo', seed: 7 });
    expect(b).toEqual(a); // seeded ⇒ identical
  });
});

describe('optimizePlan — knob selection', () => {
  it('searching fewer knobs evaluates fewer candidates', () => {
    const all = optimizePlan(household, yourScenario, 'minLifetimeTax');
    const orderOnly = optimizePlan(household, yourScenario, 'minLifetimeTax', {
      cppStart: false,
      oasStart: false,
      meltdownPace: false,
      withdrawalOrder: true,
    });
    expect(orderOnly.evaluated).toBeLessThan(all.evaluated);
    // Still respects the invariant with a single knob.
    expect(orderOnly.winner.score).toBeGreaterThanOrEqual(orderOnly.yourPlan.score - 1e-6);
  });
});

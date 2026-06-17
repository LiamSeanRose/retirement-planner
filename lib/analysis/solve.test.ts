import { describe, expect, it } from 'vitest';
import type { Household, Scenario } from '../../types/planner';
import { runScenario } from '../engine';
import { answerPlanQuestions, earliestRetirementAge, maxSpendingAtReturnDelta, maxSustainableSpending } from './solve';

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
    { id: 'n', owner: 'memberA', type: 'nonReg', currentBalance: 60_000, riskProfile: { expectedReturn: 4, volatility: 8 } },
  ],
};
const scenario: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic', targetAnnualSpending: 60_000 },
  events: {},
};

describe('maxSustainableSpending', () => {
  const max = maxSustainableSpending(household, scenario);

  it('returns a positive, finite spend the plan actually sustains', () => {
    expect(max).toBeGreaterThan(0);
    expect(Number.isFinite(max)).toBe(true);
    expect(runScenario(household, { ...scenario, assumptions: { ...scenario.assumptions, targetAnnualSpending: max } }).totals.lastsToEndAge).toBe(true);
  });

  it('is a real ceiling — a clearly higher spend does NOT sustain', () => {
    expect(runScenario(household, { ...scenario, assumptions: { ...scenario.assumptions, targetAnnualSpending: max + 25_000 } }).totals.lastsToEndAge).toBe(false);
  });
});

describe('earliestRetirementAge', () => {
  it('finds an age no later than the current target for a sustainable plan', () => {
    const age = earliestRetirementAge(household, scenario);
    expect(age).not.toBeNull();
    expect(age!).toBeLessThanOrEqual(60);
    expect(age!).toBeGreaterThanOrEqual(50);
  });

  it('returns null when even the current age cannot fund the spend', () => {
    const unaffordable = { ...scenario, assumptions: { ...scenario.assumptions, targetAnnualSpending: 250_000 } };
    expect(earliestRetirementAge(household, unaffordable)).toBeNull();
  });
});

describe('maxSpendingAtReturnDelta', () => {
  it('lower returns reduce the sustainable spend', () => {
    expect(maxSpendingAtReturnDelta(household, scenario, -1)).toBeLessThan(maxSustainableSpending(household, scenario));
  });
});

describe('answerPlanQuestions', () => {
  it('returns all of the headline answers together', () => {
    const a = answerPlanQuestions(household, scenario);
    expect(a.targetSpend).toBe(60_000);
    expect(a.targetAge).toBe(60);
    expect(a.maxSpend).toBeGreaterThan(0);
    expect(a.maxSpendLowerReturns).toBeLessThanOrEqual(a.maxSpend);
  });
});

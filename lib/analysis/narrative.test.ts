import { describe, expect, it } from 'vitest';
import type { Household, Scenario } from '../../types/planner';
import { runScenario } from '../engine';
import { narratePlan } from './narrative';

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

const text = (h: Household, s: Scenario, prob?: number) => narratePlan({ household: h, scenario: s, result: runScenario(h, s), successProbability: prob }).join(' ');

describe('narratePlan', () => {
  it('opens with the retirement age and covers tax + estate', () => {
    const lines = narratePlan({ household, scenario, result: runScenario(household, scenario) });
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toContain('retire at 60');
    const all = lines.join(' ');
    expect(all).toMatch(/tax/i);
    expect(all).toMatch(/estate/i);
  });

  it('describes the bridge benefit for an under-65 retiree', () => {
    expect(text(household, scenario)).toMatch(/bridge/i);
  });

  it('adds the Monte Carlo confidence line when a probability is supplied', () => {
    expect(text(household, scenario, 0.87)).toContain('87%');
    expect(text(household, scenario)).not.toMatch(/% of the time/);
  });

  it('warns plainly when the plan runs short', () => {
    const strained = { ...scenario, assumptions: { ...scenario.assumptions, targetAnnualSpending: 160_000 } };
    expect(text(household, strained)).toMatch(/run short/i);
  });

  it('says unreduced for an unreduced milestone, and reduced otherwise', () => {
    // Group 1, age 60 + 30 yrs of service ⇒ unreduced (55+30 rule).
    expect(text(household, scenario)).toMatch(/no early-retirement penalty|unreduced/i);
    // Retire at 56 with the same service ⇒ a permanent reduction.
    const early: Household = { ...household, memberA: { ...household.memberA, targetRetirementAge: 56, pensionableServiceYears: 20 } };
    expect(text(early, scenario)).toMatch(/reduction/i);
  });

  it('names a spouse in couple mode', () => {
    const couple: Household = { ...household, memberB: { ...household.memberA, label: 'B', estimatedCppAt65Monthly: 900 } };
    const cs: Scenario = { ...scenario, cppStartAge: { memberA: 65, memberB: 65 }, oasStartAge: { memberA: 65, memberB: 65 } };
    expect(text(couple, cs)).toContain('You and your spouse');
  });

  it('mentions the "if this happens" events baked into the numbers', () => {
    const withEvents: Scenario = {
      ...scenario,
      events: { ...scenario.events, longTermCare: { startAge: 85, annualAmount: 75_000, years: 4 }, windfall: { atAge: 70, amount: 150_000 } },
    };
    const all = text(household, withEvents);
    expect(all).toMatch(/long-term care/i);
    expect(all).toMatch(/windfall/i);
  });
});

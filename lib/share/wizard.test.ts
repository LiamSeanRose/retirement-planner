import { describe, expect, it } from 'vitest';
import { determineGroup } from '../pension';
import { runScenario } from '../engine';
import { buildPlanFromAnswers, WIZARD_DEFAULTS } from './wizard';

describe('buildPlanFromAnswers', () => {
  it('produces a runnable plan from the default answers', () => {
    const { household, scenario } = buildPlanFromAnswers(WIZARD_DEFAULTS);
    expect(household.memberA.targetRetirementAge).toBe(WIZARD_DEFAULTS.retireAge);
    expect(scenario.assumptions.targetAnnualSpending).toBe(WIZARD_DEFAULTS.annualSpending);
    // All three savings accounts present (defaults are non-zero), plus a home.
    expect(household.accounts.map((a) => a.type).sort()).toEqual(['nonReg', 'rrsp', 'tfsa']);
    expect(household.home?.currentValue).toBe(WIZARD_DEFAULTS.homeValue);
    const res = runScenario(household, scenario);
    expect(res.rows.length).toBeGreaterThan(0);
    expect(Number.isFinite(res.totals.estateValue)).toBe(true);
  });

  it('maps the join era to the right pension group', () => {
    const g1 = buildPlanFromAnswers({ ...WIZARD_DEFAULTS, joinedBefore2013: true });
    const g2 = buildPlanFromAnswers({ ...WIZARD_DEFAULTS, joinedBefore2013: false });
    expect(determineGroup(g1.household.memberA.planJoinDate)).toBe(1);
    expect(determineGroup(g2.household.memberA.planJoinDate)).toBe(2);
  });

  it('adds a spouse (with CPP/OAS start ages) only when asked', () => {
    expect(buildPlanFromAnswers({ ...WIZARD_DEFAULTS, hasSpouse: false }).household.memberB).toBeUndefined();
    const couple = buildPlanFromAnswers({ ...WIZARD_DEFAULTS, hasSpouse: true });
    expect(couple.household.memberB).toBeDefined();
    expect(couple.scenario.cppStartAge.memberB).toBe(65);
    expect(couple.scenario.oasStartAge.memberB).toBe(65);
  });

  it('omits zero-balance accounts and a home when not owned', () => {
    const plan = buildPlanFromAnswers({ ...WIZARD_DEFAULTS, tfsa: 0, nonReg: 0, ownsHome: false });
    expect(plan.household.accounts.map((a) => a.type)).toEqual(['rrsp']);
    expect(plan.household.home).toBeUndefined();
  });
});

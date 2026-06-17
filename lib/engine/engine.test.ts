import { describe, expect, it } from 'vitest';
import type { Household, ReturnPathByType, Scenario } from '../../types/planner';
import { blendedRiskProfile, blendedRiskProfileByType, runMonteCarloScenario, runScenario, runScenarioOverPath } from './index';

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
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic', targetAnnualSpending: 60_000 },
  events: {},
};

describe('blendedRiskProfile', () => {
  it('balance-weights the per-account return', () => {
    // (5×400k + 5×100k + 4×50k) / 550k = 4.909…
    expect(blendedRiskProfile(household.accounts).meanPct).toBeCloseTo(4.909, 2);
  });
  it('handles no accounts without dividing by zero', () => {
    expect(blendedRiskProfile([])).toEqual({ meanPct: 0, volPct: 0 });
  });
});

describe('runScenario (deterministic, end-to-end)', () => {
  const result = runScenario(household, scenario);

  it('produces one row per year from retirement to end age', () => {
    expect(result.rows.length).toBe(90 - 60 + 1);
    expect(result.rows[0].ageA).toBe(60);
    expect(result.rows[result.rows.length - 1].ageA).toBe(90);
  });

  it('the bridge benefit steps down to 0 at 65', () => {
    const at64 = result.rows.find((r) => r.ageA === 64)!;
    const at65 = result.rows.find((r) => r.ageA === 65)!;
    expect(at64.bridge).toBeGreaterThan(0);
    expect(at65.bridge).toBe(0);
    expect(at64.pension).toBeGreaterThan(0); // lifetime continues past 65
  });

  it('rolls up totals via the real tax engine', () => {
    expect(result.totals.lifetimeTax).toBeGreaterThan(0);
    expect(Number.isFinite(result.totals.lifetimeAfterTax)).toBe(true);
    expect(Number.isFinite(result.totals.estateValue)).toBe(true);
    expect(typeof result.totals.lastsToEndAge).toBe('boolean');
  });
});

describe('runMonteCarloScenario (aggregated)', () => {
  const mcScenario: Scenario = { ...scenario, assumptions: { ...scenario.assumptions, mode: 'monteCarlo', runs: 200 } };

  it('returns a probability of success in [0, 1]', () => {
    const mc = runMonteCarloScenario(household, mcScenario, 42);
    expect(mc.probabilityOfSuccess).toBeGreaterThanOrEqual(0);
    expect(mc.probabilityOfSuccess).toBeLessThanOrEqual(1);
  });

  it('labels net-worth bands by age (not 0-based year)', () => {
    const mc = runMonteCarloScenario(household, mcScenario, 42);
    expect(mc.netWorth[0].age).toBe(60);
    expect(mc.netWorth.length).toBe(90 - 60 + 1);
  });

  it('is reproducible under a fixed seed', () => {
    const a = runMonteCarloScenario(household, mcScenario, 42);
    const b = runMonteCarloScenario(household, mcScenario, 42);
    expect(a).toEqual(b);
  });

  it('populates after-tax fan-chart bands (one per year, age-labelled, ordered)', () => {
    const mc = runMonteCarloScenario(household, mcScenario, 42);
    expect(mc.afterTax).toHaveLength(90 - 60 + 1);
    expect(mc.afterTax[0].age).toBe(60);
    expect(mc.afterTax[0].p95).toBeGreaterThanOrEqual(mc.afterTax[0].p5);
  });
});

describe('blendedRiskProfileByType', () => {
  it('blends the return/volatility within each account type', () => {
    const byType = blendedRiskProfileByType(household.accounts);
    expect(byType.rrsp.meanPct).toBeCloseTo(5, 6); // the lone rrsp account is 5%
    expect(byType.tfsa.meanPct).toBeCloseTo(5, 6);
    expect(byType.nonReg.meanPct).toBeCloseTo(4, 6); // the lone non-reg account is 4%
  });
});

describe('runScenarioOverPath', () => {
  it('runs one projection over a caller-supplied return path', () => {
    const years = 90 - 60 + 1;
    const customPath: ReturnPathByType = Array.from({ length: years }, () => ({ returnPct: 6, inflationPct: 2, indexingPct: 2 }));
    const res = runScenarioOverPath(household, scenario, customPath);
    expect(res.rows).toHaveLength(years);
    expect(res.rows[0].ageA).toBe(60);
    expect(Number.isFinite(res.totals.estateValue)).toBe(true);
  });
});

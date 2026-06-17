import { describe, expect, it } from 'vitest';
import type { Household, Scenario } from '../../types/planner';
import { runScenario } from '../engine';
import { cppOasOptimizer, OBJECTIVES, scoreScenario, strategyOptimizer, type Objective } from './index';

const baseHousehold: Household = {
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

const baseScenario: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic', targetAnnualSpending: 60_000 },
  events: {},
};

// A modest, low-income household: pension + CPP + OAS stay well under the OAS clawback threshold,
// so OAS retained is maximised purely by deferring OAS to 70.
const modestHousehold: Household = {
  province: 'ON',
  memberA: {
    birthDate: '1969-01-01',
    planJoinDate: '2005-06-01',
    currentSalary: 55_000,
    bestFiveAvgSalary: 55_000,
    pensionableServiceYears: 18,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 700,
    oasEligible: true,
  },
  accounts: [{ id: 'r', owner: 'memberA', type: 'rrsp', currentBalance: 80_000, riskProfile: { expectedReturn: 4, volatility: 8 } }],
};
const modestScenario: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic' }, // no discretionary spending
  events: {},
};

describe('scoreScenario', () => {
  const r = runScenario(baseHousehold, baseScenario);
  it('higher-is-better, with minimize objectives negated', () => {
    expect(scoreScenario('maxEstateValue', r)).toBe(r.totals.estateValue);
    expect(scoreScenario('maxLifetimeAfterTax', r)).toBe(r.totals.lifetimeAfterTax);
    expect(scoreScenario('minLifetimeTax', r)).toBe(-r.totals.lifetimeTax);
    expect(scoreScenario('maxOasRetained', r)).toBe(r.totals.oasRetained);
  });
  it('is finite for every objective', () => {
    for (const o of OBJECTIVES) expect(Number.isFinite(scoreScenario(o, r))).toBe(true);
  });
});

describe('cppOasOptimizer — exact enumeration', () => {
  it('enumerates all 66 CPP×OAS pairs', () => {
    const out = cppOasOptimizer(baseHousehold, baseScenario, 'maxLifetimeAfterTax');
    expect(out.evaluated).toBe(11 * 6);
  });

  it('returns a pair within the legal start-age ranges, reflected in the winning scenario', () => {
    const out = cppOasOptimizer(baseHousehold, baseScenario, 'maxEstateValue');
    expect(out.bestCppStartAge).toBeGreaterThanOrEqual(60);
    expect(out.bestCppStartAge).toBeLessThanOrEqual(70);
    expect(out.bestOasStartAge).toBeGreaterThanOrEqual(65);
    expect(out.bestOasStartAge).toBeLessThanOrEqual(70);
    expect(out.scenario.cppStartAge.memberA).toBe(out.bestCppStartAge);
    expect(out.scenario.oasStartAge.memberA).toBe(out.bestOasStartAge);
  });

  it('picks the true argmax (matches an independent brute-force search)', () => {
    const objective: Objective = 'maxLifetimeAfterTax';
    let bestScore = -Infinity;
    let bestPair = { cpp: 0, oas: 0 };
    for (let cpp = 60; cpp <= 70; cpp++) {
      for (let oas = 65; oas <= 70; oas++) {
        const s: Scenario = { ...baseScenario, cppStartAge: { memberA: cpp }, oasStartAge: { memberA: oas } };
        const score = scoreScenario(objective, runScenario(baseHousehold, s));
        if (score > bestScore) {
          bestScore = score;
          bestPair = { cpp, oas };
        }
      }
    }
    const out = cppOasOptimizer(baseHousehold, baseScenario, objective);
    expect(out.score).toBeCloseTo(bestScore, 6);
    expect(out.bestCppStartAge).toBe(bestPair.cpp);
    expect(out.bestOasStartAge).toBe(bestPair.oas);
  });

  it('known-best: maximising OAS retained defers OAS to 70 when there is no clawback', () => {
    const out = cppOasOptimizer(modestHousehold, modestScenario, 'maxOasRetained');
    expect(out.bestOasStartAge).toBe(70);
  });
});

describe('strategyOptimizer — coordinate descent', () => {
  it('never returns a plan worse than the do-nothing baseline', () => {
    for (const objective of ['maxEstateValue', 'maxLifetimeAfterTax', 'minLifetimeTax'] as Objective[]) {
      const out = strategyOptimizer(baseHousehold, baseScenario, objective);
      expect(out.best.score).toBeGreaterThanOrEqual(out.baseline.score - 1e-6);
    }
  });

  it('returns the do-nothing baseline alongside the best plan', () => {
    const out = strategyOptimizer(baseHousehold, baseScenario, 'maxEstateValue');
    expect(out.baseline.scenario).toEqual(baseScenario);
    expect(out.baseline.score).toBe(out.baseline.result.totals.estateValue);
    expect(Number.isFinite(out.best.result.totals.estateValue)).toBe(true);
  });

  it('explores withdrawal orderings (any chosen order is a valid 3-account permutation)', () => {
    const out = strategyOptimizer(baseHousehold, baseScenario, 'minLifetimeTax');
    const order = out.best.scenario.withdrawalOrder;
    // The optimizer only sets an explicit order if one beat the baseline; if set, it's a full permutation.
    if (order !== undefined) {
      expect(order).toHaveLength(3);
      expect(new Set(order)).toEqual(new Set(['nonReg', 'rrsp', 'tfsa']));
    }
  });
});

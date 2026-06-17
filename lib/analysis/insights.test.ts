import { describe, expect, it } from 'vitest';
import type { Household, Scenario } from '../../types/planner';
import { generateInsights, type Insight } from './insights';

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
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic', targetAnnualSpending: 60_000 },
  events: {},
};

const OPPORTUNITY_IDS = new Set(['cppTiming', 'oasTiming', 'withdrawalSequencing']);
const WARNING_IDS = new Set(['oasClawback', 'sustainability']);

describe('generateInsights — signs, ranking, serializability', () => {
  const report = generateInsights(household, scenario);

  it('produces at least one insight, each with title / impact / confidence / lever', () => {
    expect(report.insights.length).toBeGreaterThan(0);
    for (const i of report.insights) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(Number.isFinite(i.impact)).toBe(true);
      expect(['high', 'medium', 'low']).toContain(i.confidence);
      expect(i.lever.length).toBeGreaterThan(0);
    }
  });

  it('opportunities have positive impact; warnings have negative impact', () => {
    for (const i of report.insights) {
      if (OPPORTUNITY_IDS.has(i.id)) expect(i.impact).toBeGreaterThan(0);
      if (WARNING_IDS.has(i.id)) expect(i.impact).toBeLessThan(0);
    }
  });

  it('is ranked by |impact| descending', () => {
    const mags = report.insights.map((i) => Math.abs(i.impact));
    for (let k = 1; k < mags.length; k++) expect(mags[k - 1]).toBeGreaterThanOrEqual(mags[k]);
  });

  it('surfaces a CPP- or OAS-timing opportunity for this household, with the right lever', () => {
    const timing = report.insights.find((i) => i.id === 'cppTiming' || i.id === 'oasTiming');
    expect(timing).toBeDefined();
    expect(timing!.impact).toBeGreaterThan(0);
    expect(['cppStartAge', 'oasStartAge']).toContain(timing!.lever);
  });

  it('every insight is a serializable plain object (round-trips through JSON)', () => {
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});

describe('generateInsights — warnings', () => {
  it('warns about sustainability when the plan runs short', () => {
    const broke: Household = {
      ...household,
      accounts: [{ id: 'r', owner: 'memberA', type: 'rrsp', currentBalance: 50_000, riskProfile: { expectedReturn: 3, volatility: 8 } }],
    };
    const hungry: Scenario = { ...scenario, assumptions: { ...scenario.assumptions, targetAnnualSpending: 140_000 } };
    const warning = generateInsights(broke, hungry).insights.find((i) => i.id === 'sustainability');
    expect(warning).toBeDefined();
    expect(warning!.impact).toBeLessThan(0);
  });

  it('warns about the OAS clawback for a high-income retiree', () => {
    const wealthy: Household = {
      ...household,
      memberA: { ...household.memberA, bestFiveAvgSalary: 140_000, pensionableServiceYears: 35 },
      accounts: [{ id: 'r', owner: 'memberA', type: 'rrsp', currentBalance: 700_000, riskProfile: { expectedReturn: 5, volatility: 10 } }],
    };
    const lowSpend: Scenario = { ...scenario, assumptions: { ...scenario.assumptions, targetAnnualSpending: 40_000 } };
    const clawback = generateInsights(wealthy, lowSpend).insights.find((i) => i.id === 'oasClawback');
    expect(clawback).toBeDefined();
    expect(clawback!.impact).toBeLessThan(0);
  });
});

// Type-level: Insight is a plain serializable shape (no methods).
const _exampleShape: Insight = { id: 'x', title: 't', detail: 'd', impact: 1, impactLabel: '$1', confidence: 'high', lever: 'cppStartAge' };
void _exampleShape;

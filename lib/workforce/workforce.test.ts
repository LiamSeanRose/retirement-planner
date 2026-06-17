import { describe, expect, it } from 'vitest';
import { eriWaiverApplies, secondCareerIncomeForYear, tsmLumpSum, wfaLumpSumForYear } from './index';
import type { Scenario } from '../../types/planner';

const base: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 90, mode: 'deterministic' },
  events: {},
};

describe('tsmLumpSum', () => {
  it('is weeks of pay × weekly salary', () => {
    expect(tsmLumpSum(52, 100_000)).toBeCloseTo(100_000, 6); // 52 weeks = one year of salary
    expect(tsmLumpSum(26, 104_000)).toBeCloseTo(52_000, 6);
  });

  it('clamps negatives to zero', () => {
    expect(tsmLumpSum(-5, 100_000)).toBe(0);
  });
});

describe('eriWaiverApplies', () => {
  it('is true only for the member named in the waiver', () => {
    const s: Scenario = { ...base, events: { eriWaiver: { member: 'memberA' } } };
    expect(eriWaiverApplies(s, 'memberA')).toBe(true);
    expect(eriWaiverApplies(s, 'memberB')).toBe(false);
    expect(eriWaiverApplies(base, 'memberA')).toBe(false);
  });
});

describe('secondCareerIncomeForYear', () => {
  const s: Scenario = { ...base, events: { secondCareerIncome: { member: 'memberB', annualAmount: 40_000, startAge: 60, endAge: 64 } } };

  it('pays inside the window for the named member only', () => {
    expect(secondCareerIncomeForYear(s, 'memberB', 62)).toBe(40_000);
    expect(secondCareerIncomeForYear(s, 'memberB', 65)).toBe(0); // past the window
    expect(secondCareerIncomeForYear(s, 'memberA', 62)).toBe(0); // wrong member
  });
});

describe('wfaLumpSumForYear', () => {
  const s: Scenario = { ...base, events: { wfaPackage: { member: 'memberA', tsmPayoutWeeks: 52, departureAge: 58 } } };

  it('pays the TSM lump sum only in the departure-age year', () => {
    expect(wfaLumpSumForYear(s, 'memberA', 58, 120_000)).toBeCloseTo(120_000, 6);
    expect(wfaLumpSumForYear(s, 'memberA', 59, 120_000)).toBe(0);
    expect(wfaLumpSumForYear(s, 'memberB', 58, 120_000)).toBe(0); // wrong member
  });
});

/**
 * END-TO-END CALIBRATION — pins the corrected totals for a documented reference household and
 * certifies the lifetime-tax finding (engine accuracy pass, item 2).
 *
 * FINDING: the dashboard's large cumulative lifetime tax is CORRECT — not a bug or a double-count.
 *  - `totals.lifetimeTax === Σ rows.tax` EXACTLY (asserted) — terminal/estate tax is reported
 *    separately in `totals.estateValue` and is never folded into lifetimeTax.
 *  - Each year's tax is the real bracket math; the figure is large because it is a NOMINAL cumulative
 *    over 36 years (ages 60→95) and mandatory RRIF minimums from age 72 stack on the indexed pension
 *    + CPP + OAS at high marginal rates — exactly the burden the RRSP meltdown reduces. (Present-
 *    valued, or with a meltdown, it is far lower.) The UI should label this nominal-cumulative.
 *
 * REFERENCE HOUSEHOLD (Dad can reproduce in the official tools): Ontario, born 1979, Group 1 (plan
 * join 2005), $100k best-5 salary, 30 yrs service, retire 60; CPP $1,200/mo and OAS both at 65; one
 * $600k RRSP @ 5%; spend $70k/yr (year-0 dollars, grown 2%); inflation 2%, indexing 2%, end age 95;
 * deterministic, no meltdown.
 */

import { describe, expect, it } from 'vitest';
import { runScenario } from './index';
import type { Household, Scenario } from '../../types/planner';

const referenceHousehold: Household = {
  province: 'ON',
  memberA: {
    birthDate: '1979-01-01',
    planJoinDate: '2005-01-01',
    currentSalary: 100_000,
    bestFiveAvgSalary: 100_000,
    pensionableServiceYears: 30,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 1_200,
    oasEligible: true,
  },
  accounts: [{ id: 'r', owner: 'memberA', type: 'rrsp', currentBalance: 600_000, riskProfile: { expectedReturn: 5, volatility: 10 } }],
};

const referenceScenario: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: { inflationPct: 2, indexingPct: 2, endAge: 95, mode: 'deterministic', targetAnnualSpending: 70_000 },
  events: {},
};

describe('end-to-end calibration — reference household', () => {
  const result = runScenario(referenceHousehold, referenceScenario);

  it('lifetimeTax is EXACTLY the sum of yearly tax (no terminal/estate double-count)', () => {
    const sumRowsTax = result.rows.reduce((s, r) => s + r.tax, 0);
    expect(Math.abs(result.totals.lifetimeTax - sumRowsTax)).toBeLessThan(1e-6);
  });

  it('mandatory RRIF minimums drive tax up from age 72 (the bomb the meltdown targets)', () => {
    const at70 = result.rows.find((r) => r.ageA === 70)!;
    const at80 = result.rows.find((r) => r.ageA === 80)!;
    expect(at70.rrifMin).toBe(0); // pre-conversion: no minimum
    expect(at80.rrifMin).toBeGreaterThan(0);
    expect(at80.tax).toBeGreaterThan(at70.tax);
  });

  it('pins the certified end-to-end totals (a conscious update is required if the engine model changes)', () => {
    expect(result.rows.length).toBe(36); // ages 60..95 inclusive
    expect(result.totals.lastsToEndAge).toBe(true);
    expect(Math.round(result.totals.lifetimeTax)).toBe(1_294_052);
    expect(Math.round(result.totals.lifetimeAfterTax)).toBe(3_538_639);
    expect(Math.round(result.totals.estateValue)).toBe(173_426);
  });
});

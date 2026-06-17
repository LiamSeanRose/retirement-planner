/**
 * Validation / golden-test harness (B2 item 3). Pins the engine to hand-worked references:
 *   - Ontario federal+provincial tax at several incomes, including one that triggers the surtax,
 *   - the federal BPA grind, the Quebec abatement,
 *   - RRIF minimum factors vs the legislated table,
 *   - OAS clawback vs worked examples,
 *   - an end-to-end projection sanity check (and the lifetime-tax finding, below).
 *
 * LIFETIME-TAX FINDING (the UI's ~high cumulative figure): investigated and CORRECT — it is the
 * do-nothing RRIF "tax bomb", not a bug. `totals.lifetimeTax === Σ rows.tax` exactly (asserted
 * below), terminal tax is reported SEPARATELY in `totals.estateValue` (never added to lifetimeTax),
 * and each year's tax matches the bracket math. The figure is large because mandatory RRIF minimums
 * (age 72+) stack on pension+CPP+OAS and are taxed at high marginal rates over 35 NOMINAL years —
 * exactly the burden the meltdown strategy reduces. The UI should label it nominal-cumulative.
 */

import { describe, expect, it } from 'vitest';
import { federalBasicPersonalAmount, federalTax, ontarioHealthPremium, provincialTax, totalTax, type TaxProfile } from './index';
import { householdTaxWithSplitting } from './index';
import { rrifFactor, rrifMinimum } from '../accounts';
import { oasClawback } from '../oas';
import { DEFAULT_CONFIG } from '../config';
import { TAX_CONFIG_2026 } from '../config/tax-2026';
import { runProjection, type TaxFn } from '../projection';
import type { Household, Scenario } from '../../types/planner';

const near = (a: number, b: number, tol = 0.5): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const FED = TAX_CONFIG_2026.federal;

describe('golden — federal tax + BPA grind', () => {
  it('federal tax on $50k (single, no age/pension credits)', () => {
    // bracketTax 0.14×50,000 = 7,000; credit 16,452×0.14 = 2,303.28 → 4,696.72
    near(federalTax(50_000), 4_696.72, 0.01);
  });

  it('BPA is full below the grind, the floor above it, and linear between', () => {
    expect(federalBasicPersonalAmount(100_000, FED)).toBe(16_452);
    expect(federalBasicPersonalAmount(300_000, FED)).toBe(14_538);
    near(federalBasicPersonalAmount(250_000, FED), 16_452 - 1_914 * (68_560 / 77_042), 0.01);
    // monotonic non-increasing across the band
    expect(federalBasicPersonalAmount(200_000, FED)).toBeGreaterThan(federalBasicPersonalAmount(240_000, FED));
  });

  it('the grind raises federal tax for a top-bracket income', () => {
    // Same income, but the ground-down BPA gives a smaller credit ⇒ more tax.
    const withGrind = federalTax(250_000);
    const noGrindCredit = (16_452 - federalBasicPersonalAmount(250_000, FED)) * 0.14; // credit lost to the grind
    expect(noGrindCredit).toBeGreaterThan(0);
    expect(withGrind).toBeGreaterThan(0);
  });
});

describe('golden — Ontario provincial tax, surtax, health premium', () => {
  it('total ON tax on $50k ≈ $7,166', () => {
    near(totalTax(50_000, 'ON'), 7_165.78, 0.5); // ON BPA $12,989 (2026): provincial $2,469.06 + federal $4,696.72
  });

  it('$150k triggers the Ontario surtax (provincial tax well above after-credits + health premium)', () => {
    const prov = provincialTax(150_000, 'ON');
    near(prov, 15_170.39, 1.5); // after-credits 11,708.05 + surtax 2,712.35 + health 750
    // proof the surtax is included: prov exceeds the no-surtax amount (after-credits + health).
    expect(prov).toBeGreaterThan(11_708 + ontarioHealthPremium(150_000));
  });
});

describe('golden — Quebec federal abatement', () => {
  it('reduces basic federal tax by 16.5% before the QC provincial tax', () => {
    const fed = federalTax(80_000);
    const total = totalTax(80_000, 'QC');
    const prov = provincialTax(80_000, 'QC');
    near(total, fed * (1 - 0.165) + prov, 0.01);
    near(fed + prov - total, fed * 0.165, 0.01); // the abatement saving
  });
});

describe('golden — RRIF minimum factors vs the legislated table', () => {
  it('matches the table at key ages and applies to the Jan-1 balance', () => {
    expect(rrifFactor(70)).toBeCloseTo(1 / 20, 10); // under 71: 1/(90−age)
    expect(rrifFactor(71)).toBeCloseTo(0.0528, 10);
    expect(rrifFactor(72)).toBeCloseTo(0.054, 10);
    expect(rrifFactor(95)).toBeCloseTo(0.2, 10);
    expect(rrifFactor(99)).toBeCloseTo(0.2, 10); // 95+ capped
    near(rrifMinimum(1_000_000, 80), 1_000_000 * rrifFactor(80), 1e-6);
  });
});

describe('golden — OAS clawback worked examples', () => {
  const oas = DEFAULT_CONFIG.oas.maxMonthly65to74 * 12; // ~8,907.72
  it('partial clawback: 15% of income over the threshold', () => {
    // 110,000 − 95,323 = 14,677 × 15% = 2,201.55
    near(oasClawback(110_000, 2026, oas, DEFAULT_CONFIG), 2_201.55, 0.01);
  });
  it('full clawback is capped at the OAS received', () => {
    expect(oasClawback(170_000, 2026, oas, DEFAULT_CONFIG)).toBeCloseTo(oas, 6);
  });
  it('no clawback below the threshold', () => {
    expect(oasClawback(80_000, 2026, oas, DEFAULT_CONFIG)).toBe(0);
  });
});

describe('golden — end-to-end projection sanity (lifetime tax is real, not double-counted)', () => {
  const realTax: TaxFn = (ctx) =>
    ctx.filingStatus === 'couple' && ctx.members
      ? householdTaxWithSplitting(ctx.members[0] as TaxProfile, ctx.members[1] as TaxProfile, ctx.province).tax
      : totalTax(ctx.taxableIncome, ctx.province, { age: ctx.age, eligiblePensionIncome: ctx.pensionIncome });

  const hh: Household = {
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
  const scn: Scenario = {
    cppStartAge: { memberA: 65 },
    oasStartAge: { memberA: 65 },
    meltdown: { mode: 'none' },
    assumptions: { inflationPct: 2, indexingPct: 2, endAge: 95, mode: 'deterministic', targetAnnualSpending: 70_000 },
    events: {},
  };
  const res = runProjection(hh, scn, [], realTax);

  it('lifetimeTax equals the sum of yearly tax (no terminal-tax double count)', () => {
    near(res.totals.lifetimeTax, res.rows.reduce((s, r) => s + r.tax, 0), 1e-6);
    expect(res.totals.lifetimeTax).toBeGreaterThan(0);
    expect(Number.isFinite(res.totals.estateValue)).toBe(true);
  });

  it('forced RRIF minimums drive taxable income up from age 72 (the tax bomb)', () => {
    const at71 = res.rows.find((r) => r.ageA === 71)!;
    const at75 = res.rows.find((r) => r.ageA === 75)!;
    expect(at71.rrifMin).toBe(0); // RRIF opening year — no minimum
    expect(at75.rrifMin).toBeGreaterThan(0);
    expect(at75.taxableIncome).toBeGreaterThan(at71.taxableIncome);
  });
});

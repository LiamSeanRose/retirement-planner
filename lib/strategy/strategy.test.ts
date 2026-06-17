import { describe, expect, it } from 'vitest';
import { bracketTop, cppOasTimingCompare, meltdownWithdrawal, withdrawalSequence } from './index';
import { TAX_CONFIG_2026 } from '../config/tax-2026';
import { DEFAULT_CONFIG } from '../config';

const fedBrackets = TAX_CONFIG_2026.federal.brackets; // tops: 58,523 / 117,045 / 181,440 / 258,482 / ∞
const oasThreshold = DEFAULT_CONFIG.oas.clawbackThresholdByIncomeYear[2026]; // 95,323

describe('meltdownWithdrawal — bracket fill (never overshoots)', () => {
  it('fills the current federal bracket to its top', () => {
    const amount = meltdownWithdrawal(70_000, 'ON', { oasGuard: false }); // 2nd bracket → top 117,045
    expect(70_000 + amount).toBe(117_045);
    expect(70_000 + amount).toBeLessThanOrEqual(bracketTop(70_000, fedBrackets));
  });

  it('does not cross out of the first bracket', () => {
    const amount = meltdownWithdrawal(40_000, 'ON', { oasGuard: false });
    expect(40_000 + amount).toBe(58_523);
  });

  it('caps the withdrawal at the available registered balance', () => {
    expect(meltdownWithdrawal(40_000, 'ON', { oasGuard: false, available: 5_000 })).toBe(5_000);
  });

  it('treats income at a boundary as the start of the next bracket', () => {
    // 117,045 is the top of bracket 2, so the next dollar is taxed in bracket 3 (top 181,440).
    const amount = meltdownWithdrawal(117_045, 'ON', { oasGuard: false });
    expect(amount).toBeGreaterThan(0);
    expect(117_045 + amount).toBe(181_440);
  });
});

describe('meltdownWithdrawal — OAS clawback guard', () => {
  it('caps the target at the clawback threshold when base income is below it', () => {
    const amount = meltdownWithdrawal(70_000, 'ON'); // guard on by default
    expect(70_000 + amount).toBe(oasThreshold); // capped at the threshold, not the bracket top
    expect(70_000 + amount).toBeLessThan(117_045);
  });

  it('does not cap once base income already exceeds the threshold', () => {
    const amount = meltdownWithdrawal(100_000, 'ON'); // already above the threshold
    expect(100_000 + amount).toBe(117_045); // guard moot → fills to the bracket top
  });

  it('uses the provincial bracket edge when asked (lower of fed/prov)', () => {
    // Ontario 2nd bracket top 107,785 < federal 117,045 → the provincial edge binds.
    const amount = meltdownWithdrawal(70_000, 'ON', { oasGuard: false, respectProvincialBracket: true });
    expect(70_000 + amount).toBe(107_785);
  });
});

describe('withdrawalSequence', () => {
  it('drains accounts in order and never exceeds a balance', () => {
    const r = withdrawalSequence(120_000, { rrsp: 100_000, tfsa: 50_000, nonReg: 30_000 }, ['nonReg', 'rrsp', 'tfsa']);
    expect(r.draws.nonReg).toBe(30_000); // first in order, drained fully
    expect(r.draws.rrsp).toBe(90_000); // remaining need
    expect(r.draws.tfsa).toBe(0); // not needed
    expect(r.total).toBe(120_000);
    expect(r.shortfall).toBe(0);
    expect(r.draws.rrsp).toBeLessThanOrEqual(100_000);
  });

  it('defaults to non-reg → rrsp → tfsa', () => {
    const r = withdrawalSequence(40_000, { rrsp: 100_000, tfsa: 100_000, nonReg: 25_000 });
    expect(r.draws.nonReg).toBe(25_000);
    expect(r.draws.rrsp).toBe(15_000);
    expect(r.draws.tfsa).toBe(0);
  });

  it('reports a shortfall when balances cannot cover the need', () => {
    const r = withdrawalSequence(200_000, { rrsp: 50_000, tfsa: 20_000, nonReg: 30_000 });
    expect(r.total).toBe(100_000);
    expect(r.shortfall).toBe(100_000);
    expect(r.draws).toEqual({ rrsp: 50_000, tfsa: 20_000, nonReg: 30_000 });
  });
});

describe('cppOasTimingCompare', () => {
  it('returns lifetime totals, the winner, and a break-even age (take-early vs defer)', () => {
    const cmp = cppOasTimingCompare({
      estimatedCppAt65Monthly: 1_000,
      optionA: { cppStartAge: 60, oasStartAge: 65 }, // take early
      optionB: { cppStartAge: 70, oasStartAge: 70 }, // defer
      toAge: 90,
    });
    expect(cmp.a.lifetimeTotal).toBeGreaterThan(0);
    expect(cmp.b.lifetimeTotal).toBeGreaterThan(0);
    expect(cmp.better).toBe('b'); // deferral wins by 90
    expect(cmp.breakEvenAge).not.toBeNull();
    expect(cmp.breakEvenAge as number).toBeGreaterThan(70);
    expect(cmp.breakEvenAge as number).toBeLessThanOrEqual(90);
  });

  it('has no crossover when both options are identical', () => {
    const cmp = cppOasTimingCompare({
      estimatedCppAt65Monthly: 1_000,
      optionA: { cppStartAge: 65, oasStartAge: 65 },
      optionB: { cppStartAge: 65, oasStartAge: 65 },
    });
    expect(cmp.better).toBe('equal');
    expect(cmp.breakEvenAge).toBeNull();
  });
});

/**
 * Province config tests — pin the HONEST verification posture (no silent guesses) and the structural
 * sanity of all 13 federal + provincial/territorial bracket sets, plus spot-checks of the verified
 * provinces' tax math.
 *
 * Verified for 2026: Federal + all 13 provinces/territories — Ontario (plan Appendix), the rest from
 * TaxTips.ca (2026-06, cross-checked against each government's 2026 figures). Quebec uses Revenu
 * Québec's official 2.05% indexation, rates unchanged, plus the 16.5% federal abatement. See
 * lib/ENGINE-NOTES.md for the full posture.
 */

import { describe, expect, it } from 'vitest';
import { TAX_CONFIG_2026, type Province } from '../config/tax-2026';
import { provincialTax } from './index';

const near = (a: number, b: number, tol = 1): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

const ALL: Province[] = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];
// All 13 now carry confirmed 2026 figures (TaxTips.ca / each government, retrieved 2026-06; QC via
// Revenu Québec's official 2.05% indexation). Any future regression to an estimate must be flagged.
const UNVERIFIED: Province[] = [];

describe('province verification posture (honest flags — never a silent guess)', () => {
  it('all 13 provinces/territories carry confirmed 2026 figures', () => {
    for (const p of ALL) {
      expect(TAX_CONFIG_2026.provinces[p].verified).toBe(!UNVERIFIED.includes(p));
    }
  });

  it('every unverified province says so in its note (so the UI/Dad can flag it)', () => {
    for (const p of ALL) {
      const pt = TAX_CONFIG_2026.provinces[p];
      if (!pt.verified) expect((pt.note ?? '').toLowerCase()).toContain('unverified');
    }
  });

  it('Quebec carries the 16.5% federal abatement; no other province does', () => {
    expect(TAX_CONFIG_2026.provinces.QC.federalAbatementRate).toBeCloseTo(0.165, 10);
    for (const p of ALL) if (p !== 'QC') expect(TAX_CONFIG_2026.provinces[p].federalAbatementRate ?? 0).toBe(0);
  });
});

describe('province config — structural sanity (all 13)', () => {
  for (const p of ALL) {
    it(`${p}: ascending brackets, open top, positive BPA, creditRate = lowest rate, monotone tax`, () => {
      const pt = TAX_CONFIG_2026.provinces[p];
      expect(pt.basicPersonalAmount).toBeGreaterThan(0);
      expect(pt.creditRate).toBeCloseTo(pt.brackets[0].rate, 10);
      expect(pt.brackets[pt.brackets.length - 1].upTo).toBeNull();
      let prev = 0;
      for (const b of pt.brackets) {
        if (b.upTo !== null) {
          expect(b.upTo).toBeGreaterThan(prev);
          prev = b.upTo;
        }
        expect(b.rate).toBeGreaterThan(0);
        expect(b.rate).toBeLessThan(1);
      }
      expect(provincialTax(120_000, p)).toBeGreaterThanOrEqual(provincialTax(60_000, p));
    });
  }
});

describe('verified provinces — spot-checked 2026 tax math', () => {
  it('BC: provincial tax on $80k = bracket math − BPA credit (no surtax/health premium)', () => {
    const expected = 0.056 * 50_363 + 0.077 * (80_000 - 50_363) - 13_216 * 0.056;
    near(provincialTax(80_000, 'BC'), expected);
  });

  it('AB: provincial tax on $80k = bracket math − BPA credit', () => {
    const expected = 0.08 * 61_200 + 0.1 * (80_000 - 61_200) - 22_769 * 0.08;
    near(provincialTax(80_000, 'AB'), expected);
  });
});

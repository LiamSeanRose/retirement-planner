import { describe, expect, it } from 'vitest';
import { meltdownEstateImpact, terminalTax, type EstateScenarioInput } from './index';

// Same death-year wealth, two histories: one ran a meltdown (smaller registered, larger TFSA, having
// paid ~$50k of lifetime tax to move it), one did not.
const withoutMeltdown: EstateScenarioInput = {
  balances: { registered: 600_000, nonRegistered: 0, tfsa: 0 },
  accruedNonRegGain: 0,
  province: 'ON',
  hasSurvivingSpouse: false,
};
const withMeltdown: EstateScenarioInput = {
  balances: { registered: 300_000, nonRegistered: 0, tfsa: 250_000 },
  accruedNonRegGain: 0,
  province: 'ON',
  hasSurvivingSpouse: false,
};

describe('meltdownEstateImpact', () => {
  const impact = meltdownEstateImpact(withoutMeltdown, withMeltdown);

  it('defuses part of the terminal-tax bomb', () => {
    expect(impact.terminalTaxSaved).toBeGreaterThan(0);
    expect(impact.terminalTaxSaved).toBeCloseTo(terminalTax({ registeredBalance: 600_000, accruedNonRegGain: 0, province: 'ON', hasSurvivingSpouse: false }) - terminalTax({ registeredBalance: 300_000, accruedNonRegGain: 0, province: 'ON', hasSurvivingSpouse: false }), 6);
  });

  it('lifts the after-tax estate (the headline reason the meltdown exists)', () => {
    expect(impact.afterTaxEstateDelta).toBeGreaterThan(0);
    expect(impact.afterTaxEstateDelta).toBeCloseTo(impact.withMeltdown.afterTaxEstateValue - impact.withoutMeltdown.afterTaxEstateValue, 6);
  });

  it('reports both stages consistently (after-tax = balances − terminal tax)', () => {
    expect(impact.withoutMeltdown.afterTaxEstateValue).toBeCloseTo(600_000 - impact.withoutMeltdown.terminalTax, 6);
    expect(impact.withMeltdown.afterTaxEstateValue).toBeCloseTo(550_000 - impact.withMeltdown.terminalTax, 6);
  });

  it('with a surviving spouse both plans roll over tax-free → no terminal tax, no saving', () => {
    const spouse = meltdownEstateImpact(
      { ...withoutMeltdown, hasSurvivingSpouse: true },
      { ...withMeltdown, hasSurvivingSpouse: true },
    );
    expect(spouse.withoutMeltdown.terminalTax).toBe(0);
    expect(spouse.withMeltdown.terminalTax).toBe(0);
    expect(spouse.terminalTaxSaved).toBe(0);
    // The estate delta is then purely the difference in surviving balances (here equal totals → ~0).
    expect(spouse.afterTaxEstateDelta).toBeCloseTo(550_000 - 600_000, 6);
  });
});

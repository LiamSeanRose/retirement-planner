import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config';
import { TAX_CONFIG_2026 } from '../config/tax-2026';
import { totalTax } from '../tax';
import { bracketTop, meltdownPolicy } from './index';

// The OAS recovery-tax threshold from the dated config (not hardcoded).
const oasMap = DEFAULT_CONFIG.oas.clawbackThresholdByIncomeYear;
const THRESHOLD = oasMap[Math.max(...Object.keys(oasMap).map(Number))];

const fedTop = (income: number) => bracketTop(income, TAX_CONFIG_2026.federal.brackets);

describe('meltdownPolicy — bracket fill', () => {
  it('fills the current federal bracket to its top when the bracket binds below the OAS threshold', () => {
    const base = 50_000;
    const p = meltdownPolicy({ baseTaxableIncome: base, province: 'ON', age: 62, registeredBalance: 500_000, oasClawbackThreshold: THRESHOLD });
    expect(p.withdrawal).toBe(fedTop(base) - base); // fill to the 1st-bracket ceiling
    expect(p.newTaxableIncome).toBe(fedTop(base));
    expect(p.guardBinding).toBe(false); // the bracket ceiling sits below the threshold here
  });

  it('caps at the OAS-clawback threshold when the guard binds below the bracket top', () => {
    const base = THRESHOLD - 5_000; // under the threshold, but in a bracket whose top is above it
    const p = meltdownPolicy({ baseTaxableIncome: base, province: 'ON', age: 68, registeredBalance: 500_000, oasClawbackThreshold: THRESHOLD });
    expect(fedTop(base)).toBeGreaterThan(THRESHOLD); // precondition: the bracket top is above the threshold
    expect(p.guardBinding).toBe(true);
    expect(p.withdrawal).toBeCloseTo(THRESHOLD - base, 6);
    expect(p.newTaxableIncome).toBeCloseTo(THRESHOLD, 6);
  });

  it('ignores the guard when base income already exceeds the threshold (fills to the bracket top)', () => {
    const base = THRESHOLD + 5_000;
    const p = meltdownPolicy({ baseTaxableIncome: base, province: 'ON', age: 72, registeredBalance: 500_000, oasClawbackThreshold: THRESHOLD });
    expect(p.guardBinding).toBe(false);
    expect(p.withdrawal).toBeCloseTo(fedTop(base) - base, 6);
  });

  it('never withdraws more than the available registered balance', () => {
    const p = meltdownPolicy({ baseTaxableIncome: 50_000, province: 'ON', age: 62, registeredBalance: 2_000, oasClawbackThreshold: THRESHOLD });
    expect(p.withdrawal).toBe(2_000);
  });
});

describe('meltdownPolicy — incremental tax & RRSP→TFSA pipeline', () => {
  it('reports the real incremental tax from lib/tax', () => {
    const base = 50_000;
    const p = meltdownPolicy({ baseTaxableIncome: base, province: 'ON', age: 62, registeredBalance: 500_000, oasClawbackThreshold: THRESHOLD });
    const expected = totalTax(p.newTaxableIncome, 'ON', { age: 62 }) - totalTax(base, 'ON', { age: 62 });
    expect(p.incrementalTax).toBeCloseTo(expected, 6);
    expect(p.incrementalTax).toBeGreaterThan(0);
  });

  it('with no spending need, the whole after-tax withdrawal flows into the TFSA', () => {
    const p = meltdownPolicy({ baseTaxableIncome: 50_000, province: 'ON', age: 62, registeredBalance: 500_000, oasClawbackThreshold: THRESHOLD });
    expect(p.tfsaPipeline).toBeCloseTo(p.withdrawal - p.incrementalTax, 6);
  });

  it('a spending need is funded first; only the remainder feeds the TFSA pipeline', () => {
    const need = 3_000;
    const p = meltdownPolicy({ baseTaxableIncome: 50_000, province: 'ON', age: 62, registeredBalance: 500_000, oasClawbackThreshold: THRESHOLD, spendingNeed: need });
    expect(p.tfsaPipeline).toBeCloseTo(Math.max(0, p.withdrawal - p.incrementalTax - need), 6);
  });

  it('echoes the age for the projection to gate the meltdown window', () => {
    expect(meltdownPolicy({ baseTaxableIncome: 40_000, province: 'ON', age: 63, registeredBalance: 100_000, oasClawbackThreshold: THRESHOLD }).age).toBe(63);
  });
});

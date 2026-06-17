import { describe, expect, it } from 'vitest';
import { totalTax } from '../tax';
import { afterTaxEstateValue, coupleEstate, terminalTax, type EstateBalances } from './index';

const near = (a: number, b: number, tol = 1e-6) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('terminalTax — registered deemed disposition', () => {
  it('no surviving spouse: the FULL RRIF is taxed (matches a real final-return tax)', () => {
    const tax = terminalTax({
      registeredBalance: 400_000,
      accruedNonRegGain: 0,
      province: 'ON',
      hasSurvivingSpouse: false,
    });
    // The deemed disposition is taxed exactly like $400k of income on the final return.
    near(tax, totalTax(400_000, 'ON', {}));
    // A "terminal tax bomb": a high effective rate, but below the top combined marginal (~53.5%).
    expect(tax).toBeGreaterThan(0.4 * 400_000);
    expect(tax).toBeLessThan(0.535 * 400_000);
  });

  it('surviving spouse: registered rolls over → $0 terminal tax', () => {
    const tax = terminalTax({
      registeredBalance: 400_000,
      accruedNonRegGain: 0,
      province: 'ON',
      hasSurvivingSpouse: true,
    });
    expect(tax).toBe(0);
  });

  it('a bigger RRSP ⇒ a bigger terminal-tax hit (monotonic)', () => {
    const base = { accruedNonRegGain: 0, province: 'ON' as const, hasSurvivingSpouse: false };
    const small = terminalTax({ registeredBalance: 100_000, ...base });
    const mid = terminalTax({ registeredBalance: 300_000, ...base });
    const big = terminalTax({ registeredBalance: 600_000, ...base });
    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(big);
  });

  it('the extra tax on a large balance stacks at the top marginal rate', () => {
    const base = { accruedNonRegGain: 0, province: 'ON' as const, hasSurvivingSpouse: false };
    const at400 = terminalTax({ registeredBalance: 400_000, ...base });
    const at500 = terminalTax({ registeredBalance: 500_000, ...base });
    // The top $100k is in the top combined ON bracket (~53.5%) — comfortably above 45%.
    expect(at500 - at400).toBeGreaterThan(0.45 * 100_000);
  });
});

describe('terminalTax — non-registered & TFSA', () => {
  it('realizes non-registered accrued gains at 50% inclusion', () => {
    const tax = terminalTax({
      registeredBalance: 0,
      accruedNonRegGain: 200_000,
      province: 'ON',
      hasSurvivingSpouse: false,
    });
    // Only 50% of the gain is taxable income.
    near(tax, totalTax(100_000, 'ON', {}));
    expect(tax).toBeGreaterThan(0);
  });

  it('surviving spouse defers the non-registered gain too → $0', () => {
    expect(
      terminalTax({
        registeredBalance: 0,
        accruedNonRegGain: 200_000,
        province: 'ON',
        hasSurvivingSpouse: true,
      }),
    ).toBe(0);
  });

  it('a non-registered accrued LOSS adds no tax', () => {
    expect(
      terminalTax({
        registeredBalance: 0,
        accruedNonRegGain: -50_000,
        province: 'ON',
        hasSurvivingSpouse: false,
      }),
    ).toBe(0);
  });
});

describe('afterTaxEstateValue', () => {
  const balances: EstateBalances = { registered: 400_000, nonRegistered: 100_000, tfsa: 50_000 };

  it('net estate = total balances − terminal tax', () => {
    const net = afterTaxEstateValue(balances, 0, 'ON', { hasSurvivingSpouse: false });
    const tax = terminalTax({
      registeredBalance: 400_000,
      accruedNonRegGain: 0,
      province: 'ON',
      hasSurvivingSpouse: false,
    });
    near(net, 550_000 - tax);
  });

  it('TFSA is in the estate but never adds tax: a bigger TFSA ⇒ a bigger estate, same tax', () => {
    const small = afterTaxEstateValue(
      { registered: 400_000, nonRegistered: 0, tfsa: 10_000 },
      0,
      'ON',
      { hasSurvivingSpouse: false },
    );
    const big = afterTaxEstateValue(
      { registered: 400_000, nonRegistered: 0, tfsa: 90_000 },
      0,
      'ON',
      { hasSurvivingSpouse: false },
    );
    near(big - small, 80_000); // the whole TFSA difference flows straight to the estate, untaxed
  });

  it('surviving spouse: the entire estate passes untaxed', () => {
    near(afterTaxEstateValue(balances, 0, 'ON', { hasSurvivingSpouse: true }), 550_000);
  });
});

describe('coupleEstate — first death rolls over, second death disposes', () => {
  const firstDeath = {
    balances: { registered: 300_000, nonRegistered: 100_000, tfsa: 40_000 },
    accruedNonRegGain: 50_000,
    province: 'ON' as const,
  };
  const secondDeath = {
    balances: { registered: 500_000, nonRegistered: 150_000, tfsa: 60_000 },
    accruedNonRegGain: 80_000,
    province: 'ON' as const,
  };
  const result = coupleEstate(firstDeath, secondDeath);

  it('first death: $0 terminal tax — full balances pass to the survivor', () => {
    expect(result.firstDeath.terminalTax).toBe(0);
    near(result.firstDeath.totalBalances, 440_000);
    near(result.firstDeath.afterTaxEstateValue, 440_000);
  });

  it('second death: the full deemed disposition is taxed', () => {
    expect(result.secondDeath.terminalTax).toBeGreaterThan(0);
    const expectedTax = terminalTax({
      registeredBalance: 500_000,
      accruedNonRegGain: 80_000,
      province: 'ON',
      hasSurvivingSpouse: false,
    });
    near(result.secondDeath.terminalTax, expectedTax);
    near(result.secondDeath.afterTaxEstateValue, 710_000 - expectedTax);
  });
});

describe('worked example — $400k RRIF, Ontario, no surviving spouse', () => {
  it('prints the terminal tax for sanity-checking', () => {
    const tax = terminalTax({
      registeredBalance: 400_000,
      accruedNonRegGain: 0,
      province: 'ON',
      hasSurvivingSpouse: false,
    });
    const effectivePct = (tax / 400_000) * 100;
    // eslint-disable-next-line no-console
    console.log(
      `\n[worked example] Terminal tax on $400,000 RRIF, ON, no surviving spouse: ` +
        `$${tax.toFixed(2)} (effective ${effectivePct.toFixed(1)}%)\n`,
    );
    expect(tax).toBeGreaterThan(160_000);
    expect(tax).toBeLessThan(175_000);
  });
});

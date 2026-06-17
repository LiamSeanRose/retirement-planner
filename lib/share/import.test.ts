import { describe, expect, it } from 'vitest';
import { extractCppEstimate } from './import';

describe('extractCppEstimate', () => {
  it('picks the age-65 figure from a 60 / 65 / 70 estimate table', () => {
    const text = `Estimated monthly retirement pension
      At age 60: $964.90
      At age 65: $1,433.00
      At age 70: $2,034.86`;
    expect(extractCppEstimate(text).monthlyAt65).toBe(1433);
  });

  it('reads a single inline sentence', () => {
    const text = 'Your estimated monthly CPP retirement pension at age 65 is $1,250.00 if you stop contributing now.';
    expect(extractCppEstimate(text).monthlyAt65).toBe(1250);
  });

  it('handles amounts written without comma grouping', () => {
    expect(extractCppEstimate('At 65 your pension is 1100.50 per month').monthlyAt65).toBeCloseTo(1100.5, 2);
  });

  it('uses a lone monthly amount even with no age written', () => {
    expect(extractCppEstimate('Estimated monthly pension: $1,180.00').monthlyAt65).toBe(1180);
  });

  it('ignores tiny amounts and large account balances', () => {
    const text = 'RRSP balance $352,140.55 · TFSA $91,200.00 · a $2.50 fee · monthly pension at age 65 $1,402.10';
    const out = extractCppEstimate(text);
    expect(out.monthlyAt65).toBe(1402.1);
    // The six-figure balances are out of the monthly window, so they never become candidates.
    expect(out.candidates.every((c) => c.amount <= 3000)).toBe(true);
  });

  it('does not mistake digits inside the amount (e.g. 65 in 1,265.00) for an age', () => {
    // "$1,265.00" with no real age context ⇒ treated as a lone amount, not an age-65 match by accident.
    const out = extractCppEstimate('Pension amount $1,265.00');
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].age).toBeUndefined();
  });

  it('returns no figure (but no crash) when there is nothing money-like', () => {
    const out = extractCppEstimate('Welcome to My Service Canada Account. No estimate is available yet.');
    expect(out.monthlyAt65).toBeUndefined();
    expect(out.candidates).toEqual([]);
  });

  it('disambiguates when multiple ages are present but only 65 is asked for', () => {
    const text = 'Pension at 60 $1,001.00, at 65 $1,433.20, at 70 $2,015.00';
    const out = extractCppEstimate(text);
    expect(out.monthlyAt65).toBe(1433.2);
    expect(out.candidates.find((c) => c.age === 60)?.amount).toBe(1001);
    expect(out.candidates.find((c) => c.age === 70)?.amount).toBe(2015);
  });
});

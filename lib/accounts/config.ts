/**
 * Dated config — account mechanics constants (2026; re-verify yearly, never inline).
 *
 * Withholding tiers are the NON-Quebec lump-sum rates that apply to RRIF/RRSP withdrawals ABOVE
 * the mandatory minimum (Quebec differs — out of scope here). Gross-up / inclusion are the
 * non-registered income-type treatments. The dividend tax credit itself is applied in the tax
 * module, not here — this only produces the taxable (grossed-up / included) amounts.
 */

export interface AccountsConfig {
  asOf: string;
  /**
   * Withholding on the amount withdrawn ABOVE the RRIF minimum. A single rate applies to the
   * whole over-minimum amount, chosen by which tier the over-minimum total falls into. It is a
   * prepayment of tax (credited on the return), NOT an extra tax.
   */
  withholding: { upTo5k: number; upTo15k: number; over15k: number };
  /** Eligible-dividend gross-up: taxable income includes cash dividend × (1 + grossUp). */
  eligibleDividendGrossUp: number;
  /** Capital-gains inclusion rate on realized gains (50%; the 66.67% hike was cancelled Mar 2025). */
  capitalGainsInclusion: number;
}

export const ACCOUNTS_CONFIG_2026: AccountsConfig = {
  asOf: '2026',
  withholding: { upTo5k: 0.1, upTo15k: 0.2, over15k: 0.3 },
  eligibleDividendGrossUp: 0.38,
  capitalGainsInclusion: 0.5,
};

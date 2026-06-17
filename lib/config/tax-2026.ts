/**
 * Dated config — 2026 income-tax constants: federal + all 13 provinces/territories.
 *
 * VERIFIED 2026: FEDERAL and ALL 13 provinces/territories carry confirmed 2026 brackets + basic
 * personal amounts — Ontario from the plan Appendix; BC, AB, MB, SK, NB, NS, PE, NL, YT, NT, NU from
 * TaxTips.ca (retrieved 2026-06, cross-checked against each government's published 2026 figures — see
 * per-province notes). Quebec uses Revenu Québec's OFFICIAL 2.05% indexation with rates confirmed
 * unchanged (14/19/24/25.75%), the $18,952 BPA, and the 16.5% federal abatement. What is NOT modelled
 * (and is flagged, never silently guessed): province-specific credits beyond the BPA, low-income
 * reductions, and surtaxes other than Ontario's — see each `note` and lib/ENGINE-NOTES.md. Re-verify
 * every value yearly against canada.ca / the province before it drives a shipped projection.
 *
 * Non-refundable credits are valued at the lowest-bracket rate (`creditRate`). Budget 2025 cut the
 * lowest FEDERAL rate to 14% (from 15%), fully in effect for 2026 — so 2026 federal credits are
 * valued at 14%, and the plan's "~$300" pension-credit figure (old 15%) is correspondingly ~$280.
 *
 * Re-verify ALL of this yearly. Never inline these numbers elsewhere.
 */

export type Province = 'ON' | 'QC' | 'BC' | 'AB' | 'MB' | 'SK' | 'NB' | 'NS' | 'PE' | 'NL' | 'YT' | 'NT' | 'NU';

/** A marginal bracket: `rate` applies to income up to `upTo` (null = top bracket, no ceiling). */
export interface TaxBracket {
  upTo: number | null;
  rate: number;
}

/** Ontario-style surtax: a rate on provincial tax above each threshold (cumulative). */
export interface SurtaxTier {
  overProvincialTax: number;
  rate: number;
}

export interface ProvinceTax {
  /** true only where the 2026 numbers are confirmed (ON). false = structure present, values TODO. */
  verified: boolean;
  brackets: TaxBracket[];
  basicPersonalAmount: number;
  /** Lowest provincial bracket rate — used to value provincial non-refundable credits. */
  creditRate: number;
  /** Optional provincial age amount (65+) and pension income amount. */
  ageAmountMax?: number;
  ageAmountThreshold?: number;
  pensionIncomeAmount?: number;
  /** Ontario surtax tiers (applied to provincial tax after credits). */
  surtax?: SurtaxTier[];
  /** Ontario Health Premium applies (income-tested, see ONTARIO_HEALTH_PREMIUM). */
  hasHealthPremium?: boolean;
  /** Quebec only: the federal abatement reduces BASIC federal tax for QC residents (16.5%). */
  federalAbatementRate?: number;
  note?: string;
}

export interface FederalTax {
  brackets: TaxBracket[];
  /** FULL basic personal amount (enhanced BPA), used at or below the grind's start income. */
  basicPersonalAmount: number;
  /** Floor BPA for top-bracket incomes (the enhancement is fully ground away). */
  basicPersonalAmountMin: number;
  /** Net income where the enhanced-BPA grind begins / ends (the 29% and 33% bracket thresholds). */
  bpaGrindStart: number;
  bpaGrindEnd: number;
  /** Lowest-bracket rate used to value non-refundable credits (14% for 2026). */
  creditRate: number;
  ageAmountMax: number;
  ageAmountThreshold: number;
  ageAmountReductionRate: number;
  pensionIncomeAmount: number;
}

export interface TaxConfig {
  asOf: string;
  federal: FederalTax;
  provinces: Record<Province, ProvinceTax>;
}

// ---- Federal (VERIFIED from plan Appendix) ----
const FEDERAL_2026: FederalTax = {
  brackets: [
    { upTo: 58_523, rate: 0.14 },
    { upTo: 117_045, rate: 0.205 },
    { upTo: 181_440, rate: 0.26 },
    { upTo: 258_482, rate: 0.29 },
    { upTo: null, rate: 0.33 },
  ],
  // Enhanced BPA $16,452, ground down linearly to the $14,538 floor across the top two brackets
  // (CRA: the enhancement phases out as net income runs from the 29% bracket threshold to the 33%
  // one — $181,440 → $258,482 for 2026). See federalBasicPersonalAmount() in lib/tax.
  basicPersonalAmount: 16_452,
  basicPersonalAmountMin: 14_538,
  bpaGrindStart: 181_440,
  bpaGrindEnd: 258_482,
  creditRate: 0.14,
  ageAmountMax: 9_208,
  ageAmountThreshold: 46_432, // net income where the 65+ age amount starts phasing out
  ageAmountReductionRate: 0.15, // gone by ~$107.8k
  pensionIncomeAmount: 2_000,
};

// ---- Ontario (VERIFIED from plan Appendix) ----
const ONTARIO_2026: ProvinceTax = {
  verified: true,
  brackets: [
    { upTo: 53_891, rate: 0.0505 },
    { upTo: 107_785, rate: 0.0915 },
    { upTo: 150_000, rate: 0.1116 },
    { upTo: 220_000, rate: 0.1216 },
    { upTo: null, rate: 0.1316 },
  ],
  basicPersonalAmount: 12_989, // ON BPA 2026 — VERIFIED (TaxTips.ca; 2025 $12,747 × 1.019 indexation)
  creditRate: 0.0505,
  ageAmountMax: 6_342, // ON age amount 2026 (65+) — VERIFIED (TaxTips.ca)
  ageAmountThreshold: 46_432, // ON age-amount phase-out start approximated by the federal threshold
  pensionIncomeAmount: 1_796, // ON pension income amount 2026 — VERIFIED (TaxTips.ca)
  surtax: [
    { overProvincialTax: 5_818, rate: 0.2 },
    { overProvincialTax: 7_446, rate: 0.36 },
  ],
  hasHealthPremium: true,
};

/**
 * Ontario Health Premium by taxable income (2024+ schedule; max $900). Each band adds at a steep
 * marginal rate up to a per-band cap. Stable across recent years — re-verify.
 */
export const ONTARIO_HEALTH_PREMIUM = [
  { upTo: 20_000, base: 0, over: 0, marginal: 0, cap: 0 },
  { upTo: 36_000, base: 0, over: 20_000, marginal: 0.06, cap: 300 },
  { upTo: 48_000, base: 300, over: 36_000, marginal: 0.06, cap: 450 },
  { upTo: 72_000, base: 450, over: 48_000, marginal: 0.25, cap: 600 },
  { upTo: 200_000, base: 600, over: 72_000, marginal: 0.25, cap: 750 },
  { upTo: null as number | null, base: 750, over: 200_000, marginal: 0.25, cap: 900 },
];

// ---- Other provinces/territories ----
// `u` = unverified placeholder; `v` = VERIFIED 2026 (TaxTips.ca, retrieved 2026-06; per-province
// confirmation status noted). Provincial low-income reductions / dividend & other credits beyond the
// BPA are not modelled — see lib/ENGINE-NOTES.md.
const u = (
  brackets: TaxBracket[],
  basicPersonalAmount: number,
  note: string,
): ProvinceTax => ({ verified: false, brackets, basicPersonalAmount, creditRate: brackets[0].rate, note: `UNVERIFIED ~2025 values — confirm 2026: ${note}` });

const v = (
  brackets: TaxBracket[],
  basicPersonalAmount: number,
  note: string,
): ProvinceTax => ({ verified: true, brackets, basicPersonalAmount, creditRate: brackets[0].rate, note: `VERIFIED 2026 (TaxTips.ca, retrieved 2026-06): ${note}` });

const OTHERS: Record<Exclude<Province, 'ON'>, ProvinceTax> = {
  // QC 2026: Revenu Québec's OFFICIAL 2.05% indexation, rates confirmed unchanged at 14/19/24/25.75%,
  // BPA $18,952 — now published (TaxTips.ca / Richter 2026 table). 16.5% federal abatement applied;
  // Quebec's distinct credit rules are approximated by the lowest-rate credit valuation.
  QC: {
    verified: true,
    brackets: [{ upTo: 54_345, rate: 0.14 }, { upTo: 108_680, rate: 0.19 }, { upTo: 132_245, rate: 0.24 }, { upTo: null, rate: 0.2575 }],
    basicPersonalAmount: 18_952,
    creditRate: 0.14,
    federalAbatementRate: 0.165,
    note: 'VERIFIED 2026 — Revenu Québec official 2.05% indexation, rates unchanged (14/19/24/25.75%), BPA $18,952 (TaxTips.ca / Richter 2026). 16.5% federal abatement applied; distinct QC credits approximated by lowest-rate valuation.',
  },
  // VERIFIED 2026 — TaxTips.ca/taxrates/bc.htm (retrieved 2026-06). BC raised its lowest rate to
  // 5.60% for 2026 (the 5.06% previously here was the 2025 rate); thresholds indexed 2.2%. BC's
  // separate low-income tax-reduction credit is not modelled — see ENGINE-NOTES.
  BC: {
    verified: true,
    brackets: [
      { upTo: 50_363, rate: 0.056 },
      { upTo: 100_728, rate: 0.077 },
      { upTo: 115_648, rate: 0.105 },
      { upTo: 140_430, rate: 0.1229 },
      { upTo: 190_405, rate: 0.147 },
      { upTo: 265_545, rate: 0.168 },
      { upTo: null, rate: 0.205 },
    ],
    basicPersonalAmount: 13_216,
    creditRate: 0.056,
    note: 'VERIFIED 2026 (TaxTips.ca). BC low-income tax-reduction credit not modelled.',
  },
  // VERIFIED 2026 — TaxTips.ca/taxrates/ab.htm (retrieved 2026-06).
  AB: {
    verified: true,
    brackets: [
      { upTo: 61_200, rate: 0.08 },
      { upTo: 154_259, rate: 0.1 },
      { upTo: 185_111, rate: 0.12 },
      { upTo: 246_813, rate: 0.13 },
      { upTo: 370_220, rate: 0.14 },
      { upTo: null, rate: 0.15 },
    ],
    basicPersonalAmount: 22_769,
    creditRate: 0.08,
    note: 'VERIFIED 2026 (TaxTips.ca).',
  },
  MB: v([{ upTo: 47_000, rate: 0.108 }, { upTo: 100_000, rate: 0.1275 }, { upTo: null, rate: 0.174 }], 15_780, 'indexation frozen — 2026 thresholds/BPA = 2025 (= 2024) levels'),
  SK: v([{ upTo: 54_532, rate: 0.105 }, { upTo: 155_805, rate: 0.125 }, { upTo: null, rate: 0.145 }], 20_381, '2% indexation'),
  NB: v([{ upTo: 52_333, rate: 0.094 }, { upTo: 104_666, rate: 0.14 }, { upTo: 193_861, rate: 0.16 }, { upTo: null, rate: 0.195 }], 13_664, '2% indexation'),
  NS: v([{ upTo: 30_995, rate: 0.0879 }, { upTo: 61_991, rate: 0.1495 }, { upTo: 97_417, rate: 0.1667 }, { upTo: 157_124, rate: 0.175 }, { upTo: null, rate: 0.21 }], 11_932, '1.6% indexation'),
  PE: v([{ upTo: 33_928, rate: 0.095 }, { upTo: 65_820, rate: 0.1347 }, { upTo: 106_890, rate: 0.166 }, { upTo: 142_250, rate: 0.1762 }, { upTo: 200_000, rate: 0.19 }, { upTo: null, rate: 0.2 }], 15_000, 'confirmed to CRA'),
  NL: v([{ upTo: 44_678, rate: 0.087 }, { upTo: 89_354, rate: 0.145 }, { upTo: 159_528, rate: 0.158 }, { upTo: 223_340, rate: 0.178 }, { upTo: 285_319, rate: 0.198 }, { upTo: 570_638, rate: 0.208 }, { upTo: 1_141_275, rate: 0.213 }, { upTo: null, rate: 0.218 }], 13_094, 'confirmed to CRA'),
  // Yukon uses the federal thresholds for its first 3 brackets; top bracket is $500k. The 12.93%
  // "effective" rate TaxTips shows on $181,440–$258,482 is the federal BPA-grind interaction, not a
  // Yukon statutory rate — Yukon's statutory rate there is 12.8%. BPA tracks the federal amount.
  YT: v([{ upTo: 58_523, rate: 0.064 }, { upTo: 117_045, rate: 0.09 }, { upTo: 181_440, rate: 0.109 }, { upTo: 500_000, rate: 0.128 }, { upTo: null, rate: 0.15 }], 16_452, 'federal-aligned thresholds, $500k top; BPA tracks federal; effective-rate BPA-grind quirk not modelled'),
  NT: v([{ upTo: 53_003, rate: 0.059 }, { upTo: 106_009, rate: 0.086 }, { upTo: 172_346, rate: 0.122 }, { upTo: null, rate: 0.1405 }], 18_198, 'confirmed to CRA'),
  NU: v([{ upTo: 55_801, rate: 0.04 }, { upTo: 111_602, rate: 0.07 }, { upTo: 181_439, rate: 0.09 }, { upTo: null, rate: 0.115 }], 19_659, 'confirmed to CRA'),
};

export const TAX_CONFIG_2026: TaxConfig = {
  asOf: '2026',
  federal: FEDERAL_2026,
  provinces: { ON: ONTARIO_2026, ...OTHERS },
};

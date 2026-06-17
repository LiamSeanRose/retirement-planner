/**
 * Dated config — 2026 income-tax constants: federal + all 13 provinces/territories.
 *
 * FEDERAL + ONTARIO are seeded EXACTLY from the plan Appendix (the validated source) and are
 * marked `verified: true`. The other 12 provinces/territories carry their bracket STRUCTURE with
 * best-effort recent values but are marked `verified: false` — every such number is a TODO to
 * confirm against canada.ca / the province before it drives a shipped projection. Nothing here is
 * silently guessed: unverified data is flagged as unverified.
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
  note?: string;
}

export interface FederalTax {
  brackets: TaxBracket[];
  basicPersonalAmount: number;
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
  basicPersonalAmount: 16_452, // TODO: model the high-income BPA grind to ~$14,538 (top bracket); flat for v1
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
  basicPersonalAmount: 12_747, // ON BPA 2026 (TODO: confirm exact indexed value)
  creditRate: 0.0505,
  ageAmountMax: 6_054, // ON age amount (TODO confirm)
  ageAmountThreshold: 46_432,
  pensionIncomeAmount: 1_796,
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

// ---- Other provinces/territories: structure present, values UNVERIFIED (~2025; confirm 2026) ----
const u = (
  brackets: TaxBracket[],
  basicPersonalAmount: number,
  note: string,
): ProvinceTax => ({ verified: false, brackets, basicPersonalAmount, creditRate: brackets[0].rate, note: `UNVERIFIED ~2025 values — confirm 2026: ${note}` });

const OTHERS: Record<Exclude<Province, 'ON'>, ProvinceTax> = {
  QC: u([{ upTo: 53_255, rate: 0.14 }, { upTo: 106_495, rate: 0.19 }, { upTo: 129_590, rate: 0.24 }, { upTo: null, rate: 0.2575 }], 18_571, 'Quebec also has the federal abatement + distinct credit rules — needs its own treatment'),
  BC: u([{ upTo: 49_279, rate: 0.0506 }, { upTo: 98_560, rate: 0.077 }, { upTo: 113_158, rate: 0.105 }, { upTo: 137_407, rate: 0.1229 }, { upTo: 186_306, rate: 0.147 }, { upTo: 259_829, rate: 0.168 }, { upTo: null, rate: 0.205 }], 12_932, 'BC'),
  AB: u([{ upTo: 60_000, rate: 0.08 }, { upTo: 151_234, rate: 0.1 }, { upTo: 181_481, rate: 0.12 }, { upTo: 241_974, rate: 0.13 }, { upTo: 362_961, rate: 0.14 }, { upTo: null, rate: 0.15 }], 22_323, 'AB added the 8% sub-$60k bracket in 2025'),
  MB: u([{ upTo: 47_000, rate: 0.108 }, { upTo: 100_000, rate: 0.1275 }, { upTo: null, rate: 0.174 }], 15_780, 'MB'),
  SK: u([{ upTo: 53_463, rate: 0.105 }, { upTo: 152_750, rate: 0.125 }, { upTo: null, rate: 0.145 }], 18_991, 'SK'),
  NB: u([{ upTo: 51_306, rate: 0.094 }, { upTo: 102_614, rate: 0.14 }, { upTo: 190_060, rate: 0.16 }, { upTo: null, rate: 0.195 }], 13_396, 'NB'),
  NS: u([{ upTo: 29_590, rate: 0.0879 }, { upTo: 59_180, rate: 0.1495 }, { upTo: 93_000, rate: 0.1667 }, { upTo: 150_000, rate: 0.175 }, { upTo: null, rate: 0.21 }], 8_744, 'NS began indexing in 2025'),
  PE: u([{ upTo: 33_328, rate: 0.095 }, { upTo: 64_656, rate: 0.1347 }, { upTo: 105_000, rate: 0.166 }, { upTo: 140_000, rate: 0.1762 }, { upTo: null, rate: 0.19 }], 14_250, 'PE'),
  NL: u([{ upTo: 44_192, rate: 0.087 }, { upTo: 88_382, rate: 0.145 }, { upTo: 157_792, rate: 0.158 }, { upTo: 220_910, rate: 0.178 }, { upTo: 282_214, rate: 0.198 }, { upTo: 564_429, rate: 0.208 }, { upTo: 1_128_858, rate: 0.213 }, { upTo: null, rate: 0.218 }], 11_067, 'NL'),
  YT: u([{ upTo: 57_375, rate: 0.064 }, { upTo: 114_750, rate: 0.09 }, { upTo: 177_882, rate: 0.109 }, { upTo: 500_000, rate: 0.128 }, { upTo: null, rate: 0.15 }], 16_452, 'YT BPA tracks the federal amount'),
  NT: u([{ upTo: 51_964, rate: 0.059 }, { upTo: 103_930, rate: 0.086 }, { upTo: 168_967, rate: 0.122 }, { upTo: null, rate: 0.1405 }], 17_842, 'NT'),
  NU: u([{ upTo: 54_707, rate: 0.04 }, { upTo: 109_413, rate: 0.07 }, { upTo: 177_881, rate: 0.09 }, { upTo: null, rate: 0.115 }], 18_767, 'NU'),
};

export const TAX_CONFIG_2026: TaxConfig = {
  asOf: '2026',
  federal: FEDERAL_2026,
  provinces: { ON: ONTARIO_2026, ...OTHERS },
};

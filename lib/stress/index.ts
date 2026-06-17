/**
 * Stress-test path library (`/lib/stress`).
 *
 * A stress test is just a named transform that turns a base projection path into an adverse one,
 * which is then handed to the SAME projection engine (plan §10/§13; analysis layer per project
 * notes). Everything here is a pure function: `makePath(base)` returns a NEW path of the same
 * length, with only the adverse years changed and every other year copied through untouched. No
 * I/O, no React, no dependencies.
 *
 * Only path-shapeable stresses live here — ones expressible purely as per-year return / inflation /
 * indexing changes:
 *   1. earlyCrash      — sequence-of-returns risk: a deep crash in the first year(s) of retirement.
 *   2. lowReturnDecade — a "lost decade": real returns held to ~2% for ~10 years.
 *   3. highInflation   — elevated inflation with indexing lagging it (real-terms erosion).
 *
 * Stresses that are NOT return-path transforms — longevity shock (end age), a one-time expense,
 * reduced benefits, spouse early mortality (§19) — change projection INPUTS rather than the path.
 * They are listed in `PROJECTION_LAYER_STRESSORS` as named descriptors WITHOUT a `makePath`, and
 * are applied at the projection/spend layer — they must never be faked into the path here.
 *
 * NOTE: `YearPath` / `ReturnPath` are mirrored locally on purpose. Unify them with the canonical
 * projection path type at integration time (project notes §12 lists `ReturnPath` as a key type).
 */

/** One year of the deterministic projection path. All values are percentages (e.g. 5 = 5%). */
export interface YearPath {
  /** Nominal portfolio/account growth for the year. Monte Carlo replaces this with a sampled draw. */
  returnPct: number;
  /** General CPI inflation for the year — drives spend growth and tax-bracket indexing. */
  inflationPct: number;
  /** Pension/benefit indexing for the year (§4) — normally CPI-tracking; can diverge under stress. */
  indexingPct: number;
}

export type ReturnPath = YearPath[];

/** A path-shapeable stress: a pure transform from a base path to an adverse one. */
export interface StressScenario {
  id: string;
  label: string;
  /** One-line description of what the stress does. */
  describe: string;
  /**
   * Pure transform. Returns a NEW path of the SAME length as `base`; years outside the adverse
   * window are copied through unchanged. Never mutates `base`.
   */
  makePath(base: ReturnPath): ReturnPath;
}

// --- Scenario shape parameters -------------------------------------------------------------------
// The "how bad / how long" of each stress. These define the stress SHAPE; they are NOT dated
// financial config (rates / brackets / factors / thresholds live in /lib/config). Named here so
// each shape is tunable in one place and never inlined as a magic number.

/** earlyCrash: the first N years take the crash hit (sequence-of-returns risk bites hardest here). */
const EARLY_CRASH_YEARS = 2;
/** earlyCrash: nominal return imposed on each crash year. */
const EARLY_CRASH_RETURN_PCT = -30;

/** lowReturnDecade: length of the "lost decade". */
const LOW_RETURN_YEARS = 10;
/** lowReturnDecade: real return the decade is held to (nominal = inflation + this); a CAP, never a raise. */
const LOW_REAL_RETURN_PCT = 2;

/** highInflation: length of the elevated-inflation window. */
const HIGH_INFLATION_YEARS = 5;
/** highInflation: points added to inflation during the window. */
const INFLATION_SHOCK_PCT = 4;
/** highInflation: points added to indexing during the window — fewer than inflation, so they diverge. */
const INDEXING_LAG_PCT = 2;

// --- Path-shapeable scenarios --------------------------------------------------------------------

/**
 * Sequence-of-returns risk. A deep crash (default −30%) in the first year(s) of the path, when a
 * portfolio in early decumulation is most fragile — the identical crash later does far less damage.
 * Touches `returnPct` only; inflation and indexing pass through unchanged.
 */
export const earlyCrash: StressScenario = {
  id: 'earlyCrash',
  label: 'Early market crash',
  describe: `A ${EARLY_CRASH_RETURN_PCT}% return in the first ${EARLY_CRASH_YEARS} year(s) of retirement (sequence-of-returns risk).`,
  makePath: (base) =>
    base.map((year, i) =>
      i < EARLY_CRASH_YEARS ? { ...year, returnPct: EARLY_CRASH_RETURN_PCT } : { ...year },
    ),
};

/**
 * A "lost decade": real returns held to ~2% for ~10 years (a sustained low-growth grind). Modelled
 * as a CAP on nominal return at `inflation + LOW_REAL_RETURN_PCT`, so it only ever lowers returns —
 * a stress must never improve on the base. Touches `returnPct` only.
 */
export const lowReturnDecade: StressScenario = {
  id: 'lowReturnDecade',
  label: 'Low-return decade',
  describe: `Real returns capped near ${LOW_REAL_RETURN_PCT}% for ${LOW_RETURN_YEARS} years (a "lost decade").`,
  makePath: (base) =>
    base.map((year, i) => {
      if (i >= LOW_RETURN_YEARS) return { ...year };
      const cappedNominal = year.inflationPct + LOW_REAL_RETURN_PCT;
      return { ...year, returnPct: Math.min(year.returnPct, cappedNominal) };
    }),
};

/**
 * Elevated inflation with indexing lagging behind it. Inflation rises by INFLATION_SHOCK_PCT while
 * pension/benefit indexing rises by only INDEXING_LAG_PCT — the divergence (SHOCK − LAG) is the
 * real-terms erosion of indexed income. Touches `inflationPct` and `indexingPct`; returns are left
 * to the base, so real returns fall as inflation climbs (itself part of the stress).
 */
export const highInflation: StressScenario = {
  id: 'highInflation',
  label: 'High inflation',
  describe: `Inflation +${INFLATION_SHOCK_PCT} pts but indexing only +${INDEXING_LAG_PCT} pts for ${HIGH_INFLATION_YEARS} years (real-terms erosion).`,
  makePath: (base) =>
    base.map((year, i) =>
      i < HIGH_INFLATION_YEARS
        ? {
            ...year,
            inflationPct: year.inflationPct + INFLATION_SHOCK_PCT,
            indexingPct: year.indexingPct + INDEXING_LAG_PCT,
          }
        : { ...year },
    ),
};

/** The path-shapeable stress library — each is handed, via `makePath`, to the same projection engine. */
export const STRESS_SCENARIOS: StressScenario[] = [earlyCrash, lowReturnDecade, highInflation];

// --- Non-path stressors (applied at the projection/spend layer, NOT here) ------------------------

/**
 * A stressor that is NOT a return-path transform. It changes projection INPUTS (end age, a one-time
 * spend, benefit levels, or a member's death) rather than the per-year return/inflation/indexing
 * path. Exported as a named descriptor deliberately WITHOUT a `makePath`, so the UI can list it but
 * no caller can accidentally fake it inside the path.
 */
export interface ProjectionLayerStressor {
  id: string;
  label: string;
  describe: string;
  /** Where the projection engine applies it. Intentionally not a path transform. */
  appliesAt:
    | 'projection.endAge'
    | 'projection.spend'
    | 'projection.benefits'
    | 'projection.survivorRule';
}

/**
 * Stubs for stresses that must be applied at the projection/spend layer — listed so they are
 * discoverable and clearly named, but with NO `makePath` so they cannot be mistaken for, or faked
 * into, a return path.
 */
export const PROJECTION_LAYER_STRESSORS: ProjectionLayerStressor[] = [
  {
    id: 'longevityShock',
    label: 'Longevity shock',
    describe:
      'Live well past plan — extend the projection end age (e.g. 95 → 100+) so the plan must fund more years. ' +
      'Applied via the projection end age (§12 assumptions.endAge), not as a return-path transform.',
    appliesAt: 'projection.endAge',
  },
  {
    id: 'oneTimeExpense',
    label: 'One-time large expense',
    describe:
      'A single large outflow in one year (e.g. long-term care, major home repair, family support). ' +
      'Applied as a spend/withdrawal event at the projection layer, not as a return-path transform.',
    appliesAt: 'projection.spend',
  },
  {
    id: 'reducedBenefits',
    label: 'Reduced government benefits',
    describe:
      'A permanent haircut to CPP / OAS / pension levels (policy risk). Applied by scaling the §4–§5 ' +
      'benefit inputs at the projection layer, not as a return-path transform.',
    appliesAt: 'projection.benefits',
  },
  {
    id: 'spouseEarlyMortality',
    label: 'Spouse early mortality',
    describe:
      'A member dies early, triggering the §19 survivor rule (survivor allowance, bridge stops, ' +
      'tax-deferred rollovers, couple → single filing). Applied via the projection event ' +
      '(§12 events.earlyMortality), not as a return-path transform.',
    appliesAt: 'projection.survivorRule',
  },
];

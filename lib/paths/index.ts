/**
 * Return-path generators for the projection engine — pure, dependency-free.
 *
 * One projection run walks a `ReturnPath`: a per-year sequence of market/economic conditions.
 * Holding the path as data (rather than reading flat scalars inside the year loop) is what lets
 * the same projection drive deterministic what-ifs, named stress scenarios, and Monte Carlo alike.
 *
 * DECOUPLING (intentional): this module does NOT import `/lib/rng`. `sampledPath` takes an
 * injected `drawReturn: () => number`, so the caller (the Monte Carlo layer) wires in a seeded
 * sampler — e.g. `sampledPath(n, () => rng.normal(mean, sd), { inflationPct, indexingPct })`.
 * Keeping the randomness source out of here keeps path generation pure and the dependency edge
 * one-directional (callers depend on both; neither module depends on the other).
 */

/** One year of market/economic conditions along a run. Values are in percent (e.g. 5 = 5%). */
export interface YearPath {
  returnPct: number;
  inflationPct: number;
  indexingPct: number;
}

/** A full path = one run's year-by-year conditions, from retirement to the end age. */
export type ReturnPath = YearPath[];

export interface FlatPathParams {
  /** Number of years in the path (non-negative; floored). */
  years: number;
  returnPct: number;
  inflationPct: number;
  indexingPct: number;
}

/**
 * A deterministic / what-if path: the same return, inflation, and indexing every year.
 * Each year is a distinct object, so a downstream generator can mutate one year without
 * disturbing the others.
 */
export function flatPath({ years, returnPct, inflationPct, indexingPct }: FlatPathParams): ReturnPath {
  const n = Math.max(0, Math.floor(years));
  const path: ReturnPath = new Array(n);
  for (let i = 0; i < n; i++) {
    path[i] = { returnPct, inflationPct, indexingPct };
  }
  return path;
}

/** Inflation/indexing assumptions held flat across a sampled path (only returns are sampled). */
export interface PathAssumptions {
  inflationPct: number;
  indexingPct: number;
}

/**
 * A sampled path: each year's `returnPct` comes from the injected `drawReturn`, while inflation
 * and indexing are held at the assumption values. `drawReturn` is called exactly `years` times,
 * in order — so under a seeded sampler the whole path is reproducible.
 */
export function sampledPath(
  years: number,
  drawReturn: () => number,
  { inflationPct, indexingPct }: PathAssumptions,
): ReturnPath {
  const n = Math.max(0, Math.floor(years));
  const path: ReturnPath = new Array(n);
  for (let i = 0; i < n; i++) {
    path[i] = { returnPct: drawReturn(), inflationPct, indexingPct };
  }
  return path;
}

/**
 * Monte Carlo aggregator (`/lib/montecarlo`).
 *
 * Turns one projection run into a DISTRIBUTION of outcomes: run the projection over many sampled
 * return paths, then aggregate into a probability of success and percentile bands (plan §3, §8
 * "Monte Carlo analysis", §12 `MonteCarloResult`).
 *
 * The per-run projection is INJECTED as `makeRun` — this module never imports `/lib/projection`.
 * It owns only the stochastic plumbing: a seeded PRNG (`/lib/rng`) feeding sampled return paths
 * (`/lib/paths` `sampledPath`), so a given `seed` reproduces the whole aggregate exactly. Pure and
 * dependency-free; the Web-Worker wiring lives elsewhere.
 *
 * NOTE: `MonteCarloResult` is mirrored locally and scoped to what an injected run reports (net
 * worth, survival, estate value, lifetime tax). Unify it with the canonical §12 type at
 * integration: the projection wrapper relabels each band's 0-based `year` to an `age` (it knows the
 * start age) and can add the after-tax-income bands once `makeRun` returns an after-tax series.
 */

import { createRng, type Rng } from '../rng';
import { sampledPath, type ReturnPath } from '../paths';

/** Default number of sampled runs (plan §8: ~1,000). */
const DEFAULT_RUNS = 1000;
/** Default seed when none supplied — keeps the function total and reproducible. */
const DEFAULT_SEED = 0;

/** What one injected projection run reports back for aggregation. */
export interface RunOutcome {
  /** Net worth at the end of each projected year (index 0 = first year). */
  netWorthByYear: number[];
  /** Did the money last to the end age / sustain the target spend? Drives probability of success. */
  lastsToEndAge: boolean;
  /** After-tax estate value (terminal tax applied). */
  estateValue: number;
  /** Total lifetime tax paid over the run. */
  lifetimeTax: number;
}

/**
 * The injected per-run projection. Given a return path and the (seeded) rng — which it may draw
 * from for any further stochastic step — it returns that run's outcome. Supplied by the projection
 * wrapper at integration; kept abstract here so this module has zero dependency on the projection.
 */
export type MakeRun = (path: ReturnPath, rng: Rng) => RunOutcome;

/** Options for a Monte Carlo aggregation. */
export interface MonteCarloOpts {
  /** Years per run = length of each sampled path / net-worth series. */
  years: number;
  /** Number of sampled runs. Default 1,000. */
  runs?: number;
  /** PRNG seed — same seed + opts ⇒ identical aggregate. Default 0. */
  seed?: number;
  /** Parametric return model: annual return ~ Normal(meanPct, volPct). Omitted ⇒ degenerate 0/0. */
  distribution?: { meanPct: number; volPct: number };
  /** Inflation/indexing held flat across every sampled path (only returns are sampled). Default 0/0. */
  assumptions?: { inflationPct?: number; indexingPct?: number };
}

/** Percentile band for one year of the net-worth fan chart. `year` is 0-based; integration maps it to age. */
export interface PercentileBand {
  year: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

/** Summary distribution of a scalar outcome across runs. */
export interface Distribution {
  p5: number;
  p50: number;
  p95: number;
  mean: number;
}

/** Aggregate of N runs (plan §12 `MonteCarloResult`, scoped to the injected run's outputs). */
export interface MonteCarloResult {
  /** Number of runs actually aggregated. */
  runs: number;
  /**
   * Share of runs whose money lasted to the end age — a FRACTION in [0, 1] (e.g. 0.85 = 85%).
   * The dashboard multiplies by 100 for the confidence dial.
   */
  probabilityOfSuccess: number;
  /** Net-worth percentile bands (p5/p25/p50/p75/p95), one entry per projected year. */
  netWorth: PercentileBand[];
  /** Estate-value distribution across runs. */
  estateValue: Distribution;
  /** Lifetime-tax distribution across runs. */
  lifetimeTax: Distribution;
}

/**
 * Linear-interpolation percentile (inclusive method: R-7 / NumPy default / Excel PERCENTILE.INC).
 * `p` is a fraction in [0, 1]; `sortedAsc` must already be sorted ascending.
 */
export function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (rank - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** p5/p50/p95 + mean of a scalar series. Sorts a copy — never mutates the input. */
function summarize(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: percentile(sorted, 0.05),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    mean: mean(values),
  };
}

/**
 * Run `makeRun` over `runs` sampled paths and aggregate. Deterministic under a fixed `seed`: the
 * single seeded rng feeds every path's return draws (and is passed to `makeRun`) in a fixed order,
 * so the same seed + opts always yields the same aggregate.
 */
export function runMonteCarlo(makeRun: MakeRun, opts: MonteCarloOpts): MonteCarloResult {
  const runs = Math.max(0, Math.floor(opts.runs ?? DEFAULT_RUNS));
  const years = Math.max(0, Math.floor(opts.years));
  const seed = opts.seed ?? DEFAULT_SEED;
  const meanPct = opts.distribution?.meanPct ?? 0;
  const volPct = opts.distribution?.volPct ?? 0;
  const inflationPct = opts.assumptions?.inflationPct ?? 0;
  const indexingPct = opts.assumptions?.indexingPct ?? 0;

  const rng = createRng(seed);

  const outcomes: RunOutcome[] = new Array(runs);
  for (let r = 0; r < runs; r++) {
    const path = sampledPath(years, () => rng.normal(meanPct, volPct), { inflationPct, indexingPct });
    outcomes[r] = makeRun(path, rng);
  }

  // Probability of success = share of runs that lasted to the end age.
  let successes = 0;
  for (const o of outcomes) if (o.lastsToEndAge) successes++;
  const probabilityOfSuccess = runs === 0 ? 0 : successes / runs;

  // Net-worth bands per year. Use the shortest series so indexing stays in-bounds (every series is
  // `years` long in practice; this just guards a ragged injected run).
  let bandYears = 0;
  if (outcomes.length > 0) {
    bandYears = outcomes[0].netWorthByYear.length;
    for (const o of outcomes) bandYears = Math.min(bandYears, o.netWorthByYear.length);
  }
  const netWorth: PercentileBand[] = new Array(bandYears);
  for (let t = 0; t < bandYears; t++) {
    const column = outcomes.map((o) => o.netWorthByYear[t]).sort((a, b) => a - b);
    netWorth[t] = {
      year: t,
      p5: percentile(column, 0.05),
      p25: percentile(column, 0.25),
      p50: percentile(column, 0.5),
      p75: percentile(column, 0.75),
      p95: percentile(column, 0.95),
    };
  }

  return {
    runs,
    probabilityOfSuccess,
    netWorth,
    estateValue: summarize(outcomes.map((o) => o.estateValue)),
    lifetimeTax: summarize(outcomes.map((o) => o.lifetimeTax)),
  };
}

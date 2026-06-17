/**
 * Historical-returns backtests (`/lib/historical`) — pure, dependency-free (types only).
 *
 * Where Monte Carlo asks "how does the plan fare against THOUSANDS of RANDOM return paths drawn
 * from a Normal?", a historical backtest asks the sharper, more visceral question: "what if you had
 * actually retired into 1929? 1973? 2000? 2008?". It replays the plan over the REAL, dated sequence
 * of market years — so the genuine clustering of crashes, the ordering of good and bad years, and
 * sequence-of-returns risk all come through exactly as they happened, not as an i.i.d. caricature.
 *
 * RECENTER + RESCALE (the key idea). A retiree's balanced portfolio is not the raw S&P 500: it has
 * its own expected return and volatility (the plan's per-account `riskProfile`). So we keep only the
 * SHAPE of history — its standardized shocks z_t = (r_t − mean)/stdev, which carry the timing and
 * autocorrelation of real markets — and rescale them to the plan's own mean and volatility:
 *
 *     returnᵢ(year t) = typeMeanᵢ + typeVolᵢ · z_t           (per account type i)
 *
 * The result is a return series with the PLAN'S risk/return but HISTORY'S sequencing. A single
 * realized market path moves every account together (all of them lived through the same 2008), so
 * one shared z_t drives all account types — exactly the ρ = 1 (single realized path) case of the
 * Monte Carlo model, but with a real sequence instead of a random draw.
 *
 * Each consecutive `years`-long window of the record becomes one COHORT — "retire in 1926", "retire
 * in 1927", … — and the engine runs the plan over each, then aggregates success rate, the worst
 * starting year, and the estate distribution across cohorts.
 *
 * This module owns ONLY the dated series and the pure path math. The orchestration
 * (`runHistoricalBacktest`) lives in `/lib/engine`, which supplies the plan's per-type distributions.
 */

import type { AccountType, ReturnPathByType } from '../../types/planner';

/** A dated annual total-return record. `returnsPct[k]` is the total return (%) for `startYear + k`. */
export interface HistoricalSeries {
  id: string;
  label: string;
  /** One-line description for the UI. */
  describe: string;
  /** Calendar year of `returnsPct[0]`. */
  startYear: number;
  /** Annual TOTAL returns (price + reinvested dividends), in percent (e.g. -37 = −37%). */
  returnsPct: number[];
  /** Provenance — cited so the reference data is auditable. */
  source: string;
}

/**
 * S&P 500 annual TOTAL returns (dividends reinvested), 1926–2024, in percent.
 *
 * Source: SlickCharts, "S&P 500 Total Returns by Year Since 1926"
 * (https://www.slickcharts.com/sp500/returns) — the standard CRSP/Ibbotson-lineage series also
 * published by NYU Stern (Damodaran). Used here only for the SHAPE of the sequence: every backtest
 * recenters and rescales these to the plan's own expected return and volatility, so the absolute
 * level of the S&P is deliberately discarded — only the year-to-year sequencing is borrowed.
 */
export const SP500_TOTAL_RETURN: HistoricalSeries = {
  id: 'sp500tr',
  label: 'S&P 500 total return (1926–2024)',
  describe: 'Real U.S. large-cap market sequence since 1926 — rescaled to your plan’s own return and volatility.',
  startYear: 1926,
  source: 'SlickCharts — S&P 500 Total Returns by Year Since 1926 (slickcharts.com/sp500/returns)',
  returnsPct: [
    // 1926–1929
    11.62, 37.49, 43.61, -8.42,
    // 1930–1939
    -24.9, -43.34, -8.19, 53.99, -1.44, 47.67, 33.92, -35.03, 31.12, -0.41,
    // 1940–1949
    -9.78, -11.59, 20.34, 25.9, 19.75, 36.44, -8.07, 5.71, 5.5, 18.79,
    // 1950–1959
    31.71, 24.02, 18.37, -0.99, 52.62, 31.56, 6.56, -10.78, 43.36, 11.96,
    // 1960–1969
    0.47, 26.89, -8.73, 22.8, 16.48, 12.45, -10.06, 23.98, 11.06, -8.5,
    // 1970–1979
    4.01, 14.31, 18.98, -14.66, -26.47, 37.2, 23.84, -7.18, 6.56, 18.44,
    // 1980–1989
    32.42, -4.91, 21.55, 22.56, 6.27, 31.73, 18.67, 5.25, 16.61, 31.69,
    // 1990–1999
    -3.1, 30.47, 7.62, 10.08, 1.32, 37.58, 22.96, 33.36, 28.58, 21.04,
    // 2000–2009
    -9.1, -11.89, -22.1, 28.68, 10.88, 4.91, 15.79, 5.49, -37.0, 26.46,
    // 2010–2019
    15.06, 2.11, 16.0, 32.39, 13.69, 1.38, 11.96, 21.83, -4.38, 31.49,
    // 2020–2024
    18.4, 28.71, -18.11, 26.29, 25.02,
  ],
};

/** The historical-series library (extensible — add balanced/bond sequences here later). */
export const HISTORICAL_SERIES: HistoricalSeries[] = [SP500_TOTAL_RETURN];

/** Arithmetic mean and POPULATION standard deviation (÷N) of a return series, in percent. */
export function seriesStats(returnsPct: number[]): { meanPct: number; volPct: number } {
  const n = returnsPct.length;
  if (n === 0) return { meanPct: 0, volPct: 0 };
  let sum = 0;
  for (const r of returnsPct) sum += r;
  const mean = sum / n;
  let sq = 0;
  for (const r of returnsPct) sq += (r - mean) * (r - mean);
  return { meanPct: mean, volPct: Math.sqrt(sq / n) };
}

/**
 * Standardized shocks z_t = (r_t − mean)/stdev — the dimensionless SHAPE of the record (mean 0,
 * stdev 1), stripped of its absolute level. A degenerate series (zero variance) yields all zeros.
 */
export function standardizedShocks(returnsPct: number[]): number[] {
  const { meanPct, volPct } = seriesStats(returnsPct);
  if (volPct === 0) return returnsPct.map(() => 0);
  return returnsPct.map((r) => (r - meanPct) / volPct);
}

/** One backtest cohort: a start year and the recentered/rescaled return path that follows from it. */
export interface HistoricalCohort {
  /** Calendar year this cohort "retires" into. */
  startYear: number;
  /** The plan-scaled return path for this window (per account type). */
  path: ReturnPathByType;
}

/**
 * Build every `years`-long cohort from `series`, recentering and rescaling each year's standardized
 * historical shock to the plan's per-account-type mean and volatility. One cohort per start year for
 * which a full window fits inside the record; fewer than `years` of data ⇒ no cohorts. The single
 * shared shock per year drives all account types together (a realized market path), and each year's
 * fallback `returnPct` is the equal-weight average of the type returns — mirroring the Monte Carlo
 * path shape so the projection reads `returnByType` identically.
 */
export function buildCohorts(
  series: HistoricalSeries,
  years: number,
  distributionByType: Record<AccountType, { meanPct: number; volPct: number }>,
  assumptions: { inflationPct: number; indexingPct: number },
): HistoricalCohort[] {
  const n = Math.max(0, Math.floor(years));
  const shocks = standardizedShocks(series.returnsPct);
  const cohorts: HistoricalCohort[] = [];
  if (n === 0 || shocks.length < n) return cohorts;

  const { inflationPct, indexingPct } = assumptions;
  const d = distributionByType;
  for (let s = 0; s + n <= shocks.length; s++) {
    const path: ReturnPathByType = new Array(n);
    for (let i = 0; i < n; i++) {
      const z = shocks[s + i];
      const rrsp = d.rrsp.meanPct + d.rrsp.volPct * z;
      const tfsa = d.tfsa.meanPct + d.tfsa.volPct * z;
      const nonReg = d.nonReg.meanPct + d.nonReg.volPct * z;
      const lira = d.lira.meanPct + d.lira.volPct * z;
      path[i] = {
        returnPct: (rrsp + tfsa + nonReg + lira) / 4,
        inflationPct,
        indexingPct,
        returnByType: { rrsp, tfsa, nonReg, lira },
      };
    }
    cohorts.push({ startYear: series.startYear + s, path });
  }
  return cohorts;
}

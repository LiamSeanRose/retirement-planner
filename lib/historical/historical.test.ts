import { describe, expect, it } from 'vitest';
import type { AccountType } from '../../types/planner';
import { SP500_TOTAL_RETURN, buildCohorts, seriesStats, standardizedShocks } from './index';

const dist: Record<AccountType, { meanPct: number; volPct: number }> = {
  rrsp: { meanPct: 5, volPct: 10 },
  tfsa: { meanPct: 5, volPct: 10 },
  nonReg: { meanPct: 4, volPct: 8 },
  lira: { meanPct: 0, volPct: 0 },
};

describe('SP500_TOTAL_RETURN (dated reference series)', () => {
  it('spans 1926 through 2024 with one return per year', () => {
    expect(SP500_TOTAL_RETURN.startYear).toBe(1926);
    expect(SP500_TOTAL_RETURN.returnsPct).toHaveLength(2024 - 1926 + 1);
  });
  it('pins the well-known crash and recovery years (provenance check)', () => {
    const r = (year: number) => SP500_TOTAL_RETURN.returnsPct[year - SP500_TOTAL_RETURN.startYear];
    expect(r(1931)).toBeCloseTo(-43.34, 2);
    expect(r(1974)).toBeCloseTo(-26.47, 2);
    expect(r(2008)).toBeCloseTo(-37.0, 2);
    expect(r(2022)).toBeCloseTo(-18.11, 2);
    expect(r(2024)).toBeCloseTo(25.02, 2);
  });
});

describe('seriesStats / standardizedShocks', () => {
  it('computes mean and population stdev', () => {
    const s = seriesStats([10, 20, 30]); // mean 20, popstd = √(200/3) ≈ 8.165
    expect(s.meanPct).toBeCloseTo(20, 6);
    expect(s.volPct).toBeCloseTo(8.16497, 4);
  });
  it('standardizes to mean 0, stdev 1', () => {
    const z = standardizedShocks(SP500_TOTAL_RETURN.returnsPct);
    const zs = seriesStats(z);
    expect(zs.meanPct).toBeCloseTo(0, 6);
    expect(zs.volPct).toBeCloseTo(1, 6);
    expect(z).toHaveLength(SP500_TOTAL_RETURN.returnsPct.length);
  });
  it('a flat series has zero-variance ⇒ all-zero shocks (no divide-by-zero)', () => {
    expect(standardizedShocks([7, 7, 7])).toEqual([0, 0, 0]);
  });
});

describe('buildCohorts (recenter + rescale)', () => {
  it('emits one cohort per start year that fits the horizon, each `years` long', () => {
    const years = 31;
    const cohorts = buildCohorts(SP500_TOTAL_RETURN, years, dist, { inflationPct: 2, indexingPct: 2 });
    expect(cohorts).toHaveLength(SP500_TOTAL_RETURN.returnsPct.length - years + 1);
    expect(cohorts[0].startYear).toBe(1926);
    expect(cohorts.at(-1)!.startYear).toBe(2024 - years + 1);
    for (const c of cohorts) expect(c.path).toHaveLength(years);
  });

  it('carries per-type returns and the equal-weight average fallback', () => {
    const [c] = buildCohorts(SP500_TOTAL_RETURN, 5, dist, { inflationPct: 2, indexingPct: 2 });
    const y0 = c.path[0];
    expect(y0.returnByType).toBeDefined();
    expect(y0.inflationPct).toBe(2);
    const { rrsp, tfsa, nonReg, lira } = y0.returnByType!;
    expect(y0.returnPct).toBeCloseTo((rrsp + tfsa + nonReg + lira) / 4, 9);
  });

  it('over a full-length window the rescaled returns recover the plan’s own mean and volatility', () => {
    // One cohort spanning the whole record: its standardized shocks have mean 0 / stdev 1 exactly,
    // so each type’s returns recover typeMean (mean) and typeVol (population stdev).
    const full = SP500_TOTAL_RETURN.returnsPct.length;
    const [c] = buildCohorts(SP500_TOTAL_RETURN, full, dist, { inflationPct: 2, indexingPct: 2 });
    const rrspReturns = c.path.map((y) => y.returnByType!.rrsp);
    const stats = seriesStats(rrspReturns);
    expect(stats.meanPct).toBeCloseTo(dist.rrsp.meanPct, 6);
    expect(stats.volPct).toBeCloseTo(dist.rrsp.volPct, 6);
  });

  it('the worst historical year is the most negative scaled return in its cohort', () => {
    // 1931 (−43.34%) is the deepest drop; the cohort starting in 1931 should open with the lowest return.
    const cohorts = buildCohorts(SP500_TOTAL_RETURN, 10, dist, { inflationPct: 2, indexingPct: 2 });
    const c1931 = cohorts.find((c) => c.startYear === 1931)!;
    const minInCohort = Math.min(...c1931.path.map((y) => y.returnByType!.rrsp));
    expect(c1931.path[0].returnByType!.rrsp).toBeCloseTo(minInCohort, 9);
    expect(c1931.path[0].returnByType!.rrsp).toBeLessThan(0); // a deep negative real-history shock
  });

  it('returns no cohorts when the horizon exceeds the record', () => {
    expect(buildCohorts(SP500_TOTAL_RETURN, 1000, dist, { inflationPct: 2, indexingPct: 2 })).toEqual([]);
    expect(buildCohorts(SP500_TOTAL_RETURN, 0, dist, { inflationPct: 2, indexingPct: 2 })).toEqual([]);
  });
});

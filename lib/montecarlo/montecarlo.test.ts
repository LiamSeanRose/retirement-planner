import { describe, expect, it } from 'vitest';
import {
  percentile,
  runMonteCarlo,
  type MakeRun,
  type MonteCarloOpts,
  type RunOutcome,
} from './index';

/** A makeRun that returns pre-scripted outcomes in call order — lets us hand-compute the aggregate. */
function scripted(outcomes: RunOutcome[]): MakeRun {
  let i = 0;
  return () => outcomes[i++];
}

const near = (a: number, b: number, tol = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('percentile (inclusive linear interpolation, R-7)', () => {
  it('handles empty and singleton arrays', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.05)).toBe(42);
  });

  it('matches hand-computed values on [0,1,2,3,4]', () => {
    const xs = [0, 1, 2, 3, 4];
    near(percentile(xs, 0.05), 0.2);
    near(percentile(xs, 0.25), 1);
    near(percentile(xs, 0.5), 2);
    near(percentile(xs, 0.75), 3);
    near(percentile(xs, 0.95), 3.8);
  });

  it('interpolates between two ranks', () => {
    near(percentile([10, 20], 0.5), 15);
  });
});

describe('runMonteCarlo — aggregation math on known inputs', () => {
  const outcomes: RunOutcome[] = [
    { netWorthByYear: [100, 50], lastsToEndAge: true, estateValue: 10, lifetimeTax: 1 },
    { netWorthByYear: [200, 60], lastsToEndAge: true, estateValue: 20, lifetimeTax: 2 },
    { netWorthByYear: [300, 70], lastsToEndAge: false, estateValue: 30, lifetimeTax: 3 },
    { netWorthByYear: [400, 80], lastsToEndAge: true, estateValue: 40, lifetimeTax: 4 },
    { netWorthByYear: [500, 90], lastsToEndAge: true, estateValue: 50, lifetimeTax: 5 },
  ];
  const result = runMonteCarlo(scripted(outcomes), { years: 2, runs: 5, seed: 1 });

  it('probabilityOfSuccess = share with lastsToEndAge (fraction in [0,1])', () => {
    near(result.probabilityOfSuccess, 0.8); // 4 of 5
  });

  it('reports the number of runs aggregated', () => {
    expect(result.runs).toBe(5);
  });

  it('net-worth bands: one per year, year-indexed, percentiles correct', () => {
    expect(result.netWorth).toHaveLength(2);

    expect(result.netWorth[0].year).toBe(0);
    near(result.netWorth[0].p5, 120); // sorted [100,200,300,400,500]
    near(result.netWorth[0].p25, 200);
    near(result.netWorth[0].p50, 300);
    near(result.netWorth[0].p75, 400);
    near(result.netWorth[0].p95, 480);

    expect(result.netWorth[1].year).toBe(1);
    near(result.netWorth[1].p5, 52); // sorted [50,60,70,80,90]
    near(result.netWorth[1].p50, 70);
    near(result.netWorth[1].p95, 88);
  });

  it('estateValue distribution (p5/p50/p95/mean)', () => {
    near(result.estateValue.p5, 12); // sorted [10,20,30,40,50]
    near(result.estateValue.p50, 30);
    near(result.estateValue.p95, 48);
    near(result.estateValue.mean, 30);
  });

  it('lifetimeTax distribution (p5/p50/p95/mean)', () => {
    near(result.lifetimeTax.p5, 1.2); // sorted [1,2,3,4,5]
    near(result.lifetimeTax.p50, 3);
    near(result.lifetimeTax.p95, 4.8);
    near(result.lifetimeTax.mean, 3);
  });
});

describe('runMonteCarlo — probability bounds', () => {
  const mk = (lasts: boolean): RunOutcome => ({
    netWorthByYear: [1],
    lastsToEndAge: lasts,
    estateValue: 0,
    lifetimeTax: 0,
  });

  it('all runs succeed ⇒ 1', () => {
    const r = runMonteCarlo(scripted([mk(true), mk(true), mk(true)]), { years: 1, runs: 3 });
    expect(r.probabilityOfSuccess).toBe(1);
  });

  it('all runs fail ⇒ 0', () => {
    const r = runMonteCarlo(scripted([mk(false), mk(false)]), { years: 1, runs: 2 });
    expect(r.probabilityOfSuccess).toBe(0);
  });
});

describe('runMonteCarlo — determinism under a fixed seed', () => {
  // An outcome that depends on the rng-sampled path, so determinism is non-trivial.
  const pathDriven: MakeRun = (path) => {
    const nw = path.map((y) => y.returnPct);
    const sum = nw.reduce((a, b) => a + b, 0);
    return {
      netWorthByYear: nw,
      lastsToEndAge: sum >= 0,
      estateValue: sum,
      lifetimeTax: Math.abs(sum),
    };
  };
  const opts: MonteCarloOpts = {
    years: 10,
    runs: 50,
    seed: 42,
    distribution: { meanPct: 5, volPct: 12 },
  };

  it('same seed + opts ⇒ identical aggregate', () => {
    expect(runMonteCarlo(pathDriven, opts)).toEqual(runMonteCarlo(pathDriven, opts));
  });

  it('a different seed changes the aggregate', () => {
    const a = runMonteCarlo(pathDriven, opts);
    const b = runMonteCarlo(pathDriven, { ...opts, seed: 43 });
    expect(b).not.toEqual(a);
  });

  it('actually samples — net-worth bands separate under real volatility', () => {
    const r = runMonteCarlo(pathDriven, opts);
    expect(r.netWorth[0].p95).toBeGreaterThan(r.netWorth[0].p5);
  });
});

describe('runMonteCarlo — defaults and edges', () => {
  it('defaults to 1000 runs when runs is omitted', () => {
    let calls = 0;
    const counting: MakeRun = () => {
      calls++;
      return { netWorthByYear: [1], lastsToEndAge: true, estateValue: 0, lifetimeTax: 0 };
    };
    const r = runMonteCarlo(counting, { years: 1 });
    expect(calls).toBe(1000);
    expect(r.runs).toBe(1000);
  });

  it('years = 0 ⇒ no net-worth bands, still aggregates the scalars', () => {
    const out: RunOutcome = { netWorthByYear: [], lastsToEndAge: true, estateValue: 7, lifetimeTax: 2 };
    const r = runMonteCarlo(scripted([out, out, out]), { years: 0, runs: 3 });
    expect(r.netWorth).toEqual([]);
    expect(r.probabilityOfSuccess).toBe(1);
    near(r.estateValue.p50, 7);
  });

  it('single run ⇒ every percentile equals the lone value', () => {
    const out: RunOutcome = { netWorthByYear: [123], lastsToEndAge: true, estateValue: 9, lifetimeTax: 4 };
    const r = runMonteCarlo(scripted([out]), { years: 1, runs: 1 });
    const b = r.netWorth[0];
    expect([b.p5, b.p25, b.p50, b.p75, b.p95]).toEqual([123, 123, 123, 123, 123]);
    expect([r.estateValue.p5, r.estateValue.p50, r.estateValue.p95, r.estateValue.mean]).toEqual([
      9, 9, 9, 9,
    ]);
  });

  it('sorts numerically, not lexicographically', () => {
    // Values lexicographic sort would mis-order ("100" < "20" as strings).
    const mk = (nw: number): RunOutcome => ({
      netWorthByYear: [nw],
      lastsToEndAge: true,
      estateValue: nw,
      lifetimeTax: 0,
    });
    const r = runMonteCarlo(scripted([2, 100, 1, 20, 10].map(mk)), { years: 1, runs: 5 });
    near(r.netWorth[0].p50, 10); // sorted [1,2,10,20,100] -> median 10
    near(r.estateValue.p50, 10);
  });
});

describe('runMonteCarlo — purity', () => {
  it('does not mutate the injected outcome objects', () => {
    const out: RunOutcome = { netWorthByYear: [5, 6], lastsToEndAge: true, estateValue: 1, lifetimeTax: 2 };
    const before = JSON.stringify(out);
    runMonteCarlo(scripted([out, out]), { years: 2, runs: 2 });
    expect(JSON.stringify(out)).toBe(before);
  });
});

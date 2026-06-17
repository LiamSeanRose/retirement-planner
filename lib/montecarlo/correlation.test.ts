import { describe, expect, it } from 'vitest';
import { runMonteCarlo, type MakeRun, type MonteCarloOpts } from './index';
import type { YearReturns } from '../../types/planner';

const dist = {
  rrsp: { meanPct: 5, volPct: 15 },
  tfsa: { meanPct: 5, volPct: 15 },
  nonReg: { meanPct: 4, volPct: 10 },
};

// A run whose net worth depends on the year's per-account returns, so the aggregate reflects the draws.
const sensitive: MakeRun = (path) => {
  const y = path[0] as YearReturns;
  const nw = y.returnByType ? y.returnByType.rrsp + y.returnByType.tfsa + y.returnByType.nonReg : 0;
  return { netWorthByYear: [nw], lastsToEndAge: nw > 0, estateValue: nw, lifetimeTax: 0 };
};

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Record each run's year-0 RRSP/TFSA returns to measure their realized correlation. */
function recordReturns(opts: MonteCarloOpts): { rrsp: number[]; tfsa: number[] } {
  const rrsp: number[] = [];
  const tfsa: number[] = [];
  const rec: MakeRun = (path) => {
    const y = path[0] as YearReturns;
    if (y.returnByType) {
      rrsp.push(y.returnByType.rrsp);
      tfsa.push(y.returnByType.tfsa);
    }
    return { netWorthByYear: [1], lastsToEndAge: true, estateValue: 0, lifetimeTax: 0 };
  };
  runMonteCarlo(rec, opts);
  return { rrsp, tfsa };
}

describe('Monte Carlo per-account correlation', () => {
  const base: MonteCarloOpts = { years: 1, runs: 400, seed: 7, distributionByType: dist };

  it('correlation:0 is byte-identical to omitting it — the default is unchanged', () => {
    expect(runMonteCarlo(sensitive, { ...base, correlation: 0 })).toEqual(runMonteCarlo(sensitive, base));
  });

  it('is reproducible under a fixed seed with correlation on', () => {
    const opts = { ...base, correlation: 0.9 };
    expect(runMonteCarlo(sensitive, opts)).toEqual(runMonteCarlo(sensitive, opts));
  });

  it('independent by default: account returns are roughly uncorrelated', () => {
    expect(Math.abs(pearson(recordReturns(base).rrsp, recordReturns(base).tfsa))).toBeLessThan(0.2);
  });

  it('with high correlation, accounts move together (a market-wide down year hits all)', () => {
    const { rrsp, tfsa } = recordReturns({ ...base, correlation: 0.9 });
    expect(pearson(rrsp, tfsa)).toBeGreaterThan(0.6);
  });

  it('turning correlation on changes the sampled aggregate', () => {
    expect(runMonteCarlo(sensitive, { ...base, correlation: 0.9 })).not.toEqual(runMonteCarlo(sensitive, base));
  });
});

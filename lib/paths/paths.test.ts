import { describe, expect, it } from 'vitest';
import { flatPath, sampledPath, type ReturnPath } from './index';
import { createRng } from '../rng';

describe('flatPath', () => {
  it('produces `years` years with identical values', () => {
    const path = flatPath({ years: 30, returnPct: 5, inflationPct: 2, indexingPct: 2 });
    expect(path).toHaveLength(30);
    for (const y of path) {
      expect(y).toEqual({ returnPct: 5, inflationPct: 2, indexingPct: 2 });
    }
  });

  it('returns an empty path for 0 years', () => {
    expect(flatPath({ years: 0, returnPct: 5, inflationPct: 2, indexingPct: 2 })).toEqual([]);
  });

  it('makes each year a distinct object (mutating one does not affect the others)', () => {
    const path = flatPath({ years: 3, returnPct: 5, inflationPct: 2, indexingPct: 2 });
    path[0].returnPct = -40;
    expect(path[1].returnPct).toBe(5);
    expect(path[2].returnPct).toBe(5);
  });
});

describe('sampledPath', () => {
  it('takes each return from the injected draw and holds inflation/indexing flat', () => {
    let i = 0;
    const draw = () => i++; // deterministic, observable sequence: 0, 1, 2, …
    const path = sampledPath(5, draw, { inflationPct: 2, indexingPct: 1.8 });
    expect(path).toHaveLength(5);
    expect(path.map((y) => y.returnPct)).toEqual([0, 1, 2, 3, 4]);
    for (const y of path) {
      expect(y.inflationPct).toBe(2);
      expect(y.indexingPct).toBe(1.8);
    }
  });

  it('calls drawReturn exactly once per year', () => {
    let calls = 0;
    const draw = () => {
      calls++;
      return 0.05;
    };
    sampledPath(10, draw, { inflationPct: 2, indexingPct: 2 });
    expect(calls).toBe(10);
  });

  it('returns an empty path and never draws for 0 years', () => {
    let calls = 0;
    const path = sampledPath(0, () => {
      calls++;
      return 1;
    }, { inflationPct: 2, indexingPct: 2 });
    expect(path).toEqual([]);
    expect(calls).toBe(0);
  });

  it('is reproducible when wired to a seeded rng (the intended composition)', () => {
    const build = (): ReturnPath => {
      const rng = createRng(2026);
      return sampledPath(40, () => rng.normal(5, 12), { inflationPct: 2, indexingPct: 2 });
    };
    expect(build()).toEqual(build());
    expect(build()).toHaveLength(40);
  });
});

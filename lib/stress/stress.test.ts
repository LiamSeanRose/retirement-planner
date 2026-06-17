import { describe, expect, it } from 'vitest';
import {
  earlyCrash,
  highInflation,
  lowReturnDecade,
  PROJECTION_LAYER_STRESSORS,
  STRESS_SCENARIOS,
  type ReturnPath,
} from './index';

/** Build a flat base path: `years` identical years at the given return/inflation/indexing. */
function makeBase(years: number, returnPct = 6, inflationPct = 2, indexingPct = 2): ReturnPath {
  return Array.from({ length: years }, () => ({ returnPct, inflationPct, indexingPct }));
}

/** A detached copy for mutation checks. */
function snapshot(path: ReturnPath): ReturnPath {
  return path.map((y) => ({ ...y }));
}

describe('library shape', () => {
  it('exposes exactly the three path-shapeable scenarios, in order', () => {
    expect(STRESS_SCENARIOS.map((s) => s.id)).toEqual([
      'earlyCrash',
      'lowReturnDecade',
      'highInflation',
    ]);
  });

  it('every scenario has id / label / describe / makePath', () => {
    for (const s of STRESS_SCENARIOS) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.label).toBe('string');
      expect(typeof s.describe).toBe('string');
      expect(typeof s.makePath).toBe('function');
    }
  });

  it('scenario ids are unique', () => {
    const ids = STRESS_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Shared invariants every path transform must satisfy.
for (const scenario of STRESS_SCENARIOS) {
  describe(`invariants — ${scenario.id}`, () => {
    it('returns a path of the same length as the base', () => {
      const base = makeBase(15);
      expect(scenario.makePath(base)).toHaveLength(base.length);
    });

    it('does not mutate the base path', () => {
      const base = makeBase(15);
      const before = snapshot(base);
      scenario.makePath(base);
      expect(base).toEqual(before);
    });

    it('returns a new array, not the same reference', () => {
      const base = makeBase(15);
      expect(scenario.makePath(base)).not.toBe(base);
    });

    it('maps an empty path to an empty path', () => {
      expect(scenario.makePath([])).toEqual([]);
    });
  });
}

describe('earlyCrash', () => {
  it('sets a −30% return for the first 2 years, leaving inflation/indexing untouched', () => {
    const base = makeBase(15);
    const out = earlyCrash.makePath(base);
    for (let i = 0; i < 2; i++) {
      expect(out[i].returnPct).toBe(-30);
      expect(out[i].inflationPct).toBe(base[i].inflationPct);
      expect(out[i].indexingPct).toBe(base[i].indexingPct);
    }
  });

  it('leaves every year from the third onward untouched', () => {
    const base = makeBase(15);
    const out = earlyCrash.makePath(base);
    for (let i = 2; i < base.length; i++) {
      expect(out[i]).toEqual(base[i]);
    }
  });

  it('modifies only the years that exist when the path is shorter than the window', () => {
    const out = earlyCrash.makePath(makeBase(1));
    expect(out).toHaveLength(1);
    expect(out[0].returnPct).toBe(-30);
  });
});

describe('lowReturnDecade', () => {
  it('caps nominal return at inflation + 2% for the first 10 years', () => {
    const base = makeBase(15, 6, 2, 2); // real 4% nominal -> capped to ~2% real == 4% nominal
    const out = lowReturnDecade.makePath(base);
    for (let i = 0; i < 10; i++) {
      expect(out[i].returnPct).toBe(4);
      expect(out[i].inflationPct).toBe(2);
      expect(out[i].indexingPct).toBe(2);
    }
  });

  it('leaves every year from the eleventh onward untouched', () => {
    const base = makeBase(15, 6);
    const out = lowReturnDecade.makePath(base);
    for (let i = 10; i < base.length; i++) {
      expect(out[i]).toEqual(base[i]);
    }
  });

  it('never raises a return already below the cap (a stress is adverse-only)', () => {
    const base = makeBase(15, 1, 2, 2); // 1% nominal is already below the 4% cap
    const out = lowReturnDecade.makePath(base);
    for (let i = 0; i < 10; i++) {
      expect(out[i].returnPct).toBe(1);
    }
  });

  it('tracks the base inflation when computing the cap', () => {
    const base = makeBase(12, 10, 5, 5); // cap = inflation(5) + 2 = 7
    const out = lowReturnDecade.makePath(base);
    for (let i = 0; i < 10; i++) {
      expect(out[i].returnPct).toBe(7);
    }
  });
});

describe('highInflation', () => {
  it('raises inflation by 4 pts and indexing by only 2 pts for the first 5 years', () => {
    const base = makeBase(15, 6, 2, 2);
    const out = highInflation.makePath(base);
    for (let i = 0; i < 5; i++) {
      expect(out[i].inflationPct).toBe(6);
      expect(out[i].indexingPct).toBe(4);
      expect(out[i].returnPct).toBe(6); // returns untouched
      expect(out[i].indexingPct).toBeLessThan(out[i].inflationPct); // the divergence (real erosion)
    }
  });

  it('leaves every year from the sixth onward untouched', () => {
    const base = makeBase(15);
    const out = highInflation.makePath(base);
    for (let i = 5; i < base.length; i++) {
      expect(out[i]).toEqual(base[i]);
    }
  });
});

describe('projection-layer stressors (stubs, not path transforms)', () => {
  it('lists the non-path stresses by id', () => {
    expect(PROJECTION_LAYER_STRESSORS.map((s) => s.id)).toEqual([
      'longevityShock',
      'oneTimeExpense',
      'reducedBenefits',
      'spouseEarlyMortality',
    ]);
  });

  it('deliberately expose NO makePath, so they cannot be faked into the path', () => {
    for (const s of PROJECTION_LAYER_STRESSORS) {
      expect(s).not.toHaveProperty('makePath');
      expect(typeof s.appliesAt).toBe('string');
    }
  });

  it('do not share ids with the path-shapeable scenarios', () => {
    const pathIds = new Set(STRESS_SCENARIOS.map((s) => s.id));
    for (const s of PROJECTION_LAYER_STRESSORS) {
      expect(pathIds.has(s.id)).toBe(false);
    }
  });
});

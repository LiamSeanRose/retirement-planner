import { describe, expect, it } from 'vitest';
import { createRng } from './index';

const draws = (n: number, f: () => number): number[] => Array.from({ length: n }, f);
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const stdev = (xs: number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

describe('createRng — determinism', () => {
  it('same seed ⇒ identical uniform sequence', () => {
    expect(draws(1000, createRng(12345).uniform)).toEqual(draws(1000, createRng(12345).uniform));
  });

  it('same seed ⇒ identical normal sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(draws(1000, () => a.normal())).toEqual(draws(1000, () => b.normal()));
  });

  it('different seeds ⇒ different sequences', () => {
    expect(draws(100, createRng(1).uniform)).not.toEqual(draws(100, createRng(2).uniform));
  });

  it('a sampler stays bound to its stream when passed as a bare function', () => {
    // Destructured off the object — must not depend on `this`.
    const { uniform } = createRng(7);
    expect(draws(50, uniform)).toEqual(draws(50, createRng(7).uniform));
  });
});

describe('createRng — uniform()', () => {
  it('stays within [0, 1)', () => {
    for (const x of draws(10000, createRng(99).uniform)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('is roughly uniform (empirical mean ≈ 0.5)', () => {
    expect(mean(draws(200000, createRng(99).uniform))).toBeCloseTo(0.5, 2);
  });
});

describe('createRng — normal()', () => {
  it('standard normal has empirical mean ≈ 0 and stdev ≈ 1', () => {
    const rng = createRng(2024);
    const xs = draws(200000, () => rng.normal());
    expect(Math.abs(mean(xs))).toBeLessThan(0.02);
    expect(Math.abs(stdev(xs) - 1)).toBeLessThan(0.02);
  });

  it('honours the mean and stdev parameters', () => {
    const rng = createRng(2025);
    const xs = draws(200000, () => rng.normal(5, 2));
    expect(Math.abs(mean(xs) - 5)).toBeLessThan(0.05);
    expect(Math.abs(stdev(xs) - 2)).toBeLessThan(0.05);
  });
});

describe('createRng — lognormal()', () => {
  it('is always positive, and its log matches the underlying normal', () => {
    const rng = createRng(7);
    const xs = draws(200000, () => rng.lognormal(0.1, 0.3));
    for (let i = 0; i < 200; i++) expect(xs[i]).toBeGreaterThan(0);
    const logs = xs.map((x) => Math.log(x));
    expect(Math.abs(mean(logs) - 0.1)).toBeLessThan(0.02);
    expect(Math.abs(stdev(logs) - 0.3)).toBeLessThan(0.02);
  });
});

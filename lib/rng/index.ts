/**
 * Seedable pseudo-random number generator and distribution samplers — pure, dependency-free.
 *
 * The whole analysis layer (Monte Carlo, sampled stress paths) draws through this so that every
 * run is REPRODUCIBLE and URL-shareable: a given seed always yields the same sequence of draws.
 * The PRNG is mulberry32, implemented inline (no npm dependency) — a fast 32-bit generator with
 * statistical properties good enough for this kind of simulation.
 *
 * Design: `createRng(seed)` returns a small stateful object whose samplers close over the seed
 * state (they do not use `this`), so an individual sampler can be passed around as a bare
 * function — e.g. wired into `/lib/paths` as `sampledPath(n, () => rng.normal(mean, sd), …)`
 * without binding pitfalls.
 */

/** Distribution samplers over a single seeded stream. Each call advances the stream. */
export interface Rng {
  /** Next uniform float in [0, 1). */
  uniform(): number;
  /** A normal (Gaussian) draw via Box–Muller. Defaults to the standard normal N(0, 1). */
  normal(mean?: number, stdev?: number): number;
  /**
   * A lognormal draw: `exp(normal(mu, sigma))`, where `mu` and `sigma` are the mean and standard
   * deviation of the UNDERLYING normal (i.e. in log-space). Always positive. Defaults mu=0, sigma=1.
   */
  lognormal(mu?: number, sigma?: number): number;
}

/**
 * Create a seeded generator. The same `seed` produces an identical sequence of draws, in call
 * order — so any simulation built on it reproduces exactly and can be shared by seed in a URL.
 */
export function createRng(seed: number): Rng {
  // mulberry32 state — a single 32-bit integer advanced on each draw.
  let a = seed >>> 0;

  const uniform = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // / 2^32 -> [0, 1)
  };

  const normal = (mean = 0, stdev = 1): number => {
    // Box–Muller: two uniforms -> one standard normal (the cos branch; sin branch discarded).
    let u1 = uniform();
    while (u1 === 0) u1 = uniform(); // guard against log(0)
    const u2 = uniform();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdev * z0;
  };

  const lognormal = (mu = 0, sigma = 1): number => Math.exp(normal(mu, sigma));

  return { uniform, normal, lognormal };
}

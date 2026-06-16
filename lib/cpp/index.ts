/**
 * CPP start-age adjustment — pure functions.
 *
 * DESIGN NOTE: CPP is taken as INPUT — the user's estimated CPP at 65 from their Service Canada
 * statement (it already bakes in drop-outs, child-rearing, enhancement, and full contribution
 * history). We do NOT recompute CPP from earnings. We only apply the start-age factor.
 */

import { DEFAULT_CONFIG, type YearConfig } from '../config';

/**
 * Start-age factor relative to the age-65 amount.
 *   Before 65: −reductionPerMonth per month early (max at 60).
 *   After 65:  +increasePerMonth per month late  (max at 70; no benefit past 70).
 */
export function cppStartFactor(startAge: number, config: YearConfig = DEFAULT_CONFIG): number {
  const cfg = config.cpp;
  const clampedAge = Math.min(Math.max(startAge, cfg.earliestStartAge), cfg.latestStartAge);
  const months = (clampedAge - 65) * 12;
  if (months < 0) return 1 + months * cfg.reductionPerMonthBefore65; // months negative -> reduction
  return 1 + months * cfg.increasePerMonthAfter65;
}

/** Monthly CPP at a chosen start age, given the user's estimated monthly amount at 65. */
export function cppMonthlyAtStart(
  estimatedMonthlyAt65: number,
  startAge: number,
  config: YearConfig = DEFAULT_CONFIG,
): number {
  return estimatedMonthlyAt65 * cppStartFactor(startAge, config);
}

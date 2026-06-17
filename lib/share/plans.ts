/**
 * Persisted plan library (`lib/share/plans`).
 *
 * Saved plans live in the browser's `localStorage` — on the device, never sent anywhere, exactly like
 * the URL-encoded share (no account, no server, no PII leaving the machine). A saved plan stores the
 * INPUT state (household + scenario), not the computed result: it's compact, it round-trips, and it
 * reloads straight into the editor where the projection recomputes. Window-guarded like
 * `readStateFromUrl`/`writeStateToUrl`, so it's safe to import in SSR/build with no `window`.
 */

import type { Household, Scenario } from '../../types/planner';

/** One saved plan: a named snapshot of the inputs, with a timestamp. */
export interface SavedPlan {
  id: string;
  name: string;
  /** Epoch ms when saved — for display/ordering. */
  savedAt: number;
  household: Household;
  scenario: Scenario;
}

/** localStorage key (versioned so the shape can evolve without colliding with old data). */
const STORAGE_KEY = 'almanac.plans.v1';

/** Cap on stored plans — enough to compare named what-ifs without the overlay turning to spaghetti. */
export const MAX_PLANS = 6;

/** Read the saved library from localStorage. Returns [] when absent, unparseable, or SSR. */
export function loadPlans(): SavedPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only well-formed entries (defends against hand-edited or stale storage).
    return parsed.filter(
      (p): p is SavedPlan =>
        p && typeof p.id === 'string' && typeof p.name === 'string' && p.household && p.scenario,
    );
  } catch {
    return [];
  }
}

/** Persist the library (capped at MAX_PLANS). No-ops on SSR or when storage is full/disabled. */
export function persistPlans(plans: SavedPlan[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans.slice(0, MAX_PLANS)));
  } catch {
    // Storage quota exceeded or disabled (private mode) — silently skip; the in-memory list still works.
  }
}

/** A stable-enough id for a newly saved plan. */
export function newPlanId(): string {
  return `plan-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

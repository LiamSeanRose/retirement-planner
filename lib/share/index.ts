import type { Household, Scenario } from '@/types/planner';

/**
 * URL-encoded scenario state for share/restore. Everything stays in the URL hash — no PII ever
 * leaves the browser or hits a server. We base64url-encode the JSON so a plan is a single link.
 */
export interface PlannerState {
  household: Household;
  scenario: Scenario;
}

function toBase64Url(s: string): string {
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(b64)));
  return Buffer.from(b64, 'base64').toString('utf-8');
}

export function encodeState(state: PlannerState): string {
  return toBase64Url(JSON.stringify(state));
}

export function decodeState(encoded: string): PlannerState | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded));
    if (parsed && parsed.household && parsed.scenario) return parsed as PlannerState;
    return null;
  } catch {
    return null;
  }
}

/** Read the plan from the current URL hash (#p=…), or null if absent/invalid. */
export function readStateFromUrl(): PlannerState | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(/[#&]p=([^&]+)/);
  return m ? decodeState(m[1]) : null;
}

/** Write the plan to the URL hash without adding a history entry. */
export function writeStateToUrl(state: PlannerState): void {
  if (typeof window === 'undefined') return;
  const url = `${window.location.pathname}${window.location.search}#p=${encodeState(state)}`;
  window.history.replaceState(null, '', url);
}

export * from './defaults';
export * from './format';
export * from './plans';
export * from './export';
export * from './wizard';

/// <reference lib="webworker" />
/**
 * Monte Carlo worker — keeps the 500–1,000-run aggregation off the main thread so the UI stays
 * responsive. Pure compute: it imports the same client-side engine and posts the result back.
 */
import { runMonteCarloScenario } from '../lib/engine';
import type { Household, Scenario } from '../types/planner';

interface Req {
  id: number;
  household: Household;
  scenario: Scenario;
  seed: number;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, household, scenario, seed } = e.data;
  try {
    const result = runMonteCarloScenario(household, scenario, seed);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};

'use client';

import { useEffect, useRef, useState } from 'react';
import { runMonteCarloScenario } from '@/lib/engine';
import type { Household, MonteCarloResult, Scenario } from '@/types/planner';

/**
 * Run the Monte Carlo aggregation in a Web Worker, recomputing when the plan changes. Falls back
 * to a deferred main-thread compute if Workers aren't available, so it always returns a result.
 */
export function useMonteCarlo(household: Household, scenario: Scenario, seed = 7) {
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(true);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('../app/mc-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: MonteCarloResult }>) => {
        if (e.data.id !== reqId.current) return;
        if (e.data.ok && e.data.result) setResult(e.data.result);
        setLoading(false);
      };
      workerRef.current = w;
      return () => {
        w.terminate();
        workerRef.current = null;
      };
    } catch {
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const id = (reqId.current += 1);
    const w = workerRef.current;
    if (w) {
      w.postMessage({ id, household, scenario, seed });
      return;
    }
    // Fallback: compute on the main thread, deferred a tick so the UI can paint first.
    const t = setTimeout(() => {
      try {
        setResult(runMonteCarloScenario(household, scenario, seed));
      } catch {
        /* leave the previous result in place */
      }
      setLoading(false);
    }, 0);
    return () => clearTimeout(t);
  }, [household, scenario, seed]);

  return { result, loading };
}

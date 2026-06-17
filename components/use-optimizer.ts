'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runScenario } from '@/lib/engine';
import { cppOasOptimizer, strategyOptimizer, type Objective } from '@/lib/optimize';
import type { Household, Scenario, ScenarioResult } from '@/types/planner';

type Totals = ScenarioResult['totals'];

export interface OptimizeResult {
  optimizedScenario: Scenario;
  optimizedTotals: Totals;
  baselineTotals: Totals;
  cppStartAge: number;
  oasStartAge: number;
  withdrawalOrder: string[] | null;
  meltdownMode: string;
}

/** Imperative optimizer: call `optimize(...)`; runs in a worker (sync fallback) and exposes the result. */
export function useOptimizer() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('../app/optimize-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: OptimizeResult }>) => {
        if (e.data.id !== reqId.current) return;
        if (e.data.ok && e.data.result) setResult(e.data.result);
        setRunning(false);
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

  const optimize = useCallback((household: Household, scenario: Scenario, objective: Objective) => {
    setRunning(true);
    const id = (reqId.current += 1);
    const w = workerRef.current;
    if (w) {
      w.postMessage({ id, household, scenario, objective });
      return;
    }
    // Fallback: compute on the main thread, deferred so the button can show its busy state.
    setTimeout(() => {
      try {
        const cppOas = cppOasOptimizer(household, scenario, objective);
        const strat = strategyOptimizer(household, cppOas.scenario, objective);
        const baseline = runScenario(household, scenario);
        setResult({
          optimizedScenario: strat.best.scenario,
          optimizedTotals: strat.best.result.totals,
          baselineTotals: baseline.totals,
          cppStartAge: cppOas.bestCppStartAge,
          oasStartAge: cppOas.bestOasStartAge,
          withdrawalOrder: strat.best.scenario.withdrawalOrder ?? null,
          meltdownMode: strat.best.scenario.meltdown.mode,
        });
      } catch {
        /* keep prior result */
      }
      setRunning(false);
    }, 0);
  }, []);

  return { optimize, running, result };
}

/// <reference lib="webworker" />
/**
 * Optimizer worker — runs the CPP/OAS exact enumeration + strategy knob-search off the main thread.
 * Returns the optimized scenario and a light totals comparison (not the full row-by-row results).
 */
import { cppOasOptimizer, strategyOptimizer, type Objective } from '../lib/optimize';
import { runScenario } from '../lib/engine';
import type { Household, Scenario } from '../types/planner';

interface Req {
  id: number;
  household: Household;
  scenario: Scenario;
  objective: Objective;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, household, scenario, objective } = e.data;
  try {
    const cppOas = cppOasOptimizer(household, scenario, objective);
    const strat = strategyOptimizer(household, cppOas.scenario, objective);
    const baseline = runScenario(household, scenario);
    (self as unknown as Worker).postMessage({
      id,
      ok: true,
      result: {
        optimizedScenario: strat.best.scenario,
        optimizedTotals: strat.best.result.totals,
        baselineTotals: baseline.totals,
        cppStartAge: cppOas.bestCppStartAge,
        oasStartAge: cppOas.bestOasStartAge,
        withdrawalOrder: strat.best.scenario.withdrawalOrder ?? null,
        meltdownMode: strat.best.scenario.meltdown.mode,
      },
    });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};

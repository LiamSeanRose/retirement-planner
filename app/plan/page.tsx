'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Household, Scenario } from '@/types/planner';
import { runScenario } from '@/lib/engine';
import { DEFAULT_HOUSEHOLD, DEFAULT_SCENARIO, encodeState, loadPlans, MAX_PLANS, newPlanId, persistPlans, readStateFromUrl, writeStateToUrl, type SavedPlan } from '@/lib/share';
import { ScenarioLab } from '@/components/scenario-lab';
import { AnalyticsPanel } from '@/components/analytics-panel';
import { OptimizerPanel } from '@/components/optimizer-panel';
import { Comparison } from '@/components/comparison';
import { EstatePanel } from '@/components/estate-panel';
import { StressPanel } from '@/components/stress-panel';
import { HistoricalPanel } from '@/components/historical-panel';
import { InsightsPanel } from '@/components/insights-panel';
import { MeltdownCallout } from '@/components/meltdown-callout';
import { PlainEnglish } from '@/components/plain-english';
import { QuestionsPanel } from '@/components/questions-panel';
import { SetupWizard } from '@/components/setup-wizard';
import { useMonteCarlo } from '@/components/use-monte-carlo';

const RULES_AS_OF = '2026';
const SEEN_KEY = 'almanac.seen';

function Masthead({ onShare, shared, onSetup }: { onShare: () => void; shared: boolean; onSetup: () => void }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
      <div>
        <Link href="/" className="eyebrow mb-1.5 inline-block hover:text-evergreen">← The Retirement Almanac</Link>
        <h1 className="font-display text-3xl font-semibold leading-none tracking-tight text-ink sm:text-4xl">Your plan</h1>
        <p className="mt-2 max-w-xl text-sm leading-snug text-muted">
          A year-by-year picture of your pension, CPP/OAS, savings, and tax — and how the levers of an
          early retirement change the whole trajectory.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSetup} className="rounded border border-line px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-evergreen hover:text-evergreen">
          Guided setup
        </button>
        <button type="button" onClick={onShare} className="rounded border border-evergreen bg-evergreen px-3.5 py-2 text-sm font-medium text-paper transition-colors hover:bg-evergreen-soft">
          {shared ? 'Link copied ✓' : 'Share plan'}
        </button>
      </div>
    </header>
  );
}

function Disclaimer() {
  return (
    <footer className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-faint">
      <p className="max-w-3xl">
        <strong className="font-medium text-muted">Estimates and educational projections only — not financial, tax, or
        legal advice.</strong>{' '}
        Confirm with the Government of Canada Pension Centre and a qualified advisor before acting. Every projection rests
        on assumptions (returns, inflation, life expectancy, future tax rules) that you can and should adjust. Tax and
        benefit rules current as of {RULES_AS_OF}.
      </p>
      <p className="mt-2 max-w-3xl">
        All computation runs in your browser — your salary and savings figures never leave your device or reach a server.
        A shared link encodes the plan in the URL itself.
      </p>
    </footer>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5">
      <div className="h-64 animate-pulse rounded-card border border-line bg-surface" />
      <div className="h-80 animate-pulse rounded-card border border-line bg-surface" />
    </div>
  );
}

export default function PlanPage() {
  const [household, setHousehold] = useState<Household>(DEFAULT_HOUSEHOLD);
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [restored, setRestored] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shared, setShared] = useState(false);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [labOpen, setLabOpen] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Restore a shared plan from the URL on first mount, and greet new visitors with the guided setup.
  useEffect(() => {
    const s = readStateFromUrl();
    if (s) {
      setHousehold(s.household);
      setScenario(s.scenario);
    }
    setRestored(true);
    setMounted(true);
    const wantsWizard = new URLSearchParams(window.location.search).has('wizard');
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(SEEN_KEY);
    } catch {
      seen = false;
    }
    if (!s && (wantsWizard || !seen)) setWizardOpen(true);
  }, []);

  // Persist the plan to the URL hash as it changes (client-only, no PII leaves the browser).
  useEffect(() => {
    if (restored) writeStateToUrl({ household, scenario });
  }, [household, scenario, restored]);

  // The saved-plan library lives in localStorage (on this device only): load once, persist on change.
  useEffect(() => {
    setPlans(loadPlans());
    setPlansLoaded(true);
  }, []);
  useEffect(() => {
    if (plansLoaded) persistPlans(plans);
  }, [plans, plansLoaded]);

  const result = useMemo(() => runScenario(household, scenario), [household, scenario]);
  const { result: mc, loading: mcLoading } = useMonteCarlo(household, scenario);

  const savePlan = (name: string) =>
    setPlans((prev) => (prev.length >= MAX_PLANS ? prev : [...prev, { id: newPlanId(), name, savedAt: Date.now(), household, scenario }]));
  const loadPlan = (id: string) => {
    const p = plans.find((x) => x.id === id);
    if (p) {
      setHousehold(p.household);
      setScenario(p.scenario);
    }
  };

  const markSeen = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode / storage disabled — ignore */
    }
  };
  const completeWizard = (h: Household, sc: Scenario) => {
    setHousehold(h);
    setScenario(sc);
    setWizardOpen(false);
    markSeen();
  };
  const closeWizard = () => {
    setWizardOpen(false);
    markSeen();
  };

  const onShare = () => {
    const url = `${window.location.origin}${window.location.pathname}#p=${encodeState({ household, scenario })}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      },
      () => undefined,
    );
  };

  return (
    <div className="relative z-10 mx-auto max-w-[1500px] px-4 py-6 lg:px-8">
      <Masthead onShare={onShare} shared={shared} onSetup={() => setWizardOpen(true)} />
      <button
        type="button"
        onClick={() => setLabOpen((v) => !v)}
        aria-expanded={labOpen}
        className="mt-4 w-full rounded border border-line bg-surface px-3 py-2 text-sm font-medium text-ink lg:hidden"
      >
        {labOpen ? 'Hide plan inputs ▴' : 'Edit plan inputs ▾'}
      </button>
      <div className="mt-4 grid gap-6 lg:mt-6 lg:grid-cols-[380px_1fr]">
        <aside className={`${labOpen ? 'block' : 'hidden'} lg:!block lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1`}>
          <ScenarioLab household={household} scenario={scenario} onHousehold={setHousehold} onScenario={setScenario} />
        </aside>
        <main className="space-y-5" aria-live="polite" aria-busy={mcLoading}>
          {mounted ? (
            <>
              <PlainEnglish household={household} scenario={scenario} result={result} successProbability={mc?.probabilityOfSuccess} />
              <QuestionsPanel household={household} scenario={scenario} />
              <AnalyticsPanel result={result} mc={mc} mcLoading={mcLoading} />
              <InsightsPanel household={household} scenario={scenario} />
              <MeltdownCallout household={household} scenario={scenario} />
              <EstatePanel household={household} scenario={scenario} result={result} />
              <OptimizerPanel household={household} scenario={scenario} onApply={setScenario} />
              <StressPanel household={household} scenario={scenario} />
              <HistoricalPanel household={household} scenario={scenario} />
              <Comparison
                current={result}
                plans={plans}
                onSave={savePlan}
                onLoad={loadPlan}
                onRemove={(id) => setPlans((prev) => prev.filter((p) => p.id !== id))}
                onClear={() => setPlans([])}
              />
            </>
          ) : (
            <Skeleton />
          )}
        </main>
      </div>
      <Disclaimer />
      {wizardOpen ? <SetupWizard onComplete={completeWizard} onClose={closeWizard} /> : null}
    </div>
  );
}

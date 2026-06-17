'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Household, Scenario } from '@/types/planner';
import { runScenario } from '@/lib/engine';
import { DEFAULT_HOUSEHOLD, DEFAULT_SCENARIO, encodeState, readStateFromUrl, writeStateToUrl } from '@/lib/share';
import { ScenarioLab } from '@/components/scenario-lab';
import { AnalyticsPanel } from '@/components/analytics-panel';
import { OptimizerPanel } from '@/components/optimizer-panel';
import { Comparison, type Snapshot } from '@/components/comparison';
import { useMonteCarlo } from '@/components/use-monte-carlo';

const RULES_AS_OF = '2026';

function Masthead({ onShare, shared }: { onShare: () => void; shared: boolean }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
      <div>
        <p className="eyebrow mb-1.5">Federal Public Service · PSSA pension</p>
        <h1 className="font-display text-3xl font-semibold leading-none tracking-tight text-ink sm:text-4xl">
          The Retirement Almanac
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-snug text-muted">
          A year-by-year picture of your pension, CPP/OAS, savings, and tax — and how the levers of an
          early retirement change the whole trajectory.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-right text-xs leading-tight text-faint sm:block">
          Tax &amp; benefit rules
          <br />
          as of {RULES_AS_OF}
        </span>
        <button
          type="button"
          onClick={onShare}
          className="rounded border border-evergreen bg-evergreen px-3.5 py-2 text-sm font-medium text-paper transition-colors hover:bg-evergreen-soft"
        >
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

export default function Page() {
  const [household, setHousehold] = useState<Household>(DEFAULT_HOUSEHOLD);
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [restored, setRestored] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shared, setShared] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // Restore a shared plan from the URL on first mount.
  useEffect(() => {
    const s = readStateFromUrl();
    if (s) {
      setHousehold(s.household);
      setScenario(s.scenario);
    }
    setRestored(true);
    setMounted(true);
  }, []);

  // Persist the plan to the URL hash as it changes (client-only, no PII leaves the browser).
  useEffect(() => {
    if (restored) writeStateToUrl({ household, scenario });
  }, [household, scenario, restored]);

  const result = useMemo(() => runScenario(household, scenario), [household, scenario]);
  const { result: mc, loading: mcLoading } = useMonteCarlo(household, scenario);

  const saveSnapshot = () =>
    setSnapshots((prev) => (prev.length >= 4 ? prev : [...prev, { id: `snap-${Date.now()}`, name: `Plan ${prev.length + 1}`, result }]));

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
      <Masthead onShare={onShare} shared={shared} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <ScenarioLab household={household} scenario={scenario} onHousehold={setHousehold} onScenario={setScenario} />
        </aside>
        <main className="space-y-5">
          {mounted ? (
            <>
              <AnalyticsPanel result={result} mc={mc} mcLoading={mcLoading} />
              <OptimizerPanel household={household} scenario={scenario} onApply={setScenario} />
              <Comparison
                current={result}
                snapshots={snapshots}
                onSnapshot={saveSnapshot}
                onRemove={(id) => setSnapshots((prev) => prev.filter((s) => s.id !== id))}
                onClear={() => setSnapshots([])}
              />
            </>
          ) : (
            <Skeleton />
          )}
        </main>
      </div>
      <Disclaimer />
    </div>
  );
}

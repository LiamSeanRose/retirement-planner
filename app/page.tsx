import Link from 'next/link';

const RULES_AS_OF = '2026';

/** A small engraved-style "two paths" trajectory — the same plan, two decisions. The hero motif. */
function TrajectoryMotif() {
  return (
    <svg viewBox="0 0 340 220" className="h-auto w-full" role="img" aria-label="Two retirement trajectories diverging over time">
      {/* baseline grid */}
      {[40, 90, 140, 190].map((y) => (
        <line key={y} x1="0" y1={y} x2="340" y2={y} stroke="var(--line)" strokeWidth="1" />
      ))}
      {/* "do nothing" path — lower, clay */}
      <path d="M0,180 C 80,172 140,160 200,150 S 300,132 340,128" fill="none" stroke="var(--c-nonreg)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.8" />
      {/* "optimized" path — higher, evergreen, with an area wash */}
      <path d="M0,178 C 70,156 120,112 184,96 S 292,50 340,32 L340,210 L0,210 Z" fill="var(--evergreen)" opacity="0.06" />
      <path d="M0,178 C 70,156 120,112 184,96 S 292,50 340,32" fill="none" stroke="var(--evergreen)" strokeWidth="2.5" />
      {/* a marker where the paths diverge */}
      <circle cx="184" cy="96" r="3.5" fill="var(--evergreen)" stroke="var(--surface)" strokeWidth="1.5" />
      {/* age ticks */}
      {[['60', 4], ['75', 160], ['90', 318]].map(([label, x]) => (
        <text key={label} x={x as number} y="208" fontSize="9" fill="var(--faint)" fontFamily="var(--font-mono)">{label}</text>
      ))}
    </svg>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-t border-ink/15 pt-3">
      <p className="font-display text-2xl font-semibold leading-none text-ink">{v}</p>
      <p className="mt-1 text-xs leading-snug text-muted">{k}</p>
    </div>
  );
}

const FEATURES: { title: string; body: string }[] = [
  { title: 'Probability of success', body: 'A thousand market simulations behind one honest confidence number — not a single rosy projection.' },
  { title: 'The RRSP meltdown', body: 'See the RRIF “tax bomb” of doing nothing, and how drawing down earlier defuses it and grows your estate.' },
  { title: '“If this happens” events', body: 'Long-term care, a market crash the year you retire, an inheritance, downsizing — toggle each and watch the plan move.' },
  { title: 'Plain-English summary', body: 'Your whole plan explained in a few clear sentences, drawn straight from the numbers. No jargon required.' },
  { title: 'Retire into history', body: 'Replay your plan through 1973, 2000, 2008 — every real market sequence since 1926 — and find your worst year to retire.' },
  { title: 'CPP / OAS timing', body: 'The tool searches every start age (60–70) and tells you the one that leaves you the most, with the break-even age.' },
];

export default function Home() {
  return (
    <div className="relative z-10 mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-12">
      {/* Wordmark bar */}
      <header className="flex items-center justify-between border-b-2 border-ink pb-4">
        <p className="font-display text-lg font-semibold tracking-tight text-ink">The Retirement Almanac</p>
        <p className="eyebrow">{RULES_AS_OF} Edition</p>
      </header>

      {/* Hero */}
      <section className="grid items-center gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <p className="eyebrow mb-4">For Canadian federal public servants · PSSA pension</p>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Know exactly when you can afford to retire.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Model your federal pension, CPP/OAS, savings, and tax — year by year — and see how every
            decision, from your retirement age to an RRSP meltdown, changes the whole picture.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/plan?wizard=1" className="rounded border border-evergreen bg-evergreen px-5 py-2.5 text-sm font-medium text-paper shadow-card transition-colors hover:bg-evergreen-soft">
              Build my plan →
            </Link>
            <Link href="/plan" className="rounded border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-evergreen hover:text-evergreen">
              Explore the planner
            </Link>
          </div>
          <p className="mt-5 text-xs text-faint">
            Free · Private · Runs entirely in your browser — your numbers never leave your device.
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface/70 p-5 shadow-card">
          <p className="eyebrow mb-3">The same plan, two decisions</p>
          <TrajectoryMotif />
          <p className="mt-3 text-xs leading-snug text-faint">
            Net worth through retirement — the solid line is an optimized plan, the dashed line is doing nothing.
          </p>
        </div>
      </section>

      {/* Value props */}
      <section className="grid gap-8 border-y border-line py-10 sm:grid-cols-3">
        <Stat v="Free" k="No account, no paywall, no upsell — built for one family, shared for everyone." />
        <Stat v="Private" k="Every calculation runs on your device. Your salary and savings never reach a server." />
        <Stat v="Federal-exact" k="The PSPP bridge benefit, Group 1/2 rules, the meltdown, OAS clawback — modelled precisely." />
      </section>

      {/* Feature almanac */}
      <section className="py-12">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">What you&apos;ll find inside</h2>
        <div className="mt-7 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t border-line pt-3">
              <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="flex flex-col items-start justify-between gap-5 rounded-card border border-evergreen/25 bg-evergreen/[0.04] px-6 py-7 sm:flex-row sm:items-center sm:px-8">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">Build your plan in about two minutes.</h2>
          <p className="mt-1.5 text-sm text-muted">Answer a few plain questions — we&apos;ll do the pension, tax, and projection math.</p>
        </div>
        <Link href="/plan?wizard=1" className="shrink-0 rounded border border-evergreen bg-evergreen px-5 py-2.5 text-sm font-medium text-paper shadow-card transition-colors hover:bg-evergreen-soft">
          Get started →
        </Link>
      </section>

      {/* Footer */}
      <footer className="mt-10 border-t border-line pt-5 text-xs leading-relaxed text-faint">
        <p className="max-w-3xl">
          <strong className="font-medium text-muted">Estimates and educational projections only — not financial, tax, or legal
          advice.</strong>{' '}
          Confirm with the Government of Canada Pension Centre and a qualified advisor before acting. Tax and benefit rules
          current as of {RULES_AS_OF}. Models the federal Public Service Pension Plan (PSSA) only.
        </p>
      </footer>
    </div>
  );
}

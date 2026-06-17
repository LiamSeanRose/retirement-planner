# The Retirement Almanac — Federal Public Service Planner

A free, client-side web tool that gives a Canadian **federal public servant** a complete,
year-by-year retirement financial picture — pension, CPP/OAS, RRSP/RRIF/TFSA/non-registered
accounts, annual tax, and the strategy levers an early-retirement decision actually turns on —
with Monte Carlo confidence, scenario comparison, an optimizer, and an estate projection.

> **Estimates and educational projections only — not financial, tax, or legal advice.** Confirm with
> the Government of Canada Pension Centre and a qualified advisor before acting. Tax and benefit rules
> are dated and re-verified yearly.

## Privacy by design

Everything runs **in your browser**. There is no backend, no database, and no account — your salary
and savings figures never leave your device or reach a server. A shared link encodes the plan in the
URL itself, so even sharing transmits nothing to us.

## What it models

- **Federal PSPP pension** — lifetime + bridge benefit (with the step-down at 65), Group 1/2 rules,
  early-retirement reduction, indexing.
- **CPP & OAS** — start-age timing, OAS deferral, and the recovery-tax (clawback) on prior-year income.
- **Accounts** — RRSP→RRIF minimums, TFSA, and non-registered, projected over time.
- **Tax** — federal + provincial brackets, credits, the Ontario surtax/health premium, and automated
  pension income splitting in couple mode.
- **Strategy & analysis** — the RRSP meltdown, withdrawal sequencing, Monte Carlo probability of
  success, stress tests, an objective optimizer, scenario comparison, and the after-tax estate.

This tool models the **federal** Public Service Pension Plan (under the PSSA) only — not the
similarly named provincial plans.

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run test       # engine unit tests (Vitest)
```

## Deploy to Vercel

This is a standard Next.js (App Router) app and deploys to Vercel with zero configuration:

1. Push to a Git repository.
2. Import the repo in Vercel — it auto-detects Next.js. No environment variables are needed.
3. Deploy. Because all computation is client-side, it also works as a static export host.

## Architecture

- **Next.js + TypeScript**, Tailwind CSS, Recharts.
- A pure, dependency-free TypeScript **engine** under `/lib` (pension, CPP, OAS, accounts, tax,
  projection, Monte Carlo, strategy, optimizer, estate) — fully unit-tested, no UI coupling.
- The UI (`/app`, `/components`) consumes the engine through `/lib/engine`; heavy work (Monte Carlo,
  optimization) runs in Web Workers so the interface stays responsive.

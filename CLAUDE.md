# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Federal Retirement Planner** — a free, client-side web tool giving Canadian federal public servants a complete year-by-year retirement financial picture. No backend, no accounts; all computation runs in the browser and data never leaves the device.

Modelled on professional planning software (**Conquest Planning, Optiml**): beyond a deterministic projection it does **Monte Carlo** probability-of-success, **stress testing**, an **estate projector**, **what-if** scenario comparison, a **withdrawal/strategy optimizer**, a **CPP/OAS optimizer**, and the **RRSP meltdown**. The edge is being free, federal-PSPP-specialized, and fully client-side.

Full spec and build plan: `docs/retirement-financial-planning-tool-plan.md.md`  
Edge cases and fine detail: `docs/retirement-tool-edge-cases-and-details.md.md`

## Working model

- Solo developer (Liam). Commit directly to the working branch — no PRs, no feature branches.
- No AI authorship attribution in commits, comments, code, README, or docs.
- Dad is the domain expert and continuous validator; his confirmation is required for anything touching pension/CPP/OAS rules or strategy outputs before shipping.

## Stack

- **Next.js + TypeScript** on Vercel. Pure client-side — no backend, no DB.
- **Engine** lives under `/lib`, pure dependency-free TypeScript — no React or I/O:
  - `pension`, `cpp`, `oas`, `accounts` (RRIF/TFSA/non-reg), `tax` (province-keyed) — domain math
  - `projection` — **one run over one path** (the year loop); accepts its `ReturnPath` as input, never reads flat assumptions internally
  - `paths` — path generators (flat / stress / sampled); `rng` — seedable PRNG + distribution samplers (reproducible, URL-shareable)
  - `strategy` (meltdown, sequencing, timing), `montecarlo` (N-run aggregation: probability of success, percentile bands), `stress` (named adverse scenarios), `estate` (terminal-tax / after-tax estate value), `optimize` (objective solvers: CPP/OAS exact enumeration + withdrawal/strategy knob search)
- **Heavy analysis (Monte Carlo, optimizer) runs in a Web Worker** off the UI thread.
- **Charts:** Recharts (or similar).
- **State:** React + URL-encoded scenarios.
- Use the `frontend-design` skill before any UI work.

## Commands

> The Next.js app has not been scaffolded yet. Once created, typical commands will be:

```bash
npm run dev        # start dev server (localhost:3000)
npm run build      # production build
npm run lint       # ESLint
npm run test       # Jest unit tests
npm run test -- --testPathPattern=lib/pension   # run a single test file
```

## Build phases

| Phase | Scope |
|---|---|
| 0 | `/lib/pension` + CPP/OAS engine, golden tests green. No UI. |
| 1 | **Path-based** projection loop + accounts (RRIF/TFSA/non-reg) + tax (single, Ontario). Build it `ReturnPath`-based from day one so MC/stress plug in without a refactor. Minimal UI. |
| 2 | Financial summary UI + what-if comparison (charts, metrics, overlaid scenarios + diff table). |
| 3 | Strategy modules (RRSP meltdown, withdrawal sequencing, CPP/OAS timing) + estate projector. |
| 4 | Probabilistic analysis: Monte Carlo (probability of success + fan charts) + stress-test library, in a Web Worker. |
| 5 | Optimizers (CPP/OAS exact, withdrawal/strategy search, selectable objectives) + couple mode + pension income splitting. |
| 6 | Polish, a11y, multi-province, Vercel deploy, portfolio. |

Each phase must be runnable on localhost before starting the next. **Engine tests must pass before any related UI is built.**

## Architecture

The year-by-year projection loop (`/lib/projection`) is the core. Each year it calls:
1. `pension` → lifetime + bridge income (or zero past 65 for bridge)
2. `cpp` / `oas` → apply start-age adjustments and clawback
3. `accounts` → RRIF mandatory minimum, discretionary withdrawals, TFSA, non-reg
4. `tax` → federal + Ontario brackets, credits, pension splitting, OAS clawback
5. Returns a `YearRow` and updated account balances

A `Strategy` object drives discretionary decisions each year (meltdown pace, CPP/OAS start ages, withdrawal order). All modules are pure functions that feed this loop.

**The analysis layer composes runs.** One projection over one `ReturnPath` is the primitive; everything sophisticated is built by running it many times with different paths:
- **Deterministic / what-if** → one flat path
- **Stress test** → one named adverse path (early crash, low-return decade, high inflation, longevity shock)
- **Monte Carlo** → ~1,000 sampled paths → probability of success + percentile bands
- **Optimizer** → many runs searching strategy knobs, scored against an `Objective`

Consequence for implementation: keep the per-run loop **fast and allocation-light**, and have it take the path as input rather than reading assumptions internally. Use the seedable `rng` so any run reproduces and shares by URL.

Key types (from `docs/retirement-financial-planning-tool-plan.md.md` §12): `Household`, `Person`, `Strategy`, `YearRow`, `ScenarioResult`, `ReturnPath`, `SimulationConfig`, `MonteCarloResult`, `StressScenario`, `OptimizerRequest`.

## Constants rule — never inline

All rates, brackets, thresholds, and amounts are **2026 values that change yearly**. Store everything in a clearly dated, province-keyed config file (e.g., `/lib/config/2026.ts`). Show "tax rules as of \<year\>" in the UI. Never hardcode them inside functions.

## Federal-plan-only guardrail

**This tool models the federal PSPP only (Public Service Superannuation Act).** Do not pull rules from:
- BC's "Public Service Pension Plan" (pspp.pensionsbc.ca) — has a "rule of 85/90"; the **federal plan has NO rule of 85**
- Alberta's PSPP (pspp.ca), Nova Scotia PSSP, or any provincial plan
- MPs/Senators (3% accrual) or judges' pension

If a source isn't on canada.ca or a federal union (PSAC, PIPSC) explaining the *federal* plan, treat it as suspect.

## Domain quick-reference

### Federal pension (PSPP)
- **Group 1** (joined ≤ Dec 31 2012): unreduced at 60+2 yrs or 55+30 yrs; annual allowance from 50.
- **Group 2** (joined ≥ Jan 1 2013): unreduced at 65+2 yrs or 60+30 yrs; annual allowance from 55.
- **Formula:** `1.375% × (best-5 up to AMPE) × service(≤35)` + `2.0% × (best-5 above AMPE) × service(≤35)`
- **Bridge (to 65):** `0.625% × (best-5 up to AMPE) × service(≤35)` — identity: lifetime+bridge = `2.0% × best-5 × service`
- **AMPE 2026:** $69,180 (5-yr avg YMPE 2022–2026)
- **Service cap:** 35 years; contributions drop to 1% after; later salary still counts toward best-5
- **Indexing:** CPI annually on Jan 1; first year prorated by months since retirement; accrues from retirement but **not paid before age 55** (added at 55); index the components (lifetime and bridge) separately

### Early-retirement reduction (permanent)
- **Group 2 (F1, <25 yrs svc):** `5% × (65 − age)` | **Group 2 (F2, ≥25 yrs, 55–65):** greater of `5% × (60 − age)` or `5% × (30 − service)`; at 60+ take the lower of F1/F2
- **Group 1 (F1, <25 yrs svc):** `5% × (60 − age)` | **Group 1 (F2, ≥25 yrs):** greater of `5% × (55 − age)` or `5% × (30 − service)`
- Ages/service to nearest tenth of a year

### CPP
- Input = user's estimated CPP at 65 from Service Canada; don't recompute from contribution history
- Start age 60–70: −0.6%/mo before 65 (max −36%), +0.7%/mo after 65 (max +42%)
- 2026 max at 65: $1,507.65/mo

### OAS
- Start age 65–70: +0.6%/mo deferral (max +36%). 2026 max (65–74): $742.31/mo; +10% at 75
- **Clawback:** 15% of net income above threshold (~$95,323 for 2026 income year); **one-year lag** — the July–June payment period is driven by *prior* tax year's net income
- TFSA withdrawals are **excluded** from net income for clawback purposes — critical to the meltdown calculation

### RRIF
- Convert RRSP by Dec 31 of the year you turn 71; no minimum in the year opened
- Minimum = Jan 1 balance × age factor (table in `docs/retirement-tool-edge-cases-and-details.md.md` §5); pre-71 factor = `1/(90−age)`
- No withholding on the minimum; withholding only above it (10% / 20% / 30%)

### Tax (2026 Ontario — default province)
- **Federal:** 14% / 20.5% / 26% / 29% / 33% at $58,523 / $117,045 / $181,440 / $258,482 · BPA $16,452
- **Ontario:** 5.05% / 9.15% / 11.16% / 12.16% / 13.16% at $53,891 / $107,785 / $150,000 / $220,000 · **plus surtax** (20% of ON tax over $5,818, +36% over $7,446) · Ontario Health Premium up to $900
- **Credits:** pension income amount (federal $2,000, ON ~$1,796); age amount 65+ (federal max $9,208, reduced over ~$46,432); BPA
- **Pension income splitting:** PSPP pension qualifies at any age; RRIF income qualifies only at 65+; RRSP withdrawals never qualify

### RRSP meltdown
Each year: withdraw from RRSP/RRIF to fill the current bracket to the top (not beyond); guard against OAS clawback threshold; redirect unneeded withdrawals to TFSA. Coordinate with CPP/OAS deferral to widen the low-income window. Show meltdown vs. do-nothing: lifetime tax, OAS retained, RRIF trajectory, net worth, estate value (after terminal tax).

## Validation targets

1. Pension golden tests vs the official Basic Pension Calculator (canada.ca)
2. RRIF minimums match the factor table; tax matches hand-worked Ontario examples
3. OAS clawback matches canada.ca worked examples
4. Self-consistency checks: bridge identity holds; no reduction at unreduced-eligibility threshold; meltdown never overshoots a bracket; TFSA never adds to taxable income
5. Dad's end-to-end scenario validation (human ground truth)

# Competitive analysis — Optiml & Conquest Planning vs. The Retirement Almanac

**Purpose:** cross-reference the features of the two reference products (Optiml, Conquest Planning) against
this tool, find where we already match them, where we have gaps, and where we can decisively exceed them.
Optiml is the primary benchmark (Dad uses it and likes it). Researched 2026-06-17.

**Sources:** [optiml.ca](https://www.optiml.ca/) · [optiml.ca/features](https://www.optiml.ca/features/) ·
[optiml.ca/how-it-works](https://www.optiml.ca/how-it-works/) ·
[independent review (moneyengineer.ca)](https://moneyengineer.ca/2025/07/14/mini-review-optiml-ca/) ·
[conquestplanning.com/en-ca](https://conquestplanning.com/en-ca).

---

## 1. Optiml — feature inventory

- **Accounts:** RRSP, TFSA, Non-registered, **FHSA**, **LIRA/LIF**, **CCPC (corporate)**; CPP, OAS, DB pensions. Wealthica account-sync integration.
- **Withdrawal optimizer:** a tax-efficient *withdrawal order across all accounts, year by year* (not a generic rule).
- **RRSP meltdown:** conservative / moderate / aggressive / custom.
- **OAS Clawback Reducer.**
- **CPP/OAS optimizer:** tests *every* benefit start-age pair against the chosen goal.
- **Goal-based optimization (6–7 goals):** max after-tax estate · min lifetime tax · max retirement spending · estate target · RRSP-meltdown · OAS-clawback reduction · custom.
- **Couples:** pension income splitting; keep both partners under the OAS clawback threshold.
- **Estate projector:** after-tax estate value.
- **Success Score:** stress-tested against ~50 scenarios (downturns, inflation).
- **Plan comparison:** side-by-side; save/manage up to 20 plans.
- **Unlimited real-time what-if:** retirement age, spending, home decisions, returns, life expectancy.
- **Variable retirement spending — "go-go / slow-go / no-go" phases** (spend more early, taper with age).
- **Auto-generate scenarios from historical returns** (real market-sequence backtests).
- **EVA** AI assistant; downloadable plans.
- **Legacy tier:** trust planning, HoldCo/OpCo for business owners.
- Pricing: **$99 / $249 / $499 per year** (14-day trial). SaaS, account-based.

## 2. Conquest Planning — feature inventory

- **Strategic Advice Manager (SAM):** a *deterministic, auditable* engine that surfaces the "next best financial decision." Advisor/enterprise-focused, compliance-first, audit trails.
- Goal-based planning across the wealth continuum; rapid plan creation; Monte Carlo; firm analytics; two-way API.
- Aimed at **advisors**, not consumers (B2B).

---

## 3. Parity matrix — Optiml feature → our status

| Optiml feature | The Retirement Almanac |
|---|---|
| Tax-efficient withdrawal order (year by year) | ✅ `lib/strategy` withdrawal sequencing + meltdown bracket-fill |
| RRSP meltdown (conservative→aggressive) | ✅ `Scenario.meltdown` modes + OAS guard + RRSP→TFSA pipeline |
| OAS Clawback Reducer | ✅ meltdown OAS guard; clawback modelled with the one-year lag |
| CPP/OAS optimizer (every start age) | ✅ `cppOasOptimizer` — exact 60–70 × 65–70 enumeration |
| Goal-based optimization (6–7 goals) | ✅ 6 objectives in `lib/optimize` (+ strategy knob search) |
| Pension income splitting (couples) | ✅ `householdTaxWithSplitting` (RPP any age, RRIF 65+) |
| Estate projector (after-tax) | ✅ `lib/estate` terminal tax, spousal rollover, first/second death |
| Success Score / stress | ✅ Monte Carlo probability-of-success + named stress library |
| Plan comparison (side by side) | ✅ what-if snapshots + diff table + overlay charts |
| Real-time what-if | ✅ instant recompute on every input change |
| "Next best decision" (Conquest SAM) | ✅ deterministic insights engine (dollar-quantified recommendations) |
| **Variable spending phases (go-go/slow-go/no-go)** | ⛔ **GAP → building now** |
| **LIRA / LIF (locked-in, PSPP transfer value)** | ✅ **BUILT** — locked-in account that pays the federal LIF mandatory minimum, taxed + estate-counted as registered (Optiml doesn't even list LIRA on its public features) |
| **FHSA / RESP / RDSP / corporate accounts** | ⛔ **GAP** (we model RRSP/TFSA/Non-reg/LIRA) |
| **Historical-returns scenario backtests** | ✅ **BUILT** — replays the plan over every dated window of the S&P 500 total-return record since 1926, recentered/rescaled to the plan's own return & volatility (real sequence-of-returns risk), surfaced as a "retire-in-year" filmstrip + worst-start-year + estate distribution |
| **Principal residence + downsizing ("home decisions")** | ✅ **BUILT** — the home appreciates on its own track, is reported separately from liquid net worth, passes to the estate TAX-FREE (principal-residence exemption — no deemed-disposition gain at death), and an optional downsize/sell event frees a share of the equity into savings the drawdown can spend. Optiml lists "home decisions"; we model the tax nuance exactly |
| Save/manage many named plans | ◑ URL-encoded share + in-session snapshots (no persisted library yet) |
| Download/export plan (PDF/CSV) | ◑ print-friendly + shareable URL (no file export yet) |
| Account-sync integration (Wealthica) | ✕ out of scope by design (privacy: nothing leaves the browser) |
| AI assistant (EVA) | ✕ out of scope by design |

## 4. Where we already EXCEED them

- **Federal PSPP done *exactly* right** — Optiml/Conquest are generic. We model the bridge benefit + its 65 step-down, Group 1/2 eligibility and reductions, the ERI/WFA waiver, the TSM lump sum, and the PSPP survivor allowance. This is the differentiator for federal public servants.
- **Free.** Optiml is $99–$499/yr.
- **Fully private / client-side.** No account, no data leaves the device — Optiml is account-based SaaS.
- **CPI-indexed tax brackets** in the projection (removes bracket-creep overstatement many tools carry).

## 5. Roadmap — close the gaps, in priority order

1. **Variable spending phases (go-go / slow-go / no-go)** — the marquee gap and a realistic model (retirees spend ~100% to ~75, then taper 20–30%). Highest impact, clean engine change. **← building now.**
2. ~~**LIRA / LIF accounts**~~ — **DONE (complete).** Locked-in account from a PSPP transfer value: pays the federal LIF mandatory minimum (RRIF factor), can be tapped for spending **up to the federal LIF maximum** (the rest stays locked and grows), taxed + estate-counted as registered, with the federal **one-time 50% unlock** to RRSP at retirement (55+). The full locked-in lifecycle — something Optiml doesn't surface at all.
3. ~~**Historical-returns scenarios**~~ — **DONE.** Replays the plan over every dated window of the S&P 500 total-return record (1926–2024), recentering/rescaling each real sequence to the plan's own return & volatility — so history's *timing* (the clustering of crashes, sequence-of-returns risk) drives the result while the plan's own risk/return sets the magnitude. Aggregates the success rate across every start year, the worst year to retire into, and the estate distribution, surfaced as a "retire-in-year" filmstrip. Goes beyond Optiml's parametric stress: this is the real 1973/2000/2008 sequence, not an i.i.d. caricature.
4. ~~**FHSA / RESP / corporate (CCPC)**~~ → **Principal residence + downsizing — DONE.** The home was the real omission for this audience: usually the largest asset, it persists through retirement, and downsizing is a genuine decumulation lever (Optiml models "home decisions"). It appreciates on its own track, passes to the estate TAX-FREE (principal-residence exemption — no deemed-disposition gain at death), and an optional sell/downsize event at a chosen age frees a share of the equity into non-registered savings the drawdown can spend. FHSA/RESP/CCPC are deprioritized as poor fits for a *from-retirement* tool: they're accumulation/off-audience vehicles — by the time the projection starts, an FHSA has rolled into the RRSP and an RESP has been spent on tuition; CCPC investing is for business owners, not salaried federal public servants. (Also fixed in passing: locked-in LIRA/LIF balances are now correctly included in the projection's terminal-tax estate, matching the estate panel.)
5. **Persisted named-plan library + PDF/CSV export** — match "save 20 plans / download".
6. **Cash-wedge / bucket** strategy option.

The bar: match Optiml's optimization depth (largely done), then win on PSPP accuracy, price (free), and privacy.

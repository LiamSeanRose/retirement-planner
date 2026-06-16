# Retirement Financial Planning Tool — Project & Build Plan (v2, expanded scope)

**Working title:** Federal Retirement Planner (Liam + Dad to name it)
**Status:** Planning. Source of truth for Claude Code. Free to change — no PRs, no gates. If a better approach appears mid-build, update this doc and keep moving.
**Supersedes:** v1 (pension-only early-retirement calculator). Scope is now a complete retirement financial-planning tool.
**Last researched:** June 16, 2026 — pension, CPP/OAS, RRIF, tax, and RRSP-meltdown rules verified against current sources (see References). All dollar figures and rates are *dated defaults to re-verify yearly*, not permanent constants.

---

## 1. Vision

A free web tool that gives a Canadian public servant a **complete, year-by-year retirement financial picture** and lets them compare and optimize strategies. Not just "what's my pension" — the whole income, tax, and savings trajectory through retirement, with the levers a real decision turns on.

Why now: many public servants are actively weighing early retirement, and the official tools only estimate the pension in isolation. This tool models the **full picture**:
- Federal pension (lifetime + bridge), CPP, OAS — with timing choices
- RRSP/RRIF, TFSA, and non-registered accounts projected over time
- Annual tax (federal + provincial), credits, pension income splitting, OAS clawback
- Tax-reduction strategies, including the **RRSP meltdown**
- A clear financial summary and side-by-side scenario comparison

It's a good-will tool for public servants and a portfolio piece showing Liam can ship a genuinely sophisticated, useful product.

---

## 2. Working model

- **Liam** — engineering + owner of the build. Solo developer.
- **Dad** — domain expert, requirements owner, and continuous validator. He defines real use cases, what "optimize" means, and confirms the numbers. His validation is ongoing.
- **No PRs / no feature branches.** Commit directly to the working branch. Plan changes freely.
- Optional public GitHub Issues list as Dad's plain-language backlog — also good visible process for the portfolio.

---

## 3. The heart of the tool: a year-by-year projection engine

Everything hangs off one core: a **deterministic annual simulation** from retirement to an assumed end age (default ~95). For each year it computes:

1. **Income sources:** pension (lifetime + bridge to 65), CPP, OAS, RRIF mandatory + discretionary withdrawals, TFSA withdrawals, non-registered income.
2. **Account balances:** RRSP/RRIF, TFSA, non-registered — each grown by an assumed return, reduced by withdrawals, increased by contributions/redirected funds.
3. **Tax:** federal + provincial tax on taxable income, credits, pension splitting, OAS clawback, with after-tax income as the bottom line.
4. **Net worth** across all accounts.

A **strategy** (meltdown pace, CPP/OAS start ages, withdrawal order) drives the discretionary decisions each year. The pension/CPP/OAS/tax modules are pure functions feeding this loop. Build the loop clean and everything else plugs in.

---

## 4. Domain spec A — Federal pension (PSPP)

> Get this exactly right; it's the anchor. Group is fixed by plan-join date.

### Groups & unreduced eligibility
- **Group 1** (joined ≤ Dec 31, 2012): normal age **60**. Unreduced at 60 + 2 yrs service, or 55 + 30 yrs. Annual allowance from 50.
- **Group 2** (joined ≥ Jan 1, 2013): normal age **65**. Unreduced at 65 + 2 yrs, or 60 + 30 yrs. Annual allowance from 55.
- Edge case: a Group 1 member who took a return of contributions / transfer value / portability transfer and is re-employed on/after Jan 1, 2013 becomes Group 2. Ask join date + offer explicit group override.

### Lifetime pension (annual), coordinated with CPP
```
lifetime = 1.375% × (avg salary up to AMPE)       × service(≤35)
         + 2.0%   × (avg salary above AMPE)        × service(≤35)
```
- **Avg salary** = best 5 consecutive years.
- **AMPE** = 5-yr average of the CPP YMPE for the retirement year (dated config). *Worked example, 2026 retirement:* the YMPEs for 2022–2026 are $64,900 / $66,600 / $68,500 / $71,300 / $74,600, averaging **$69,180** — that's the 2026 AMPE, the salary breakpoint between the 1.375% and 2% tiers.
- 1.375% applies for reaching 65 in 2012+ (born 1947+); legacy birth-year table 1.30–1.36% otherwise.
- Service capped 35 yrs; part-time pro-rated.

### Bridge benefit (before 65 only)
```
bridge = 0.625% × (avg salary up to AMPE) × service(≤35)
```
Paid from retirement until the month after 65 (or earlier CPP/QPP disability); stops at 65 regardless of when CPP actually starts. Legacy table 0.64–0.70% for pre-1947.

**Identity for the UI:** before 65, lifetime + bridge = **2.0% × best-5 salary × service**. At 65 the bridge ends and income steps down to the lifetime pension — a step the official tools communicate poorly and a key thing to visualize.

### Early-retirement reduction (annual allowance) — permanent
- **Group 2:** F1 (service <25): `5% × (65 − age)`, age floored at 55 if terminating earlier. F2 (service ≥25, age 55–65): greater of `5% × (60 − age)` or `5% × (30 − service)`. At 60+ with ≥25 yrs, take the lower of F1/F2.
- **Group 1:** F1 (service <25): `5% × (60 − age)`. F2 (service ≥25, age 50–60): greater of `5% × (55 − age)` or `5% × (30 − service)`. At 55+ with ≥25 yrs, take the lower.
- Ages/service to nearest tenth of a year. Reduction applies to the whole pre-65 pension.

> ⚠️ Verify: Group 2 formulas confirmed verbatim from the official page; Group 1 Formula 2 confirmed, Formula 1 anchor (60) inferred — confirm with Dad / official calculator before shipping that path.

### Indexing
Annual CPI indexing (Supplementary Retirement Benefits Act). Model as a configurable annual rate (default ~2%, user-adjustable, clearly an assumption).

---

## 5. Domain spec B — CPP & OAS

### CPP
- Start age **60–70**. Before 65: **−0.6%/month** (max −36% at 60). After 65: **+0.7%/month** (max +42% at 70).
- 2026 max at 65: **$1,507.65/mo**; average new ~$925/mo. Take the user's *estimated CPP at 65* as input (from their Service Canada statement) — don't reconstruct from contribution history.
- Indexed annually (Jan, CPI).

### OAS
- Starts **65**, deferrable to **70** at **+0.6%/month** (max +36%). 2026 max (65–74) **$742.31/mo**; +10% at 75.
- **Clawback (recovery tax):** 15% of net income above the annual threshold; threshold ~**$93,454** (2025 income year) rising to ~**$95,323** (2026 income year), fully eliminated ~**$148k–$155k** (65–74). Note the **one-year lag**: the clawback on this July–June payment period is driven by the *prior* tax year's net income — model it that way, not on same-year income. TFSA withdrawals don't count toward the threshold (key for the meltdown). Verify the exact threshold against canada.ca each year.
- Indexed quarterly.

Rough break-even: CPP ~age 73–74, OAS ~82–83. Surface break-even per scenario — high value, low complexity.

---

## 6. Domain spec C — Accounts (RRSP/RRIF, TFSA, non-registered)

### RRSP → RRIF
- RRSP must convert to a RRIF (or annuity) by **Dec 31 of the year you turn 71**.
- RRIF: a mandatory minimum must be withdrawn each year = (Jan 1 balance) × (age factor). No minimum the year the RRIF is opened. Minimum is fully taxable; **no withholding on the minimum**, but withholding applies above it (10% to $5k over, 20% $5–15k over, 30% beyond — prepayment, not extra tax).
- **Younger-spouse election** can use the spouse's age for a lower factor (set at RRIF setup).

### RRIF minimum withdrawal factors (2026, post-1992 RRIFs; under 71 = 1/(90−age))
| Age | % | Age | % | Age | % |
|----|----|----|----|----|----|
| 55 | 2.86 | 71 | 5.28 | 84 | 8.08 |
| 60 | 3.33 | 72 | 5.40 | 85 | 8.51 |
| 65 | 4.00 | 73 | 5.53 | 88 | 10.21 |
| 66 | 4.17 | 74 | 5.67 | 89 | 10.99 |
| 67 | 4.35 | 75 | 5.82 | 90 | 11.92 |
| 68 | 4.55 | 76 | 5.98 | 91 | 13.06 |
| 69 | 4.76 | 80 | 6.82 | 92 | 14.49 |
| 70 | 5.00 | 82 | 7.38 | 95+ | 20.00 |
(Store the full 55–95+ table as dated config.)

### TFSA
- Withdrawals are **tax-free** and **do not count** toward net income → don't trigger OAS clawback. This makes the TFSA the destination for the "RRSP-to-TFSA pipeline" (see §8). Track annual contribution room (dated config) if modelling contributions.

### Non-registered
- Taxed as earned, by income type: **interest** at full marginal rate; **eligible dividends** grossed up 38% with the dividend tax credit (so the effective rate is much lower than interest); **capital gains** at the **50% inclusion rate** on realization (confirmed current — the proposed 66.67% increase was cancelled in March 2025, so 50% stands for 2026). Only realized gains are taxed, which is itself a planning lever.
- v1 may simplify (e.g., a blended taxable return) and refine toward the per-type treatment later; the inclusion/gross-up rates above are the targets.

---

## 7. Domain spec D — Tax engine

Per year, on taxable income (build it to mirror a real return, not a flat rate):

- **Federal brackets (2026):** 14% to $58,523 · 20.5% to $117,045 · 26% to $181,440 · 29% to $258,482 · 33% above.
- **Ontario brackets (2026):** 5.05% to $53,891 · 9.15% to $107,785 · 11.16% to $150,000 · 12.16% to $220,000 · 13.16% above — **plus the Ontario surtax** (20% of Ontario tax over $5,818, +36% over $7,446) and the **Ontario Health Premium** (up to $900, income-tested). The surtax is applied to provincial tax, not income — easy to miss, materially changes effective rates for retirees with decent pensions.
- Default province **Ontario** (Liam/Dad are in ON); make province a parameter and store full bracket + surtax tables per province, dated.
- **Credits to model:** federal basic personal amount ($16,452, 2026) and the Ontario BPA; **age amount** (65+, federal max $9,208 in 2026, reduced once net income exceeds ~$46,432); **pension income amount** (federal $2,000 → ~$300 credit; Ontario ~$1,796) on eligible pension income — the PSPP pension and (at 65+) RRIF income qualify; the dividend tax credit on non-registered dividends.
- **Pension income splitting:** up to **50%** of eligible pension income may be allocated to a spouse. The PSPP lifetime pension qualifies; **RRIF income qualifies only at 65+** (plain RRSP withdrawals never qualify) — a concrete reason to convert some RRSP to RRIF at 65. Needs a spouse model (couple mode) — Phase 4; single mode first.
- **OAS clawback** folds in here (recovery tax on prior-year net income; see §5).

Tax constants are the most volatile inputs in the tool — keep them in clearly dated, province-keyed config and show "tax rules as of \<year\>" in the UI. See the Appendix for the consolidated 2026 constant set.

---

## 8. Strategy modules

### RRSP meltdown (Dad called this out specifically)
**Concept:** the default path (leave RRSP untouched, convert at 71, large forced RRIF minimums from 72) stacks on top of CPP/OAS and creates a "tax bomb" in the 70s — high brackets + OAS clawback + a big terminal tax hit at death. The meltdown instead **deliberately withdraws from the RRSP/RRIF earlier**, during the low-income window (often retirement-to-CPP/OAS-start in the 60s), when the marginal rate is lowest.

**Mechanics to implement:**
- Each year, withdraw enough to **fill the current tax bracket to the top — not beyond** (overshooting into a higher bracket kills the benefit).
- **OAS guard:** cap withdrawal targets at the clawback threshold (unless base income already exceeds it).
- The low-income window is widened by **delaying CPP/OAS** — so the meltdown is coordinated with §5 timing, not independent of it.
- Redirect withdrawn-but-unneeded funds into the **TFSA** (the "RRSP-to-TFSA pipeline") — future tax-free growth that never counts toward clawback.
- Offer pace presets (conservative / moderate / aggressive) + custom start age.
- Best-fit signal: larger RRSP (~$400k+), retiring before 65 with an income gap before CPP/OAS. Typical modelled lifetime tax savings cited at $80k–$150k for large balances.

**Output:** show the meltdown plan vs the do-nothing default — lifetime tax, OAS retained, RRIF-minimum trajectory, net worth, and estate value at end age.

### CPP/OAS timing
Compare start-age choices on lifetime income, break-even age, and how they interact with the meltdown window.

### Withdrawal sequencing
Which account to draw from each year (non-reg → RRSP/RRIF → TFSA, or a tax-optimized mix) to fund a target spending level.

---

## 9. Outputs — the financial summary

- **Income-over-time chart:** stacked annual income by source, retirement → end age, showing the 65 bridge step-down and CPP/OAS switch-on.
- **Net-worth / account-balance chart** over time.
- **Tax & OAS chart:** annual tax paid and OAS clawed back.
- **Summary metrics:** income at 60/65/70, total lifetime after-tax income, total lifetime tax, OAS retained vs clawed back, estate value at end age, sustainability (does money last to end age?).
- **Scenario comparison:** 2–4 full strategies overlaid on every chart + a metrics table.

---

## 10. Optimization (resolve §17 questions with Dad first)

Given an objective, search over the levers (retirement date, CPP start, OAS start, meltdown pace, withdrawal order) for the best plan. Candidate objectives: max lifetime after-tax income; max estate value; earliest retirement that sustains a target spend to end age; minimize lifetime tax; smoothest after-tax income. Offer 2–3 selectable objectives with a clear statement of the assumptions (life expectancy, returns, inflation) each result depends on.

---

## 11. Architecture & stack

- **Next.js + TypeScript on Vercel.** Matches Liam's stack and the portfolio.
- **Pure client-side computation. No backend, no DB, no accounts in v1.** Everything runs in the browser; salary/savings data never leaves the device. Even with the full tax/strategy engine this is feasible (it's all deterministic math) and it's the single best privacy decision — and a statable trust feature.
- **Engine = isolated, dependency-free TypeScript** under `/lib`: `pension`, `cpp`, `oas`, `accounts` (RRIF/TFSA/non-reg), `tax` (province-keyed), `strategy` (meltdown, sequencing, timing), `projection` (the year loop), `optimize`. Pure functions, fully unit-testable, no React/IO.
- **State:** React + URL-encoded scenarios for share/restore. No localStorage/sessionStorage if any part is ever embedded in an Artifact preview; as a standalone Vercel app, normal storage is fine for later save features.
- **Charts:** Recharts or similar.
- **Design:** read and follow the `frontend-design` skill before UI work. Portfolio piece — deliberate visual identity grounded in the subject (trustworthy, considered Canadian public-service financial planning), intentional type pairing, one signature element (the multi-scenario income chart) carrying the page; everything else quiet. Quality floor: responsive, visible focus, reduced-motion respected.

---

## 12. Data model (starting types)

```ts
type Group = 1 | 2;
type Province = 'ON' | 'QC' | 'BC' | /* ... */ string;

interface Household {
  province: Province;
  primary: Person;
  spouse?: Person;            // enables splitting / couple mode (later)
}
interface Person {
  birthDate: string;
  planJoinDate: string;       // -> group
  group?: Group;
  bestFiveAvgSalary: number;
  pensionableServiceYears: number;
  estimatedCppAt65Monthly: number;
  oasEligible: boolean;
  accounts: { rrsp: number; tfsa: number; nonReg: number };
}
interface Strategy {
  retirementDate: string;
  cppStartAge: number;        // 60..70
  oasStartAge: number;        // 65..70
  meltdown: { mode: 'none'|'conservative'|'moderate'|'aggressive'|'custom'; startAge?: number };
  withdrawalOrder?: ('nonReg'|'rrsp'|'tfsa')[];
  assumptions: { returnPct: number; inflationPct: number; indexingPct: number; endAge: number };
}
interface YearRow {
  age: number;
  pension: number; bridge: number; cpp: number; oas: number;
  rrifMin: number; rrifExtra: number; tfsaWd: number; nonRegInc: number;
  taxableIncome: number; tax: number; oasClawback: number; afterTax: number;
  balances: { rrsp: number; tfsa: number; nonReg: number };
  netWorth: number;
}
interface ScenarioResult {
  strategy: Strategy;
  reductionPct: number;
  rows: YearRow[];
  totals: { lifetimeAfterTax: number; lifetimeTax: number; oasRetained: number; estateValue: number; lastsToEndAge: boolean };
  cppBreakEvenAge?: number; oasBreakEvenAge?: number;
}
```

---

## 13. Validation strategy

1. **Pension golden tests** vs the official Basic Pension Calculator — varied salary/service/group/age; assert match within tolerance.
2. **RRIF/tax checks:** RRIF minimums match the factor table; tax matches hand-worked Ontario examples at a few income levels; OAS clawback matches worked examples.
3. **Self-consistency:** the §4 bridge identity; no reduction at unreduced-eligibility points; meltdown never overshoots a bracket; TFSA never adds to taxable income.
4. **Dad's validation:** realistic end-to-end scenarios he sanity-checks against domain knowledge / official estimates. Human ground truth backstops the automated tests.
5. **Date-stamp constants** and show "rules current as of \<date\>" in-app.

The engine is built and tested **before** UI.

---

## 14. Build phases (sequenced for Claude Code)

- **Phase 0 — Pension engine + tests.** `/lib/pension` + CPP/OAS, golden tests green. No UI.
- **Phase 1 — Projection loop + accounts + tax (single, Ontario, single person).** The year-by-year engine with RRIF/TFSA/non-reg and the tax module. Tests against worked examples. Minimal UI to drive it.
- **Phase 2 — Financial summary UI + scenario comparison.** Charts (income/net worth/tax), metrics, 2–4 overlaid scenarios. Localhost-first.
- **Phase 3 — Strategy modules.** RRSP meltdown (with OAS guard + TFSA pipeline), withdrawal sequencing, CPP/OAS timing comparison.
- **Phase 4 — Optimize mode** (after Dad answers §17) + couple mode / pension splitting.
- **Phase 5 — Polish + deploy.** `frontend-design` pass, disclaimers, mobile, a11y, multi-province tax, Vercel deploy, add to portfolio.

Each phase ends runnable on localhost.

---

## 15. How Claude Code should work

- **Use skills proactively.** Read `frontend-design` before UI; scan available skills for anything that speeds the work and treat skill discovery as a default step, not an afterthought.
- **Maintain `CLAUDE.md`** at repo root: stack, condensed §4–§8 domain rules, working model (commit-direct, no PRs), conventions, pointer to this plan. Keep it current.
- **Test-first for the engine.** No UI before the relevant engine tests pass.
- **Commit directly to the working branch.** No PRs/feature branches unless Liam asks.
- **No AI authorship attribution anywhere** — commits, comments, README, docs.
- **Localhost-first, incremental.** Small runnable steps.
- **Constants in dated, province-keyed config** — never inline magic numbers for rates/brackets/thresholds.

---

## 16. Accuracy, disclaimers, privacy

- This now models tax strategy and drawdown sequencing, which sits **close to financial advice** — so a prominent, persistent disclaimer is mandatory: **estimates and educational projections only; not financial, tax, or legal advice; confirm with the Pension Centre and a qualified advisor before acting.** Show "rules current as of \<date\>."
- **No PII leaves the browser** (client-side architecture enforces it) — state it plainly; it's honest and a feature.
- Every projection rests on assumptions (returns, inflation, life expectancy, future tax rules). Make assumptions visible and adjustable, and never present a single number as a guarantee.

---

## 17. Assumptions to confirm with Dad (rolling)

1. Specific use cases / personas of public servants weighing early retirement right now (shapes what the summary leads with).
2. v1 = single person, Ontario, gross-then-tax; couple mode / pension splitting / multi-province come later — OK?
3. The §10 optimization objectives.
4. Default assumptions: return rate, inflation, indexing, end age.
5. How much investment-projection sophistication (straight-line vs Monte Carlo) is wanted, and when.
6. Whether estate value / terminal tax is a headline metric (it matters a lot for the meltdown story).
7. Public-service-specific items to scope (not yet deep-researched — flag for a later research pass): **severance / retirement allowance / unused vacation payout** as lump-sum income events at retirement; **PSHCP retiree health/dental** premium costs in retirement; the **PSPP survivor pension** (and supplementary death benefit) for couple/estate modelling. Confirm which of these Dad wants in scope and when.

---

## References (verified June 16, 2026)

- PSPP formula, bridge, reductions (Group 2): canada.ca/en/public-services-procurement/.../member-on-after-january-1-2013.html
- PSPP Group 1 reductions: .../member-on-before-december-31-2012.html
- Group 1/2 eligibility & 2024 expansion (TBS backgrounder): canada.ca/en/treasury-board-secretariat/news/2024/06/expanded-early-retirement-eligibility...
- Official Basic Pension Calculator (validation ground truth): canada.ca/en/treasury-board-secretariat/services/pension-plan/pension-tools.html
- RRIF minimum withdrawal factor table: td.com RRIF minimum payment schedule (cross-checked vs multiple 2026 sources)
- RRSP meltdown strategy mechanics: Questrade, Wealthsimple, Optiml, RetireZest, Cardinal Point (2026)
- CPP/OAS amounts, clawback, RRIF withholding, pension splitting: current 2026 sources
- Registered plan limits, YMPE/YAMPE: CRA "MP, DB, RRSP, DPSP, ALDA, TFSA limits, YMPE and YAMPE" page
- 2026 tax brackets/credits: EY 2026 Ontario tax rates, TaxTips.ca, Manulife 2026 rate card
- Capital gains inclusion rate (50%, hike cancelled Mar 2025): canada.ca / multiple advisory sources

*All dollar figures, tax brackets, contribution limits, CPP/OAS amounts, and clawback thresholds are present-day values that change yearly. Treat them as dated defaults to confirm — not permanent constants. Federal pension formula constants (AMPE, accrual factors) are set by the plan/CPP and likewise refreshed annually.*

---

## Appendix — consolidated 2026 constants (dated; re-verify each year)

Seed the engine's config from this. Every value is for 2026 and indexed/legislated annually.

**Pension (PSPP)**
- Accrual: 1.375% (up to AMPE) + 2.0% (above AMPE), × service ≤ 35 yrs · Bridge: 0.625% (up to AMPE)
- AMPE 2026 = $69,180 (5-yr avg YMPE 2022–2026) · YMPE 2026 = $74,600 · YAMPE 2026 = $85,000
- Early-retirement reduction: 5% per year short (see §4 for the F1/F2 logic per group)
- Indexing default: ~2% CPI (assumption, user-adjustable)

**CPP** — start 60–70 · −0.6%/mo before 65 (max −36%) · +0.7%/mo after 65 (max +42%) · 2026 max @65 $1,507.65/mo · avg new ~$925/mo

**OAS** — start 65–70 · +0.6%/mo deferral (max +36%) · 2026 max (65–74) $742.31/mo · +10% at 75 · clawback 15% over ~$93,454 (2025 income yr) / ~$95,323 (2026 income yr), gone ~$148k–$155k · prior-year-income lag

**Accounts**
- RRSP → RRIF by Dec 31 of the year you turn 71 · RRIF min = Jan 1 balance × age factor (table in §6) · withholding above the min only (10/20/30%)
- TFSA 2026 annual $7,000 · cumulative $109,000 (since 2009) · withdrawals tax-free, excluded from net income
- RRSP dollar limit 2026 $33,810 (or 18% of prior-year earned income, less PA)

**Tax — federal 2026:** 14% / 20.5% / 26% / 29% / 33% at $58,523 / $117,045 / $181,440 / $258,482 · BPA $16,452 · age amount (65+) max $9,208, reduced over ~$46,432 · pension income amount $2,000

**Tax — Ontario 2026:** 5.05% / 9.15% / 11.16% / 12.16% / 13.16% at $53,891 / $107,785 / $150,000 / $220,000 · surtax 20% over $5,818 ON tax, +36% over $7,446 · Ontario Health Premium up to $900 · pension income amount ~$1,796

**Investments** — capital gains inclusion 50% · eligible-dividend gross-up 38% + dividend tax credit · interest fully taxable

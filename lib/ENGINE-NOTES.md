# Engine accuracy notes — dated assumptions, sources, and known simplifications

Rules current as of **2026** (config stamp `2026-06-16`). **Every figure below is a 2026 value that is
indexed/legislated annually — re-verify each year** against canada.ca / PSPC / CRA / Service Canada /
the province. This is the document to validate the engine against. Constants live only in
`lib/config/*` (never inlined in functions).

Verification legend: **[V]** verified for 2026 · **[~]** best-effort, pending confirmation · **[!]** inferred / flagged.

---

## 1. Federal pension — PSPP (`lib/config/2026.ts`, `lib/pension`)

FEDERAL Public Service Pension Plan only (PSSA). **There is NO rule of 85** — unreduced eligibility is
age-and-service thresholds. Do not import rules from BC PSPP / Alberta PSPP / NS PSSP.

| Constant | 2026 value | Status | Source |
|---|---|---|---|
| Accrual up to AMPE | 1.375% | [V] | canada.ca PSPP formula |
| Accrual above AMPE | 2.00% | [V] | canada.ca PSPP formula |
| Bridge accrual (to 65) | 0.625% | [V] | canada.ca PSPP |
| AMPE (5-yr avg YMPE) | $69,180 | [V] | YMPE 2022–26: 64,900 / 66,600 / 68,500 / 71,300 / 74,600 |
| YMPE / YAMPE | $74,600 / $85,000 | [V] | CRA |
| Service cap | 35 yrs | [V] | PSSA |
| Early-retirement reduction | 5% per year short | [V] | canada.ca |
| Default CPI indexing | 2.0% (user-adjustable) | [~] | assumption |

- Groups: Group 1 joined ≤ 2012-12-31 (unreduced 60+2 or 55+30); Group 2 joined ≥ 2013-01-01
  (unreduced 65+2 or 60+30). Override available for the re-employment edge case.
- **[!] Group 1 Formula-1 reduction anchor (age 60)** is inferred from age-60 normal retirement —
  confirm against the official Group 1 page / calculator before shipping that path.
- Golden tests: `lib/pension/pension-golden.test.ts` (six documented cases vs the PSSA formula; re-checkable
  on the official Basic Pension Calculator).

## 2. CPP (`lib/config/2026.ts`, `lib/cpp`)

CPP is **taken as input** (the member's Service Canada estimate at 65) — not recomputed from earnings.

| Constant | 2026 value | Status |
|---|---|---|
| Start window | 60–70 | [V] |
| Reduction before 65 | −0.6% / month (max −36% at 60) | [V] |
| Increase after 65 | +0.7% / month (max +42% at 70) | [V] |
| Max monthly @ 65 (reference only) | $1,507.65 | [V] |

- **Simplification:** CPP is held at its start-age nominal amount across the projection (year-over-year
  CPI indexing of CPP is not modelled). Real CPP indexes to CPI annually.

## 3. OAS (`lib/config/2026.ts`, `lib/oas`)

| Constant | 2026 value | Status |
|---|---|---|
| Start age (deferrable to 70) | 65 | [V] |
| Deferral increase | +0.6% / month (max +36% at 70) | [V] |
| Max monthly, ages 65–74 | $742.31 | [V] |
| Age-75+ bump | +10% | [V] |
| Clawback (recovery-tax) rate | 15% | [V] |
| Clawback threshold (income year) | 2025: $93,454 · 2026: $95,323 | [V] |

- Clawback runs off the **prior** year's net income (one-year lag); **TFSA withdrawals are excluded**
  from the income base. For projection years past the configured thresholds, the latest threshold is
  indexed forward by inflation so the clawback never errors.
- **Simplification:** OAS held at start-age nominal (no year-over-year CPI indexing in the projection).

## 4. Accounts — RRSP/RRIF, TFSA, non-registered (`lib/config`, `lib/accounts`)

- RRSP → RRIF by the end of the year the holder turns 71; **the projection fixes conversion at age 71**
  (no earlier-conversion lever). RRIF minimum = Jan-1 balance × age factor; **no minimum the opening
  year**; under-71 factor = 1/(90 − age); 95+ capped at 20%. Factor table in `lib/config/rrif-factors`. [V]
- TFSA withdrawals are tax-free and excluded from net income. [V]
- Non-registered taxation uses **planning assumptions** (not tracked ACB): 50% of a withdrawal is
  realized capital gain (50% inclusion); ~1% interest and ~2% eligible-dividend yields annually. [~]
- Capital-gains inclusion rate 50% (the proposed 66.67% hike was cancelled March 2025). [V]

## 5. Income tax (`lib/config/tax-2026.ts`, `lib/tax`)

**Federal [V]** — brackets 14 / 20.5 / 26 / 29 / 33% at $58,523 / $117,045 / $181,440 / $258,482;
credits valued at the lowest rate (14%, cut from 15% by Budget 2025). Enhanced BPA $16,452 grinding
linearly to $14,538 across the 29%→33% band ($181,440→$258,482). Age amount max $9,208 (phase-out from
$46,432 at 15%); pension income amount $2,000.

**Ontario [V]** — brackets 5.05 / 9.15 / 11.16 / 12.16 / 13.16% at $53,891 / $107,785 / $150,000 /
$220,000; BPA $12,747 [~ confirm], age amount $6,054 [~ confirm], pension amount $1,796; **surtax** 20%
of ON tax over $5,818 + 36% over $7,446; **Ontario Health Premium** up to $900.

**British Columbia [V 2026]** — 5.60 / 7.70 / 10.50 / 12.29 / 14.70 / 16.80 / 20.50% at $50,363 /
$100,728 / $115,648 / $140,430 / $190,405 / $265,545; BPA $13,216. *BC raised its lowest rate to 5.60%
for 2026 (was 5.06%).* Source: TaxTips.ca, retrieved 2026-06.

**Alberta [V 2026]** — 8 / 10 / 12 / 13 / 14 / 15% at $61,200 / $154,259 / $185,111 / $246,813 /
$370,220; BPA $22,769. Source: TaxTips.ca, retrieved 2026-06.

**Quebec [~]** — 16.5% **federal abatement** applied to basic federal tax [V mechanism]; QC 2026
brackets/BPA ($18,952) are **indexation estimates** (×1.0205) **not yet confirmed by Quebec's Ministry
of Finance**, so QC stays `verified: false`. QC's distinct refundable/credit system is approximated by
the lowest-rate credit valuation.

**All other provinces/territories [V]** — MB, SK, NB, NS, PE, NL, YT, NT, NU are now **2026-verified**
(TaxTips.ca, retrieved 2026-06; per-province confirmation noted in config). Most are confirmed to CRA;
MB is indexation-frozen; YT uses federal-aligned thresholds with a $500k top (its statutory rate on
$181,440–$258,482 is 12.8% — the 12.93% "effective" figure TaxTips shows there is the federal BPA-grind
interaction, not a YT bracket). **Quebec is the only province still flagged `verified: false`.**

- Tax-modelling simplification: only these credits are modelled — federal BPA (with grind) + age amount +
  pension income amount; provincial BPA + (ON age/pension amounts) + ON surtax + ON health premium + QC
  abatement. Other provincial credits (e.g. BC's low-income tax reduction, provincial age/pension/dividend
  credits) are **not** modelled, so provincial tax outside ON is an approximation even where brackets are verified.
- Pension income splitting (couples): up to 50% of eligible pension; PSPP (RPP) qualifies at any age,
  RRIF/LIF only at 65+. Engine picks the split that minimises combined tax. [V mechanism]

## 6. Monte Carlo (`lib/montecarlo`, `lib/engine`)

- Per-account returns sampled from each account's `riskProfile` (user-supplied mean / volatility);
  **draws are independent by default**. Optional `correlation` ρ ∈ [0,1] links accounts via a single
  shared market factor (equicorrelation) so a market-wide down year hits them together — **off by
  default**, so existing results are unchanged. Reproducible under a fixed seed.
- **Simplifications:** inflation/indexing are held flat (not sampled); longevity is fixed at the end age
  (age of death not sampled); cross-account correlation defaults to 0.

## 7. End-to-end calibration — the lifetime-tax figure

`totals.lifetimeTax === Σ rows.tax` exactly (no terminal-tax double count — terminal/estate tax is
reported separately in `totals.estateValue`). The figure is a **nominal cumulative** over ~35 years.

**Tax brackets, credits, and thresholds are CPI-indexed each projection year** (as CRA does in reality),
implemented in the `lib/engine` tax adapter by deflating the year's nominal income by `(1+CPI)^i`, taxing
at the dated brackets, and re-inflating — mathematically exact bracket indexing. This removed **~$319k of
spurious bracket creep** from the earlier fixed-2026-bracket figure (reference household: $1,293,348 →
$974,490). The remaining burden is the genuine forced-RRIF-minimum stack from age 72 — what the RRSP
meltdown targets. Minor known wrinkle: the **Ontario Health Premium isn't indexed in law**, so the
deflate-reinflate slightly over-states it in late years (second-order vs the total). Pinned in
`lib/engine/calibration.test.ts`.

## 8. Cross-cutting simplifications (summary for validation)

1. Projection models a single filer or a two-member couple (pension splitting + survivor rule); no
   dependants / other-income complexity beyond the modelled lines.
2. Tax brackets/credits/thresholds **are** CPI-indexed each projection year (§7); the ON Health Premium
   is the one exception (not indexed in law) and is slightly over-stated late. CPP & OAS are still held at
   start-age nominal amounts (pension **is** indexed) — the main remaining inflation inconsistency, a
   candidate refinement.
3. RRIF conversion fixed at 71; no earlier-conversion or partial-conversion lever.
4. Provincial tax outside Ontario omits province-specific *credits* beyond the BPA (low-income reductions,
   provincial age/pension/dividend credits). SURTAXES are not a gap: as of 2026 **only Ontario levies a
   provincial surtax** (modelled); PEI abolished its surtax in 2024 (now a 5-bracket system, as configured)
   and no other province has one (§9).
5. Non-registered taxation is assumption-based (no per-lot ACB tracking).
6. Monte Carlo holds inflation and longevity deterministic; only returns are stochastic.
7. Lifetime tax is nominal-cumulative, not present-valued.
8. All 13 provinces/territories are 2026-verified (TaxTips.ca) **except Quebec**, whose 2026 figures are
   indexation estimates pending QC Finance confirmation. Provincial credits beyond the BPA (and ON surtax/
   health premium + QC abatement) are not modelled, so non-ON provincial tax is still an approximation.

## 9. Refinement research — primary sources (researched 2026-06-17)

Authoritative sourcing for each documented refinement (canada.ca / Treasury Board / Revenu Québec are
primary; secondary references corroborate). These resolve or scope the open items in §8 and the engine
gaps below.

### CPP/OAS CPI-indexing (the deferred refinement, §8 item 2)
- **Mechanics — confirmed.** OAS is indexed to the CPI **quarterly** (Jan/Apr/Jul/Oct); CPP is indexed to
  the CPI **annually** (January). Neither benefit can ever decrease. → A correct indexing pass grows each
  benefit by CPI from its start; the projection's flat-nominal CPP/OAS understate later-year income.
  Source: [canada.ca — CPP and the CPI](https://www.canada.ca/en/services/benefits/publicpensions/cpp/receive-benefits/consumer-price-index.html);
  [canada.ca — OAS payment amounts](https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/payments.html).
- **Why it stalled — now resolved.** The CPP **survivor + retirement combined benefit is capped at the
  maximum *retirement* pension** (NOT the sum), and the **enhanced (post-2019) component is exempt** from
  that cap. The cap is itself CPI-indexed (it is the max retirement pension), so a correct pass indexes the
  cap in `lib/survivor` by the same factor. Source:
  [canada.ca — CPP Survivor's Pension](https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-survivor-pension.html);
  [Question Period Note: CPP Combined Benefits](https://search.open.canada.ca/qpnotes/record/esdc-edsc,Seniors-JUN2022-002).
- **CPP survivor formula** (for the same future pass): survivor **under 65** = a flat-rate portion **+ 37.5%**
  of the contributor's retirement pension; **65+** = **60%** of it (when not already drawing own CPP). Source:
  [canada.ca — Survivor's Pension](https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-survivor-pension.html).
- **Break-even note:** with CPP/OAS indexed nominally, break-even must be computed in REAL terms (deflate by
  CPI) to stay equal to the canonical ~74 (CPP) / ~82 (OAS); a naive nominal crossover reads early (~72/~80).

### Quebec 2026 tax (§8 item 8)
- Revenu Québec confirms the 2026 personal-tax system is **indexed by 2.05%** with **rates unchanged**
  (14 / 19 / 24 / 25.75%). The configured QC values (2025 brackets/BPA × 1.0205, e.g. BPA $18,952) match this
  official indexation — stronger than "best-effort," though QC has not published the final confirmed table, so
  it stays `verified: false`. Source:
  [Revenu Québec — Income Tax Rates](https://www.revenuquebec.ca/en/citizens/income-tax-return/completing-your-income-tax-return/income-tax-rates/).

### Provincial surtaxes (§8 item 4) — closed
- **Only Ontario** levies a provincial surtax in 2026 (20% / 36% tiers, modelled). **PEI abolished its surtax
  in 2024**, replacing 3 brackets + surtax with a 5-bracket system (as configured). No other province has one.
  Source: [EY — PEI Budget 2023-24](https://www.ey.com/en_ca/technical/tax/tax-alerts/2023/tax-alert-2023-no-22);
  [PwC — Canada individual taxes](https://taxsummaries.pwc.com/canada/individual/taxes-on-personal-income).

### Public-service §17 items
- **Severance / retirement allowance:** accumulation of severance for **voluntary resignation/retirement was
  eliminated (2012–13)** across the core public administration's collective agreements (members cashed out or
  froze accrued amounts). So a *retirement allowance* is largely a legacy/frozen item — the engine NOT adding
  one by default is correct; only **unused-vacation payout** and **WFA/VDP (TSM)** packages are real lump sums.
  Source: [TBS — Severance Pay](https://www.tbs-sct.canada.ca/pubs_pol/hrpubs/TBM_11A/sp-idpr-eng.asp);
  [canada.ca — Workforce Adjustment](https://www.canada.ca/en/government/publicservice/workforce/workforce-adjustment.html).
- **PSHCP retiree health costs:** pensioners pay **monthly PSHCP contributions** (Supplementary coverage),
  moving toward a **50:50 cost-share** (those retired/retiring after 31 Mar 2025 affected unless a Relief
  Provision applies); exact rates are in **Schedule V** of the PSHCP Directive (NJC). A real retiree expense,
  modellable as an indexed annual cost line. Source:
  [TBS — Pensioner contribution-rate changes](https://www.canada.ca/en/treasury-board-secretariat/services/benefit-plans/health-care-plan/frequently-asked-questions/changes-pensioners-contribution-rates.html);
  [NJC — PSHCP Schedule V rates](https://www.njc-cnm.gc.ca/directive/d9/v283/s827/en).
- **PSPP survivor pension:** a survivor allowance equal to **one-half of the pension the member would have
  received before age 65** (computed **before** any early-retirement reduction), **payable immediately and
  fully indexed annually** — corroborates `survivorAllowanceAnnual` in `lib/survivor` (≈50% of the unreduced
  lifetime pension). Source:
  [canada.ca — Benefits for survivors (PSPP)](https://www.canada.ca/en/public-services-procurement/services/pay-pension/public-service-pension-plan/survivor-dependant/benefits-survivors.html).

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

**Quebec** — 16.5% **federal abatement** applied to basic federal tax [V mechanism]; QC brackets/BPA
($18,571) remain ~2025 best-effort [~], and QC's distinct refundable/credit system is approximated by
the lowest-rate credit valuation.

**Other provinces/territories [~]** — MB, SK, NB, NS, PE, NL, YT, NT, NU carry their bracket structure
with ~2025 best-effort values, `verified: false`, each flagged in its config note. **Do not rely on
these for a shipped projection until confirmed for 2026.**

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

The large cumulative **lifetime tax** the dashboard shows is **correct, not a bug**:
`totals.lifetimeTax === Σ rows.tax` exactly (no terminal-tax double count — terminal/estate tax is
reported separately in `totals.estateValue`). It is large because it is a **nominal cumulative** over
~35 years and mandatory RRIF minimums from age 72 stack on the indexed pension + CPP + OAS at high
marginal rates — exactly the burden the RRSP meltdown reduces. The UI should label it
nominal-cumulative. Pinned in `lib/engine/calibration.test.ts` for a documented reference household.

## 8. Cross-cutting simplifications (summary for validation)

1. Projection models a single filer or a two-member couple (pension splitting + survivor rule); no
   dependants / other-income complexity beyond the modelled lines.
2. CPP & OAS held at start-age nominal amounts (no year-over-year CPI indexing); pension **is** indexed.
3. RRIF conversion fixed at 71; no earlier-conversion or partial-conversion lever.
4. Provincial tax outside Ontario omits province-specific credits/surtaxes beyond the BPA.
5. Non-registered taxation is assumption-based (no per-lot ACB tracking).
6. Monte Carlo holds inflation and longevity deterministic; only returns are stochastic.
7. Lifetime tax is nominal-cumulative, not present-valued.
8. Only ON / BC / AB province tax is verified for 2026; QC abatement verified; the rest are ~2025.

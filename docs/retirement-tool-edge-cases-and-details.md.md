# Edge Cases & Fine Details — Federal Retirement System Reference

**Companion to:** retirement-financial-planning-tool-plan.md
**Purpose:** the deep, specific detail behind the engine — including the awkward edge cases — so the build is accurate, not approximately right.
**Researched:** June 16, 2026, against canada.ca / PSPC / CRA / Service Canada and corroborating advisory sources. All dollar figures are 2026, dated, re-verify yearly.

---

## 0. Accuracy guardrail — read first

**This tool models the FEDERAL public service pension plan only**, established under the **Public Service Superannuation Act (PSSA)**, administered by the Government of Canada Pension Centre (PSPC).

Do **not** pull rules from similarly named plans — they have *different* formulas and will silently corrupt the engine:
- **BC's "Public Service Pension Plan"** (pspp.pensionsbc.ca) — has a **"rule of 85" / rule of 90** and a 35-year unreduced provision. **The federal plan has NO rule of 85.** Federal unreduced eligibility is age-and-service thresholds only (see §1).
- **Alberta's PSPP** (pspp.ca) — different contribution rates (8.3% etc.) and rules.
- **Nova Scotia PSSP**, provincial plans generally.
- **Members of Parliament / Senators** (3% accrual) and the **judges' pension** — different statutes entirely.
When a source isn't on canada.ca / a federal union (PSAC, PIPSC) explaining the *federal* plan, treat it as suspect for federal rules.

---

## 1. PSPP pension — fine details & edge cases

### Eligibility (confirmed, federal)
- **Group 1** (joined ≤ Dec 31 2012): unreduced at **60 + 2 yrs** OR **55 + 30 yrs**. Annual allowance from **50**. Deferred annuity payable unreduced at **60**.
- **Group 2** (joined ≥ Jan 1 2013): unreduced at **65 + 2 yrs** OR **60 + 30 yrs**. Annual allowance from **55**. Deferred annuity at **65**.
- **Vesting** = 2 years of pensionable service. Under 2 years → only a Return of Contributions.
- **Group reassignment edge case:** a Group 1 member who, on leaving, took a return of contributions, a transfer value, or a portability/PTA transfer, and is re-employed and re-enrolled on/after Jan 1 2013, becomes **Group 2**. Otherwise a returning member keeps their group. Provide an explicit group override.

### The four "what happens when I leave" options (member chooses within 1 year; default after 1 yr = deferred annuity)
1. **Immediate annuity** — unreduced, paid now (meets age/service above).
2. **Annual allowance** — reduced, paid now (early). Reduction is **permanent**.
3. **Deferred annuity** — unreduced, paid later (60 G1 / 65 G2). Can later convert to an annual allowance from 50/55.
4. **Transfer value** — lump-sum commuted value, only if leaving **before age 50**; irrevocable; investment risk shifts to the member; actuarial (interest-rate-dependent, recomputed at payment date). *Out of scope for the engine — flag, don't compute.*

### Formula details
- **Lifetime (annual)** = `1.375% × (best-5 avg salary up to AMPE) × service(≤35)` + `2.0% × (best-5 avg above AMPE) × service(≤35)`.
- **Bridge (annual, to 65)** = `0.625% × (best-5 avg up to AMPE) × service(≤35)`.
- Pre-65 total = `2.0% × best-5 avg × service`.
- **AMPE** = 5-yr average of YMPE for the retirement year. 2026 example: avg of YMPE 2022–2026 ($64,900/$66,600/$68,500/$71,300/$74,600) = **$69,180**.
- **Best-5** = highest 5 *consecutive* years; excludes overtime and certain allowances; salary earned after 35 years still counts if it lands in the best-5. (Retirements before June 17 1999 used a 6-year average — legacy, ignore.)
- **Birth-year legacy factors:** the 1.375%/0.625% pair applies for reaching 65 in 2012+ (born 1947+); pre-1947 uses 1.30–1.36% / 0.64–0.70% pairs — effectively legacy now but store the table.
- **35-year cap:** pensionable service caps at 35 yrs. After 35 yrs you stop accruing service and your contribution rate drops to **1%** of salary; later salary still counts toward best-5.
- **Part-time:** salary converted to full-time-equivalent; service pro-rated by assigned/full-time hours.

### Early-retirement reduction (annual allowance) — exact
- **Group 2:** F1 (service <25): `5% × (65 − age)`, age floored at 55 if terminating earlier. F2 (service ≥25, 55–65): greater of `5% × (60 − age)` or `5% × (30 − service)`; at 60+ with ≥25 take the lower of F1/F2.
- **Group 1:** the reduction is the greater of `5% × (55 − age at the later of termination or option)` or `5% × (30 − service)` (for ≥25 yrs); F1 = `5% × (60 − age)` for <25 yrs. *(Group 1 Formula 2 anchor 55 and the "later of termination/option" age confirmed in PSAC's federal Group 1 guide; Group 1 F1 anchor 60 inferred from the age-60 normal retirement — verify against the official Group 1 page.)*
- Reduction applies to the whole pre-65 pension; ages/service to nearest tenth of a year; permanent (except if disabled before 65 → converts to immediate annuity).

### Indexing — important nuances
- Full CPI indexing of pensions in pay **and** deferred pensions, applied **Jan 1** each year (CPI = avg over 12 months ending September). **2026 rate = 2.0%.**
- **First year is prorated** by the number of full months since retirement (retire Nov 2025 → 1/12 in Jan 2026).
- **Indexing accrues from retirement but is NOT paid before age 55** (the accrued amount is then added at 55) — matters for anyone retiring on an annual allowance before 55.
- Indexation is computed on the **total** pension (lifetime + bridge), so **when the bridge ends at 65, the indexed amount steps down too** — model the index on the components, not a flat post-65 figure.

### Other live details
- **Service buyback:** prior service (e.g., leave without pay, prior-term) can be bought; cost is far lower if elected within the first year of membership; unpaid installments are deducted from the pension if you retire before paying them off; bought service counts in the calc even if not fully paid.
- **Re-employment after retirement:** if a pensioner returns to a public-service position requiring plan contributions, the **monthly pension (incl. indexing) stops** until they leave again — can't collect and accrue simultaneously.
- **Medical retirement:** Health-Canada-certified disability → immediate annuity at any age (≥2 yrs service), no reduction.
- **Operational service** (Correctional Service Canada and some newly added groups via the 2024 expansion): earlier unreduced eligibility (e.g., 25 yrs operational service, or 50 + combinations); +0.62% contribution on deemed operational service; their indexing can start at the age+service = 85 point. *Niche — flag as a later module, don't bake into the default path.*
- **Pension division on relationship breakdown** (Pension Benefits Division Act): a court order/agreement can split the pension; the divided portion is removed from the member's entitlement and from any future survivor benefit. *Flag for couple/divorce edge handling; not a v1 compute.*
- **RCA (Retirement Compensation Arrangement):** salary above the pension salary cap (~$220,000 in 2026) accrues benefits under the RCA, not the registered plan. Niche for most members.

---

## 2. PSPP survivor & death benefits

- **Survivor's pension (allowance):** a lifetime monthly benefit ≈ **one-half of the member's *unreduced* lifetime pension** (i.e., before any early-retirement reduction and before the bridge). Formula: `1% × service(≤35) × best-5 avg salary ÷ 12` monthly. Computed **without** the early-retirement actuarial reduction and **without** the CPP/QPP coordination reduction — even if the member died young.
- **Eligibility:** spouse/common-law partner where the relationship existed **before retirement** and continued to death. A **divorced** spouse gets nothing; a **separated-but-not-divorced legal spouse** generally retains entitlement (less any PBDA-divided portion). A **common-law** partner separated at death gets nothing.
- **Optional Survivor Benefit (OSB):** if the member **married after retirement**, they may elect to provide a survivor pension by **reducing their own** pension (enrollment window applies). Model as an optional toggle in couple mode.
- **Child's allowance:** for children under 18, or 18–25 in full-time school; paid on top of the survivor pension.
- **Minimum benefit guarantee:** total of all benefits paid is guaranteed to be **≥ 5× the member's annual unreduced pension**; if member + survivors die before that's reached (excluding indexation), the balance goes to the SDB beneficiary/estate.
- **Supplementary Death Benefit (SDB):** Part II of the PSSA. One-time, **tax-free** lump sum = **2× annual salary** (rounded up to nearest $1,000) while employed; in retirement it **decreases 10%/year starting at age 66**, down to a floor (**$10,000** for most pensioners). Continued coverage in retirement is automatic for those with an immediate pension and 2 years' participation; others must elect "commercial" SDB at a higher rate.
- **Death in service:** ≥2 yrs service → survivor/child allowance; <2 yrs → Return of Contributions + interest to survivor/estate.
- Health/dental (PSHCP / Pensioners' Dental) coverage ends at the member's death unless the survivor applies to continue.

---

## 3. CPP — details & edge cases

> **Design note:** the engine should take the user's **estimated CPP at 65 from their Service Canada statement** as an input, because the items below are already baked into that estimate and depend on the person's full contribution history. Don't recompute CPP from scratch; do let the user apply the start-age adjustment.

- **Start age 60–70.** −0.6%/mo before 65 (−36% at 60). +0.7%/mo after 65 (+42% at 70). No benefit to deferring past 70.
- **General drop-out:** the lowest-earning ~**17%** of contributory months are excluded from the *base* benefit (≈ 8 years at age 65). Only applied if >120 months remain after other drop-outs.
- **Child-rearing provisions** (child under 7, primary caregiver): **drop-out** on the base component (excludes low/no-earning months) and **drop-in** on the enhanced component (credits based on the 5 years before caregiving). Applied only if it raises the benefit; one parent only.
- **Disability drop-out:** months receiving CPP disability are excluded.
- **Over-65 / working-while-collecting:** can drop out low months 65–70; if you work while receiving CPP (under 70) you make **Post-Retirement Benefit (PRB)** contributions that add small lifetime increments.
- **CPP enhancement (2019–2025, plus CPP2 from 2024):** gradually raises future benefits above the classic 25%-replacement; reflected in younger members' estimates. YMPE 2026 $74,600; **YAMPE $85,000** (CPP2 second ceiling).
- **Credit splitting (DUPE)** on divorce/separation: pensionable earnings during cohabitation are equalized; can be mandatory in some provinces.
- **Pension sharing:** spouses both 60+ and collecting can *share* CPP retirement pensions for tax purposes (distinct from credit splitting and from pension *income splitting*).
- **CPP survivor's pension:** payable to a surviving spouse; if the survivor also has their own CPP, a **combined-benefit maximum** caps the total (you don't get the full sum of both).
- **CPP death benefit:** one-time **$2,500** lump sum to the estate.
- **CPP children's benefit** for dependent children of a deceased/disabled contributor.
- **QPP** (Quebec) mirrors CPP with some different parameters — relevant only if modelling Quebec residents.

---

## 4. OAS / GIS — details & edge cases

- **Residency:** **40 years** in Canada after 18 = full OAS; **partial = 1/40 per year of residency**, minimum **10 years** (if resident when applying) or **20 years** (if applying from abroad). Years needn't be consecutive. Social-security agreements can let foreign residence count toward the minimum.
- **Amount (2026 Q1):** max $742.31/mo (65–74); **+10% at 75** ($816.54). Deferral to 70 at **+0.6%/mo** (+36% max). Indexed quarterly.
- **Non-resident OAS:** 25% withholding tax (15% under treaties such as Canada–US); needs 20 years' residency to keep receiving abroad.
- **Clawback (recovery tax):** 15% of net world income over the threshold — ~**$93,454** (2025 income year) / ~**$95,323** (2026 income year), fully gone ~**$148k–$155k** (65–74). **One-year lag:** the reduction on the July–June payment year is based on the *prior* tax year's net income. **TFSA withdrawals are excluded** from net income (core to the meltdown). A one-time income spike (property sale, big RRSP withdrawal) can cost a full year of OAS.
- **GIS:** non-taxable top-up for **low-income** OAS recipients; income-tested on prior-year income, phases out ≈ **50¢ per $1** of other income. There's a working-income exemption ($5,000 fully + 50% of the next $10,000). **GIS/RRSP interaction:** an RRSP/RRIF withdrawal can reduce GIS by 50¢/$ *on top of* income tax (effective >70%), while a **TFSA** withdrawal costs nothing — a real low-income drawdown lever. *Most pensioned public servants won't qualify for GIS, but the engine should at least not assume GIS for them and should flag it for low-pension/early-retiree cases.*
- **Allowance (60–64):** for a low-income person whose spouse gets OAS+GIS. **Allowance for the Survivor (60–64):** for a low-income widowed person. Both income-tested, non-taxable, stop at 65. Edge case worth a flag, generally out of scope for this population.

---

## 5. Registered & locked-in accounts — details & edge cases

### RRSP → RRIF
- Convert RRSP to a **RRIF (or annuity, or cash)** by **Dec 31 of the year you turn 71**.
- **RRIF minimum** = (Jan 1 fair-market value) × age factor; **no minimum in the year the RRIF is opened** (starts the next year). Fully taxable. **No withholding on the minimum**; withholding applies only on amounts **above** the minimum (10% on the first $5k over, 20% $5–15k, 30% beyond) — a prepayment, not extra tax.
- **Younger-spouse election:** base the factor on the younger spouse's age (set at RRIF setup) to lower mandatory minimums.
- **Factor table (2026, post-1992 RRIFs; under 71 = 1/(90−age)):** 55→2.86, 60→3.33, 65→4.00, 70→5.00, 71→5.28, 72→5.40, 75→5.82, 80→6.82, 85→8.51, 90→11.92, 95+→20.00 (store the full table).

### TFSA
- 2026 annual limit **$7,000**; cumulative room **$109,000** for someone eligible since 2009. Withdrawals are **tax-free** and **excluded from net income** (no OAS clawback, no GIS reduction). Withdrawn amounts are re-added to room the **following** calendar year. The "RRSP→TFSA pipeline" is the meltdown's preferred destination.

### Locked-in (LIRA / LIF) — e.g. from a PSPP transfer value
- **LIRA** = locked-in RRSP; **LIF** = locked-in RRIF with **both a minimum and a maximum** annual withdrawal (max from an age-based factor — the defining difference from a RRIF). Federally regulated locked-in funds (PSPP transfer value) follow the **PBSA / OSFI** rules.
- **One-time 50% unlock:** federal RLIF allows unlocking up to **50%** to a regular RRSP/RRIF within **60 days** of converting to the RLIF (age 55+). Provincial rules differ (Ontario: 50% within 60 days of a new LIF; some provinces none). Plus small-balance and financial-hardship unlocking, and reduced-life-expectancy full withdrawal.
- *Locked-in mechanics are a later module; if modelled, the key is the LIF max cap and the 50% unlock. Flag, don't assume.*

### At death (the terminal-tax piece, key to the meltdown's estate story)
- **Spousal rollover:** RRSP/RRIF/LIF can roll **tax-deferred** to a surviving spouse (successor annuitant for a RRIF is seamless; LIF/locked-in unlocks to the spouse). No immediate tax.
- **No spouse (or non-spouse beneficiary):** the **entire** RRSP/RRIF FMV is included as income on the deceased's **final return** ("deemed disposition") — often taxed at the top marginal rate. This terminal tax bomb is exactly what the meltdown shrinks; **estate value after terminal tax** should be a headline metric.
- TFSA: passes tax-free; a spouse named **successor holder** keeps it as their own TFSA.

---

## 6. Tax — details & edge cases

### Brackets & add-ons (2026)
- **Federal:** 14% / 20.5% / 26% / 29% / 33% at $58,523 / $117,045 / $181,440 / $258,482. BPA $16,452 (reduced for very high income).
- **Ontario:** 5.05% / 9.15% / 11.16% / 12.16% / 13.16% at $53,891 / $107,785 / $150,000 / $220,000, **plus surtax** (20% of ON tax over $5,818, +36% over $7,446) **plus Ontario Health Premium** (up to $900). Top combined marginal rate >53%. The surtax applies to provincial tax, not income — easy to miss and material for pensioned retirees.
- **AMT** can apply with large capital gains / preferential income — out of scope for v1, note it.

### Credits relevant in retirement
- **Pension income amount:** federal $2,000 (×15% = ~$300 credit) on **eligible** pension income; Ontario ~$1,796.
- **Age amount (65+):** federal max **$9,208** (2026), reduced once net income > ~$46,432, gone by ~$107k; Ontario age amount too.
- Basic personal amount (federal $16,452 + Ontario BPA); dividend tax credit on non-registered eligible dividends.

### Pension income splitting & the pension credit — the precise age rules (commonly gotten wrong)
- **Splitting:** up to **50%** of *eligible pension income* to a spouse, via joint **Form T1032** filed annually with both returns.
- **RPP / superannuation life annuity (the PSPP pension): qualifies at ANY age** — splittable and credit-eligible even if you retire at 55.
- **RRIF / LIF / RRSP-annuity income: qualifies only if the transferring spouse is 65+** (or received due to a spouse's death). This is *why* converting some RRSP to RRIF at 65 is a deliberate move.
- The **receiving** spouse's age doesn't affect the right to split, but they can only claim the pension *credit* on split RRIF-source income if **they** are 65+.
- **Never eligible** for the pension amount or splitting: OAS, CPP/QPP, GIS, death benefits, retiring allowances, regular (non-annuitized) RRSP withdrawals.
- **CPP has its own separate sharing** (see §3) — not part of T1032 pension splitting.

### Investments
- **Capital gains inclusion 50%** (the proposed 66.67% increase was **cancelled** March 2025 — 50% stands for 2026). Only realized gains taxed.
- **Eligible dividends:** 38% gross-up + dividend tax credit (effective rate well below interest).
- **Interest:** fully taxable at marginal rate.

---

## 7. What the engine computes vs. takes as input vs. context vs. out-of-scope

| Item | Engine role |
|---|---|
| PSPP lifetime + bridge + reduction + indexing | **Compute** (core) |
| Survivor pension / SDB / min guarantee | Compute in **couple/estate** mode (later) |
| CPP amount | **Input** (Service Canada estimate at 65) + apply start-age factor |
| CPP drop-outs, child-rearing, sharing, credit split | **Context** (already in the estimate) — explain, don't recompute |
| OAS amount + deferral + clawback | **Compute** (clawback needs the tax engine + prior-year lag) |
| GIS / Allowance / Allowance for Survivor | **Context / flag** — usually N/A for pensioned members; handle for low-income/early cases |
| RRSP/RRIF/TFSA/non-reg balances, withdrawals, RRIF minimums | **Compute** (projection loop) |
| LIRA/LIF, locked-in unlock, LIF max | **Later module** — flag |
| Tax (federal+ON, credits, splitting, surtax, health premium) | **Compute** (tax engine) |
| Terminal tax at death / estate value | **Compute** (headline metric for the meltdown) |
| Transfer value, RCA, operational service, pension division | **Out of scope / flag** — niche, actuarial, or edge |

---

## 8. Implications for the build

- The **CPP-as-input** decision is now well-justified: its accuracy depends on contribution history and a stack of drop-out/enhancement provisions that only Service Canada's estimate captures. Recomputing it would be both hard and less accurate.
- **OAS clawback must run off prior-year income** with the one-year lag, and **TFSA must be excluded** from the clawback/GIS income base — get this wiring right or the meltdown's whole value proposition computes wrong.
- **Pension income splitting** is the biggest couple-mode tax lever, and its **RPP-any-age vs RRIF-65+** asymmetry is the subtle bit to encode correctly.
- **Estate value after terminal tax** deserves to be a headline output — it's half the reason the meltdown exists.
- Keep the **federal-only guardrail** (§0) visible in the project working notes; the single most likely accuracy bug is a contributor pulling a "rule of 85" or a provincial contribution rate from a same-named plan.
- Everything dated here is a **2026 constant to re-verify annually**; wire it all through the dated config, never inline.

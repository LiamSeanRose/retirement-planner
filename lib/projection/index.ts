/**
 * Path-based year-by-year projection — the core every analysis composes (plan §3).
 *
 * `runProjection` walks one `ReturnPath` from the member's retirement age to the scenario end
 * age, producing a `YearRow` per year and the rolled-up `ScenarioResult`. It is a pure function:
 * it composes the domain engines (pension / cpp / oas / accounts) and takes the tax engine as an
 * INJECTED `TaxFn` (so this lane is unblocked and unit-testable; integration wires `lib/tax`).
 *
 * Scope: single person, deterministic-first. Couple mode and the survivor rule (§19) are not
 * modelled here yet — `filingStatus` stays 'single'. Percentages on the path/scenario are in
 * percent (e.g. 5 = 5%); the domain engines take fractions, so we convert at the call site.
 */

import type { ReturnPath } from '../paths';
import type { Province } from '../types';
import type { Account, AccountType, Household, Scenario, ScenarioResult, YearRow } from '../../types/planner';
import { DEFAULT_CONFIG, type YearConfig } from '../config';
import { determineGroup, indexedValue, pensionAtRetirement } from '../pension';
import { cppMonthlyAtStart } from '../cpp';
import { oasClawback, oasMonthly } from '../oas';
import { applyWithdrawal, growAccount, rrifMinimum } from '../accounts';

const pctToFraction = (pct: number): number => pct / 100;

/** Context handed to the injected tax engine for one year. */
export interface TaxContext {
  province: Province;
  year: number;
  age: number;
  taxableIncome: number;
  /** Eligible pension income (PSPP at any age; RRIF at 65+) — for the pension credit / splitting. */
  pensionIncome: number;
  filingStatus: 'single' | 'couple';
}

/** Injected tax engine: total federal + provincial income tax for the year (OAS clawback handled separately). */
export type TaxFn = (ctx: TaxContext) => number;

/** §20 default decumulation heuristic: non-registered first, RRSP/RRIF next, TFSA last. */
const DEFAULT_WITHDRAWAL_ORDER: AccountType[] = ['nonReg', 'rrsp', 'tfsa'];

/** RRSP becomes a RRIF by the end of the year the holder turns 71. */
const RRIF_CONVERSION_AGE = 71;

interface Balances {
  rrsp: number;
  tfsa: number;
  nonReg: number;
}

function collapseBalances(accounts: Account[]): Balances {
  const b: Balances = { rrsp: 0, tfsa: 0, nonReg: 0 };
  for (const a of accounts) b[a.type] += a.currentBalance;
  return b;
}

/**
 * Build a config whose OAS clawback threshold is defined for `incomeYear`. The shipped config only
 * carries the most recent income years; for future projection years we index the latest known
 * threshold forward by inflation (the real threshold is CPI-indexed), so `oasClawback` never throws.
 */
function withProjectedThreshold(
  config: YearConfig,
  incomeYear: number,
  inflationFraction: number,
): YearConfig {
  const map = config.oas.clawbackThresholdByIncomeYear;
  if (map[incomeYear] !== undefined) return config;
  const baseYear = Math.max(...Object.keys(map).map(Number));
  const projected = map[baseYear] * Math.pow(1 + inflationFraction, incomeYear - baseYear);
  return {
    ...config,
    oas: { ...config.oas, clawbackThresholdByIncomeYear: { ...map, [incomeYear]: projected } },
  };
}

/**
 * Run a single deterministic projection of `household` under `scenario` along `path`, taxed by
 * the injected `computeTax`. Returns the full `ScenarioResult`.
 */
export function runProjection(
  household: Household,
  scenario: Scenario,
  path: ReturnPath,
  computeTax: TaxFn,
  config: YearConfig = DEFAULT_CONFIG,
): ScenarioResult {
  const member = household.memberA;
  const group = determineGroup(member.planJoinDate, member.group);
  const retirementAge = member.targetRetirementAge;
  const endAge = scenario.assumptions.endAge;
  const birthYear = new Date(member.birthDate).getUTCFullYear();
  const retirementYear = birthYear + retirementAge;

  // Pension is computed once at retirement; lifetime & bridge then index each year.
  const par = pensionAtRetirement(
    {
      group,
      best5Salary: member.bestFiveAvgSalary,
      service: member.pensionableServiceYears,
      ageAtRetirement: retirementAge,
    },
    config,
  );
  // ERI waiver (§18) removes the permanent early-retirement reduction: restore the unreduced base.
  const eriWaived = scenario.events.eriWaiver?.member === 'memberA';
  const unreduce = eriWaived && par.reductionPct < 1 ? 1 / (1 - par.reductionPct) : 1;
  const reductionPct = eriWaived ? 0 : par.reductionPct;
  const lifetimeBase = par.lifetimeAnnual * unreduce;
  const bridgeBase = par.bridgeAnnual * unreduce;

  const cppStartAge = scenario.cppStartAge.memberA;
  const oasStartAge = scenario.oasStartAge.memberA;
  // CPP fixed at its start-age amount (CPI indexing of CPP/OAS is a later refinement).
  const cppAnnual = cppMonthlyAtStart(member.estimatedCppAt65Monthly, cppStartAge, config) * 12;

  const inflationFraction = pctToFraction(scenario.assumptions.inflationPct);
  const withdrawalOrder = scenario.withdrawalOrder ?? DEFAULT_WITHDRAWAL_ORDER;
  const balances = collapseBalances(household.accounts);

  const rows: YearRow[] = [];
  let prevYearNetIncome = 0; // one-year-lag base for the OAS clawback (TFSA excluded by construction)
  let spendTarget = scenario.assumptions.targetAnnualSpending ?? 0; // grows with inflation each year
  let lastsToEndAge = true;

  for (let i = 0; retirementAge + i <= endAge; i++) {
    const age = retirementAge + i;
    const year = retirementYear + i;
    const conditions = path[i] ?? path[path.length - 1] ?? {
      returnPct: 0,
      inflationPct: scenario.assumptions.inflationPct,
      indexingPct: scenario.assumptions.indexingPct,
    };
    const returnFraction = pctToFraction(conditions.returnPct);
    const indexFraction = pctToFraction(conditions.indexingPct);

    // --- Pension: lifetime indexed every year; bridge stops at 65 (the step-down) ---
    const pension = indexedValue(lifetimeBase, i, indexFraction);
    const bridge = age < 65 ? indexedValue(bridgeBase, i, indexFraction) : 0;

    // --- CPP / OAS: gated by elected start age (and OAS eligibility) ---
    const cpp = age >= cppStartAge ? cppAnnual : 0;
    const oas = member.oasEligible && age >= oasStartAge ? oasMonthly(oasStartAge, age, config) * 12 : 0;

    // --- Events (single-person subset of §18): second-career income + WFA/TSM lump sum ---
    const sc = scenario.events.secondCareerIncome;
    const secondCareer =
      sc && sc.member === 'memberA' && age >= sc.startAge && age <= sc.endAge ? sc.annualAmount : 0;
    const wfa = scenario.events.wfaPackage;
    const lumpSum =
      wfa && wfa.member === 'memberA' && age === wfa.departureAge
        ? wfa.tsmPayoutWeeks * (member.currentSalary / 52)
        : 0;

    // --- Mandatory RRIF minimum (taxable). No minimum before conversion or in the opening year. ---
    const jan1Rrsp = balances.rrsp;
    const rrifMin =
      age >= RRIF_CONVERSION_AGE
        ? rrifMinimum(jan1Rrsp, age, { isOpeningYear: age === RRIF_CONVERSION_AGE })
        : 0;
    balances.rrsp = applyWithdrawal(balances.rrsp, rrifMin).balance;

    const guaranteedGross = pension + bridge + cpp + oas + secondCareer + lumpSum + rrifMin;

    // --- Discretionary withdrawals to meet the (gross) spend target, in withdrawal order ---
    let rrifExtra = 0;
    let tfsaWd = 0;
    let nonRegInc = 0;
    let need = Math.max(0, spendTarget - guaranteedGross);
    if (need > 0) {
      for (const type of withdrawalOrder) {
        if (need <= 0) break;
        const { balance, withdrawn } = applyWithdrawal(balances[type], need);
        balances[type] = balance;
        if (type === 'rrsp') rrifExtra += withdrawn;
        else if (type === 'tfsa') tfsaWd += withdrawn;
        else nonRegInc += withdrawn;
        need -= withdrawn;
      }
      if (need > 1e-6) lastsToEndAge = false; // accounts exhausted before spending was met
    }

    // --- Tax. TFSA excluded from income; non-reg taxable portion deferred to a later pass. ---
    const taxableIncome = pension + bridge + cpp + oas + secondCareer + lumpSum + rrifMin + rrifExtra;
    const pensionIncome = pension + bridge + (age >= 65 ? rrifMin + rrifExtra : 0);
    const tax = computeTax({
      province: household.province,
      year,
      age,
      taxableIncome,
      pensionIncome,
      filingStatus: 'single',
    });

    // --- OAS clawback on the PRIOR year's net income (mandatory one-year lag) ---
    const incomeYear = year - 1;
    const oasClawbackAmount =
      oas > 0
        ? oasClawback(prevYearNetIncome, incomeYear, oas, withProjectedThreshold(config, incomeYear, inflationFraction))
        : 0;

    const grossCash = guaranteedGross + rrifExtra + tfsaWd + nonRegInc; // all spendable cash
    const afterTax = grossCash - tax - oasClawbackAmount;

    // --- End-of-year growth on the remaining balances ---
    balances.rrsp = growAccount(balances.rrsp, returnFraction);
    balances.tfsa = growAccount(balances.tfsa, returnFraction);
    balances.nonReg = growAccount(balances.nonReg, returnFraction);
    const netWorth = balances.rrsp + balances.tfsa + balances.nonReg;

    rows.push({
      year,
      ageA: age,
      pension,
      bridge,
      cpp,
      oas,
      secondCareer,
      lumpSum,
      rrifMin,
      rrifExtra,
      tfsaWd,
      nonRegInc,
      taxableIncome,
      tax,
      oasClawback: oasClawbackAmount,
      afterTax,
      filingStatus: 'single',
      balances: { rrsp: balances.rrsp, tfsa: balances.tfsa, nonReg: balances.nonReg },
      netWorth,
    });

    prevYearNetIncome = taxableIncome; // becomes next year's clawback base (TFSA already excluded)
    spendTarget *= 1 + pctToFraction(conditions.inflationPct); // index the spend target
  }

  // --- Totals ---
  const lifetimeAfterTax = rows.reduce((s, r) => s + r.afterTax, 0);
  const lifetimeTax = rows.reduce((s, r) => s + r.tax, 0);
  const oasRetained = rows.reduce((s, r) => s + (r.oas - r.oasClawback), 0);

  const last = rows[rows.length - 1];
  const finalBalances = last ? last.balances : { rrsp: 0, tfsa: 0, nonReg: 0 };
  const finalYear = last ? last.year : retirementYear;
  // Estate after terminal tax: the registered balance is fully taxable on death (deemed disposition);
  // TFSA passes tax-free; non-reg terminal cap-gains tax is deferred to a later pass (first cut).
  const terminalTax = computeTax({
    province: household.province,
    year: finalYear,
    age: endAge,
    taxableIncome: finalBalances.rrsp,
    pensionIncome: 0,
    filingStatus: 'single',
  });
  const estateValue = finalBalances.rrsp - terminalTax + finalBalances.tfsa + finalBalances.nonReg;

  return {
    scenario,
    reductionPct: { memberA: reductionPct },
    rows,
    totals: { lifetimeAfterTax, lifetimeTax, oasRetained, estateValue, lastsToEndAge },
  };
}

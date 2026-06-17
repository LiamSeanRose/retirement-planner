/**
 * Path-based year-by-year projection — the core every analysis composes (plan §3).
 *
 * `runProjection` walks one `ReturnPath` from member A's retirement age to the scenario end age,
 * producing a `YearRow` per year and the rolled-up `ScenarioResult`. Pure function: it composes the
 * domain engines (pension / cpp / oas / accounts / survivor / workforce) and takes the tax engine
 * as an INJECTED `TaxFn`.
 *
 * HOUSEHOLD MODEL: single person, or a two-member couple (`household.memberB`). In couple mode it
 * projects BOTH members' pension (each with their own 65 bridge step-down), CPP, OAS, and workforce
 * events, pools the accounts, and asks the tax engine for couple-mode pension splitting. The §19
 * survivor rule fires on `events.earlyMortality`: the deceased's pension drops to the survivor
 * allowance, their bridge/CPP/OAS stop, registered assets roll to the survivor tax-deferred (they
 * stay in the pool — no terminal tax mid-stream), and filing flips couple→single. Single mode is
 * unchanged. Percentages on the path/scenario are in percent; the engines take fractions.
 */

import type { Province } from '../types';
import type { Account, AccountType, Household, Member, ReturnPathByType, Scenario, ScenarioResult, YearRow } from '../../types/planner';
import { DEFAULT_CONFIG, type YearConfig } from '../config';
import { determineGroup, indexedValue, pensionAtRetirement } from '../pension';
import { cppMonthlyAtStart } from '../cpp';
import { oasClawback, oasMonthly } from '../oas';
import {
  applyWithdrawal,
  capitalGainTaxableAmount,
  eligibleDividendTaxableAmount,
  growAccount,
  interestTaxableAmount,
  lifMaximum,
  rrifMinimum,
} from '../accounts';
import { householdFilingStatus, survivorAllowanceAnnual, survivorCppBenefitAnnual } from '../survivor';
import { eriWaiverApplies, secondCareerIncomeForYear, wfaLumpSumForYear } from '../workforce';

const pctToFraction = (pct: number): number => pct / 100;

type MemberId = 'memberA' | 'memberB';

/** One member's income, split the way pension splitting needs it (matches lib/tax `TaxProfile`). */
export interface TaxMemberProfile {
  age: number;
  /** Fully taxable, NOT splittable: CPP, OAS, second-career, lump sums. */
  ordinaryIncome: number;
  /** PSPP (RPP) pension — eligible to split at ANY age. */
  psppPension: number;
  /** RRIF income — eligible to split only when the transferring spouse is 65+. */
  rrifIncome: number;
}

/** Context handed to the injected tax engine for one year. */
export interface TaxContext {
  province: Province;
  year: number;
  age: number;
  taxableIncome: number;
  /** Eligible pension income (PSPP at any age; RRIF at 65+) — for the single-filer pension credit. */
  pensionIncome: number;
  filingStatus: 'single' | 'couple';
  /** Per-member profiles for couple-mode pension splitting; present only when filingStatus is 'couple'. */
  members?: [TaxMemberProfile, TaxMemberProfile];
  /**
   * Cumulative inflation factor (1+CPI)^years-since-retirement. Tax brackets, credits, and thresholds
   * are CPI-indexed annually in reality, so the tax engine deflates this year's nominal income by the
   * factor, taxes it at the dated (retirement-year ≈ config-year) brackets, and re-inflates the result
   * — neutralising the bracket creep that fixed brackets would otherwise impose on inflating income.
   */
  bracketIndexFactor?: number;
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
  lira: number;
}

function collapseBalances(accounts: Account[]): Balances {
  const b: Balances = { rrsp: 0, tfsa: 0, nonReg: 0, lira: 0 };
  for (const a of accounts) b[a.type] += a.currentBalance;
  return b;
}

/** A member's plan: their fixed pension/CPP/OAS facts, computed once at setup. */
interface MemberPlan {
  id: MemberId;
  member: Member;
  birthYear: number;
  retirementAge: number;
  lifetimeBase: number;
  bridgeBase: number;
  reductionPct: number;
  cppAnnual: number;
  cppStartAge: number;
  oasStartAge: number;
  survivorAnnual: number;
  deathAge?: number;
}

function buildPlan(member: Member, id: MemberId, scenario: Scenario, config: YearConfig): MemberPlan {
  const group = determineGroup(member.planJoinDate, member.group);
  const retirementAge = member.targetRetirementAge;
  const par = pensionAtRetirement(
    { group, best5Salary: member.bestFiveAvgSalary, service: member.pensionableServiceYears, ageAtRetirement: retirementAge },
    config,
  );
  // ERI waiver (§18) removes the permanent early-retirement reduction: restore the unreduced base.
  const eriWaived = eriWaiverApplies(scenario, id);
  const unreduce = eriWaived && par.reductionPct < 1 ? 1 / (1 - par.reductionPct) : 1;
  const cppStartAge = scenario.cppStartAge[id] ?? 65;
  const oasStartAge = scenario.oasStartAge[id] ?? 65;
  const death = scenario.events.earlyMortality;
  return {
    id,
    member,
    birthYear: new Date(member.birthDate).getUTCFullYear(),
    retirementAge,
    lifetimeBase: par.lifetimeAnnual * unreduce,
    bridgeBase: par.bridgeAnnual * unreduce,
    reductionPct: eriWaived ? 0 : par.reductionPct,
    cppAnnual: cppMonthlyAtStart(member.estimatedCppAt65Monthly, cppStartAge, config) * 12,
    cppStartAge,
    oasStartAge,
    survivorAnnual: survivorAllowanceAnnual(member, config),
    deathAge: death?.member === id ? death.atAge : undefined,
  };
}

/** Split the pooled registered (RRSP/RRIF) balance by owner — registered can't be joint, so joint → member A. */
function registeredShares(accounts: Account[]): Record<MemberId, number> {
  let a = 0;
  let b = 0;
  for (const acc of accounts) {
    if (acc.type !== 'rrsp') continue;
    if (acc.owner === 'memberB') b += acc.currentBalance;
    else a += acc.currentBalance;
  }
  const total = a + b;
  if (total <= 0) return { memberA: 1, memberB: 0 };
  return { memberA: a / total, memberB: b / total };
}

/** Split the pooled non-registered balance by owner — joint accounts split 50/50. */
function nonRegShares(accounts: Account[]): Record<MemberId, number> {
  let a = 0;
  let b = 0;
  for (const acc of accounts) {
    if (acc.type !== 'nonReg') continue;
    if (acc.owner === 'memberB') b += acc.currentBalance;
    else if (acc.owner === 'joint') {
      a += acc.currentBalance / 2;
      b += acc.currentBalance / 2;
    } else a += acc.currentBalance;
  }
  const total = a + b;
  if (total <= 0) return { memberA: 1, memberB: 0 };
  return { memberA: a / total, memberB: b / total };
}

interface Lines {
  pension: number;
  bridge: number;
  cpp: number;
  oas: number;
  secondCareer: number;
  lumpSum: number;
}

/** One member's income lines for a year. A deceased member yields only the survivor allowance (as pension). */
function memberLines(plan: MemberPlan, age: number, alive: boolean, idxFraction: number, scenario: Scenario, config: YearConfig): Lines {
  const yearsRetired = Math.max(0, age - plan.retirementAge);
  if (!alive) {
    // Survivor allowance replaces the deceased's pension; the bridge/CPP/OAS stop (§19).
    return { pension: indexedValue(plan.survivorAnnual, yearsRetired, idxFraction), bridge: 0, cpp: 0, oas: 0, secondCareer: 0, lumpSum: 0 };
  }
  const retired = age >= plan.retirementAge;
  return {
    pension: retired ? indexedValue(plan.lifetimeBase, yearsRetired, idxFraction) : 0,
    bridge: retired && age < 65 ? indexedValue(plan.bridgeBase, yearsRetired, idxFraction) : 0,
    cpp: age >= plan.cppStartAge ? plan.cppAnnual : 0,
    oas: plan.member.oasEligible && age >= plan.oasStartAge ? oasMonthly(plan.oasStartAge, age, config) * 12 : 0,
    secondCareer: secondCareerIncomeForYear(scenario, plan.id, age),
    lumpSum: wfaLumpSumForYear(scenario, plan.id, age, plan.member.currentSalary),
  };
}

/**
 * Build a config whose OAS clawback threshold is defined for `incomeYear`. The shipped config only
 * carries the most recent income years; for future projection years we index the latest known
 * threshold forward by inflation (the real threshold is CPI-indexed), so `oasClawback` never throws.
 */
function withProjectedThreshold(config: YearConfig, incomeYear: number, inflationFraction: number): YearConfig {
  const map = config.oas.clawbackThresholdByIncomeYear;
  if (map[incomeYear] !== undefined) return config;
  const baseYear = Math.max(...Object.keys(map).map(Number));
  const projected = map[baseYear] * Math.pow(1 + inflationFraction, incomeYear - baseYear);
  return { ...config, oas: { ...config.oas, clawbackThresholdByIncomeYear: { ...map, [incomeYear]: projected } } };
}

/**
 * Run a single deterministic projection of `household` under `scenario` along `path`, taxed by the
 * injected `computeTax`. Returns the full `ScenarioResult`.
 */
export function runProjection(
  household: Household,
  scenario: Scenario,
  path: ReturnPathByType,
  computeTax: TaxFn,
  config: YearConfig = DEFAULT_CONFIG,
): ScenarioResult {
  const plans: MemberPlan[] = [buildPlan(household.memberA, 'memberA', scenario, config)];
  if (household.memberB) plans.push(buildPlan(household.memberB, 'memberB', scenario, config));
  const isCouple = plans.length === 2;
  const baseRegShares = registeredShares(household.accounts);
  const baseNonRegShares = nonRegShares(household.accounts);
  const nrc = config.nonRegistered;

  const retirementAge = household.memberA.targetRetirementAge;
  const endAge = scenario.assumptions.endAge;
  const retirementYear = plans[0].birthYear + retirementAge;
  const inflationFraction = pctToFraction(scenario.assumptions.inflationPct);
  const withdrawalOrder = scenario.withdrawalOrder ?? DEFAULT_WITHDRAWAL_ORDER;
  const balances = collapseBalances(household.accounts);

  // Federal one-time 50% unlock at LIF/RLIF creation (modelled at retirement, age 55+): move half the
  // locked-in balance to the RRSP, where it follows the flexible RRSP/RRIF rules (no LIF maximum).
  if (scenario.assumptions.lifUnlock50 && balances.lira > 0 && retirementAge >= 55) {
    const unlocked = balances.lira * 0.5;
    balances.lira -= unlocked;
    balances.rrsp += unlocked;
  }

  // A member's share of a pooled balance: their ownership while both are alive; the SURVIVOR holds
  // the whole pool after a death (the deceased's accounts roll over). Single mode = the lone member.
  const shareFor = (id: MemberId, base: Record<MemberId, number>, aliveById: Record<MemberId, boolean>): number => {
    if (!isCouple) return 1;
    if (aliveById.memberA && aliveById.memberB) return base[id];
    return aliveById[id] ? 1 : 0;
  };

  const rows: YearRow[] = [];
  let prevYearTaxableIncome = 0; // single-filer clawback base (one-year lag; TFSA excluded by construction)
  let prevIncome: Record<MemberId, number> = { memberA: 0, memberB: 0 }; // per-member couple clawback base
  let spendTarget = scenario.assumptions.targetAnnualSpending ?? 0; // grows with inflation each year
  let bracketIndexFactor = 1; // (1+CPI)^i — tax brackets/credits index with inflation, like CRA's
  let lastsToEndAge = true;

  for (let i = 0; retirementAge + i <= endAge; i++) {
    const ageA = retirementAge + i;
    const year = retirementYear + i;
    const conditions = path[i] ?? path[path.length - 1] ?? {
      returnPct: 0,
      inflationPct: scenario.assumptions.inflationPct,
      indexingPct: scenario.assumptions.indexingPct,
    };
    const idxFraction = pctToFraction(conditions.indexingPct);
    // Per-account-type returns when the path carries them; otherwise the single path return for all.
    const rByType = conditions.returnByType;
    const returnFor = (type: AccountType): number => pctToFraction(rByType?.[type] ?? conditions.returnPct);

    // Per-member age + alive status (death keyed to the member's OWN age).
    const ageById = { memberA: ageA, memberB: 0 } as Record<MemberId, number>;
    const aliveById = { memberA: true, memberB: true } as Record<MemberId, boolean>;
    for (const p of plans) {
      const age = year - p.birthYear;
      ageById[p.id] = age;
      aliveById[p.id] = p.deathAge === undefined || age < p.deathAge;
    }
    const bothAlive = plans.every((p) => aliveById[p.id]);
    const filingStatus = householdFilingStatus(isCouple, bothAlive);

    const linesById: Record<MemberId, Lines> = {
      memberA: { pension: 0, bridge: 0, cpp: 0, oas: 0, secondCareer: 0, lumpSum: 0 },
      memberB: { pension: 0, bridge: 0, cpp: 0, oas: 0, secondCareer: 0, lumpSum: 0 },
    };
    for (const p of plans) linesById[p.id] = memberLines(p, ageById[p.id], aliveById[p.id], idxFraction, scenario, config);

    // CPP survivor benefit (§19): after a death the survivor receives a capped fraction of the
    // deceased's CPP on top of their own (combined-benefit maximum applied in lib/survivor).
    if (isCouple && !bothAlive) {
      const dead = plans.find((p) => !aliveById[p.id]);
      const alive = plans.find((p) => aliveById[p.id]);
      if (dead && alive) {
        const deadCpp = ageById[dead.id] >= dead.cppStartAge ? dead.cppAnnual : 0;
        linesById[alive.id].cpp += survivorCppBenefitAnnual(deadCpp, linesById[alive.id].cpp, config);
      }
    }

    // --- Mandatory RRIF minimum (taxable), per member on their share of the registered pool ---
    const jan1Rrsp = balances.rrsp;
    const jan1NonReg = balances.nonReg;
    const rrifMinById = { memberA: 0, memberB: 0 } as Record<MemberId, number>;
    let rrifMin = 0;
    for (const p of plans) {
      const age = ageById[p.id];
      const m =
        aliveById[p.id] && age >= RRIF_CONVERSION_AGE
          ? rrifMinimum(jan1Rrsp * shareFor(p.id, baseRegShares, aliveById), age, { isOpeningYear: age === RRIF_CONVERSION_AGE })
          : 0;
      rrifMinById[p.id] = m;
      rrifMin += m;
    }
    balances.rrsp = applyWithdrawal(balances.rrsp, rrifMin).balance;

    // --- LIF (locked-in) mandatory minimum. A LIRA from a PSPP transfer value behaves as a LIF in
    // retirement: it pays the RRIF minimum each year (fully taxable, like RRIF income, splittable at
    // 65+); the rest stays locked and grows. Assumes conversion at retirement (federal LIF age 55+),
    // with the minimum starting the year after, as a RRIF does. Discretionary draws up to the federal
    // LIF MAXIMUM (lib/accounts lifMaximum) are a later refinement; the mandatory minimum is the floor.
    const jan1Lira = balances.lira;
    const lifMin = jan1Lira > 0 && ageA > retirementAge ? rrifMinimum(jan1Lira, ageA) : 0;
    balances.lira = applyWithdrawal(balances.lira, lifMin).balance;

    // --- Aggregate household income lines ---
    let pension = 0;
    let bridge = 0;
    let cpp = 0;
    let oas = 0;
    let secondCareer = 0;
    let lumpSum = 0;
    for (const p of plans) {
      const L = linesById[p.id];
      pension += L.pension;
      bridge += L.bridge;
      cpp += L.cpp;
      oas += L.oas;
      secondCareer += L.secondCareer;
      lumpSum += L.lumpSum;
    }
    const guaranteedGross = pension + bridge + cpp + oas + secondCareer + lumpSum + rrifMin + lifMin;

    // --- Discretionary withdrawals to meet the (gross) spend target, in withdrawal order ---
    let rrifExtra = 0;
    let tfsaWd = 0;
    let nonRegInc = 0;
    // "Go-go / slow-go / no-go" spending: scale the inflation-grown base by the member's life phase.
    const sp = scenario.assumptions.spendingPhases;
    const phaseMult = sp ? (ageA >= sp.noGoAge ? sp.noGoPct : ageA >= sp.slowGoAge ? sp.slowGoPct : 1) : 1;
    let need = Math.max(0, spendTarget * phaseMult - guaranteedGross);
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
      // Locked-in (LIF) is tapped only as a last resort and only UP TO its federal maximum (the
      // mandatory minimum already came out above); the rest stays locked. Counts as a taxable
      // registered draw (folded into rrifExtra), like a RRIF withdrawal.
      if (need > 1e-6 && balances.lira > 0) {
        const lifHeadroom = Math.max(0, lifMaximum(jan1Lira, ageA) - lifMin);
        const { withdrawn } = applyWithdrawal(Math.min(balances.lira, lifHeadroom), need);
        balances.lira -= withdrawn;
        rrifExtra += withdrawn;
        need -= withdrawn;
      }
      if (need > 1e-6) lastsToEndAge = false; // accounts exhausted before spending was met
    }

    // --- Non-registered taxation (previously the deferred piece): annual interest + eligible
    // dividends on the Jan-1 balance (taxed and left invested — a tax drag), plus the realized
    // capital-gain content of any non-reg withdrawal this year. lib/accounts applies the gross-up
    // (dividends) and 50% inclusion (gains); the yields / embedded-gain fraction come from config. ---
    const nonRegTaxable =
      interestTaxableAmount(jan1NonReg * nrc.interestYield) +
      eligibleDividendTaxableAmount(jan1NonReg * nrc.eligibleDividendYield) +
      capitalGainTaxableAmount(nonRegInc * nrc.unrealizedGainFraction);

    // Per-member taxable income = their lines + share of registered withdrawals + share of non-reg income.
    const incomeById = { memberA: 0, memberB: 0 } as Record<MemberId, number>;
    for (const p of plans) {
      const L = linesById[p.id];
      const regWd = rrifMinById[p.id] + shareFor(p.id, baseRegShares, aliveById) * rrifExtra + (p.id === 'memberA' ? lifMin : 0);
      const nonRegShare = shareFor(p.id, baseNonRegShares, aliveById) * nonRegTaxable;
      incomeById[p.id] = L.pension + L.bridge + L.cpp + L.oas + L.secondCareer + L.lumpSum + regWd + nonRegShare;
    }
    const taxableIncome = pension + bridge + cpp + oas + secondCareer + lumpSum + rrifMin + rrifExtra + lifMin + nonRegTaxable;

    // --- Tax: couple-mode pension splitting when both alive, otherwise a single filer ---
    let tax: number;
    if (filingStatus === 'couple') {
      const profileFor = (p: MemberPlan): TaxMemberProfile => {
        const L = linesById[p.id];
        return {
          age: ageById[p.id],
          // CPP/OAS/second-career/lump + the member's share of non-reg income (none splittable).
          ordinaryIncome: L.cpp + L.oas + L.secondCareer + L.lumpSum + shareFor(p.id, baseNonRegShares, aliveById) * nonRegTaxable,
          psppPension: L.pension + L.bridge,
          rrifIncome: rrifMinById[p.id] + shareFor(p.id, baseRegShares, aliveById) * rrifExtra + (p.id === 'memberA' ? lifMin : 0),
        };
      };
      tax = computeTax({
        province: household.province,
        year,
        age: ageA,
        taxableIncome,
        pensionIncome: pension + bridge,
        filingStatus,
        members: [profileFor(plans[0]), profileFor(plans[1])],
        bracketIndexFactor,
      });
    } else {
      const filer = plans.find((p) => aliveById[p.id]) ?? plans[0];
      const filerAge = ageById[filer.id];
      const pensionIncome = pension + bridge + (filerAge >= 65 ? rrifMin + rrifExtra + lifMin : 0);
      tax = computeTax({ province: household.province, year, age: filerAge, taxableIncome, pensionIncome, filingStatus, bracketIndexFactor });
    }

    // --- OAS clawback on the PRIOR year's net income (mandatory one-year lag) ---
    const incomeYear = year - 1;
    const clawbackOf = (priorIncome: number, oasAmount: number): number =>
      oasAmount > 0 ? oasClawback(priorIncome, incomeYear, oasAmount, withProjectedThreshold(config, incomeYear, inflationFraction)) : 0;
    const oasClawbackAmount =
      filingStatus === 'couple'
        ? clawbackOf(prevIncome.memberA, linesById.memberA.oas) + clawbackOf(prevIncome.memberB, linesById.memberB.oas)
        : clawbackOf(prevYearTaxableIncome, oas); // single filer reports all the household's OAS + income

    const grossCash = guaranteedGross + rrifExtra + tfsaWd + nonRegInc; // all spendable cash
    const afterTax = grossCash - tax - oasClawbackAmount;

    // --- End-of-year growth on the remaining balances, each type by its own return ---
    balances.rrsp = growAccount(balances.rrsp, returnFor('rrsp'));
    balances.tfsa = growAccount(balances.tfsa, returnFor('tfsa'));
    balances.nonReg = growAccount(balances.nonReg, returnFor('nonReg'));
    balances.lira = growAccount(balances.lira, returnFor('lira'));
    const netWorth = balances.rrsp + balances.tfsa + balances.nonReg + balances.lira;

    rows.push({
      year,
      ageA,
      ageB: isCouple ? ageById.memberB : undefined,
      pension,
      bridge,
      cpp,
      oas,
      secondCareer,
      lumpSum,
      rrifMin: rrifMin + lifMin, // mandatory registered minimums (RRIF + locked-in LIF) — shown together
      rrifExtra,
      tfsaWd,
      nonRegInc,
      taxableIncome,
      tax,
      oasClawback: oasClawbackAmount,
      afterTax,
      filingStatus,
      balances: { rrsp: balances.rrsp, tfsa: balances.tfsa, nonReg: balances.nonReg, lira: balances.lira },
      netWorth,
    });

    prevYearTaxableIncome = taxableIncome;
    prevIncome = { memberA: incomeById.memberA, memberB: incomeById.memberB };
    spendTarget *= 1 + pctToFraction(conditions.inflationPct); // index the spend target
    bracketIndexFactor *= 1 + pctToFraction(conditions.inflationPct); // index next year's tax brackets
  }

  // --- Totals ---
  const lifetimeAfterTax = rows.reduce((s, r) => s + r.afterTax, 0);
  const lifetimeTax = rows.reduce((s, r) => s + r.tax, 0);
  const oasRetained = rows.reduce((s, r) => s + (r.oas - r.oasClawback), 0);

  const last = rows[rows.length - 1];
  const finalBalances = last ? last.balances : { rrsp: 0, tfsa: 0, nonReg: 0 };
  const finalYear = last ? last.year : retirementYear;
  // Estate after terminal tax at the FINAL death: the registered balance is fully deemed-disposed
  // (no surviving spouse — couple first-death rollover already happened in-stream), TFSA passes
  // tax-free, non-reg terminal cap-gains deferred. Equivalent to lib/estate's second-death stage.
  const terminalFactor = Math.pow(1 + inflationFraction, Math.max(0, rows.length - 1)); // brackets indexed to the final year
  const terminalTax = computeTax({
    province: household.province,
    year: finalYear,
    age: endAge,
    taxableIncome: finalBalances.rrsp,
    pensionIncome: 0,
    filingStatus: 'single',
    bracketIndexFactor: terminalFactor,
  });
  const estateValue = finalBalances.rrsp - terminalTax + finalBalances.tfsa + finalBalances.nonReg;

  const reductionPct = isCouple
    ? { memberA: plans[0].reductionPct, memberB: plans[1].reductionPct }
    : { memberA: plans[0].reductionPct };

  return {
    scenario,
    reductionPct,
    rows,
    totals: { lifetimeAfterTax, lifetimeTax, oasRetained, estateValue, lastsToEndAge },
  };
}

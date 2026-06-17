/**
 * Guided-setup plan builder (`lib/share/wizard`).
 *
 * Maps a handful of plain-language answers (the onboarding wizard) into a full `Household` + `Scenario`
 * the engine can run. Pure and dependency-light so the mapping is testable on its own; the wizard UI
 * only collects the answers and renders the result. Anything not asked falls back to sensible defaults.
 */

import type { Account, Household, Province, Scenario } from '../../types/planner';
import { DEFAULT_MEMBER_B, DEFAULT_SCENARIO, RISK_PROFILES } from './defaults';

/** Investing style — maps to the per-account return/volatility used by the projection + Monte Carlo. */
export type RiskTolerance = 'Conservative' | 'Balanced' | 'Growth' | 'Aggressive';

export interface WizardAnswers {
  birthYear: number;
  /** Joined the federal public service before 2013 ⇒ pension Group 1; on/after ⇒ Group 2. */
  joinedBefore2013: boolean;
  province: Province;
  hasSpouse: boolean;
  bestFiveSalary: number;
  serviceYears: number;
  retireAge: number;
  /** Estimated CPP at 65 from the Service Canada statement (monthly). */
  cppAt65: number;
  rrsp: number;
  tfsa: number;
  nonReg: number;
  riskTolerance: RiskTolerance;
  ownsHome: boolean;
  homeValue: number;
  annualSpending: number;
}

/** Reasonable starting answers — a mid-career Group-1 member weighing retirement at 60. */
export const WIZARD_DEFAULTS: WizardAnswers = {
  birthYear: 1969,
  joinedBefore2013: true,
  province: 'ON',
  hasSpouse: false,
  bestFiveSalary: 92_000,
  serviceYears: 28,
  retireAge: 60,
  cppAt65: 1_100,
  rrsp: 350_000,
  tfsa: 90_000,
  nonReg: 60_000,
  riskTolerance: 'Balanced',
  ownsHome: true,
  homeValue: 600_000,
  annualSpending: 60_000,
};

/** Build the held accounts from the balances given — skipping any that are zero. */
function accountsFrom(ans: WizardAnswers): Account[] {
  const rp = () => ({ ...(RISK_PROFILES[ans.riskTolerance] ?? RISK_PROFILES.Balanced) });
  const out: Account[] = [];
  if (ans.rrsp > 0) out.push({ id: 'rrsp-w', owner: 'memberA', type: 'rrsp', currentBalance: ans.rrsp, riskProfile: rp() });
  if (ans.tfsa > 0) out.push({ id: 'tfsa-w', owner: 'memberA', type: 'tfsa', currentBalance: ans.tfsa, riskProfile: rp() });
  if (ans.nonReg > 0) out.push({ id: 'nonreg-w', owner: 'memberA', type: 'nonReg', currentBalance: ans.nonReg, riskProfile: rp() });
  return out;
}

/** Turn the wizard answers into a runnable plan (Household + Scenario). */
export function buildPlanFromAnswers(ans: WizardAnswers): { household: Household; scenario: Scenario } {
  const household: Household = {
    province: ans.province,
    memberA: {
      label: 'You',
      birthDate: `${ans.birthYear}-06-01`,
      // A representative join date inside the chosen group — only the group (pre/post-2013) matters here.
      planJoinDate: ans.joinedBefore2013 ? '2008-01-01' : '2015-01-01',
      currentSalary: ans.bestFiveSalary,
      bestFiveAvgSalary: ans.bestFiveSalary,
      pensionableServiceYears: ans.serviceYears,
      targetRetirementAge: ans.retireAge,
      estimatedCppAt65Monthly: ans.cppAt65,
      oasEligible: true,
    },
    memberB: ans.hasSpouse ? { ...DEFAULT_MEMBER_B } : undefined,
    accounts: accountsFrom(ans),
    home: ans.ownsHome && ans.homeValue > 0 ? { currentValue: ans.homeValue, appreciationPct: DEFAULT_SCENARIO.assumptions.inflationPct } : undefined,
  };

  const scenario: Scenario = {
    ...DEFAULT_SCENARIO,
    cppStartAge: ans.hasSpouse ? { memberA: 65, memberB: 65 } : { memberA: 65 },
    oasStartAge: ans.hasSpouse ? { memberA: 65, memberB: 65 } : { memberA: 65 },
    meltdown: { mode: 'none' },
    assumptions: { ...DEFAULT_SCENARIO.assumptions, targetAnnualSpending: ans.annualSpending },
    events: {},
  };

  return { household, scenario };
}

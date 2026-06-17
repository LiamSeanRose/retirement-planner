import type { Account, Household, Scenario } from '@/types/planner';

/** A representative default plan — a mid-career Group-1 member weighing retirement at 60. */
export const DEFAULT_HOUSEHOLD: Household = {
  province: 'ON',
  memberA: {
    label: 'Member A',
    birthDate: '1969-06-01',
    planJoinDate: '2006-09-01',
    currentSalary: 95_000,
    bestFiveAvgSalary: 92_000,
    pensionableServiceYears: 28,
    targetRetirementAge: 60,
    estimatedCppAt65Monthly: 1_100,
    oasEligible: true,
  },
  accounts: [
    { id: 'rrsp-1', owner: 'memberA', type: 'rrsp', currentBalance: 350_000, riskProfile: { expectedReturn: 5, volatility: 10 } },
    { id: 'tfsa-1', owner: 'memberA', type: 'tfsa', currentBalance: 90_000, riskProfile: { expectedReturn: 5, volatility: 10 } },
    { id: 'nonreg-1', owner: 'memberA', type: 'nonReg', currentBalance: 60_000, riskProfile: { expectedReturn: 4, volatility: 8 } },
  ],
};

export const DEFAULT_SCENARIO: Scenario = {
  cppStartAge: { memberA: 65 },
  oasStartAge: { memberA: 65 },
  meltdown: { mode: 'none' },
  assumptions: {
    inflationPct: 2,
    indexingPct: 2,
    endAge: 95,
    mode: 'monteCarlo',
    runs: 500,
    targetAnnualSpending: 60_000,
  },
  events: {},
};

/** Risk-profile presets surfaced in the account dropdown (return % / volatility %). */
export const RISK_PROFILES: Record<string, { expectedReturn: number; volatility: number }> = {
  Conservative: { expectedReturn: 3.5, volatility: 5 },
  Balanced: { expectedReturn: 5, volatility: 10 },
  Growth: { expectedReturn: 6.5, volatility: 14 },
  Aggressive: { expectedReturn: 7.5, volatility: 18 },
};

export function riskProfileName(rp: { expectedReturn: number; volatility: number }): string {
  for (const [name, p] of Object.entries(RISK_PROFILES)) {
    if (Math.abs(p.expectedReturn - rp.expectedReturn) < 0.01 && Math.abs(p.volatility - rp.volatility) < 0.01) return name;
  }
  return 'Custom';
}

let idCounter = 0;
export function newAccount(type: Account['type']): Account {
  idCounter += 1;
  return {
    id: `${type}-${Date.now()}-${idCounter}`,
    owner: 'memberA',
    type,
    currentBalance: 0,
    riskProfile: { ...RISK_PROFILES.Balanced },
  };
}

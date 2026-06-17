'use client';

import type { Account, AccountType, Household, Province, Scenario } from '@/types/planner';
import { newAccount, RISK_PROFILES, riskProfileName } from '@/lib/share';
import { money } from '@/lib/share';
import { Card, CardHeader, SectionLabel } from './ui/card';
import { NumberField, RangeField, Segmented, SelectField, TextField, Toggle } from './ui/controls';

const PROVINCES: { value: Province; label: string }[] = [
  ['ON', 'Ontario'], ['QC', 'Quebec'], ['BC', 'British Columbia'], ['AB', 'Alberta'], ['MB', 'Manitoba'],
  ['SK', 'Saskatchewan'], ['NB', 'New Brunswick'], ['NS', 'Nova Scotia'], ['PE', 'PEI'], ['NL', 'Newfoundland & Labrador'],
  ['YT', 'Yukon'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
].map(([value, label]) => ({ value: value as Province, label }));

const ACCOUNT_LABELS: Record<AccountType, string> = { rrsp: 'RRSP / RRIF', tfsa: 'TFSA', nonReg: 'Non-registered' };
const OWNERS = [
  { value: 'memberA' as const, label: 'A' },
  { value: 'memberB' as const, label: 'B' },
  { value: 'joint' as const, label: 'Joint' },
];
const MELTDOWN_MODES = [
  { value: 'none' as const, label: 'None' },
  { value: 'conservative' as const, label: 'Cons.' },
  { value: 'moderate' as const, label: 'Mod.' },
  { value: 'aggressive' as const, label: 'Aggr.' },
];
const WITHDRAWAL_PRESETS = [
  { value: 'taxsmart', label: 'Tax-smart', order: ['nonReg', 'rrsp', 'tfsa'] as AccountType[] },
  { value: 'rrspfirst', label: 'RRSP first', order: ['rrsp', 'nonReg', 'tfsa'] as AccountType[] },
  { value: 'tfsafirst', label: 'TFSA first', order: ['tfsa', 'nonReg', 'rrsp'] as AccountType[] },
];

function groupOf(planJoinDate: string): 1 | 2 {
  return new Date(planJoinDate).getTime() < new Date('2013-01-01T00:00:00Z').getTime() ? 1 : 2;
}

export function ScenarioLab({
  household,
  scenario,
  onHousehold,
  onScenario,
}: {
  household: Household;
  scenario: Scenario;
  onHousehold: (h: Household) => void;
  onScenario: (s: Scenario) => void;
}) {
  const m = household.memberA;
  const a = scenario.assumptions;
  const setMember = (patch: Partial<typeof m>) => onHousehold({ ...household, memberA: { ...m, ...patch } });
  const setAssumptions = (patch: Partial<typeof a>) => onScenario({ ...scenario, assumptions: { ...a, ...patch } });
  const setEvents = (patch: Partial<Scenario['events']>) => onScenario({ ...scenario, events: { ...scenario.events, ...patch } });
  const setAccounts = (accounts: Account[]) => onHousehold({ ...household, accounts });
  const patchAccount = (id: string, patch: Partial<Account>) =>
    setAccounts(household.accounts.map((acc) => (acc.id === id ? { ...acc, ...patch } : acc)));

  const retireAge = m.targetRetirementAge;
  const ev = scenario.events;
  const activePreset = WITHDRAWAL_PRESETS.find((p) => (scenario.withdrawalOrder ?? p.order).join() === p.order.join())?.value ?? 'taxsmart';

  return (
    <div className="space-y-5">
      {/* ---- Member ---- */}
      <Card>
        <CardHeader eyebrow="The member" title="Profile" aside={<span className="rounded-full bg-evergreen/10 px-2.5 py-1 text-xs font-medium text-evergreen">Group {groupOf(m.planJoinDate)}</span>} />
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Birth date" type="date" value={m.birthDate} onChange={(v) => setMember({ birthDate: v })} />
            <TextField label="Plan-join date" type="date" value={m.planJoinDate} onChange={(v) => setMember({ planJoinDate: v })} />
          </div>
          <SelectField label="Province" value={household.province} options={PROVINCES} onChange={(v) => onHousehold({ ...household, province: v })} />
          <RangeField label="Best-5 average salary" value={m.bestFiveAvgSalary} min={40_000} max={250_000} step={1_000} onChange={(v) => setMember({ bestFiveAvgSalary: v })} format={(v) => money(v)} />
          <RangeField label="Pensionable service" value={m.pensionableServiceYears} min={2} max={40} step={0.5} onChange={(v) => setMember({ pensionableServiceYears: v })} format={(v) => `${v} yrs`} />
          <RangeField label="Target retirement age" value={retireAge} min={50} max={71} step={1} onChange={(v) => setMember({ targetRetirementAge: v })} format={(v) => `age ${v}`} />
          <NumberField label="Estimated CPP at 65 (monthly)" value={m.estimatedCppAt65Monthly} onChange={(v) => setMember({ estimatedCppAt65Monthly: v })} prefix="$" step={50} />
        </div>
      </Card>

      {/* ---- Accounts ---- */}
      <Card>
        <CardHeader eyebrow="Savings" title="Accounts" aside={<span className="text-xs text-faint">{household.accounts.length} held</span>} />
        <div className="space-y-3 p-5">
          {household.accounts.map((acc) => (
            <div key={acc.id} className="rounded border border-line bg-paper/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <Segmented ariaLabel="Account type" value={acc.type} onChange={(v) => patchAccount(acc.id, { type: v })} options={(['rrsp', 'tfsa', 'nonReg'] as AccountType[]).map((t) => ({ value: t, label: ACCOUNT_LABELS[t].split(' ')[0] }))} />
                <button type="button" onClick={() => setAccounts(household.accounts.filter((x) => x.id !== acc.id))} className="ml-2 shrink-0 rounded px-2 py-1 text-xs text-faint hover:text-maple" aria-label="Remove account">
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Balance" value={acc.currentBalance} onChange={(v) => patchAccount(acc.id, { currentBalance: v })} prefix="$" step={5_000} />
                <SelectField
                  label={`Risk · ${riskProfileName(acc.riskProfile)}`}
                  value={riskProfileName(acc.riskProfile) in RISK_PROFILES ? riskProfileName(acc.riskProfile) : 'Balanced'}
                  options={Object.keys(RISK_PROFILES).map((k) => ({ value: k, label: `${k} · ${RISK_PROFILES[k].expectedReturn}%` }))}
                  onChange={(v) => patchAccount(acc.id, { riskProfile: { ...RISK_PROFILES[v] } })}
                />
              </div>
              <div className="mt-2 flex items-center gap-1">
                <span className="text-xs text-faint">Owner</span>
                <Segmented ariaLabel="Owner" value={acc.owner} onChange={(v) => patchAccount(acc.id, { owner: v })} options={OWNERS} />
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            {(['rrsp', 'tfsa', 'nonReg'] as AccountType[]).map((t) => (
              <button key={t} type="button" onClick={() => setAccounts([...household.accounts, newAccount(t)])} className="flex-1 rounded border border-dashed border-line py-2 text-xs font-medium text-muted hover:border-evergreen hover:text-evergreen">
                + {ACCOUNT_LABELS[t].split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ---- Strategy & assumptions ---- */}
      <Card>
        <CardHeader eyebrow="Levers" title="Strategy & timing" />
        <div className="space-y-4 p-5">
          <RangeField label="CPP start age" value={scenario.cppStartAge.memberA} min={60} max={70} onChange={(v) => onScenario({ ...scenario, cppStartAge: { ...scenario.cppStartAge, memberA: v } })} format={(v) => `age ${v}`} />
          <RangeField label="OAS start age" value={scenario.oasStartAge.memberA} min={65} max={70} onChange={(v) => onScenario({ ...scenario, oasStartAge: { ...scenario.oasStartAge, memberA: v } })} format={(v) => `age ${v}`} />
          <div>
            <p className="mb-1.5 text-[0.8125rem] font-medium text-muted">RRSP meltdown</p>
            <Segmented ariaLabel="Meltdown pace" value={scenario.meltdown.mode} onChange={(v) => onScenario({ ...scenario, meltdown: { ...scenario.meltdown, mode: v } })} options={MELTDOWN_MODES} />
          </div>
          <div>
            <p className="mb-1.5 text-[0.8125rem] font-medium text-muted">Withdrawal order</p>
            <Segmented ariaLabel="Withdrawal order" value={activePreset} onChange={(v) => onScenario({ ...scenario, withdrawalOrder: WITHDRAWAL_PRESETS.find((p) => p.value === v)!.order })} options={WITHDRAWAL_PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
          </div>
          <NumberField label="Target annual spending" value={a.targetAnnualSpending ?? 0} onChange={(v) => setAssumptions({ targetAnnualSpending: v })} prefix="$" step={2_500} />
          <div className="grid grid-cols-3 gap-3">
            <RangeField label="Inflation" value={a.inflationPct} min={0} max={6} step={0.1} onChange={(v) => setAssumptions({ inflationPct: v })} format={(v) => `${v.toFixed(1)}%`} />
            <RangeField label="Indexing" value={a.indexingPct} min={0} max={6} step={0.1} onChange={(v) => setAssumptions({ indexingPct: v })} format={(v) => `${v.toFixed(1)}%`} />
            <RangeField label="End age" value={a.endAge} min={85} max={105} onChange={(v) => setAssumptions({ endAge: v })} format={(v) => String(v)} />
          </div>
        </div>
      </Card>

      {/* ---- Scenario Lab events ---- */}
      <Card>
        <CardHeader eyebrow="Stress-test" title="Scenario Lab" />
        <div className="space-y-3 p-5">
          <Toggle label="Accept VDP / WFA package" description="A Transition Support Measure paid as weeks of salary in the departure year." checked={!!ev.wfaPackage} onChange={(on) => setEvents({ wfaPackage: on ? { member: 'memberA', tsmPayoutWeeks: 30, departureAge: retireAge } : undefined })}>
            {ev.wfaPackage ? (
              <>
                <RangeField label="Weeks of pay" value={ev.wfaPackage.tsmPayoutWeeks} min={4} max={52} onChange={(v) => setEvents({ wfaPackage: { ...ev.wfaPackage!, tsmPayoutWeeks: v } })} format={(v) => `${v} wks`} />
                <RangeField label="Departure age" value={ev.wfaPackage.departureAge} min={50} max={70} onChange={(v) => setEvents({ wfaPackage: { ...ev.wfaPackage!, departureAge: v } })} format={(v) => `age ${v}`} />
              </>
            ) : null}
          </Toggle>

          <Toggle label="Trigger ERI (penalty waiver)" description="Early-retirement incentive: waive the permanent early-retirement reduction." checked={!!ev.eriWaiver} onChange={(on) => setEvents({ eriWaiver: on ? { member: 'memberA' } : undefined })} />

          <Toggle label="Add second-career income" description="Consulting/private income (outside the plan) for a bounded window." checked={!!ev.secondCareerIncome} onChange={(on) => setEvents({ secondCareerIncome: on ? { member: 'memberA', annualAmount: 30_000, startAge: retireAge, endAge: retireAge + 5 } : undefined })}>
            {ev.secondCareerIncome ? (
              <>
                <NumberField label="Annual amount" value={ev.secondCareerIncome.annualAmount} onChange={(v) => setEvents({ secondCareerIncome: { ...ev.secondCareerIncome!, annualAmount: v } })} prefix="$" step={5_000} />
                <div className="grid grid-cols-2 gap-3">
                  <RangeField label="Start age" value={ev.secondCareerIncome.startAge} min={50} max={75} onChange={(v) => setEvents({ secondCareerIncome: { ...ev.secondCareerIncome!, startAge: v } })} format={(v) => `${v}`} />
                  <RangeField label="End age" value={ev.secondCareerIncome.endAge} min={50} max={80} onChange={(v) => setEvents({ secondCareerIncome: { ...ev.secondCareerIncome!, endAge: v } })} format={(v) => `${v}`} />
                </div>
              </>
            ) : null}
          </Toggle>

          <Toggle label="Simulate spouse early mortality" description="Couple mode: model the survivor transition from a given age." checked={!!ev.earlyMortality} onChange={(on) => setEvents({ earlyMortality: on ? { member: 'memberB', atAge: 80 } : undefined })}>
            {ev.earlyMortality ? (
              <RangeField label="Age at death" value={ev.earlyMortality.atAge} min={65} max={95} onChange={(v) => setEvents({ earlyMortality: { ...ev.earlyMortality!, atAge: v } })} format={(v) => `age ${v}`} />
            ) : null}
          </Toggle>
        </div>
      </Card>
    </div>
  );
}

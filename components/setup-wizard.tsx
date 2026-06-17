'use client';

import { useEffect, useState } from 'react';
import type { Household, Province, Scenario } from '@/types/planner';
import { buildPlanFromAnswers, extractCppEstimate, money, WIZARD_DEFAULTS, type CppExtraction, type WizardAnswers } from '@/lib/share';
import { NumberField, RangeField, SelectField, Segmented, Toggle } from './ui/controls';
import { AiImport } from './ai-import';

/** Private, in-browser import: paste the Service Canada estimate text and pull out the age-65 figure. */
function CppPasteImporter({ onUse }: { onUse: (amount: number) => void }) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<CppExtraction | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  return (
    <details className="rounded border border-line bg-paper/60 p-3 text-xs">
      <summary className="cursor-pointer select-none font-medium text-evergreen">Paste from your Service Canada estimate</summary>
      <div className="mt-2 space-y-2">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setFound(null); setApplied(null); }}
          rows={3}
          placeholder="Copy the estimate text from My Service Canada Account (or your statement PDF) and paste it here…"
          className="w-full rounded border border-line bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-evergreen"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setFound(extractCppEstimate(text))} disabled={!text.trim()} className="rounded border border-evergreen px-3 py-1 font-medium text-evergreen hover:bg-evergreen hover:text-paper disabled:opacity-40">
            Find my CPP
          </button>
          {found?.monthlyAt65 ? (
            <button type="button" onClick={() => { const v = Math.round(found.monthlyAt65!); onUse(v); setApplied(v); }} className="rounded border border-evergreen bg-evergreen px-3 py-1 font-medium text-paper hover:bg-evergreen-soft">
              Use ${Math.round(found.monthlyAt65).toLocaleString('en-CA')}/mo
            </button>
          ) : null}
          {applied !== null ? <span className="text-evergreen">Applied ✓</span> : null}
        </div>
        {found && !found.monthlyAt65 ? (
          <p className="text-faint">{found.candidates.length ? 'Found amounts but couldn’t tell which is the age-65 figure — enter it above.' : 'Couldn’t find a monthly amount — paste the estimate text, or just type it above.'}</p>
        ) : null}
        <p className="text-faint">Processed entirely in your browser — nothing is uploaded or sent anywhere.</p>
      </div>
    </details>
  );
}

const PROVINCES: { value: Province; label: string }[] = [
  ['ON', 'Ontario'], ['QC', 'Quebec'], ['BC', 'British Columbia'], ['AB', 'Alberta'], ['MB', 'Manitoba'],
  ['SK', 'Saskatchewan'], ['NB', 'New Brunswick'], ['NS', 'Nova Scotia'], ['PE', 'PEI'], ['NL', 'Newfoundland & Labrador'],
  ['YT', 'Yukon'], ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
].map(([value, label]) => ({ value: value as Province, label }));

const STEPS = ['About you', 'Your pension', 'CPP & OAS', 'Your savings', 'Spending'];
const THIS_YEAR = 2026;

export function SetupWizard({
  onComplete,
  onClose,
}: {
  onComplete: (household: Household, scenario: Scenario) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [ans, setAns] = useState<WizardAnswers>(WIZARD_DEFAULTS);
  const set = (patch: Partial<WizardAnswers>) => setAns((a) => ({ ...a, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const last = STEPS.length - 1;
  const finish = () => {
    const { household, scenario } = buildPlanFromAnswers(ans);
    onComplete(household, scenario);
  };
  const age = THIS_YEAR - ans.birthYear;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Guided plan setup"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animate-rise-in flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-card sm:rounded-card">
        {/* Header + progress */}
        <div className="border-b border-line px-6 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Guided setup · {step + 1} of {STEPS.length}</p>
            <button type="button" onClick={onClose} className="text-xs text-faint hover:text-maple">Skip</button>
          </div>
          <h2 className="mt-1.5 font-display text-2xl font-semibold leading-none tracking-tight text-ink">{STEPS[step]}</h2>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-evergreen' : 'bg-line'}`} />
            ))}
          </div>
        </div>

        {/* Step body */}
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <>
              <AiImport onExtract={(partial) => set(partial)} />
              <RangeField label="Your birth year" value={ans.birthYear} min={1945} max={1995} onChange={(v) => set({ birthYear: v })} format={(v) => `${v} · age ${THIS_YEAR - v}`} />
              <div>
                <p className="mb-1.5 text-[0.8125rem] font-medium text-muted">When did you join the federal public service?</p>
                <Segmented
                  ariaLabel="Plan group"
                  value={ans.joinedBefore2013 ? 'before' : 'after'}
                  onChange={(v) => set({ joinedBefore2013: v === 'before' })}
                  options={[{ value: 'before', label: 'Before 2013' }, { value: 'after', label: '2013 or later' }]}
                />
                <p className="mt-1 text-xs text-faint">This sets your pension group (1 or 2) — it drives your unreduced-retirement age.</p>
              </div>
              <SelectField label="Province you'll retire in" value={ans.province} options={PROVINCES} onChange={(v) => set({ province: v })} />
              <Toggle label="I have a spouse or partner" description="Adds a second member with pension income splitting and the survivor rule. You can fine-tune their details later." checked={ans.hasSpouse} onChange={(v) => set({ hasSpouse: v })} />
            </>
          )}

          {step === 1 && (
            <>
              <NumberField label="Best 5-year average salary" value={ans.bestFiveSalary} onChange={(v) => set({ bestFiveSalary: v })} prefix="$" step={1_000} />
              <RangeField label="Years of pensionable service (at retirement)" value={ans.serviceYears} min={2} max={40} step={0.5} onChange={(v) => set({ serviceYears: v })} format={(v) => `${v} yrs`} />
              <RangeField label="When do you want to retire?" value={ans.retireAge} min={50} max={71} onChange={(v) => set({ retireAge: v })} format={(v) => `age ${v} (in ${Math.max(0, v - age)} yr${v - age === 1 ? '' : 's'})`} />
              <p className="text-xs leading-snug text-faint">
                Your pension is <span className="text-muted">2% × best-5 salary × years of service</span>, with a bridge to 65 — we compute the exact figure and any
                reduction. Find your salary and service on a recent pay stub or your{' '}
                <a href="https://www.canada.ca/en/treasury-board-secretariat/services/pension-plan.html" target="_blank" rel="noopener noreferrer" className="text-evergreen underline decoration-line underline-offset-2 hover:decoration-evergreen">public service pension</a> statement.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <NumberField label="Estimated CPP at 65 (monthly)" value={ans.cppAt65} onChange={(v) => set({ cppAt65: v })} prefix="$" step={50} />
              <p className="text-xs leading-snug text-faint">
                Get your exact figure from{' '}
                <a href="https://www.canada.ca/en/employment-social-development/services/my-account.html" target="_blank" rel="noopener noreferrer" className="text-evergreen underline decoration-line underline-offset-2 hover:decoration-evergreen">My Service Canada Account</a>{' '}
                → “View my benefit estimates.” Not sure? ~$1,100/mo is a reasonable middle estimate; the 2026 maximum is $1,508. OAS is added automatically.
              </p>
              <CppPasteImporter onUse={(v) => set({ cppAt65: v })} />
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-1 gap-3">
                <NumberField label="RRSP / RRIF balance" value={ans.rrsp} onChange={(v) => set({ rrsp: v })} prefix="$" step={5_000} />
                <NumberField label="TFSA balance" value={ans.tfsa} onChange={(v) => set({ tfsa: v })} prefix="$" step={5_000} />
                <NumberField label="Non-registered balance" value={ans.nonReg} onChange={(v) => set({ nonReg: v })} prefix="$" step={5_000} />
              </div>
              <p className="text-xs leading-snug text-faint">From your latest RRSP/TFSA and investment statements (your bank or brokerage). Leave any you don&apos;t have at $0.</p>
              <div>
                <p className="mb-1.5 text-[0.8125rem] font-medium text-muted">How are your savings invested?</p>
                <Segmented
                  ariaLabel="Risk tolerance"
                  value={ans.riskTolerance}
                  onChange={(v) => set({ riskTolerance: v })}
                  options={[{ value: 'Conservative' as const, label: 'Conservative' }, { value: 'Balanced' as const, label: 'Balanced' }, { value: 'Growth' as const, label: 'Growth' }, { value: 'Aggressive' as const, label: 'Aggressive' }]}
                />
                <p className="mt-1 text-xs text-faint">Sets the expected return and how bumpy the ride is in the market simulations.</p>
              </div>
              <Toggle label="I own my home" description="Tracked separately from savings; passes to your estate tax-free. You can model downsizing later." checked={ans.ownsHome} onChange={(v) => set({ ownsHome: v })}>
                {ans.ownsHome ? <NumberField label="Approximate home value" value={ans.homeValue} onChange={(v) => set({ homeValue: v })} prefix="$" step={25_000} /> : null}
              </Toggle>
            </>
          )}

          {step === 4 && (
            <>
              <NumberField label="Target spending in retirement (per year, today's $)" value={ans.annualSpending} onChange={(v) => set({ annualSpending: v })} prefix="$" step={2_500} />
              <p className="text-xs leading-snug text-faint">After-tax lifestyle spending you want to fund each year. A common rule of thumb is ~70% of your pre-retirement income.</p>
              <div className="rounded border border-line bg-paper/60 p-3 text-sm text-muted">
                <p className="eyebrow mb-1.5">Your starting plan</p>
                Retire at <span className="text-ink">{ans.retireAge}</span> · best-5 <span className="text-ink tnum">{money(ans.bestFiveSalary)}</span> · <span className="text-ink tnum">{money(ans.rrsp + ans.tfsa + ans.nonReg)}</span> saved{ans.ownsHome ? <> · home <span className="text-ink tnum">{money(ans.homeValue)}</span></> : null}{ans.hasSpouse ? ' · couple' : ''}. You can change anything afterwards.
              </div>
            </>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <button type="button" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} className="rounded border border-line px-3.5 py-2 text-sm font-medium text-muted hover:border-evergreen hover:text-evergreen">
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < last ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} className="rounded border border-evergreen bg-evergreen px-5 py-2 text-sm font-medium text-paper hover:bg-evergreen-soft">
              Continue
            </button>
          ) : (
            <button type="button" onClick={finish} className="rounded border border-evergreen bg-evergreen px-5 py-2 text-sm font-medium text-paper hover:bg-evergreen-soft">
              Build my plan →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

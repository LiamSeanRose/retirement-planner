'use client';

import { useEffect, useState } from 'react';
import type { WizardAnswers } from '@/lib/share';
import { extractWithAnthropic, loadApiKey, money, saveApiKey } from '@/lib/share';

const FIELD_LABELS: Record<string, string> = {
  birthYear: 'Birth year', province: 'Province', bestFiveSalary: 'Best-5 salary', serviceYears: 'Service years',
  retireAge: 'Retire age', cppAt65: 'CPP at 65', rrsp: 'RRSP', tfsa: 'TFSA', nonReg: 'Non-reg', ownsHome: 'Owns home',
  homeValue: 'Home value', hasSpouse: 'Spouse',
};
const DOLLAR = new Set(['bestFiveSalary', 'cppAt65', 'rrsp', 'tfsa', 'nonReg', 'homeValue']);
const fmt = (k: string, v: unknown) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : DOLLAR.has(k) ? money(v as number) : String(v));

/** OPT-IN, bring-your-own-key document extraction. Sends the document to the user's AI provider — the
 * one place data leaves the device, by explicit choice. The private paste box (CPP step) stays the default. */
export function AiImport({ onExtract }: { onExtract: (partial: Partial<WizardAnswers>) => void }) {
  const [apiKey, setApiKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [imageName, setImageName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Partial<WizardAnswers> | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => setApiKey(loadApiKey()), []);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setImageDataUrl(r.result as string); setImageName(f.name); };
    r.readAsDataURL(f);
  };

  const run = async () => {
    setLoading(true); setError(''); setResult(null); setApplied(false);
    try {
      const out = await extractWithAnthropic({ apiKey, text, imageDataUrl });
      if (Object.keys(out).length === 0) setError('No fields could be read from that document. Try a clearer image or paste the text.');
      else setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong calling the AI.');
    } finally {
      setLoading(false);
    }
  };

  const entries = result ? Object.entries(result) : [];

  return (
    <details className="rounded border border-line bg-paper/60 p-3 text-xs">
      <summary className="cursor-pointer select-none font-medium text-evergreen">Smart import from a document — uses AI · optional</summary>
      <div className="mt-2 space-y-2.5">
        <p className="leading-snug text-faint">
          Reads a pay stub, pension/Service Canada statement, or investment statement and fills the whole form.
          <span className="text-muted"> Unlike the rest of this tool, this sends the document to Anthropic (your AI provider) under your own key</span> — the one
          place data leaves your device. Prefer to keep everything local? Skip this and type your numbers, or use the private paste box on the CPP step.
        </p>

        {!apiKey ? (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block font-medium text-muted">Your Anthropic API key</span>
              <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-…" className="w-full rounded border border-line bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-evergreen" autoComplete="off" />
            </label>
            <button type="button" onClick={() => { saveApiKey(keyDraft.trim()); setApiKey(keyDraft.trim()); }} disabled={!keyDraft.trim()} className="rounded border border-evergreen bg-evergreen px-3 py-1 font-medium text-paper hover:bg-evergreen-soft disabled:opacity-40">
              Save key
            </button>
            <p className="text-faint">Stored only in this browser, used to call Anthropic directly — never sent to us (there's no server). Get a key at console.anthropic.com.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Paste the document text here…" className="w-full rounded border border-line bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-evergreen" />
            <label className="flex items-center gap-2 text-faint">
              <span>or upload an image:</span>
              <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="text-xs" />
              {imageName ? <span className="text-evergreen">{imageName} ✓</span> : null}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={run} disabled={loading || (!text.trim() && !imageDataUrl)} className="rounded border border-evergreen px-3 py-1 font-medium text-evergreen hover:bg-evergreen hover:text-paper disabled:opacity-40">
                {loading ? 'Reading…' : 'Extract with AI'}
              </button>
              <button type="button" onClick={() => { saveApiKey(''); setApiKey(''); setKeyDraft(''); }} className="text-faint hover:text-maple">Forget key</button>
            </div>
            {error ? <p className="text-maple">{error}</p> : null}
            {result ? (
              <div className="space-y-1.5 rounded border border-line bg-surface p-2.5">
                <p className="font-medium text-ink">Found {entries.length} field{entries.length === 1 ? '' : 's'} — review and apply:</p>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {entries.map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-2"><span className="text-faint">{FIELD_LABELS[k] ?? k}</span><span className="tnum text-ink">{fmt(k, v)}</span></li>
                  ))}
                </ul>
                <button type="button" onClick={() => { onExtract(result); setApplied(true); }} className="rounded border border-evergreen bg-evergreen px-3 py-1 font-medium text-paper hover:bg-evergreen-soft">
                  Apply {entries.length} field{entries.length === 1 ? '' : 's'}
                </button>
                {applied ? <span className="ml-2 text-evergreen">Applied ✓ — review the steps</span> : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </details>
  );
}

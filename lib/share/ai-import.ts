/**
 * Optional "smart import" (`lib/share/ai-import`) — BRING-YOUR-OWN-KEY document extraction.
 *
 * The private, in-browser paste importer (`./import`) is the DEFAULT and needs nothing. This is an
 * OPT-IN alternative: the user supplies their own Anthropic API key (stored only in their browser, no
 * backend) and pastes text or uploads a photo of a document — a pay stub, pension statement, Service
 * Canada estimate, or investment statement — and an LLM extracts ALL the wizard fields at once.
 *
 * PRIVACY (stated plainly in the UI): unlike everything else in this tool, using this feature DOES send
 * the document text/image to the user's chosen provider (Anthropic), under the user's own key — it is
 * the one place data leaves the device, by explicit choice. The key never reaches us (there is no
 * server); the browser calls the provider directly.
 *
 * The prompt + response parsing are PURE and tested; only `extractWithAnthropic` does I/O (the fetch).
 */

import type { Province } from '../../types/planner';
import type { WizardAnswers } from './wizard';

/** A fast, inexpensive model well-suited to structured extraction. */
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const PROVINCES: Province[] = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];

const SYSTEM = [
  'You extract retirement-planning inputs from a Canadian federal public servant\'s document',
  '(a pay stub, pension/Service Canada statement, or investment statement).',
  'Return ONLY a JSON object — no prose, no markdown fences — with any of these fields you can find;',
  'OMIT any you cannot find. Do not guess.',
  'Fields: birthYear (number), province (2-letter code), bestFiveSalary (annual salary in dollars),',
  'serviceYears (years of pensionable service), retireAge (intended retirement age),',
  'cppAt65 (estimated CPP MONTHLY at age 65 specifically — not age 60 or 70),',
  'rrsp, tfsa, nonReg (account balances in dollars), ownsHome (boolean), homeValue (dollars),',
  'hasSpouse (boolean).',
].join(' ');

/** The Anthropic Messages request body. `imageDataUrl` (a `data:image/...;base64,...` URL) triggers vision. */
export function buildExtractionRequest(opts: { text?: string; imageDataUrl?: string; model?: string }): unknown {
  const content: unknown[] = [];
  if (opts.imageDataUrl) {
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(opts.imageDataUrl);
    if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: `${opts.text?.trim() ? `Document text:\n${opts.text.trim()}\n\n` : ''}Extract the fields as JSON.` });
  return {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  };
}

const inRange = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

/** Parse + VALIDATE the model's JSON into a partial set of wizard answers (only sane, in-range fields kept). */
export function parseExtraction(responseText: string): Partial<WizardAnswers> {
  // Tolerate code fences or surrounding prose: grab the first {...} block.
  const match = responseText.match(/\{[\s\S]*\}/);
  if (!match) return {};
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return {};
  }

  const out: Partial<WizardAnswers> = {};
  if (inRange(raw.birthYear, 1930, 2010)) out.birthYear = Math.round(raw.birthYear);
  if (typeof raw.province === 'string' && (PROVINCES as string[]).includes(raw.province.toUpperCase())) out.province = raw.province.toUpperCase() as Province;
  if (inRange(raw.bestFiveSalary, 20_000, 500_000)) out.bestFiveSalary = Math.round(raw.bestFiveSalary);
  if (inRange(raw.serviceYears, 0, 40)) out.serviceYears = raw.serviceYears;
  if (inRange(raw.retireAge, 50, 71)) out.retireAge = Math.round(raw.retireAge);
  if (inRange(raw.cppAt65, 0, 2_500)) out.cppAt65 = Math.round(raw.cppAt65);
  if (inRange(raw.rrsp, 0, 50_000_000)) out.rrsp = Math.round(raw.rrsp);
  if (inRange(raw.tfsa, 0, 50_000_000)) out.tfsa = Math.round(raw.tfsa);
  if (inRange(raw.nonReg, 0, 50_000_000)) out.nonReg = Math.round(raw.nonReg);
  if (typeof raw.ownsHome === 'boolean') out.ownsHome = raw.ownsHome;
  if (inRange(raw.homeValue, 0, 50_000_000)) out.homeValue = Math.round(raw.homeValue);
  if (typeof raw.hasSpouse === 'boolean') out.hasSpouse = raw.hasSpouse;
  return out;
}

/** Call Anthropic directly from the browser (BYOK) and return the extracted fields. Throws on HTTP / parse error. */
export async function extractWithAnthropic(opts: { apiKey: string; text?: string; imageDataUrl?: string; model?: string }): Promise<Partial<WizardAnswers>> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildExtractionRequest(opts)),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Extraction failed (${res.status}). ${res.status === 401 ? 'Check your API key.' : body.slice(0, 160)}`);
  }
  const data = await res.json();
  const text: string = data?.content?.find((c: { type?: string }) => c?.type === 'text')?.text ?? data?.content?.[0]?.text ?? '';
  return parseExtraction(text);
}

// --- BYOK key storage (this browser only; never sent to us — there is no server) ------------------
const KEY_STORAGE = 'almanac.anthropicKey';

export function loadApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}
export function saveApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage disabled — ignore */
  }
}

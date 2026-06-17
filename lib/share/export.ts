/**
 * Plan export (`lib/share/export`) — pure string builders, no I/O.
 *
 * Turns a computed projection into a portable artifact (CSV) the user can open in a spreadsheet or
 * hand to an advisor. Pure: it returns a string; the calling component does the browser download. The
 * companion "Save as PDF" path is the browser's own print-to-PDF over the existing print stylesheet,
 * so it needs no heavy PDF dependency.
 */

import type { ScenarioResult, YearRow } from '../../types/planner';

const round = (n: number): number => Math.round(n);

/** One CSV column: a header label and how to pull its cell from a year row. */
const COLUMNS: [string, (r: YearRow) => number | string][] = [
  ['Year', (r) => r.year],
  ['Age', (r) => r.ageA],
  ['Spouse age', (r) => r.ageB ?? ''],
  ['Pension', (r) => round(r.pension)],
  ['Bridge', (r) => round(r.bridge)],
  ['CPP', (r) => round(r.cpp)],
  ['OAS', (r) => round(r.oas)],
  ['Second career', (r) => round(r.secondCareer)],
  ['Lump sum', (r) => round(r.lumpSum)],
  ['RRIF/LIF minimum', (r) => round(r.rrifMin)],
  ['Registered withdrawal', (r) => round(r.rrifExtra)],
  ['TFSA withdrawal', (r) => round(r.tfsaWd)],
  ['Non-reg income', (r) => round(r.nonRegInc)],
  ['Taxable income', (r) => round(r.taxableIncome)],
  ['Tax', (r) => round(r.tax)],
  ['OAS clawback', (r) => round(r.oasClawback)],
  ['After-tax income', (r) => round(r.afterTax)],
  ['RRSP/RRIF balance', (r) => round(r.balances.rrsp)],
  ['LIRA/LIF balance', (r) => round(r.balances.lira)],
  ['TFSA balance', (r) => round(r.balances.tfsa)],
  ['Non-reg balance', (r) => round(r.balances.nonReg)],
  ['Home value', (r) => round(r.homeValue)],
  ['Liquid net worth', (r) => round(r.netWorth)],
];

/** Quote a cell only if it could break CSV (comma, quote, newline) — numbers and plain labels pass through. */
function cell(v: number | string): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The full year-by-year projection as CSV text (header row + one row per projected year). */
export function projectionToCsv(result: ScenarioResult): string {
  const header = COLUMNS.map(([label]) => cell(label)).join(',');
  const rows = result.rows.map((r) => COLUMNS.map(([, get]) => cell(get(r))).join(','));
  return [header, ...rows].join('\n');
}

/** A filesystem-safe filename from a plan name, e.g. "Retire at 60" → "retire-at-60-projection.csv". */
export function csvFilename(planName: string): string {
  const slug = planName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
  return `${slug}-projection.csv`;
}

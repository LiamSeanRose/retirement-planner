/** Display formatters. Compact, tabular-friendly, Canadian-dollar. */

export function money(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '—';
  if (opts.compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);
}

export function pct(fraction0to1: number, digits = 0): string {
  if (!Number.isFinite(fraction0to1)) return '—';
  return `${(fraction0to1 * 100).toFixed(digits)}%`;
}

export function ordinalAge(age: number): string {
  return `age ${age}`;
}

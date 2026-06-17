/**
 * Local, private import helpers (`lib/share/import`).
 *
 * Extract a figure from text the user PASTES — from My Service Canada Account, a CPP Statement of
 * Contributions, or the estimate PDF — so they don't have to hunt for and re-type it. Pure and
 * dependency-free: it runs on text already in the browser. Nothing is uploaded or sent anywhere.
 *
 * The CPP estimate usually lists amounts at several start ages (60 / 65 / 70); the projection wants the
 * age-65 figure (it applies the start-age adjustment itself), so the parser disambiguates by the age
 * written next to each amount and falls back to a single lone amount.
 */

/** A money amount found in the text, with any retirement age written next to it. */
export interface MoneyHit {
  amount: number;
  age?: number;
}

export interface CppExtraction {
  /** Best-guess monthly CPP retirement pension at age 65, when one can be confidently identified. */
  monthlyAt65?: number;
  /** Every monthly-sized amount found (with any nearby age) — for transparency / manual choice. */
  candidates: MoneyHit[];
}

// Amounts are written with cents (e.g. "$1,433.00" or "964.90"); commas are optional.
const MONEY = /\$?\s*(\d[\d,]*\.\d{2})\b/g;
// Plausible monthly-CPP window — excludes tiny figures and large account balances.
const MIN_MONTHLY = 100;
const MAX_MONTHLY = 3000;

/**
 * The retirement age (60–71) written CLOSEST to an amount — the one immediately preceding it on a
 * "At age 65: $X" line, even when several amounts sit close together. The amount text itself is
 * excluded (so the "65" inside "$1,265.00" is never read as an age).
 */
function nearbyAge(text: string, start: number, end: number): number | undefined {
  const beforeStart = Math.max(0, start - 40);
  const before = text.slice(beforeStart, start);
  const after = text.slice(end, end + 10);
  const hits: { age: number; dist: number }[] = [];
  for (const m of before.matchAll(/\b(6[0-9]|7[01])\b/g)) {
    hits.push({ age: Number(m[1]), dist: start - (beforeStart + (m.index ?? 0) + m[0].length) });
  }
  for (const m of after.matchAll(/\b(6[0-9]|7[01])\b/g)) {
    hits.push({ age: Number(m[1]), dist: m.index ?? 0 });
  }
  if (hits.length === 0) return undefined;
  hits.sort((a, b) => a.dist - b.dist);
  return hits[0].age;
}

/** Pull the monthly CPP-at-65 estimate (and all monthly-sized candidates) out of pasted statement text. */
export function extractCppEstimate(text: string): CppExtraction {
  const candidates: MoneyHit[] = [];
  for (const m of text.matchAll(MONEY)) {
    const amount = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount < MIN_MONTHLY || amount > MAX_MONTHLY) continue;
    const start = m.index ?? 0;
    candidates.push({ amount, age: nearbyAge(text, start, start + m[0].length) });
  }

  const at65 = candidates.filter((c) => c.age === 65);
  let monthlyAt65: number | undefined;
  if (at65.length >= 1) monthlyAt65 = Math.max(...at65.map((c) => c.amount));
  else if (candidates.length === 1) monthlyAt65 = candidates[0].amount; // a lone amount ⇒ assume it's the one
  return { monthlyAt65, candidates };
}

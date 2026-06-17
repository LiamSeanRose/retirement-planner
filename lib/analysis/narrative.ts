/**
 * Plain-English plan narration (`/lib/analysis/narrative.ts`).
 *
 * Turns the ALREADY-COMPUTED plan into a few warm, readable sentences a non-specialist can follow —
 * the "explain my plan" experience, generated deterministically from the engine's own numbers, so it's
 * accurate by construction and nothing leaves the device. Pure: it reads a `ScenarioResult` and the
 * scenario/household, and returns ordered sentences. The engine stays authoritative; this only narrates it.
 */

import type { Household, Scenario, ScenarioResult } from '../../types/planner';

function money(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const r = Math.round(n);
  return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString('en-CA');
}

/** "a", "a and b", "a, b, and c". */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export interface NarrativeInput {
  household: Household;
  scenario: Scenario;
  result: ScenarioResult;
  /** Monte Carlo probability of success in [0, 1], when available — adds the "succeeds X% of the time" line. */
  successProbability?: number;
}

/**
 * Narrate the plan as ordered plain-English sentences: retirement & pension, the bridge, the income
 * picture, sustainability/confidence, the lifetime-tax + estate story, and any "if this happens"
 * contingencies already baked into the numbers.
 */
export function narratePlan({ household, scenario, result, successProbability }: NarrativeInput): string[] {
  const out: string[] = [];
  const a = household.memberA;
  const couple = !!household.memberB;
  const subject = couple ? 'You and your spouse' : 'You';
  const retire = a.targetRetirementAge;
  const endAge = scenario.assumptions.endAge;
  const reduction = result.reductionPct.memberA ?? 0;
  const rows = result.rows;
  const firstRow = rows[0];
  const at65 = rows.find((r) => r.ageA === 65);

  // 1. Retirement age + early-retirement reduction.
  const redText =
    reduction > 0.0001
      ? `with a permanent early-retirement reduction of about ${(reduction * 100).toFixed(0)}% — you're leaving before an unreduced milestone`
      : `with no early-retirement penalty: you've reached an unreduced pension milestone`;
  out.push(`${subject} plan to retire at ${retire}, ${redText}.`);

  // 2. The bridge benefit (pre-65 only).
  if (retire < 65 && firstRow && firstRow.bridge > 0) {
    out.push(
      `Until 65 your pension includes a bridge benefit (about ${money(firstRow.bridge)}/yr at first) that fills the gap before CPP and OAS — it stops at 65, by design, as those begin.`,
    );
  }

  // 3. The income picture: guaranteed income at the start, after-tax income once it settles.
  if (firstRow) {
    const guaranteed = firstRow.pension + firstRow.bridge + firstRow.cpp + firstRow.oas;
    out.push(
      `In your first year you'll have roughly ${money(guaranteed)} of guaranteed income (pension${firstRow.bridge > 0 ? ' plus bridge' : ''})${
        at65 ? `, settling to about ${money(at65.afterTax)} of after-tax income around 65 once CPP and OAS are in` : ''
      }.`,
    );
  }

  // 4. Sustainability + Monte Carlo confidence.
  const pct = successProbability !== undefined ? Math.round(successProbability * 100) : undefined;
  if (result.totals.lastsToEndAge) {
    out.push(
      `On these assumptions your savings comfortably last to age ${endAge}${
        pct !== undefined ? `, and across a thousand market simulations the plan holds up about ${pct}% of the time` : ''
      }.`,
    );
  } else {
    const short = rows.find((r) => r.netWorth <= 1);
    out.push(
      `Heads up: on these assumptions your savings run short around age ${short ? short.ageA : endAge}${
        pct !== undefined ? ` (about ${pct}% of market simulations still reach ${endAge})` : ''
      } — trimming spending, retiring a little later, or deferring CPP/OAS would close the gap.`,
    );
  }

  // 5. Lifetime tax, the meltdown, and the estate.
  const meltOff = scenario.meltdown.mode === 'none';
  out.push(
    `Over your lifetime you'd pay about ${money(result.totals.lifetimeTax)} in tax and leave an estate of roughly ${money(
      result.totals.estateValue,
    )} after the final tax bill.${
      meltOff
        ? ` A lot of that tax is the RRIF "tax bomb" from forced withdrawals later — drawing your RRSP down earlier (an RRSP meltdown) can shrink it and grow what you leave behind.`
        : ` Your RRSP meltdown is already working to defuse the RRIF tax bomb.`
    }`,
  );

  // 6. "If this happens" contingencies already baked into the numbers above.
  const ev = scenario.events;
  const modelled: string[] = [];
  if (ev.longTermCare) modelled.push(`long-term care of ${money(ev.longTermCare.annualAmount)}/yr from age ${ev.longTermCare.startAge}`);
  if (ev.oneTimeExpense) modelled.push(`a one-time ${money(ev.oneTimeExpense.amount)} expense at ${ev.oneTimeExpense.atAge}`);
  if (ev.windfall) modelled.push(`a tax-free ${money(ev.windfall.amount)} windfall at ${ev.windfall.atAge}`);
  if (ev.homeDownsize) modelled.push(`downsizing the home at ${ev.homeDownsize.atAge}`);
  if (scenario.assumptions.cashWedge) modelled.push(`a ${scenario.assumptions.cashWedge.years}-year cash wedge`);
  if (ev.secondCareerIncome) modelled.push(`second-career income to ${ev.secondCareerIncome.endAge}`);
  if (ev.earlyMortality) modelled.push(`an early death at ${ev.earlyMortality.atAge}`);
  if (modelled.length > 0) {
    out.push(`The numbers above already factor in ${listJoin(modelled)} — flip these on and off in the Scenario Lab to see how each one moves your plan.`);
  }

  return out;
}

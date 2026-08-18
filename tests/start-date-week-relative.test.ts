/**
 * `isWeekRelative` must agree with what the parser actually does.
 *
 * The event cache key appends the resolved first weekday only for `start_date` values
 * whose window moves with it. Getting that set wrong is silent in both directions, and
 * asymmetric in cost: naming one option too many splits a cache entry that could have
 * been shared, while naming one too few hands two genuinely different windows the same
 * entry, so a Sunday-start profile renders a Monday-start week until the TTL expires.
 *
 * The under-matching half is not hypothetical — it shipped on this branch. The predicate
 * used to be a regex over the raw config value in `getBaseCacheKey`, and `getTimeWindow`
 * trims before parsing while the regex did not, so a quoted `" start_of_week"` resolved
 * week-relatively and was keyed as if absolute.
 *
 * Restating the rule here would inherit whatever the implementation believes, so this
 * derives the answer a second way instead: resolve each expression under every first
 * weekday and see whether the date it lands on actually moves. Both directions then fail
 * — an anchor or operator that starts reading `firstDayOfWeek` without being declared, and
 * a value declared week-relative that resolves identically all seven ways.
 *
 * Swept across a full week of reference dates, because a single `now` can hide a
 * difference: `start_of_week` and `monday` resolve to the same day when today *is* the
 * start of a Monday week.
 */

import { describe, expect, it } from 'vitest';

import { isWeekRelative, parseStartDateExpression } from '../src/utils/start-date';

/** Every first weekday Home Assistant can resolve to. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** A week of reference dates, so no single weekday's coincidences decide the answer. */
const REFERENCE_DATES = Array.from({ length: 7 }, (_, offset) => new Date(2026, 5, 15 + offset));

/** Local calendar day, so a DST transition cannot make two equal dates compare unequal. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Whether an expression's resolved date actually moves with the first weekday.
 *
 * This is the independent oracle: it asks the parser rather than the predicate.
 *
 * @param expression - `start_date` value to resolve
 * @returns `true` when any reference date resolves two ways across the seven weekdays
 */
function resolvedDateMoves(expression: string): boolean {
  return REFERENCE_DATES.some((now) => {
    const landings = new Set(
      WEEKDAYS.map((firstDayOfWeek) => {
        const parsed = parseStartDateExpression(expression, firstDayOfWeek, now);
        return parsed.kind === 'ok' ? dayKey(parsed.date) : parsed.kind;
      }),
    );

    return landings.size > 1;
  });
}

/** Expressions the grammar accepts, spanning every anchor and every operator form. */
const GRAMMAR = [
  'today',
  'start_of_week',
  'monday',
  'mon',
  'sunday',
  'sun',
  'saturday',
  'sat',
  'wednesday',
  'wed',
  '+7',
  '-3',
  'today+7',
  'today-1w',
  'today+sat',
  'today-mon',
  'start_of_week+7',
  'start_of_week-3',
  'start_of_week+1w',
  'start_of_week-1w',
  'start_of_week+sat',
  'monday+1w',
  'monday-1w',
  'sat+3',
  'sun-2w',
  // Whitespace and case are normalized by the parser, so the predicate must normalize
  // them too. The padded form is the exact shape that produced the cache collision.
  ' start_of_week',
  'start_of_week ',
  ' start_of_week ',
  'START_OF_WEEK',
  'Start_Of_Week',
  'start_of_week + 1w',
  ' monday ',
  'TODAY+7',
];

describe('isWeekRelative agrees with the parser', () => {
  it.each(GRAMMAR)('%s', (expression) => {
    expect(isWeekRelative(expression)).toBe(resolvedDateMoves(expression));
  });

  it('finds both answers across the sample, so neither side is trivially satisfied', () => {
    // Without this, a predicate hard-coded to `false` would pass every case above if the
    // sample happened to contain no week-relative value, and vice versa.
    const relative = GRAMMAR.filter((expression) => resolvedDateMoves(expression));
    const absolute = GRAMMAR.filter((expression) => !resolvedDateMoves(expression));

    expect(relative.length).toBeGreaterThan(0);
    expect(absolute.length).toBeGreaterThan(0);
  });
});

describe('isWeekRelative on values outside the grammar', () => {
  // These never reach the parser's weekday handling at all, so the resolved-date oracle
  // has nothing to say about them. They are pinned directly because the regex this
  // replaced got one of them wrong: `end_of_week` matched it and is not an anchor here.
  it.each(['end_of_week', '2026-06-17', '2026-06-17T09:00:00', 'nonsense', '', '   '])(
    '%s is not week-relative',
    (value) => {
      expect(isWeekRelative(value)).toBe(false);
    },
  );
});

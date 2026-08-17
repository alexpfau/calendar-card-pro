/**
 * A `start_date` that never existed must fall back, not slide.
 *
 * The fixed-date branch of `getTimeWindow` bounds the parts it parses — month 1-12,
 * day 1-31 — and then checks the constructed date with `isNaN`. That check cannot fire.
 * `new Date(2025, 1, 30)` is not an error in JavaScript; February 30 rolls forward into
 * March 2, and the result is a perfectly valid `Date`. So every impossible day that
 * survived the 1-31 bound silently selected a different day, while the branch's own
 * warning promised a fallback to today that never happened.
 *
 * It is a quiet failure in the worst way: the card renders, the window looks plausible,
 * and nothing in the log says the date the user wrote is not the date they got. The fix
 * reads the parts back off the constructed date, which is the only way to distinguish a
 * real date from one the runtime moved.
 *
 * The controls matter as much as the table. February 28 in a common year and February 29
 * in a leap year are the dates a naive "day must be ≤ 28" guard would wrongly reject, so
 * they pin that the fix rejects impossible dates rather than merely unusual ones.
 *
 * December 31 and January 1 are there for the other half of the guard: they are the only
 * dates that hold its month bounds down. Every other keeper sits mid-year, so narrowing
 * `month >= 1` or `month <= 12` by one would leave the whole suite green while silently
 * sending every January or December `start_date` to today. Neither is redundant with the
 * other — each pins one end — and neither is redundant with the day bounds, which the
 * mid-month dates already cover.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

/** Local noon on a fixed common-year day, so "today" is unambiguous. */
const FROZEN_NOW = new Date(2025, 0, 10, 12, 0, 0);

/** The date key `getTimeWindow` resolves a `start_date` to. */
function resolvedStart(startDate: string): string {
  const window = EventUtils.getTimeWindow(3, startDate, 1);
  return FormatUtils.getLocalDateKey(window.start);
}

describe('impossible fixed start dates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2025-02-28', 'the last day of a common February'],
    ['2024-02-29', 'the leap day of a leap year'],
    ['2025-12-31', 'the last day of a year'],
    ['2025-01-01', 'the first day of a year'],
  ])('keeps %s, %s', (input) => {
    expect(resolvedStart(input)).toBe(input);
  });

  it.each([
    '2025-02-29',
    '2025-02-30',
    '2025-02-31',
    '2025-04-31',
    '2025-06-31',
    '2025-09-31',
    '2025-11-31',
  ])('falls back to today for %s rather than rolling it forward', (input) => {
    expect(resolvedStart(input)).toBe('2025-01-10');
  });

  it('never resolves an impossible date to a date in another month', () => {
    // The specific old failure: February 30 became March 2, three days out and in the
    // wrong month, which is exactly the shape a user would never think to check for.
    const resolved = resolvedStart('2025-02-30');
    expect(resolved.startsWith('2025-03')).toBe(false);
  });
});

/** Guards against the fixed-date branch being reached with a non-fixed value. */
describe('fixed start dates that are not impossible', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('still honours an explicit in-range date', () => {
    const window = EventUtils.getTimeWindow(3, '2025-07-01', 1);
    expect(FormatUtils.getLocalDateKey(window.start)).toBe('2025-07-01');
    expect(window.start.getHours()).toBe(0);
  });

  it('still falls back for a malformed date', () => {
    expect(resolvedStart('2025-13-01')).toBe('2025-01-10');
  });

  it('accepts a configuration carrying the fallback without throwing', () => {
    const config = { ...Config.DEFAULT_CONFIG, start_date: '2025-02-30' } as Types.Config;
    expect(() => EventUtils.getTimeWindow(config.days_to_show, config.start_date, 1)).not.toThrow();
  });
});

/**
 * A relative expression whose arithmetic leaves the representable range must fall back too.
 *
 * The two branches of `getTimeWindow` that build a `Date` from text disagreed. The ISO
 * branch checked its result with `isNaN` and fell back to today; the relative-expression
 * branch trusted `kind === 'ok'` and assigned straight through. But `kind` reports whether
 * the *grammar* parsed, not whether the resulting date exists: `today+99999999` is a single
 * well-formed operator, so it parses, and then overflows JavaScript's ±275760-year `Date`
 * range into `Invalid Date`.
 *
 * That produced the one outcome the docs explicitly promise cannot happen — no warning, no
 * fallback, no fetch, and an empty card — while `MAX_OPERATORS` gave the impression the
 * expression grammar was already bounded. It bounds the operator *count*; nothing bounded
 * the operand magnitude.
 *
 * The controls separate the two bounds deliberately. A nine-operator expression is rejected
 * by the count bound and a small operand resolves normally, so a test that only checked
 * "absurd input falls back" would pass on the count bound alone and never touch the
 * magnitude path this pins.
 */
describe('relative start dates that overflow the representable range', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['today+99999999', 'today+999999999', 'today-999999999'])(
    'falls back to today for %s rather than yielding an invalid date',
    (input) => {
      expect(resolvedStart(input)).toBe('2025-01-10');
    },
  );

  it('honours an in-range negative offset even when it is absurd', () => {
    // The negative operand above is deliberately larger than the positive ones, because
    // `Date`'s bounds are not symmetric about 2025: forward reaches +275760 in ~273,735
    // years, backward reaches -271821 in ~273,846. So 99,999,999 days overflows forward
    // and does *not* overflow backward — it lands on a real date in year -271766.
    //
    // That is not the defect this block pins. An instruction the runtime can represent is
    // carried out, however silly; only an unrepresentable one falls back. Asserting the
    // fallback here instead would quietly widen the guard into a range policy nobody chose.
    expect(resolvedStart('today-99999999')).toBe('-271766-05-01');
  });

  it('never hands an invalid date to the caller', () => {
    const window = EventUtils.getTimeWindow(3, 'today+99999999', 1);
    expect(Number.isNaN(window.start.getTime())).toBe(false);
  });

  it('still resolves an in-range relative offset', () => {
    // Control: the same single-operator grammar, small operand. If this ever falls back,
    // the guard above is over-broad and has swallowed the whole relative-date feature.
    expect(resolvedStart('today+7')).toBe('2025-01-17');
  });

  it('still rejects too many operators by the separate count bound', () => {
    // Control for the other bound: nine operators is refused before magnitude matters.
    expect(resolvedStart('today+1+1+1+1+1+1+1+1+1')).toBe('2025-01-10');
  });
});

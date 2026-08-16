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
 * The two controls matter as much as the table. February 28 in a common year and
 * February 29 in a leap year are the dates a naive "day must be ≤ 28" guard would
 * wrongly reject, so they pin that the fix rejects impossible dates rather than merely
 * unusual ones.
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

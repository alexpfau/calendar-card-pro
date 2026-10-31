import { describe, expect, it } from 'vitest';

import { newEventDate } from '../src/interaction/add-event';

/**
 * Whether today is one of the days the card shows, across a DST transition.
 *
 * `newEventDate` decides whether to start a new event now or on the card's first day by
 * comparing now against a window built from local midnights. Under the `unit` project's
 * `TZ=UTC` every day is 24 hours long, so building the window's end as the start plus
 * `days * 86_400_000` would pass there and be an hour wrong on two days a year everywhere
 * else: on a 23-hour day the window would reach an hour into the next day, and on a
 * 25-hour day it would stop an hour short of midnight.
 *
 * Each zone finds its own transitions rather than naming dates, because Berlin, Sydney
 * and New York change on different days and in opposite seasons. No zone is uniquely
 * required: any zone with both kinds of transition sees both failures.
 */

const DAY_MS = 86_400_000;

/** The first local day of 2026 whose length is not 24 hours and has the given sign. */
function transitionDay(longer: boolean): Date {
  for (let day = 0; day < 366; day++) {
    const start = new Date(2026, 0, 1 + day);
    const length = new Date(2026, 0, 2 + day).getTime() - start.getTime();
    if (length !== DAY_MS && length > DAY_MS === longer) return start;
  }
  throw new Error('No DST transition in 2026 in this zone');
}

describe('newEventDate across a DST transition', () => {
  it('runs under a zone that observes DST', () => {
    const january = new Date(2026, 0, 1).getTimezoneOffset();
    const july = new Date(2026, 6, 1).getTimezoneOffset();
    expect(january).not.toBe(july);
  });

  it.each([
    ['a 23-hour day', false],
    ['a 25-hour day', true],
  ])('shows %s from midnight to midnight', (_name, longer) => {
    const start = transitionDay(longer);
    const nextMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    expect(nextMidnight.getTime() - start.getTime()).not.toBe(DAY_MS);

    const lastMoment = new Date(nextMidnight.getTime() - 1);
    expect(newEventDate(start, 1, lastMoment)).toEqual(lastMoment);
    expect(newEventDate(start, 1, nextMidnight)).toEqual(start);
  });
});

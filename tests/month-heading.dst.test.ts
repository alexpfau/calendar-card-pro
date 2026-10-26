import { describe, expect, it } from 'vitest';

import * as Paging from '../src/utils/paging';

/**
 * The toolbar's month heading in real time zones.
 *
 * Under the `unit` project's UTC, a local calendar day and a UTC one are the same day, so a
 * heading formatted in UTC would read correctly there and wrong everywhere else. This file runs
 * under Berlin, Sydney and New York instead (the `*.dst.test.ts` projects in
 * `vitest.config.mjs`).
 *
 * The oracle is English month names written out, indexed by the day's own local month, so it
 * shares nothing with the `Intl` formatting under test. Every day of two years is checked at
 * local midnight, where a page starts, and at 23:30. Midnight is what Berlin and Sydney, ahead
 * of UTC, catch: there the first of a month is still the last of the previous one in UTC.
 * 23:30 is what New York, behind UTC, catches: there the last of a month is already the first
 * of the next. No zone is the only one able to see a heading formatted in UTC; each sees it at
 * one end of the month.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

describe('the month heading is the local month', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    const january = new Date(2026, 0, 1).getTimezoneOffset();
    const july = new Date(2026, 6, 1).getTimezoneOffset();
    expect(january).not.toBe(july);
  });

  it('names the month every local day falls in, at either end of the day', () => {
    const wrong: string[] = [];
    for (let date = new Date(2026, 0, 1); date.getFullYear() < 2028;) {
      for (const [hours, minutes] of [
        [0, 0],
        [23, 30],
      ]) {
        const moment = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          hours,
          minutes,
        );
        const expected = `${MONTHS[moment.getMonth()]} ${moment.getFullYear()}`;
        const heading = Paging.monthHeading(moment, 'en');
        if (heading !== expected) wrong.push(`${moment.toString()}: ${heading}`);
      }
      date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    }
    expect(wrong).toEqual([]);
  });
});

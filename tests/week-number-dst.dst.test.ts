import { describe, expect, it } from 'vitest';

import { getISOWeekNumber, getSimpleWeekNumber, getWeekNumber } from '../src/utils/format';

/**
 * Week numbers across a DST boundary.
 *
 * This file is deliberately excluded from the main `unit` project and run twice
 * instead — once under `Europe/Berlin`, once under `Australia/Sydney` (see the
 * `projects` list in `vitest.config.mjs`). That is not redundancy. The rest of the
 * suite pins `TZ: 'UTC'`, which is the right default and is also precisely why the
 * bug these tests pin went unnoticed: UTC has no DST transitions, so under the
 * main project both implementations were correct and every assertion passed.
 *
 * Both functions used to read local date fields and then subtract absolute
 * milliseconds. Whenever a DST transition sits between Jan 1 and the date, the
 * elapsed time is not a whole number of days, and the fractional remainder tipped
 * the rounding by a whole week for roughly one date in seven:
 *
 * | Zone              | old `getISOWeekNumber` | old `getSimpleWeekNumber` |
 * | ----------------- | ---------------------- | ------------------------- |
 * | UTC               | correct                | correct                   |
 * | Europe/Berlin     | correct                | 1286 wrong dates          |
 * | America/New_York  | correct                | 1428 wrong dates          |
 * | Australia/Sydney  | 546 wrong dates        | correct                   |
 * | Pacific/Auckland  | 525 wrong dates        | correct                   |
 *
 * The hemispheres are opposite because the drift is negative north of the equator
 * and positive south of it, and one function ceils where the other floors. So the
 * two zones below are the minimum that fails on the unfixed code: Berlin catches
 * the simple bug, Sydney the ISO one, and neither catches both.
 *
 * Every expected value here is a fixed property of the calendar, not of the
 * machine, so the same numbers must hold in both zones — a value that changes
 * with the zone is itself the failure.
 */
describe('week numbers are independent of the local time zone', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2025, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2025, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });

  describe('getISOWeekNumber', () => {
    // Textbook ISO-8601 boundaries, independent of this project.
    it.each([
      { date: '2021-01-01', y: 2021, m: 0, d: 1, week: 53 },
      { date: '2015-12-31', y: 2015, m: 11, d: 31, week: 53 },
      { date: '2019-12-30', y: 2019, m: 11, d: 30, week: 1 },
      { date: '2016-01-04', y: 2016, m: 0, d: 4, week: 1 },
      { date: '2018-01-01', y: 2018, m: 0, d: 1, week: 1 },
    ])('$date is ISO week $week', ({ y, m, d, week }) => {
      expect(getISOWeekNumber(new Date(y, m, d))).toBe(week);
    });

    // Dates the southern-hemisphere drift used to push a week forward.
    it.each([
      { date: '2016-04-04', y: 2016, m: 3, d: 4, week: 14 },
      { date: '2016-04-05', y: 2016, m: 3, d: 5, week: 14 },
      { date: '2016-04-06', y: 2016, m: 3, d: 6, week: 14 },
      { date: '2025-04-07', y: 2025, m: 3, d: 7, week: 15 },
    ])('$date is ISO week $week across a DST boundary', ({ y, m, d, week }) => {
      expect(getISOWeekNumber(new Date(y, m, d))).toBe(week);
    });
  });

  describe('getSimpleWeekNumber', () => {
    // Dates the northern-hemisphere drift used to pull a week backward.
    it.each([
      { date: '2015-03-30', y: 2015, m: 2, d: 30, fdow: 1, week: 14 },
      { date: '2015-04-05', y: 2015, m: 3, d: 5, fdow: 0, week: 15 },
      { date: '2015-04-06', y: 2015, m: 3, d: 6, fdow: 1, week: 15 },
      { date: '2025-06-15', y: 2025, m: 5, d: 15, fdow: 0, week: 25 },
      { date: '2025-06-16', y: 2025, m: 5, d: 16, fdow: 1, week: 25 },
    ])(
      '$date with firstDayOfWeek=$fdow is week $week across a DST boundary',
      ({ y, m, d, fdow, week }) => {
        expect(getSimpleWeekNumber(new Date(y, m, d), fdow)).toBe(week);
      },
    );

    it('counts January 1 as week 1 regardless of first day of week', () => {
      expect(getSimpleWeekNumber(new Date(2026, 0, 1), 0)).toBe(1);
      expect(getSimpleWeekNumber(new Date(2026, 0, 1), 1)).toBe(1);
    });
  });

  describe('getWeekNumber', () => {
    it('propagates the corrected ISO result', () => {
      expect(getWeekNumber(new Date(2016, 3, 4), 'iso', 1)).toBe(14);
    });

    it('propagates the corrected simple result', () => {
      expect(getWeekNumber(new Date(2015, 3, 5), 'simple', 0)).toBe(15);
    });

    it('defaults to ISO when no method is configured', () => {
      expect(getWeekNumber(new Date(2016, 3, 4), null, 1)).toBe(14);
    });
  });
});

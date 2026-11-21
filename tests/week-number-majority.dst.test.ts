import { describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import { calculateWeekNumberWithMajorityRule } from '../src/utils/events';

/**
 * An ISO week number for a week that does not start on Monday, which Home Assistant allows on
 * any weekday (`locale.first_weekday`).
 *
 * ISO numbers Monday-to-Sunday weeks, so a week starting on another day straddles two ISO weeks
 * and is given the one that owns most of its seven days. That is always the ISO week of its
 * fourth day, the start plus three: on a Friday start Monday, on a Saturday start Tuesday, on a
 * Sunday start Wednesday. Only Sunday was corrected, so a Friday or Saturday week took the number
 * of the ISO week its first day ended, the one owning three or two of its days: the row starting
 * Friday 1 January 2027 read 53, though four of its days are week 1.
 *
 * Every expected number is taken from Monday-to-Sunday weeks on a printed calendar, not computed,
 * and is asked of every day of the week, because List numbers each day and draws its week rule
 * wherever the number changes. A `.dst.test.ts` file so the days are stepped across a real
 * offset: November 2026 crosses no change, and the Azores spring day is covered below.
 */

const ISO = { show_week_numbers: 'iso' } as Types.Config;
const SIMPLE = { show_week_numbers: 'simple' } as Types.Config;

/** The seven dates of a week, at local midnight, from its first. */
function weekFrom(y: number, m: number, d: number): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(y, m, d + i));
}

describe('ISO week numbers follow the majority of the configured week', () => {
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2025, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2025, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });

  it.each([
    // Fri 1 Jan 2027: Fri–Sun are 2026's week 53, Mon 4 – Thu 7 are week 1.
    { start: 'Fri 2027-01-01', y: 2027, m: 0, d: 1, week: 1 },
    // Sat 2 Jan 2027: Sat–Sun are week 53, Mon 4 – Fri 8 are week 1.
    { start: 'Sat 2027-01-02', y: 2027, m: 0, d: 2, week: 1 },
    // Fri 27 Nov 2026: Fri–Sun are week 48, Mon 30 Nov – Thu 3 Dec are week 49.
    { start: 'Fri 2026-11-27', y: 2026, m: 10, d: 27, week: 49 },
    // Sat 26 Dec 2026: Sat–Sun are week 52, Mon 28 – Fri 1 Jan are week 53.
    { start: 'Sat 2026-12-26', y: 2026, m: 11, d: 26, week: 53 },
    // Thu 31 Dec 2026: Thu–Sun are week 53, Mon 4 Jan – Wed 6 Jan are week 1.
    { start: 'Thu 2026-12-31', y: 2026, m: 11, d: 31, week: 53 },
    // Wed 30 Dec 2026: Wed–Sun are week 53.
    { start: 'Wed 2026-12-30', y: 2026, m: 11, d: 30, week: 53 },
    // Tue 29 Dec 2026: Tue–Sun are week 53.
    { start: 'Tue 2026-12-29', y: 2026, m: 11, d: 29, week: 53 },
    // Mon 28 Dec 2026: the ISO week itself.
    { start: 'Mon 2026-12-28', y: 2026, m: 11, d: 28, week: 53 },
    // Sun 3 Jan 2027: Sun is week 53, Mon 4 – Sat 9 are week 1.
    { start: 'Sun 2027-01-03', y: 2027, m: 0, d: 3, week: 1 },
    // Azores, Sun 29 Mar 2026, a day with no 00:00: Sun is week 13, Mon 30 – Sat 4 Apr week 14.
    { start: 'Sun 2026-03-29', y: 2026, m: 2, d: 29, week: 14 },
    // Sat 28 Mar 2026: Sat–Sun are week 13, Mon 30 – Fri 3 Apr week 14.
    { start: 'Sat 2026-03-28', y: 2026, m: 2, d: 28, week: 14 },
  ])('numbers every day of the week starting $start as week $week', ({ y, m, d, week }) => {
    const days = weekFrom(y, m, d);
    const firstDayOfWeek = days[0].getDay();
    expect(
      days.map((day) => calculateWeekNumberWithMajorityRule(day, ISO, firstDayOfWeek)),
    ).toEqual(Array(7).fill(week));
  });

  it('numbers a hidden week as ISO too, so the week rule breaks where the week starts', () => {
    const days = weekFrom(2027, 0, 1);
    const numbers = days.map((day) =>
      calculateWeekNumberWithMajorityRule(day, { show_week_numbers: null } as Types.Config, 5),
    );
    expect(numbers).toEqual(Array(7).fill(1));
  });

  it('leaves simple week numbers to their own rule', () => {
    // Simple weeks are counted from the configured first day already, from week 1 holding
    // 1 January; the majority rule is ISO's alone.
    const days = weekFrom(2026, 11, 26);
    expect(days.map((day) => calculateWeekNumberWithMajorityRule(day, SIMPLE, 6))).toEqual([
      53, 53, 53, 53, 53, 53, 1,
    ]);
  });
});

/**
 * A day is past from its own local midnight, on the days the clocks change too.
 *
 * `classifyDay` decides `isPast` (and with it the `past-day` class and the past-day date
 * styles) on the local calendar date. On a day the clocks change that date is 23 or 25 hours
 * long, and in the Azores the spring day has no 00:00 at all, so arithmetic in whole days of
 * 24 hours would call the wrong day past for an hour. This runs under every DST project; the
 * transition days are found from the zone itself rather than listed, so each project tests its
 * own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as Leaves from '../src/rendering/leaves';

/** The local start of a calendar day, as `groupEventsByDay` stamps each day. */
const dayStart = (year: number, month: number, day: number): number =>
  new Date(year, month, day).getTime();

/** Every local date in 2026 whose noon offset differs from the day before's, labeled. */
function transitionDays(): Array<[string, number, number, number]> {
  const days: Array<[string, number, number, number]> = [];
  for (let date = new Date(2026, 0, 2, 12); date.getFullYear() === 2026;) {
    const before = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12);
    if (before.getTimezoneOffset() !== date.getTimezoneOffset()) {
      const label = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      days.push([label, date.getFullYear(), date.getMonth(), date.getDate()]);
    }
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12);
  }
  return days;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('past days across a change of clocks', () => {
  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  it("finds both of the zone's changes in 2026", () => {
    expect(transitionDays()).toHaveLength(2);
  });

  it.each(transitionDays())(
    'calls only the earlier days past on %s, at every hour of it',
    (_label, year, month, day) => {
      vi.useFakeTimers();
      const first = new Date(year, month, day).getTime();
      const next = new Date(year, month, day + 1).getTime();

      // The day's first moment, every hour after it, and its last moment.
      const instants = [first];
      for (let at = first + 3_600_000; at < next; at += 3_600_000) instants.push(at);
      instants.push(next - 1);

      for (const instant of instants) {
        vi.setSystemTime(instant);
        const label = new Date(instant).toString();

        expect(Leaves.classifyDay(dayStart(year, month, day - 1)).isPast, label).toBe(true);
        const today = Leaves.classifyDay(dayStart(year, month, day));
        expect(today.isPast, label).toBe(false);
        expect(today.isToday, label).toBe(true);
        expect(Leaves.classifyDay(dayStart(year, month, day + 1)).isPast, label).toBe(false);
      }
    },
  );

  it.each(transitionDays())(
    'keeps %s out of the past until its last moment has gone',
    (_label, year, month, day) => {
      vi.useFakeTimers();
      const next = new Date(year, month, day + 1).getTime();

      vi.setSystemTime(next - 1);
      expect(Leaves.classifyDay(dayStart(year, month, day)).isPast).toBe(false);

      vi.setSystemTime(next);
      expect(Leaves.classifyDay(dayStart(year, month, day)).isPast).toBe(true);
    },
  );
});

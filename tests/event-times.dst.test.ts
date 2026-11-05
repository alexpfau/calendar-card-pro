import { describe, expect, it } from 'vitest';

import {
  dateValue,
  moveStart,
  restoreTimes,
  setAllDay,
  timeValue,
  timesFromEntry,
  withTime,
  writeTimes,
} from '../src/interaction/event-times';

/**
 * The event span under real zones, where a day can be 23 or 25 hours long and local midnight
 * is not UTC midnight. Runs under Europe/Berlin, Australia/Sydney and America/New_York. Each
 * year's clock changes are found from the zone itself rather than listed, so the tests mean
 * the same thing in every one of the three.
 */

/** The local dates of this zone's two clock changes in 2026, found by stepping through the year. */
function clockChanges(): Date[] {
  const changes: Date[] = [];
  for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026; day.setDate(day.getDate() + 1)) {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    if (next.getTime() - day.getTime() !== 86400000) changes.push(new Date(day));
  }
  return changes;
}

describe('the zone this file runs under', () => {
  it('changes its clocks, or these tests prove nothing', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
    expect(clockChanges()).toHaveLength(2);
  });
});

describe('all-day spans across a clock change', () => {
  it.each(clockChanges().map((day) => [dateValue(day)]))(
    'reads and writes the days around %s as the same calendar days',
    (date) => {
      const start = new Date(`${date}T00:00:00`);
      start.setDate(start.getDate() - 1);
      const after = new Date(start);
      after.setDate(after.getDate() + 3);
      const stored = { dtstart: dateValue(start), dtend: dateValue(after) };

      const times = timesFromEntry(stored.dtstart, stored.dtend)!;
      expect(times.start.getHours()).toBe(0);
      expect(times.end.getHours()).toBe(0);
      expect(writeTimes(times)).toEqual(stored);

      const moved = moveStart(times, new Date(after));
      expect(writeTimes(moved).dtend).toBe(
        dateValue(new Date(after.getFullYear(), after.getMonth(), after.getDate() + 3)),
      );
    },
  );
});

describe('timed spans across a clock change', () => {
  it.each(clockChanges().map((day) => [dateValue(day)]))(
    'writes %s at the instants shown, in UTC',
    (date) => {
      const [year, month, day] = date.split('-').map(Number);
      const start = new Date(year, month - 1, day, 9, 0);
      const end = new Date(year, month - 1, day + 1, 9, 0);
      const written = writeTimes({ allDay: false, start, end });
      expect(new Date(written.dtstart).getTime()).toBe(start.getTime());
      expect(new Date(written.dtend).getTime()).toBe(end.getTime());
      expect(written.dtstart.endsWith('Z')).toBe(true);
    },
  );

  it.each(clockChanges().map((day) => [dateValue(day)]))(
    'sets a time on %s by the wall clock, the skipped hour landing on one that exists',
    (date) => {
      const [year, month, day] = date.split('-').map(Number);
      const morning = new Date(year, month - 1, day + 1, 6, 0);
      // The day after the change: an ordinary day, where 09:30 is 09:30.
      expect(timeValue(withTime(morning, '09:30')!)).toBe('09:30');
      // Every wall-clock hour of the change day itself either exists or moves forward.
      const changeDay = new Date(year, month - 1, day);
      for (let hour = 0; hour < 24; hour++) {
        const set = withTime(changeDay, `${String(hour).padStart(2, '0')}:30`)!;
        expect(set.getHours() === hour || set.getHours() === hour + 1).toBe(true);
      }
    },
  );
});

describe('times given back after all day, across a clock change', () => {
  it.each(clockChanges().map((day) => [dateValue(day)]))(
    'keeps the wall-clock times of a span moved across %s',
    (date) => {
      const day = new Date(`${date}T00:00:00`);
      const before = {
        allDay: false,
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 9, 15),
        end: new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 10, 45),
      };
      const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      const moved = { ...setAllDay(before, true, 0), start: next, end: next };

      const restored = restoreTimes(moved, before);
      expect(dateValue(restored.start)).toBe(dateValue(next));
      expect([timeValue(restored.start), timeValue(restored.end)]).toEqual(['09:15', '10:45']);
    },
  );
});

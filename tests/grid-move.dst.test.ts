import { describe, expect, it } from 'vitest';

import * as GridMove from '../src/interaction/grid-move';

/**
 * An event a drag moves in a grid, on the days the clocks change (`grid-move.ts`).
 *
 * Runs under every DST project (Berlin, Sydney, New York). A drag moves an event to a day by
 * calendar days and to a time by wall-clock quarter hours, and keeps its length in time. The
 * obvious "simplification", moving by the pointer's distance in milliseconds, lands the event an
 * hour off from wherever a change lies between where it was and where it went. The oracle is
 * `Intl.DateTimeFormat` in the zone under test, not the `Date` getters the code is built from.
 * No zone is uniquely required: each has two days the clocks change, and any of the three
 * catches either mistake.
 */

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The wall-clock date, hour and minute of an instant, in the zone under test. */
function wallClock(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** The local midnights of 2026 on which the day is not 24 hours long. */
function changeDays(): number[] {
  const days: number[] = [];
  for (
    let d = new Date(2026, 0, 1);
    d.getFullYear() === 2026;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    if (next.getTime() - d.getTime() !== 86_400_000) days.push(d.getTime());
  }
  return days;
}

const HOUR = 3_600_000;

describe(`a moved event on the days the clocks change, in ${ZONE}`, () => {
  it('runs in a zone with DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
    expect(changeDays()).toHaveLength(2);
  });

  it('lands at the same wall-clock time a day across a change, as long as it was', () => {
    for (const midnight of changeDays()) {
      const change = new Date(midnight);
      const before = new Date(change.getFullYear(), change.getMonth(), change.getDate() - 1);
      const after = new Date(change.getFullYear(), change.getMonth(), change.getDate() + 1);
      const start = new Date(before.getFullYear(), before.getMonth(), before.getDate(), 10);
      const times = { allDay: false, start, end: new Date(start.getTime() + HOUR) };

      // Grabbed at 10:30 the day before, let go at 10:30 the day after: two days on.
      const moved = GridMove.movedTimes(
        times,
        { timestamp: before.getTime(), minute: 630 },
        { timestamp: after.getTime(), minute: 630 },
      );
      expect(wallClock(moved.start)).toBe(`${wallClock(after).slice(0, 10)} 10:00`);
      expect(moved.end.getTime() - moved.start.getTime()).toBe(HOUR);
    }
  });

  it('moves by wall-clock quarter hours on the day of a change, after the change', () => {
    for (const midnight of changeDays()) {
      const day = wallClock(new Date(midnight)).slice(0, 10);
      const change = new Date(midnight);
      const start = new Date(change.getFullYear(), change.getMonth(), change.getDate(), 8);
      const times = { allDay: false, start, end: new Date(start.getTime() + 2 * HOUR) };

      const moved = GridMove.movedTimes(
        times,
        { timestamp: midnight, minute: 500 },
        { timestamp: midnight, minute: 680 },
      );
      expect(wallClock(moved.start)).toBe(`${day} 11:00`);
      expect(moved.end.getTime() - moved.start.getTime()).toBe(2 * HOUR);
    }
  });
});

/**
 * Where the day the clocks go back reads one quarter hour twice, as `[first, second]`: the
 * second quarter of the hour that comes round twice, which leaves a quarter of that hour above
 * it and below it, wherever the change falls. In the Azores it falls at midnight.
 */
function repeatedQuarter(): [Date, Date] {
  const [midnight] = changeDays().filter((day) => {
    const d = new Date(day);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - day > 86_400_000;
  });
  const seen = new Map<string, number>();
  const pairs: Array<[Date, Date]> = [];
  for (let t = midnight; t < midnight + 26 * HOUR; t += 15 * 60_000) {
    const wall = wallClock(new Date(t));
    const first = seen.get(wall);
    if (first !== undefined) pairs.push([new Date(first), new Date(t)]);
    seen.set(wall, t);
  }
  if (pairs.length < 3) throw new Error('no repeated hour');
  return pairs[1];
}

describe(`a moved event in the hour the clocks pass twice, in ${ZONE}`, () => {
  it.each([
    ['in its second passing, a quarter down', 'second', 15],
    ['in its second passing, a quarter up', 'second', -15],
    ['in its first passing, a quarter down', 'first', 15],
    ['in its first passing, a quarter up', 'first', -15],
  ])('moves %s by exactly a quarter hour of time', (_name, passing, by) => {
    const [first, second] = repeatedQuarter();
    const start = passing === 'second' ? second : first;
    const times = { allDay: false, start, end: new Date(start.getTime() + 15 * 60_000) };
    const minute = start.getHours() * 60 + start.getMinutes();

    const moved = GridMove.movedTimes(
      times,
      { timestamp: start.getTime(), minute },
      { timestamp: start.getTime(), minute: minute + by },
    );
    // `Date` reads a wall-clock time the clocks pass twice as its first passing, so a move down
    // from the second passing would otherwise land three quarters of an hour earlier.
    expect(moved.start.getTime() - start.getTime()).toBe(by * 60_000);
    expect(moved.end.getTime() - moved.start.getTime()).toBe(15 * 60_000);
  });
});

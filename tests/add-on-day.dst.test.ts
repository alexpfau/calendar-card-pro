import { describe, expect, it } from 'vitest';

import { newEventTimesOn } from '../src/interaction/add-event';

const newEventDateOn = (midnight: number, hour?: number, now?: Date) =>
  newEventTimesOn(midnight, hour === undefined ? undefined : hour * 60, now).start;

/**
 * The hour a tap on a day starts a new event at, on the days the clocks change.
 *
 * Runs under every DST project (Berlin, Sydney, New York). `newEventTimesOn` sets a wall-clock
 * time on the day's own date, and the obvious "simplification" of adding hours to midnight in
 * milliseconds lands an hour off on both change days. Its oracle is `Intl.DateTimeFormat` in
 * the zone under test, not the `Date` getters the code is built from.
 */

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The wall-clock date and hour of an instant, in the zone under test. */
function wallClock(date: Date): { day: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** The local midnights of 2026 on which the day is not 24 hours long, shortest first. */
function changeDays(): number[] {
  const days: { midnight: number; length: number }[] = [];
  for (
    let d = new Date(2026, 0, 1);
    d.getFullYear() === 2026;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const length = next.getTime() - d.getTime();
    if (length !== 86_400_000) days.push({ midnight: d.getTime(), length });
  }
  return days.sort((a, b) => a.length - b.length).map(({ midnight }) => midnight);
}

describe(`a new event's start on the days the clocks change, in ${ZONE}`, () => {
  it('runs in a zone with DST', () => {
    const january = new Date(2026, 0, 15).getTimezoneOffset();
    const july = new Date(2026, 6, 15).getTimezoneOffset();
    expect(january).not.toBe(july);
    expect(changeDays()).toHaveLength(2);
  });

  it.each([9, 14, 23])('starts at %i:00 on both change days, on that day', (hour) => {
    for (const midnight of changeDays()) {
      const start = newEventDateOn(midnight, hour);
      expect(wallClock(start)).toEqual({ day: wallClock(new Date(midnight)).day, hour });
    }
  });

  it('takes the hour it is now on a change day, as a wall-clock hour', () => {
    for (const midnight of changeDays()) {
      const now = new Date(2026, 6, 1, 17, 25);
      expect(wallClock(newEventDateOn(midnight, undefined, now))).toEqual({
        day: wallClock(new Date(midnight)).day,
        hour: 17,
      });
    }
  });

  it('starts at the first hour that exists, on the day, where the hour asked for does not', () => {
    // The spring change skips an hour; whichever it is in this zone, asking for it lands on
    // the next one, and never on another day.
    const [spring] = changeDays();
    const skipped = Array.from({ length: 24 }, (_, hour) => hour).find(
      (hour) => wallClock(newEventDateOn(spring, hour)).hour !== hour,
    );
    expect(skipped).toBeDefined();
    expect(wallClock(newEventDateOn(spring, skipped))).toEqual({
      day: wallClock(new Date(spring)).day,
      hour: skipped! + 1,
    });
  });

  it('starts at a quarter hour on both change days, as a wall-clock time', () => {
    for (const midnight of changeDays()) {
      const { start, end } = newEventTimesOn(midnight, 14 * 60 + 45);
      expect(wallClock(start)).toEqual({ day: wallClock(new Date(midnight)).day, hour: 14 });
      expect(start.getMinutes()).toBe(45);
      expect(end.getTime() - start.getTime()).toBe(3_600_000);
    }
  });

  it('adds an all-day event on the day itself, on both change days', () => {
    for (const midnight of changeDays()) {
      const times = newEventTimesOn(midnight, 'all-day');
      expect(times.allDay).toBe(true);
      expect(times.start.getTime()).toBe(midnight);
      expect(times.end.getTime()).toBe(midnight);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { dayFields } from '../src/interaction/day-actions';

/**
 * The tapped day's fields a `day_tap_action` fills in, `{date}`, `{start}` and `{end}`, in every
 * zone the DST projects run under.
 *
 * Under `TZ=UTC` a local clock reading and its offset are trivially right, so this file runs only
 * under the four zones (`*.dst.test.ts`). Its oracle is `Intl.DateTimeFormat` in the zone under
 * test, not the `Date` getters `dayFields` is built from: each string must name the wall clock and
 * the offset `Intl` gives for the same instant. Every day of 2026 is checked, so each zone's two
 * change days are among them, and the Azores spring day, whose midnight does not exist, with them.
 */

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** An instant's wall clock in the zone under test, as `YYYY-MM-DD`, `HH:mm:ss` and `+hh:mm`. */
function wall(date: Date): { day: string; time: string; offset: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  // `GMT+01:00`, or a bare `GMT` at a zero offset.
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.slice(3);
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    offset,
  };
}

/** Every local midnight of 2026, by calendar date. */
function daysOf2026(): Date[] {
  const days: Date[] = [];
  for (let day = 1; day <= 365; day += 1) days.push(new Date(2026, 0, day));
  return days;
}

/** The calendar day after a `YYYY-MM-DD` date, computed in UTC so no zone can move it. */
function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

describe(`a tapped day's fields, in ${ZONE}`, () => {
  it('runs in a zone with DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });

  it('names the whole day where no time was tapped, its end the next day', () => {
    for (const midnight of daysOf2026()) {
      const date = wall(midnight).day;
      expect(dayFields(midnight.getTime())).toEqual({
        date,
        start: date,
        end: nextDate(date),
        all_day: 'true',
      });
    }
  });

  it.each([0, 120, 135, 600, 1425])(
    'names minute %i of every day as the wall clock and offset of that moment, and an hour on',
    (minute) => {
      for (const midnight of daysOf2026()) {
        const fields = dayFields(midnight.getTime(), minute);
        expect(fields.all_day).toBe('false');
        expect(fields.date).toBe(wall(midnight).day);

        for (const key of ['start', 'end'] as const) {
          const instant = new Date(fields[key]);
          expect(Number.isNaN(instant.getTime()), fields[key]).toBe(false);
          const expected = wall(instant);
          expect(fields[key]).toBe(`${expected.day}T${expected.time}${expected.offset}`);
        }
        expect(new Date(fields.end).getTime() - new Date(fields.start).getTime()).toBe(3_600_000);
        // The start stays on the day tapped, even where the minute does not exist that day.
        expect(wall(new Date(fields.start)).day).toBe(fields.date);
      }
    },
  );
});

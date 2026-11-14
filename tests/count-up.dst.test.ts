/**
 * Count-up under real timezones and their changes of clock.
 *
 * A count-up counts local calendar dates from an event's last moment, and reads in clock units
 * only from an end earlier today. Under UTC, the unit project's zone, a local date and a UTC
 * date are the same thing and every day is 24 hours long, so a count in elapsed hours, or one
 * that compared UTC dates, would pass there and miscount across a change of clock, or on the
 * far side of UTC midnight. Runs under every DST project. The expected text is written out as
 * the card's English, never derived from the `Date` getters the code itself reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEventData } from '../src/config/types';
import { countsUpTheClock, getCountUpString } from '../src/utils/format';

const TRANSITIONS: Record<string, string[]> = {
  'Europe/Berlin': ['2026-03-29', '2026-10-25'],
  'Australia/Sydney': ['2026-04-05', '2026-10-04'],
  'America/New_York': ['2026-03-08', '2026-11-01'],
  'Atlantic/Azores': ['2026-03-29', '2026-10-25'],
};

const transitionDates = TRANSITIONS[process.env.TZ ?? ''];
if (!transitionDates) throw new Error('Count-up DST tests require a configured DST zone');

/** Local `hour:minute` on the date `days` after `date`, built from fields, never by stepping. */
function at(date: string, days: number, hour: number, minute = 0): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + days, hour, minute);
}

function timedEvent(start: Date, end: Date): CalendarEventData {
  return {
    summary: 'Workshop',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

/** An all-day event on the date `days` after `date`, written as Home Assistant sends one. */
function allDayEvent(date: string, days: number): CalendarEventData {
  const ymd = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate(),
    ).padStart(2, '0')}`;
  return {
    summary: 'Lawn mowed',
    start: { date: ymd(at(date, days, 12)) },
    end: { date: ymd(at(date, days + 1, 12)) },
  };
}

describe('count-up in a real timezone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs under a timezone that observes DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });

  it.each(transitionDates)('counts dates, not hours, across the %s transition', (date) => {
    // Ended late on the day before the change, read at every hour of the days after it.
    const ended = timedEvent(at(date, -1, 22), at(date, -1, 23, 30));
    for (const hour of [3, 12, 23]) {
      vi.setSystemTime(at(date, 0, hour, 45));
      expect(getCountUpString(ended)).toBe('yesterday');
      expect(getCountUpString(allDayEvent(date, -1))).toBe('yesterday');
      vi.setSystemTime(at(date, 1, hour, 45));
      expect(getCountUpString(ended)).toBe('2 days ago');
      expect(getCountUpString(allDayEvent(date, -1))).toBe('2 days ago');
    }
  });

  it.each(transitionDates)('counts exact days across the %s transition', (date) => {
    for (const days of [1, 2, 30, 400]) {
      const ended = timedEvent(at(date, 1 - days, 7), at(date, 1 - days, 8));
      const expected = days === 1 ? '1 day ago' : `${days} days ago`;
      for (const hour of [3, 12, 23]) {
        vi.setSystemTime(at(date, 1, hour, 45));
        expect(getCountUpString(ended, 'en', { exactDays: true })).toBe(expected);
        expect(getCountUpString(allDayEvent(date, 1 - days), 'en', { exactDays: true })).toBe(
          expected,
        );
      }
    }
  });

  it.each(transitionDates)('holds the range edge across the %s transition', (date) => {
    // Late on the day before, read early three dates on: under three whole days have passed,
    // and an hour more or less across the change.
    const ended = timedEvent(at(date, -1, 22), at(date, -1, 23, 30));
    vi.setSystemTime(at(date, 2, 2, 30));
    expect((Date.now() - new Date(ended.end.dateTime!).getTime()) / 86400000).toBeLessThan(3);

    expect(getCountUpString(ended, 'en', { maxDays: 3 })).toBe('3 days ago');
    expect(getCountUpString(ended, 'en', { maxDays: 2 })).toBeNull();
  });

  it.each(transitionDates)(
    "counts an end at the %s transition day's first moment as the day before's",
    (date) => {
      // Azores springs forward at midnight, so that day's first moment is 1:00; `at` builds it
      // from fields, so it lands there. Half an hour later is a moment of the day itself.
      const firstMoment = at(date, 0, 0);
      const untilMidnight = timedEvent(at(date, -1, 22), firstMoment);
      const pastMidnight = timedEvent(at(date, -1, 22), new Date(firstMoment.getTime() + 1800000));

      vi.setSystemTime(at(date, 0, 12));
      expect(getCountUpString(untilMidnight)).toBe('yesterday');
      expect(countsUpTheClock(untilMidnight)).toBe(false);
      expect(getCountUpString(pastMidnight)).toMatch(/^\d+ hours ago$/);
      expect(countsUpTheClock(pastMidnight)).toBe(true);
    },
  );

  it('reads "today" as the local date, not the UTC one', () => {
    // In January every zone here is off UTC, and the end and the reading fall on one local
    // date in each of them, but on two UTC dates.
    const now = new Date('2026-01-15T00:30:00Z');
    const end = new Date('2026-01-14T23:20:00Z');
    const local = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
    expect(local(end)).toBe(local(now));
    expect(end.getUTCDate()).not.toBe(now.getUTCDate());

    vi.setSystemTime(now);
    const ended = timedEvent(new Date('2026-01-14T23:00:00Z'), end);
    expect(getCountUpString(ended)).toBe('an hour ago');
    expect(countsUpTheClock(ended)).toBe(true);
  });
});

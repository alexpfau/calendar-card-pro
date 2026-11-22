/**
 * `show_duration` across changes of clock.
 *
 * Shorter than a full day, an event's length is the time that passes, so a night when the clocks
 * go forward is an hour shorter than its clock readings say. From a full day on the wall clock it
 * is counted in calendar days, so noon to noon is a day whether it lasted 23 hours or 25. Under
 * UTC, the unit project's zone, every day is 24 hours and both rules agree, so neither can be
 * told from the other there. Runs under every DST project; the expected lengths are written out
 * per zone, not derived from the getters the code reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEventData } from '../src/config/types';
import { formatEventDuration } from '../src/utils/format';

/** Each zone's spring-forward and fall-back dates in 2026. */
const TRANSITIONS: Record<string, { spring: string; fall: string }> = {
  'Europe/Berlin': { spring: '2026-03-29', fall: '2026-10-25' },
  'Australia/Sydney': { spring: '2026-10-04', fall: '2026-04-05' },
  'America/New_York': { spring: '2026-03-08', fall: '2026-11-01' },
  'Atlantic/Azores': { spring: '2026-03-29', fall: '2026-10-25' },
};

const zone = TRANSITIONS[process.env.TZ ?? ''];
if (!zone) throw new Error('Duration DST tests require a configured DST zone');

/** Local `hour:minute` on the date `days` after `date`, built from fields, never by stepping. */
function at(date: string, days: number, hour: number, minute = 0): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + days, hour, minute);
}

const timed = (start: Date, end: Date): CalendarEventData => ({
  summary: 'Shift',
  start: { dateTime: start.toISOString() },
  end: { dateTime: end.toISOString() },
});

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/** The duration as read, without the isolate it sits in. */
const lasts = (event: CalendarEventData) =>
  (formatEventDuration(event, 'en') ?? '').replace(/[\u2066-\u2069]/g, '');

describe('duration in a real timezone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs under a timezone that observes DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });

  it('measures a night across the spring change by the time that passes', () => {
    // 22:00 to 5:00 reads seven hours on the clock, and lasts six.
    expect(lasts(timed(at(zone.spring, -1, 22), at(zone.spring, 0, 5)))).toBe('(6 hr)');
  });

  it('measures a night across the fall change by the time that passes', () => {
    expect(lasts(timed(at(zone.fall, -1, 22), at(zone.fall, 0, 5)))).toBe('(8 hr)');
  });

  it.each(['spring', 'fall'] as const)(
    'counts noon to noon across the %s change as a day',
    (side) => {
      const date = zone[side];
      expect(lasts(timed(at(date, -1, 12), at(date, 0, 12)))).toBe('(1 day)');
      expect(lasts(timed(at(date, -1, 12), at(date, 0, 14)))).toBe('(1 day, 2 hr)');
      expect(lasts(timed(at(date, -1, 12), at(date, 1, 11)))).toBe('(1 day, 23 hr)');
    },
  );

  it.each([
    ['an ordinary day', '2026-01-14'],
    ['the spring change', zone.spring],
    ['the fall change', zone.fall],
  ])('counts midnight to midnight over %s as a day', (_, date) => {
    // A full day on the wall clock, though it takes up one date: "(1 day)", not "(24 hr)", nor
    // the 23 or 25 hours a day of a change lasts. In the Azores the spring day has no 0:00, so
    // its midnight is its first moment, 1:00, and the day still counts as one.
    expect(lasts(timed(at(date, 0, 0), at(date, 1, 0)))).toBe('(1 day)');
    expect(lasts(timed(at(date, 0, 0), at(date, 2, 0)))).toBe('(2 days)');
    expect(lasts(timed(at(date, 0, 0), at(date, 1, 6)))).toBe('(1 day, 6 hr)');
  });

  it('measures a night from midnight that ends before the next midnight by the time it lasts', () => {
    // 0:00 to 23:00 is no full day, so its length is the time that passes.
    const date = '2026-01-14';
    expect(lasts(timed(at(date, 0, 0), at(date, 0, 23)))).toBe('(23 hr)');
  });

  it.each(['spring', 'fall'] as const)(
    'counts the dates of an all-day event across the %s change',
    (side) => {
      const date = zone[side];
      const event: CalendarEventData = {
        summary: 'Trip',
        start: { date: ymd(at(date, -1, 12)) },
        end: { date: ymd(at(date, 2, 12)) },
      };
      expect(lasts(event)).toBe('(3 days)');
    },
  );

  it('measures a night whose hour repeats by the time that passes, as it is no full day', () => {
    if (process.env.TZ !== 'Atlantic/Azores') return;
    // The Azores repeat 0:00 to 0:59 when the clocks go back. 0:45 to the second 0:30 next night
    // lasts 24 hours and 45 minutes, and ends before 0:45 on the clock, so it is not a full day.
    const start = at('2026-10-24', 0, 0, 45);
    const firstHalfPast = at('2026-10-25', 0, 0, 30);
    const secondHalfPast = new Date(firstHalfPast.getTime() + 3600000);
    expect(secondHalfPast.getHours()).toBe(0);
    expect(lasts(timed(start, firstHalfPast))).toBe('(23 hr, 45 min)');
    expect(lasts(timed(start, secondHalfPast))).toBe('(24 hr, 45 min)');
  });
});

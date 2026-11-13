/**
 * `countdown_exact_days` and `countdown_max_days` across daylight-saving changes.
 *
 * Both count calendar dates. A day either side of a transition is 23 or 25 hours long, so a
 * count in elapsed hours divided by 24 lands a day off for part of it, in opposite directions
 * in the two hemispheres; under UTC, the unit project's zone, every day is 24 hours and such a
 * count is always right. Runs under every DST project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEventData } from '../src/config/types';
import { getCountdownString } from '../src/utils/format';

const TRANSITIONS: Record<string, string[]> = {
  'Europe/Berlin': ['2026-03-29', '2026-10-25'],
  'Australia/Sydney': ['2026-04-05', '2026-10-04'],
  'America/New_York': ['2026-03-08', '2026-11-01'],
  'Atlantic/Azores': ['2026-03-29', '2026-10-25'],
};

const transitionDates = TRANSITIONS[process.env.TZ ?? ''];
if (!transitionDates) throw new Error('Countdown DST tests require a configured DST zone');

function timedEvent(start: Date): CalendarEventData {
  return {
    summary: 'Workshop',
    start: { dateTime: start.toISOString() },
    end: { dateTime: new Date(start.getTime() + 3600000).toISOString() },
  };
}

function allDayEvent(start: Date): CalendarEventData {
  const date = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate(),
    ).padStart(2, '0')}`;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: { date: date(start) }, end: { date: date(end) } };
}

/** Local `hour:minute` on the date `days` after `date`, built from fields, never by stepping. */
function at(date: string, days: number, hour: number, minute = 0): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + days, hour, minute);
}

describe('countdown options in a real timezone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs under a timezone that observes DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });

  it.each(transitionDates)('counts exact days across the %s transition', (date) => {
    // From the day before the transition, so every wait below spans it.
    for (const days of [1, 2, 30, 400]) {
      const start = at(date, days - 1, 8);
      for (const hour of [0, 12, 23]) {
        vi.setSystemTime(at(date, -1, hour, 45));
        const expected = days === 1 ? 'in 1 day' : `in ${days} days`;
        expect(getCountdownString(timedEvent(start), 'en', { exactDays: true })).toBe(expected);
        expect(getCountdownString(allDayEvent(start), 'en', { exactDays: true })).toBe(expected);
      }
    }
  });

  it.each(transitionDates)('holds the range edge across the %s transition', (date) => {
    // Late on the day before, to an early start three dates on: the elapsed time is under
    // three whole days, and an hour more or less across the change.
    vi.setSystemTime(at(date, -1, 23, 45));
    const start = at(date, 2, 2, 30);
    const elapsedDays = (start.getTime() - Date.now()) / 86400000;
    expect(elapsedDays).toBeLessThan(3);

    for (const event of [timedEvent(start), allDayEvent(start)]) {
      expect(getCountdownString(event, 'en', { maxDays: 3 })).toBe('in 3 days');
      expect(getCountdownString(event, 'en', { maxDays: 2 })).toBeNull();
    }
  });
});

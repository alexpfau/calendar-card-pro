import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEventData } from '../src/config/types';
import { getCountdownString } from '../src/utils/format';

const TRANSITIONS: Record<string, string[]> = {
  'Europe/Berlin': ['2026-03-29', '2026-10-25'],
  'Australia/Sydney': ['2026-04-05', '2026-10-04'],
  'America/New_York': ['2026-03-08', '2026-11-01'],
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

describe('calendar-day countdowns in a real timezone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs under a timezone that observes DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });

  it('uses local dates even when their UTC dates differ', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 23, 50));
    const event = timedEvent(new Date(2026, 8, 9, 0, 10));
    expect(getCountdownString(event)).toBe('tomorrow');
    vi.setSystemTime(new Date(2026, 8, 9, 0, 0));
    expect(getCountdownString(event)).toBe('in 10 minutes');
  });

  it('preserves the all-day date in timezones on either side of UTC', () => {
    vi.setSystemTime(new Date(2026, 8, 8, 20, 13));
    expect(getCountdownString({ start: { date: '2026-09-09' }, end: { date: '2026-09-10' } })).toBe(
      'tomorrow',
    );
    expect(getCountdownString({ start: { date: '2026-09-11' }, end: { date: '2026-09-12' } })).toBe(
      'in 3 days',
    );
  });

  it.each(transitionDates)('counts calendar dates across the %s transition', (date) => {
    const day = new Date(`${date}T00:00:00`);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    expect(day.getTimezoneOffset()).not.toBe(nextDay.getTimezoneOffset());

    const before = new Date(day);
    before.setDate(before.getDate() - 1);
    before.setHours(20, 13);
    const after = new Date(day);
    after.setDate(after.getDate() + 2);
    after.setHours(8);
    vi.setSystemTime(before);
    expect(getCountdownString(timedEvent(after))).toBe('in 3 days');

    vi.setSystemTime(day);
    nextDay.setHours(0, 10);
    expect(getCountdownString(timedEvent(nextDay))).toBe('tomorrow');
    const elapsedHours = (nextDay.getTime() - day.getTime()) / 3600000;
    expect(Math.round(elapsedHours)).not.toBe(24);
  });

  it.each(transitionDates)('keeps long waits today in elapsed hours on %s', (date) => {
    const now = new Date(`${date}T00:00:00`);
    const start = new Date(`${date}T23:00:00`);
    const elapsedHours = (start.getTime() - now.getTime()) / 3600000;
    expect([22, 24]).toContain(elapsedHours);
    vi.setSystemTime(now);
    expect(getCountdownString(timedEvent(start))).toBe(`in ${elapsedHours} hours`);

    start.setHours(23, 59, 59);
    const roundedHours = Math.round((start.getTime() - now.getTime()) / 3600000);
    expect([23, 25]).toContain(roundedHours);
    expect(getCountdownString(timedEvent(start))).toBe(`in ${roundedHours} hours`);
  });

  it.each(transitionDates)('keeps natural long-range wording across the %s transition', (date) => {
    const reference = new Date(`${date}T00:00:00`);
    reference.setDate(reference.getDate() - 1);
    for (const row of [
      { days: 30, expected: 'in a month' },
      { days: 365, expected: 'in a year' },
    ]) {
      const start = new Date(reference);
      start.setDate(start.getDate() + row.days);
      start.setHours(8);
      if (row.days === 30) {
        expect(start.getTimezoneOffset()).not.toBe(reference.getTimezoneOffset());
      }
      for (const hour of [0, 12, 23]) {
        const now = new Date(reference);
        now.setHours(hour, 45);
        vi.setSystemTime(now);
        expect(getCountdownString(timedEvent(start))).toBe(row.expected);
        expect(getCountdownString(allDayEvent(start))).toBe(row.expected);
      }
    }
  });
});

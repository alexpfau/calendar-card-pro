/**
 * `show_countdown: once_per_day` under real timezones.
 *
 * Its one time-dependent rule is that a countdown to a start later today is never left out,
 * because two that read "in 2 hours" can name different times. "Today" is the local date. Under
 * UTC, the unit project's zone, a local date and a UTC date are the same thing, so a rule that
 * compared UTC dates would pass there and leave out a countdown to this evening everywhere west
 * of UTC, or to this morning everywhere east. Runs under every DST project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { COUNTDOWN_ONCE_PER_DAY } from '../src/config/constants';
import type * as Types from '../src/config/types';
import { repeatedCountdowns } from '../src/rendering/presentation';
import { getCountdownString } from '../src/utils/format';

const timed = (summary: string, start: Date): Types.CalendarEventData => ({
  summary,
  start: { dateTime: start.toISOString() },
  end: { dateTime: new Date(start.getTime() + 1800000).toISOString() },
});

const config = buildConfig({ show_countdown: COUNTDOWN_ONCE_PER_DAY });

const localDate = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

describe('once_per_day in a real timezone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs under a timezone that observes DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });

  it('keeps two countdowns later today that fall on the next UTC date', () => {
    // An hour before UTC midnight, to starts just after it: one local date in every zone here
    // in January, and two UTC dates.
    const now = new Date('2026-01-14T23:00:00Z');
    const day = [
      timed('Piano lesson', new Date('2026-01-15T00:40:00Z')),
      timed('Swim practice', new Date('2026-01-15T00:50:00Z')),
    ];
    expect(day.map((event) => localDate(new Date(event.start.dateTime!)))).toEqual([
      localDate(now),
      localDate(now),
    ]);
    expect(now.getUTCDate()).not.toBe(new Date(day[0].start.dateTime!).getUTCDate());

    vi.setSystemTime(now);
    expect(day.map((event) => getCountdownString(event))).toEqual(['in 2 hours', 'in 2 hours']);
    expect([...repeatedCountdowns(day, config, 'en')]).toEqual([]);
  });

  it('leaves out the second "tomorrow" until local midnight, then keeps both', () => {
    const day = [
      timed('Piano lesson', new Date(2026, 0, 15, 9)),
      timed('Swim practice', new Date(2026, 0, 15, 15)),
    ];

    vi.setSystemTime(new Date(2026, 0, 14, 23, 58));
    expect(day.map((event) => getCountdownString(event))).toEqual(['tomorrow', 'tomorrow']);
    expect([...repeatedCountdowns(day, config, 'en')]).toEqual([1]);

    vi.setSystemTime(new Date(2026, 0, 15, 0, 1));
    expect([...repeatedCountdowns(day, config, 'en')]).toEqual([]);
  });
});

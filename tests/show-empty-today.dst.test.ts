/**
 * `show_empty_today` decides whether today is inside the card's window by counting calendar
 * days from the start date. Across a DST transition two local midnights are not a whole
 * number of 24-hour days apart, so a count built from milliseconds lands one day off at the
 * window's last day. Runs under Berlin, Sydney and New York (`*.dst.test.ts`); each scenario
 * below straddles one zone's spring-forward, and passes trivially in the other two.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as EventUtils from '../src/utils/events';

afterEach(() => {
  vi.useRealTimers();
});

describe('show_empty_today across a spring-forward', () => {
  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  // The day after each zone's 2026 spring-forward, with the window starting two days before.
  it.each([
    { zone: 'Berlin', start: '2026-03-28', today: [2026, 2, 30] },
    { zone: 'Sydney', start: '2026-10-03', today: [2026, 9, 5] },
    { zone: 'New York', start: '2026-03-07', today: [2026, 2, 9] },
  ])('counts the $zone window in calendar days', ({ start, today }) => {
    const [y, m, d] = today;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(y, m, d, 10, 0));

    const days = (daysToShow: number) =>
      EventUtils.groupEventsByDay(
        [],
        buildConfig({ start_date: start, days_to_show: daysToShow, show_empty_today: true }),
        false,
        'en',
        'list',
      ).map((day) => day.timestamp);

    // Today is the third day: inside a three-day window, outside a two-day one.
    expect(days(3)).toEqual([new Date(y, m, d).getTime()]);
    expect(days(2)).toEqual([new Date(y, m, d - 2).getTime()]);
  });
});

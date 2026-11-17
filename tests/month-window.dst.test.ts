/**
 * A month's weeks and the load that holds them, under every zone the suite runs in.
 *
 * A month grid starts on the first weekday on or before the 1st and runs six weeks, so its
 * arithmetic crosses daylight-saving changes as a matter of course: March and April hold the
 * spring change in Berlin, New York and the Azores, and Sydney's autumn change falls in April.
 * Every expectation is a calendar date, a fixed property of the calendar rather than of the
 * machine, so the same keys must come back in every zone. The Azores matter most: its spring
 * day, Sunday 29 March 2026, has no midnight, so a month whose rows start that day starts at
 * the day's first moment, 01:00, and has to be counted as a whole day all the same.
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Paging from '../src/utils/paging';
import { getTimeWindow } from '../src/utils/start-date';

const SUNDAY = 0;
const MONDAY = 1;

/** A day's local date. */
const key = (date: Date): string => Paging.pageKey(date);

/** Local midnight of a date, or the first moment of a day that has none. */
const day = (year: number, month: number, date: number): Date => new Date(year, month - 1, date);

/** The month a range is named for, as `YYYY-MM`. */
const monthOf = (range: Paging.PageRange): string => key(Paging.majorityMonth(range)).slice(0, 7);

describe('the zone these tests run under', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2025, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2025, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });
});

describe('the week row holding a day', () => {
  it.each([
    // Wednesday 18 March 2026.
    ['a Wednesday, Sundays first', day(2026, 3, 18), SUNDAY, '2026-03-15'],
    ['a Wednesday, Mondays first', day(2026, 3, 18), MONDAY, '2026-03-16'],
    // The first weekday itself is its own row's first day.
    ['a Sunday, Sundays first', day(2026, 3, 15), SUNDAY, '2026-03-15'],
    ['a Monday, Mondays first', day(2026, 3, 16), MONDAY, '2026-03-16'],
    // The last weekday reaches back six days.
    ['a Saturday, Sundays first', day(2026, 3, 21), SUNDAY, '2026-03-15'],
    ['a Sunday, Mondays first', day(2026, 3, 22), MONDAY, '2026-03-16'],
    // Any moment of the day counts as the day.
    ['late on a Wednesday', new Date(2026, 2, 18, 23, 59), MONDAY, '2026-03-16'],
  ])('starts on %s', (_name, date, firstDayOfWeek, expected) => {
    const start = ViewConfig.monthRowsStart(date, firstDayOfWeek);
    expect(key(start)).toBe(expected);
    expect([start.getMinutes(), start.getSeconds(), start.getMilliseconds()]).toEqual([0, 0, 0]);
  });

  it('starts on the Azores’ spring day, which has no midnight, at its first moment', () => {
    // Sunday 29 March 2026: the row of Wednesday 1 April, Sundays first.
    const start = ViewConfig.monthRowsStart(day(2026, 4, 1), SUNDAY);
    expect(key(start)).toBe('2026-03-29');
    expect(start.getDay()).toBe(SUNDAY);
    // Midnight where the zone has one, 01:00 where it springs forward at 00:00.
    expect(start.getTime()).toBe(new Date(2026, 2, 29).getTime());
  });
});

describe('the weeks a month opens on', () => {
  it.each([
    // November 2026 starts on a Sunday.
    ['November, Sundays first', day(2026, 11, 17), SUNDAY, '2026-11-01', '2026-12-12'],
    ['November, Mondays first', day(2026, 11, 17), MONDAY, '2026-10-26', '2026-12-06'],
    // The 1st on the last weekday: the month starts in its first row's last cell, and the six
    // rows still hold all of it.
    [
      'August, its 1st a Saturday, Sundays first',
      day(2026, 8, 20),
      SUNDAY,
      '2026-07-26',
      '2026-09-05',
    ],
    [
      'March, its 1st a Sunday, Mondays first',
      day(2026, 3, 18),
      MONDAY,
      '2026-02-23',
      '2026-04-05',
    ],
    // Across the spring change in the Azores, Berlin and New York.
    ['April, Sundays first', day(2026, 4, 30), SUNDAY, '2026-03-29', '2026-05-09'],
    ['April, Mondays first', day(2026, 4, 30), MONDAY, '2026-03-30', '2026-05-10'],
  ])('%s', (_name, start, firstDayOfWeek, first, last) => {
    const rows = ViewConfig.monthHomeRowsStart(start, firstDayOfWeek);
    const end = Paging.addDays(rows, ViewConfig.MONTH_DAYS - 1);
    expect([key(rows), key(end)]).toEqual([first, last]);

    // Six whole weeks, and the month inside them from its 1st to its last day.
    expect(ViewConfig.MONTH_DAYS).toBe(ViewConfig.MONTH_ROWS * 7);
    const range = { start: rows, days: ViewConfig.MONTH_DAYS };
    const firstOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    expect(Paging.rangeContains(range, firstOfMonth)).toBe(true);
    expect(Paging.rangeContains(range, lastOfMonth)).toBe(true);
    expect(monthOf(range)).toBe(key(firstOfMonth).slice(0, 7));
  });
});

describe('the month a page names', () => {
  it.each([
    // Six days of February, all of March, five of April.
    ['the month of most of its days', day(2026, 2, 23), 42, '2026-03'],
    // 11 to 31 January and 1 to 21 February, 21 each: the month of day 21, the 1st of February.
    ['the month of its middle day on a tie', day(2026, 1, 11), 42, '2026-02'],
    // The same tie the other way round.
    ['the month of its middle day on a tie in spring', day(2026, 3, 11), 42, '2026-04'],
    // Across the Azores' spring day.
    ['a page starting on the spring day', day(2026, 3, 29), 42, '2026-04'],
    // A page of other views is named the same way, whatever its length.
    ['a week across two months', day(2026, 4, 28), 7, '2026-05'],
  ])('is %s', (_name, start, days, expected) => {
    expect(monthOf({ start, days })).toBe(expected);
    expect(key(Paging.majorityMonth({ start, days })).slice(8)).toBe('01');
  });

  it('steps across the turn of the year a month at a time', () => {
    // From December 2026 forward to January 2027 and back, Mondays first: each step opens the
    // weeks of the month after or before the one the page is named for.
    const december = { start: ViewConfig.monthHomeRowsStart(day(2026, 12, 1), MONDAY), days: 42 };
    expect([key(december.start), monthOf(december)]).toEqual(['2026-11-30', '2026-12']);

    const named = Paging.majorityMonth(december);
    const january = {
      start: ViewConfig.monthHomeRowsStart(
        new Date(named.getFullYear(), named.getMonth() + 1, 1),
        MONDAY,
      ),
      days: 42,
    };
    expect([key(january.start), monthOf(january)]).toEqual(['2026-12-28', '2027-01']);

    const back = Paging.majorityMonth(january);
    const again = ViewConfig.monthHomeRowsStart(
      new Date(back.getFullYear(), back.getMonth() - 1, 1),
      MONDAY,
    );
    expect(key(again)).toBe(key(december.start));
  });
});

describe('the load where month is reachable', () => {
  /** Wednesday 18 March 2026, noon: Mondays first, its month's rows start on 23 February. */
  const NOW = new Date(2026, 2, 18, 12);

  /** The window a load config asks Home Assistant for, as its first and last day. */
  function window(load: Types.Config, firstDayOfWeek: number): [string, string] {
    const asked = getTimeWindow(load.days_to_show, load.start_date, firstDayOfWeek, NOW);
    return [key(asked.start), key(Paging.addDays(asked.end, -1))];
  }

  const SWITCHER: Types.ToolbarConfig = { show: true, view_switcher: true };

  it.each([
    // The month's six weeks hold the list's fourteen days from today.
    ['home, Mondays first', null, MONDAY, 14, ['2026-02-23', '2026-04-05'], 42],
    ['home, Sundays first', null, SUNDAY, 14, ['2026-03-01', '2026-04-11'], 42],
    // A longer view runs past the month's weeks, and the load runs with it.
    ['home, with a longer list', null, MONDAY, 60, ['2026-02-23', '2026-05-16'], 83],
    // A page is a row's first day: the weeks from it, which hold the list's days.
    ['a page', '2026-03-30', MONDAY, 14, ['2026-03-30', '2026-05-10'], 42],
    // Another view's page key snaps to its week, Sundays first.
    ['a page that starts mid-week', '2026-03-25', SUNDAY, 14, ['2026-03-22', '2026-05-02'], 42],
  ] as const)('covers %s', (_name, page, firstDayOfWeek, days, expected, length) => {
    const config = buildConfig({
      days_to_show: days,
      toolbar: SWITCHER,
      ...(page === null ? {} : { start_date: page }),
    });

    const load = ViewConfig.loadConfig(config, firstDayOfWeek, page === null, NOW);

    expect(window(load, firstDayOfWeek)).toEqual(expected);
    expect(load.start_date).toBe(expected[0]);
    expect(load.days_to_show).toBe(length);
    // Everything else is the configuration's own.
    expect({ ...load, start_date: config.start_date, days_to_show: config.days_to_show }).toEqual(
      config,
    );
  });

  it('loads a month card alone for its weeks, whatever its day count', () => {
    for (const days of [3, 14, 60]) {
      const config = buildConfig({ view: 'month', days_to_show: days });
      const load = ViewConfig.loadConfig(config, MONDAY, true, NOW);
      expect(window(load, MONDAY), `days_to_show ${days}`).toEqual(['2026-02-23', '2026-04-05']);
    }
  });

  it('holds a relative start date to the month it resolves in', () => {
    // `today` on the 18th and `today+7` on the 25th both open March's weeks, and the list's
    // fourteen days from the 25th reach two days past them; `today+14` opens April's.
    const load = (start_date: string) =>
      ViewConfig.loadConfig(
        buildConfig({ start_date, days_to_show: 14, toolbar: SWITCHER }),
        MONDAY,
        true,
        NOW,
      );
    expect(window(load('today'), MONDAY)).toEqual(['2026-02-23', '2026-04-05']);
    expect(window(load('today+7'), MONDAY)).toEqual(['2026-02-23', '2026-04-07']);
    expect(window(load('today+14'), MONDAY)).toEqual(['2026-03-30', '2026-05-10']);
  });

  it.each([
    ['every layout', true, ['2026-02-23', '2026-04-05']],
    ['a list with month', ['grid', 'month'], ['2026-02-23', '2026-04-05']],
    ['a list without month, as before', ['list', 'grid'], ['2026-03-18', '2026-03-31']],
    ['no layout', false, ['2026-03-18', '2026-03-31']],
    ['an empty list, as no switcher', [], ['2026-03-18', '2026-03-31']],
    ['a list whose only member names no layout', ['week'], ['2026-03-18', '2026-03-31']],
    ['month and a member that names no layout', ['week', 'month'], ['2026-02-23', '2026-04-05']],
  ])('follows a switcher offering %s', (_name, view_switcher, expected) => {
    const config = buildConfig({
      days_to_show: 14,
      toolbar: { show: true, view_switcher } as Types.ToolbarConfig,
    });
    const load = ViewConfig.loadConfig(config, MONDAY, true, NOW);
    expect(window(load, MONDAY)).toEqual(expected);
  });
});

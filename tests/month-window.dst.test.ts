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
    // A page's day opens the weeks of the month holding it, joined by the list's days from it:
    // a month's own page, keyed by its 1st.
    ['a month page', '2026-04-01', MONDAY, 14, ['2026-03-30', '2026-05-10'], 42],
    // Another layout's page in the middle of a month, Sundays first: March's weeks hold it.
    ['a page that starts mid-month', '2026-03-25', SUNDAY, 14, ['2026-03-01', '2026-04-11'], 42],
    // A page whose list runs past its month's weeks, and the load with it.
    ['a page late in a month', '2026-03-30', MONDAY, 14, ['2026-02-23', '2026-04-12'], 49],
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

  it.each([
    // Every start date that follows today opens today's month, March's weeks, and the list's
    // fourteen days from wherever it starts join them as one span.
    ['today', 'today', ['2026-02-23', '2026-04-05']],
    ['a week ahead, past the weeks by two days', 'today+7', ['2026-02-23', '2026-04-07']],
    // The list starts on 1 April; Month still opens March, not April.
    ['two weeks ahead, in April', 'today+14', ['2026-02-23', '2026-04-14']],
    ['the start of the week', 'start_of_week', ['2026-02-23', '2026-04-05']],
    // The list starts on 17 February, before the weeks; Month still opens March, not February.
    ['29 days back, in February', 'today-29', ['2026-02-17', '2026-04-05']],
    // A fixed date opens its own month: April's weeks hold the list's days.
    ['a fixed date in April', '2026-04-10', ['2026-03-30', '2026-05-10']],
    ['a fixed date in March', '2026-03-25', ['2026-02-23', '2026-04-07']],
  ])('holds %s to Month’s home month', (_name, start_date, expected) => {
    const load = ViewConfig.loadConfig(
      buildConfig({ start_date, days_to_show: 14, toolbar: SWITCHER }),
      MONDAY,
      true,
      NOW,
    );
    expect(window(load, MONDAY)).toEqual(expected);
  });

  it.each([
    // Tuesday 1 December: the week began on Monday 30 November, yet Month opens December.
    [
      'the start of the week on a month’s first days',
      new Date(2026, 11, 1, 12),
      'start_of_week',
      14,
      ['2026-11-30', '2027-01-10'],
    ],
    // Monday 30 November: tomorrow is 1 December, yet Month opens November.
    [
      'tomorrow on a month’s last day',
      new Date(2026, 10, 30, 12),
      'today+1',
      14,
      ['2026-10-26', '2026-12-14'],
    ],
    // Monday 1 March 2027, a common year: 29 days back is 31 January. Month opens March, whose
    // weeks cross the spring change in Berlin, New York and the Azores.
    [
      '29 days back on 1 March',
      new Date(2027, 2, 1, 12),
      'today-29',
      30,
      ['2027-01-31', '2027-04-11'],
    ],
  ] as const)('holds %s to today’s month', (_name, now, start_date, days, expected) => {
    const load = ViewConfig.loadConfig(
      buildConfig({ start_date, days_to_show: days, toolbar: SWITCHER }),
      MONDAY,
      true,
      now,
    );
    const asked = getTimeWindow(load.days_to_show, load.start_date, MONDAY, now);
    expect([key(asked.start), key(Paging.addDays(asked.end, -1))]).toEqual(expected);
  });

  it.each([
    ['a relative start date', 'today-29', ['2026-02-23', '2026-04-05']],
    ['a fixed date', '2026-05-20', ['2026-04-27', '2026-06-07']],
  ])(
    'loads a month card alone, with %s, for its home month’s weeks',
    (_name, start_date, expected) => {
      const config = buildConfig({ view: 'month', start_date });
      expect(window(ViewConfig.loadConfig(config, MONDAY, true, NOW), MONDAY)).toEqual(expected);
    },
  );

  // The windows the union `view_switcher: true | false | [layouts]` loaded, unchanged now that the
  // switch and the list are two options: each row is the same configuration written that way.
  it.each([
    ['every layout', {}, ['2026-02-23', '2026-04-05']],
    [
      'a list with month',
      { view_switcher_layouts: ['grid', 'month'] },
      ['2026-02-23', '2026-04-05'],
    ],
    [
      'a list without month, as before',
      { view_switcher_layouts: ['list', 'grid'] },
      ['2026-03-18', '2026-03-31'],
    ],
    ['no layout: the switcher off', { view_switcher: false }, ['2026-03-18', '2026-03-31']],
    [
      'no layout: the switcher off, keeping a list with month',
      { view_switcher: false, view_switcher_layouts: ['month'] },
      ['2026-03-18', '2026-03-31'],
    ],
    ['an empty list, as no switcher', { view_switcher_layouts: [] }, ['2026-03-18', '2026-03-31']],
    [
      'a list naming only the layout the card opens in, as no switcher',
      { view_switcher_layouts: ['list'] },
      ['2026-03-18', '2026-03-31'],
    ],
    [
      'a list whose only member names no layout',
      { view_switcher_layouts: ['week'] },
      ['2026-03-18', '2026-03-31'],
    ],
    [
      'month and a member that names no layout',
      { view_switcher_layouts: ['week', 'month'] },
      ['2026-02-23', '2026-04-05'],
    ],
  ])('follows a switcher offering %s', (_name, written, expected) => {
    const config = buildConfig({
      days_to_show: 14,
      toolbar: { show: true, ...written } as Types.ToolbarConfig,
    });
    const load = ViewConfig.loadConfig(config, MONDAY, true, NOW);
    expect(window(load, MONDAY)).toEqual(expected);
  });
});

/**
 * A month's day model against its own weeks, with past events hidden.
 *
 * A wide month draws an all-day event, and a timed one it draws as a banner, across all its days
 * until the whole event is past, so on Friday a banner still starts on Wednesday. The day model,
 * which the panel "+N more" opens and the narrow day list draw, has to hold the same events on
 * each of those days, or a day says "+3 more" and opens an empty panel. The oracle is the month's
 * own grouping (`groupEventsByDay` for `month`), compared day by day.
 *
 * The events cross a change of clock in local wall-clock time, so run under every DST project:
 * Berlin and Sydney, either hemisphere's change; New York, behind UTC; and the Azores, whose
 * spring day has no 00:00. Each has its own change inside the six weeks of March 2026.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';
import * as MonthDay from '../src/utils/month-day';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';

/** The changes of clock inside March 2026's six weeks, by local date. */
const NIGHTS: Array<[number, number]> = [
  [2, 8], // New York, forward
  [2, 29], // Berlin and the Azores, forward; the Azores at midnight
  [3, 5], // Sydney, back
];

/** A local wall-clock moment, as an ISO instant. */
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month, day, hour, minute).toISOString();

/** A local date, as Home Assistant writes an all-day event's. */
const dateKey = (month: number, day: number) =>
  FormatUtils.getLocalDateKey(new Date(2026, month, day));

/** Events around a change of clock on `day`, for a clock at noon the day after it. */
function eventsAround(month: number, day: number): Types.CalendarEventData[] {
  return [
    // All-day, ongoing: from two days before to two days after.
    {
      summary: 'Away',
      start: { date: dateKey(month, day - 2) },
      end: { date: dateKey(month, day + 3) },
      _entityId: ANNA,
    },
    // Timed and a banner, ongoing: the same days, from morning to evening.
    {
      summary: 'Trip',
      start: { dateTime: at(month, day - 2, 9) },
      end: { dateTime: at(month, day + 2, 18) },
      _entityId: ANNA,
    },
    // Timed and under a day, so a block a day: its first day is past, its second is not.
    {
      summary: 'Night',
      start: { dateTime: at(month, day, 22) },
      end: { dateTime: at(month, day + 1, 14) },
      _entityId: ANNA,
    },
    // All-day and over.
    {
      summary: 'Done',
      start: { date: dateKey(month, day - 3) },
      end: { date: dateKey(month, day) },
      _entityId: ANNA,
    },
    // All-day on a calendar retiring its all-day events at 10:00: its last day is today, so
    // it is over at noon, earlier days included.
    {
      summary: 'Bins',
      start: { date: dateKey(month, day - 1) },
      end: { date: dateKey(month, day + 2) },
      _entityId: BEN,
    },
    // On the same calendar and still on tomorrow, so every day of it stays.
    {
      summary: 'Camp',
      start: { date: dateKey(month, day - 1) },
      end: { date: dateKey(month, day + 3) },
      _entityId: BEN,
    },
  ];
}

describe('the zone', () => {
  it('moves its offset between January and July, or this file proves nothing', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });
});

/**
 * Each day around a change of clock, as the weeks draw it and as the day model lists it: the
 * date, then its titles in order.
 */
function bothWays(
  overrides: Partial<Types.Config>,
  month: number,
  day: number,
): { weeks: string[]; model: string[] } {
  const config = ViewConfig.resolveEffectiveConfig(
    buildConfig({ view: 'month', first_day_of_week: 'monday', ...overrides }),
    'month',
  );
  expect(config.show_past_events).toBe(false);
  const events = EventUtils.processEvents(eventsAround(month, day), config);
  const start = ViewConfig.monthRowsStart(new Date(2026, month, 1), 1);
  const days = ViewConfig.MONTH_DAYS;
  const keys = Array.from({ length: days }, (_, index) =>
    FormatUtils.getLocalDateKey(
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
    ),
  );

  const grouped = EventUtils.groupEventsByDay(
    events,
    { ...config, start_date: keys[0], days_to_show: days },
    false,
    'en',
    'month',
  );
  const drawn = new Map(
    grouped.map((each) => [
      FormatUtils.getLocalDateKey(new Date(each.timestamp)),
      each.events.filter((event) => !event._isEmptyDay).map((event) => event.summary ?? ''),
    ]),
  );
  const listed = MonthDay.monthDayLists(events, config, start, days, 'en');

  const lines = (titles: (index: number) => string[]) =>
    keys.flatMap((key, index) => {
      const each = titles(index).sort();
      return each.length > 0 ? [`${key} ${each.join(',')}`] : [];
    });
  return {
    weeks: lines((index) => drawn.get(keys[index]) ?? []),
    model: lines((index) => listed[index].map((event) => event.summary ?? '')),
  };
}

describe('the day model with past events hidden', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(NIGHTS)('holds what the weeks draw on each day around %i/%i', (month, day) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, month, day + 1, 12));
    const { weeks, model } = bothWays(
      {
        entities: [ANNA, { entity: BEN, allday_expires_at: '10:00' }],
        month: { show_past_events: false },
      } as Partial<Types.Config>,
      month,
      day,
    );
    // The weeks themselves: ongoing events on all their days, the over ones on none.
    const on = (offset: number) => dateKey(month, day + offset);
    expect(weeks).toEqual([
      `${on(-2)} Away,Trip`,
      `${on(-1)} Away,Camp,Trip`,
      `${on(0)} Away,Camp,Trip`,
      `${on(1)} Away,Camp,Night,Trip`,
      `${on(2)} Away,Camp,Trip`,
    ]);
    expect(model).toEqual(weeks);
  });

  it.each(NIGHTS)(
    'hides each past day of a timed event drawn a day at a time around %i/%i',
    (month, day) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, month, day + 1, 12));
      const { weeks, model } = bothWays(
        {
          entities: [ANNA],
          month: { show_past_events: false, multiday_banners: false },
        } as Partial<Types.Config>,
        month,
        day,
      );
      // Trip is a block a day with banners off, so its past days go, as Night's first does.
      const on = (offset: number) => dateKey(month, day + offset);
      expect(weeks).toEqual([
        `${on(-2)} Away`,
        `${on(-1)} Away`,
        `${on(0)} Away`,
        `${on(1)} Away,Night,Trip`,
        `${on(2)} Away,Trip`,
      ]);
      expect(model).toEqual(weeks);
    },
  );
});

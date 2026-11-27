/**
 * The time text of a timed event List and Columns draw on each day it covers, and Month's day
 * list and day panel draw a day at a time.
 *
 * Its first day used to read "22:05 - 23:59", the moment the split falls rather than the event's
 * end, and its last "0:00 - 1:35", a start that was not the event's. Seen with each other the two
 * rows read as one event; seen alone, as Month's day list shows them, one ends before midnight and
 * the other starts at it. The first day now reads as the event does unsplit, from its start to its
 * own end, "22:05, ends tomorrow at 1:35", and the last names only its end, "Until 1:35", as a wide
 * month's later day writes it. Middle days, unsplit rows and an event ending at the midnight after
 * it starts read as they always have.
 *
 * Named `*.dst.test.ts`, so it runs under four zones and never under UTC, where a local day and a
 * UTC day are one and the same. Fixtures are built from local fields in January, when all four
 * zones are off UTC, so the text is the same in each; the transition cases find each zone's own
 * nights at run time, and read the expected clock from `Intl` rather than from the `Date` getters
 * the code under test uses.
 *
 * The popover's span writes one date for an event ending at the midnight after it starts, and
 * asks Grid's tight predicate (`FormatUtils.endsAtNextMidnight`): the first instant of the day
 * after the start, reading 0:00. An end at 0:00:30, or at the second 0:00 of an Azores autumn
 * day, is past midnight and gets two dates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { spanText } from '../src/interaction/popover-model';
import { CARD_LANGUAGES } from '../src/translations/language-codes';
import * as EventUtils from '../src/utils/events';
import { formatEventTime } from '../src/utils/format';
import * as MonthDay from '../src/utils/month-day';

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The local days of `year` that are not 24 hours long. */
function transitionDays(year: number): Array<{ month: number; date: number; hours: number }> {
  const found: Array<{ month: number; date: number; hours: number }> = [];
  for (let month = 0; month < 12; month++) {
    for (let date = 1; date <= 31; date++) {
      const day = new Date(year, month, date);
      if (day.getMonth() !== month) break;
      const hours = (new Date(year, month, date + 1).getTime() - day.getTime()) / 3_600_000;
      if (hours !== 24) found.push({ month, date, hours });
    }
  }
  return found;
}

/** The wall-clock reading the card writes for `instant` on a 24-hour clock, from `Intl`. */
function wall(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${Number(value('hour'))}:${value('minute')}`;
}

const event = (start: Date, end: Date): Types.CalendarEventData => ({
  summary: 'Night shift',
  start: { dateTime: start.toISOString() },
  end: { dateTime: end.toISOString() },
  _entityId: 'calendar.anna',
});

const read = (text: string) => text.replace(/[\u2066-\u2069]/g, '').replace(/\u00a0/g, ' ');

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The rows' config, from the start's day, as `setConfig` and the view resolve it. */
function configFor(
  source: Types.CalendarEventData,
  view: 'list' | 'column' | 'month',
  overrides: Partial<Types.Config> = {},
): Types.Config {
  return resolveEffectiveConfig(
    buildConfig({
      entities: ['calendar.anna'],
      view,
      time_24h: true,
      show_past_events: true,
      start_date: dateKey(new Date(source.start.dateTime!)),
      days_to_show: 5,
      ...overrides,
    } as Partial<Types.Config>),
    view,
  );
}

/** The time text of every row the layout draws, from the start's day, as read. */
function rows(
  source: Types.CalendarEventData,
  view: 'list' | 'column',
  overrides: Partial<Types.Config> = {},
  language = 'en',
): string[] {
  const config = configFor(source, view, overrides);
  return EventUtils.groupEventsByDay(
    EventUtils.processEvents([source], config),
    config,
    false,
    language,
    view,
  )
    .flatMap((day) => day.events.filter((row) => !row._isEmptyDay))
    .map((row) => read(formatEventTime(row, config, language)));
}

const at = (date: number, hours: number, minutes = 0) => new Date(2026, 0, date, hours, minutes);

/** Night shift: Wednesday, Jan 14, 22:05 to Thursday, Jan 15, 1:35. */
const NIGHT = event(at(14, 22, 5), at(15, 1, 35));

beforeEach(() => {
  vi.useFakeTimers();
  // Wednesday, Jan 14, at noon: the start's day, so its end is "tomorrow".
  vi.setSystemTime(at(14, 12));
});

afterEach(() => vi.useRealTimers());

describe('the zone', () => {
  it('is off UTC in January and changes its clocks', () => {
    expect(new Date(2026, 0, 14).getTimezoneOffset()).not.toBe(0);
    expect(new Date(2026, 0, 14).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 14).getTimezoneOffset(),
    );
    expect(transitionDays(2026).map(({ hours }) => hours)).toEqual(
      expect.arrayContaining([23, 25]),
    );
  });
});

describe.each(['list', 'column'] as const)('a split event in %s', (view) => {
  const split = view === 'list' ? { split_multiday_events: true } : {};

  it('reads its first day as it reads unsplit, and its last day by its end alone', () => {
    expect(rows(NIGHT, view, split)).toEqual(['22:05, ends tomorrow at 1:35', 'Until 1:35']);
  });

  it('names the end by its date on the first day, seen days before', () => {
    vi.setSystemTime(at(12, 12));
    expect(rows(NIGHT, view, split)).toEqual([
      '22:05 until Thursday, Jan 15 at 1:35',
      'Until 1:35',
    ]);
  });

  it('writes "All day" on a middle day and the end alone on the last', () => {
    expect(rows(event(at(14, 22), at(16, 7, 30)), view, split)).toEqual([
      '22:00 until Friday, Jan 16 at 7:30',
      'All day',
      'Until 7:30',
    ]);
    expect(rows(event(at(14, 9), at(17, 17)), view, split)).toEqual([
      '9:00 until Saturday, Jan 17 at 17:00',
      'All day',
      'All day',
      'Until 17:00',
    ]);
  });

  it('keeps the start on the first day once the event is under way', () => {
    // Thursday 0:30: the unsplit row, drawn today, gives its end alone; the first day's row
    // stands on Wednesday, where the event starts.
    vi.setSystemTime(at(15, 0, 30));
    expect(rows(NIGHT, view, split)).toEqual(['22:05, ends today at 1:35', 'Until 1:35']);
  });

  it('writes the start alone on the first day, and still the end on the last, under show_end_time: false', () => {
    expect(rows(NIGHT, view, { ...split, show_end_time: false })).toEqual(['22:05', 'Until 1:35']);
  });

  it('marks the length a total only on the rows that show part of the event', () => {
    expect(rows(NIGHT, view, { ...split, show_duration: true })).toEqual([
      '22:05, ends tomorrow at 1:35 (3 hr, 30 min)',
      'Until 1:35 (3 hr, 30 min total)',
    ]);
    expect(rows(event(at(14, 22), at(16, 7, 30)), view, { ...split, show_duration: true })).toEqual(
      [
        '22:00 until Friday, Jan 16 at 7:30 (1 day, 9 hr, 30 min)',
        'All day (1 day, 9 hr, 30 min total)',
        'Until 7:30 (1 day, 9 hr, 30 min total)',
      ],
    );
  });

  it('draws an event ending at the midnight after it starts once, as it always has', () => {
    expect(rows(event(at(14, 22), at(15, 0)), view, split)).toEqual([
      '22:00, ends tomorrow at 0:00',
    ]);
  });

  it('gives an event ending at a later midnight no row on that midnight’s date', () => {
    expect(rows(event(at(14, 19), at(16, 0)), view, split)).toEqual([
      '19:00 until Friday, Jan 16 at 0:00',
      'All day',
    ]);
  });

  it('keeps an end half a minute past midnight as the next day, with a row there', () => {
    const end = new Date(at(15, 0).getTime() + 30_000);
    expect(rows(event(at(14, 22), end), view, split)).toEqual([
      '22:00, ends tomorrow at 0:00',
      'Until 0:00',
    ]);
  });

  it('reads its first day as its unsplit row does, in every card language', () => {
    const unsplit = { split_multiday_events: false, column: { split_multiday_events: false } };
    for (const source of [NIGHT, event(at(14, 22), at(16, 7, 30))]) {
      for (const language of CARD_LANGUAGES) {
        expect([language, rows(source, view, split, language)[0]]).toEqual([
          language,
          rows(source, view, unsplit, language)[0],
        ]);
      }
    }
  });

  it('writes the last day’s end time, and no placeholder, in every card language', () => {
    for (const language of CARD_LANGUAGES) {
      const last = rows(NIGHT, view, split, language)[1];
      expect(last, language).not.toMatch(/[{}]/);
      expect(last, language).toContain('1:35');
    }
  });
});

describe('the last day, in a language whose "until" a date follows', () => {
  /**
   * "Until" before a date and before a time differ in these four, so the last day reads the
   * card's `untilTime` rather than `multiDay`: "hasta las 1:35", not "hasta el 1:35". German,
   * whose two are one word, is the control.
   */
  it.each([
    ['es', 'Hasta las 1:35'],
    ['fr', "Jusqu'à 1:35"],
    ['ca', 'Fins a les 1:35'],
    ['ro', 'Până la 1:35'],
    ['de', 'Bis 1:35'],
  ])('%s', (language, until) => {
    expect(rows(NIGHT, 'column', {}, language)[1]).toBe(until);
  });
});

describe('an unsplit row', () => {
  it('reads as it always has', () => {
    expect(rows(NIGHT, 'list')).toEqual(['22:05, ends tomorrow at 1:35']);
    vi.setSystemTime(at(12, 12));
    expect(rows(NIGHT, 'list')).toEqual(['22:05 until Thursday, Jan 15 at 1:35']);
    expect(rows(NIGHT, 'column', { column: { split_multiday_events: false } })).toEqual([
      '22:05 until Thursday, Jan 15 at 1:35',
    ]);
  });

  it('reads as it always has where a search result puts back the whole event', () => {
    // Search draws a split row with its source's times, which makes it neither a first nor a
    // last day. Under way, where the unsplit row gives its end alone, a first day would not.
    vi.setSystemTime(at(15, 0, 30));
    const config = configFor(NIGHT, 'column');
    const [first] = EventUtils.groupEventsByDay(
      EventUtils.processEvents([NIGHT], config),
      config,
      false,
      'en',
      'column',
    ).flatMap((day) => day.events);
    expect(first._splitFromTimedEvent).toBe(true);
    const whole = { ...first, start: first._sourceStart!, end: first._sourceEnd! };
    expect(read(formatEventTime(whole, config, 'en'))).toBe('Ends today at 1:35');
    expect(rows(NIGHT, 'list')).toEqual(['Ends today at 1:35']);
  });
});

describe("Month's day list, a day at a time", () => {
  /** The time text of one day's rows, as the day list and the day panel list them. */
  const day = (source: Types.CalendarEventData, date: Date): string[] => {
    const config = configFor(source, 'month');
    return MonthDay.monthDayEvents(
      EventUtils.processEvents([source], config),
      config,
      date,
      'en',
    ).map((row) => read(formatEventTime(row, config, 'en')));
  };

  it('names the real end on the first day and the end alone on the last', () => {
    expect(day(NIGHT, at(14, 0))).toEqual(['22:05, ends tomorrow at 1:35']);
    expect(day(NIGHT, at(15, 0))).toEqual(['Until 1:35']);
  });
});

describe('the night the clocks change', () => {
  /** On each transition night, an event from 22:00 to 3:00 by the local clock. */
  it.each([
    ['spring', 23],
    ['autumn', 25],
  ])('names the end by its wall clock on both days, %s', (_name, hours) => {
    const night = transitionDays(2026).find((found) => found.hours === hours)!;
    const start = new Date(2026, night.month, night.date - 1, 22);
    const end = new Date(2026, night.month, night.date, 3);
    vi.setSystemTime(new Date(2026, night.month, night.date - 1, 12));

    expect(rows(event(start, end), 'column')).toEqual([
      `22:00, ends tomorrow at ${wall(end)}`,
      `Until ${wall(end)}`,
    ]);
  });

  /**
   * The Azores' spring day has no 00:00 and starts at 1:00. An end at its first instant is not
   * past midnight, so it is one row; elsewhere the same construction is an ordinary midnight.
   */
  it('draws an end at the first instant of the spring day once', () => {
    const night = transitionDays(2026).find((found) => found.hours === 23)!;
    const start = new Date(2026, night.month, night.date - 1, 22);
    const end = new Date(2026, night.month, night.date);
    vi.setSystemTime(new Date(2026, night.month, night.date - 1, 12));

    expect(rows(event(start, end), 'column')).toEqual([`22:00, ends tomorrow at ${wall(end)}`]);
  });
});

describe("the popover's span", () => {
  const span = (start: Date, end: Date) =>
    spanText({ allDay: false, start, end }, 'en', true).replace(/\u202f/g, ' ');

  it('writes one date for an end at the midnight after the start', () => {
    expect(span(at(14, 22), at(15, 0))).toBe('Jan 14, 2026  22:00 – 00:00');
  });

  it('writes two dates for an end half a minute past it', () => {
    expect(span(at(14, 22), new Date(at(15, 0).getTime() + 30_000))).toBe(
      'Jan 14, 2026 22:00 – Jan 15, 2026 00:00',
    );
  });

  it('writes two dates for midnight to midnight', () => {
    expect(span(at(14, 0), at(15, 0))).toBe('Jan 14, 2026 00:00 – Jan 15, 2026 00:00');
  });

  it('writes two dates for an end at the second 0:00 of the autumn day', () => {
    const day = transitionDays(2026).find((found) => found.hours === 25)!;
    const start = new Date(2026, day.month, day.date - 1, 22);
    const end = new Date(new Date(2026, day.month, day.date).getTime() + 3_600_000);

    expect(span(start, end)).toMatch(/ – [A-Z][a-z]{2} \d+, 2026 \d\d:\d\d$/);
  });
});

/**
 * The time text of a timed event List and Columns draw over more than one day, and of one that
 * ends at the midnight after it starts.
 *
 * Split, the first day's row used to read "22:05 - 23:59", the moment the split falls rather than
 * the event's end, and the last day's "0:00 - 1:35", a start that was not the event's. The first
 * now writes the event's own end and the days to it as Grid's first block does, "22:05 - 1:35
 * (+1)", and the last writes its end as an unsplit row writes an event already under way, "Ends
 * today at 1:35". An event ending at the midnight after it starts reads "22:00 - 0:00", as Grid
 * and any calendar write it, rather than "22:00, ends tomorrow at 0:00", counted from today.
 *
 * Named `*.dst.test.ts`, so it runs under four zones and never under UTC, where a local day and a
 * UTC day are one and the same. Fixtures are built from local fields in January, when all four
 * zones are off UTC, so the text is the same in each; the transition cases find each zone's own
 * nights at run time. "Midnight" is the tight one Grid uses (`FormatUtils.endsAtNextMidnight`):
 * the first instant of the day after the start, reading 0:00. The Azores, whose clocks change at
 * midnight, are where it differs from "reads 0:00": their spring day starts at 1:00 and their
 * autumn day reads 0:00 twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { spanText } from '../src/interaction/popover-model';
import * as EventUtils from '../src/utils/events';
import { formatEventTime } from '../src/utils/format';

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
  summary: 'Late match',
  start: { dateTime: start.toISOString() },
  end: { dateTime: end.toISOString() },
  _entityId: 'calendar.anna',
});

/**
 * The time text of every row the layout draws, from the start's day, as read: isolates dropped
 * and a no-break space a space.
 */
function rows(
  source: Types.CalendarEventData,
  view: 'list' | 'column',
  overrides: Partial<Types.Config> = {},
): string[] {
  const start = new Date(source.start.dateTime!);
  const config = resolveEffectiveConfig(
    buildConfig({
      entities: ['calendar.anna'],
      view,
      time_24h: true,
      show_past_events: true,
      start_date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      days_to_show: 4,
      ...overrides,
    } as Partial<Types.Config>),
    view,
  );
  const processed = EventUtils.processEvents([source], config);
  return EventUtils.groupEventsByDay(processed, config, false, 'en', view)
    .flatMap((day) => day.events.filter((row) => !row._isEmptyDay))
    .map((row) =>
      formatEventTime(row, config, 'en')
        .replace(/[\u2066-\u2069]/g, '')
        .replace(/\u00a0/g, ' '),
    );
}

const at = (date: number, hours: number, minutes = 0) => new Date(2026, 0, date, hours, minutes);

/** Wednesday, Jan 14, at noon: the start's day, so its end is "tomorrow". */
const NOON = at(14, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});

afterEach(() => vi.useRealTimers());

describe('the zone', () => {
  it('is off UTC in January and changes its clocks', () => {
    expect(new Date(2026, 0, 14).getTimezoneOffset()).not.toBe(0);
    expect(transitionDays(2026).map(({ hours }) => hours)).toEqual(
      expect.arrayContaining([23, 25]),
    );
  });
});

describe.each(['list', 'column'] as const)('a split event in %s', (view) => {
  const split = view === 'list' ? { split_multiday_events: true } : {};

  it('writes its end and the days to it on the first row, and its end on the last', () => {
    expect(rows(event(at(14, 22, 5), at(15, 1, 35)), view, split)).toEqual([
      '22:05 - 1:35 (+1)',
      'Ends tomorrow at 1:35',
    ]);
  });

  it('counts the days to an end two dates later, with an all-day day between', () => {
    expect(rows(event(at(14, 9), at(16, 17)), view, split)).toEqual([
      '9:00 - 17:00 (+2)',
      'All day',
      'Until Friday, Jan 16 at 17:00',
    ]);
  });

  it('counts to the date a midnight end falls on, which takes no row of its own', () => {
    expect(rows(event(at(14, 19), at(16, 0)), view, split)).toEqual([
      '19:00 - 0:00 (+2)',
      'All day',
    ]);
  });

  it('names the end from today on a day after the start', () => {
    vi.setSystemTime(at(15, 0, 30));
    expect(rows(event(at(14, 22, 5), at(15, 1, 35)), view, split)).toEqual([
      '22:05 - 1:35 (+1)',
      'Ends today at 1:35',
    ]);
  });

  it('writes the start alone on the first row under show_end_time: false', () => {
    expect(
      rows(event(at(14, 22, 5), at(15, 1, 35)), view, { ...split, show_end_time: false }),
    ).toEqual(['22:05', 'Ends tomorrow at 1:35']);
  });

  it('marks the length a total only on the row that shows part of the event', () => {
    expect(
      rows(event(at(14, 22, 5), at(15, 1, 35)), view, { ...split, show_duration: true }),
    ).toEqual(['22:05 - 1:35 (+1) (3 hr, 30 min)', 'Ends tomorrow at 1:35 (3 hr, 30 min total)']);
  });

  it('keeps an end half a minute past midnight as the next day, with a row there', () => {
    const end = new Date(at(15, 0).getTime() + 30_000);
    expect(rows(event(at(14, 22), end), view, split)).toEqual([
      '22:00 - 0:00 (+1)',
      'Ends tomorrow at 0:00',
    ]);
  });
});

describe.each([
  ['list, unsplit', 'list', {}],
  ['list, split', 'list', { split_multiday_events: true }],
  ['column', 'column', {}],
] as const)('an event ending at the midnight after it starts, in %s', (_name, view, overrides) => {
  it('reads as one day, "22:00 - 0:00"', () => {
    expect(rows(event(at(14, 22), at(15, 0)), view, overrides)).toEqual(['22:00 - 0:00']);
  });

  it('reads its start alone under show_end_time: false', () => {
    expect(
      rows(event(at(14, 22), at(15, 0)), view, { ...overrides, show_end_time: false }),
    ).toEqual(['22:00']);
  });

  it('control: an event from midnight to midnight still names the day it ends on', () => {
    const text = rows(event(at(14, 0), at(15, 0)), view, overrides);
    expect(text[0]).not.toBe('0:00 - 0:00');
  });
});

describe('the midnight after the start, where the clocks change', () => {
  /**
   * The Azores' spring day has no 00:00 and starts at 1:00. An end at that first instant is not
   * an end at 0:00, so it is not one day "22:00 - 1:00", an end before the start. Elsewhere the
   * same construction is an ordinary midnight.
   */
  it('reads one day only where the first instant of the spring day reads 0:00', () => {
    const day = transitionDays(2026).find((found) => found.hours === 23)!;
    const start = new Date(2026, day.month, day.date - 1, 22);
    const end = new Date(2026, day.month, day.date);
    vi.setSystemTime(new Date(2026, day.month, day.date - 1, 12));

    const expected = wall(end) === '0:00' ? '22:00 - 0:00' : `22:00, ends tomorrow at ${wall(end)}`;
    expect(rows(event(start, end), 'list')).toEqual([expected]);
  });

  /** The Azores' autumn day reads 0:00 twice; an end at the second is an hour into the day. */
  it('keeps an end an hour into the autumn day as the next day', () => {
    const day = transitionDays(2026).find((found) => found.hours === 25)!;
    const start = new Date(2026, day.month, day.date - 1, 22);
    const end = new Date(new Date(2026, day.month, day.date).getTime() + 3_600_000);
    vi.setSystemTime(new Date(2026, day.month, day.date - 1, 12));

    expect(rows(event(start, end), 'list')).toEqual([`22:00, ends tomorrow at ${wall(end)}`]);
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

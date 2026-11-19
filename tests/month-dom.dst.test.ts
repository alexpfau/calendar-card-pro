/**
 * The month view across daylight-saving changes, under every zone the suite runs in.
 *
 * A month's six rows are built by stepping local calendar days, and its events are split at
 * local midnights, so both cross a clock change as a matter of course. Every expectation is a
 * calendar date or a wall-clock reading, which is the same in every zone, so a zone that moves
 * a cell, splits a bar at the wrong day or reads an overnight event's end in UTC fails here. The
 * nights below hold a change in at least one zone each: New York's spring (March 8), Europe's
 * and the Azores' spring (March 29, where the Azores have no midnight), Sydney's autumn (April
 * 5) and spring (October 4), Europe's autumn (October 25) and New York's autumn (November 1).
 *
 * The dates' oracle is UTC calendar arithmetic, which shares nothing with the local-field
 * stepping under test.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Month from '../src/rendering/month';
import * as EventUtils from '../src/utils/events';
import * as Paging from '../src/utils/paging';

const MONDAY = 1;
const SUNDAY = 0;

/** A local wall-clock moment, as an ISO instant. */
const at = (month: number, day: number, hours: number, minutes = 0): string =>
  new Date(2026, month - 1, day, hours, minutes).toISOString();

/** Renders the month holding a day, from these events, as the card draws it. */
function renderMonth(
  holding: Date,
  events: Types.CalendarEventData[],
  firstDayOfWeek = MONDAY,
): { container: HTMLElement; rowsStart: Date } {
  const rowsStart = ViewConfig.monthHomeRowsStart(holding, firstDayOfWeek);
  const config = buildConfig({
    view: 'month',
    first_day_of_week: firstDayOfWeek === MONDAY ? 'monday' : 'sunday',
    start_date: Paging.pageKey(rowsStart),
    days_to_show: ViewConfig.MONTH_DAYS,
    time_24h: true,
  });
  const days = EventUtils.groupEventsByDay(
    events.map((event) => ({ ...event, _entityId: 'calendar.personal' })),
    config,
    false,
    'en',
    'month',
  );
  const container = document.createElement('div');
  litRender(
    Month.renderMonthGroupedEvents(
      days,
      rowsStart,
      ViewConfig.resolveEffectiveConfig(config, 'month'),
      'en',
    ),
    container,
  );
  return { container, rowsStart };
}

/** Each line of a week row, as `column title time`. */
function lines(week: Element): string[] {
  return [...week.querySelectorAll<HTMLElement>('.month-line')].map((line) =>
    [
      line.style.gridColumn,
      line.querySelector('.month-line-title')?.textContent?.trim(),
      line.querySelector('.month-line-time')?.textContent?.trim() ?? '',
    ].join(' '),
  );
}

/** Each bar of a week row, as `columns title`. */
function bars(week: Element): string[] {
  return [...week.querySelectorAll<HTMLElement>('.month-bar')].map((bar) =>
    [bar.style.gridColumn, bar.textContent?.replace(/\s+/g, ' ').trim()].join(' '),
  );
}

/** The week row holding a local date. */
function weekOf(container: HTMLElement, rowsStart: Date, date: Date): Element {
  const index = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(rowsStart.getFullYear(), rowsStart.getMonth(), rowsStart.getDate())) /
      86_400_000 /
      7,
  );
  return container.querySelectorAll('.month-week')[index];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 15, 12));
});

afterEach(() => vi.useRealTimers());

describe('the zone these tests run under', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2026, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2026, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });
});

describe('a month’s cells across a clock change', () => {
  it.each([
    ['March, Mondays first', 3, MONDAY],
    ['March, Sundays first', 3, SUNDAY],
    ['April, Mondays first', 4, MONDAY],
    ['October, Mondays first', 10, MONDAY],
    ['October, Sundays first', 10, SUNDAY],
    ['November, Sundays first', 11, SUNDAY],
  ])('are 42 consecutive days in %s', (_name, month, firstDayOfWeek) => {
    const { container, rowsStart } = renderMonth(new Date(2026, month - 1, 15), [], firstDayOfWeek);
    const first = Date.UTC(rowsStart.getFullYear(), rowsStart.getMonth(), rowsStart.getDate());
    const expected = Array.from({ length: 42 }, (_, index) =>
      String(new Date(first + index * 86_400_000).getUTCDate()),
    );

    const cells = [...container.querySelectorAll('.month-day')];
    const numbers = [...container.querySelectorAll('.month-week > .month-date > .day')];
    expect(numbers.map((number) => number.textContent?.trim())).toEqual(expected);
    // Each cell stands for its own day: a local midnight, or the first moment of a day that has
    // none, never the day before or after.
    const slots = cells.map((cell) => {
      const slot = (cell as Element & { calendarCardDaySlot?: { timestamp: number } })
        .calendarCardDaySlot!;
      return String(new Date(slot.timestamp).getDate());
    });
    expect(slots).toEqual(expected);
    expect(new Date(first).getUTCDay()).toBe(firstDayOfWeek);
  });
});

describe('events across a clock change', () => {
  it.each([
    ['New York’s spring', 3, 7],
    ['Europe’s and the Azores’ spring', 3, 28],
    ['Sydney’s autumn', 4, 4],
    ['Sydney’s spring', 10, 3],
    ['Europe’s autumn', 10, 24],
    ['New York’s autumn', 10, 31],
  ])('reads an overnight event on both days of %s', (_name, month, day) => {
    const evening = new Date(2026, month - 1, day);
    const morning = new Date(2026, month - 1, day + 1);
    const { container, rowsStart } = renderMonth(morning, [
      {
        summary: 'Night shift',
        start: { dateTime: at(month, day, 22, 30) },
        end: { dateTime: at(month, day + 1, 6) },
      },
    ]);
    const column = (date: Date) => String(((date.getDay() + 6) % 7) + 1);
    const drawn = [
      ...lines(weekOf(container, rowsStart, evening)),
      ...(weekOf(container, rowsStart, morning) === weekOf(container, rowsStart, evening)
        ? []
        : lines(weekOf(container, rowsStart, morning))),
    ];
    expect(drawn).toEqual([
      `${column(evening)} Night shift 22:30`,
      `${column(morning)} Night shift until 6:00`,
    ]);
  });

  it('breaks an all-day bar at the row, not at the clock change', () => {
    // Friday, March 27 to Tuesday, March 31, 2026, across Europe’s and the Azores’ change.
    const { container, rowsStart } = renderMonth(new Date(2026, 2, 15), [
      { summary: 'Trip', start: { date: '2026-03-27' }, end: { date: '2026-04-01' } },
    ]);
    expect(bars(weekOf(container, rowsStart, new Date(2026, 2, 27)))).toEqual(['5 / span 3 Trip']);
    expect(bars(weekOf(container, rowsStart, new Date(2026, 2, 30)))).toEqual(['1 / span 2 Trip']);
  });

  it('draws a timed event a full day or longer as a bar with its times at its ends', () => {
    // Saturday, March 28 at 09:00 to Monday, March 30 at 18:00.
    const { container, rowsStart } = renderMonth(new Date(2026, 2, 15), [
      {
        summary: 'Conference',
        start: { dateTime: at(3, 28, 9) },
        end: { dateTime: at(3, 30, 18) },
      },
    ]);
    expect(bars(weekOf(container, rowsStart, new Date(2026, 2, 28)))).toEqual([
      '6 / span 2 9:00 Conference',
    ]);
    expect(bars(weekOf(container, rowsStart, new Date(2026, 2, 30)))).toEqual([
      '1 / span 1 Conference 18:00',
    ]);
  });
});

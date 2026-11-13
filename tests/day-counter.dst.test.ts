/**
 * `show_day_counter` where clocks change: the days are local calendar dates, so a day of 23 or 25
 * hours is one day like any other, and the threshold of "a day or more long" is measured on the
 * calendar rather than in hours.
 *
 * Two independent oracles. The day numbers are checked against plain arithmetic on the calendar
 * numbers in UTC, never against the local `Date` getters the code is built from. And the number of
 * days is checked against the rows `splitMultiDayEvent` draws for the same event, which reaches
 * its answer by another route: it walks local midnights rather than subtracting dates.
 *
 * The spring and fall days are found from the zone rather than listed, so the cases run in every
 * DST project. Azores adds what only it can show: a spring day with no 00:00, and a fall night
 * whose 00:00 comes twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Hours from one local midnight to the next, so 23 on a spring day and 25 on a fall one. */
const hoursIn = (y: number, m: number, d: number): number =>
  (new Date(y, m, d + 1).getTime() - new Date(y, m, d).getTime()) / 3_600_000;

/** The first day of 2026 that is `hours` long in the test zone. */
function dayOfLength(hours: number): [number, number, number] {
  for (let d = 1; d <= 366; d++) {
    if (hoursIn(2026, 0, d) === hours) {
      const date = new Date(2026, 0, d);
      return [date.getFullYear(), date.getMonth(), date.getDate()];
    }
  }
  throw new Error(`no ${hours}-hour day in 2026 in ${ZONE}`);
}

const SPRING = dayOfLength(23);
const FALL = dayOfLength(25);

/** Local wall-clock instant. */
const at = (ymd: readonly [number, number, number], dayOffset: number, hour: number): Date =>
  new Date(ymd[0], ymd[1], ymd[2] + dayOffset, hour);

const timed = (start: Date | string, end: Date | string): Types.CalendarEventData => ({
  summary: 'Ben field trip',
  start: { dateTime: typeof start === 'string' ? start : start.toISOString() },
  end: { dateTime: typeof end === 'string' ? end : end.toISOString() },
  _entityId: 'calendar.personal',
});

/** Calendar-day number of `y-m-d` from `from`, in plain UTC arithmetic. */
const calendarDay = (from: [number, number, number], y: number, m: number, d: number): number =>
  Math.round((Date.UTC(y, m, d) - Date.UTC(from[0], from[1], from[2])) / 86_400_000) + 1;

/** The rows column view's splitter draws for an event, with the day each one names. */
function splitRows(event: Types.CalendarEventData, firstDate: string): Types.CalendarEventData[] {
  const config = buildConfig({
    start_date: firstDate,
    days_to_show: 60,
    show_past_events: true,
    show_day_counter: true,
  });
  return EventUtils.groupEventsByDay([event], config, false, 'en', 'column')
    .flatMap((day) => day.events)
    .filter((row) => row.summary === event.summary);
}

const isoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 10, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the test zone', () => {
  it('observes daylight saving time', () => {
    // Under UTC every day is 24 hours and nothing here could tip; fail loudly rather than
    // pass by proving nothing.
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
    expect(hoursIn(...SPRING)).toBe(23);
    expect(hoursIn(...FALL)).toBe(25);
  });
});

describe('counting across a change of clocks', () => {
  // From a fortnight before each change to a fortnight after it.
  it.each([
    ['spring', SPRING],
    ['fall', FALL],
  ] as const)('numbers every day across the %s change by its date', (_name, change) => {
    const first: [number, number, number] = [change[0], change[1], change[2] - 14];
    const firstDate = new Date(...first);
    const lastExclusive = new Date(change[0], change[1], change[2] + 15);
    const allDay: Types.CalendarEventData = {
      summary: 'Ben field trip',
      start: { date: isoDate(firstDate) },
      end: { date: isoDate(lastExclusive) },
      _entityId: 'calendar.personal',
    };
    const days = calendarDay(
      [firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate()],
      lastExclusive.getFullYear(),
      lastExclusive.getMonth(),
      lastExclusive.getDate() - 1,
    );
    expect(days).toBe(29);

    const allDayRows = splitRows(allDay, isoDate(firstDate));
    const timedEvent = timed(at(first, 0, 9), at(change, 14, 17));
    const timedRows = splitRows(timedEvent, isoDate(firstDate));

    for (const [event, rows] of [
      [allDay, allDayRows],
      [timedEvent, timedRows],
    ] as const) {
      expect(EventUtils.multiDaySpan(event.start, event.end)?.days).toBe(days);
      expect(rows).toHaveLength(days);
      rows.forEach((row, index) => {
        const date = new Date(firstDate);
        date.setDate(date.getDate() + index);
        const expected = calendarDay(
          [firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate()],
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
        );
        expect(row._dayOfEvent, isoDate(date)).toEqual({ day: expected, days });
      });
    }
  });

  it('counts noon to noon over the 23-hour spring day as a full day', () => {
    // 23 hours apart, and a day on the calendar: counted.
    const event = timed(at(SPRING, -1, 12), at(SPRING, 0, 12));
    expect(
      event.end.dateTime && Date.parse(event.end.dateTime) - Date.parse(event.start.dateTime!),
    ).toBe(23 * 3_600_000);
    expect(EventUtils.multiDaySpan(event.start, event.end)?.days).toBe(2);
    expect(splitRows(event, isoDate(at(SPRING, -1, 12)))).toHaveLength(2);
  });

  it('does not count noon to 11:00 over the 25-hour fall day, short of a day on the calendar', () => {
    // 24 hours apart, but short of the start's time of day: not counted, and it keeps its bar.
    const event = timed(at(FALL, -1, 12), at(FALL, 0, 11));
    expect(Date.parse(event.end.dateTime!) - Date.parse(event.start.dateTime!)).toBe(
      24 * 3_600_000,
    );
    expect(EventUtils.multiDaySpan(event.start, event.end)).toBeNull();
  });
});

describe.runIf(ZONE === 'Atlantic/Azores')('midnights that are missing or repeat', () => {
  it('ends on the day before a spring day that has no 00:00', () => {
    // The spring day's first moment is 01:00, and the moment before it is the day before.
    const firstMoment = new Date(SPRING[0], SPRING[1], SPRING[2]);
    expect(firstMoment.getHours()).toBe(1);
    const event = timed(at(SPRING, -2, 12), firstMoment);

    expect(EventUtils.multiDaySpan(event.start, event.end)?.days).toBe(2);
    expect(splitRows(event, isoDate(at(SPRING, -2, 12)))).toHaveLength(2);
  });

  it('counts the fall day only when the event ends at its second 00:00', () => {
    // Azores goes from UTC+0 to UTC-1 at 01:00 on Oct 25, so 00:00 comes twice.
    expect(FALL).toEqual([2026, 9, 25]);
    const start = '2026-10-23T12:00:00+00:00';
    const atFirst = timed(start, '2026-10-25T00:00:00+00:00');
    const atSecond = timed(start, '2026-10-25T00:00:00-01:00');

    expect(EventUtils.multiDaySpan(atFirst.start, atFirst.end)?.days).toBe(2);
    expect(splitRows(atFirst, '2026-10-23')).toHaveLength(2);

    expect(EventUtils.multiDaySpan(atSecond.start, atSecond.end)?.days).toBe(3);
    expect(splitRows(atSecond, '2026-10-23')).toHaveLength(3);
    expect(splitRows(atSecond, '2026-10-23').map((row) => row._dayOfEvent)).toEqual([
      { day: 1, days: 3 },
      { day: 2, days: 3 },
      { day: 3, days: 3 },
    ]);
  });
});

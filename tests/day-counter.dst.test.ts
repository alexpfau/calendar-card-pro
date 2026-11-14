/**
 * The day counter where clocks change: the days are local calendar dates, so a day of 23 or 25
 * hours is one day like any other, and the threshold of "a day or more long" is measured on the
 * calendar rather than in hours.
 *
 * Two independent oracles. Each row's date is read through `Intl` in the test zone and compared
 * with dates stepped in UTC, where every day has 24 hours, and its day number with its place among
 * them; the code under test reads the local `Date` getters instead. And the number of days is
 * checked against the rows `splitMultiDayEvent` draws for the same event, which reaches its
 * answer by another route: it walks local midnights rather than subtracting dates.
 *
 * The spring and fall days are found from the zone rather than listed, so the cases run in every
 * DST project. Azores adds what only it can show: a spring day with no 00:00, and a fall night
 * whose 00:00 comes twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

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

/** A day's date in the test zone, as `Intl` writes it rather than as the `Date` getters do. */
const zoneDate = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE });

/** The `index`th calendar date after `iso`, stepped in UTC, where every day has 24 hours. */
const dateAfter = (iso: string, index: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + index)).toISOString().slice(0, 10);
};

/**
 * The rows column view's splitter draws for an event: the date each is drawn under, read from
 * its day's timestamp through `Intl`, and the day each one names.
 */
function splitRows(
  event: Types.CalendarEventData,
  firstDate: string,
): { date: string; dayOfEvent: Types.DayOfEvent | undefined }[] {
  const config = buildConfig({
    start_date: firstDate,
    days_to_show: 60,
    show_past_events: true,
    show_progress_bar: true,
  });
  return EventUtils.groupEventsByDay([event], config, false, 'en', 'column').flatMap((day) =>
    day.events
      .filter((row) => row.summary === event.summary)
      .map((row) => ({ date: zoneDate.format(day.timestamp), dayOfEvent: row._dayOfEvent })),
  );
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
    // Fourteen days, the change, fourteen more: 29 dates, each named by its place among them.
    const days = 29;
    const expected = Array.from({ length: days }, (_, index) => ({
      date: dateAfter(isoDate(firstDate), index),
      dayOfEvent: { day: index + 1, days },
    }));
    expect(expected.map((row) => row.date)).toContain(isoDate(new Date(...change)));

    const timedEvent = timed(at(first, 0, 9), at(change, 14, 17));
    for (const event of [allDay, timedEvent]) {
      expect(FormatUtils.fullDaySpan(event.start, event.end)?.days).toBe(days);
      expect(splitRows(event, isoDate(firstDate))).toEqual(expected);
    }
  });

  it('counts noon to noon over the 23-hour spring day as a full day', () => {
    // 23 hours apart, and a day on the calendar: counted.
    const event = timed(at(SPRING, -1, 12), at(SPRING, 0, 12));
    expect(
      event.end.dateTime && Date.parse(event.end.dateTime) - Date.parse(event.start.dateTime!),
    ).toBe(23 * 3_600_000);
    expect(FormatUtils.fullDaySpan(event.start, event.end)?.days).toBe(2);
    expect(splitRows(event, isoDate(at(SPRING, -1, 12)))).toHaveLength(2);
  });

  it('does not count noon to 11:00 over the 25-hour fall day, short of a day on the calendar', () => {
    // 24 hours apart, but short of the start's time of day: not counted, and it keeps its bar.
    const event = timed(at(FALL, -1, 12), at(FALL, 0, 11));
    expect(Date.parse(event.end.dateTime!) - Date.parse(event.start.dateTime!)).toBe(
      24 * 3_600_000,
    );
    expect(FormatUtils.fullDaySpan(event.start, event.end)).toBeNull();
  });
});

describe('a full day, read off the wall clock', () => {
  /** The hour the spring change skips, found from the zone: 00:00 in Azores, 02:00 elsewhere. */
  const gapHour = Array.from({ length: 24 }, (_, h) => h).find(
    (h) => new Date(SPRING[0], SPRING[1], SPRING[2], h, 30).getHours() !== h,
  )!;

  /** The hour the fall change repeats: its second reading comes an hour after the first. */
  const repeatedHour = Array.from({ length: 24 }, (_, h) => h).find((h) => {
    const second = new Date(new Date(FALL[0], FALL[1], FALL[2], h, 30).getTime() + 3_600_000);
    return second.getHours() === h && second.getMinutes() === 30;
  })!;

  it('finds the hours it needs in the test zone', () => {
    expect(gapHour).toBeGreaterThanOrEqual(0);
    expect(repeatedHour).toBeGreaterThanOrEqual(0);
  });

  it('counts a day that reaches past a reading the spring change skips', () => {
    // From the gap hour's half past, the day before, to quarter past the hour after it: a full
    // day on the clock, 23 hours and 45 minutes in time. Stepping the start on by a day lands on
    // a reading that does not exist, which the browser moves an hour later, past the end.
    const start = new Date(SPRING[0], SPRING[1], SPRING[2] - 1, gapHour, 30);
    const end = new Date(SPRING[0], SPRING[1], SPRING[2], gapHour + 1, 15);
    expect(end.getTime() - start.getTime()).toBe((23 * 60 + 45) * 60_000);
    expect(FormatUtils.fullDaySpan(timed(start, end).start, timed(start, end).end)?.days).toBe(2);
  });

  it('does not count a day that ends at the second reading of a repeated hour, short on the clock', () => {
    // From :45 the day before to the second :30 of the repeated hour: 15 minutes short of a day
    // on the clock, though 24 hours and 45 minutes pass.
    const start = new Date(FALL[0], FALL[1], FALL[2] - 1, repeatedHour, 45);
    const secondReading = new Date(
      new Date(FALL[0], FALL[1], FALL[2], repeatedHour, 30).getTime() + 3_600_000,
    );
    const event = timed(start, secondReading);
    expect(secondReading.getTime() - start.getTime()).toBe((24 * 60 + 45) * 60_000);
    expect(FormatUtils.fullDaySpan(event.start, event.end)).toBeNull();
  });
});

describe.runIf(ZONE === 'Atlantic/Azores')('midnights that are missing or repeat', () => {
  it('ends on the day before a spring day that has no 00:00', () => {
    // The spring day's first moment is 01:00, and the moment before it is the day before.
    const firstMoment = new Date(SPRING[0], SPRING[1], SPRING[2]);
    expect(firstMoment.getHours()).toBe(1);
    const event = timed(at(SPRING, -2, 12), firstMoment);

    expect(FormatUtils.fullDaySpan(event.start, event.end)?.days).toBe(2);
    expect(splitRows(event, isoDate(at(SPRING, -2, 12)))).toHaveLength(2);
  });

  it('does not count 00:45 to the second 00:30 of the fall day, short of a day on the clock', () => {
    const event = timed('2026-10-24T00:45:00+00:00', '2026-10-25T00:30:00-01:00');
    expect(FormatUtils.fullDaySpan(event.start, event.end)).toBeNull();
    // The control: to 00:45, the same reading as the start, it is a full day.
    expect(
      FormatUtils.fullDaySpan(event.start, { dateTime: '2026-10-25T00:45:00-01:00' })?.days,
    ).toBe(2);
  });

  it('counts the fall day only when the event ends at its second 00:00', () => {
    // Azores goes from UTC+0 to UTC-1 at 01:00 on Oct 25, so 00:00 comes twice.
    expect(FALL).toEqual([2026, 9, 25]);
    const start = '2026-10-23T12:00:00+00:00';
    const atFirst = timed(start, '2026-10-25T00:00:00+00:00');
    const atSecond = timed(start, '2026-10-25T00:00:00-01:00');

    expect(FormatUtils.fullDaySpan(atFirst.start, atFirst.end)?.days).toBe(2);
    expect(splitRows(atFirst, '2026-10-23')).toHaveLength(2);

    expect(FormatUtils.fullDaySpan(atSecond.start, atSecond.end)?.days).toBe(3);
    expect(splitRows(atSecond, '2026-10-23')).toHaveLength(3);
    expect(splitRows(atSecond, '2026-10-23')).toEqual([
      { date: '2026-10-23', dayOfEvent: { day: 1, days: 3 } },
      { date: '2026-10-24', dayOfEvent: { day: 2, days: 3 } },
      { date: '2026-10-25', dayOfEvent: { day: 3, days: 3 } },
    ]);
  });
});

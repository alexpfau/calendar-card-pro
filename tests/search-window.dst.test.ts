/**
 * The days a search covers, under real time zones (`searchWindow` in `src/utils/search.ts`).
 *
 * The window is a year back and a year ahead in whole local days, and a load is reused only
 * while its first day stands, so both ends have to be local midnights on every day of the year.
 * Under UTC, the only zone with no transition, a window built from 24-hour days is right by
 * construction. Here a window whose last day follows a 23- or 25-hour day ends an hour off
 * midnight if its end is the year-ahead midnight plus 24 hours: planted, that fails six cases,
 * the two dates a year before each zone's 2027 transitions, and passes every other. No zone is
 * uniquely required, since each catches it on its own transitions; only those dates can, which
 * is why they are listed. The oracle is `Intl.DateTimeFormat`, not the `Date` getters the window
 * is built from, so it checks rather than restates the implementation.
 */

import { describe, expect, it } from 'vitest';

import * as Search from '../src/utils/search';

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A moment's local date and time in this zone, read by `Intl`, as `YYYY-MM-DD HH:MM`. */
const LOCAL = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function local(date: Date): string {
  const part = (type: string) => LOCAL.formatToParts(date).find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

/** A calendar date moved by whole days, by UTC arithmetic on the date alone. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The same month and day `years` away, the month's last day where it is shorter. */
function sameDate(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Whole days between two calendar dates. */
function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** A local time on a calendar date in this zone, found by stepping through the hours around it. */
function at(date: string, time: string): Date {
  for (let hours = -14; hours <= 14; hours += 1) {
    const candidate = new Date(Date.parse(`${date}T${time}:00Z`) - hours * 3_600_000);
    if (local(candidate) === `${date} ${time}`) return candidate;
  }
  throw new Error(`no ${time} on ${date} in ${ZONE}`);
}

/**
 * A date's first moment in this zone: its 00:00, or 01:00 where the clocks change at midnight
 * and the day has no 00:00, as the Azores' spring day does.
 */
function dayStart(date: string): Date {
  try {
    return at(date, '00:00');
  } catch {
    return at(date, '01:00');
  }
}

/**
 * Days around every transition the four zones have in 2026, where a window starts a year back;
 * the days a year before each of their 2027 transitions, where a window's last day is one, so it
 * ends on the day after a 23- or 25-hour day; the day before a year before the Azores' 2027
 * spring change, where a window ends on a day with no 00:00; and the 1st and 15th of each month.
 * The Azores change on Berlin's dates, so they share Berlin's entries.
 */
const DATES = [
  // A year before 2027's transitions: New York's, Berlin's, Sydney's, Sydney's, Berlin's, New York's.
  '2026-03-14',
  '2026-03-28',
  '2026-04-04',
  '2026-10-03',
  '2026-10-31',
  '2026-11-07',
  // A year before the day before the Azores' 2027 spring change: the window ends on 2027-03-28.
  '2026-03-27',
  '2026-03-08',
  '2026-03-09',
  '2026-03-29',
  '2026-03-30',
  '2026-04-05',
  '2026-04-06',
  '2026-10-04',
  '2026-10-05',
  '2026-10-25',
  '2026-10-26',
  '2026-11-01',
  '2026-11-02',
  '2028-02-29',
  ...Array.from({ length: 12 }, (_, i) => [
    `2026-${String(i + 1).padStart(2, '0')}-01`,
    `2026-${String(i + 1).padStart(2, '0')}-15`,
  ]).flat(),
];

describe(`the days a search covers, in ${ZONE}`, () => {
  it('runs in a zone with daylight saving time, or proves nothing', () => {
    const offset = (date: string) => new Date(`${date}T12:00:00Z`).getTimezoneOffset();
    expect(offset('2026-01-15')).not.toBe(offset('2026-07-15'));
  });

  it.each(DATES)('from %s, start and end at local midnights a year either side', (date) => {
    const window = Search.searchWindow(at(date, '12:00'));
    const start = sameDate(date, -1);
    const end = shiftDate(sameDate(date, 1), 1);

    expect({
      start: local(window.start),
      end: local(window.end),
      days: window.days,
      key: window.key,
    }).toEqual({
      start: local(dayStart(start)),
      end: local(dayStart(end)),
      days: daysBetween(start, end),
      key: start,
    });
  });

  it.each(DATES)('from the first and last moments of %s, the same window', (date) => {
    const first = Search.searchWindow(dayStart(date));
    const last = Search.searchWindow(new Date(dayStart(shiftDate(date, 1)).getTime() - 1));
    const noon = Search.searchWindow(at(date, '12:00'));

    expect([local(first.start), local(first.end)]).toEqual([local(noon.start), local(noon.end)]);
    expect([local(last.start), local(last.end)]).toEqual([local(noon.start), local(noon.end)]);
  });
});

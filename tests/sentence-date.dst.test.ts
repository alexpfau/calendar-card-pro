import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as FormatUtils from '../src/utils/format';

/**
 * The date in an end phrase names the local day, in every zone.
 *
 * The browser writes that date (`sentenceDate` in format.ts), and a browser format names the
 * day in the zone it was made in. The card keeps one per language, so it reads the local day
 * from the `Date` getters and hands the format that day at noon UTC, in UTC. Formatting the
 * end itself in UTC would name the wrong day for every end near midnight outside UTC, and the
 * `unit` project, which runs under UTC, could never see it. So this file runs under the four
 * DST projects instead.
 *
 * Every fixture is in January, when all four zones are off UTC (Azores runs on UTC itself in
 * summer), and ends at 0:30 or 23:30, so that in each zone one of the two falls on another day
 * in UTC. The expectations are calendar facts, the same in every zone.
 */

/** Sunday 10 January 2027, 10:30 local. */
const NOW = new Date(2027, 0, 10, 10, 30);

const config = buildConfig({ split_multiday_events: false, time_24h: true });

function timed(start: Date, end: Date): Types.CalendarEventData {
  return {
    summary: 'Anna away',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a date in an end phrase, outside UTC', () => {
  it('runs under a zone that observes DST and is off UTC in January', () => {
    const janOffset = new Date(2027, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2027, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
    expect(janOffset).not.toBe(0);
  });

  const justAfterMidnight = new Date(2027, 0, 15, 0, 30);
  const justBeforeMidnight = new Date(2027, 0, 15, 23, 30);

  it('ends near midnight on a day that is another day in UTC', () => {
    // Guards the fixtures: if neither end crossed a day in UTC, a format in UTC would pass.
    expect(
      [justAfterMidnight, justBeforeMidnight].some((end) => end.getUTCDate() !== end.getDate()),
    ).toBe(true);
  });

  it('names the local day for an end just after and just before midnight', () => {
    const from = new Date(2027, 0, 10, 9, 0);
    expect(FormatUtils.formatEventTime(timed(from, justAfterMidnight), config, 'de')).toBe(
      '9:00 bis Freitag, 15. Jan. um 0:30',
    );
    expect(FormatUtils.formatEventTime(timed(from, justBeforeMidnight), config, 'de')).toBe(
      '9:00 bis Freitag, 15. Jan. um 23:30',
    );
    expect(FormatUtils.formatEventTime(timed(from, justAfterMidnight), config, 'en')).toBe(
      '9:00 until Friday, Jan 15 at 0:30',
    );
    expect(FormatUtils.formatEventTime(timed(from, justBeforeMidnight), config, 'ko')).toBe(
      '9:00 ~ 1월 15일 금요일 23:30',
    );
  });

  it('names the last day of an all-day event, on the day the clocks go forward too', () => {
    // 28 March 2027 has no 00:00 in Azores, so its local midnight is 01:00.
    const through = (end: string) =>
      FormatUtils.formatEventTime(
        { summary: 'Ben away', start: { date: '2027-01-09' }, end: { date: end } },
        config,
        'de',
      );
    expect(through('2027-01-16')).toBe('Ganztägig, bis Freitag, 15. Jan.');
    expect(through('2027-03-28')).toBe('Ganztägig, bis Samstag, 27. März');
    expect(through('2027-03-29')).toBe('Ganztägig, bis Sonntag, 28. März');
  });
});

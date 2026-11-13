/**
 * `time` visibility conditions on the days a clock skips or repeats an hour.
 *
 * Runs under every `dst-*` project (see `vitest.config.mjs`), with the browser's zone the zone
 * the condition reads, as it is unless a profile asks for the server's zone from elsewhere. Each
 * zone below names its spring day, a time inside the hour it skips, and a time inside the hour
 * it repeats in autumn.
 *
 * The expected instants are Home Assistant's: `TZDate` from `@date-fns/tz`, which its
 * `checkTimeInRange` builds `after` and `before` with, run in each zone. A skipped time lands as
 * far past the skip as it was into it, a repeated time on the first of its two moments. Azores
 * is the one zone whose skipped hour starts at midnight, so it alone tests a day with no 00:00.
 */
import { describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import { evaluateVisibility, nextVisibilityChange, zonedInstant } from '../src/utils/visibility';

interface ZoneDays {
  /** Spring: the date, and a time the clock skips that day. */
  gap: [number, number, number, number, number];
  /** Where Home Assistant puts that time. */
  gapAt: string;
  /** Autumn: the date, and a time the clock reads twice that day. */
  repeat: [number, number, number, number, number];
  /** Where Home Assistant puts that time: the first of the two. */
  repeatAt: string;
  /** The first moment of the spring day. */
  springDayStarts: string;
}

const ZONES: Record<string, ZoneDays> = {
  'Europe/Berlin': {
    gap: [2026, 2, 29, 2, 30],
    gapAt: '2026-03-29T01:30:00.000Z',
    repeat: [2026, 9, 25, 2, 30],
    repeatAt: '2026-10-25T00:30:00.000Z',
    springDayStarts: '2026-03-28T23:00:00.000Z',
  },
  'Australia/Sydney': {
    gap: [2026, 9, 4, 2, 30],
    gapAt: '2026-10-03T16:30:00.000Z',
    repeat: [2026, 3, 5, 2, 30],
    repeatAt: '2026-04-04T15:30:00.000Z',
    springDayStarts: '2026-10-03T14:00:00.000Z',
  },
  'America/New_York': {
    gap: [2026, 2, 8, 2, 30],
    gapAt: '2026-03-08T07:30:00.000Z',
    repeat: [2026, 10, 1, 1, 30],
    repeatAt: '2026-11-01T05:30:00.000Z',
    springDayStarts: '2026-03-08T05:00:00.000Z',
  },
  'Atlantic/Azores': {
    gap: [2026, 2, 29, 0, 30],
    gapAt: '2026-03-29T01:30:00.000Z',
    repeat: [2026, 9, 25, 0, 30],
    repeatAt: '2026-10-25T00:30:00.000Z',
    springDayStarts: '2026-03-29T01:00:00.000Z',
  },
};

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DAYS = ZONES[ZONE];

const HASS = {
  states: {},
  locale: { language: 'en', time_zone: 'local' },
  config: { time_zone: ZONE },
} as unknown as Types.Hass;

const MINUTE = 60_000;

const hhmm = (hours: number, minutes: number) =>
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

const judge = (condition: Record<string, unknown>, now: number) =>
  evaluateVisibility([{ condition: 'time', ...condition }], {
    hass: HASS,
    now,
    matches: () => false,
  });

describe(`time conditions across a clock change in ${ZONE}`, () => {
  it('runs under a zone that observes DST, and one this file has days for', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
    expect(DAYS).toBeDefined();
  });

  it('puts a skipped time as far past the skip as it was into it', () => {
    const [year, month, day, hours, minutes] = DAYS.gap;
    const at = zonedInstant(ZONE, year, month, day, (hours * 60 + minutes) * MINUTE);
    expect(new Date(at).toISOString()).toBe(DAYS.gapAt);
  });

  it('puts a repeated time on the first of its two moments', () => {
    const [year, month, day, hours, minutes] = DAYS.repeat;
    const at = zonedInstant(ZONE, year, month, day, (hours * 60 + minutes) * MINUTE);
    expect(new Date(at).toISOString()).toBe(DAYS.repeatAt);
  });

  it('turns an after set inside the skipped hour on at that moment', () => {
    const [, , , hours, minutes] = DAYS.gap;
    const turnsOn = Date.parse(DAYS.gapAt);
    const condition = { after: hhmm(hours, minutes) };
    expect(judge(condition, turnsOn - 1000)).toBe(false);
    expect(judge(condition, turnsOn)).toBe(true);
  });

  it('turns a before set inside the repeated hour off after its first pass', () => {
    const [, , , hours, minutes] = DAYS.repeat;
    const last = Date.parse(DAYS.repeatAt);
    const condition = { before: hhmm(hours, minutes) };
    expect(judge(condition, last)).toBe(true);
    expect(judge(condition, last + 1000)).toBe(false);
    // The clock reads that time again an hour on; the condition stays off.
    expect(judge(condition, last + 60 * MINUTE)).toBe(false);
  });

  it('looks again at the first moment of a day that skips its first hour', () => {
    const [year, month, day] = DAYS.gap;
    const theDayBefore = zonedInstant(ZONE, year, month, day - 1, 12 * 60 * MINUTE);
    const next = nextVisibilityChange(
      [{ condition: 'time', weekdays: ['mon'] }],
      HASS,
      theDayBefore,
    );
    expect(new Date(next!).toISOString()).toBe(DAYS.springDayStarts);
  });

  it('looks again when a skipped after comes due, not an hour later', () => {
    const [year, month, day, hours, minutes] = DAYS.gap;
    const early = zonedInstant(ZONE, year, month, day, 0) + 5 * MINUTE;
    const next = nextVisibilityChange(
      [{ condition: 'time', after: hhmm(hours, minutes) }],
      HASS,
      early,
    );
    expect(new Date(next!).toISOString()).toBe(DAYS.gapAt);
  });
});

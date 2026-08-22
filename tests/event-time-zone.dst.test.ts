import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import { formatEventTime, formatTime } from '../src/utils/format';

/**
 * Event times under a real time zone.
 *
 * The `unit` project pins `TZ: 'UTC'`, which is right for everything that formats a
 * date and is also why this file has to exist separately. Under UTC a local clock
 * reading and a UTC one are the *same number*, so every assertion about the time on an
 * event passes whether the code reads `getHours()` or `getUTCHours()` — and the whole
 * suite agrees with either.
 *
 * That blind spot was measured rather than assumed. Rewriting `formatTime` to read
 * `getUTCHours()`/`getUTCMinutes()`, and rewriting `formatEventTime`'s single-day versus
 * multi-day test to compare UTC calendar days, each left the whole suite green. Both
 * would misprint the time on every timed event for every user outside UTC, which is most
 * of them. With this file present the first fails 5 assertions in each of the three
 * zones and the second fails 1 in Berlin, 2 in Sydney and 1 in New York.
 *
 * Unlike the week-number file next door this pins no DST *transition* — it pins the
 * offset itself, which is the larger of the two exposures because it applies on every
 * day of the year rather than around two of them. That also means no zone here is the
 * only one able to see a given failure, which is the honest position: all three catch
 * both mutations above, and any non-UTC zone would. What the set buys is that the
 * fixture is read at both offset signs. At `23:30Z` Berlin and Sydney sit ahead of UTC,
 * so their local date has already rolled over to the 18th while the UTC date is still
 * the 17th; New York sits behind, so it reads the 17th like UTC does but at a different
 * hour. An implementation correct for one sign and wrong for the other cannot pass all
 * three.
 *
 * The oracle is deliberately `Intl.DateTimeFormat`, not `Date.prototype.getHours`. The
 * code under test is built from the `Date` getters, so deriving the expectation from
 * those same getters would restate the implementation instead of checking it.
 */

const ZONE = process.env.TZ ?? 'UTC';

/** The wall clock in the runner's zone, derived independently of the `Date` getters. */
function wallClock(date: Date): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    // Intl always pads the hour; the card pads only under `time_two_digit_hours`,
    // which is off by default. Strip it here so the two spell the same clock.
    time: `${Number(get('hour'))}:${get('minute')}`,
  };
}

/** The same instant read as UTC, i.e. what a zone-blind implementation would print. */
function utcClock(date: Date): { day: string; time: string } {
  const iso = date.toISOString();

  return {
    day: iso.slice(0, 10),
    time: `${Number(iso.slice(11, 13))}:${iso.slice(14, 16)}`,
  };
}

function timedEvent(start: Date, end: Date): Types.CalendarEventData {
  return {
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    summary: 'Rehearsal',
    _entityId: 'calendar.personal',
  };
}

const config = { ...DEFAULT_CONFIG, time_24h: true } as unknown as Types.Config;

describe('event times follow the local zone, not UTC', () => {
  // `formatEventTime` compares the event against today, so an unfrozen clock decides
  // which multi-day wording it reaches and the assertions below would drift by date.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Guard. Without it this file would still pass under UTC while proving nothing,
  // which is the exact failure it was written to close.
  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
  });

  describe('formatTime', () => {
    // 23:30 UTC: behind UTC (New York) this is still the same UTC day, ahead of it
    // (Berlin, Sydney) the local day has already rolled over.
    const instant = new Date('2026-06-17T23:30:00.000Z');

    it('reads a different clock than UTC, so the assertions below are not vacuous', () => {
      expect(wallClock(instant).time).not.toBe(utcClock(instant).time);
    });

    it('prints the local wall clock', () => {
      expect(formatTime(instant, true)).toBe(wallClock(instant).time);
    });

    it('does not print the UTC clock', () => {
      expect(formatTime(instant, true)).not.toBe(utcClock(instant).time);
    });

    it('prints the local wall clock in 12-hour form too', () => {
      const { time } = wallClock(instant);
      const [hour, minute] = time.split(':').map(Number);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const twelve = hour % 12 || 12;

      expect(formatTime(instant, false)).toBe(
        `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`,
      );
    });
  });

  describe('formatEventTime', () => {
    /*
     * Built from local components on purpose. 23:30 to 00:30 *local* crosses local
     * midnight in every zone, while both instants land on one UTC date in all three —
     * so local and UTC disagree about whether this event spans two days, and they
     * disagree in the same direction everywhere. Comparing UTC days would take the
     * single-day branch and print a bare start time instead of naming the end day.
     */
    const localStart = new Date(2026, 5, 17, 23, 30);
    const localEnd = new Date(2026, 5, 18, 0, 30);

    it('straddles local midnight while staying inside one UTC day', () => {
      expect(wallClock(localStart).day).not.toBe(wallClock(localEnd).day);
      expect(utcClock(localStart).day).toBe(utcClock(localEnd).day);
    });

    it('treats an event across local midnight as spanning two days', () => {
      const formatted = formatEventTime(timedEvent(localStart, localEnd), config, 'en');

      // `until` is the multi-day marker and the single-day branch cannot emit it:
      // that branch produces a bare `start - end` and nothing else. Comparing UTC days
      // would take it and print `23:30 - 0:30`.
      expect(formatted).toContain('until');
      expect(formatted).toContain(wallClock(localStart).time);
      expect(formatted).not.toBe(`${wallClock(localStart).time} - ${wallClock(localEnd).time}`);
    });

    it('treats an event inside one local day as a single day', () => {
      const start = new Date(2026, 5, 17, 9, 0);
      const end = new Date(2026, 5, 17, 10, 0);
      const formatted = formatEventTime(timedEvent(start, end), config, 'en');

      expect(formatted).toBe(`${wallClock(start).time} - ${wallClock(end).time}`);
    });

    it('prints an all-day event without a clock in any zone', () => {
      const allDay: Types.CalendarEventData = {
        start: { date: '2026-06-17' },
        end: { date: '2026-06-18' },
        summary: 'Public holiday',
        _entityId: 'calendar.personal',
      };

      expect(formatEventTime(allDay, config, 'en')).toBe('All day');
    });
  });
});

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as EventUtils from '../src/utils/events';
import { getCalendarDayDiff } from '../src/utils/format';

/**
 * Empty-day filling across a DST boundary.
 *
 * Excluded from the main `unit` project and run twice instead — once under
 * `Europe/Berlin`, once under `Australia/Sydney` (see `vitest.config.mjs`). The
 * rest of the suite pins `TZ: 'UTC'`, which has no transitions and is therefore
 * the one zone in which the bug pinned here cannot reproduce.
 *
 * `groupEventsByDay` sized its empty-day window by subtracting two locally built
 * midnights in absolute milliseconds and flooring. Across a spring-forward that
 * difference is an hour short of a whole number of days, so the floor came back
 * one low and the loop stopped a day early: the final day of the window silently
 * lost its "No events" placeholder. Reverting the fix and running the sweep below
 * reproduces it — 192 of its 5,376 cases fail under Berlin and 193 under Sydney.
 * Run that same unfixed code under UTC and all eleven assertions pass; only the
 * guard below fails, which is exactly why it is the first test in the file.
 *
 * Unlike the two week-number bugs this one is not hemisphere-specific. Both
 * hemispheres spring forward; they only disagree about the month. So each zone
 * below needs its own straddling window, and the Berlin cases pass trivially
 * under Sydney and vice versa — that asymmetry is why both zones are listed.
 */
describe('empty-day windows are independent of the local time zone', () => {
  // Sanity: these tests only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2025, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2025, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });

  describe('getCalendarDayDiff', () => {
    /**
     * The property the caller depends on, asserted exhaustively rather than by
     * example: advancing a local date by N days must measure as N days, for
     * every start date and every window length. Mismatches are collected so a
     * failure names the offending dates instead of stopping at the first.
     */
    it('measures a local N-day advance as N days for every date in 2024-2027', () => {
      const mismatches: string[] = [];

      for (let year = 2024; year <= 2027; year++) {
        for (let month = 0; month < 12; month++) {
          for (let day = 1; day <= 28; day++) {
            for (const span of [3, 7, 14, 30]) {
              const start = new Date(year, month, day);
              const end = new Date(year, month, day + span);
              const actual = getCalendarDayDiff(start, end);

              if (actual !== span) {
                mismatches.push(`${year}-${month + 1}-${day} +${span}d measured ${actual}`);
              }
            }
          }
        }
      }

      expect(mismatches).toEqual([]);
    });

    // The two windows that straddle a spring-forward, one per hemisphere.
    it.each([
      { label: 'Berlin spring-forward 2026-03-29', y: 2026, m: 2, d: 27, span: 4 },
      { label: 'Sydney spring-forward 2026-10-04', y: 2026, m: 9, d: 2, span: 4 },
      { label: 'Berlin spring-forward 2027-03-28', y: 2027, m: 2, d: 26, span: 4 },
      { label: 'Sydney spring-forward 2027-10-03', y: 2027, m: 9, d: 1, span: 4 },
    ])('counts $span days across the $label window', ({ y, m, d, span }) => {
      expect(getCalendarDayDiff(new Date(y, m, d), new Date(y, m, d + span))).toBe(span);
    });

    /**
     * The `compact_events_to_show` branch passes an event start time as `end`,
     * not a midnight, and relies on it being truncated to its calendar day. That
     * truncation is the reason the fix reduces both operands rather than simply
     * rounding the millisecond difference.
     */
    it('truncates a time of day on the end date rather than rounding it up', () => {
      const start = new Date(2026, 2, 27);

      expect(getCalendarDayDiff(start, new Date(2026, 2, 31, 9, 30))).toBe(4);
      expect(getCalendarDayDiff(start, new Date(2026, 2, 31, 23, 59))).toBe(4);
      expect(getCalendarDayDiff(start, new Date(2026, 2, 27, 0, 0))).toBe(0);
    });

    it('returns a negative count when the end precedes the start', () => {
      expect(getCalendarDayDiff(new Date(2026, 2, 31), new Date(2026, 2, 27))).toBe(-4);
    });
  });

  describe('groupEventsByDay', () => {
    /**
     * The user-visible symptom. With no events at all, every day in the window
     * must come back as an empty day; the old arithmetic dropped the last one
     * whenever the window spanned a spring-forward.
     */
    it.each([
      { label: 'Berlin spring-forward 2026-03-29', start: '2026-03-27' },
      { label: 'Sydney spring-forward 2026-10-04', start: '2026-10-02' },
      { label: 'Berlin spring-forward 2027-03-28', start: '2027-03-26' },
      { label: 'Sydney spring-forward 2027-10-03', start: '2027-10-01' },
    ])('fills all 5 empty days across the $label window', ({ start }) => {
      const config = buildConfig({
        show_empty_days: true,
        days_to_show: 5,
        start_date: start,
      });

      const days = EventUtils.groupEventsByDay([], config, false, 'en');

      expect(days).toHaveLength(5);
    });
  });
});

/**
 * Which grouped days a card draws when only some of its day columns fit.
 *
 * `visibleDayWindowStart` compares each day against the start of today's **local** day. That
 * is the part a UTC-only run cannot check: under `TZ=UTC` a local midnight and a UTC midnight
 * are the same instant, so comparing against `Date.UTC(...)`, or against an ISO date string,
 * would agree with the correct comparison on every case below. In a zone with an offset they
 * diverge for the hours either side of midnight, which is why the cases sit there.
 *
 * Runs under Berlin, Sydney and New York (`*.dst.test.ts`), so both signs of the offset are
 * covered.
 */

import { describe, expect, it } from 'vitest';

import { visibleDayWindowStart } from '../src/config/view';

/** A grouped day, stamped the way grouping stamps it: a moment inside that local day. */
const day = (month: number, date: number, hour = 12) => ({
  timestamp: new Date(2026, month, date, hour).getTime(),
});

/** Seven consecutive local days, Monday 12 January to Sunday 18 January 2026. */
const WEEK = [12, 13, 14, 15, 16, 17, 18].map((date) => day(0, date));

describe('visibleDayWindowStart', () => {
  it('runs in a zone with daylight saving time', () => {
    // Guard: without an offset that changes over the year, this file proves nothing.
    const january = new Date(2026, 0, 15).getTimezoneOffset();
    const july = new Date(2026, 6, 15).getTimezoneOffset();
    expect(january).not.toBe(july);
  });

  it.each([
    ['today first', new Date(2026, 0, 12, 9), 3, 0],
    ['today in the middle', new Date(2026, 0, 14, 9), 2, 2],
    ['today near the end, window moves back', new Date(2026, 0, 17, 9), 3, 4],
    ['today last', new Date(2026, 0, 18, 9), 2, 5],
    ['range wholly ahead', new Date(2026, 0, 5, 9), 3, 0],
    ['range wholly behind', new Date(2026, 0, 25, 9), 3, 4],
  ])('%s', (_label, now, count, expected) => {
    expect(visibleDayWindowStart(WEEK, count, now)).toBe(expected);
  });

  it('draws every day when they all fit, or when nothing was measured', () => {
    const now = new Date(2026, 0, 15, 9);
    expect(visibleDayWindowStart(WEEK, 7, now)).toBe(0);
    expect(visibleDayWindowStart(WEEK, 9, now)).toBe(0);
    expect(visibleDayWindowStart(WEEK, 0, now)).toBe(0);
  });

  it('counts today until its last moment and tomorrow from its first', () => {
    // A day stamped at its own local midnight, and the instant either side of the next one.
    const midnights = [12, 13, 14, 15, 16, 17, 18].map((date) => day(0, date, 0));
    expect(visibleDayWindowStart(midnights, 2, new Date(2026, 0, 14, 23, 59, 59))).toBe(2);
    expect(visibleDayWindowStart(midnights, 2, new Date(2026, 0, 15, 0, 0, 0))).toBe(3);
    // Today is not skipped once the clock has passed the moment its day was stamped at.
    expect(visibleDayWindowStart(WEEK, 2, new Date(2026, 0, 14, 23, 0))).toBe(2);
  });

  it('works on the sparse days column view groups without empty days', () => {
    const sparse = [day(0, 12), day(0, 13), day(0, 16), day(0, 18)];
    // Thursday 15 has no events: the window starts at the first day on or after it.
    expect(visibleDayWindowStart(sparse, 2, new Date(2026, 0, 15, 9))).toBe(2);
    expect(visibleDayWindowStart(sparse, 3, new Date(2026, 0, 15, 9))).toBe(1);
  });

  it('crosses a DST change by calendar day, not by 24-hour steps', () => {
    // Late March: Berlin and New York spring forward, Sydney is near its autumn change.
    const spring = [27, 28, 29, 30, 31].map((date) => day(2, date, 0));
    expect(visibleDayWindowStart(spring, 2, new Date(2026, 2, 30, 0, 30))).toBe(3);
    expect(visibleDayWindowStart(spring, 2, new Date(2026, 2, 29, 23, 30))).toBe(2);
  });
});

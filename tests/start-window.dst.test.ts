/**
 * `starts_after` and `starts_before` read the browser's clock, the one the card prints an event's
 * time with, not UTC.
 *
 * Run under Berlin, Sydney, New York and the Azores (the `dst-*` projects in
 * `vitest.config.mjs`), never under UTC, where the two clocks are one and either reading passes.
 *
 * - **A plain offset.** In January every one of the four zones is off UTC: Berlin and Sydney
 *   ahead, New York and the Azores behind. An event at local 15:30 and one at 16:30 straddle a
 *   16:00 window, and in each zone one of the two reads the other side of 16:00 in UTC. Reading
 *   `getUTCHours()` and its siblings fails in all four; a control asserts the straddle is real.
 * - **The hour the clock reads twice.** Where the clock falls back, the two instants that read
 *   the same time are judged alike, kept by a window opening at that time and left out by one
 *   closing there. Elapsed-time arithmetic from midnight reads the second an hour later.
 * - **The hour the clock skips.** The first instant after the clocks go forward reads the time
 *   after the gap, 03:00 in Berlin and 01:00 in the Azores, whose day then has no midnight.
 *
 * The expected verdicts come from `Intl.DateTimeFormat` in the zone, not from the `Date` getters
 * the rule itself reads, so the oracle does not restate the implementation.
 */
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { processEvents } from '../src/utils/events';

const CALENDAR = 'calendar.volunteer_shifts';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const HOUR = 3_600_000;

/** The wall-clock time an instant reads in the zone under test, as `HH:MM:SS`. */
const wall = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const wallOf = (instant: number): string => wall.format(instant);

/** The same, in UTC: what a reading of the UTC getters would see. */
const utc = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Whether the card keeps a half-hour event starting at an instant, under one entry's window. */
function keeps(instant: number, entry: Partial<Types.EntityConfig>): boolean {
  const config = buildConfig({
    entities: [{ entity: CALENDAR, ...entry }],
  } as Partial<Types.Config>);
  const event: Types.CalendarEventData = {
    summary: 'Shift',
    start: { dateTime: new Date(instant).toISOString() },
    end: { dateTime: new Date(instant + HOUR / 2).toISOString() },
    _entityId: CALENDAR,
  };
  return processEvents([event], config).length === 1;
}

/**
 * The first instant of 2026 at which the zone's offset moves in a direction, found by an hourly
 * scan and then narrowed to the millisecond.
 *
 * @param falling - `true` for the clocks going back, `false` for them going forward
 * @returns The first instant read with the new offset
 */
function transition(falling: boolean): number {
  const offset = (instant: number) => new Date(instant).getTimezoneOffset();
  const moves = (a: number, b: number) => (falling ? offset(b) > offset(a) : offset(b) < offset(a));
  let at = Date.UTC(2026, 0, 1);
  while (!moves(at, at + HOUR)) at += HOUR;
  let low = at;
  let high = at + HOUR;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (offset(middle) === offset(low)) low = middle;
    else high = middle;
  }
  return high;
}

describe(`start hours on the local clock (${ZONE})`, () => {
  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  describe('in January, off UTC', () => {
    const early = new Date(2026, 0, 14, 15, 30).getTime();
    const late = new Date(2026, 0, 14, 16, 30).getTime();

    it('straddles 16:00 differently on the two clocks, or this proves nothing here', () => {
      expect([wallOf(early), wallOf(late)]).toEqual(['15:30:00', '16:30:00']);
      const onUtc = [early, late].map((instant) => utc.format(instant) >= '16:00:00');
      expect(onUtc).not.toEqual([false, true]);
    });

    it('keeps what starts at or after 16:00 as the zone reads it', () => {
      for (const instant of [early, late]) {
        expect(keeps(instant, { starts_after: '16:00' })).toBe(wallOf(instant) >= '16:00:00');
        expect(keeps(instant, { starts_before: '16:00' })).toBe(wallOf(instant) < '16:00:00');
      }
    });
  });

  describe('where the clock falls back', () => {
    const change = transition(true);
    const first = change - HOUR / 2;
    const second = change + HOUR / 2;
    const reads = wallOf(first).slice(0, 5);

    it('reads one time twice, an hour apart', () => {
      expect(wallOf(second)).toBe(wallOf(first));
      expect(second - first).toBe(HOUR);
    });

    it('judges both instants by the time they read', () => {
      // An hour past the time both read: only a reading of elapsed time since midnight puts the
      // second instant there, and then leaves it out.
      const total = Number(reads.slice(0, 2)) * 60 + Number(reads.slice(3, 5)) + 60;
      const hourLater = `${String(Math.floor(total / 60)).padStart(2, '0')}:${reads.slice(3, 5)}`;
      expect(total).toBeLessThan(1440);

      for (const instant of [first, second]) {
        expect(keeps(instant, { starts_after: reads })).toBe(true);
        expect(keeps(instant, { starts_before: reads })).toBe(false);
        expect(keeps(instant, { starts_before: hourLater })).toBe(true);
      }
    });
  });

  describe('where the clock goes forward', () => {
    const change = transition(false);
    const reads = wallOf(change).slice(0, 5);
    const minuteBefore = change - 60_000;
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

    it('skips an hour: its first instant reads 61 minutes after the minute before it', () => {
      const before = wallOf(minuteBefore).slice(0, 5);
      expect((minutes(reads) - minutes(before) + 1440) % 1440).toBe(61);
    });

    it('judges the first instant after the gap by the time it reads', () => {
      expect(keeps(change, { starts_after: reads })).toBe(true);
      expect(keeps(change, { starts_before: reads })).toBe(false);
      expect(keeps(minuteBefore, { starts_after: reads })).toBe(
        wallOf(minuteBefore) >= `${reads}:00`,
      );
    });
  });
});

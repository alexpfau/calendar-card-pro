import { describe, expect, it } from 'vitest';

import * as GridDraft from '../src/interaction/grid-draft';

/**
 * The new event a drag draws in a grid, on the days the clocks change (`grid-draft.ts`).
 *
 * Runs under every DST project (Berlin, Sydney, New York). A draft's times are wall-clock
 * quarter hours on each day's own date, and the pieces it draws are wall-clock minutes from
 * each day's midnight, as the grid places its blocks. The obvious "simplification", adding
 * minutes to midnight in milliseconds, lands an hour off from the change on. The oracle is
 * `Intl.DateTimeFormat` in the zone under test, not the `Date` getters the code is built from.
 */

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The wall-clock date, hour and minute of an instant, in the zone under test. */
function wallClock(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** The local midnights of 2026 on which the day is not 24 hours long. */
function changeDays(): number[] {
  const days: number[] = [];
  for (
    let d = new Date(2026, 0, 1);
    d.getFullYear() === 2026;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    if (next.getTime() - d.getTime() !== 86_400_000) days.push(d.getTime());
  }
  return days;
}

describe(`a drawn event on the days the clocks change, in ${ZONE}`, () => {
  it('runs in a zone with DST', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 15).getTimezoneOffset(),
    );
    expect(changeDays()).toHaveLength(2);
  });

  it('draws from and to the wall-clock quarters the pointer named', () => {
    for (const midnight of changeDays()) {
      const day = wallClock(new Date(midnight)).slice(0, 10);
      const times = GridDraft.timedDraft(
        { timestamp: midnight, minute: 9 * 60 + 15 },
        { timestamp: midnight, minute: 16 * 60 + 30 },
        true,
      );
      expect(wallClock(times.start)).toBe(`${day} 09:15`);
      expect(wallClock(times.end)).toBe(`${day} 16:45`);
    }
  });

  it("places each day's piece by wall-clock minutes from that day's midnight", () => {
    for (const midnight of changeDays()) {
      const times = GridDraft.timedDraft(
        { timestamp: midnight, minute: 18 * 60 },
        { timestamp: midnight, minute: 20 * 60 + 45 },
        true,
      );
      expect(GridDraft.pieceOnDay(times, midnight)).toEqual({
        fromMin: 18 * 60,
        untilMin: 21 * 60,
      });
    }
  });

  it('runs a draft drawn across a change day through midnight on both sides', () => {
    for (const midnight of changeDays()) {
      const before = new Date(midnight);
      before.setDate(before.getDate() - 1);
      const after = new Date(midnight);
      after.setDate(after.getDate() + 1);
      const times = GridDraft.timedDraft(
        { timestamp: before.getTime(), minute: 22 * 60 },
        { timestamp: after.getTime(), minute: 6 * 60 },
        true,
      );
      expect(GridDraft.pieceOnDay(times, before.getTime())).toEqual({
        fromMin: 22 * 60,
        untilMin: 24 * 60,
      });
      expect(GridDraft.pieceOnDay(times, midnight)).toEqual({ fromMin: 0, untilMin: 24 * 60 });
      expect(GridDraft.pieceOnDay(times, after.getTime())).toEqual({
        fromMin: 0,
        untilMin: 6 * 60 + 15,
      });
    }
  });
});

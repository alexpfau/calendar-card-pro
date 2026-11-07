import { describe, expect, it } from 'vitest';

import * as GridDraft from '../src/interaction/grid-draft';

/**
 * The span a drag draws in a grid (`grid-draft.ts`), without a card: what the draft is before
 * and after the pointer leaves the slot it began in, in both directions and across days, and
 * the piece of it each day draws. The gesture is in `grid-draw-add.test.ts`, and the days the
 * clocks change in `grid-draft.dst.test.ts`.
 */

const DAY = (day: number) => new Date(2026, 5, day).getTime();
const AT = (day: number, hour: number, minute = 0) => new Date(2026, 5, day, hour, minute);
const slot = (day: number, hour: number, minute = 0) => ({
  timestamp: DAY(day),
  minute: hour * 60 + minute,
});

describe('timedDraft', () => {
  const anchor = slot(17, 10, 15);

  it('is what a tap adds until the pointer leaves the first slot: an hour from it', () => {
    expect(GridDraft.timedDraft(anchor, anchor, false)).toEqual({
      allDay: false,
      start: AT(17, 10, 15),
      end: AT(17, 11, 15),
    });
  });

  it('draws the end downward, to the end of the slot under the pointer', () => {
    expect(GridDraft.timedDraft(anchor, slot(17, 12, 30), true)).toEqual({
      allDay: false,
      start: AT(17, 10, 15),
      end: AT(17, 12, 45),
    });
  });

  it('draws the start upward, keeping the first slot', () => {
    expect(GridDraft.timedDraft(anchor, slot(17, 8, 45), true)).toEqual({
      allDay: false,
      start: AT(17, 8, 45),
      end: AT(17, 10, 30),
    });
  });

  it('is the first slot alone once the pointer has come back to it', () => {
    expect(GridDraft.timedDraft(anchor, anchor, true)).toEqual({
      allDay: false,
      start: AT(17, 10, 15),
      end: AT(17, 10, 30),
    });
  });

  it('runs across days in either direction', () => {
    expect(GridDraft.timedDraft(anchor, slot(19, 9), true)).toEqual({
      allDay: false,
      start: AT(17, 10, 15),
      end: AT(19, 9, 15),
    });
    // Back to an earlier day: from the slot under the pointer there, to the first slot's end.
    expect(GridDraft.timedDraft(anchor, slot(16, 22), true)).toEqual({
      allDay: false,
      start: AT(16, 22),
      end: AT(17, 10, 30),
    });
  });

  it('ends at midnight when drawn to the last slot of a day', () => {
    expect(GridDraft.timedDraft(anchor, slot(17, 23, 45), true).end).toEqual(AT(18, 0));
  });
});

describe('allDayDraft', () => {
  it('runs from the earlier day to the later, ending on the last day', () => {
    expect(GridDraft.allDayDraft(DAY(18), DAY(20))).toEqual({
      allDay: true,
      start: new Date(DAY(18)),
      end: new Date(DAY(20)),
    });
    expect(GridDraft.allDayDraft(DAY(18), DAY(16))).toEqual({
      allDay: true,
      start: new Date(DAY(16)),
      end: new Date(DAY(18)),
    });
    expect(GridDraft.allDayDraft(DAY(18), DAY(18)).end).toEqual(new Date(DAY(18)));
  });
});

describe('pieceOnDay', () => {
  const times = { allDay: false, start: AT(17, 21, 30), end: AT(19, 8, 15) };

  it("gives each day the minutes it covers, from that day's midnight", () => {
    expect(GridDraft.pieceOnDay(times, DAY(17))).toEqual({ fromMin: 1290, untilMin: 1440 });
    expect(GridDraft.pieceOnDay(times, DAY(18))).toEqual({ fromMin: 0, untilMin: 1440 });
    expect(GridDraft.pieceOnDay(times, DAY(19))).toEqual({ fromMin: 0, untilMin: 495 });
  });

  it('gives no piece to a day the span does not reach, nor to one it ends at the start of', () => {
    expect(GridDraft.pieceOnDay(times, DAY(16))).toBeUndefined();
    expect(GridDraft.pieceOnDay(times, DAY(20))).toBeUndefined();
    const toMidnight = { allDay: false, start: AT(17, 22), end: AT(18, 0) };
    expect(GridDraft.pieceOnDay(toMidnight, DAY(18))).toBeUndefined();
    expect(GridDraft.pieceOnDay(toMidnight, DAY(17))).toEqual({ fromMin: 1320, untilMin: 1440 });
  });
});

describe('sameSpan', () => {
  const span = (allDay: boolean, start: number, end: number) => ({
    allDay,
    start: new Date(start),
    end: new Date(end),
  });

  it('holds two spans with the same kind and ends the same, and no others', () => {
    expect(GridDraft.sameSpan(span(false, 1, 2), span(false, 1, 2))).toBe(true);
    expect(GridDraft.sameSpan(span(false, 1, 2), span(true, 1, 2))).toBe(false);
    expect(GridDraft.sameSpan(span(false, 1, 2), span(false, 0, 2))).toBe(false);
    expect(GridDraft.sameSpan(span(false, 1, 2), span(false, 1, 3))).toBe(false);
  });
});

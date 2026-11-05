import { describe, expect, it } from 'vitest';

import type { DetailEntry } from '../src/interaction/event-details';
import * as GridMove from '../src/interaction/grid-move';

/**
 * What a drag that moves an event in a grid computes (backlog item 181), without the card: where
 * the pointer puts the event, which events it may move, and what the drop writes. The unit
 * project runs in UTC; `grid-move.dst.test.ts` runs the clock changes.
 */

const JUNE = (day: number, hour: number, minute = 0) => new Date(2026, 5, day, hour, minute);
const timed = (start: Date, end: Date) => ({ allDay: false, start, end });
const entry = (dtstart: string, dtend: string, extra: Partial<DetailEntry> = {}): DetailEntry => ({
  summary: 'Dentist',
  dtstart,
  dtend,
  uid: 'uid-dentist',
  ...extra,
});
const at = (day: number, minute: number) => ({ timestamp: JUNE(day, 12).getTime(), minute });

describe('preciseMinuteAt', () => {
  const rect = { top: 100, height: 900 };

  it('reads the minute linearly, with its fraction', () => {
    expect(GridMove.preciseMinuteAt(rect, 100, 420, 1320)).toBe(420);
    expect(GridMove.preciseMinuteAt(rect, 550.5, 420, 1320)).toBe(870.5);
  });

  it('holds a pointer above or below the area to its edges', () => {
    expect(GridMove.preciseMinuteAt(rect, 0, 420, 1320)).toBe(420);
    expect(GridMove.preciseMinuteAt(rect, 5000, 420, 1320)).toBe(1320);
  });

  it('answers the first minute for an area with no height or no span', () => {
    expect(GridMove.preciseMinuteAt({ top: 0, height: 0 }, 50, 420, 1320)).toBe(420);
    expect(GridMove.preciseMinuteAt(rect, 500, 600, 600)).toBe(600);
  });
});

describe('movableTimes', () => {
  it('takes a timed event on one day, an end at the next midnight included', () => {
    expect(GridMove.movableTimes(entry('2026-06-17T14:00:00Z', '2026-06-17T15:00:00Z'))).toEqual(
      timed(JUNE(17, 14), JUNE(17, 15)),
    );
    expect(
      GridMove.movableTimes(entry('2026-06-17T22:00:00Z', '2026-06-18T00:00:00Z')),
    ).toBeDefined();
    expect(
      GridMove.movableTimes(entry('2026-06-17T14:00:00Z', '2026-06-17T14:00:00Z')),
    ).toBeDefined();
  });

  it.each([
    ['an all-day event', '2026-06-17', '2026-06-18'],
    ['one running into the next day', '2026-06-17T22:00:00Z', '2026-06-18T00:01:00Z'],
    ['one ending before it starts', '2026-06-17T14:00:00Z', '2026-06-17T13:00:00Z'],
    ['one whose start cannot be read', 'soon', '2026-06-17T13:00:00Z'],
  ])('leaves out %s', (_name, dtstart, dtend) => {
    expect(GridMove.movableTimes(entry(dtstart, dtend))).toBeUndefined();
  });
});

describe('movedTimes', () => {
  const dentist = timed(JUNE(17, 14), JUNE(17, 15));

  it('moves by whole quarter hours, to the nearest', () => {
    expect(GridMove.movedTimes(dentist, at(17, 870), at(17, 877))).toEqual(dentist);
    expect(GridMove.movedTimes(dentist, at(17, 870), at(17, 878))).toEqual(
      timed(JUNE(17, 14, 15), JUNE(17, 15, 15)),
    );
    expect(GridMove.movedTimes(dentist, at(17, 870), at(17, 800))).toEqual(
      timed(JUNE(17, 12, 45), JUNE(17, 13, 45)),
    );
  });

  it('moves across days, either way, keeping the time of day', () => {
    expect(GridMove.movedTimes(dentist, at(17, 870), at(19, 870))).toEqual(
      timed(JUNE(19, 14), JUNE(19, 15)),
    );
    expect(GridMove.movedTimes(dentist, at(17, 870), at(16, 990))).toEqual(
      timed(JUNE(16, 16), JUNE(16, 17)),
    );
  });

  it('keeps the minute within its quarter, and the seconds, and the length', () => {
    const odd = timed(new Date(2026, 5, 17, 14, 10, 30, 5), new Date(2026, 5, 17, 14, 55, 30, 5));
    expect(GridMove.movedTimes(odd, at(17, 860), at(17, 830))).toEqual(
      timed(new Date(2026, 5, 17, 13, 40, 30, 5), new Date(2026, 5, 17, 14, 25, 30, 5)),
    );
  });

  it('keeps its start on the day: no earlier than its first quarter, no later than its last', () => {
    const early = timed(JUNE(17, 0, 20), JUNE(17, 1, 20));
    expect(GridMove.movedTimes(early, at(17, 50), at(17, 0))).toEqual(
      timed(JUNE(17, 0, 5), JUNE(17, 1, 5)),
    );
    const late = timed(JUNE(17, 23, 10), JUNE(17, 23, 40));
    expect(GridMove.movedTimes(late, at(17, 1400), at(17, 1440))).toEqual(
      timed(JUNE(17, 23, 55), JUNE(18, 0, 25)),
    );
  });
});

describe('moveWrite', () => {
  it('writes the event as stored at its new times, in UTC', () => {
    const stored = entry('2026-06-17T14:00:00Z', '2026-06-17T15:00:00Z', {
      summary: '  Dentist ',
      location: 'Main Street 1',
      description: '',
    });
    expect(GridMove.moveWrite(stored, timed(JUNE(18, 9), JUNE(18, 10)))).toEqual({
      summary: '  Dentist ',
      dtstart: '2026-06-18T09:00:00Z',
      dtend: '2026-06-18T10:00:00Z',
      location: 'Main Street 1',
      description: '',
    });
  });

  it('leaves out a field the event does not carry, rather than writing it empty', () => {
    const write = GridMove.moveWrite(
      entry('2026-06-17T14:00:00Z', '2026-06-17T15:00:00Z'),
      timed(JUNE(18, 9), JUNE(18, 10)),
    );
    expect(write).not.toHaveProperty('location');
    expect(write).not.toHaveProperty('description');
    expect(write).not.toHaveProperty('rrule');
  });
});

describe('isMoveOrigin', () => {
  const key = {
    entityId: 'calendar.anna',
    uid: 'uid-swim',
    recurrenceId: '20260618T090000Z',
    start: Date.UTC(2026, 5, 18, 9),
  };
  const swim = entry('2026-06-18T09:00:00Z', '2026-06-18T10:00:00Z', {
    uid: 'uid-swim',
    recurrence_id: '20260618T090000Z',
  });

  it('is the same event, at the same times', () => {
    expect(GridMove.isMoveOrigin(key, 'calendar.anna', swim)).toBe(true);
  });

  it.each([
    ['another calendar', 'calendar.ben', swim],
    ['another event', 'calendar.anna', { ...swim, uid: 'uid-other' }],
    ['another occurrence', 'calendar.anna', { ...swim, recurrence_id: '20260625T090000Z' }],
    [
      'the event where a refresh has put it since',
      'calendar.anna',
      { ...swim, dtstart: '2026-06-18T11:00:00Z' },
    ],
    ['no event', 'calendar.anna', undefined],
  ])('is not %s', (_name, entityId, candidate) => {
    expect(GridMove.isMoveOrigin(key, entityId, candidate)).toBe(false);
  });
});

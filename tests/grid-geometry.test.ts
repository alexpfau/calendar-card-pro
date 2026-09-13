import { describe, expect, it } from 'vitest';

import * as Types from '../src/config/types';
import {
  DEFAULT_BAND_END,
  DEFAULT_BAND_START,
  MINUTES_PER_DAY,
  addDays,
  axisLabelMinutes,
  bandEndHasRule,
  computeBannerPlacement,
  computeEventPlacement,
  computeNowLinePct,
  layoutLanes,
  parseTimeOfDay,
  resolveBand,
  segmentMinutes,
  splitTimedEventByDay,
} from '../src/utils/grid';

/**
 * Time-grid geometry, in the parts that do not depend on the local zone.
 *
 * Anything reading a clock or a calendar day lives in `grid-geometry.dst.test.ts`
 * instead, which runs under three real zones. This file runs under `TZ=UTC` with the
 * rest of the `unit` project, so it can assert exact numbers, but it is structurally
 * incapable of seeing a DST bug — that is the other file's job, and the split is why
 * neither file is redundant.
 */

const band = (startTime: string, endTime: string) => resolveBand(startTime, endTime);

it('bounds lane search by the visible cap rather than the number of hidden overlaps', () => {
  const count = 2000;
  let startReads = 0;
  const events = Array.from({ length: count }, (_, index) => ({
    get startMin() {
      startReads++;
      return 540;
    },
    endMin: 600,
    summary: `Meeting ${index}`,
  }));
  const result = layoutLanes(events, 3);

  expect(result.placed).toHaveLength(3);
  expect(result.overflows).toHaveLength(1);
  expect(result.overflows[0].hidden).toHaveLength(count - 3);
  // Count input reads, not milliseconds: the old search reread the start once for
  // every hidden lane, making even a three-lane cap quadratic on a crowded day.
  expect(startReads, `start-time reads for ${count} overlapping events`).toBeLessThan(count * 20);
});

const visibleDayRange = (start: Date, count: number): Date[] =>
  Array.from({ length: count }, (_, index) => addDays(start, index));

/** A timed event, expressed in whole local hours on a fixed non-transition day. */
function timedEvent(
  startHour: number,
  endHour: number,
  summary = 'Event',
): Types.CalendarEventData {
  return {
    start: { dateTime: new Date(2026, 4, 12, startHour, 0).toISOString() },
    end: { dateTime: new Date(2026, 4, 12, endHour, 0).toISOString() },
    summary,
  };
}

describe('parseTimeOfDay', () => {
  it.each([
    ['00:00', 0],
    ['07:00', 420],
    ['06:30', 390],
    ['23:59', 1439],
    ['24:00', MINUTES_PER_DAY],
  ])('parses %s as %d minutes', (value, expected) => {
    expect(parseTimeOfDay(value)).toBe(expected);
  });

  it.each([
    ['24:01', 'past the end of the day'],
    ['24:30', 'a 25th hour by another name'],
    ['25:00', 'not a clock hour'],
    ['99:99', 'both fields out of range'],
    ['7:00', 'unpadded'],
    ['07:60', 'not a clock minute'],
    ['7am', 'not the format'],
    ['', 'empty'],
    [' 07:00', 'leading space'],
    ['07:00 ', 'trailing space'],
    ['0700', 'no separator'],
  ])('rejects %o (%s)', (value) => {
    expect(parseTimeOfDay(value)).toBeNull();
  });

  it('rejects a non-string without throwing', () => {
    expect(parseTimeOfDay(undefined as unknown as string)).toBeNull();
    expect(parseTimeOfDay(700 as unknown as string)).toBeNull();
  });
});

describe('resolveBand', () => {
  it('keeps two well-formed bounds', () => {
    expect(band('08:00', '20:00')).toEqual({
      startMin: 480,
      endMin: 1200,
      usedFallback: false,
    });
  });

  it('accepts 24:00 as the end of the day', () => {
    expect(band('00:00', '24:00')).toEqual({
      startMin: 0,
      endMin: MINUTES_PER_DAY,
      usedFallback: false,
    });
  });

  // Half-honouring the config is the failure mode this guards: an unparseable start
  // paired with a configured 23:00 end would silently widen the band rather than
  // fall back to something the user can recognise.
  it.each([
    ['bad start', 'nonsense', '23:00'],
    ['bad end', '06:00', 'nonsense'],
    ['start after end', '22:00', '07:00'],
    ['start equal to end', '09:00', '09:00'],
  ])('resets both bounds on %s', (_case, start, end) => {
    const resolved = band(start, end);

    expect(resolved.usedFallback).toBe(true);
    expect(resolved.startMin).toBe(parseTimeOfDay(DEFAULT_BAND_START));
    expect(resolved.endMin).toBe(parseTimeOfDay(DEFAULT_BAND_END));
  });
});

describe('axisLabelMinutes', () => {
  it('labels every whole hour in the band at the shipped cadence, the closing one included', () => {
    expect(axisLabelMinutes(band('07:00', '11:00'), 60)).toEqual([420, 480, 540, 600, 660]);
  });

  // The end boundary is treated exactly as an interior one: a boundary on the cadence
  // earns a label, anything else earns none. `21:30` therefore stops at 21 at the hourly
  // cadence, and is itself labelled at the half-hourly one.
  it('omits a closing boundary that is off the cadence', () => {
    const minutes = axisLabelMinutes(band('07:00', '11:30'), 60);

    expect(minutes).toEqual([420, 480, 540, 600, 660]);
    expect(minutes.at(-1)).toBe(660);
  });

  it('labels a closing half hour once the cadence reaches it', () => {
    expect(axisLabelMinutes(band('07:00', '11:30'), 30).at(-1)).toBe(690);
  });

  // Hour 24 is 1440, which every offered cadence divides, so a band ending at midnight is
  // always labelled; `formatAxisLabel` is the one place that has to know it spells as
  // midnight rather than as an hour 24.
  it('emits the closing minute for a band ending at midnight, at every cadence', () => {
    for (const cadence of [30, 60, 120, 180]) {
      expect(axisLabelMinutes(band('21:00', '24:00'), cadence).at(-1), `cadence ${cadence}`).toBe(
        1440,
      );
    }
  });

  it('starts at the first whole hour inside a half-past band at the hourly cadence', () => {
    expect(axisLabelMinutes(band('06:30', '09:00'), 60)).toEqual([420, 480, 540]);
  });

  it('drops both ends of a band that starts and ends off the cadence', () => {
    expect(axisLabelMinutes(band('06:30', '09:30'), 60)).toEqual([420, 480, 540]);
  });

  // 🚨 The case that decided the phase. Anchoring on the band's own start would emit
  // 06:30, 07:30, 08:30 here — half-hour labels in a gutter that reads 7, 8, 9 today, at
  // the cadence every existing card is on. Midnight phasing is what keeps the default the
  // default, and it is why this is a `% cadence` predicate rather than an offset one.
  it('phases labels on midnight rather than on the band start', () => {
    expect(axisLabelMinutes(band('06:30', '09:00'), 60)).not.toContain(390);
    expect(axisLabelMinutes(band('07:00', '22:00'), 120)).toEqual([
      480, 600, 720, 840, 960, 1080, 1200, 1320,
    ]);
  });

  // The counter-case, and the reason the maintainer's lean does not survive testing: a
  // band phased on its own 07:00 start runs 7, 9 … 21 at the two-hourly cadence and
  // leaves the shipped 22:00 end bare, so it buys the first boundary by selling the last —
  // the very boundary the end-boundary sweep exists to serve.
  it('labels the shipped band end at the two-hourly cadence, which band phasing would not', () => {
    expect(axisLabelMinutes(band('07:00', '22:00'), 120).at(-1)).toBe(1320);
  });

  it('thins to the coarsest cadence without dropping the boundaries that fall on it', () => {
    expect(axisLabelMinutes(band('07:00', '22:00'), 180)).toEqual([540, 720, 900, 1080, 1260]);
  });

  // A cadence that never reached normalization — a hand-written YAML `0`, say — must not
  // spin here. The renderer resolves through `normalizeTimeGridValue`, so this is a guard
  // rather than a live path.
  it('falls back to hourly on a cadence that cannot step', () => {
    expect(axisLabelMinutes(band('07:00', '10:00'), 0)).toEqual([420, 480, 540, 600]);
  });
});

describe('bandEndHasRule', () => {
  // The three cases the maintainer specified, plus the midnight bound.
  it.each([
    ['21:00', 60, true],
    ['21:30', 60, false],
    ['21:30', 30, true],
    ['24:00', 60, true],
  ] as const)(
    '%s at %i-minute slots draws a closing rule: %s',
    (endTime, slotMinutes, expected) => {
      expect(bandEndHasRule(band('07:00', endTime), slotMinutes)).toBe(expected);
    },
  );

  // The slot gradient is painted transparent at 60, so only the hour family can close a
  // band there — the reason the predicate asks two questions rather than one.
  it('does not credit the slot gradient with a rule it paints in transparent', () => {
    expect(bandEndHasRule(band('07:00', '21:20'), 20)).toBe(true);
    expect(bandEndHasRule(band('07:00', '21:20'), 60)).toBe(false);
  });

  // The gradients tile from midnight, not from the band's start, so the predicate is a
  // modulo on the end alone. A band starting off the hour cannot shift the cadence.
  it('reads the cadence from midnight rather than from the band start', () => {
    expect(bandEndHasRule(band('06:30', '21:00'), 60)).toBe(true);
    expect(bandEndHasRule(band('06:30', '21:30'), 60)).toBe(false);
  });
});

describe('computeEventPlacement', () => {
  const day = band('06:00', '18:00'); // 720 minutes

  it('places an event proportionally to its start and duration', () => {
    // 09:00-12:00 in a 06:00-18:00 band: a quarter down, a quarter tall.
    expect(computeEventPlacement(540, 720, day)).toEqual({
      topPct: 25,
      heightPct: 25,
      clippedTop: false,
      clippedBottom: false,
    });
  });

  // Issue #206 is exactly this: a two-hour event must be twice the height of a one-hour
  // event. It is the defining property of the view, so it is pinned directly.
  it('makes a two-hour event twice the height of a one-hour event', () => {
    const oneHour = computeEventPlacement(540, 600, day) as { heightPct: number };
    const twoHours = computeEventPlacement(540, 660, day) as { heightPct: number };

    expect(twoHours.heightPct).toBeCloseTo(oneHour.heightPct * 2, 10);
  });

  it('clips an event that starts before the band', () => {
    const placement = computeEventPlacement(300, 420, day);

    expect(placement).toMatchObject({ topPct: 0, clippedTop: true, clippedBottom: false });
    expect(placement?.heightPct).toBeCloseTo((60 / 720) * 100, 10);
  });

  it('clips an event that runs past the band', () => {
    const placement = computeEventPlacement(1020, 1200, day);

    expect(placement).toMatchObject({ clippedTop: false, clippedBottom: true });
    expect(
      (placement as { topPct: number }).topPct + (placement as { heightPct: number }).heightPct,
    ).toBeCloseTo(100, 10);
  });

  it('clips at both ends for an event that swallows the band', () => {
    expect(computeEventPlacement(0, MINUTES_PER_DAY, day)).toEqual({
      topPct: 0,
      heightPct: 100,
      clippedTop: true,
      clippedBottom: true,
    });
  });

  it.each([
    ['entirely before', 240, 300],
    ['entirely after', 1140, 1200],
    ['ending exactly at the band start', 300, 360],
    ['starting exactly at the band end', 1080, 1140],
  ])('returns null for an event %s the band', (_case, startMin, endMin) => {
    expect(computeEventPlacement(startMin, endMin, day)).toBeNull();
  });

  it.each([
    ['zero length', 540, 540],
    ['inverted', 600, 540],
    ['non-finite start', Number.NaN, 600],
    ['infinite end', 540, Number.POSITIVE_INFINITY],
  ])('returns null for a %s interval', (_case, startMin, endMin) => {
    expect(computeEventPlacement(startMin, endMin, day)).toBeNull();
  });

  // A percentage scale is only self-consistent if it never leaves the box, whatever
  // the band. This is what lets a fixed content height compress the grid with no re-math.
  it('never places a block outside 0-100% for any in-band interval', () => {
    let checked = 0;

    for (const [start, end] of [
      ['00:00', '24:00'],
      ['06:00', '18:00'],
      ['06:30', '07:00'],
    ] as const) {
      const b = band(start, end);

      for (let startMin = b.startMin; startMin < b.endMin; startMin += 7) {
        const placement = computeEventPlacement(startMin, startMin + 5, b);

        expect(placement, `five-minute event at ${startMin} in ${start}-${end}`).not.toBeNull();
        if (placement === null) throw new Error('placement assertion did not narrow');

        expect(placement.topPct).toBeGreaterThanOrEqual(0);
        expect(placement.heightPct).toBeGreaterThan(0);
        expect(placement.topPct + placement.heightPct).toBeLessThanOrEqual(100.0000001);
        checked += 1;
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});

describe('computeNowLinePct', () => {
  const day = band('06:00', '18:00');

  it('places the line proportionally within the band', () => {
    expect(computeNowLinePct(new Date(2026, 4, 12, 12, 0), day)).toBeCloseTo(50, 10);
  });

  // Clamping instead of hiding would pin the line to an edge, which is a false
  // statement about how far through the day it is.
  it.each([
    ['before the band', 5],
    ['after the band', 19],
    ['exactly at the band end', 18],
  ])('returns null when now is %s', (_case, hour) => {
    expect(computeNowLinePct(new Date(2026, 4, 12, hour, 0), day)).toBeNull();
  });

  it('returns 0 at exactly the band start', () => {
    expect(computeNowLinePct(new Date(2026, 4, 12, 6, 0), day)).toBe(0);
  });
});

describe('layoutLanes', () => {
  const at = (startMin: number, endMin: number, id: string) => ({ startMin, endMin, id });

  it('gives non-overlapping events a single lane each', () => {
    const { placed, overflows } = layoutLanes(
      [at(0, 60, 'a'), at(60, 120, 'b'), at(120, 180, 'c')],
      3,
    );

    expect(overflows).toEqual([]);
    expect(placed.map((event) => [event.id, event.laneIndex, event.laneCount])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
      ['c', 0, 1],
    ]);
  });

  // Half-open intervals: touching at one instant is not an overlap. Without this a
  // back-to-back schedule renders every event at half width.
  it('treats an event ending when another starts as non-overlapping', () => {
    const { placed } = layoutLanes([at(0, 60, 'a'), at(60, 120, 'b')], 3);

    expect(placed.every((event) => event.laneCount === 1)).toBe(true);
  });

  it('reuses a lane for abutting events inside a wider cluster', () => {
    const { placed } = layoutLanes([at(0, 90, 'a'), at(60, 120, 'b'), at(90, 150, 'c')], 5);

    expect(placed.every((event) => event.laneCount === 2)).toBe(true);
    expect(placed.map((event) => event.laneIndex)).toEqual([0, 1, 0]);
  });

  it('puts two genuinely overlapping events side by side', () => {
    const { placed } = layoutLanes([at(0, 90, 'a'), at(60, 120, 'b')], 3);

    expect(placed.map((event) => [event.id, event.laneIndex, event.laneCount])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ]);
  });

  // laneCount is the lanes the cluster *needed*, not its size. Three chained events
  // where only two are ever simultaneous must be half width, not a third.
  it('uses the cluster width, not the cluster size', () => {
    const { placed } = layoutLanes([at(0, 90, 'a'), at(60, 150, 'b'), at(120, 210, 'c')], 5);

    expect(placed.every((event) => event.laneCount === 2)).toBe(true);
    expect(placed.map((event) => event.laneIndex)).toEqual([0, 1, 0]);
  });

  it('keeps separate clusters independent', () => {
    const { placed } = layoutLanes([at(0, 90, 'a'), at(60, 120, 'b'), at(300, 360, 'c')], 3);

    expect(placed.find((event) => event.id === 'c')?.laneCount).toBe(1);
  });

  it('sorts unsorted input rather than trusting the caller', () => {
    const { placed } = layoutLanes([at(120, 180, 'c'), at(0, 60, 'a'), at(60, 120, 'b')], 3);

    expect(placed.map((event) => event.id)).toEqual(['a', 'b', 'c']);
  });

  describe('the overlap cap', () => {
    const five = [
      at(0, 300, 'a'),
      at(10, 300, 'b'),
      at(20, 300, 'c'),
      at(30, 300, 'd'),
      at(40, 300, 'e'),
    ];

    it('does not fire when the cluster fits', () => {
      expect(layoutLanes(five, 5).overflows).toEqual([]);
      expect(layoutLanes(five, 5).placed).toHaveLength(5);
    });

    it('collapses lanes beyond the cap into one overflow block', () => {
      const { placed, overflows } = layoutLanes(five, 3);

      expect(placed.map((event) => event.id)).toEqual(['a', 'b', 'c']);
      expect(placed.every((event) => event.laneCount === 4)).toBe(true);
      expect(overflows).toHaveLength(1);
      expect(overflows[0]).toMatchObject({ laneIndex: 3, laneCount: 4 });
      expect(overflows[0].hidden.map((event) => event.id)).toEqual(['d', 'e']);
    });

    it('spans the overflow block across the combined range of what it hides', () => {
      const { overflows } = layoutLanes(
        [at(0, 300, 'a'), at(10, 100, 'b'), at(20, 280, 'c'), at(30, 400, 'd')],
        2,
      );

      expect(overflows[0]).toMatchObject({ startMin: 20, endMin: 400 });
    });

    it('keeps whole assigned lanes rather than splitting a cluster by position', () => {
      const { placed, overflows } = layoutLanes(
        [at(0, 100, 'a'), at(10, 200, 'b'), at(20, 120, 'd'), at(110, 210, 'c')],
        2,
      );

      expect(placed.map((event) => event.id)).toEqual(['a', 'b', 'c']);
      expect(placed.map((event) => event.laneIndex)).toEqual([0, 1, 0]);
      expect(overflows[0].hidden.map((event) => event.id)).toEqual(['d']);
    });

    it('keeps one visible lane at a cap of 1 and counts the rest', () => {
      const { placed, overflows } = layoutLanes(five, 1);

      expect(placed.map((event) => event.id)).toEqual(['a']);
      expect(overflows).toHaveLength(1);
      expect(overflows[0]).toMatchObject({ laneIndex: 1, laneCount: 2 });
      expect(overflows[0].hidden.map((event) => event.id)).toEqual(['b', 'c', 'd', 'e']);
    });

    it('accounts for every input event exactly once', () => {
      for (const cap of [1, 2, 3, 4, 5, 99]) {
        const { placed, overflows } = layoutLanes(five, cap);
        const seen = [
          ...placed.map((event) => event.id),
          ...overflows.flatMap((overflow) => overflow.hidden.map((event) => event.id)),
        ].sort();

        expect(seen, `cap ${cap}`).toEqual(['a', 'b', 'c', 'd', 'e']);
      }
    });

    it.each([0, -3, Number.NaN])('treats a cap of %o as 1', (cap) => {
      const { placed, overflows } = layoutLanes(five, cap);

      expect(placed.map((event) => event.id)).toEqual(['a']);
      expect(overflows[0].hidden).toHaveLength(4);
    });
  });

  it('does not mutate its input', () => {
    const input = [at(120, 180, 'c'), at(0, 60, 'a')];
    const snapshot = JSON.parse(JSON.stringify(input));

    layoutLanes(input, 3);

    expect(input).toEqual(snapshot);
  });

  it('returns nothing for no events', () => {
    expect(layoutLanes([], 3)).toEqual({ placed: [], overflows: [] });
  });
});

describe('splitTimedEventByDay', () => {
  const windowStart = new Date(2026, 4, 11);
  const windowEnd = new Date(2026, 4, 18);

  it('leaves a same-day event as one segment', () => {
    const segments = splitTimedEventByDay(timedEvent(9, 17), windowStart, windowEnd);

    expect(segments).toHaveLength(1);
    expect(segments[0]._isMultiDaySegment).toBeFalsy();
  });

  // The whole reason this function exists rather than reusing events.ts: that splitter
  // rewrites middle days as `start: { date }`, which would send the middle day of a
  // three-day conference into the all-day band instead of drawing it as a block.
  it('keeps every segment of a multi-day event timed', () => {
    const event: Types.CalendarEventData = {
      start: { dateTime: new Date(2026, 4, 12, 14, 0).toISOString() },
      end: { dateTime: new Date(2026, 4, 14, 11, 0).toISOString() },
      summary: 'Conference',
    };

    const segments = splitTimedEventByDay(event, windowStart, windowEnd);

    expect(segments).toHaveLength(3);
    expect(segments.every((segment) => segment.start.dateTime !== undefined)).toBe(true);
    expect(segments.every((segment) => segment.end.dateTime !== undefined)).toBe(true);
    expect(segments.some((segment) => segment.start.date !== undefined)).toBe(false);
  });

  it('reports the middle day as running the whole day', () => {
    const event: Types.CalendarEventData = {
      start: { dateTime: new Date(2026, 4, 12, 14, 0).toISOString() },
      end: { dateTime: new Date(2026, 4, 14, 11, 0).toISOString() },
    };

    const middle = splitTimedEventByDay(event, windowStart, windowEnd)[1];

    expect(segmentMinutes(middle)).toEqual({ startMin: 0, endMin: MINUTES_PER_DAY });
  });

  // A 22:00-00:00 event touches two calendar days but occupies none of the second.
  it('drops the empty segment for an event ending exactly at midnight', () => {
    const event: Types.CalendarEventData = {
      start: { dateTime: new Date(2026, 4, 12, 22, 0).toISOString() },
      end: { dateTime: new Date(2026, 4, 13, 0, 0).toISOString() },
    };

    const segments = splitTimedEventByDay(event, windowStart, windowEnd);

    expect(segments).toHaveLength(1);
    expect(segmentMinutes(segments[0])).toEqual({ startMin: 1320, endMin: MINUTES_PER_DAY });
  });

  it('carries the event payload onto every segment', () => {
    const event: Types.CalendarEventData = {
      start: { dateTime: new Date(2026, 4, 12, 14, 0).toISOString() },
      end: { dateTime: new Date(2026, 4, 14, 11, 0).toISOString() },
      summary: 'Conference',
      location: 'Berlin',
      _entityId: 'calendar.work',
    };

    for (const segment of splitTimedEventByDay(event, windowStart, windowEnd)) {
      expect(segment).toMatchObject({
        summary: 'Conference',
        location: 'Berlin',
        _entityId: 'calendar.work',
      });
    }
  });

  it('clips an event that starts before the window', () => {
    const event: Types.CalendarEventData = {
      start: { dateTime: new Date(2026, 4, 9, 9, 0).toISOString() },
      end: { dateTime: new Date(2026, 4, 12, 9, 0).toISOString() },
    };

    const segments = splitTimedEventByDay(event, windowStart, windowEnd);

    expect(segments).toHaveLength(2);
    expect(new Date(segments[0].start.dateTime as string).getTime()).toBe(windowStart.getTime());
  });

  it('clips an event that runs past the window', () => {
    const event: Types.CalendarEventData = {
      start: { dateTime: new Date(2026, 4, 16, 9, 0).toISOString() },
      end: { dateTime: new Date(2026, 4, 25, 9, 0).toISOString() },
    };

    const segments = splitTimedEventByDay(event, windowStart, windowEnd);

    expect(segments).toHaveLength(2);
  });

  it('returns an all-day event untouched', () => {
    const event: Types.CalendarEventData = {
      start: { date: '2026-05-12' },
      end: { date: '2026-05-13' },
    };

    expect(splitTimedEventByDay(event, windowStart, windowEnd)).toEqual([event]);
  });

  it.each([
    ['inverted', new Date(2026, 4, 12, 17, 0), new Date(2026, 4, 12, 9, 0)],
    ['zero length', new Date(2026, 4, 12, 9, 0), new Date(2026, 4, 12, 9, 0)],
  ])('returns nothing for a %s event', (_case, start, end) => {
    const event: Types.CalendarEventData = {
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };

    expect(splitTimedEventByDay(event, windowStart, windowEnd)).toEqual([]);
  });
});

describe('segmentMinutes', () => {
  it('uses ordinary UTC geometry for instants spanning a fold in a different zone', () => {
    const segment: Types.CalendarEventData = {
      start: { dateTime: '2026-11-01T01:45:00-04:00' },
      end: { dateTime: '2026-11-01T01:15:00-05:00' },
    };
    expect(new Date(segment.start.dateTime!).getTimezoneOffset()).toBe(0);
    expect(segmentMinutes(segment)).toEqual({ startMin: 345, endMin: 375 });
  });

  it('reads the wall clock of a same-day segment', () => {
    expect(segmentMinutes(timedEvent(9, 17))).toEqual({ startMin: 540, endMin: 1020 });
  });

  // Midnight reads as 0 on the following day, which would invert the interval and
  // collapse the block instead of drawing it to the bottom of the band.
  it('reports a segment ending at midnight as ending at 1440', () => {
    const segment: Types.CalendarEventData = {
      start: { dateTime: new Date(2026, 4, 12, 22, 0).toISOString() },
      end: { dateTime: new Date(2026, 4, 13, 0, 0).toISOString() },
    };

    expect(segmentMinutes(segment)).toEqual({ startMin: 1320, endMin: MINUTES_PER_DAY });
  });

  it('returns null for an all-day event', () => {
    expect(
      segmentMinutes({ start: { date: '2026-05-12' }, end: { date: '2026-05-13' } }),
    ).toBeNull();
  });

  it('returns null for an unparseable date', () => {
    expect(
      segmentMinutes({ start: { dateTime: 'not a date' }, end: { dateTime: 'nor this' } }),
    ).toBeNull();
  });
});

describe('computeBannerPlacement', () => {
  const windowStart = new Date(2026, 4, 11); // Monday
  const allDay = (start: string, end: string): Types.CalendarEventData => ({
    start: { date: start },
    end: { date: end },
  });

  // iCal end dates are exclusive, so a one-day event ends on the following date.
  it('places a single-day event in one column', () => {
    expect(
      computeBannerPlacement(allDay('2026-05-13', '2026-05-14'), visibleDayRange(windowStart, 7)),
    ).toEqual({
      columnIndex: 2,
      span: 1,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  // One banner spanning its days is what makes a multi-day event read as one thing;
  // a chip per day never visually joins.
  it('spans a multi-day event across its columns', () => {
    expect(
      computeBannerPlacement(allDay('2026-05-12', '2026-05-15'), visibleDayRange(windowStart, 7)),
    ).toEqual({
      columnIndex: 1,
      span: 3,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it('clamps and marks an event that began before the window', () => {
    expect(
      computeBannerPlacement(allDay('2026-05-08', '2026-05-13'), visibleDayRange(windowStart, 7)),
    ).toEqual({
      columnIndex: 0,
      span: 2,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it('clamps and marks an event that runs past the window', () => {
    expect(
      computeBannerPlacement(allDay('2026-05-16', '2026-05-25'), visibleDayRange(windowStart, 7)),
    ).toEqual({
      columnIndex: 5,
      span: 2,
      continuesBefore: false,
      continuesAfter: true,
    });
  });

  it('marks both ends for an event that swallows the window', () => {
    expect(
      computeBannerPlacement(allDay('2026-05-01', '2026-05-30'), visibleDayRange(windowStart, 7)),
    ).toEqual({
      columnIndex: 0,
      span: 7,
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it.each([
    ['entirely before', '2026-05-01', '2026-05-05'],
    ['entirely after', '2026-05-20', '2026-05-25'],
    ['ending the day the window opens', '2026-05-05', '2026-05-11'],
  ])('returns null for an event %s the window', (_case, start, end) => {
    expect(computeBannerPlacement(allDay(start, end), visibleDayRange(windowStart, 7))).toBeNull();
  });

  // Malformed iCal where start equals end covers no days; a span of 0 is not valid CSS.
  it('returns null rather than a zero span for a degenerate event', () => {
    expect(
      computeBannerPlacement(allDay('2026-05-13', '2026-05-13'), visibleDayRange(windowStart, 7)),
    ).toBeNull();
  });

  it('treats a missing end date as a single day', () => {
    expect(
      computeBannerPlacement(
        { start: { date: '2026-05-13' }, end: {} },
        visibleDayRange(windowStart, 7),
      ),
    ).toMatchObject({ columnIndex: 2, span: 1 });
  });

  it('returns null for a timed event', () => {
    expect(computeBannerPlacement(timedEvent(9, 17), visibleDayRange(windowStart, 7))).toBeNull();
  });

  it('returns null when there are no columns to place into', () => {
    expect(computeBannerPlacement(allDay('2026-05-13', '2026-05-14'), [])).toBeNull();
  });

  it('never produces a span that runs off the end of the window', () => {
    for (let visibleDays = 1; visibleDays <= 7; visibleDays++) {
      const placement = computeBannerPlacement(
        allDay('2026-05-01', '2026-05-30'),
        visibleDayRange(windowStart, visibleDays),
      );

      expect(placement?.columnIndex ?? 0).toBeGreaterThanOrEqual(0);
      expect((placement?.columnIndex ?? 0) + (placement?.span ?? 0)).toBeLessThanOrEqual(
        visibleDays,
      );
    }
  });
});

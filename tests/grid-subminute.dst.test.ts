import { render } from 'lit';
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import { groupEventsByDay } from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';
import * as Grid from '../src/utils/grid';

function event(month: number, startMs: number, endMs: number): Types.CalendarEventData {
  return {
    summary: 'Short appointment',
    start: { dateTime: new Date(2026, month, 10, 9, 0, 0, startMs).toISOString() },
    end: { dateTime: new Date(2026, month, 10, 9, 0, 0, endMs).toISOString() },
    _entityId: 'calendar.personal',
  };
}

function wallMinutes(date: Date): number {
  const options: Intl.DateTimeFormatOptions & { fractionalSecondDigits: 3 } = {
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  const part = (type: string): number => {
    const found = parts.find((entry) => entry.type === type);
    expect(found, type).toBeDefined();
    return Number(found!.value);
  };
  return (
    part('hour') * 60 + part('minute') + part('second') / 60 + part('fractionalSecond') / 60000
  );
}

it('runs in a timezone with different January and July offsets', () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
    new Date(2026, 6, 1).getTimezoneOffset(),
  );
});

describe.each([0, 6])('fractional wall-clock placement in month %i', (month) => {
  it.each([
    { startMs: 10000, endMs: 30000 },
    { startMs: 50000, endMs: 70000 },
    { startMs: 123, endMs: 456 },
    { startMs: 0, endMs: 60000 },
  ])('renders positive duration $startMs -> $endMs ms without rounding away the block', (row) => {
    const source = event(month, row.startMs, row.endMs);
    const original = structuredClone(source);
    const start = new Date(source.start.dateTime!);
    const end = new Date(source.end.dateTime!);
    const extent = Grid.segmentMinutes(source)!;
    expect(extent.startMin).toBeCloseTo(wallMinutes(start), 10);
    expect(extent.endMin).toBeCloseTo(wallMinutes(end), 10);
    const placement = Grid.computeEventPlacement(
      extent.startMin,
      extent.endMin,
      Grid.resolveBand('08:00', '12:00'),
    );
    expect(placement).not.toBeNull();
    expect(placement!.heightPct).toBeCloseTo(((row.endMs - row.startMs) / 60000 / 240) * 100, 10);

    const config = buildConfig({
      view: 'grid',
      days_to_show: 1,
      start_date: getLocalDateKey(start),
      time_grid: { start_time: '08:00', end_time: '12:00' },
    });
    const days = groupEventsByDay([source], config, false, 'en', 'grid');
    expect(days.flatMap((day) => day.events)).toHaveLength(1);
    const container = document.createElement('div');
    render(renderGridGroupedEvents(days, resolveEffectiveConfig(config, 'grid'), 'en'), container);
    expect(container.querySelectorAll('.grid-event:not(.grid-event-overflow)')).toHaveLength(1);
    expect(source).toEqual(original);
  });

  it.each([
    { startMs: -500, endMs: 500, top: true, bottom: false },
    { startMs: 3599500, endMs: 3600500, top: false, bottom: true },
  ])('keeps the fractional intersection at a band boundary: $startMs', (row) => {
    const extent = Grid.segmentMinutes(event(month, row.startMs, row.endMs))!;
    const placement = Grid.computeEventPlacement(
      extent.startMin,
      extent.endMin,
      Grid.resolveBand('09:00', '10:00'),
    );
    expect(placement).not.toBeNull();
    expect(placement!.heightPct).toBeCloseTo((0.5 / 3600) * 100, 10);
    expect(placement!.clippedTop).toBe(row.top);
    expect(placement!.clippedBottom).toBe(row.bottom);
  });

  it('preserves half-open clipping and rejects zero or reversed instants', () => {
    const band = Grid.resolveBand('09:00', '10:00');
    for (const [startMs, endMs] of [
      [-1000, 0],
      [3600000, 3601000],
    ]) {
      const extent = Grid.segmentMinutes(event(month, startMs, endMs))!;
      expect(Grid.computeEventPlacement(extent.startMin, extent.endMin, band)).toBeNull();
    }
    expect(Grid.segmentMinutes(event(month, 123, 123))).toBeNull();
    expect(Grid.segmentMinutes(event(month, 456, 123))).toBeNull();
  });

  it('assigns lanes using fractional rather than rounded endpoints', () => {
    const source = [
      [10000, 30000],
      [20000, 40000],
      [40000, 50000],
    ];
    const extents = source.map(([start, end], id) => ({
      ...Grid.segmentMinutes(event(month, start, end))!,
      id,
    }));
    const lanes = Grid.layoutLanes(extents, 2);
    expect(lanes.placed.map(({ id, laneIndex, laneCount }) => [id, laneIndex, laneCount])).toEqual([
      [0, 0, 2],
      [1, 1, 2],
      [2, 0, 1],
    ]);
    const capped = Grid.layoutLanes(extents, 1);
    expect(capped.placed.map(({ id }) => id)).toEqual([0, 2]);
    expect(capped.overflows.flatMap(({ hidden }) => hidden.map(({ id }) => id))).toEqual([1]);
  });

  it('places the now line with the same fractional wall-clock precision', () => {
    const now = new Date(2026, month, 10, 9, 30, 15, 250);
    expect(Grid.computeNowLinePct(now, Grid.resolveBand('08:00', '10:00'))).toBeCloseTo(
      ((wallMinutes(now) - 480) / 120) * 100,
      10,
    );
  });
});

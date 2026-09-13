import { render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type { CalendarEventData } from '../src/config/types';
import { resolveEffectiveConfig } from '../src/config/view';
import { renderGridGroupedEvents } from '../src/rendering/grid';
import { groupEventsByDay } from '../src/utils/events';
import {
  addDays,
  computeEventPlacement,
  layoutLanes,
  resolveBand,
  segmentMinutes,
  splitTimedEventByDay,
  startOfDay,
} from '../src/utils/grid';

const FOLDS: Record<string, { date: string; hour: string; before: string; after: string }> = {
  'Europe/Berlin': { date: '2026-10-25', hour: '02', before: '+02:00', after: '+01:00' },
  'Australia/Sydney': { date: '2026-04-05', hour: '02', before: '+11:00', after: '+10:00' },
  'America/New_York': { date: '2026-11-01', hour: '01', before: '-04:00', after: '-05:00' },
};
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const FOLD = FOLDS[ZONE];
if (!FOLD) throw new Error(`Grid fold tests require one of the DST projects, not ${ZONE}`);

function foldEvent(startMinute: number, endMinute: number): CalendarEventData {
  const at = (minute: number, offset: string) =>
    `${FOLD.date}T${FOLD.hour}:${String(minute).padStart(2, '0')}:00${offset}`;
  return {
    summary: 'Repeated-hour appointment',
    start: { dateTime: at(startMinute, FOLD.before) },
    end: { dateTime: at(endMinute, FOLD.after) },
    _entityId: 'calendar.personal',
  };
}

function wallMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return value('hour') * 60 + value('minute');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${FOLD.date}T00:00:00${FOLD.before}`));
});

afterEach(() => vi.useRealTimers());

describe('Grid repeated-hour intervals', () => {
  it('uses a real backward offset transition rather than a zero-duration fixture', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
    const event = foldEvent(45, 15);
    const start = new Date(event.start.dateTime!);
    const end = new Date(event.end.dateTime!);
    expect(end.getTime() - start.getTime()).toBe(30 * 60000);
    expect(end.getTimezoneOffset() - start.getTimezoneOffset()).toBe(60);
    expect(wallMinutes(end)).toBeLessThan(wallMinutes(start));
  });

  it.each([
    { name: 'reversed', startMinute: 45, endMinute: 15, duration: 30 },
    { name: 'equal', startMinute: 30, endMinute: 30, duration: 60 },
  ])('draws the elapsed duration at the real start for $name endpoints', (row) => {
    const source = foldEvent(row.startMinute, row.endMinute);
    const start = new Date(source.start.dateTime!);
    const end = new Date(source.end.dateTime!);
    const segments = splitTimedEventByDay(source, startOfDay(start), addDays(start, 1));
    expect(segments).toHaveLength(1);
    expect(new Date(segments[0].start.dateTime!).getTime()).toBe(start.getTime());
    expect(new Date(segments[0].end.dateTime!).getTime()).toBe(end.getTime());
    expect((end.getTime() - start.getTime()) / 60000).toBe(row.duration);

    const startMin = wallMinutes(start);
    const extent = segmentMinutes(segments[0]);
    expect(extent).toEqual({ startMin, endMin: startMin + row.duration });
    const placement = computeEventPlacement(
      extent!.startMin,
      extent!.endMin,
      resolveBand('00:00', '24:00'),
    );
    expect(placement).toEqual({
      topPct: (startMin / 1440) * 100,
      heightPct: (row.duration / 1440) * 100,
      clippedTop: false,
      clippedBottom: false,
    });
  });

  it('clips and assigns lanes using the same represented interval', () => {
    const source = foldEvent(45, 15);
    const startMin = wallMinutes(new Date(source.start.dateTime!));
    const extent = segmentMinutes(source)!;
    expect(
      computeEventPlacement(extent.startMin, extent.endMin, {
        startMin: startMin + 5,
        endMin: startMin + 25,
        usedFallback: false,
      }),
    ).toEqual({ topPct: 0, heightPct: 100, clippedTop: true, clippedBottom: true });
    const events = [
      { ...extent, id: 'fold' },
      { startMin: startMin + 10, endMin: startMin + 20, id: 'overlap' },
      { startMin: startMin + 30, endMin: startMin + 45, id: 'adjacent' },
    ];
    const full = layoutLanes(events, 2);
    expect(full.placed.map(({ id, laneIndex, laneCount }) => [id, laneIndex, laneCount])).toEqual([
      ['fold', 0, 2],
      ['overlap', 1, 2],
      ['adjacent', 0, 1],
    ]);
    const capped = layoutLanes(events, 1);
    expect(capped.placed.map(({ id }) => id)).toEqual(['fold', 'adjacent']);
    expect(capped.overflows.flatMap(({ hidden }) => hidden.map(({ id }) => id))).toEqual([
      'overlap',
    ]);
  });

  it('renders both fold events and an ordinary control through Grid grouping', () => {
    const ordinary: CalendarEventData = {
      summary: 'Ordinary appointment',
      start: { dateTime: `${FOLD.date}T11:00:00${FOLD.after}` },
      end: { dateTime: `${FOLD.date}T11:30:00${FOLD.after}` },
      _entityId: 'calendar.personal',
    };
    expect(segmentMinutes(ordinary)).toEqual({ startMin: 660, endMin: 690 });
    const config = buildConfig({
      view: 'grid',
      days_to_show: 1,
      time_grid: { start_time: '00:00', end_time: '24:00' },
    });
    const events = [foldEvent(45, 15), foldEvent(30, 30), ordinary];
    const days = groupEventsByDay(events, config, false, 'en', 'grid');
    expect(days.flatMap((day) => day.events)).toHaveLength(3);
    const container = document.createElement('div');
    render(renderGridGroupedEvents(days, resolveEffectiveConfig(config, 'grid'), 'en'), container);
    expect(container.querySelectorAll('.grid-event:not(.grid-event-overflow)')).toHaveLength(3);
    expect(container.querySelectorAll('.grid-event-overflow')).toHaveLength(0);
  });

  it('never repairs an interval whose instants are reversed', () => {
    const valid = foldEvent(45, 15);
    const reversed = { ...valid, start: valid.end, end: valid.start };
    expect(segmentMinutes(reversed)).toBeNull();
    const day = startOfDay(new Date(valid.start.dateTime!));
    expect(splitTimedEventByDay(reversed, day, addDays(day, 1))).toEqual([]);
  });
});

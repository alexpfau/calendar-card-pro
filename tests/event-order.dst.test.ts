/**
 * `event_order: latest_first` fills empty days back from the window's last day, and that
 * walk crosses the days the clocks change.
 *
 * The earliest-first fill counts forward from the start date; the latest-first one counts
 * back from the last day, which it reaches from the start date by local date fields. Under
 * the unit project's UTC every day is 24 hours long, so neither walk can drop or repeat a
 * date there. Each case below puts a transition at one end of the walk or in its middle, and
 * the expected dates come from UTC string arithmetic rather than from the local-field
 * arithmetic under test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';

const DAY_MS = 86_400_000;

/** Every local day of 2026 that is not 24 hours long, as `YYYY-MM-DD`. */
function transitionDays(): string[] {
  const days: string[] = [];
  for (let day = 0; day < 365; day++) {
    const start = new Date(2026, 0, 1 + day);
    const next = new Date(2026, 0, 2 + day);
    if (next.getTime() - start.getTime() !== DAY_MS) days.push(getLocalDateKey(start));
  }
  return days;
}

/** The date `days` after `date`, by UTC arithmetic, so no local clock is involved. */
function shift(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** `count` dates from `last` back, latest first. */
function back(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shift(last, -i));
}

/** A timed event at local noon on a date. */
function noon(date: string, summary: string): Types.CalendarEventData {
  const [year, month, day] = date.split('-').map(Number);
  return {
    start: { dateTime: new Date(year, month - 1, day, 12).toISOString() },
    end: { dateTime: new Date(year, month - 1, day, 13).toISOString() },
    summary,
    _entityId: 'calendar.log',
  };
}

/** The dates the grouping returns, top to bottom, with what each holds. */
function days(
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config>,
): Array<[string, string[]]> {
  const config = buildConfig({
    entities: ['calendar.log'],
    show_past_events: true,
    ...overrides,
    list: { event_order: 'latest_first', ...overrides.list },
  });
  return EventUtils.groupEventsByDay(
    EventUtils.processEvents(events, config),
    config,
    false,
    'en',
    'list',
  ).map((day) => [
    getLocalDateKey(new Date(day.timestamp)),
    day.events.map((event) => (event._isEmptyDay ? '(empty)' : (event.summary ?? '?'))),
  ]);
}

describe('a latest-first list on the days the clocks change', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  it('finds both of the zone’s transitions in 2026', () => {
    expect(transitionDays()).toHaveLength(2);
  });

  describe.each(transitionDays())('around %s', (transition) => {
    it('lists every date of a window ending on it, latest first', () => {
      const shown = days([], {
        start_date: shift(transition, -6),
        days_to_show: 7,
        show_empty_days: true,
      });
      expect(shown.map(([date]) => date)).toEqual(back(transition, 7));
    });

    it('lists every date of a window starting on it, latest first', () => {
      const shown = days([], { start_date: transition, days_to_show: 7, show_empty_days: true });
      expect(shown.map(([date]) => date)).toEqual(back(shift(transition, 6), 7));
    });

    it('puts an empty card’s notice on it when it is the window’s last day', () => {
      expect(days([], { start_date: shift(transition, -6), days_to_show: 7 })).toEqual([
        [transition, ['(empty)']],
      ]);
    });

    it('fills back across it to the oldest day the event limit reaches', () => {
      const older = shift(transition, -3);
      const newer = shift(transition, 2);
      const shown = days([noon(older, 'older'), noon(newer, 'newer')], {
        start_date: shift(transition, -5),
        days_to_show: 10,
        show_empty_days: true,
        list: { compact_events_to_show: 2 },
      });

      expect(shown.map(([date]) => date)).toEqual(back(shift(transition, 4), 8));
      expect(shown.filter(([, rows]) => rows[0] !== '(empty)')).toEqual([
        [newer, ['newer']],
        [older, ['older']],
      ]);
    });
  });
});

/**
 * `skip_first_events` starts a list's empty days on the day it stopped in, or on the next date
 * when it stopped at the end of a day, and that next date can be the day the clocks change.
 *
 * The continuation day is built from the last skipped row's day by local date fields, then
 * held inside the window and filled from. Under the unit project's UTC every day is 24 hours
 * long, so stepping by milliseconds instead would pass there. Each case below puts a
 * transition on the continuation day, and the expected dates come from UTC string arithmetic
 * rather than from the local-field arithmetic under test.
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

/** `count` dates from `first` on, one way or the other. */
function run(first: string, count: number, step: 1 | -1): string[] {
  return Array.from({ length: count }, (_, i) => shift(first, i * step));
}

/** A timed event at a local hour on a date. */
function at(date: string, hour: number, summary: string): Types.CalendarEventData {
  const [year, month, day] = date.split('-').map(Number);
  return {
    start: { dateTime: new Date(year, month - 1, day, hour).toISOString() },
    end: { dateTime: new Date(year, month - 1, day, hour + 1).toISOString() },
    summary,
    _entityId: 'calendar.anna',
  };
}

/** The dates the grouping returns, top to bottom. */
function dates(events: Types.CalendarEventData[], overrides: Partial<Types.Config>): string[] {
  const config = buildConfig({
    entities: ['calendar.anna'],
    show_past_events: true,
    show_empty_days: true,
    ...overrides,
  });
  return EventUtils.groupEventsByDay(
    EventUtils.processEvents(events, config),
    config,
    false,
    'en',
    'list',
  ).map((day) => getLocalDateKey(new Date(day.timestamp)));
}

describe('a skip continuing on the days the clocks change', () => {
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
    it('starts on it after skipping the whole day before', () => {
      const before = shift(transition, -1);
      const shown = dates([at(before, 10, 'a'), at(before, 12, 'b')], {
        start_date: shift(transition, -2),
        days_to_show: 6,
        list: { skip_first_events: 2 },
      });
      expect(shown).toEqual(run(transition, 4, 1));
    });

    it('starts on it after skipping the whole day after, latest first', () => {
      const after = shift(transition, 1);
      const shown = dates([at(after, 10, 'a'), at(after, 12, 'b')], {
        start_date: shift(transition, -3),
        days_to_show: 6,
        list: { event_order: 'latest_first', skip_first_events: 2 },
      });
      expect(shown).toEqual(run(transition, 4, -1));
    });

    it('starts on it when the skip stops part-way through it', () => {
      const shown = dates([at(transition, 10, 'a'), at(transition, 15, 'b')], {
        start_date: shift(transition, -2),
        days_to_show: 5,
        list: { skip_first_events: 1 },
      });
      expect(shown).toEqual(run(transition, 3, 1));
    });
  });
});

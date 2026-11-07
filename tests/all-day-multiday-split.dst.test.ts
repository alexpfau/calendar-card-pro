import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';

/**
 * Whether an all-day event spans more than one day, on the days the clocks change.
 *
 * Two defects, both invisible outside zones whose clocks change at local midnight.
 *
 * Splitting asks `isMultiDayEvent` first, and its all-day branch used to build both dates with
 * `new Date('YYYY-MM-DD')`, which is UTC midnight rather than local midnight. Behind UTC, the two
 * ends of an event then read across the change at different offsets. Under `Atlantic/Azores` a
 * one-day event on either 2026 transition day was taken for a two-day one, and a two-day event
 * including 2026-10-25 for a one-day one. The first drew nothing different: the splitter cut it
 * into one segment with the event's own dates, drawn like the unsplit event. The second was not
 * split at all, so its second day was never drawn.
 *
 * The splitter had a defect of its own. It walked from the first day to the last comparing
 * instants, and on a day whose 00:00 does not exist `parseAllDayDate` gives 01:00, which `setDate`
 * keeps on every later day, so the walk stopped before the last day's 00:00. A split all-day event
 * running on past the spring-forward day lost its last day; one ending on it did not.
 *
 * Column view splits by default, so neither needed the option turned on; both views are run
 * here. Berlin, Sydney and New York cannot see either defect: in all three UTC midnight falls on
 * the same local day at both ends of an event, and every day has a 00:00. Only the `dst-azores`
 * project fails, on both 2026 transitions for the parse and on the spring one for the walk.
 *
 * These tests pin the rows the grouping emits, one per drawn day, not the markup. List, column
 * and grid markup, with and without duplicate filtering, were compared once with and without each
 * fix by a render probe that is not part of the suite, and changed only where a row did. Search
 * was read rather than run: it folds a lone segment into the one occurrence it reports anyway.
 */

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

/** The local date `days` after `date`, as `YYYY-MM-DD`. */
function shift(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return getLocalDateKey(new Date(year, month - 1, day + days));
}

/**
 * The rows one all-day event becomes, by date: in list view with splitting turned on, or in
 * column view as configured out of the box, which splits by default.
 */
function rows(
  view: 'list' | 'column',
  start: string,
  end: string,
): Array<{ date: string; segment: boolean }> {
  const [year, month, day] = shift(start, -1).split('-').map(Number);
  vi.setSystemTime(new Date(year, month - 1, day, 12));

  const config =
    view === 'list'
      ? buildConfig({ entities: ['calendar.anna'], split_multiday_events: true, days_to_show: 5 })
      : buildConfig({ view: 'column', entities: ['calendar.anna'], days_to_show: 5 });
  const event: Types.CalendarEventData = {
    start: { date: start },
    end: { date: end },
    summary: 'Holiday',
    _entityId: 'calendar.anna',
  };
  const days = EventUtils.groupEventsByDay(
    EventUtils.processEvents([event], config),
    config,
    false,
    'en',
    view,
  );
  return days.flatMap((entry) =>
    entry.events
      .filter((row) => !row._isEmptyDay)
      .map((row) => ({ date: row.start.date ?? '', segment: row._isMultiDaySegment === true })),
  );
}

describe('all-day events on the days the clocks change', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs under a zone that observes DST', () => {
    const january = new Date(2026, 0, 1).getTimezoneOffset();
    const july = new Date(2026, 6, 1).getTimezoneOffset();
    expect(january).not.toBe(july);
  });

  it('finds both of the zone’s transitions in 2026', () => {
    expect(transitionDays()).toHaveLength(2);
  });

  describe.each(
    transitionDays().flatMap((transition) =>
      (['list', 'column'] as const).map((view) => [transition, view] as const),
    ),
  )('around %s, in %s view', (transition, view) => {
    it.each([-1, 0, 1])('keeps a one-day event %i days from it whole', (offset) => {
      vi.useFakeTimers();
      const date = shift(transition, offset);

      expect(rows(view, date, shift(date, 1))).toEqual([{ date, segment: false }]);
    });

    it.each([
      [-1, 2],
      [0, 2],
      [-2, 3],
      [-1, 3],
      [0, 3],
    ])('splits an event starting %i days from it into all of its %i days', (offset, length) => {
      vi.useFakeTimers();
      const start = shift(transition, offset);
      const dates = Array.from({ length }, (_, day) => shift(start, day));

      expect(rows(view, start, shift(start, length))).toEqual(
        dates.map((date) => ({ date, segment: true })),
      );
    });
  });
});

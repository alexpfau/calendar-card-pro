/**
 * The middle days of a split multi-day event.
 *
 * `splitMultiDayEvent` has two branches. The all-day branch is covered; the timed branch
 * emits a first segment, a *run of whole-day middle segments*, and a last segment — and
 * that middle loop only executes when the event spans three or more calendar days. Every
 * fixture in the suite spanned two, so the loop never ran: mutating the `+ 1` that derives
 * each middle segment's exclusive end date to `+ 2` left the whole suite green.
 *
 * The option is off by default, which is the second half of why this was invisible. A
 * suite assembled from `DEFAULT_CONFIG` never splits anything, so `split_multiday_events`
 * has to be turned on deliberately here.
 *
 * The assertions read the segments straight off the day buckets `groupEventsByDay`
 * returns, because the boundary being pinned is the segment's own `start`/`end` rather
 * than which bucket it landed in — a middle segment given a two-day span still sorts into
 * the same day, so a count of days carrying the event cannot see the difference.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/** Four calendar days: one first segment, two middle segments, one last segment. */
const SPANNING_EVENT: Types.CalendarEventData = {
  start: { dateTime: '2026-06-18T09:00:00.000Z' },
  end: { dateTime: '2026-06-21T14:00:00.000Z' },
  summary: 'Conference',
  _entityId: 'calendar.personal',
};

/** The segments carried by each day, in day order. */
function segmentsByDay(event: Types.CalendarEventData): Types.CalendarEventData[] {
  const config = buildConfig({ split_multiday_events: true, days_to_show: 7 });

  return EventUtils.groupEventsByDay([event], config, true, 'en')
    .flatMap((day) => day.events)
    .filter((candidate) => candidate.summary === 'Conference');
}

describe('a timed event spanning four days', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('splits into one segment per day it touches', () => {
    // The denominator for everything below: three segments would mean no middle loop ran
    // and the assertions on middle days would be vacuously satisfied by an empty list.
    expect(segmentsByDay(SPANNING_EVENT)).toHaveLength(4);
  });

  it('gives each middle day a segment covering exactly that day', () => {
    // The `+ 1` under test. A middle segment is written in the all-day shape, where `end`
    // is exclusive, so one whole day is `start` and the following date — not two.
    const [, secondDay, thirdDay] = segmentsByDay(SPANNING_EVENT);

    expect(secondDay.start).toEqual({ date: '2026-06-19' });
    expect(secondDay.end).toEqual({ date: '2026-06-20' });
    expect(thirdDay.start).toEqual({ date: '2026-06-20' });
    expect(thirdDay.end).toEqual({ date: '2026-06-21' });
  });

  it('leaves no gap or overlap between consecutive segments', () => {
    // Derived a second way, so the dates above are not merely restating the
    // implementation: each middle segment must end exactly where the next one starts.
    const [, secondDay, thirdDay, lastDay] = segmentsByDay(SPANNING_EVENT);

    expect(secondDay.end?.date).toBe(thirdDay.start?.date);
    expect(thirdDay.end?.date).toBe(
      new Date('2026-06-21T00:00:00.000Z').toISOString().slice(0, 10),
    );
    expect(lastDay.start?.dateTime).toBeDefined();
  });

  it('keeps the real times on the first and last days', () => {
    // The middle days are whole days; the outer two are not, and truncating them to whole
    // days would be a different way to make the middle assertions pass.
    const segments = segmentsByDay(SPANNING_EVENT);
    const first = segments[0];
    const last = segments[3];

    expect(first.start?.dateTime).toBe(new Date('2026-06-18T09:00:00.000Z').toISOString());
    expect(new Date(first.end!.dateTime!).toISOString()).toBe('2026-06-18T23:59:59.999Z');
    expect(new Date(last.start!.dateTime!).toISOString()).toBe('2026-06-21T00:00:00.000Z');
    expect(new Date(last.end!.dateTime!).toISOString()).toBe('2026-06-21T14:00:00.000Z');
  });

  it('marks every segment as one', () => {
    // `_isMultiDaySegment` is what the renderers read to decide a segment is part of a
    // longer event rather than a standalone entry.
    expect(segmentsByDay(SPANNING_EVENT).every((segment) => segment._isMultiDaySegment)).toBe(true);
  });

  it('does not split at all when the option is off', () => {
    // The control for the whole file. `split_multiday_events` defaults to `false`, so
    // every assertion above depends on it being switched on — without this, a change that
    // made splitting unconditional would look identical from here.
    const config = buildConfig({ days_to_show: 7 });
    const carried = EventUtils.groupEventsByDay([SPANNING_EVENT], config, true, 'en')
      .flatMap((day) => day.events)
      .filter((candidate) => candidate.summary === 'Conference');

    expect(carried.every((candidate) => !candidate._isMultiDaySegment)).toBe(true);
  });
});

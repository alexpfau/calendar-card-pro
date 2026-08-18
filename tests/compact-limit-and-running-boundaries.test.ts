/**
 * Boundary pins for the compact-mode event limiter and the "currently running"
 * predicate.
 *
 * Both are half-open comparisons whose edges were reachable but unasserted:
 *
 * - `compact_events_to_show` fills days in order until the budget runs out. The
 *   final day is usually only partially consumed, so the guard that decides
 *   whether a day still gets a slot has to admit a remainder of exactly one.
 *   Requiring more than one silently dropped that whole day from the card while
 *   every other day rendered normally, so nothing looked broken. That remainder
 *   guard and the budget-exhausted `break` above it mask each other in the
 *   permissive direction — relaxing either one alone changes nothing, because
 *   the other still refuses the day — so the second test below deliberately
 *   pins the pair rather than an individual arm.
 *
 * - `isEventCurrentlyRunning` defines a half-open interval: an event is running
 *   from its start instant up to, but not including, its end instant. Both edges
 *   are exactly reachable under frozen time, and the predicate drives the
 *   progress bar and the running state class.
 *
 * Every boundary assertion below is paired with its one-millisecond neighbour so
 * that a mutation which simply shifts the comparison is caught rather than
 * absorbed.
 *
 * Note on the neighbouring day-inclusion test in `groupEventsByDay`: the
 * `isEventOnOrAfterReference` and `isFutureEvent` disjuncts are both subsumed by
 * `isOngoingEvent` for any event whose end is not before its start, so their
 * edges are unobservable by construction and are deliberately not pinned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

const midnight = (offset: number) => {
  const d = new Date(FROZEN_NOW);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

const at = (offset: number, hour: number) => {
  const d = midnight(offset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const timed = (summary: string, offset: number, from: number, to: number) => ({
  summary,
  start: { dateTime: at(offset, from).toISOString() },
  end: { dateTime: at(offset, to).toISOString() },
  _entityId: 'calendar.personal',
});

const dayKeys = (days: ReturnType<typeof EventUtils.groupEventsByDay>) =>
  days.map((day) => FormatUtils.getLocalDateKey(new Date(day.timestamp)));

const summaries = (days: ReturnType<typeof EventUtils.groupEventsByDay>) =>
  days.map((day) => day.events.map((event) => event.summary));

describe('compact event limit boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('still renders a day when exactly one event slot remains', () => {
    const config = buildConfig({ compact_events_to_show: 3, days_to_show: 5 });
    const events = [
      timed('first-a', 0, 9, 10),
      timed('first-b', 0, 11, 12),
      timed('second-a', 1, 9, 10),
      timed('second-b', 1, 11, 12),
    ] as never;

    const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'list');

    // The second day has a remainder of exactly one slot; it must survive.
    expect(dayKeys(days)).toHaveLength(2);
    expect(summaries(days)[1]).toEqual(['second-a']);
    // Control: the fully consumed first day is unaffected by the same guard.
    expect(summaries(days)[0]).toEqual(['first-a', 'first-b']);
  });

  it('stops adding days once the budget is exhausted', () => {
    const config = buildConfig({ compact_events_to_show: 2, days_to_show: 5 });
    const events = [
      timed('first-a', 0, 9, 10),
      timed('first-b', 0, 11, 12),
      timed('second-a', 1, 9, 10),
    ] as never;

    const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'list');

    expect(dayKeys(days)).toHaveLength(1);
    expect(summaries(days)[0]).toEqual(['first-a', 'first-b']);
  });
});

describe('isEventCurrentlyRunning interval boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const offsetFromNow = (milliseconds: number) => new Date(Date.now() + milliseconds);

  const event = (start: Date, end: Date) =>
    ({
      summary: 'boundary',
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    }) as never;

  it('treats the start instant as inclusive', () => {
    const startsNow = event(offsetFromNow(0), offsetFromNow(3_600_000));
    const startsInOneMillisecond = event(offsetFromNow(1), offsetFromNow(3_600_000));

    expect(EventUtils.isEventCurrentlyRunning(startsNow)).toBe(true);
    expect(EventUtils.isEventCurrentlyRunning(startsInOneMillisecond)).toBe(false);
  });

  it('treats the end instant as exclusive', () => {
    const endsNow = event(offsetFromNow(-3_600_000), offsetFromNow(0));
    const endsInOneMillisecond = event(offsetFromNow(-3_600_000), offsetFromNow(1));

    expect(EventUtils.isEventCurrentlyRunning(endsNow)).toBe(false);
    expect(EventUtils.isEventCurrentlyRunning(endsInOneMillisecond)).toBe(true);
  });
});

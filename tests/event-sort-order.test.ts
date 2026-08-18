/**
 * The order events appear in within a single day.
 *
 * `groupEventsByDay`'s comparator decides four things in sequence: all-day events sort
 * before timed ones, everything else sorts chronologically, and two all-day events that
 * begin at the same instant fall back first to the order their entities are configured
 * in and finally to their summary.
 *
 * None of it was pinned. Every fixture in the suite already declared its events in the
 * order the comparator was supposed to produce, so the sort never had to move anything --
 * and a comparator that never moves an element is indistinguishable from a correct one.
 * Flipping `if (!aIsAllDay && bIsAllDay)` to `||`, which makes *every* timed-vs-timed
 * comparison claim the left event sorts later, left all 1922 tests green: V8 sorts short
 * arrays by binary insertion, and an already-ordered run is never displaced no matter
 * what the comparator says.
 *
 * So every case below hands the comparator an order it has to *change*. Input that
 * arrives already sorted proves nothing here, which is why none of these reuse the
 * shared `EVENTS` fixture -- it is pre-sorted, and that is exactly what hid this.
 *
 * The last three cases each isolate one rung of the tie-break ladder by making the rungs
 * above it tie, since a rung can only be observed when nothing earlier has already
 * decided the comparison.
 *
 * Two branches are deliberately left unpinned. The comparator guards its start extraction
 * with `if (aIsAllDay && a.start.date)`, and relaxing either guard to `||` only changes
 * the result for an event carrying both `dateTime` and `date`, or neither. Home Assistant
 * always returns exactly one, and so does every event this module builds itself, so no
 * input that can actually arrive tells the two apart. Pinning them would mean asserting
 * over a shape the card cannot receive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

const ENTITY = 'calendar.personal';
const OTHER = 'calendar.work';

/** A timed event on the frozen day, expressed in UTC to match the pinned zone. */
function timed(hhmm: string, summary: string, entity = ENTITY): Types.CalendarEventData {
  return {
    start: { dateTime: `2026-06-17T${hhmm}:00.000Z` },
    end: { dateTime: `2026-06-17T${hhmm}:30.000Z` },
    summary,
    _entityId: entity,
  };
}

/** An all-day event. `start`/`end` are plain dates, and `end` is exclusive. */
function allDay(
  start: string,
  end: string,
  summary: string,
  entity = ENTITY,
): Types.CalendarEventData {
  return { start: { date: start }, end: { date: end }, summary, _entityId: entity };
}

/**
 * Groups a single day and returns just the summaries, in render order.
 *
 * `show_past_events` is on because the frozen clock sits at 10:00 and half of these
 * fixtures deliberately start before it; without it the sort would be asserted over a
 * list the filter had already shortened.
 */
function order(
  events: Types.CalendarEventData[],
  entities: Types.Config['entities'] = [ENTITY],
): (string | undefined)[] {
  const config = buildConfig({ entities, days_to_show: 1, show_past_events: true });
  return EventUtils.groupEventsByDay(events, config, false, 'en')[0].events.map((e) => e.summary);
}

describe('groupEventsByDay event order', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('puts all-day events first and sorts the timed ones chronologically', () => {
    const shuffled = [
      timed('16:00', 'D-late'),
      timed('08:00', 'A-early'),
      allDay('2026-06-17', '2026-06-18', 'Z-allday'),
      timed('14:00', 'C-mid'),
    ];

    expect(order(shuffled)).toEqual(['Z-allday', 'A-early', 'C-mid', 'D-late']);
  });

  it('sorts two all-day events by start rather than by the tie-break', () => {
    // A multi-day event running through this day started before it, so the two all-day
    // events in the same bucket do *not* share a start and must not reach the tie-break.
    // Summaries are chosen so entity order and alphabetical order would both invert the
    // expected result, making a fallthrough to either rung visible rather than silent.
    const events = [
      allDay('2026-06-17', '2026-06-18', 'A-starts-today'),
      allDay('2026-06-15', '2026-06-19', 'Z-started-earlier'),
    ];

    expect(order(events)).toEqual(['Z-started-earlier', 'A-starts-today']);
  });

  it('leaves two timed events at the same instant in their original order', () => {
    // The tie-break rungs are for all-day events only. Timed events that collide compare
    // equal, and a stable sort then preserves input order -- so reverse-alphabetical
    // input must survive intact.
    const events = [timed('09:00', 'B-second'), timed('09:00', 'A-first')];

    expect(order(events)).toEqual(['B-second', 'A-first']);
  });

  it('breaks a same-start all-day tie on configured entity order', () => {
    // Both start on the same day, so only the entity rung can decide. The second entity
    // is listed first in the input to prove the config order is what wins, not arrival.
    const events = [
      allDay('2026-06-17', '2026-06-18', 'from-work', OTHER),
      allDay('2026-06-17', '2026-06-18', 'from-personal', ENTITY),
    ];

    expect(order(events, [ENTITY, OTHER])).toEqual(['from-personal', 'from-work']);
  });

  it('breaks a same-start same-entity all-day tie on summary', () => {
    // Same start and same entity, so the summary rung is the only one left. Input is
    // reverse-alphabetical, so a comparator that stopped short would return it unchanged.
    const events = [
      allDay('2026-06-17', '2026-06-18', 'Beta'),
      allDay('2026-06-17', '2026-06-18', 'Alpha'),
    ];

    expect(order(events)).toEqual(['Alpha', 'Beta']);
  });

  it('leaves an already-alphabetical all-day tie alone', () => {
    // The mirror of the case above, and not redundant with it: the two comparisons put
    // the titled summaries on opposite sides of `localeCompare`, and each side has its
    // own `|| ''` fallback. Dropping the left-hand one reorders *this* input while
    // leaving the reversed input correct, so only asserting the reordering direction
    // would miss it entirely.
    const events = [
      allDay('2026-06-17', '2026-06-18', 'Alpha'),
      allDay('2026-06-17', '2026-06-18', 'Beta'),
    ];

    expect(order(events)).toEqual(['Alpha', 'Beta']);
  });
});

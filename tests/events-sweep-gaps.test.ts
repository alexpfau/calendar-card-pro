/**
 * The real gaps from the `src/utils/events.ts` mutation sweep.
 *
 * 131 sites, 84 killed, 47 survived. Most of the survivors are defensive duplication or
 * are provably equivalent — the file's own comment at `isEventOnOrAfterReference` already
 * records two of them, and the compact-mode budget arms were measured over a 1,279-row
 * differential at zero differing rows. What is left here is the subset where a mutant
 * changes what the user sees and nothing failed.
 *
 * Three causes, one per block below. Each is a case the existing fixtures could not
 * reach rather than an assertion that was too weak:
 *
 *  - every all-day fixture in the suite is a single day, so the exclusive-end adjustment
 *    is never load-bearing;
 *  - every per-entity `compact_events_to_show` fixture uses a limit of 1, which cannot
 *    distinguish a counter that increments by one from one that increments by two;
 *  - every per-entity fixture has a single object entity, so an index lookup that
 *    matches the wrong one still returns the same index.
 *
 * The 43 survivors left over are not defects, and the reasons cluster. Nine paired-null
 * guards (`!a || !b` relaxed to `!a && !b`) are unreachable on the production path
 * because `keepWellFormedEvents` runs first and guarantees both are present; four
 * all-day detection pairs stay reachable only from a feed mixing `date` and `dateTime`
 * on one event, which is already broken input where either operator gives an arbitrary
 * answer. Five are `length > 0` guards around a loop or a log over nothing. Two sit
 * behind `toValidNumber`, which has already reduced the value to `number | undefined`.
 * Six are reached only when `configIdx` is `-1`, which needs `matchedConfig` absent —
 * and the branch above returns before the key is used. The compact-budget arms and the
 * two subsumed day-inclusion disjuncts are documented at their own sites in
 * `events.ts`, both carrying the measurement and an explicit "do not write a test".
 *
 * That leaves seven — the display-date branches, the all-day sort keys and the empty-day
 * range end — which are recorded here as **not individually re-derived**, which is not
 * the same claim as equivalent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

/** Local midnight `offset` days from the frozen clock. */
const midnight = (offset: number): Date => {
  const d = new Date(FROZEN_NOW);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

/** `YYYY-MM-DD` for an all-day boundary, which the API sends as a bare date. */
const dateKey = (offset: number): string => {
  const d = midnight(offset);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const at = (offset: number, hour: number): Date => {
  const d = midnight(offset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const timed = (summary: string, offset: number, from: number, entity: string) => ({
  summary,
  start: { dateTime: at(offset, from).toISOString() },
  end: { dateTime: at(offset, from + 1).toISOString() },
  _entityId: entity,
});

const summaries = (days: ReturnType<typeof EventUtils.groupEventsByDay>): string[] =>
  days.flatMap((day) => day.events.map((event) => event.summary ?? ''));

/** Summaries keyed by the day they were grouped under. */
const byDay = (days: ReturnType<typeof EventUtils.groupEventsByDay>): Record<string, string[]> =>
  Object.fromEntries(
    days.map((day) => [
      FormatUtils.getLocalDateKey(new Date(day.timestamp)),
      day.events.map((event) => event.summary ?? ''),
    ]),
  );

describe('an all-day event whose last day is today', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * An all-day `end.date` is **exclusive** — the API reports a holiday running through
   * Wednesday as ending on Thursday — so the card subtracts a day to get the inclusive
   * last day, and compares that against the window start.
   *
   * Getting the subtraction wrong drops the event a day early. That is invisible to the
   * rest of the suite because every all-day fixture in it starts on or after the window
   * start, and such an event is admitted by its *start* before its end is ever consulted.
   * Only an event that began before today can exercise the end at all.
   */
  const spanning = (summary: string, startOffset: number, endOffsetExclusive: number) => ({
    summary,
    start: { date: dateKey(startOffset) },
    end: { date: dateKey(endOffsetExclusive) },
    _entityId: 'calendar.personal',
  });

  it('is still shown on its final day', () => {
    // Started two days ago, exclusive end tomorrow => inclusive last day is today.
    const config = buildConfig({ days_to_show: 3 });
    const days = EventUtils.groupEventsByDay(
      [spanning('vacation', -2, 1)] as never,
      config,
      false,
      'en',
      'list',
    );

    // Asserting only that the event survives is not enough. The grouping pass makes the
    // same exclusive-end adjustment a second time, and getting *that* one wrong does not
    // drop the event — it files it under the day it started, two days outside the window.
    // A flat search across every day cannot see that; the day key can.
    expect(byDay(days)[dateKey(0)]).toContain('vacation');
  });

  it('is dropped once its final day has passed (control)', () => {
    // Exclusive end today => inclusive last day was yesterday. Without this the
    // assertion above would also pass for a filter that never excludes anything.
    const config = buildConfig({ days_to_show: 3 });
    const days = EventUtils.groupEventsByDay(
      [spanning('finished', -3, 0)] as never,
      config,
      false,
      'en',
      'list',
    );

    expect(summaries(days)).not.toContain('finished');
  });
});

describe('a per-calendar event limit above one', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('admits exactly as many events as it names', () => {
    // A limit of 1 — which every existing fixture uses — cannot tell a counter that
    // steps by one from one that steps by two: either way the second event is refused.
    // A limit of 2 with three events separates them, and is the smallest case that can.
    const entity = { entity: 'calendar.work', compact_events_to_show: 2 };
    const config = buildConfig({ entities: [entity], compact_events_to_show: 10 });

    const events = [
      { ...timed('work-a', 0, 9, 'calendar.work'), _matchedConfig: entity },
      { ...timed('work-b', 0, 11, 'calendar.work'), _matchedConfig: entity },
      { ...timed('work-c', 0, 13, 'calendar.work'), _matchedConfig: entity },
    ];

    const days = EventUtils.groupEventsByDay(events as never, config, false, 'en', 'list');

    expect(summaries(days)).toEqual(['work-a', 'work-b']);
  });

  it('keeps two calendars on separate budgets', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.work', compact_events_to_show: 1 },
        { entity: 'calendar.home', compact_events_to_show: 1 },
      ],
      compact_events_to_show: 10,
    });
    // The matched config must be taken from the built config, not from the literal
    // above: `buildConfig` normalizes `entities` into fresh objects, so a literal is
    // never identity-equal to anything the lookup searches and every event would fall
    // through to the entity-id-only key — which is a different code path from the one
    // under test, and one that happens to pass.
    const [work, home] = config.entities as Array<{ entity: string }>;

    const events = [
      { ...timed('work-a', 0, 9, 'calendar.work'), _matchedConfig: work },
      { ...timed('home-a', 0, 10, 'calendar.home'), _matchedConfig: home },
      { ...timed('work-b', 0, 11, 'calendar.work'), _matchedConfig: work },
      { ...timed('home-b', 0, 12, 'calendar.home'), _matchedConfig: home },
    ];

    const days = EventUtils.groupEventsByDay(events as never, config, false, 'en', 'list');

    // One from each, not one in total.
    expect(summaries(days)).toEqual(['work-a', 'home-a']);
  });

  it('keeps two entries for the same calendar on separate budgets', () => {
    // This is what the config index in the counter key is *for*, and it is the only
    // case that can show it. The key is `${entityId}__${configIdx}`, so for two
    // different calendars the entity id already separates the budgets and the index is
    // inert — relaxing the identity match to accept any object returns index 0 for both
    // and nothing changes. Two entries naming the same calendar collide on the entity
    // id, leaving the index as the only thing keeping them apart.
    const config = buildConfig({
      entities: [
        { entity: 'calendar.shared', compact_events_to_show: 1 },
        { entity: 'calendar.shared', compact_events_to_show: 1 },
      ],
      compact_events_to_show: 10,
    });
    const [first, second] = config.entities as Array<{ entity: string }>;

    const events = [
      { ...timed('first-a', 0, 9, 'calendar.shared'), _matchedConfig: first },
      { ...timed('second-a', 0, 10, 'calendar.shared'), _matchedConfig: second },
      { ...timed('first-b', 0, 11, 'calendar.shared'), _matchedConfig: first },
    ];

    const days = EventUtils.groupEventsByDay(events as never, config, false, 'en', 'list');

    expect(summaries(days)).toEqual(['first-a', 'second-a']);
  });
});

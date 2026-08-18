/**
 * Per-view overrides for the two content options that turned out not to be fetch-time.
 *
 * `show_past_events` and `filter_duplicates` sat in `FETCH_TIME_KEYS` alongside genuine
 * window-shaping options like `days_to_show`. Tracing them showed neither reaches the API:
 *
 * - `getTimeWindow(days, startDate, firstDayOfWeek)` never receives `show_past_events`,
 *   and the window starts at midnight of the reference date either way, so past events
 *   *are* fetched and the option only decides whether they are rendered.
 * - `filter_duplicates` is applied after the fetch and is deliberately absent from the
 *   cache key, which holds the raw payload and reprocesses it on every read.
 *
 * So both can differ per view without any extra Home Assistant call, which is what
 * acceptance criterion E3 requires of a width transition.
 *
 * Two knock-on effects had to be handled, and both are covered below:
 *
 *  1. `filter_duplicates` used to run inside the fetch-time pass, so by the time the card
 *     held its events the duplicates were already gone. `column.filter_duplicates: false`
 *     against a top-level `true` could not have brought them back — it would have been an
 *     option that silently did nothing, which is the exact defect class this override is
 *     supposed to avoid. Deduplication now runs at grouping time instead.
 *  2. `visibleEventCount` fed `hide_when_empty` and deliberately grouped "the list way",
 *     on the reasoning that no per-view option could change whether the count was zero.
 *     `show_past_events` can: a card whose only events today are in the past is empty in
 *     one view and populated in the other.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as EventUtils from '../src/utils/events';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Two calendars carrying the same event, so duplicate filtering has something to do. */
const DUPLICATED: Types.CalendarEventData[] = [
  {
    start: { dateTime: '2026-06-18T09:00:00.000Z' },
    end: { dateTime: '2026-06-18T10:00:00.000Z' },
    summary: 'Shared standup',
    _entityId: 'calendar.personal',
  },
  {
    start: { dateTime: '2026-06-18T09:00:00.000Z' },
    end: { dateTime: '2026-06-18T10:00:00.000Z' },
    summary: 'Shared standup',
    _entityId: 'calendar.work',
  },
];

/** One event already finished today, and one still to come. */
const PAST_AND_FUTURE: Types.CalendarEventData[] = [
  {
    start: { dateTime: '2026-06-17T06:00:00.000Z' },
    end: { dateTime: '2026-06-17T07:00:00.000Z' },
    summary: 'Already over',
    _entityId: 'calendar.personal',
  },
  {
    start: { dateTime: '2026-06-17T20:00:00.000Z' },
    end: { dateTime: '2026-06-17T21:00:00.000Z' },
    summary: 'Still to come',
    _entityId: 'calendar.personal',
  },
];

/** Summaries rendered for a config, in the given view. */
function summaries(
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config>,
  view: Types.EffectiveView,
): string[] {
  const base = buildConfig({
    entities: ['calendar.personal', 'calendar.work'],
    ...overrides,
  } as Partial<Types.Config>);
  base.entities = Config.normalizeEntities(base.entities);

  const effective = ViewConfig.resolveEffectiveConfig(base, view);
  return EventUtils.groupEventsByDay(events, effective, false, 'en', view)
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay)
    .map((event) => String(event.summary));
}

describe('both keys are classified as overridable rather than fetch-time', () => {
  it('appear in COLUMN_OVERRIDE_KEYS', () => {
    expect(ViewConfig.COLUMN_OVERRIDE_KEYS).toContain('show_past_events');
    expect(ViewConfig.COLUMN_OVERRIDE_KEYS).toContain('filter_duplicates');
  });

  it('are accepted inside a column block rather than warned away', () => {
    const config = buildConfig({
      view: 'column',
      column: { show_past_events: true, filter_duplicates: true },
    } as unknown as Partial<Types.Config>);

    expect(() => ViewConfig.validateColumnOverrides(config)).not.toThrow();

    const resolved = ViewConfig.resolveEffectiveConfig(config, 'column');
    expect(resolved.show_past_events).toBe(true);
    expect(resolved.filter_duplicates).toBe(true);
  });

  it('leave the genuinely fetch-time keys alone', () => {
    // The control. These three really do shape the API window or the cache key, and must
    // stay forbidden — otherwise this change has quietly opened the door to a refetch on
    // resize, which E3 forbids.
    for (const key of ['days_to_show', 'entities', 'start_date', 'first_day_of_week']) {
      expect(ViewConfig.COLUMN_OVERRIDE_KEYS).not.toContain(key);
    }
  });
});

describe('show_past_events per view', () => {
  it('hides past events in list and shows them in column', () => {
    const overrides = { show_past_events: false, column: { show_past_events: true } };

    expect(summaries(PAST_AND_FUTURE, overrides as Partial<Types.Config>, 'list')).toEqual([
      'Still to come',
    ]);
    expect(summaries(PAST_AND_FUTURE, overrides as Partial<Types.Config>, 'column')).toEqual([
      'Already over',
      'Still to come',
    ]);
  });

  it('works in the other direction too', () => {
    const overrides = { show_past_events: true, column: { show_past_events: false } };

    expect(summaries(PAST_AND_FUTURE, overrides as Partial<Types.Config>, 'list')).toHaveLength(2);
    expect(summaries(PAST_AND_FUTURE, overrides as Partial<Types.Config>, 'column')).toEqual([
      'Still to come',
    ]);
  });

  it('inherits the top-level value when the block does not mention it', () => {
    // Unlike show_empty_days and split_multiday_events, this key has no divergent column
    // default — an absent override must mean "same as list".
    const overrides = { show_past_events: true };

    expect(summaries(PAST_AND_FUTURE, overrides as Partial<Types.Config>, 'column')).toHaveLength(
      2,
    );
    expect(
      summaries(PAST_AND_FUTURE, { show_past_events: false } as Partial<Types.Config>, 'column'),
    ).toEqual(['Still to come']);
  });
});

describe('filter_duplicates per view', () => {
  it('keeps duplicates in list and removes them in column', () => {
    const overrides = { filter_duplicates: false, column: { filter_duplicates: true } };

    expect(summaries(DUPLICATED, overrides as Partial<Types.Config>, 'list')).toHaveLength(2);
    expect(summaries(DUPLICATED, overrides as Partial<Types.Config>, 'column')).toHaveLength(1);
  });

  it('removes them in list and keeps them in column — the direction that used to be impossible', () => {
    // This is the case that forced deduplication out of the fetch-time pass. While it ran
    // there, the card's own event list was already deduplicated and no column override
    // could put a duplicate back.
    const overrides = { filter_duplicates: true, column: { filter_duplicates: false } };

    expect(summaries(DUPLICATED, overrides as Partial<Types.Config>, 'list')).toHaveLength(1);
    expect(summaries(DUPLICATED, overrides as Partial<Types.Config>, 'column')).toHaveLength(2);
  });

  it('keeps the copy from the calendar listed first', () => {
    // The semantics deduplication had inside the per-entity loop, which the move must not
    // change: precedence follows the order of `entities`.
    const config = buildConfig({
      entities: ['calendar.work', 'calendar.personal'],
      filter_duplicates: true,
    } as Partial<Types.Config>);
    config.entities = Config.normalizeEntities(config.entities);

    const kept = EventUtils.groupEventsByDay(DUPLICATED, config, false, 'en')
      .flatMap((day) => day.events)
      .filter((event) => !event._isEmptyDay);

    expect(kept).toHaveLength(1);
    expect(kept[0]._entityId).toBe('calendar.work');
  });

  it('inherits the top-level value when the block does not mention it', () => {
    expect(
      summaries(DUPLICATED, { filter_duplicates: true } as Partial<Types.Config>, 'column'),
    ).toHaveLength(1);
    expect(
      summaries(DUPLICATED, { filter_duplicates: false } as Partial<Types.Config>, 'column'),
    ).toHaveLength(2);
  });
});

describe('hide_when_empty follows the view actually rendered', () => {
  /**
   * `visibleEventCount` fed `hide_when_empty` and deliberately grouped "the list way",
   * with a comment reasoning that no per-view option could change whether the count was
   * zero — true of `show_empty_days` (placeholders are filtered out anyway) and of
   * `split_multiday_events` (splitting makes more of something, never something of
   * nothing). The comment ended by asking for the reasoning to be re-checked if an
   * option arrived that could.
   *
   * `show_past_events` is that option. A card whose only events today are already over
   * is empty under `show_past_events: false` and populated under `true`, so the two
   * views genuinely disagree about zero-ness — and counting the list way would hide a
   * column card that has something to show.
   */
  function countFor(view: Types.EffectiveView): number {
    const base = buildConfig({
      entities: ['calendar.personal'],
      hide_when_empty: true,
      show_past_events: false,
      column: { show_past_events: true },
    } as unknown as Partial<Types.Config>);
    base.entities = Config.normalizeEntities(base.entities);

    const effective = ViewConfig.resolveEffectiveConfig(base, view);
    return EventUtils.groupEventsByDay([PAST_AND_FUTURE[0]], effective, true, 'en', view).reduce(
      (total, day) => total + day.events.filter((event) => !event._isEmptyDay).length,
      0,
    );
  }

  it('counts nothing in list view, where the past event is hidden', () => {
    expect(countFor('list')).toBe(0);
  });

  it('counts the past event in column view, where it is shown', () => {
    expect(countFor('column')).toBe(1);
  });
});

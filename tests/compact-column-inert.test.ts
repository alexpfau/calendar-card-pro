import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as EventUtils from '../src/utils/events';

/**
 * Compact-mode limits are inert in column view.
 *
 * Four separate keys reach into `groupEventsByDay` and cap what it returns:
 * `compact_days_to_show`, `compact_events_to_show` (global *and* per-entity) and
 * `compact_events_complete_days`. All four were written for a vertical list, where a cap
 * is a tail-trim: the card gets shorter and the soonest events survive. In a grid the
 * same cap deletes columns from the right while the card keeps its full height, so it
 * renders a smaller card in identical space with nothing on screen to say days are
 * missing. Column view answers density with `min_days_to_show` / `min_width_fallback`
 * instead.
 *
 * ## Why every case here is a *paired* assertion
 *
 * Each test renders the same events and the same config twice — once as `'list'`, once as
 * `'column'` — and asserts the two differ. A column-only assertion would pass just as
 * happily against a build where the key had stopped working everywhere, which is the
 * precise failure this file exists to catch: the gates are one shared boolean, so a
 * mistake there is far more likely to over-reach into list view than to under-reach.
 * The list half of every pair is the load-bearing half.
 *
 * ## Vacuity
 *
 * Every compact key defaults to `undefined`/`false`, so a suite built from default config
 * exercises none of this (AGENTS.md). Each test sets its key explicitly, and the list-view
 * expectation is a hard count rather than "fewer", so a gate that silently disabled the
 * feature outright would fail rather than pass.
 *
 * ## Clock
 *
 * Frozen at 2026-06-17 because empty-day generation counts forward from *today*.
 */

/** A timed event on a given date, in UTC to match the pinned zone. */
function timed(date: string, summary: string): Types.CalendarEventData {
  return {
    start: { dateTime: `${date}T09:00:00.000Z` },
    end: { dateTime: `${date}T10:00:00.000Z` },
    summary,
    _entityId: 'calendar.personal',
  };
}

/** Three events a day across the three days from the frozen date. */
const THREE_DAYS: Types.CalendarEventData[] = [
  timed('2026-06-17', 'Wed A'),
  timed('2026-06-17', 'Wed B'),
  timed('2026-06-17', 'Wed C'),
  timed('2026-06-18', 'Thu A'),
  timed('2026-06-18', 'Thu B'),
  timed('2026-06-18', 'Thu C'),
  timed('2026-06-19', 'Fri A'),
  timed('2026-06-19', 'Fri B'),
  timed('2026-06-19', 'Fri C'),
];

/** Everything on the first day only — the fixture that exposes empty-day truncation. */
const FIRST_DAY_ONLY: Types.CalendarEventData[] = [
  timed('2026-06-17', 'Wed A'),
  timed('2026-06-17', 'Wed B'),
  timed('2026-06-17', 'Wed C'),
];

/**
 * Group once for a given view.
 *
 * Resolves the `column:` block first, exactly as `calendar-card-pro.ts` does — grouping
 * takes the effective config, so a harness passing the raw one would never see an
 * override. `isExpanded` is `false` throughout: compact limits only apply unexpanded, so
 * passing `true` would make every assertion here vacuously green.
 */
function group(
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config>,
  view: Types.EffectiveView,
): Types.EventsByDay[] {
  const config = ViewConfig.resolveEffectiveConfig(buildConfig(overrides), view);
  return EventUtils.groupEventsByDay(events, config, false, 'en', view);
}

/** Real events across the whole grid, excluding the empty-day placeholders. */
function realEventCount(days: Types.EventsByDay[]): number {
  return days.reduce((n, day) => n + day.events.filter((e) => !e._isEmptyDay).length, 0);
}

/**
 * Group with a per-entity cap, wiring `_matchedConfig` by reference.
 *
 * Production sets `_matchedConfig` at fetch time to the very object in `config.entities`
 * (`events.ts:805`), and the bucket key is derived by identity lookup against that array.
 * Building the config first and reading the normalized entry back out reproduces that,
 * rather than passing a lookalike literal that would land in the fallback bucket.
 */
function groupWithPerEntityCap(
  events: Types.CalendarEventData[],
  cap: number,
  overrides: Partial<Types.Config>,
  view: Types.EffectiveView,
): Types.EventsByDay[] {
  const config = ViewConfig.resolveEffectiveConfig(
    buildConfig({
      entities: [{ entity: 'calendar.personal', compact_events_to_show: cap }],
      ...overrides,
    }),
    view,
  );
  const matched = config.entities[0];
  const tagged = events.map((event) => ({
    ...event,
    _matchedConfig: typeof matched === 'object' ? matched : undefined,
  }));
  return EventUtils.groupEventsByDay(tagged, config, false, 'en', view);
}

describe('compact-mode limits are inert in column view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores compact_days_to_show, which would otherwise delete trailing columns', () => {
    const overrides = {
      days_to_show: 5,
      compact_days_to_show: 2,
      show_empty_days: true,
    } satisfies Partial<Types.Config>;

    // List view is the control: the cap is real there and shortens the card.
    expect(group(THREE_DAYS, overrides, 'list')).toHaveLength(2);

    // Column view keeps all five, because three wide columns in the space of five narrow
    // ones is a different card, not a denser one.
    expect(group(THREE_DAYS, overrides, 'column')).toHaveLength(5);
  });

  it('ignores the global compact_events_to_show budget', () => {
    const overrides = {
      days_to_show: 3,
      compact_events_to_show: 2,
      show_empty_days: true,
    } satisfies Partial<Types.Config>;

    expect(realEventCount(group(THREE_DAYS, overrides, 'list'))).toBe(2);
    expect(realEventCount(group(THREE_DAYS, overrides, 'column'))).toBe(9);
  });

  it('ignores compact_events_complete_days, which rides the same budget', () => {
    const overrides = {
      days_to_show: 3,
      compact_events_to_show: 2,
      compact_events_complete_days: true,
      show_empty_days: true,
    } satisfies Partial<Types.Config>;

    // Soft-limit mode completes the day it was cut off in, so list view keeps the whole
    // first day and stops — a different number from the hard-limit case above, which is
    // what makes this a distinct branch rather than a duplicate of it.
    expect(realEventCount(group(THREE_DAYS, overrides, 'list'))).toBe(3);
    expect(realEventCount(group(THREE_DAYS, overrides, 'column'))).toBe(9);
  });

  it('ignores a per-entity compact_events_to_show, which is card-wide, not per-column', () => {
    const overrides = { days_to_show: 3, show_empty_days: true } satisfies Partial<Types.Config>;

    // The per-entity bucket keys on `${entityId}__${configIdx}` — one budget per entity
    // for the whole card, not per day. So on a single-entity card a cap of 1 leaves one
    // event in the entire grid. This is the correction to A3-D, which had recorded the
    // per-entity form as column-safe.
    expect(realEventCount(groupWithPerEntityCap(THREE_DAYS, 1, overrides, 'list'))).toBe(1);
    expect(realEventCount(groupWithPerEntityCap(THREE_DAYS, 1, overrides, 'column'))).toBe(9);
  });

  it('generates empty days across the full range even with compact_events_to_show set', () => {
    const overrides = {
      days_to_show: 5,
      compact_events_to_show: 2,
      show_empty_days: true,
    } satisfies Partial<Types.Config>;

    // The subtlest of the four sites: the compact keys are read a second time when the
    // empty-day range is chosen, where `compact_events_to_show` truncates generation at
    // the last day *carrying events*. With events on day one only that silently drops
    // every trailing empty column — in a view that defaults `show_empty_days` to true.
    expect(group(FIRST_DAY_ONLY, overrides, 'list')).toHaveLength(1);
    expect(group(FIRST_DAY_ONLY, overrides, 'column')).toHaveLength(5);
  });

  it('still honours show_empty_days: false inside the column block', () => {
    // The regression guard for how the gate is implemented. The empty-day filter used to
    // sit inside the same `if (!isExpanded)` block as the per-entity cap, so gating that
    // block wholesale — or the tempting shortcut of treating column view as always
    // expanded — would make this config unreachable.
    const days = group(
      FIRST_DAY_ONLY,
      {
        days_to_show: 5,
        column: { show_empty_days: false },
      } as Partial<Types.Config>,
      'column',
    );

    expect(days).toHaveLength(1);
    expect(realEventCount(days)).toBe(3);
  });
});

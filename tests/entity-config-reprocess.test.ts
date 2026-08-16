/**
 * Per-calendar configuration edits must reprocess the cached payload.
 *
 * `hasConfigChanged()` reduces `entities` to a sorted list of entity **IDs**, which is
 * the right question to ask about the *API request* — changing a calendar's colour does
 * not move the fetch window. But `setConfig()` used that single boolean to decide
 * whether to do anything at all, so an edit that changed only a per-calendar option fell
 * through to "no work required".
 *
 * That is wrong because per-calendar options are not applied at render time. They are
 * stamped onto each event as `_matchedConfig` inside `processEvents()`, which runs only
 * on the fetch path (`processRawEvents` → `fetchEventData`). The render path
 * (`groupEventsByDay`) copies the stamp through and never re-derives it, and the readers
 * prefer the stamp over the live config — `getEntityLabel()` returns
 * `event._matchedConfig.label` before it ever looks at `config.entities`. So a stale
 * stamp actively shadows the edit until the refresh timer fires (30 minutes by default),
 * the page is hidden and reshown, or the dashboard is reloaded.
 *
 * The filters are the sharpest case: `allowlist`/`blocklist` are applied in
 * `filterEventsForEntity()` during the same processing pass, so an event the user just
 * excluded stays on screen.
 *
 * The fix does not need an API call. `updateEvents(false)` reaches `fetchEventData`,
 * which on a cache hit calls `processRawEvents(cachedEvents, config, …)` with the
 * **current** config — and neither the cache key nor `_instanceId` contains anything but
 * entity IDs, so the edit cannot invalidate the entry it needs. Reprocessing is free.
 *
 * These tests pin the classification rather than the rendered output, because the
 * classification is what was wrong: refetch for a query change, reprocess for a
 * per-calendar change, nothing for a purely presentational one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import '../src/calendar-card-pro';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  updateEvents(force?: boolean): Promise<void>;
}

/**
 * Every editable per-calendar option, with a before/after pair.
 *
 * This list is deliberately exhaustive over `EntityConfig` minus `entity` itself. The
 * production comparison is field-agnostic, so a fourteenth option is covered the moment
 * it is added; this table exists so that a regression narrowing the comparison to a
 * hand-written field list fails here instead of shipping.
 */
const PER_CALENDAR_OPTIONS: ReadonlyArray<[string, unknown, unknown]> = [
  ['label', 'Old label', 'New label'],
  ['label_type', 'text', 'icon'],
  ['color', 'red', 'blue'],
  ['accent_color', 'red', 'blue'],
  ['label_icon_color', 'red', 'blue'],
  ['show_time', true, false],
  ['show_location', true, false],
  ['show_description', false, true],
  ['compact_events_to_show', 1, 2],
  ['blocklist', 'standup', 'retro'],
  ['allowlist', 'standup', 'retro'],
  ['split_multiday_events', true, false],
];

describe('per-calendar configuration changes reprocess cached events', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Apply `first`, then start watching, then apply `second`. The card is deliberately
   * never connected: the decision under test lives entirely in `setConfig`, and leaving
   * it detached keeps the assertion synchronous and free of fetch scheduling.
   */
  function reconfigure(
    first: Record<string, unknown>,
    second: Record<string, unknown>,
  ): ReturnType<typeof vi.fn> {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ entities: [{ entity: 'calendar.test' }], days_to_show: 3, ...first });

    const spy = vi.fn().mockResolvedValue(undefined);
    card.updateEvents = spy as unknown as CardUnderTest['updateEvents'];

    card.setConfig({ entities: [{ entity: 'calendar.test' }], days_to_show: 3, ...second });
    return spy;
  }

  it.each(PER_CALENDAR_OPTIONS)(
    'reprocesses without refetching when %s changes',
    (option, before, after) => {
      const spy = reconfigure(
        { entities: [{ entity: 'calendar.test', [option as string]: before }] },
        { entities: [{ entity: 'calendar.test', [option as string]: after }] },
      );

      expect(spy).toHaveBeenCalledTimes(1);
      // `false` is the whole point: the raw payload is still valid, only the decoration
      // derived from it is stale. Passing `true` here would work but would spend an API
      // call on every colour tweak in the editor.
      expect(spy).toHaveBeenCalledWith(false);
    },
  );

  it('still forces a refetch when the entity itself changes', () => {
    // The control for the branch above. If the classification collapsed back into one
    // boolean, this would start reporting `false` and the card would render whatever the
    // previous calendar's cache entry happened to hold.
    const spy = reconfigure(
      { entities: [{ entity: 'calendar.one' }] },
      { entities: [{ entity: 'calendar.two' }] },
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('does no work when only a presentational option changes', () => {
    // The control that stops the fix from degenerating into "reprocess on every
    // setConfig", which would restore correctness by throwing away the memoisation the
    // card depends on to stay cheap under card-mod.
    const spy = reconfigure({ show_location: true }, { show_location: false });

    expect(spy).not.toHaveBeenCalled();
  });

  it('does no work when an identical configuration is reapplied', () => {
    // Home Assistant calls `setConfig` again on unrelated dashboard edits.
    const spy = reconfigure(
      { entities: [{ entity: 'calendar.test', color: 'red' }] },
      { entities: [{ entity: 'calendar.test', color: 'red' }] },
    );

    expect(spy).not.toHaveBeenCalled();
  });

  it('detects a change that only reorders duplicate entries for one calendar', () => {
    // Listing the same calendar twice with different filters is a supported pattern, so
    // the comparison has to be order-sensitive: a set- or ID-based comparison would call
    // these two configurations equal and leave the wrong filter stamped on each copy.
    const spy = reconfigure(
      {
        entities: [
          { entity: 'calendar.test', allowlist: 'standup' },
          { entity: 'calendar.test', allowlist: 'retro' },
        ],
      },
      {
        entities: [
          { entity: 'calendar.test', allowlist: 'retro' },
          { entity: 'calendar.test', allowlist: 'standup' },
        ],
      },
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(false);
  });
});

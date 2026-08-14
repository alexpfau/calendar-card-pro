import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/**
 * Cache-correctness tests for `fetchEventData`.
 *
 * These pin the boundary between what is *fetched* and what is *processed*.
 * `fetchEventData` used to cache the output of `processEvents`, while
 * `getBaseCacheKey` only covered fetch inputs — entity ids, window,
 * `show_past_events`, `filter_duplicates`. Every other config key that
 * `processEvents` reads was therefore invisible to the cache, so changing one
 * returned the previous result until the entry expired.
 *
 * Two distinct defects fell out of that, and they need separate tests because
 * they had different mechanisms and could be half-fixed:
 *
 * 1. **Value staleness.** `_matchedConfig` and `_entityLabel` were baked into
 *    the cached event, so a per-entity setting edited by the user was ignored
 *    until the cache expired.
 * 2. **Reference staleness.** The cache round-trips through
 *    `JSON.stringify`/`JSON.parse`, so a cache-hit `_matchedConfig` was a fresh
 *    object that could never be `===` an element of the live `config.entities`.
 *    `applyPerEntityCompaction` identifies an entity's config block by exactly
 *    that reference check, so no cache key could have fixed this one — only
 *    re-deriving the value from the live config can.
 *
 * The fix caches the *raw* payload and reprocesses on every read. The tests
 * deliberately assert on values reachable from the public return of
 * `fetchEventData` rather than on cache internals, so they stay meaningful
 * regardless of how that is implemented.
 */

/** The one `hass` surface `fetchEvents` touches, plus a call log. */
function fakeHass(events: Types.CalendarEventData[]): {
  hass: Types.Hass;
  paths: string[];
} {
  const paths: string[] = [];
  const hass = {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async (_method: string, path: string) => {
      paths.push(path);
      return events;
    },
  } as unknown as Types.Hass;
  return { hass, paths };
}

/** A timed event owned by `entityId`, mirroring what the HA calendar API returns. */
function apiEvent(entityId: string, summary: string): Types.CalendarEventData {
  return {
    start: { dateTime: '2026-06-17T14:00:00.000Z' },
    end: { dateTime: '2026-06-17T15:00:00.000Z' },
    summary,
    _entityId: entityId,
  };
}

/**
 * An in-memory `localStorage`.
 *
 * Node ships an experimental `localStorage` global that shadows the one happy-dom
 * installs, and it lacks `clear()`. Rather than depend on which of the two wins,
 * the cache tests supply their own — it is four methods, it guarantees a clean
 * store per test, and it keeps these tests from leaking into any other file.
 */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('fetchEventData caching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('serves the second call from cache rather than refetching', async () => {
    const { hass, paths } = fakeHass([apiEvent('calendar.personal', 'Standup')]);
    const config = buildConfig({ entities: [{ entity: 'calendar.personal' }] });

    await EventUtils.fetchEventData(hass, config, 'inst');
    expect(paths).toHaveLength(1);

    await EventUtils.fetchEventData(hass, config, 'inst');
    expect(paths).toHaveLength(1);
  });

  it('reflects an edited per-entity label on a cache hit', async () => {
    const { hass, paths } = fakeHass([apiEvent('calendar.personal', 'Standup')]);

    const before = buildConfig({
      entities: [{ entity: 'calendar.personal', label: 'Old label' }],
    });
    const first = await EventUtils.fetchEventData(hass, before, 'inst');
    expect(first.events[0]._entityLabel).toBe('Old label');

    // `label` is not part of the cache key, so this is a cache hit by design.
    // The user has edited their config; the card must honour the new value.
    const after = buildConfig({
      entities: [{ entity: 'calendar.personal', label: 'New label' }],
    });
    const second = await EventUtils.fetchEventData(hass, after, 'inst');

    expect(paths).toHaveLength(1);
    expect(second.events[0]._entityLabel).toBe('New label');
  });

  it('reflects an edited per-entity setting on a cache hit', async () => {
    const { hass } = fakeHass([apiEvent('calendar.personal', 'Standup')]);

    const before = buildConfig({
      entities: [{ entity: 'calendar.personal', show_time: true }],
    });
    await EventUtils.fetchEventData(hass, before, 'inst');

    const after = buildConfig({
      entities: [{ entity: 'calendar.personal', show_time: false }],
    });
    const second = await EventUtils.fetchEventData(hass, after, 'inst');

    // Read it the way the renderer does, rather than reaching into the event.
    expect(
      EventUtils.getEntitySetting('calendar.personal', 'show_time', after, second.events[0]),
    ).toBe(false);
  });

  it('honours a per-entity split_multiday_events override on a cache hit', async () => {
    const multiDay: Types.CalendarEventData = {
      start: { date: '2026-06-17' },
      end: { date: '2026-06-20' },
      summary: 'Conference',
      _entityId: 'calendar.personal',
    };
    const { hass } = fakeHass([multiDay]);

    const split = buildConfig({
      entities: [{ entity: 'calendar.personal', split_multiday_events: true }],
    });
    const first = await EventUtils.fetchEventData(hass, split, 'inst');
    expect(first.events.length).toBeGreaterThan(1);

    const unsplit = buildConfig({
      entities: [{ entity: 'calendar.personal', split_multiday_events: false }],
    });
    const second = await EventUtils.fetchEventData(hass, unsplit, 'inst');

    expect(second.events).toHaveLength(1);
  });

  it('keeps _matchedConfig identical to the live config entity object', async () => {
    // `applyPerEntityCompaction` finds an event's config block with
    // `config.entities.findIndex((e) => e === matchedConfig)`. A JSON round trip
    // through the cache breaks that reference, silently collapsing the per-block
    // compaction key to the bare entity id.
    const { hass } = fakeHass([apiEvent('calendar.personal', 'Standup')]);
    const config = buildConfig({
      entities: [{ entity: 'calendar.personal', compact_events_to_show: 2 }],
    });

    await EventUtils.fetchEventData(hass, config, 'inst');
    const second = await EventUtils.fetchEventData(hass, config, 'inst');

    expect(config.entities).toContain(second.events[0]._matchedConfig);
  });

  it('gives each config block its own copy when an entity is listed twice', async () => {
    // `processEvents` iterates config blocks and decorates "the events for this
    // entity" — but two blocks naming the same entity select the *same* objects.
    // Decorating in place therefore let the second block overwrite the first,
    // so both copies of the event rendered with the last block's label. Copying
    // per block is what makes the "process independently" comment true, and it
    // is also what keeps the cached raw payload free of any one render's config.
    //
    // This also pins the assignment order inside that copy: the label must be
    // derived *after* `_matchedConfig` is set on the copy, because
    // `getEntityLabel` reads `_matchedConfig` first and otherwise falls back to
    // a by-id lookup that returns the first matching block for both.
    const { hass } = fakeHass([apiEvent('calendar.personal', 'Standup')]);
    const config = buildConfig({
      filter_duplicates: false,
      entities: [
        { entity: 'calendar.personal', label: 'First' },
        { entity: 'calendar.personal', label: 'Second' },
      ],
    });

    const { events } = await EventUtils.fetchEventData(hass, config, 'inst');

    expect(events.map((e) => e._entityLabel)).toEqual(['First', 'Second']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/**
 * `show_past_events` and `filter_duplicates` are render-side filters.
 *
 * `src/config/view.ts` classifies both as options that change "neither the Home
 * Assistant request nor the cache key", and that is true of the request by
 * construction: `getTimeWindow()` takes only `days_to_show`, `start_date` and the
 * resolved first weekday. Both options are instead applied inside
 * `groupEventsByDay()`, which the card calls from an unmemoized getter on every
 * render.
 *
 * The cache key and the query identity nevertheless carried `show_past_events`, and
 * `hasConfigChanged()` asked for a forced refresh for both. Toggling either one
 * therefore threw away a still-valid cache entry and spent a network round-trip —
 * plus a loading state in the card — re-fetching a byte-identical payload.
 *
 * These tests pin the request-shaping boundary from the outside, through the public
 * `fetchEventData()`, so they stay meaningful however the key is built. Each render-only
 * assertion is paired with a window-shaping control, because a test that only proves
 * "two calls collapse to one" would also pass if caching were broken into always
 * returning the first result.
 */

/** The one `hass` surface `fetchEvents` touches, plus a request log. */
function fakeHass(): { hass: Types.Hass; paths: string[] } {
  const paths: string[] = [];
  const hass = {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async (_method: string, path: string) => {
      paths.push(path);
      return [];
    },
  } as unknown as Types.Hass;
  return { hass, paths };
}

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

describe('render-only options do not reshape the calendar request', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('requests an identical window whether or not past events are shown', async () => {
    const off = fakeHass();
    await EventUtils.fetchEventData(
      off.hass,
      buildConfig({ show_past_events: false }) as Types.Config,
      'off',
      true,
    );

    const on = fakeHass();
    await EventUtils.fetchEventData(
      on.hass,
      buildConfig({ show_past_events: true }) as Types.Config,
      'on',
      true,
    );

    expect(off.paths).toHaveLength(1);
    expect(on.paths).toHaveLength(1);
    expect(off.paths[0]).toBe(on.paths[0]);
  });

  it('requests a different window when days_to_show changes', () => {
    // The control for the assertion above: identical paths there have to mean
    // "this option does not move the window", not "the log never varies".
    const shortWindow = fakeHass();
    const longWindow = fakeHass();

    return Promise.all([
      EventUtils.fetchEventData(
        shortWindow.hass,
        buildConfig({ days_to_show: 3 }) as Types.Config,
        'short',
        true,
      ),
      EventUtils.fetchEventData(
        longWindow.hass,
        buildConfig({ days_to_show: 5 }) as Types.Config,
        'long',
        true,
      ),
    ]).then(() => {
      expect(shortWindow.paths[0]).not.toBe(longWindow.paths[0]);
    });
  });

  it('serves a show_past_events toggle from cache instead of refetching', async () => {
    const { hass, paths } = fakeHass();

    await EventUtils.fetchEventData(
      hass,
      buildConfig({ show_past_events: false }) as Types.Config,
      'same',
      false,
    );
    await EventUtils.fetchEventData(
      hass,
      buildConfig({ show_past_events: true }) as Types.Config,
      'same',
      false,
    );

    expect(paths).toHaveLength(1);
  });

  it('still refetches for the same instance when days_to_show changes', async () => {
    // The control for the cache-reuse assertion: one call there has to mean "the key
    // ignores this option", not "the key ignores everything".
    const { hass, paths } = fakeHass();

    await EventUtils.fetchEventData(
      hass,
      buildConfig({ days_to_show: 3 }) as Types.Config,
      'same2',
      false,
    );
    await EventUtils.fetchEventData(
      hass,
      buildConfig({ days_to_show: 5 }) as Types.Config,
      'same2',
      false,
    );

    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
  });
});

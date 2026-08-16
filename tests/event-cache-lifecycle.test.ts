import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import * as Constants from '../src/config/constants';
import * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

/**
 * The cache layer decides how long the card is allowed to show data it already
 * has. Every branch here was free to be broken with the whole suite green: the
 * configured refresh interval could be ignored, the short retry window for an
 * empty calendar could be dropped, an expired entry could be handed back, and
 * the array returned to the caller could alias the cached one.
 */

// happy-dom's own localStorage is not usable here — its `clear()` is not a
// function, so state leaks between tests. A plain Map-backed stand-in behaves
// like the real thing for every method this code path touches.
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

function anEvent(): Types.CalendarEventData {
  return {
    summary: 'Cached event',
    start: { dateTime: '2026-06-17T09:00:00.000Z' },
    end: { dateTime: '2026-06-17T10:00:00.000Z' },
    _entityId: 'calendar.personal',
  } as unknown as Types.CalendarEventData;
}

describe('cache duration resolution', () => {
  it('honors a configured refresh_interval', () => {
    // A card set to refresh every 5 minutes that still caches for 30 would
    // refetch on schedule, hit a cache the fetch considers fresh, and keep
    // showing half-hour-old data.
    expect(EventUtils.getCacheDuration(buildConfig({ refresh_interval: 5 }))).toBe(5 * 60 * 1000);
  });

  it('falls back to the default interval when none is configured', () => {
    expect(EventUtils.getCacheDuration(undefined)).toBe(
      Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES * 60 * 1000,
    );
  });
});

describe('entry-specific TTL', () => {
  const KEY = 'ccp-ttl-test';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stores a positive TTL alongside the entry', () => {
    EventUtils.cacheEvents(KEY, [anEvent()], 15_000);
    const raw = JSON.parse(localStorage.getItem(KEY) as string);
    expect(raw.ttlMs).toBe(15_000);
  });

  it('stores no TTL when none is supplied', () => {
    EventUtils.cacheEvents(KEY, [anEvent()]);
    const raw = JSON.parse(localStorage.getItem(KEY) as string);
    expect('ttlMs' in raw).toBe(false);
  });

  it('ignores a non-positive TTL rather than storing it', () => {
    // A stored zero would be indistinguishable from "expire immediately" on the
    // read side, so it must never reach storage in the first place.
    EventUtils.cacheEvents(KEY, [anEvent()], 0);
    const raw = JSON.parse(localStorage.getItem(KEY) as string);
    expect('ttlMs' in raw).toBe(false);
  });

  it('expires an entry once its own short TTL has passed', () => {
    // This is the empty-calendar retry window. Without it, a calendar that
    // returns nothing once keeps the card empty for the full refresh interval
    // even after events appear.
    EventUtils.cacheEvents(KEY, [anEvent()], 15_000);
    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 16_000));
    expect(EventUtils.getValidCacheEntry(KEY)).toBeNull();
  });

  it('keeps the entry while its own TTL is still running', () => {
    EventUtils.cacheEvents(KEY, [anEvent()], 15_000);
    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 14_000));
    expect(EventUtils.getValidCacheEntry(KEY)).not.toBeNull();
  });

  it('treats a zero TTL found in storage as absent, not as instant expiry', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ events: [anEvent()], timestamp: Date.now(), ttlMs: 0 }),
    );
    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 60_000));
    expect(EventUtils.getValidCacheEntry(KEY)).not.toBeNull();
  });
});

describe('expiry cleanup and cache round-trip', () => {
  const KEY = 'ccp-expiry-test';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('removes an expired entry from storage instead of leaving it behind', () => {
    EventUtils.cacheEvents(KEY, [anEvent()]);
    expect(localStorage.getItem(KEY)).not.toBeNull();

    vi.setSystemTime(
      new Date(
        FROZEN_NOW.getTime() + Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES * 60 * 1000 + 1000,
      ),
    );
    expect(EventUtils.getValidCacheEntry(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('reads back the events that were written', () => {
    // Note on the spread inside getCachedEvents: it cannot be exercised by a
    // test, because getValidCacheEntry re-parses the JSON out of storage on
    // every call, so the array handed back is already private to the caller.
    // Removing the spread is therefore a no-op rather than a defect.
    EventUtils.cacheEvents(KEY, [anEvent()]);

    const read = EventUtils.getCachedEvents(KEY);
    expect(read).toHaveLength(1);
    expect(read![0].summary).toBe('Cached event');
  });
});

describe('week number majority rule', () => {
  it('gives a Sunday the ISO week of the week it visually starts', () => {
    // ISO weeks run Monday to Sunday, so a Sunday belongs to the ISO week that
    // is ending. On a calendar whose weeks start on Sunday that same day opens
    // a new row, so the number shown has to be the one the following days carry.
    const sunday = new Date(2026, 5, 14);
    expect(sunday.getDay()).toBe(0);

    const monday = new Date(2026, 5, 15);
    const config = buildConfig({ show_week_numbers: 'iso' });
    const result = EventUtils.calculateWeekNumberWithMajorityRule(sunday, config, 0);

    expect(result).toBe(FormatUtils.getISOWeekNumber(monday));
    // Without this assertion the test would pass even if the rule never fired,
    // because both weeks would have to coincide for that to happen.
    expect(result).not.toBe(FormatUtils.getISOWeekNumber(sunday));
  });

  it('leaves a Sunday alone when weeks already start on Monday', () => {
    const sunday = new Date(2026, 5, 14);
    const config = buildConfig({ show_week_numbers: 'iso' });
    expect(EventUtils.calculateWeekNumberWithMajorityRule(sunday, config, 1)).toBe(
      FormatUtils.getISOWeekNumber(sunday),
    );
  });
});

describe('manual page load detection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports a reload from the legacy navigation type', () => {
    vi.stubGlobal('performance', { navigation: { type: 1 } });
    expect(EventUtils.isManualPageLoad()).toBe(true);
  });

  it('reports a normal navigation as not a reload', () => {
    vi.stubGlobal('performance', { navigation: { type: 0 } });
    expect(EventUtils.isManualPageLoad()).toBe(false);
  });

  it('falls back to the navigation timing entry when the legacy field is gone', () => {
    vi.stubGlobal('performance', { getEntriesByType: () => [{ type: 'reload' }] });
    expect(EventUtils.isManualPageLoad()).toBe(true);
  });
});

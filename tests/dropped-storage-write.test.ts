/**
 * Storage that drops a write without saying so.
 *
 * A write the browser refuses throws, and the card then holds the entry in memory
 * (`heldEntries`). One it drops silently leaves the entry before it in storage, still
 * readable. The card confirmed a write by reading *an* entry back, so the older one passed
 * for the newer: the held copy was discarded and the newer entry was gone. A calendar that
 * had answered empty and then failed was refilled from that older entry, with events it no
 * longer has, for up to 24 hours from the load that had them.
 *
 * Falsifier: confirm the write in `writeCacheEntry` with `readCacheEntry(key) !== null`
 * again, and the dropping-storage case draws Anna's old event.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import { memoryStorage } from './memory-storage';
import * as Constants from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

function tableHass(table: Record<string, unknown[] | Error>): Types.Hass {
  return {
    states: {},
    locale: { language: 'en' },
    callApi: (_method: string, path: string) => {
      const entityId = decodeURIComponent(path.split('?')[0].replace('calendars/', ''));
      const answer = table[entityId];
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer ?? []);
    },
  } as unknown as Types.Hass;
}

function event(summary: string, hour = 15): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: `2026-06-17T${hour}:00:00Z` },
    end: { dateTime: `2026-06-17T${hour + 1}:00:00Z` },
  } as Types.CalendarEventData;
}

const TWO = buildConfig({
  entities: [{ entity: 'calendar.anna' }, { entity: 'calendar.ben' }],
  days_to_show: 3,
});

const summaries = (events: Types.CalendarEventData[]): string[] =>
  events.map((e) => e.summary ?? '').sort();

/** Keeps every write until `drop()`, then accepts each one without storing it. */
function droppingStorage(): Storage & { drop(): void } {
  const storage = memoryStorage();
  const setItem = storage.setItem.bind(storage);
  let dropping = false;
  return Object.assign(storage, {
    setItem: (key: string, value: string) => (dropping ? undefined : setItem(key, value)),
    drop: () => {
      dropping = true;
    },
  });
}

/** Keeps every write until `drop()`, then refuses each one, as full storage does. */
function refusingStorage(): Storage & { drop(): void } {
  const storage = memoryStorage();
  const setItem = storage.setItem.bind(storage);
  let refusing = false;
  return Object.assign(storage, {
    setItem: (key: string, value: string) => {
      if (refusing) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      setItem(key, value);
    },
    drop: () => {
      refusing = true;
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  EventUtils.clearPageStore();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  EventUtils.clearPageStore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Anna has an event, then answers empty, then fails; Ben answers every time. Storage stops
 * keeping writes after the first load.
 *
 * @returns What is drawn after Anna fails
 */
async function emptyThenFailing(storage: Storage & { drop(): void }): Promise<string[]> {
  vi.stubGlobal('localStorage', storage);

  await EventUtils.fetchEventData(
    tableHass({ 'calendar.anna': [event('Anna')], 'calendar.ben': [event('Ben')] }),
    TWO,
    'dropped',
    'network',
  );
  storage.drop();

  vi.advanceTimersByTime(60 * 60 * 1000);
  const empty = await EventUtils.fetchEventData(
    tableHass({ 'calendar.anna': [], 'calendar.ben': [event('Ben')] }),
    TWO,
    'dropped',
    'network',
  );
  expect(summaries(empty.events)).toEqual(['Ben']);

  vi.advanceTimersByTime(60 * 60 * 1000);
  const failing = await EventUtils.fetchEventData(
    tableHass({ 'calendar.anna': new Error('500'), 'calendar.ben': [event('Ben')] }),
    TWO,
    'dropped',
    'network',
  );
  expect(failing.failedEntities).toEqual(['calendar.anna']);
  return summaries(failing.events);
}

describe('a calendar that answered empty and then failed', () => {
  it('stays empty when storage keeps every write', async () => {
    const storage = Object.assign(memoryStorage(), { drop: () => {} });
    expect(await emptyThenFailing(storage)).toEqual(['Ben']);
  });

  it('stays empty when storage refuses the write', async () => {
    expect(await emptyThenFailing(refusingStorage())).toEqual(['Ben']);
  });

  it('stays empty when storage drops the write without saying so', async () => {
    expect(await emptyThenFailing(droppingStorage())).toEqual(['Ben']);
  });

  it('still reads the newer entry back on the next visit', async () => {
    const storage = droppingStorage();
    await emptyThenFailing(storage);

    const hass = tableHass({});
    const snapshot = EventUtils.readEventSnapshot(hass, TWO, 'dropped');
    expect({
      events: summaries(snapshot?.events ?? []),
      failed: snapshot?.failedEntities,
    }).toEqual({ events: ['Ben'], failed: ['calendar.anna'] });
  });
});

describe('the scenario', () => {
  // Anna's first load is two hours old when she fails; past the stale bound nothing would be
  // kept whatever storage did, and every case above would pass without proving anything.
  it('runs inside the bound a failing calendar keeps its events for', () => {
    expect(Constants.CACHE.MAX_STALE_HOURS).toBeGreaterThan(2);
  });
});

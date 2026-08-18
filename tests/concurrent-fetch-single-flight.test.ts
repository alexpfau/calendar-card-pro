/**
 * Concurrent requests for the same calendars and window must share one API round-trip.
 *
 * Three independent paths start the first load: `setConfig()`, `connectedCallback()`,
 * and the `updated()` arm that fires when `hass` first becomes available. Home Assistant
 * assigns both `hass` and the config before it appends the card, so all three run, and
 * all three run before any of them has written the cache. Each therefore missed and
 * issued its own request: one configured calendar, three round-trips, multiplied by
 * every calendar card on the dashboard.
 *
 * The visual editor's live previews are the second consumer. Both suggestion previews
 * are deliberately built to share one cache key so that mounting them together is
 * affordable, but a shared key only helps once an entry exists — mounted simultaneously,
 * neither could see the other's request.
 *
 * Deduplication belongs at the raw fetch rather than at the callers, because the callers
 * are legitimately independent: two cards, or a card and a preview, can want the same
 * window at the same moment with different display options. The raw payload is shared;
 * each caller still processes it against its own live config.
 *
 * The controls below cover the two orderings that already worked — a sequential second
 * call served from the cache, and a config assigned after connection — so a regression
 * that simply stopped fetching could not pass this file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import '../src/calendar-card-pro';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  hass: Types.Hass;
}

/** happy-dom's `localStorage` has no usable `clear()`, so the cache needs its own. */
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

function countingHass(counter: { n: number }): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: (_method: string, path: string) => {
      if (path.startsWith('calendars/')) counter.n += 1;
      return Promise.resolve([]);
    },
  } as unknown as Types.Hass;
}

describe('concurrent event fetches share one API round-trip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('fetches once when hass and config are both assigned before connection', async () => {
    const counter = { n: 0 };
    const card = document.createElement('calendar-card-pro-dev') as CardUnderTest;

    // The order Home Assistant itself uses: configure and hand over `hass`, then append.
    card.hass = countingHass(counter);
    card.setConfig({ entities: [{ entity: 'calendar.one' }], days_to_show: 3 });
    document.body.appendChild(card);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect({ configuredCalendars: 1, apiRequests: counter.n }).toEqual({
      configuredCalendars: 1,
      apiRequests: 1,
    });
  });

  it('control: fetches once when the config arrives after connection', async () => {
    const counter = { n: 0 };
    const card = document.createElement('calendar-card-pro-dev') as CardUnderTest;

    document.body.appendChild(card);
    card.hass = countingHass(counter);
    await vi.advanceTimersByTimeAsync(0);
    card.setConfig({ entities: [{ entity: 'calendar.one' }], days_to_show: 3 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect({ configuredCalendars: 1, apiRequests: counter.n }).toEqual({
      configuredCalendars: 1,
      apiRequests: 1,
    });
  });

  it('coalesces two simultaneous fetches that share a cache key', async () => {
    const counter = { n: 0 };
    const hass = countingHass(counter);
    const config = buildConfig({ entities: [{ entity: 'calendar.one' }], days_to_show: 3 });

    // Two live previews mounted together: one key, neither able to see the other's
    // request because neither has written the cache yet.
    const [first, second] = await Promise.all([
      EventUtils.fetchEventData(hass, config, 'shared-key'),
      EventUtils.fetchEventData(hass, config, 'shared-key'),
    ]);

    expect({
      apiRequests: counter.n,
      firstFailed: first.failedEntities.length,
      secondFailed: second.failedEntities.length,
    }).toEqual({ apiRequests: 1, firstFailed: 0, secondFailed: 0 });
  });

  it('control: serves the second sequential fetch from the cache', async () => {
    const counter = { n: 0 };
    const hass = countingHass(counter);
    const config = buildConfig({ entities: [{ entity: 'calendar.one' }], days_to_show: 3 });

    await EventUtils.fetchEventData(hass, config, 'sequential-key');
    await EventUtils.fetchEventData(hass, config, 'sequential-key');

    expect({ apiRequests: counter.n }).toEqual({ apiRequests: 1 });
  });
});

/**
 * A successful load must disarm the no-`hass` retry.
 *
 * `connectedCallback()` starts a load unconditionally. When Home Assistant attaches the
 * card before it assigns `hass` — which is the ordering on a slow first paint — that
 * load finds no `hass` and arms a 1.5-second retry. The retry is only ever cancelled
 * from inside that same no-`hass` branch, so once `hass` arrives and the real load
 * succeeds, the timer is still pending.
 *
 * It then fires with `force = true`, which deliberately bypasses the cache, so it is not
 * absorbed by any of the usual deduplication: it is a second, full round-trip to Home
 * Assistant 1.5 seconds after the card has already rendered, on every affected load.
 *
 * The control disconnects before the deadline. It has to keep passing, because the
 * cheapest wrong fix — never arming the retry at all — would break the case the retry
 * exists for, and the cheapest wrong test would pass simply because nothing ever fired.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import '../src/calendar-card-pro';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  updateEvents(force?: boolean): Promise<void>;
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

/** Attach with neither config nor `hass`, so the first load arms the retry. */
async function connectWithoutHass(): Promise<{ card: CardUnderTest; retries: () => number }> {
  const card = document.createElement('calendar-card-pro-dev') as CardUnderTest;
  const original = card.updateEvents.bind(card);
  let retryCalls = 0;
  card.updateEvents = (force?: boolean) => {
    // The retry is the only site that calls `updateEvents` from a timer callback.
    if (force === true && armed) retryCalls += 1;
    return original(force);
  };
  let armed = false;
  document.body.appendChild(card);
  await vi.advanceTimersByTimeAsync(0);
  armed = true;
  return { card, retries: () => retryCalls };
}

describe('the no-hass retry is disarmed by a successful load', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('control: the harness can observe the retry firing', async () => {
    const { retries } = await connectWithoutHass();

    const before = retries();
    await vi.advanceTimersByTimeAsync(2000);

    expect({ before, after: retries() }).toEqual({ before: 0, after: 1 });
  });

  it('control: disconnecting before the deadline cancels the retry', async () => {
    const { card, retries } = await connectWithoutHass();

    card.remove();
    await vi.advanceTimersByTimeAsync(2000);

    expect({ after: retries() }).toEqual({ after: 0 });
  });

  it('does not refetch at the retry deadline once hass has arrived', async () => {
    const counter = { n: 0 };
    const { card } = await connectWithoutHass();

    card.setConfig({ entities: [{ entity: 'calendar.one' }], days_to_show: 3 });
    card.hass = countingHass(counter);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    const beforeDeadline = counter.n;

    await vi.advanceTimersByTimeAsync(2000);

    expect({ beforeDeadline, afterDeadline: counter.n }).toEqual({
      beforeDeadline,
      afterDeadline: beforeDeadline,
    });
  });
});

/**
 * A slow event response must not overwrite a newer configuration.
 *
 * `updateEvents()` reads `this._instanceId` twice: once when it calls `fetchEventData`,
 * and again — after the await — when it commits the result. Between those two reads the
 * user can reconfigure the card. `setConfig()` regenerates `_instanceId` from the entity
 * list and immediately calls `updateEvents(true)`, so two requests can be in flight at
 * once, and nothing records which identity each of them started under.
 *
 * If the older request settles last it wins twice over: it replaces `events` with the
 * previous calendar's payload, and it stamps `_eventsInstanceId` with the *current*
 * identity. That second half is what makes the state unrecoverable rather than merely
 * stale — `eventsMatchCurrentQuery` now reports true, so the card believes the old
 * calendar's events belong to the new query and no later refresh treats them as suspect.
 *
 * The ordering is not exotic. Home Assistant calls `setConfig` on every keystroke in the
 * visual editor, and the two requests go to different calendars, so their latencies are
 * unrelated. Whenever the first calendar is the slower of the two, the card renders the
 * calendar the user just navigated away from.
 *
 * The control below fixes the resolution order the other way round. It has to keep
 * passing: "the newest configuration wins" must mean the card tracks request identity,
 * not that the last-issued request happens to be the last to settle.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import type * as Types from '../src/config/types';
import '../src/calendar-card-pro';

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  updateEvents(force?: boolean): Promise<void>;
  hass: Types.Hass;
  events: Types.CalendarEventData[];
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

interface Pending {
  path: string;
  resolve: (value: unknown) => void;
}

/** A `hass` whose calendar requests hang until the test settles them by entity ID. */
function deferredHass(): { hass: Types.Hass; pending: Pending[] } {
  const pending: Pending[] = [];
  const hass = {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: (_method: string, path: string) =>
      new Promise((resolve) => {
        pending.push({ path, resolve });
      }),
  } as unknown as Types.Hass;
  return { hass, pending };
}

function event(summary: string): unknown {
  return {
    summary,
    start: { dateTime: '2026-06-17T14:00:00.000Z' },
    end: { dateTime: '2026-06-17T15:00:00.000Z' },
  };
}

describe('a slow response must not overwrite a newer configuration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });

  /** Let every pending microtask and Lit update cycle run to completion. */
  const flush = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
  };

  /** Settle the in-flight request for `entityId`, failing loudly if there is none. */
  function settle(pending: Pending[], entityId: string, summary: string): void {
    const index = pending.findIndex((p) => p.path.includes(entityId));
    expect(index, `no in-flight request for ${entityId}`).toBeGreaterThanOrEqual(0);
    const [request] = pending.splice(index, 1);
    request.resolve([event(summary)]);
  }

  /**
   * Drive both requests, settling them in the order named. Returns the summaries the
   * card is left holding.
   */
  async function race(order: readonly ['old', 'new'] | readonly ['new', 'old']) {
    const { hass, pending } = deferredHass();
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.hass = hass;

    card.setConfig({ entities: [{ entity: 'calendar.old' }], days_to_show: 3 });
    // `updateEvents` awaits `updateComplete`, which a detached element never resolves,
    // so the card has to be connected for either request to leave the gate at all.
    document.body.appendChild(card);
    await flush();

    card.setConfig({ entities: [{ entity: 'calendar.new' }], days_to_show: 3 });
    await flush();

    for (const which of order) {
      settle(
        pending,
        which === 'old' ? 'calendar.old' : 'calendar.new',
        which === 'old' ? 'Older response' : 'Newer response',
      );
      await flush();
    }

    return card.events.map((e) => e.summary);
  }

  it('keeps the newer response when the older one settles last', async () => {
    expect(await race(['new', 'old'])).toEqual(['Newer response']);
  });

  it('keeps the newer response when it settles last', async () => {
    // The control. This ordering is correct even without request tracking, so if the
    // assertion above ever starts passing while this one fails, the fix has inverted the
    // problem rather than solved it.
    expect(await race(['old', 'new'])).toEqual(['Newer response']);
  });
});

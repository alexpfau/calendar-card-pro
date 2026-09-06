/**
 * The weather forecast subscription lifecycle — debounce, generation ticket and teardown.
 *
 * A mutation sweep over `_scheduleWeatherSetup()`, `_setupWeatherSubscriptions()` and
 * `_cleanupWeatherSubscriptions()` broke 15 of 15 behaviours with the entire suite green.
 * The reason nothing caught them is that every existing weather test builds a `hass`
 * without a `connection`, and `subscribeToWeatherForecast()` returns early when there is
 * no connection. So the subscribe path — and everything downstream of it — never ran.
 *
 * These tests supply a real fake `connection.subscribeMessage` instead of mocking the
 * weather module, so the production subscribe helper executes for real and the
 * subscriptions, their unsubscribe callbacks and their emitted forecasts are all
 * observable. A gate promise lets a subscription be held open mid-await, which is the
 * only way to reach the two staleness guards.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '../src/calendar-card-pro';
import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';

interface SubRecord {
  forecastType: string;
  entityId: string;
  emit: (forecast: Array<Record<string, unknown>>) => void;
  unsubscribed: number;
}

interface CardElement extends HTMLElement {
  hass: Types.Hass;
  isInitialLoad: boolean;
  weatherForecasts: Types.WeatherForecasts;
  updateComplete: Promise<boolean>;
  setConfig(config: Types.Config): void;
  _scheduleWeatherSetup(): void;
  _weatherUnsubscribers: Array<() => void>;
  _cleanupWeatherSubscriptions(): void;
}

/** Resolve pending microtasks *and* the macrotask queue, so `queueMicrotask` has run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A fake Home Assistant websocket connection that records every forecast subscription.
 *
 * `gate` holds `subscribeMessage` open so a second setup can start while the first is
 * still awaiting — the interleaving the generation ticket exists to survive.
 */
function makeConnection() {
  const subs: SubRecord[] = [];
  let gate: Promise<void> | null = null;
  let openGate: (() => void) | null = null;

  return {
    subs,
    hold() {
      gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
    },
    release() {
      openGate?.();
      gate = null;
      openGate = null;
    },
    connection: {
      async subscribeMessage(
        callback: (message: { forecast: Array<Record<string, unknown>> }) => void,
        payload: { forecast_type: string; entity_id: string },
      ) {
        if (gate) await gate;
        const record: SubRecord = {
          forecastType: payload.forecast_type,
          entityId: payload.entity_id,
          emit: (forecast) => callback({ forecast }),
          unsubscribed: 0,
        };
        subs.push(record);
        return () => {
          record.unsubscribed += 1;
        };
      },
    },
  };
}

type Conn = ReturnType<typeof makeConnection>;

function makeHass(conn: Conn): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async () => [],
    connection: conn.connection,
  } as unknown as Types.Hass;
}

async function mount(weather: Record<string, unknown>): Promise<{ card: CardElement; conn: Conn }> {
  const conn = makeConnection();
  const card = document.createElement('calendar-card-pro-dev') as unknown as CardElement;
  card.setConfig(buildConfig({ weather }) as Types.Config);
  card.hass = makeHass(conn);
  card.isInitialLoad = false;
  document.body.appendChild(card);
  await card.updateComplete;
  await flush();
  return { card, conn };
}

describe('weather subscriptions: setup debouncing', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collapses several schedule calls in one microtask into a single setup', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });
    expect(conn.subs.length).toBe(1);

    card._scheduleWeatherSetup();
    card._scheduleWeatherSetup();
    card._scheduleWeatherSetup();
    await flush();

    // One further setup, not three. Each setup tears the previous one down first, so an
    // undebounced burst would open — and immediately close — a subscription per call.
    expect(conn.subs.length).toBe(2);
  });

  it('accepts a further setup after the debounce window has closed', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });

    card._scheduleWeatherSetup();
    await flush();
    card._scheduleWeatherSetup();
    await flush();

    // The positive control for the debounce: the pending flag must be cleared when the
    // microtask runs, or the very first setup would latch it and block every later one.
    expect(conn.subs.length).toBe(3);
  });

  it('does not set up subscriptions for a card that has been removed', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });
    const before = conn.subs.length;

    card.remove();
    card._scheduleWeatherSetup();
    await flush();

    expect(conn.subs.length).toBe(before);
  });
});

describe('weather subscriptions: registry and teardown', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('registers each subscription so it can be torn down later', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'both' });

    // 'both' needs daily and hourly, so the loop runs twice and both must be registered.
    expect(conn.subs.map((s) => s.forecastType)).toEqual(['daily', 'hourly']);
    expect(card._weatherUnsubscribers.length).toBe(2);
  });

  it('tears the previous subscriptions down before opening new ones', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });
    const first = conn.subs[0];

    card._scheduleWeatherSetup();
    await flush();

    expect(first.unsubscribed).toBe(1);
    // Without the teardown the registry would accumulate one entry per setup, and the
    // old websocket subscription would keep streaming forever.
    expect(card._weatherUnsubscribers.length).toBe(1);
  });

  it('unsubscribes every registered subscription when the card is disconnected', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'both' });

    card.remove();

    expect(conn.subs.map((s) => s.unsubscribed)).toEqual([1, 1]);
  });

  it('subscribes again when a disconnected card is reconnected', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });
    const first = conn.subs[0];

    card.remove();
    expect(first.unsubscribed).toBe(1);
    expect(card._weatherUnsubscribers).toHaveLength(0);

    document.body.appendChild(card);
    await card.updateComplete;
    await flush();

    expect(conn.subs).toHaveLength(2);
    expect(conn.subs[1].unsubscribed).toBe(0);
    expect(card._weatherUnsubscribers).toHaveLength(1);
  });

  it('does not unsubscribe the same subscription twice', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });

    card._cleanupWeatherSubscriptions();
    card._cleanupWeatherSubscriptions();

    // The registry has to be emptied after a teardown; calling a Home Assistant
    // unsubscribe callback a second time is an error on the websocket connection.
    expect(conn.subs[0].unsubscribed).toBe(1);
    expect(card._weatherUnsubscribers.length).toBe(0);
  });

  it('opens no subscription at all when the position renders no forecast', async () => {
    const { conn } = await mount({ entity: 'weather.home', position: 'none' });

    // The negative control for the registry tests: proves a zero count is reachable and
    // that the counts above are produced by the configuration, not by the harness.
    expect(conn.subs.length).toBe(0);
  });
});

describe('weather subscriptions: staleness guards', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('discards a subscription that resolves after a newer setup has started', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });
    conn.subs.length = 0;

    conn.hold();
    card._scheduleWeatherSetup();
    await flush();
    // A second setup begins while the first is still awaiting its subscription.
    card._scheduleWeatherSetup();
    await flush();
    conn.release();
    await flush();
    await flush();

    // Both subscriptions were opened on the wire, but the superseded one must be
    // unsubscribed immediately and never registered — otherwise it streams forever.
    expect(conn.subs.length).toBe(2);
    expect(conn.subs[0].unsubscribed).toBe(1);
    expect(card._weatherUnsubscribers.length).toBe(1);
  });

  it('stops mid-loop when a newer setup has started', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'both' });
    conn.subs.length = 0;

    conn.hold();
    card._scheduleWeatherSetup();
    await flush();
    card._scheduleWeatherSetup();
    await flush();
    conn.release();
    await flush();
    await flush();

    // The superseded setup is abandoned after its first subscription resolves rather
    // than continuing to the second forecast type, so it opens 1 of its 2 subscriptions.
    expect(conn.subs.filter((s) => s.unsubscribed === 1).length).toBe(1);
    expect(card._weatherUnsubscribers.length).toBe(2);
  });

  it('keeps a subscription that resolves with no newer setup pending', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });
    conn.subs.length = 0;

    conn.hold();
    card._scheduleWeatherSetup();
    await flush();
    conn.release();
    await flush();

    // The positive control for both staleness tests: a slow subscription that is *not*
    // superseded must survive, or the guards would simply discard everything.
    expect(conn.subs.length).toBe(1);
    expect(conn.subs[0].unsubscribed).toBe(0);
    expect(card._weatherUnsubscribers.length).toBe(1);
  });
});

describe('weather subscriptions: forecast delivery', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps both forecast types when each arrives separately', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'both' });
    const daily = conn.subs.find((s) => s.forecastType === 'daily');
    const hourly = conn.subs.find((s) => s.forecastType === 'hourly');

    daily?.emit([{ datetime: '2026-06-17T00:00:00.000Z', condition: 'sunny', temperature: 21 }]);
    await card.updateComplete;
    hourly?.emit([{ datetime: '2026-06-17T12:00:00.000Z', condition: 'rainy', temperature: 14 }]);
    await card.updateComplete;

    // The two subscriptions emit independently. Replacing the whole map rather than
    // merging into it would make whichever forecast arrives second erase the first, so
    // a card showing weather on both the day header and its events loses one of them.
    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(card.weatherForecasts.hourly ?? {}).length).toBeGreaterThan(0);
  });

  it('redraws the card when a forecast arrives', async () => {
    const { card, conn } = await mount({ entity: 'weather.home', position: 'date' });
    await card.updateComplete;

    // Count real render passes. Watching `updateComplete` resolve does not work here:
    // it is already settled at this point, so its callback would run whether or not the
    // forecast caused an update, and the assertion would pass vacuously.
    let renders = 0;
    const host = card as unknown as { render: () => unknown };
    const original = host.render.bind(card);
    host.render = () => {
      renders += 1;
      return original();
    };

    conn.subs[0].emit([
      { datetime: '2026-06-17T00:00:00.000Z', condition: 'sunny', temperature: 21 },
    ]);
    await card.updateComplete;
    await flush();

    // A forecast that arrives without a re-render sits in memory and never reaches the
    // screen until something unrelated happens to redraw the card. Two mechanisms carry
    // this — assigning a fresh object, which Lit sees as a change, and the explicit
    // `requestUpdate()` — so each masks the other and only breaking both stops the redraw.
    expect(renders).toBeGreaterThan(0);
  });
});

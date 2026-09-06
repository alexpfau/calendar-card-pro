/**
 * A forecast emission from a torn-down subscription must not rewrite `weatherForecasts`.
 *
 * Setup bumps `_weatherSetupVersion` and unsubscribes the previous stream, but the
 * callback closed over the old subscription had no ticket of its own. The fake
 * connection here still delivers after "unsubscribe" — the same race a late
 * websocket message can hit after the client asked to leave the stream. Combined
 * with the entity-switch blank, that puts the previous entity's forecast back on
 * screen under the new configuration until something else redraws.
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
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeConnection() {
  const subs: SubRecord[] = [];
  return {
    subs,
    connection: {
      async subscribeMessage(
        callback: (message: { forecast: Array<Record<string, unknown>> }) => void,
        payload: { forecast_type: string; entity_id: string },
      ) {
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

describe('weather stale callback after supersession', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not restore the previous entity forecast after an entity switch blank', async () => {
    const conn = makeConnection();
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardElement;
    card.setConfig(
      buildConfig({ weather: { entity: 'weather.home', position: 'date' } }) as Types.Config,
    );
    card.hass = makeHass(conn);
    card.isInitialLoad = false;
    document.body.appendChild(card);
    await card.updateComplete;
    await flush();

    const homeSub = conn.subs.find((s) => s.entityId === 'weather.home');
    expect(homeSub).toBeDefined();

    homeSub!.emit([{ datetime: '2026-06-17T00:00:00.000Z', condition: 'sunny', temperature: 21 }]);
    await card.updateComplete;
    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBeGreaterThan(0);

    card.setConfig(
      buildConfig({ weather: { entity: 'weather.cabin', position: 'date' } }) as Types.Config,
    );
    await card.updateComplete;
    await flush();

    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBe(0);
    expect(homeSub!.unsubscribed).toBe(1);

    // Late delivery from the torn-down home subscription.
    homeSub!.emit([{ datetime: '2026-06-17T00:00:00.000Z', condition: 'sunny', temperature: 21 }]);
    await card.updateComplete;

    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBe(0);
  });

  it('control: the live subscription still updates forecasts', async () => {
    const conn = makeConnection();
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardElement;
    card.setConfig(
      buildConfig({ weather: { entity: 'weather.home', position: 'date' } }) as Types.Config,
    );
    card.hass = makeHass(conn);
    card.isInitialLoad = false;
    document.body.appendChild(card);
    await card.updateComplete;
    await flush();

    const live = conn.subs[conn.subs.length - 1];
    live.emit([{ datetime: '2026-06-17T00:00:00.000Z', condition: 'cloudy', temperature: 18 }]);
    await card.updateComplete;

    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBeGreaterThan(0);
  });
});

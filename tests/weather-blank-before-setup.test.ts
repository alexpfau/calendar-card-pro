/**
 * Entity-switch blanks forecasts immediately, but setup only runs on a microtask
 * (and can lag further while a previous subscribe await is open). Without bumping
 * `_weatherSetupVersion` and tearing down the old stream at the blank, a late
 * emit still carries the previous ticket and rewrites the old entity's forecast
 * under the new configuration — the same race the post-setup callback guard
 * cannot see, because setup has not advanced the ticket yet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  _setupWeatherSubscriptions(): Promise<void>;
  _weatherSetupVersion: number;
}

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

const SAMPLE = [{ datetime: '2026-06-17T00:00:00.000Z', condition: 'sunny', temperature: 21 }];

describe('weather blank before setup version bump', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the entity-switch blank when a late emit arrives before the next setup', async () => {
    const conn = makeConnection();
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardElement;
    card.setConfig(
      buildConfig({ weather: { entity: 'weather.home', position: 'date' } }) as Types.Config,
    );
    card.hass = makeHass(conn);
    card.isInitialLoad = false;
    document.body.appendChild(card);
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const homeSub = conn.subs.find((s) => s.entityId === 'weather.home');
    expect(homeSub).toBeDefined();
    homeSub!.emit(SAMPLE);
    await card.updateComplete;
    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBeGreaterThan(0);

    const versionAtHome = card._weatherSetupVersion;
    // Hold the next setup so the blank is exposed without that path advancing the ticket.
    const setupSpy = vi
      .spyOn(card, '_setupWeatherSubscriptions')
      .mockImplementation(async () => undefined);

    card.setConfig(
      buildConfig({ weather: { entity: 'weather.cabin', position: 'date' } }) as Types.Config,
    );
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    expect(setupSpy).toHaveBeenCalled();
    // Entity-switch blank must have moved the ticket even though setup was held.
    expect(card._weatherSetupVersion).toBeGreaterThan(versionAtHome);
    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBe(0);
    expect(homeSub!.unsubscribed).toBeGreaterThanOrEqual(1);

    homeSub!.emit(SAMPLE);
    await card.updateComplete;

    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBe(0);
    setupSpy.mockRestore();
  });

  it('control: same-entity weather edits still keep the live forecast path', async () => {
    const conn = makeConnection();
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardElement;
    card.setConfig(
      buildConfig({ weather: { entity: 'weather.home', position: 'date' } }) as Types.Config,
    );
    card.hass = makeHass(conn);
    card.isInitialLoad = false;
    document.body.appendChild(card);
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    const live = conn.subs[conn.subs.length - 1];
    live.emit(SAMPLE);
    await card.updateComplete;
    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBeGreaterThan(0);

    card.setConfig(
      buildConfig({ weather: { entity: 'weather.home', position: 'event' } }) as Types.Config,
    );
    await card.updateComplete;
    await new Promise((r) => setTimeout(r, 0));

    // Position-only edit must not blank; live stream may still update after re-setup.
    expect(Object.keys(card.weatherForecasts.daily ?? {}).length).toBeGreaterThan(0);
  });
});

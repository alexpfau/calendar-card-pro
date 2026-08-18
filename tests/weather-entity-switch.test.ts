/**
 * Switching the weather entity must not leave the previous entity's forecast on screen.
 *
 * `_setupWeatherSubscriptions()` tears down the old subscriptions and starts new ones, but
 * `weatherForecasts` — the rendered data — was left exactly as the old entity had filled
 * it. Between the switch and the first emission from the replacement subscription, the
 * card kept drawing the old entity's forecast under the new configuration. If the new
 * entity never emits a forecast of that type at all, the stale data simply stays.
 *
 * The control is a same-entity edit. Clearing on any weather config change would be the
 * easy over-correction, and it would make an unrelated tweak — moving the badge, say —
 * blank the forecast and redraw it, which is a visible flicker for no reason.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '../src/calendar-card-pro';
import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';

const FORECAST = {
  daily: { '2026-06-17': { condition: 'sunny', temperature: 21 } },
  hourly: { '2026-06-17T12:00': { condition: 'rainy', temperature: 14 } },
} as unknown as Types.WeatherForecasts;

interface CardElement extends HTMLElement {
  hass: Types.Hass;
  setConfig(config: Types.Config): void;
  weatherForecasts: Types.WeatherForecasts;
  updateComplete: Promise<boolean>;
}

function makeHass(): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async () => [],
  } as unknown as Types.Hass;
}

async function mountWith(entity: string): Promise<CardElement> {
  const card = document.createElement('calendar-card-pro-dev') as CardElement;
  card.setConfig(buildConfig({ weather: { entity, position: 'date' } }) as Types.Config);
  card.hass = makeHass();
  document.body.appendChild(card);
  await card.updateComplete;

  card.weatherForecasts = FORECAST;
  await card.updateComplete;

  return card;
}

describe('weather entity switch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('control: an unrelated weather edit on the same entity keeps the forecast', async () => {
    const card = await mountWith('weather.home');

    card.setConfig(
      buildConfig({ weather: { entity: 'weather.home', position: 'event' } }) as Types.Config,
    );
    await card.updateComplete;

    expect({
      daily: Object.keys(card.weatherForecasts.daily ?? {}).length,
      hourly: Object.keys(card.weatherForecasts.hourly ?? {}).length,
    }).toEqual({ daily: 1, hourly: 1 });
  });

  it('drops the previous entity forecast when the weather entity changes', async () => {
    const card = await mountWith('weather.home');

    card.setConfig(
      buildConfig({ weather: { entity: 'weather.cabin', position: 'date' } }) as Types.Config,
    );
    await card.updateComplete;

    expect({
      daily: Object.keys(card.weatherForecasts.daily ?? {}).length,
      hourly: Object.keys(card.weatherForecasts.hourly ?? {}).length,
    }).toEqual({ daily: 0, hourly: 0 });
  });
});

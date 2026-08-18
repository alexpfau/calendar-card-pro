/**
 * Night variants of the forecast icons.
 *
 * `getWeatherIcon` swaps three conditions for a night-appropriate icon between
 * 18:00 and 06:00, because the daytime icon for them is actively wrong after
 * dark — `sunny` draws a sun, and an hourly forecast row at 22:00 showing a sun
 * is the kind of thing a user reports as a bug.
 *
 * The table had no coverage: each of its three entries could be deleted with
 * every gate green, and the failure is silent rather than loud — the lookup
 * falls back to `CONDITION_ICON_MAP` and simply draws the day icon at night.
 *
 * The daytime and non-night-mapped cases are the controls. They prove the swap
 * is conditional on the hour and on the specific condition, so a night
 * assertion passing means the night branch ran rather than the whole table
 * having been replaced by one icon.
 */

import { describe, expect, it } from 'vitest';

import * as Types from '../src/config/types';
import * as WeatherUtils from '../src/utils/weather';

/** The three conditions whose daytime icon is wrong after dark. */
const NIGHT_SWAPPED: ReadonlyArray<readonly [string, string]> = [
  ['sunny', 'mdi:weather-night'],
  ['partlycloudy', 'mdi:weather-night-partly-cloudy'],
  ['lightning-rainy', 'mdi:weather-lightning'],
];

/**
 * Drive one hourly forecast entry through the real subscription path and return
 * the icon the card would render for it.
 *
 * @param condition - Home Assistant condition code
 * @param hour - Local hour of the forecast entry
 * @returns The resolved MDI icon name
 */
async function iconFor(condition: string, hour: number): Promise<string | undefined> {
  let handler: ((message: { forecast: Array<Types.WeatherForecast> }) => void) | undefined;

  const hass = {
    connection: {
      subscribeMessage: async (
        callback: (message: { forecast: Array<Types.WeatherForecast> }) => void,
      ) => {
        handler = callback;
        return () => undefined;
      },
    },
  } as unknown as Types.Hass;

  const config = { weather: { entity: 'weather.home' } } as unknown as Types.Config;

  let received: Record<string, Types.WeatherData> = {};
  await WeatherUtils.subscribeToWeatherForecast(hass, config, 'hourly', (forecasts) => {
    received = forecasts;
  });

  handler?.({
    forecast: [
      {
        datetime: new Date(2025, 0, 8, hour, 0, 0).toISOString(),
        condition,
        temperature: 10,
      } as Types.WeatherForecast,
    ],
  });

  return Object.values(received)[0]?.icon;
}

describe('night forecast icons', () => {
  it.each(NIGHT_SWAPPED)('draws %s with its night icon after dark', async (condition, icon) => {
    expect(await iconFor(condition, 22)).toBe(icon);
  });

  it.each(NIGHT_SWAPPED)('draws %s with its daytime icon by day', async (condition) => {
    expect(await iconFor(condition, 12)).toBe(WeatherUtils.CONDITION_ICON_MAP[condition]);
  });

  it.each(NIGHT_SWAPPED)('changes the icon %s is drawn with after dark', async (condition) => {
    expect(await iconFor(condition, 22)).not.toBe(await iconFor(condition, 12));
  });

  it('leaves a condition without a night variant alone after dark', async () => {
    expect(await iconFor('rainy', 22)).toBe(WeatherUtils.CONDITION_ICON_MAP.rainy);
  });

  it('treats the early morning as night too', async () => {
    expect(await iconFor('sunny', 3)).toBe('mdi:weather-night');
  });

  it('treats the hour the sun is still up as day', async () => {
    expect(await iconFor('sunny', 17)).toBe(WeatherUtils.CONDITION_ICON_MAP.sunny);
  });
});

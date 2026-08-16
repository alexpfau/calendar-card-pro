/**
 * Hourly forecast keys are built from the local hour.
 *
 * `processForecastData` keys each hourly entry `YYYY-MM-DD_H`, and
 * `findForecastForEvent` looks it up with the event's local hour. Both sides
 * have to agree on which clock they read, and the whole unit suite runs pinned
 * to UTC, where `getHours` and `getUTCHours` are the same function. Swapping one
 * for the other survived every UTC assertion.
 *
 * Under a real zone the two differ by the offset, so every hourly lookup would
 * miss its exact match and quietly settle for whichever neighbouring hour the
 * nearest-hour walk happened to land on — a forecast for the wrong time of day
 * rendered with no error.
 *
 * The date half of the key is asserted alongside the hour as the control: it is
 * local in both implementations, so a passing date with a failing hour proves
 * the entry was processed rather than dropped.
 */

import { describe, expect, it } from 'vitest';

import * as Types from '../src/config/types';
import * as WeatherUtils from '../src/utils/weather';

describe(`hourly forecast keys under ${process.env.TZ}`, () => {
  it('is not running under UTC', () => {
    expect(process.env.TZ).toBeDefined();
    expect(process.env.TZ).not.toBe('UTC');
  });

  it('keys and matches on the local hour, not the UTC hour', async () => {
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

    let forecasts: Record<string, Types.WeatherData> = {};
    await WeatherUtils.subscribeToWeatherForecast(hass, config, 'hourly', (received) => {
      forecasts = received;
    });

    // 14:00 local on a summer date, so every zone in the matrix carries a
    // non-zero offset and the local and UTC hours cannot coincide.
    handler?.({
      forecast: [
        {
          datetime: new Date(2026, 5, 17, 14, 0, 0).toISOString(),
          condition: 'sunny',
          temperature: 10,
        },
      ] as Array<Types.WeatherForecast>,
    });

    expect(Object.keys(forecasts)).toEqual(['2026-06-17_14']);
    expect(Object.values(forecasts)[0].hour).toBe(14);

    const event = {
      start: { dateTime: new Date(2026, 5, 17, 14, 0, 0).toISOString() },
      end: { dateTime: new Date(2026, 5, 17, 15, 0, 0).toISOString() },
    } as Types.CalendarEventData;

    expect(WeatherUtils.findForecastForEvent(event, forecasts)?.condition).toBe('sunny');
  });
});

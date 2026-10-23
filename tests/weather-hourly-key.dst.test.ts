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
 * miss its exact match and quietly settle for whichever neighboring hour the
 * nearest-hour walk happened to land on — a forecast for the wrong time of day
 * rendered with no error.
 *
 * The date half of the key is asserted alongside the hour as the control: it is
 * local in both implementations, so a passing date with a failing hour proves
 * the entry was processed rather than dropped.
 *
 * The night icon reads the same hour through a separate call, so it can drift
 * from the key alone: handing `isNightForecast` the UTC hour while the key stays
 * local left the whole suite green, and would swap the day and night icons at
 * whatever hours the offset carries across 06:00 or 18:00. The case below fails
 * it once in each zone. Its expectation comes from `Intl.DateTimeFormat` rather
 * than the `Date` getters, which the code under test is built from.
 */

import { describe, expect, it } from 'vitest';

import * as Types from '../src/config/types';
import * as WeatherUtils from '../src/utils/weather';

const ZONE = process.env.TZ ?? 'UTC';

/**
 * The hour an instant reads on the runner's wall clock, derived independently of
 * the `Date` getters.
 *
 * @param date - The instant to read
 * @returns The local hour, 0 to 23
 */
function wallClockHour(date: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .find((part) => part.type === 'hour')?.value;

  return Number(hour);
}

/**
 * The card's fallback rule for an hour with no `is_daytime`.
 *
 * @param hour - Hour of the day, 0 to 23
 * @returns Whether the hour counts as night
 */
function isNightHour(hour: number): boolean {
  return hour >= 18 || hour < 6;
}

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

  it('draws the night icon by the local hour, not the UTC hour, when the forecast does not say', async () => {
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

    // A whole day of hours from UTC midnight on a date no zone in the matrix changes
    // its clocks on, and no entry carries `is_daytime`, so every icon comes from the
    // hour rule.
    const entries: Array<Types.WeatherForecast> = Array.from({ length: 24 }, (_, utcHour) => ({
      datetime: new Date(Date.UTC(2026, 5, 17, utcHour)).toISOString(),
      condition: 'sunny',
      temperature: 10,
    }));

    // The control: some hours must count as night on one clock and day on the other,
    // or this case would pass for a UTC reading too and prove nothing.
    const telling = entries.filter(
      (entry, utcHour) =>
        isNightHour(wallClockHour(new Date(entry.datetime))) !== isNightHour(utcHour),
    );
    expect(telling.length).toBeGreaterThan(0);

    handler?.({ forecast: entries });

    const expected = Object.fromEntries(
      entries.map((entry) => [
        entry.datetime,
        isNightHour(wallClockHour(new Date(entry.datetime)))
          ? 'mdi:weather-night'
          : WeatherUtils.CONDITION_ICON_MAP.sunny,
      ]),
    );
    const drawn = Object.fromEntries(
      Object.values(forecasts).map((forecast) => [forecast.datetime, forecast.icon]),
    );

    expect(drawn).toEqual(expected);
  });
});

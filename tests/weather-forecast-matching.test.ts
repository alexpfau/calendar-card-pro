/**
 * Forecast processing and per-event forecast matching.
 *
 * `findForecastForEvent` is how every event row gets its weather. When no hourly
 * forecast exists for the event's own hour it walks the day's forecasts and picks
 * the nearest one, and that walk had no direct coverage at all: no test called
 * `findForecastForEvent` or `findDailyForecast`, and the rendering snapshots only
 * ever exercised the exact-hour match. Eleven separate mutations of the matching
 * loop and the processing step survived the entire suite, including seeding the
 * distance at zero (which disables the nearest-hour fallback outright), dropping
 * `Math.abs` (which makes the earliest hour of the day always win), and reading
 * the date instead of the hour out of the composite key.
 *
 * The failure mode is quiet in all of them — the row falls back to the daily
 * forecast or renders no weather, rather than throwing.
 *
 * Controls are paired with every assertion: the exact-match case proves the walk
 * is only reached when it should be, the same-day case proves the day filter is
 * doing work rather than the lookup happening to miss, and the daily-fallback
 * pair proves a returned `undefined` is a real miss and not a disabled lookup.
 */

import { describe, expect, it } from 'vitest';

import * as Types from '../src/config/types';
import * as WeatherUtils from '../src/utils/weather';

/**
 * Drive forecast entries through the real subscription path.
 *
 * `processForecastData` is private, and the subscription is its only caller, so
 * this is the honest entry point rather than a reimplementation of the keying.
 *
 * @param entries - Raw Home Assistant forecast entries
 * @param forecastType - Which forecast stream to process
 * @returns The processed record, keyed as the card keys it
 */
async function process(
  entries: Array<Partial<Types.WeatherForecast>>,
  forecastType: 'daily' | 'hourly',
): Promise<Record<string, Types.WeatherData>> {
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
  await WeatherUtils.subscribeToWeatherForecast(hass, config, forecastType, (forecasts) => {
    received = forecasts;
  });

  handler?.({ forecast: entries as Array<Types.WeatherForecast> });

  return received;
}

/**
 * Build an hourly forecast entry on 2026-06-17 at a given local hour.
 *
 * @param hour - Local hour of day
 * @param condition - Condition code, used as the identity of the entry
 * @param day - Day of month, for the cross-day control
 * @returns A raw forecast entry
 */
function hourly(hour: number, condition: string, day = 17): Partial<Types.WeatherForecast> {
  return {
    datetime: new Date(2026, 5, day, hour, 0, 0).toISOString(),
    condition,
    temperature: 10,
  };
}

/**
 * Build a timed calendar event on 2026-06-17 at a given local hour.
 *
 * @param hour - Local hour of day
 * @returns A calendar event with a timed start
 */
function timedEvent(hour: number): Types.CalendarEventData {
  return {
    start: { dateTime: new Date(2026, 5, 17, hour, 0, 0).toISOString() },
    end: { dateTime: new Date(2026, 5, 17, hour + 1, 0, 0).toISOString() },
  } as Types.CalendarEventData;
}

describe('hourly forecast matching', () => {
  it('prefers the forecast for the event hour over any neighbour', async () => {
    const forecasts = await process([hourly(12, 'sunny'), hourly(14, 'rainy')], 'hourly');

    expect(WeatherUtils.findForecastForEvent(timedEvent(12), forecasts)?.condition).toBe('sunny');
  });

  it('falls back to the nearest hour of the same day', async () => {
    const forecasts = await process([hourly(9, 'sunny'), hourly(15, 'rainy')], 'hourly');

    expect(WeatherUtils.findForecastForEvent(timedEvent(14), forecasts)?.condition).toBe('rainy');
  });

  it('measures distance in both directions, not only backwards', async () => {
    // 06:00 is twelve hours before the event, 20:00 is two hours after it. A
    // signed comparison makes the earliest hour of the day win every time.
    const forecasts = await process([hourly(6, 'sunny'), hourly(20, 'rainy')], 'hourly');

    expect(WeatherUtils.findForecastForEvent(timedEvent(18), forecasts)?.condition).toBe('rainy');
  });

  it('resolves an equal-distance tie to the earlier hour', async () => {
    const forecasts = await process([hourly(11, 'sunny'), hourly(13, 'rainy')], 'hourly');

    expect(WeatherUtils.findForecastForEvent(timedEvent(12), forecasts)?.condition).toBe('sunny');
  });

  it('accepts midnight as the nearest hour', async () => {
    // Hour zero is the one hour a truthiness check on the index would discard.
    const forecasts = await process([hourly(0, 'sunny')], 'hourly');

    expect(WeatherUtils.findForecastForEvent(timedEvent(3), forecasts)?.condition).toBe('sunny');
  });

  it('never borrows a nearer hour from a neighbouring day', async () => {
    // 19:00 on the 18th is one hour from the event by clock time and would win
    // outright if the day were not part of the key comparison; 06:00 on the
    // event's own day is twelve hours away and is the correct answer.
    const forecasts = await process([hourly(6, 'sunny'), hourly(19, 'rainy', 18)], 'hourly');

    expect(WeatherUtils.findForecastForEvent(timedEvent(18), forecasts)?.condition).toBe('sunny');
  });
});

describe('daily forecast lookup', () => {
  it('returns the entry for the requested local day', async () => {
    const forecasts = await process(
      [
        {
          datetime: new Date(2026, 5, 17, 12, 0, 0).toISOString(),
          condition: 'sunny',
          temperature: 10,
        },
        {
          datetime: new Date(2026, 5, 18, 12, 0, 0).toISOString(),
          condition: 'rainy',
          temperature: 10,
        },
      ],
      'daily',
    );

    expect(WeatherUtils.findDailyForecast(new Date(2026, 5, 17), forecasts)?.condition).toBe(
      'sunny',
    );
    expect(WeatherUtils.findDailyForecast(new Date(2026, 5, 19), forecasts)).toBeUndefined();
  });

  it('serves all-day events from the daily forecast', async () => {
    const forecasts = await process(
      [
        {
          datetime: new Date(2026, 5, 17, 12, 0, 0).toISOString(),
          condition: 'snowy',
          temperature: 10,
        },
      ],
      'daily',
    );

    const allDay = {
      start: { date: '2026-06-17' },
      end: { date: '2026-06-18' },
    } as Types.CalendarEventData;

    expect(WeatherUtils.findForecastForEvent(allDay, {}, forecasts)?.condition).toBe('snowy');
  });

  it('only lets a timed event fall back to the daily forecast when asked to', async () => {
    const daily = await process(
      [
        {
          datetime: new Date(2026, 5, 17, 12, 0, 0).toISOString(),
          condition: 'cloudy',
          temperature: 10,
        },
      ],
      'daily',
    );

    expect(WeatherUtils.findForecastForEvent(timedEvent(9), {}, daily)).toBeUndefined();
    expect(WeatherUtils.findForecastForEvent(timedEvent(9), {}, daily, true)?.condition).toBe(
      'cloudy',
    );
  });
});

describe('forecast processing', () => {
  it('rounds the numeric fields rather than truncating them', async () => {
    const forecasts = await process(
      [
        {
          datetime: new Date(2026, 5, 17, 12, 0, 0).toISOString(),
          condition: 'sunny',
          temperature: 21.6,
          templow: 8.5,
          uv_index: 4.6,
        },
      ],
      'hourly',
    );

    const entry = Object.values(forecasts)[0];
    expect(entry.temperature).toBe(22);
    expect(entry.templow).toBe(9);
    expect(entry.uv_index).toBe(5);
  });

  it('skips entries with no timestamp instead of keying them as invalid', async () => {
    const forecasts = await process(
      [{ condition: 'sunny', temperature: 10 }, hourly(12, 'rainy')],
      'hourly',
    );

    expect(Object.keys(forecasts)).toEqual(['2026-06-17_12']);
  });
});

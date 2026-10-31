/**
 * Night variants of the forecast icons.
 *
 * `getWeatherIcon` swaps three conditions for a night-appropriate icon after
 * dark, because the daytime icon for them is actively wrong then — `sunny`
 * draws a sun, and an hourly forecast row at 22:00 showing a sun is the kind of
 * thing a user reports as a bug.
 *
 * The table had no coverage: each of its three entries could be deleted with
 * every gate green, and the failure is silent rather than loud — the lookup
 * falls back to `CONDITION_ICON_MAP` and simply draws the day icon at night.
 *
 * The daytime and non-night-mapped cases are the controls. They prove the swap
 * is conditional on the hour and on the specific condition, so a night
 * assertion passing means the night branch ran rather than the whole table
 * having been replaced by one icon.
 *
 * What counts as dark is the forecast entry's own `is_daytime` where it gives
 * one, and 18:00 to 06:00 by the entry's local hour where it does not (#603).
 * The hour rule alone drew a moon over a sunny afternoon whenever the forecast
 * was for somewhere the browser's clock already called evening. Each
 * `is_daytime` case therefore sets the entity's answer against the hour's —
 * `true` at 22:00, `false` at 12:00 — because a case where the two agree passes
 * whether or not the field is read. Values that are not booleans are checked at
 * both hours, which is what separates "only a boolean is an answer" from a
 * truthiness or `!== undefined` test: each of those gets one hour wrong. Daily
 * entries ignore the field by design, so the case pinning that records a
 * decision rather than guarding a regression.
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
 * Drive raw forecast entries through the real subscription path.
 *
 * `processForecastData` is private and the subscription is its only caller, so
 * this is the honest entry point. The entries are untyped so a case can send
 * what an unvalidated payload might hold, not only what the type allows.
 *
 * @param entries - Raw Home Assistant forecast entries
 * @param forecastType - Which forecast stream they arrive on
 * @returns The processed record, keyed as the card keys it
 */
async function process(
  entries: Array<Record<string, unknown>>,
  forecastType: 'daily' | 'hourly' = 'hourly',
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

  handler?.({ forecast: entries as unknown as Array<Types.WeatherForecast> });

  return received;
}

/**
 * Drive one forecast entry through the real subscription path and return the
 * icon the card would render for it.
 *
 * @param condition - Home Assistant condition code
 * @param hour - Local hour of the forecast entry
 * @param fields - Further fields for the entry; `is_daytime` is absent unless given here
 * @param forecastType - Which forecast stream the entry arrives on
 * @returns The resolved MDI icon name
 */
async function iconFor(
  condition: string,
  hour: number,
  fields: Record<string, unknown> = {},
  forecastType: 'daily' | 'hourly' = 'hourly',
): Promise<string | undefined> {
  const received = await process(
    [
      {
        datetime: new Date(2025, 0, 8, hour, 0, 0).toISOString(),
        condition,
        temperature: 10,
        ...fields,
      },
    ],
    forecastType,
  );

  return Object.values(received)[0]?.icon;
}

/**
 * The hourly forecast attached to #603, trimmed to the fields the icon reads.
 *
 * It is an evening where the forecast is: still light at 22:00 and 23:00 UTC,
 * dark from midnight UTC on. The unit project pins `TZ=UTC`, so the card keys
 * the two light entries at local hours 22 and 23, where the hour rule alone
 * drew both as night.
 */
const REPORTED_EVENING: Array<Record<string, unknown>> = [
  {
    datetime: '2026-09-07T22:00:00+00:00',
    condition: 'sunny',
    is_daytime: true,
    temperature: 25.7,
  },
  {
    datetime: '2026-09-07T23:00:00+00:00',
    condition: 'sunny',
    is_daytime: true,
    temperature: 23.5,
  },
  {
    datetime: '2026-09-08T00:00:00+00:00',
    condition: 'clear-night',
    is_daytime: false,
    temperature: 21.2,
  },
  {
    datetime: '2026-09-08T01:00:00+00:00',
    condition: 'clear-night',
    is_daytime: false,
    temperature: 19.6,
  },
];

/**
 * Build a one-hour timed calendar event.
 *
 * @param start - ISO start instant
 * @returns A calendar event with a timed start and end
 */
function eventAt(start: string): Types.CalendarEventData {
  const end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();

  return { start: { dateTime: start }, end: { dateTime: end } } as Types.CalendarEventData;
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

describe('day and night from the forecast itself', () => {
  it.each(NIGHT_SWAPPED)(
    'draws %s with its daytime icon at a night hour the entity calls day',
    async (condition) => {
      expect(await iconFor(condition, 22, { is_daytime: true })).toBe(
        WeatherUtils.CONDITION_ICON_MAP[condition],
      );
    },
  );

  it.each(NIGHT_SWAPPED)(
    'draws %s with its night icon at a day hour the entity calls night',
    async (condition, icon) => {
      expect(await iconFor(condition, 12, { is_daytime: false })).toBe(icon);
    },
  );

  it('falls back to the hour when the entry has no is_daytime', async () => {
    expect(await iconFor('sunny', 22)).toBe('mdi:weather-night');
    expect(await iconFor('sunny', 12)).toBe(WeatherUtils.CONDITION_ICON_MAP.sunny);
  });

  // `null` is Home Assistant's "not known"; the rest are what an unvalidated payload
  // could hold. Both hours are needed, because reading any of these as a fixed day or
  // night is right at one of them.
  it.each([null, 'true', 'false', 0, 1])(
    'falls back to the hour when is_daytime is %j rather than a boolean',
    async (value) => {
      expect(await iconFor('sunny', 22, { is_daytime: value })).toBe('mdi:weather-night');
      expect(await iconFor('sunny', 12, { is_daytime: value })).toBe(
        WeatherUtils.CONDITION_ICON_MAP.sunny,
      );
    },
  );

  it('leaves a condition without a night variant alone when the entity calls it night', async () => {
    expect(await iconFor('rainy', 12, { is_daytime: false })).toBe(
      WeatherUtils.CONDITION_ICON_MAP.rainy,
    );
  });

  it('keeps a daily entry on its day icon whatever its is_daytime says', async () => {
    expect(await iconFor('sunny', 22, { is_daytime: false }, 'daily')).toBe(
      WeatherUtils.CONDITION_ICON_MAP.sunny,
    );
  });
});

describe('the forecast reported in #603', () => {
  it('draws the sun beside an event at an hour the card calls night', async () => {
    const forecasts = await process(REPORTED_EVENING);

    expect(
      WeatherUtils.findForecastForEvent(eventAt('2026-09-07T22:35:00Z'), forecasts)?.icon,
    ).toBe(WeatherUtils.CONDITION_ICON_MAP.sunny);
  });

  it('carries the day icon to an event between forecast hours', async () => {
    // Nothing is keyed at 20:00, so only the nearest-hour fallback can answer. It
    // borrows the 22:00 entry, and that entry's own answer to day or night with it.
    const forecasts = await process(REPORTED_EVENING);

    expect(
      WeatherUtils.findForecastForEvent(eventAt('2026-09-07T20:35:00Z'), forecasts)?.icon,
    ).toBe(WeatherUtils.CONDITION_ICON_MAP.sunny);
  });

  it('gives an event after dark the dark entry, not the light one', async () => {
    // The control: the lookup is answering per event rather than handing every event
    // the same entry, so the two cases above are about which entry they reached.
    const forecasts = await process(REPORTED_EVENING);

    expect(
      WeatherUtils.findForecastForEvent(eventAt('2026-09-08T00:35:00Z'), forecasts)?.condition,
    ).toBe('clear-night');
  });
});

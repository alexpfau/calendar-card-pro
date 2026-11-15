/**
 * Where the card draws the weather, read from its configuration alone.
 *
 * Imports nothing but types, and has to stay that way: the editor asks these too, and
 * `utils/weather.ts` reaches Day.js and every locale it registers through `format`, which an
 * editor import of it would bundle into `editor.js` (29 KB raw when measured).
 */

import type * as Types from '../config/types';

/**
 * Resolve the effective weather position, applying the documented `date` default.
 *
 * `setConfig` fills a partial `weather:` block in from the defaults, so `position` normally
 * arrives set. This still resolves it, because the config reaching these helpers does not
 * always come through `setConfig`: the editor builds preview configs of its own, and both
 * halves of the weather pipeline are called directly from tests. Reading
 * `weather.position` raw is exactly how the subscribe and render halves drifted apart —
 * the card subscribed to the daily forecast and then drew nothing — so the default is
 * resolved in one place rather than assumed to have been filled in upstream.
 *
 * This resolves a *missing* value only; it deliberately does not validate. Config
 * arrives from YAML unvalidated, so `position` can hold something outside its declared
 * union at runtime, and `getRequiredForecastTypes` pins that case to subscribing to
 * everything rather than dropping it. Clamping an unknown value to `date` here would
 * quietly break that.
 *
 * @param weatherConfig Weather configuration options, if any
 * @returns The position every consumer should act on
 */
export function resolveWeatherPosition(
  weatherConfig?: Types.WeatherConfig,
): NonNullable<Types.WeatherConfig['position']> {
  return weatherConfig?.position || 'date';
}

/**
 * Whether the card draws a forecast beside its events at all: it names a weather entity, and
 * its position is `event` or `both`. A calendar's `show_weather: false` can still leave its own
 * events out; this answers for the card.
 *
 * @param weatherConfig Weather configuration options, if any
 * @returns `true` when events get a forecast
 */
export function showsEventWeather(weatherConfig?: Types.WeatherConfig): boolean {
  const position = resolveWeatherPosition(weatherConfig);
  return !!(weatherConfig?.entity && (position === 'event' || position === 'both'));
}

/**
 * Where the card draws the weather, and from which entity, read from its configuration alone.
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

/**
 * Which forecasts a view's weather needs: the daily one beside its days, and both beside its
 * events, whose forecast falls back to the daily one past the hourly horizon.
 *
 * @param weatherConfig A view's weather, or the block written before v6
 * @returns The forecast types to subscribe to
 */
export function getRequiredForecastTypes(
  weatherConfig?: Types.WeatherConfig,
): Array<'daily' | 'hourly'> {
  if (!weatherConfig || !weatherConfig.entity) {
    return [];
  }

  const position = resolveWeatherPosition(weatherConfig);

  // 'none' renders nothing anywhere, so subscribing to a forecast would pay the
  // cost of a stream nobody reads. Without this arm it falls through to the
  // `['daily', 'hourly']` return below and becomes the most expensive option.
  if (position === 'none') {
    return [];
  }

  if (position === 'date') {
    return ['daily'];
  }

  // 'event' and 'both' both render a per-event forecast, which needs hourly data;
  // 'both' additionally keeps the daily forecast on the day header.
  return ['daily', 'hourly'];
}

/**
 * Whether the card holds its weather as written before v6: a top-level `weather:` that names an
 * entity. Such a card draws it as v5 did, in List, Columns and Grid alike, and ignores the
 * layouts' own `weather:` blocks and `weather_entity`.
 *
 * Decided by the entity, not by whether a `weather:` block is there, for two reasons. A merged
 * configuration always holds one, filled in from `DEFAULT_CONFIG`, so an authored block is
 * invisible after merging unless it says something no default does; and a block without an
 * entity drew nothing before v6 either, so reading such a card per layout changes nothing it
 * drew. The truthiness test is v5's own (`!weatherConfig.entity`).
 *
 * @param config The card's configuration, merged or as written
 * @returns `true` when the top-level `weather:` decides every layout's weather
 */
export function readsWeatherAsBefore(config: Pick<Types.Config, 'weather'> | undefined): boolean {
  const weather = config?.weather as unknown;
  return (
    weather !== null &&
    typeof weather === 'object' &&
    !Array.isArray(weather) &&
    !!(weather as Types.WeatherConfig).entity
  );
}

/**
 * The weather entity the card draws from: the top-level `weather:` block's, where it names one
 * (`readsWeatherAsBefore`), else `weather_entity`.
 *
 * @param config The card's configuration, merged or as written
 * @returns The entity id, or `undefined` for none
 */
export function weatherEntityOf(
  config: Pick<Types.Config, 'weather' | 'weather_entity'> | undefined,
): string | undefined {
  if (readsWeatherAsBefore(config)) return config!.weather!.entity;
  const entity = config?.weather_entity as unknown;
  return typeof entity === 'string' && entity.trim() !== '' ? entity : undefined;
}

/**
 * A month's weather from a layout's: Month draws the forecast beside events only, in its day
 * lists, and nothing beside its days, so `date` is nothing there and `both` is `event`.
 *
 * @param position A layout's weather position, possibly outside its union in hand-written YAML
 * @returns The position Month acts on
 */
export function monthWeatherPosition(
  position: Types.WeatherConfig['position'] | undefined,
): NonNullable<Types.WeatherConfig['position']> {
  if (position === 'event' || position === 'both') return 'event';
  return 'none';
}

/**
 * Weather utilities for Calendar Card Pro
 * Processes and formats weather data from Home Assistant for use in the calendar card.
 */

import * as FormatUtils from './format';
import * as Logger from './logger';
import * as WeatherI18n from './weather-i18n';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CORE WEATHER DATA PROCESSING
//-----------------------------------------------------------------------------

/**
 * Resolve the effective weather position, applying the documented `date` default.
 *
 * `setConfig` merges with `{ ...DEFAULT_CONFIG, ...config }` — a *shallow* spread — so a
 * user `weather:` block replaces the default block wholesale and `position` arrives
 * `undefined` unless it was spelled out. Every consumer must therefore resolve the
 * default itself, and reading `weather.position` raw is exactly how the subscribe and
 * render halves drifted apart: the card subscribed to the daily forecast and then drew
 * nothing.
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
 * Determine which forecast types (daily, hourly) are required based on configuration
 *
 * @param weatherConfig Weather configuration options
 * @returns Array of required forecast types
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

function processForecastData(
  forecast: Array<Types.WeatherForecast>,
  forecastType: 'daily' | 'hourly',
): Record<string, Types.WeatherData> {
  const processedForecasts: Record<string, Types.WeatherData> = {};

  if (!forecast || !Array.isArray(forecast)) {
    return processedForecasts;
  }

  forecast.forEach((item) => {
    if (!item.datetime) {
      return;
    }

    let key: string;
    let hour: number | undefined;
    let date: Date;

    if (forecastType === 'hourly') {
      date = new Date(item.datetime);
      hour = date.getHours();

      key = `${FormatUtils.getLocalDateKey(date)}_${hour}`;
    } else {
      date = new Date(item.datetime);
      key = FormatUtils.getLocalDateKey(date);
    }

    const icon = getWeatherIcon(item.condition, hour);

    processedForecasts[key] = {
      icon,
      condition: item.condition,
      temperature: Math.round(item.temperature),
      templow: item.templow !== undefined ? Math.round(item.templow) : undefined,
      datetime: item.datetime,
      hour,
      uv_index: item.uv_index !== undefined ? Math.round(item.uv_index) : undefined,
    };
  });

  return processedForecasts;
}

//-----------------------------------------------------------------------------
// FORECAST MATCHING AND LOOKUP
//-----------------------------------------------------------------------------

/**
 * Find the daily forecast for a specific date
 *
 * @param date Date object to find forecast for
 * @param dailyForecasts Daily forecasts record
 * @returns Weather data for the date or undefined
 */
export function findDailyForecast(
  date: Date,
  dailyForecasts: Record<string, Types.WeatherData>,
): Types.WeatherData | undefined {
  if (!dailyForecasts) {
    return undefined;
  }

  const dateKey = FormatUtils.getLocalDateKey(date);

  return dailyForecasts[dateKey];
}

/**
 * Find the appropriate forecast for an event
 *
 * @param event Calendar event
 * @param hourlyForecasts Hourly forecasts record
 * @param dailyForecasts Daily forecasts record
 * @param dailyFallback Whether timed events may fall back to the daily forecast
 * @returns Weather data for the event or undefined
 */
export function findForecastForEvent(
  event: Types.CalendarEventData,
  hourlyForecasts: Record<string, Types.WeatherData>,
  dailyForecasts?: Record<string, Types.WeatherData>,
  dailyFallback = false,
): Types.WeatherData | undefined {
  if (event.start.date && !event.start.dateTime && dailyForecasts) {
    const eventDate = FormatUtils.parseAllDayDate(event.start.date);
    const dateKey = FormatUtils.getLocalDateKey(eventDate);
    return dailyForecasts[dateKey];
  }

  if (!event.start.dateTime) {
    return undefined;
  }

  const eventStart = new Date(event.start.dateTime);
  const eventDate = FormatUtils.getLocalDateKey(eventStart);
  const eventHour = eventStart.getHours();

  if (hourlyForecasts) {
    const exactMatch = hourlyForecasts[`${eventDate}_${eventHour}`];
    if (exactMatch) {
      return exactMatch;
    }

    let closestHour = -1;
    let minDiff = 24;

    Object.keys(hourlyForecasts).forEach((key) => {
      if (key.startsWith(eventDate)) {
        const hourPart = key.split('_')[1];
        const hour = parseInt(hourPart);

        if (!isNaN(hour)) {
          const diff = Math.abs(hour - eventHour);

          if (diff < minDiff) {
            minDiff = diff;
            closestHour = hour;
          }
        }
      }
    });

    if (closestHour >= 0) {
      return hourlyForecasts[`${eventDate}_${closestHour}`];
    }
  }

  if (dailyFallback && dailyForecasts) {
    return dailyForecasts[eventDate];
  }

  return undefined;
}

//-----------------------------------------------------------------------------
// WEATHER DATA FORMATTING
//-----------------------------------------------------------------------------

/**
 * Map of weather condition codes to MDI icons
 */
export const CONDITION_ICON_MAP: Record<string, string> = {
  'clear-night': 'mdi:weather-night',
  cloudy: 'mdi:weather-cloudy',
  fog: 'mdi:weather-fog',
  hail: 'mdi:weather-hail',
  lightning: 'mdi:weather-lightning',
  'lightning-rainy': 'mdi:weather-lightning-rainy',
  partlycloudy: 'mdi:weather-partly-cloudy',
  pouring: 'mdi:weather-pouring',
  rainy: 'mdi:weather-rainy',
  snowy: 'mdi:weather-snowy',
  'snowy-rainy': 'mdi:weather-snowy-rainy',
  sunny: 'mdi:weather-sunny',
  windy: 'mdi:weather-windy',
  'windy-variant': 'mdi:weather-windy-variant',
  exceptional: 'mdi:weather-cloudy-alert',
};

const NIGHT_ICONS: Record<string, string> = {
  sunny: 'mdi:weather-night',
  partlycloudy: 'mdi:weather-night-partly-cloudy',
  'lightning-rainy': 'mdi:weather-lightning',
};

function getWeatherIcon(condition: string, hour?: number): string {
  const isNight = hour !== undefined && (hour >= 18 || hour < 6);

  if (isNight && NIGHT_ICONS[condition]) {
    return NIGHT_ICONS[condition];
  }

  return CONDITION_ICON_MAP[condition] || 'mdi:weather-cloudy-alert';
}

const untranslatedConditions = new Set<string>();

/**
 * Localize a forecast condition into the words Home Assistant would use for it.
 *
 * @param hass Home Assistant instance, if one is available
 * @param entityId Weather entity the forecast came from
 * @param condition Raw condition token, e.g. `partlycloudy`
 * @param configLanguage The card's configured `language`, if any
 * @returns The localized condition, or `undefined` when it cannot be resolved
 */
export function formatCondition(
  hass: Types.Hass | null | undefined,
  entityId: string | undefined,
  condition: string | undefined,
  configLanguage?: string,
): string | undefined {
  if (!hass || !entityId || !condition) {
    return undefined;
  }

  const haLanguage = WeatherI18n.conditionLanguage(hass, configLanguage);
  if (haLanguage) {
    const translated = WeatherI18n.lookupCondition(haLanguage, condition);
    if (translated) {
      return translated;
    }
  }

  const stateObj = hass.states?.[entityId];

  if (!stateObj || typeof hass.formatEntityState !== 'function') {
    return undefined;
  }

  const text = hass.formatEntityState(stateObj, condition);

  if (!text) {
    return undefined;
  }

  if (text === condition && !untranslatedConditions.has(condition)) {
    untranslatedConditions.add(condition);
    Logger.debug(
      `Weather condition "${condition}" came back untranslated from ${entityId}; ` +
        'Home Assistant returned the raw token, so the row will show it as-is',
    );
  }

  return text;
}

/**
 * Forget which conditions have been reported
 */
export function resetUntranslatedConditions(): void {
  untranslatedConditions.clear();
}

//-----------------------------------------------------------------------------
// SUBSCRIPTION MANAGEMENT
//-----------------------------------------------------------------------------

/**
 * Subscribe to weather forecast data from Home Assistant
 *
 * @param hass Home Assistant instance
 * @param config Calendar card configuration
 * @param forecastType Type of forecast to subscribe to ('daily' or 'hourly')
 * @param callback Callback function to receive forecast data
 * @returns Unsubscribe function or undefined
 */
export async function subscribeToWeatherForecast(
  hass: Types.Hass,
  config: Types.Config,
  forecastType: 'daily' | 'hourly',
  callback: (forecasts: Record<string, Types.WeatherData>) => void,
): Promise<(() => void) | undefined> {
  if (!hass?.connection || !config?.weather?.entity) {
    return undefined;
  }

  const entityId = config.weather.entity;

  try {
    const unsubscribe = await hass.connection.subscribeMessage(
      (message: { forecast: Array<Types.WeatherForecast> }) => {
        if (message && Array.isArray(message.forecast)) {
          const processedForecasts = processForecastData(message.forecast, forecastType);

          callback(processedForecasts);
        }
      },
      {
        type: 'weather/subscribe_forecast',
        forecast_type: forecastType,
        entity_id: entityId,
      },
    );

    return unsubscribe;
  } catch (error) {
    Logger.error('Failed to subscribe to weather forecast', {
      entity: entityId,
      forecast_type: forecastType,
      error,
    });

    return undefined;
  }
}

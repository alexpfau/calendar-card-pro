/**
 * Weather utilities for Calendar Card Pro
 *
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

  // Determine required forecast types based on position
  const position = weatherConfig.position || 'date';

  // Date position only needs daily forecasts
  if (position === 'date') {
    return ['daily'];
  }

  // Event position needs both hourly (for timed events) and daily (for all-day events)
  if (position === 'event') {
    return ['daily', 'hourly'];
  }

  // Both positions need both forecast types
  return ['daily', 'hourly'];
}

/**
 * Process raw forecast data from Home Assistant
 *
 * @param forecast Raw forecast data from Home Assistant
 * @param entityId Weather entity ID
 * @param forecastType Type of forecast ('daily' or 'hourly')
 * @returns Processed forecast data indexed by date/time
 */
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

    // Process date/time based on forecast type
    let key: string;
    let hour: number | undefined;
    let date: Date;

    if (forecastType === 'hourly') {
      // Parse full ISO datetime for hourly forecasts
      date = new Date(item.datetime);
      hour = date.getHours();

      // Use ISO format with hour as key
      key = `${FormatUtils.getLocalDateKey(date)}_${hour}`;
    } else {
      // For daily forecasts, just use the date as key
      date = new Date(item.datetime);
      key = FormatUtils.getLocalDateKey(date);
    }

    // Get icon based on condition
    const icon = getWeatherIcon(item.condition, hour);

    // Store processed forecast
    processedForecasts[key] = {
      icon,
      condition: item.condition,
      temperature: Math.round(item.temperature),
      templow: item.templow !== undefined ? Math.round(item.templow) : undefined,
      datetime: item.datetime,
      hour,
      precipitation: item.precipitation,
      precipitation_probability: item.precipitation_probability,
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

  // Convert date to key format (YYYY-MM-DD)
  const dateKey = FormatUtils.getLocalDateKey(date);

  // Return the forecast for this date if available
  return dailyForecasts[dateKey];
}

/**
 * Find the appropriate forecast for an event
 * Uses hourly forecast for timed events, daily forecast for all-day events
 *
 * Home Assistant's hourly forecast typically only spans about two days, while the
 * daily forecast reaches considerably further. When `dailyFallback` is enabled,
 * timed events beyond the hourly horizon fall back to that date's daily forecast
 * instead of rendering nothing. This also covers weather entities that provide no
 * hourly forecast at all.
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
  // For all-day events (with start.date but no start.dateTime)
  if (event.start.date && !event.start.dateTime && dailyForecasts) {
    // Use the daily forecast for the event date
    const eventDate = FormatUtils.parseAllDayDate(event.start.date);
    const dateKey = FormatUtils.getLocalDateKey(eventDate);
    return dailyForecasts[dateKey];
  }

  // For regular events with start.dateTime
  if (!event.start.dateTime) {
    return undefined;
  }

  // Get the event start time
  const eventStart = new Date(event.start.dateTime);
  const eventDate = FormatUtils.getLocalDateKey(eventStart);
  const eventHour = eventStart.getHours();

  if (hourlyForecasts) {
    // Try to find the exact hour
    const exactMatch = hourlyForecasts[`${eventDate}_${eventHour}`];
    if (exactMatch) {
      return exactMatch;
    }

    // Find the closest hour forecast
    let closestHour = -1;
    let minDiff = 24;

    // Look through all hourly forecasts for this date
    Object.keys(hourlyForecasts).forEach((key) => {
      if (key.startsWith(eventDate)) {
        // Extract hour from the key
        const hourPart = key.split('_')[1];
        const hour = parseInt(hourPart);

        if (!isNaN(hour)) {
          // Calculate difference, accounting for hour wrapping
          const diff = Math.abs(hour - eventHour);

          if (diff < minDiff) {
            minDiff = diff;
            closestHour = hour;
          }
        }
      }
    });

    // Return the closest forecast if found
    if (closestHour >= 0) {
      return hourlyForecasts[`${eventDate}_${closestHour}`];
    }
  }

  // No hourly data for this date - fall back to the daily forecast if enabled
  if (dailyFallback && dailyForecasts) {
    return dailyForecasts[eventDate];
  }

  return undefined;
}

//-----------------------------------------------------------------------------
// WEATHER DATA FORMATTING
//-----------------------------------------------------------------------------

/**
 * Map of weather condition codes to MDI icons.
 *
 * Exported so `weather-condition-language.test.ts` can pin its keys against
 * `KNOWN_CONDITIONS` in `weather-i18n.ts`. That module cannot import this one — the
 * dependency runs the other way — so the set is written out twice, and the test is what
 * stops the two drifting.
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

// Night-specific icon overrides
const NIGHT_ICONS: Record<string, string> = {
  sunny: 'mdi:weather-night',
  partlycloudy: 'mdi:weather-night-partly-cloudy',
  'lightning-rainy': 'mdi:weather-lightning',
};

/**
 * Get MDI icon name for a weather condition
 *
 * @param condition Weather condition string
 * @param hour Optional hour (0-23) to determine day/night
 * @returns MDI icon name
 */
function getWeatherIcon(condition: string, hour?: number): string {
  // Determine if it's night (between 18:00 and 6:00)
  const isNight = hour !== undefined && (hour >= 18 || hour < 6);

  // If it's night and we have a night-specific override, use it
  if (isNight && NIGHT_ICONS[condition]) {
    return NIGHT_ICONS[condition];
  }

  // Otherwise use standard icon or default to cloudy alert
  return CONDITION_ICON_MAP[condition] || 'mdi:weather-cloudy-alert';
}

/**
 * Conditions already reported as untranslated, so the log says it once rather than
 * once per event per render.
 */
const untranslatedConditions = new Set<string>();

/**
 * Localize a forecast condition into the words Home Assistant would use for it, in the
 * language the **card** was configured with.
 *
 * The card ships **no** condition strings of its own. Home Assistant translates all
 * fifteen under `component.weather.entity_component._.state.<condition>` for every
 * language it supports, and this function reaches that vocabulary two ways.
 *
 * The fast path is `formatEntityState`, whose second parameter is a state *override* —
 * so handing it the weather entity's own state object plus an arbitrary forecast
 * condition returns that condition's text rather than the entity's current one. It
 * resolves against the translations Home Assistant loaded for the **signed-in user**,
 * which is exactly right whenever the card's `language` agrees with the instance's,
 * and is the whole answer for the large majority of cards.
 *
 * When they disagree it is wrong, and silently so: every other string in a
 * `language: en` card obeyed that option while the condition came back `Sonnig`.
 * `weather-i18n.ts` fetches the same vocabulary in the card's language and caches it;
 * this function prefers that cache when it holds the requested language. Until it does
 * — the first paint, and any instance that cannot answer — the fast path still runs,
 * because the right weather in the wrong language beats an empty row.
 *
 * The state object has to be the real one from `hass.states`, not a literal built
 * here, and the reason is the whole risk of the fast path: `computeStateDisplay`
 * derives its lookup key from `computeDomain(stateObj.entity_id)`, so an object
 * without an `entity_id` resolves nothing and falls through to *return the raw
 * state*. That failure is invisible — the row still renders, in English, for a
 * German user. `HassEntity.entity_id` is required for that reason, and the raw-token
 * case is reported here so it is diagnosable rather than merely cosmetic.
 *
 * Every failure mode returns `undefined` instead of throwing, because the icon beside
 * the words is what fixes the column layout and it needs no `hass` at all: an
 * instance too old to offer `formatEntityState` must lose the words and keep the row.
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

  // Prefer the card's own language when it differs from the instance's and has already
  // been fetched. `conditionLanguage` returns undefined when the two agree, which is
  // what keeps the common case on the synchronous path below with no lookup at all.
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

  // `computeStateDisplay` returns the state it was given when no translation matched.
  // Rendering it is still the right answer — it is HA's own final fallback, and an
  // unknown condition has no better text — but it is the signature of a lookup that
  // missed, which is otherwise indistinguishable from working correctly.
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
 * Forget which conditions have been reported.
 *
 * Exists for the tests, which assert the report fires once and would otherwise be
 * order-dependent on each other.
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
    // Set up subscription to weather forecast data
    const unsubscribe = await hass.connection.subscribeMessage(
      (message: { forecast: Array<Types.WeatherForecast> }) => {
        if (message && Array.isArray(message.forecast)) {
          // Process forecast data
          const processedForecasts = processForecastData(message.forecast, forecastType);

          // Call callback with processed data
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

/* eslint-disable import/order */
/**
 * Weather utilities for Calendar Card Pro
 *
 * Processes and formats weather data from Home Assistant for use in the calendar card.
 */

import * as Types from '../config/types';
import * as Logger from './logger';
import * as FormatUtils from './format';

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
 * @param event Calendar event
 * @param hourlyForecasts Hourly forecasts record
 * @param dailyForecasts Daily forecasts record
 * @returns Weather data for the event or undefined
 */
export function findForecastForEvent(
  event: Types.CalendarEventData,
  hourlyForecasts: Record<string, Types.WeatherData>,
  dailyForecasts?: Record<string, Types.WeatherData>,
): Types.WeatherData | undefined {
  // For all-day events (with start.date but no start.dateTime)
  if (event.start.date && !event.start.dateTime && dailyForecasts) {
    // Use the daily forecast for the event date
    const eventDate = FormatUtils.parseAllDayDate(event.start.date);
    const dateKey = FormatUtils.getLocalDateKey(eventDate);
    return dailyForecasts[dateKey];
  }

  // For regular events with start.dateTime
  if (!event.start.dateTime || !hourlyForecasts) {
    return undefined;
  }

  // Get the event start time
  const eventStart = new Date(event.start.dateTime);
  const eventDate = FormatUtils.getLocalDateKey(eventStart);
  const eventHour = eventStart.getHours();

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

  return undefined;
}

//-----------------------------------------------------------------------------
// WEATHER DATA FORMATTING
//-----------------------------------------------------------------------------

// Map of weather condition codes to MDI icons
const CONDITION_ICON_MAP: Record<string, string> = {
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
export function subscribeToWeatherForecast(
  hass: Types.Hass,
  config: Types.Config,
  forecastType: 'daily' | 'hourly',
  callback: (forecasts: Record<string, Types.WeatherData>) => void,
): (() => void) | undefined {
  if (!hass?.connection || !config?.weather?.entity) {
    return undefined;
  }

  const entityId = config.weather.entity;

  try {
    // Set up subscription to weather forecast data
    const unsubscribe = hass.connection.subscribeMessage(
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

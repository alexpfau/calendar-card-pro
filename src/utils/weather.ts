/**
 * Weather utilities for Calendar Card Pro
 * Processes and formats weather data from Home Assistant for use in the calendar card.
 */

import * as FormatUtils from './format';
import * as Logger from './logger';
import * as WeatherI18n from './weather-i18n';
import { weatherEntityOf } from './weather-position';
import * as Types from '../config/types';

// Kept in a module of their own, which imports nothing, so the editor can ask them without
// bundling this one and the Day.js locales it reaches through `format`.
export {
  getRequiredForecastTypes,
  readsWeatherAsBefore,
  resolveWeatherPosition,
  showsEventWeather,
  weatherEntityOf,
} from './weather-position';

//-----------------------------------------------------------------------------
// CORE WEATHER DATA PROCESSING
//-----------------------------------------------------------------------------

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
    let night = false;
    let date: Date;

    if (forecastType === 'hourly') {
      date = new Date(item.datetime);
      hour = date.getHours();
      night = isNightForecast(item.is_daytime, hour);

      key = `${FormatUtils.getLocalDateKey(date)}_${hour}`;
    } else {
      // A daily entry stands for the whole day — on the day header, on all-day events, and
      // for a timed event beyond the hourly horizon — so it keeps the day icon and its
      // `is_daytime` is deliberately not read. A whole day has no single answer to it, and
      // an entry that gave `false` would put a moon on the day header.
      date = new Date(item.datetime);
      key = FormatUtils.getLocalDateKey(date);
    }

    const icon = getWeatherIcon(item.condition, night);

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

/**
 * Decide whether an hourly forecast entry falls at night, which picks its icon.
 *
 * The weather entity's own answer wins. A Home Assistant forecast entry can carry
 * `is_daytime`, which the provider sets for the forecast's own location, so it stays right
 * for an event in another time zone and wherever the sun is not up from 06:00 to 18:00.
 * Without it, 18:00 to 06:00 counts as night by the entry's local hour — the browser's
 * clock, the same one the card prints event times in.
 *
 * Only a boolean is an answer. Home Assistant types the field `bool | None`, so `null` is
 * a legitimate "not known" and takes the hour rule. Home Assistant's own forecast card
 * reads `null` as night instead; the hour rule is the better guess for an entry that does
 * not say.
 *
 * @param isDaytime The entry's `is_daytime`, exactly as received
 * @param hour Local hour of the entry
 * @returns Whether to draw the entry with its night icon
 */
function isNightForecast(isDaytime: unknown, hour: number): boolean {
  if (typeof isDaytime === 'boolean') {
    return !isDaytime;
  }

  return hour >= 18 || hour < 6;
}

function getWeatherIcon(condition: string, night: boolean): string {
  if (night && NIGHT_ICONS[condition]) {
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
 * How long a forecast stays current without an update: twice the interval Home Assistant
 * forecasts in, so one late update does not dim it.
 */
export const FORECAST_STALE_AFTER: Readonly<Record<'daily' | 'hourly', number>> = {
  hourly: 2 * 60 * 60_000,
  daily: 48 * 60 * 60_000,
};

/**
 * The moment the forecast drawn first counts as stale: the earliest moment any of its types has
 * gone `FORECAST_STALE_AFTER` without being known current.
 *
 * @param currentAt When each forecast type was last known current, in epoch milliseconds
 * @param types The forecast types the card subscribes to; one never known current is left out
 * @returns Epoch milliseconds, or null where no type has been known current
 */
export function forecastStaleAt(
  currentAt: Readonly<Partial<Record<'daily' | 'hourly', number>>>,
  types: ReadonlyArray<'daily' | 'hourly'>,
): number | null {
  let at: number | null = null;
  for (const type of types) {
    const known = currentAt[type];
    if (known === undefined) continue;
    const stale = known + FORECAST_STALE_AFTER[type];
    if (at === null || stale < at) at = stale;
  }
  return at;
}

/**
 * How long after the connection to Home Assistant came back a forecast subscription may stay
 * silent before it is made again. The websocket library subscribes again by itself, and Home
 * Assistant answers with a forecast at once; but one that fails then fails silently, as after a
 * restart before the weather entity has loaded, and the forecast would stay frozen until reload.
 */
export const RECONNECT_TIMEOUT = 30_000;

/** The longest wait between two attempts to make a lost forecast subscription again. */
const RESUBSCRIBE_MAX_WAIT = 30 * 60_000;

type Connection = NonNullable<Types.Hass['connection']>;

/** What each connection tells its forecast subscriptions when it comes back. */
const readyListeners = new WeakMap<Connection, Set<() => void>>();

/**
 * Listen for a connection coming back, through one listener per connection.
 *
 * @param connection Home Assistant connection
 * @param listener Called on every `ready`
 * @returns A function that stops listening
 */
function onReady(connection: Connection, listener: () => void): () => void {
  let listeners = readyListeners.get(connection);
  if (!listeners) {
    const created = new Set<() => void>();
    listeners = created;
    readyListeners.set(connection, created);
    connection.addEventListener?.('ready', () => {
      for (const each of [...created]) each();
    });
  }
  const set = listeners;
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/** One `weather/subscribe_forecast` sent for a subscription. */
interface ForecastAttempt {
  /** Resolves to its unsubscribe function, or null where Home Assistant refused it. */
  unsubscribe: Promise<(() => void) | null>;
  /** The unsubscribe function, once Home Assistant has answered, so it can be called at once. */
  answered?: (() => void) | null;
  /** The connection's `ready` count when it was sent (`epoch`). */
  epoch: number;
  /** Replaced by a newer attempt, or closed with the subscription: its pushes are dropped. */
  stale: boolean;
  /** Unsubscribed already. */
  released: boolean;
}

/**
 * Subscribe to weather forecast data from Home Assistant, and keep subscribed across a
 * reconnect.
 *
 * After the connection comes back, a subscription that does not push within
 * `RECONNECT_TIMEOUT` is made again, with longer waits between further attempts, until one
 * pushes. One the library subscribed again by itself pushes first, so it is never doubled. One
 * made before the reconnect is not unsubscribed while silent: the library would send the id it
 * had on the old connection, which may name another subscription by then. Should it push after
 * all, it is unsubscribed then.
 *
 * @param hass Home Assistant instance
 * @param config Calendar card configuration, naming the entity (`weatherEntityOf`)
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
  const entityId = weatherEntityOf(config);
  const connection = hass?.connection;
  if (!connection || !entityId) {
    return undefined;
  }

  const message = {
    type: 'weather/subscribe_forecast',
    forecast_type: forecastType,
    entity_id: entityId,
  };
  let closed = false;
  let epoch = 0;
  let pushedSinceReady = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wait = RECONNECT_TIMEOUT;

  const release = (attempt: ForecastAttempt): void => {
    if (attempt.released) return;
    attempt.released = true;
    if (attempt.answered !== undefined) {
      attempt.answered?.();
      return;
    }
    attempt.unsubscribe.then(
      (unsubscribe) => unsubscribe?.(),
      () => undefined,
    );
  };

  const send = (): ForecastAttempt => {
    const attempt: ForecastAttempt = {
      unsubscribe: Promise.resolve(null),
      epoch,
      stale: false,
      released: false,
    };
    attempt.unsubscribe = connection
      .subscribeMessage((push: { forecast: Array<Types.WeatherForecast> }) => {
        if (attempt.stale) {
          // In a task of its own: after a reconnect the library takes the new id only once the
          // answer it is still processing has been handled.
          setTimeout(() => release(attempt), 0);
          return;
        }
        pushedSinceReady = true;
        wait = RECONNECT_TIMEOUT;
        clearTimeout(timer);
        timer = undefined;
        if (push && Array.isArray(push.forecast)) {
          callback(processForecastData(push.forecast, forecastType));
        }
      }, message)
      .then((unsubscribe) => (attempt.answered = unsubscribe ?? null));
    return attempt;
  };

  let current = send();
  try {
    await current.unsubscribe;
  } catch (error) {
    Logger.error('Failed to subscribe to weather forecast', {
      entity: entityId,
      forecast_type: forecastType,
      error,
    });

    return undefined;
  }

  const retire = (attempt: ForecastAttempt): void => {
    attempt.stale = true;
    // Safe to unsubscribe only where the library holds its current id: one sent on this
    // connection, or one that has pushed since it came back.
    if (connection.connected !== false && (attempt.epoch === epoch || pushedSinceReady)) {
      release(attempt);
    }
  };

  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (connection.connected === false) return;
      Logger.warn(`No weather forecast for ${entityId} since reconnecting; subscribing again`);
      retire(current);
      const attempt = send();
      current = attempt;
      attempt.unsubscribe.catch((error: unknown) => {
        attempt.stale = true;
        Logger.debug('Could not subscribe to the weather forecast again', error);
      });
      wait = Math.min(wait * 2, RESUBSCRIBE_MAX_WAIT);
      arm();
    }, wait);
  };

  const stopListening = onReady(connection, () => {
    epoch += 1;
    pushedSinceReady = false;
    wait = RECONNECT_TIMEOUT;
    arm();
  });

  return () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    stopListening();
    retire(current);
  };
}

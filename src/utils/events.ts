/* eslint-disable import/order */
/**
 * Event utilities for Calendar Card Pro
 *
 * Functions for fetching, processing, caching, and organizing calendar events
 */

import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as FormatUtils from './format';
import * as Logger from './logger';
import * as Constants from '../config/constants';

//-----------------------------------------------------------------------------
// HIGH-LEVEL API FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Determine if this is likely a manual page reload rather than an automatic refresh
 * Uses performance API to check navigation type when available
 *
 * @returns True if this appears to be a manual page load/reload
 */
function isManualPageLoad(): boolean {
  // Use the Performance Navigation API when available
  if (window.performance && window.performance.navigation) {
    // navigation.type: 0=navigate, 1=reload, 2=back/forward
    return window.performance.navigation.type === 1; // reload
  }

  // For newer browsers using Navigation API
  if (window.performance && window.performance.getEntriesByType) {
    const navEntries = window.performance.getEntriesByType('navigation');
    if (navEntries.length > 0 && 'type' in navEntries[0]) {
      return (navEntries[0] as { type: string }).type === 'reload';
    }
  }

  // Default to false if we can't determine
  return false;
}

/**
 * Orchestrates the complete event update process with state management
 * This function manages loading states, cache access, API calls, and error handling
 *
 * @param options Configuration object containing all necessary parameters
 * @returns Promise that resolves when the update is complete
 */
export async function orchestrateEventUpdate(options: {
  hass: Types.Hass | null;
  config: Types.Config;
  instanceId: string;
  force: boolean;
  currentEvents: Types.CalendarEventData[];
  callbacks: {
    setLoading: (loading: boolean) => void;
    setEvents: (events: Types.CalendarEventData[]) => void;
    updateLastUpdate: () => void;
    renderCallback: () => void;
    restartTimer?: () => void;
  };
}): Promise<void> {
  const { hass, config, instanceId, force, currentEvents, callbacks } = options;

  // Early return if state is invalid
  if (!isValidState(hass, config.entities)) return;

  // Detect if this is a manual page reload
  const isManualReload = isManualPageLoad();
  if (isManualReload) {
    Logger.debug('Manual page reload detected - using shorter cache lifetime');
  }

  // Use instanceId in cache key generation
  const cacheKey = getBaseCacheKey(
    instanceId,
    config.entities,
    config.days_to_show,
    config.show_past_events,
  );

  // Check cache first unless forced refresh
  const cacheExists = !force && doesCacheExist(cacheKey, isManualReload);

  if (cacheExists) {
    const cachedEvents = getCachedEvents(cacheKey, config, isManualReload);
    if (cachedEvents) {
      Logger.info(`Using ${cachedEvents.length} events from cache`);
      callbacks.setEvents(cachedEvents);
      callbacks.setLoading(false);
      callbacks.renderCallback();
      return;
    }
  }

  // Show loading state and fetch fresh data
  Logger.info(
    `Fetching events from API${force ? ' (forced refresh)' : ''}${isManualReload ? ' (manual page reload)' : ''}`,
  );
  callbacks.setLoading(true);
  callbacks.renderCallback();

  try {
    const result = await updateCalendarEvents(hass, config, instanceId, force, currentEvents);

    if (result.events) {
      callbacks.setEvents(result.events);
      callbacks.updateLastUpdate();

      // Restart the timer after successful data fetch and cache update
      // This ensures the timer and cache timestamps are properly synchronized
      if (callbacks.restartTimer) {
        callbacks.restartTimer();
      }
    }

    if (result.error) {
      Logger.error('Error during event update:', result.error);
    }
  } catch (error) {
    Logger.error('Failed to update events:', error);
  } finally {
    callbacks.setLoading(false);
    callbacks.renderCallback();
  }
}

/**
 * Updates calendar events with caching and error handling
 *
 * @param hass - Home Assistant interface
 * @param config - Card configuration
 * @param instanceId - Component instance ID for cache keying
 * @param force - Force refresh ignoring cache
 * @param currentEvents - Current events array for fallback
 * @returns Object with events and status information
 */
export async function updateCalendarEvents(
  hass: Types.Hass | null,
  config: Types.Config,
  instanceId: string,
  force = false,
  currentEvents: Types.CalendarEventData[] = [],
): Promise<{
  events: Types.CalendarEventData[];
  fromCache: boolean;
  error: unknown | null;
}> {
  // Check if state is valid
  if (!isValidState(hass, config.entities)) {
    return { events: currentEvents, fromCache: false, error: null };
  }

  // Generate cache key with instanceId
  const cacheKey = getBaseCacheKey(
    instanceId,
    config.entities,
    config.days_to_show,
    config.show_past_events,
  );

  // Try to get from cache if not forced
  const cachedEvents = !force && getCachedEvents(cacheKey, config);
  if (cachedEvents) {
    return { events: cachedEvents, fromCache: true, error: null };
  }

  try {
    // Convert string entities to EntityConfig objects
    const entities = config.entities.map((entity) => {
      return typeof entity === 'string' ? { entity, color: 'var(--primary-text-color)' } : entity;
    });

    // Fetch events
    const timeWindow = getTimeWindow(config.days_to_show);
    const events = await fetchEvents(hass!, entities, timeWindow);
    Logger.info(`Fetched ${events.length} events from ${entities.length} calendars`);

    // Cache the events
    cacheEvents(cacheKey, [...events]);

    return { events: [...events], fromCache: false, error: null };
  } catch (error) {
    Logger.error('API error:', error);

    // Attempt fallback if no events already
    if (currentEvents.length === 0) {
      try {
        Logger.info('Trying fallback to fetch today events');
        const firstEntity =
          typeof config.entities[0] === 'string' ? config.entities[0] : config.entities[0].entity;

        const partialEvents = await fetchTodayEvents(hass!, firstEntity);
        return {
          events: partialEvents ? [...partialEvents] : [],
          fromCache: false,
          error,
        };
      } catch (fallbackError) {
        Logger.error('Fallback failed:', fallbackError);
        return { events: [], fromCache: false, error: fallbackError };
      }
    }

    return { events: currentEvents, fromCache: false, error };
  }
}

/**
 * Check if the card state is valid for processing events
 *
 * @param hass - Home Assistant interface
 * @param entities - Calendar entities (strings or objects)
 * @returns Boolean indicating if the state is valid
 */
export function isValidState(
  hass: Types.Hass | null,
  entities: Array<string | Types.EntityConfig>,
): boolean {
  if (!hass || !entities.length) {
    return false;
  }
  return true;
}

/**
 * Group events by day for display
 *
 * @param events - Calendar events to group
 * @param config - Card configuration
 * @param isExpanded - Whether the card is in expanded mode
 * @param language - Language code for translations
 * @returns Array of day objects containing grouped events
 */
export function groupEventsByDay(
  events: Types.CalendarEventData[],
  config: Types.Config,
  isExpanded: boolean,
  language: string,
): Types.EventsByDay[] {
  const eventsByDay: Record<string, Types.EventsByDay> = {};
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const upcomingEvents = events.filter((event) => {
    if (!event?.start || !event?.end) return false;

    const isAllDayEvent = !event.start.dateTime;

    let startDate: Date | null;
    let endDate: Date | null;

    if (isAllDayEvent) {
      // Use special parsing for all-day events that preserves correct day
      startDate = event.start.date ? FormatUtils.parseAllDayDate(event.start.date) : null;
      endDate = event.end.date ? FormatUtils.parseAllDayDate(event.end.date) : null;

      // Adjust end date for all-day events (which is exclusive in iCal format)
      if (endDate) {
        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
        endDate = adjustedEndDate;
      }
    } else {
      startDate = event.start.dateTime ? new Date(event.start.dateTime) : null;
      endDate = event.end.dateTime ? new Date(event.end.dateTime) : null;
    }

    if (!startDate || !endDate) return false;

    const isEventToday = startDate >= todayStart && startDate <= todayEnd;
    const isFutureEvent = startDate > todayEnd;
    // NEW: Check if event ends today or in the future (is still ongoing)
    const isOngoingEvent = endDate >= todayStart;

    // Include events that:
    // 1. Start today or in the future, OR
    // 2. Started in the past BUT are still ongoing
    if (!(isEventToday || isFutureEvent || isOngoingEvent)) {
      return false;
    }

    // Filter out ended events if not showing past events
    if (!config.show_past_events) {
      if (!isAllDayEvent && endDate < now) {
        return false;
      }
    }

    return true;
  });

  // Return early if no upcoming events
  if (upcomingEvents.length === 0) {
    return [];
  }

  // Process events into days
  upcomingEvents.forEach((event) => {
    const isAllDayEvent = !event.start.dateTime;

    let startDate: Date | null;
    let endDate: Date | null;

    if (isAllDayEvent) {
      startDate = event.start.date ? FormatUtils.parseAllDayDate(event.start.date) : null;
      endDate = event.end.date ? FormatUtils.parseAllDayDate(event.end.date) : null;

      // For all-day events, end date is exclusive in iCal format
      if (endDate) {
        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
        endDate = adjustedEndDate;
      }
    } else {
      startDate = event.start.dateTime ? new Date(event.start.dateTime) : null;
      endDate = event.end.dateTime ? new Date(event.end.dateTime) : null;
    }

    if (!startDate || !endDate) return;

    // NEW: Determine which day to display this event on
    let displayDate: Date;

    if (startDate >= todayStart) {
      // Event starts today or in future: Display on start date
      displayDate = startDate;
    } else if (endDate.toDateString() === todayStart.toDateString()) {
      // Event ends today: Display on today
      displayDate = todayStart;
    } else if (startDate < todayStart && endDate > todayStart) {
      // Multi-day event that started in past and continues after today: Display on today
      displayDate = todayStart;
    } else {
      // Fallback (shouldn't happen given our filter): Display on start date
      displayDate = startDate;
    }

    // Use displayDate for grouping instead of startDate
    const eventDateKey = FormatUtils.getLocalDateKey(displayDate);
    const translations = Localize.getTranslations(language);

    if (!eventsByDay[eventDateKey]) {
      eventsByDay[eventDateKey] = {
        weekday: translations.daysOfWeek[displayDate.getDay()],
        day: displayDate.getDate(),
        month: translations.months[displayDate.getMonth()],
        timestamp: displayDate.getTime(),
        events: [],
      };
    }

    eventsByDay[eventDateKey].events.push({
      summary: event.summary || '',
      time: FormatUtils.formatEventTime(event, config, language),
      location: config.show_location
        ? FormatUtils.formatLocation(event.location || '', config.remove_location_country)
        : '',
      start: event.start,
      end: event.end,
      _entityId: event._entityId,
    });
  });

  // Sort events within each day
  Object.values(eventsByDay).forEach((day) => {
    day.events.sort((a, b) => {
      const aIsAllDay = !a.start.dateTime;
      const bIsAllDay = !b.start.dateTime;

      // All-day events should appear before timed events
      if (aIsAllDay && !bIsAllDay) return -1;
      if (!aIsAllDay && bIsAllDay) return 1;

      let aStart, bStart;

      if (aIsAllDay && a.start.date) {
        aStart = FormatUtils.parseAllDayDate(a.start.date).getTime();
      } else {
        aStart = a.start.dateTime ? new Date(a.start.dateTime).getTime() : 0;
      }

      if (bIsAllDay && b.start.date) {
        bStart = FormatUtils.parseAllDayDate(b.start.date).getTime();
      } else {
        bStart = b.start.dateTime ? new Date(b.start.dateTime).getTime() : 0;
      }

      return aStart - bStart;
    });
  });

  // Sort days and limit to configured number of days
  let days = Object.values(eventsByDay)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, config.days_to_show || Constants.DEFAULTS.DAYS_TO_SHOW);

  // Apply max_events_to_show limit if configured and not expanded
  if (config.max_events_to_show && !isExpanded) {
    let eventsShown = 0;
    const maxEvents = config.max_events_to_show ?? 0;
    const limitedDays: Types.EventsByDay[] = [];

    for (const day of days) {
      // If we've already hit the limit, stop adding days
      if (eventsShown >= maxEvents) {
        break;
      }

      // Calculate how many events we can still add from this day
      const remainingEvents = maxEvents - eventsShown;

      // If this day has events to show (considering our remaining limit)
      if (remainingEvents > 0 && day.events.length > 0) {
        // Create a new day object with limited events
        const limitedDay: Types.EventsByDay = {
          ...day,
          events: day.events.slice(0, remainingEvents),
        };

        // Add this day to our result
        limitedDays.push(limitedDay);

        // Update our counter
        eventsShown += limitedDay.events.length;
      }
    }

    // Replace the original days array with our limited version
    days = limitedDays;
  }

  return days;
}

/**
 * Get entity color from configuration based on entity ID
 *
 * @param entityId - The entity ID to find color for
 * @param config - Current card configuration
 * @returns Color string from entity config or default
 */
export function getEntityColor(entityId: string | undefined, config: Types.Config): string {
  if (!entityId) return Constants.COLORS.PRIMARY_TEXT;

  const entityConfig = config.entities.find(
    (e) =>
      (typeof e === 'string' && e === entityId) || (typeof e === 'object' && e.entity === entityId),
  );

  if (!entityConfig) return Constants.COLORS.PRIMARY_TEXT;

  return typeof entityConfig === 'string'
    ? Constants.COLORS.PRIMARY_TEXT
    : entityConfig.color || Constants.COLORS.PRIMARY_TEXT;
}

//-----------------------------------------------------------------------------
// DATA FETCHING FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Calculate time window for event fetching
 *
 * @param daysToShow - Number of days to show in the calendar
 * @returns Object containing start and end dates for the calendar window
 */
export function getTimeWindow(daysToShow: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today
  const end = new Date(start);
  const days = parseInt(daysToShow.toString()) || Constants.DEFAULTS.DAYS_TO_SHOW;
  end.setDate(start.getDate() + days);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Fetch calendar events from Home Assistant API
 *
 * @param hass - Home Assistant instance
 * @param entities - Calendar entities to fetch events for
 * @param timeWindow - Time window to fetch events in
 * @returns Array of calendar events
 */
export async function fetchEvents(
  hass: Types.Hass,
  entities: Array<Types.EntityConfig>,
  timeWindow: { start: Date; end: Date },
): Promise<ReadonlyArray<Types.CalendarEventData>> {
  const allEvents: Types.CalendarEventData[] = [];

  for (const entityConfig of entities) {
    try {
      const path = `calendars/${entityConfig.entity}?start=${timeWindow.start.toISOString()}&end=${timeWindow.end.toISOString()}`;

      Logger.info(`Fetching calendar events with path: ${path}`);

      const events = await hass.callApi('GET', path);

      if (!events || !Array.isArray(events)) {
        Logger.warn(`Invalid response for ${entityConfig.entity}`);
        continue;
      }

      const processedEvents = (events as Types.CalendarEventData[]).map(
        (event: Types.CalendarEventData) => ({
          ...event,
          _entityId: entityConfig.entity,
        }),
      );
      allEvents.push(...processedEvents);
    } catch (error) {
      Logger.error(`Failed to fetch events for ${entityConfig.entity}:`, error);

      try {
        Logger.info(
          'Available hass API methods:',
          Object.keys(hass).filter((k) => typeof hass[k as keyof Types.Hass] === 'function'),
        );
      } catch {
        // Silent
      }
    }
  }

  return allEvents;
}

/**
 * Fetch events for just today
 * Used as a fallback when full event fetching fails
 *
 * @param hass - Home Assistant interface
 * @param entity - Calendar entity to fetch events for
 * @returns Array of calendar events for today or null if fetching fails
 */
export async function fetchTodayEvents(
  hass: Types.Hass,
  entity: string,
): Promise<Types.CalendarEventData[] | null> {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const events = await hass.callApi(
      'GET',
      `calendars/${entity}?start=${start.toISOString()}&end=${end.toISOString()}`,
    );
    return events as Types.CalendarEventData[];
  } catch {
    return null;
  }
}

//-----------------------------------------------------------------------------
// CACHE MANAGEMENT FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Generate a base cache key from configuration
 * This function creates a stable cache key that depends only on data-affecting parameters
 *
 * @param instanceId - Component instance ID for uniqueness
 * @param entities - Calendar entities
 * @param daysToShow - Number of days to display
 * @param showPastEvents - Whether to show past events
 * @returns Base cache key
 */
export function getBaseCacheKey(
  instanceId: string,
  entities: Array<string | { entity: string; color?: string }>,
  daysToShow: number,
  showPastEvents: boolean,
): string {
  const entityIds = entities
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join('_');

  return `${Constants.CACHE.EVENT_CACHE_KEY_PREFIX}${instanceId}_${entityIds}_${daysToShow}_${showPastEvents ? 1 : 0}`;
}

/**
 * Get refresh interval from config or use default
 *
 * @param config - Card configuration
 * @returns Cache duration in milliseconds
 */
export function getCacheDuration(config?: Types.Config): number {
  return (config?.refresh_interval || Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES) * 60 * 1000;
}

/**
 * Check if valid cache exists for a key
 *
 * @param key - Cache key
 * @param isManualReload - Whether this check is during a manual page reload
 * @returns Boolean indicating if valid cache exists
 */
export function doesCacheExist(key: string, isManualReload: boolean = false): boolean {
  return getValidCacheEntry(key, undefined, isManualReload) !== null;
}

/**
 * Parse and validate cache entry
 * Helper function to ensure consistent cache validation
 *
 * @param key - Cache key
 * @param config - Card configuration for cache duration
 * @param isManualReload - Whether this check is during a manual page reload
 * @returns Valid cache entry or null if invalid/expired
 */
export function getValidCacheEntry(
  key: string,
  config?: Types.Config,
  isManualReload: boolean = false,
): Types.CacheEntry | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const cache = JSON.parse(item) as Types.CacheEntry;
    const now = Date.now();

    // For manual reloads, use a much shorter cache validity
    // This ensures fresh data on manual reloads while preserving normal caching for auto-refreshes
    const cacheDuration = isManualReload
      ? Constants.CACHE.MANUAL_RELOAD_CACHE_DURATION_SECONDS * 1000
      : getCacheDuration(config);

    const isValid = now - cache.timestamp < cacheDuration;

    if (!isValid) {
      localStorage.removeItem(key);
      Logger.info(`Cache expired and removed for ${key}`);
      return null;
    }

    return cache;
  } catch (e) {
    Logger.warn('Cache error:', e);
    try {
      localStorage.removeItem(key);
    } catch {}
    return null;
  }
}

/**
 * Get cached event data if available and not expired
 *
 * @param key - Cache key
 * @param config - Card configuration
 * @param isManualReload - Whether this check is during a manual page reload
 * @returns Cached events or null if expired/unavailable
 */
export function getCachedEvents(
  key: string,
  config?: Types.Config,
  isManualReload: boolean = false,
): Types.CalendarEventData[] | null {
  const cacheEntry = getValidCacheEntry(key, config, isManualReload);
  if (cacheEntry) {
    return [...cacheEntry.events];
  }
  return null;
}

/**
 * Cache event data in localStorage
 *
 * @param key - Cache key
 * @param events - Calendar event data to cache
 * @returns Boolean indicating if caching was successful
 */
export function cacheEvents(key: string, events: Types.CalendarEventData[]): boolean {
  try {
    Logger.info(`Caching ${events.length} events`);
    const cacheEntry: Types.CacheEntry = {
      events,
      timestamp: Date.now(),
    };

    localStorage.setItem(key, JSON.stringify(cacheEntry));

    return getValidCacheEntry(key) !== null;
  } catch (e) {
    Logger.error('Failed to cache calendar events:', e);
    return false;
  }
}

/**
 * Invalidate cached events by removing them from storage
 *
 * @param keys - Array of cache keys to invalidate
 */
export function invalidateCache(keys: string[]): void {
  try {
    const invalidated = keys.filter((key) => {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        return true;
      }
      return false;
    });

    if (invalidated.length > 0) {
      Logger.info(`Invalidated ${invalidated.length} cache entries`);
    }
  } catch (e) {
    Logger.warn('Failed to invalidate cache:', e);
  }
}

/**
 * Clean up old cache entries
 *
 * @param _prefix - Cache key prefix (unused but kept for API compatibility)
 * @param config - Card configuration for cleanup time calculation
 */
export function cleanupCache(_prefix: string, config?: Types.Config): void {
  try {
    const keysToRemove: string[] = [];
    const now = Date.now();

    // Calculate cleanup threshold using user's cache_duration and the multiplier
    const cacheDurationMinutes =
      config?.refresh_interval || Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES;
    const cleanupThreshold =
      cacheDurationMinutes * 60 * 1000 * Constants.CACHE.CACHE_EXPIRY_MULTIPLIER;

    Object.keys(localStorage)
      .filter((key) => key.startsWith(Constants.CACHE.EVENT_CACHE_KEY_PREFIX))
      .forEach((key) => {
        try {
          const cacheEntry = JSON.parse(localStorage.getItem(key) || '') as Types.CacheEntry;
          if (now - cacheEntry.timestamp > cleanupThreshold) {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      });

    if (keysToRemove.length > 0) {
      Logger.info(`Cleaned up ${keysToRemove.length} old cache entries`);
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
  } catch (e) {
    Logger.warn('Cache cleanup failed:', e);
  }
}

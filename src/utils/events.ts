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
import * as Helpers from './helpers';

//-----------------------------------------------------------------------------
// HIGH-LEVEL API FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Determine if this is likely a manual page reload rather than an automatic refresh
 * Uses performance API to check navigation type when available
 *
 * @returns True if this appears to be a manual page load/reload
 */
export function isManualPageLoad(): boolean {
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
      _entityLabel: getEntityLabel(event._entityId, config),
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
    .slice(0, config.days_to_show || 3);

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
  if (!entityId) return 'var(--primary-text-color)';

  const entityConfig = config.entities.find(
    (e) =>
      (typeof e === 'string' && e === entityId) || (typeof e === 'object' && e.entity === entityId),
  );

  if (!entityConfig) return 'var(--primary-text-color)';

  return typeof entityConfig === 'string'
    ? 'var(--primary-text-color)'
    : entityConfig.color || 'var(--primary-text-color)';
}

/**
 * Get entity accent color with applied opacity
 * Retrieves accent color from entity config and converts it to RGBA in one step
 *
 * @param entityId - The entity ID to find color for
 * @param config - Current card configuration
 * @param opacity - Opacity value (0-100), if omitted returns solid color
 * @returns Color string ready for use in CSS with opacity applied if requested
 */
export function getEntityAccentColorWithOpacity(
  entityId: string | undefined,
  config: Types.Config,
  opacity?: number,
): string {
  if (!entityId) return 'var(--calendar-card-line-color-vertical)';

  // Find entity config
  const entityConfig = config.entities.find(
    (e) =>
      (typeof e === 'string' && e === entityId) || (typeof e === 'object' && e.entity === entityId),
  );

  // Get base color - whether from entity config or from vertical_line_color config
  const baseColor =
    typeof entityConfig === 'string'
      ? config.vertical_line_color // Use vertical_line_color for simple entity strings
      : entityConfig?.accent_color || config.vertical_line_color;

  // Explicitly check if opacity is undefined or 0
  // If opacity is undefined, 0, or NaN, return the base color with no transparency
  if (opacity === undefined || opacity === 0 || isNaN(opacity)) {
    return baseColor;
  }

  // Convert to RGBA with the specified opacity
  return Helpers.convertToRGBA(baseColor, opacity);
}

/**
 * Get entity label from configuration based on entity ID
 *
 * @param entityId - The entity ID to find label for
 * @param config - Current card configuration
 * @returns Label string or undefined if not set
 */
export function getEntityLabel(
  entityId: string | undefined,
  config: Types.Config,
): string | undefined {
  if (!entityId) return undefined;

  const entityConfig = config.entities.find(
    (e) =>
      (typeof e === 'string' && e === entityId) || (typeof e === 'object' && e.entity === entityId),
  );

  if (!entityConfig || typeof entityConfig === 'string') return undefined;

  return entityConfig.label;
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
  const days = parseInt(daysToShow.toString()) || 3;
  end.setDate(start.getDate() + days);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Fetch calendar event data with caching support
 * This function handles both API fetching and cache retrieval
 *
 * @param hass Home Assistant instance
 * @param config Calendar card configuration
 * @param instanceId Component instance ID for caching
 * @param force Whether to force API refresh
 * @returns Promise resolving to calendar event data array
 */
export async function fetchEventData(
  hass: Types.Hass,
  config: Types.Config,
  instanceId: string,
  force = false,
): Promise<Types.CalendarEventData[]> {
  // Generate cache key based on configuration
  const cacheKey = getBaseCacheKey(
    instanceId,
    config.entities,
    config.days_to_show,
    config.show_past_events,
  );

  // Try cache first
  const isManualPageReload = isManualPageLoad();
  if (!force) {
    const cachedEvents = getCachedEvents(cacheKey, config, isManualPageReload);
    if (cachedEvents) {
      Logger.info(`Using ${cachedEvents.length} events from cache`);
      return [...cachedEvents];
    }
  }

  // Fetch from API if needed
  Logger.info('Fetching events from API');
  const entities = config.entities.map((e) =>
    typeof e === 'string' ? { entity: e, color: 'var(--primary-text-color)' } : e,
  );

  const timeWindow = getTimeWindow(config.days_to_show);
  const fetchedEvents = await fetchEvents(hass, entities, timeWindow);

  // Create a mutable copy and cache the results
  const eventData = Array.from(fetchedEvents);
  cacheEvents(cacheKey, eventData);

  return eventData;
}

/**
 * Fetch calendar events from Home Assistant API
 * @private Internal utility used by fetchEventData
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
 * Parse and validate cache entry
 * Helper function to ensure consistent cache validation
 *
 * @param key - Cache key
 * @param config - Card configuration for cache duration
 * @param isManualPageReload - Whether this check is during a manual page reload
 * @returns Valid cache entry or null if invalid/expired
 */
export function getValidCacheEntry(
  key: string,
  config?: Types.Config,
  isManualPageReload: boolean = false,
): Types.CacheEntry | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const cache = JSON.parse(item) as Types.CacheEntry;
    const now = Date.now();

    // Determine cache duration based on context
    let cacheDuration;

    // Only apply short cache duration if refresh_on_navigate is enabled
    // and this is a manual page reload/navigation
    if (isManualPageReload && config?.refresh_on_navigate) {
      cacheDuration = Constants.CACHE.MANUAL_RELOAD_CACHE_DURATION_SECONDS * 1000;
    } else {
      // Otherwise use normal cache duration
      cacheDuration = getCacheDuration(config);
    }

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
 * @param isManualPageReload - Whether this check is during a manual page reload
 * @returns Cached events or null if expired/unavailable
 */
export function getCachedEvents(
  key: string,
  config?: Types.Config,
  isManualPageReload: boolean = false,
): Types.CalendarEventData[] | null {
  const cacheEntry = getValidCacheEntry(key, config, isManualPageReload);
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

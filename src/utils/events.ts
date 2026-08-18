/**
 * Event utilities for Calendar Card Pro
 * Functions for fetching, processing, caching, and organizing calendar events
 */

import * as FormatUtils from './format';
import * as Helpers from './helpers';
import * as Logger from './logger';
import { isWeekRelative, parseStartDateExpression } from './start-date';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import * as Localize from '../translations/localize';

//-----------------------------------------------------------------------------
// HIGH-LEVEL API FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Raw fetches that have been started but not yet settled, keyed by cache key.
 *
 * Three independent paths start the first load — `setConfig()`, `connectedCallback()`
 * and the `updated()` arm that fires when `hass` arrives — and Home Assistant assigns
 * both the config and `hass` before it appends the card, so all three run before any
 * of them has written the cache. Without this map one configured calendar produced
 * three round-trips. The editor's two live previews are the same shape: they share a
 * cache key by design, but a shared key only helps once an entry exists.
 *
 * Only the raw payload is shared. Each caller still processes it against its own live
 * config, so joining a request never leaks another caller's display options.
 */
const inFlightRawFetches = new Map<string, Promise<Types.EventFetchResult>>();

/**
 * Fetch calendar event data with caching support
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
): Promise<Types.EventFetchResult> {
  // Resolved before the key is built, not after. `first_day_of_week: 'system'` is a
  // single config string that resolves to a different weekday per user profile, so
  // keying on the raw value gave a Sunday-start and a Monday-start week one shared
  // cache entry whenever `start_date` was week-relative.
  const firstDayOfWeek = FormatUtils.getFirstDayOfWeek(config.first_day_of_week, hass.locale);

  const cacheKey = getBaseCacheKey(
    instanceId,
    config.entities,
    config.days_to_show,
    config.start_date,
    firstDayOfWeek,
  );

  const isManualPageReload = isManualPageLoad();
  if (!force) {
    const cachedEvents = getCachedEvents(cacheKey, config, isManualPageReload);
    if (cachedEvents) {
      Logger.info(`Using ${cachedEvents.length} events from cache`);
      return {
        events: processRawEvents(cachedEvents, config, firstDayOfWeek),
        failedEntities: [],
      };
    }
  }

  let rawFetch = inFlightRawFetches.get(cacheKey);
  if (rawFetch) {
    Logger.info('Joining an in-flight request for the same calendars and window');
  } else {
    rawFetch = fetchRawEvents(hass, config, cacheKey, firstDayOfWeek);
    inFlightRawFetches.set(cacheKey, rawFetch);
  }

  const { events: fetchedEvents, failedEntities } = await rawFetch;

  return { events: processRawEvents(fetchedEvents, config, firstDayOfWeek), failedEntities };
}

/**
 * Perform one API round-trip and cache its raw payload.
 *
 * Returns the events exactly as the API supplied them; callers apply their own config.
 * The in-flight entry is cleared in `finally` so a failure cannot pin a stale promise
 * and block every later attempt at the same window.
 *
 * @param hass Home Assistant instance
 * @param config Calendar card configuration
 * @param cacheKey Key under which to cache the raw payload
 * @param firstDayOfWeek Resolved first day of the week, used to build the time window
 * @returns Promise resolving to the raw events and any entities that failed
 */
async function fetchRawEvents(
  hass: Types.Hass,
  config: Types.Config,
  cacheKey: string,
  firstDayOfWeek: number,
): Promise<Types.EventFetchResult> {
  try {
    Logger.info('Fetching events from API');
    const entities = config.entities.map((e) =>
      typeof e === 'string' ? { entity: e, color: 'var(--primary-text-color)' } : e,
    );

    const timeWindow = getTimeWindow(config.days_to_show, config.start_date, firstDayOfWeek);
    const { events: fetchedEvents, failedEntities } = await fetchEvents(hass, entities, timeWindow);

    if (fetchedEvents.length > 0) {
      cacheEvents(cacheKey, fetchedEvents);
    } else if (failedEntities.length > 0) {
      Logger.warn(
        `No events returned and ${failedEntities.length} calendar(s) failed to load; not caching empty result`,
      );
    } else {
      const emptyTtlMs = Constants.CACHE.EMPTY_RESULTS_CACHE_DURATION_SECONDS * 1000;
      Logger.info(
        `No events returned; caching empty result briefly (${Constants.CACHE.EMPTY_RESULTS_CACHE_DURATION_SECONDS}s)`,
      );
      cacheEvents(cacheKey, fetchedEvents, emptyTtlMs);
    }

    return { events: fetchedEvents, failedEntities };
  } finally {
    inFlightRawFetches.delete(cacheKey);
  }
}

function processRawEvents(
  rawEvents: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
  firstDayOfWeek: number,
): Types.CalendarEventData[] {
  const processedEvents = processEvents(rawEvents, config);

  const referenceDate = getStartDateReference(config, firstDayOfWeek);
  const limitDate = new Date(referenceDate);
  limitDate.setDate(limitDate.getDate() + config.days_to_show);

  return processedEvents.filter((event) => {
    if (!event.start) return false;

    let eventDate: Date;
    if (event.start.dateTime) {
      eventDate = new Date(event.start.dateTime);
    } else if (event.start.date) {
      eventDate = FormatUtils.parseAllDayDate(event.start.date);
    } else {
      return false;
    }

    return eventDate < limitDate;
  });
}

/**
 * Drop events that are missing a start or an end.
 *
 * Everything downstream — deduplication, grouping, multi-day splitting, sorting — reads
 * `start` and `end` without checking they are there, because Home Assistant's calendar API
 * is supposed to supply both. Whichever integration backs the entity actually produces the
 * payload, though, so a malformed event does reach us in practice, and an exception thrown
 * while grouping does not cost that one event a row: it costs the whole card, taking every
 * other calendar's events down with it.
 *
 * Applied at both entry points, because they are reachable independently: the fetch path
 * processes events before they are ever grouped, while `groupEventsByDay` deduplicates
 * whatever it is handed before any of that filtering has run.
 *
 * @param events Events to check
 * @returns Only those events with both a start and an end
 */
function keepWellFormedEvents(
  events: ReadonlyArray<Types.CalendarEventData>,
): Types.CalendarEventData[] {
  return events.filter((event) => Boolean(event.start) && Boolean(event.end));
}

function deduplicateEvents(
  events: Types.CalendarEventData[],
  config: Types.Config,
  enabled: boolean,
): Types.CalendarEventData[] {
  if (!enabled || events.length < 2) {
    return events;
  }

  const seen = new Set<string>();
  const keep = new Set<Types.CalendarEventData>();

  for (const entityConfig of config.entities) {
    const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;

    for (const event of events) {
      if (event._entityId !== entityId) continue;

      const signature = generateEventSignature(event);
      if (seen.has(signature)) continue;

      seen.add(signature);
      keep.add(event);
    }
  }

  return events.filter((event) => keep.has(event) || !seen.has(generateEventSignature(event)));
}

/**
 * Group events by display day.
 *
 * @param rawEvents Calendar events to group
 * @param rawConfig Card configuration, with or without the `column:` block applied
 * @param isExpanded Whether the card is in expanded mode
 * @param language Language code for date calculations
 * @param effectiveView View currently being rendered
 * @param hassLocale Home Assistant locale, so `first_day_of_week: system` can follow it
 * @returns Day buckets containing the matching events
 */
export function groupEventsByDay(
  rawEvents: Types.CalendarEventData[],
  rawConfig: Types.Config,
  isExpanded: boolean,
  language: string,
  effectiveView: Types.EffectiveView = 'list',
  hassLocale?: { language?: string; first_weekday?: string },
): Types.EventsByDay[] {
  // Resolved once, at the boundary, so every read below is view-aware without each
  // one having to remember to ask for itself. Roughly a dozen override-capable
  // options are read in this function and its helpers; when only some of them went
  // through a resolver, the rest silently ignored the `column:` block for any caller
  // that had not already applied it. Callers in `calendar-card-pro.ts` do pass the
  // effective config, and this is a no-op on one — the resolver re-reads the same
  // block and reaches the same answer — so this is here to make the function correct
  // on its own terms rather than to fix a live defect.
  const config = ViewConfig.resolveEffectiveConfig(rawConfig, effectiveView);

  const events = deduplicateEvents(
    keepWellFormedEvents(rawEvents),
    config,
    config.filter_duplicates,
  );

  const showEmptyDays = config.show_empty_days;

  const compactLimitsApply = !isExpanded && ViewConfig.viewAppliesCompactLimits(effectiveView);

  // Always run the splitter and let `shouldSplitEvent` decide per event, rather
  // than gating the call on the card-level value. A per-entity
  // `split_multiday_events: true` has to win over a card-level `false`, and a
  // gate here would never consult it. In column view `viewForcesMultidaySplit`
  // ignores the per-entity opt-out instead, so later days of a multi-day event
  // cannot vanish from their columns.
  const splitEvents = processMultiDayEvents(
    events,
    config,
    ViewConfig.viewForcesMultidaySplit(effectiveView),
  );

  const referenceDate = getStartDateReference(
    config,
    FormatUtils.getFirstDayOfWeek(config.first_day_of_week, hassLocale),
  );
  const referenceStart = new Date(referenceDate);
  const referenceEnd = new Date(referenceStart);
  referenceEnd.setHours(23, 59, 59, 999);

  // Upper bound of the configured window. Multi-day events are split into
  // per-day segments just above, and a segment can land past the window when an
  // event starts inside it but runs beyond. Splitting used to happen at fetch
  // time, where `processRawEvents` trimmed those segments before they were ever
  // grouped; now that it is view-scoped and happens here, the same bound has to
  // be applied here. Without it `days_to_show` — a `.slice()` over days that
  // have events, not a date range — would fill with days past the window.
  const windowEnd = new Date(referenceStart);
  windowEnd.setDate(windowEnd.getDate() + config.days_to_show);

  const now = new Date();

  const upcomingEvents = splitEvents.filter((event) => {
    if (!event?.start || !event?.end) return false;

    const isAllDayEvent = !event.start.dateTime;

    let startDate: Date | null;
    let endDate: Date | null;

    if (isAllDayEvent) {
      startDate = event.start.date ? FormatUtils.parseAllDayDate(event.start.date) : null;
      endDate = event.end.date ? FormatUtils.parseAllDayDate(event.end.date) : null;

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

    // Upper window bound, segments only. Whole events are already bounded at
    // fetch time by `processRawEvents`; segments are not, because they are
    // created here rather than there. An event starting inside the window but
    // running past it yields segments beyond the window, and `days_to_show` is
    // a `.slice()` over days that have events rather than a date range, so
    // those segments would push real days out of the card.
    if (event._isMultiDaySegment && startDate >= windowEnd) return false;

    // Only the third term below decides anything for events this card can actually
    // receive. An event starting inside the window, or after it, necessarily also ends
    // at or after the window start, so `isOngoingEvent` is already true in both cases —
    // removing the first two leaves the whole suite green. They diverge only for an
    // event whose end precedes its start: `keepWellFormedEvents` checks that `start` and
    // `end` are present but not that they are ordered, so a malformed feed can still
    // produce one, while nothing built here can — every multi-day segment ends at least
    // a millisecond after it starts. Left in place rather than folded into one condition
    // because dropping them would silently stop rendering those malformed events.
    const isEventOnOrAfterReference = startDate >= referenceStart && startDate <= referenceEnd;
    const isFutureEvent = startDate > referenceEnd;
    const isOngoingEvent = endDate >= referenceStart;

    if (!(isEventOnOrAfterReference || isFutureEvent || isOngoingEvent)) {
      return false;
    }

    if (!config.show_past_events) {
      if (!isAllDayEvent && endDate < now) {
        return false;
      }
    }

    return true;
  });

  const eventsByDay: Record<string, Types.EventsByDay> = {};

  if (upcomingEvents.length > 0) {
    upcomingEvents.forEach((event) => {
      const isAllDayEvent = !event.start.dateTime;

      let startDate: Date | null;
      let endDate: Date | null;

      if (isAllDayEvent) {
        startDate = event.start.date ? FormatUtils.parseAllDayDate(event.start.date) : null;
        endDate = event.end.date ? FormatUtils.parseAllDayDate(event.end.date) : null;

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

      let displayDate: Date;

      if (startDate >= referenceStart) {
        displayDate = startDate;
      } else if (endDate.toDateString() === referenceStart.toDateString()) {
        displayDate = referenceStart;
      } else if (startDate < referenceStart && endDate > referenceStart) {
        displayDate = referenceStart;
      } else {
        displayDate = startDate;
      }

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
        location:
          (getEntitySetting(event._entityId, 'show_location', config, event) ??
          config.show_location)
            ? FormatUtils.formatLocation(event.location || '', config.remove_location_country)
            : '',
        description:
          (getEntitySetting(event._entityId, 'show_description', config, event) ??
          config.show_description)
            ? FormatUtils.stripHtmlTags(event.description || '')
            : '',
        start: event.start,
        end: event.end,
        _entityId: event._entityId,
        _entityLabel: getEntityLabel(event._entityId, config, event),
        _matchedConfig: event._matchedConfig,
        _isEmptyDay: event._isEmptyDay,
        _isCustomEmptyText: event._isCustomEmptyText,
        _isMultiDaySegment: event._isMultiDaySegment,
      });
    });
  }

  const firstDayOfWeek = FormatUtils.getFirstDayOfWeek(config.first_day_of_week, hassLocale);

  Object.values(eventsByDay).forEach((day) => {
    const dayDate = new Date(day.timestamp);

    day.weekNumber = calculateWeekNumberWithMajorityRule(dayDate, config, firstDayOfWeek);

    day.monthNumber = dayDate.getMonth();
  });

  Object.values(eventsByDay).forEach((day) => {
    day.events.sort((a, b) => {
      const aIsAllDay = !a.start.dateTime;
      const bIsAllDay = !b.start.dateTime;

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

      if (aIsAllDay && bIsAllDay && aStart === bStart) {
        const aEntityIndex = getEntityIndex(a._entityId, config);
        const bEntityIndex = getEntityIndex(b._entityId, config);

        if (aEntityIndex !== bEntityIndex) {
          return aEntityIndex - bEntityIndex;
        }

        return (a.summary || '').localeCompare(b.summary || '', undefined, { sensitivity: 'base' });
      }

      return aStart - bStart;
    });
  });

  const effectiveDaysToShow = compactLimitsApply
    ? Math.min(config.compact_days_to_show || config.days_to_show, config.days_to_show)
    : config.days_to_show;

  let days = Object.values(eventsByDay)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, effectiveDaysToShow || 3);

  if (compactLimitsApply) {
    const entityConfigEventCounts = new Map<string, number>();

    for (const day of days) {
      const filteredEvents: Types.CalendarEventData[] = [];
      for (const event of day.events) {
        if (event._isEmptyDay) {
          filteredEvents.push(event);
          continue;
        }
        const entityId = event._entityId;
        const matchedConfig = event._matchedConfig;
        let configIdx = -1;
        if (matchedConfig) {
          configIdx = config.entities.findIndex(
            (e) => typeof e === 'object' && e === matchedConfig,
          );
        } else if (entityId) {
          configIdx = config.entities.findIndex((e) => typeof e === 'string' && e === entityId);
        }
        const configKey = configIdx !== -1 ? `${entityId}__${configIdx}` : entityId || '';
        const entityMaxEvents = matchedConfig?.compact_events_to_show;
        if (typeof entityMaxEvents !== 'number' || !Number.isFinite(entityMaxEvents)) {
          filteredEvents.push(event);
          continue;
        }
        const currentCount = entityConfigEventCounts.get(configKey) || 0;
        if (currentCount < entityMaxEvents) {
          filteredEvents.push(event);
          entityConfigEventCounts.set(configKey, currentCount + 1);
        }
      }
      day.events = filteredEvents;
    }
  }

  if (!isExpanded && !showEmptyDays) {
    days = days.filter(
      (day) => day.events.length > 0 && !(day.events.length === 1 && day.events[0]._isEmptyDay),
    );
  }

  // The `_isEmptyDay` guards below — and the matching term in the filter just above —
  // are inert for every input this function can receive. Empty-day placeholders are
  // synthesized further down, after compaction, so no day reaching this point carries
  // one: both callers pass raw calendar events, never a previous grouping result.
  // Replacing any of these conditions with a thrower leaves the whole suite green.
  //
  // They are kept because the two branches disagree about what should happen if that
  // ordering ever changes: the complete-days branch drops empty days, since they never
  // enter `daysStarted`, while the branch below keeps them and exempts them from the
  // event budget. Deleting them would erase that divergence rather than settle it, so
  // moving placeholder creation ahead of this block stays a deliberate decision with a
  // chosen answer instead of a silent change in what the card renders.
  if (compactLimitsApply) {
    const maxEvents = config.compact_events_to_show;

    if (typeof maxEvents === 'number' && Number.isFinite(maxEvents)) {
      let filteredDays: Types.EventsByDay[] = [];
      let totalEventsShown = 0;

      if (config.compact_events_complete_days) {
        const daysStarted = new Set<string>();

        for (const day of days) {
          if (day.events.length === 1 && day.events[0]._isEmptyDay) {
            continue;
          }

          if (totalEventsShown < maxEvents && day.events.length > 0) {
            const eventsToShow = Math.min(day.events.length, maxEvents - totalEventsShown);

            if (eventsToShow > 0) {
              daysStarted.add(FormatUtils.getLocalDateKey(new Date(day.timestamp)));
              totalEventsShown += eventsToShow;
            }
          }
        }

        filteredDays = days.filter((day) => {
          const dayKey = FormatUtils.getLocalDateKey(new Date(day.timestamp));
          return daysStarted.has(dayKey);
        });
      } else {
        filteredDays = [];

        // The comparisons in this block are early exits, not decisions, and mutating
        // them is unobservable — `totalEventsShown` is incremented by
        // `slice(0, remainingEvents)`, so it reaches `maxEvents` and never exceeds it,
        // which makes `>` false exactly where `>=` is true. Flipping one only stops the
        // loop breaking early; the remaining days then compute `remainingEvents === 0`,
        // push nothing, and the output is byte-identical. `totalEventsShown < maxEvents`
        // above, `eventsToShow > 0`, `remainingEvents > 0` and the break's empty-day
        // exemption are all equivalent for the same reason. Measured over a 1,279-row
        // differential — 5 event layouts x 8 budgets x `show_empty_days` x
        // `compact_events_complete_days` x 4 `compact_days_to_show` x `isExpanded` — at
        // 0 differing rows, against 281 and 42 for two controls in the same block.
        // Worth keeping as a real early exit; **no test can close them, so do not write
        // one.** The `_isEmptyDay` operands are a separate matter: placeholders are
        // created after this block, so that operand is dead today, and the tests in
        // `compact-single-event-days.test.ts` pin the property that outlives the
        // ordering rather than the ordering itself.
        for (const day of days) {
          if (
            totalEventsShown >= maxEvents &&
            !(day.events.length === 1 && day.events[0]._isEmptyDay)
          ) {
            break;
          }

          if (day.events.length === 1 && day.events[0]._isEmptyDay) {
            filteredDays.push(day);
            continue;
          }

          const remainingEvents = maxEvents - totalEventsShown;

          if (remainingEvents > 0 && day.events.length > 0) {
            const limitedDay: Types.EventsByDay = {
              ...day,
              events: day.events.slice(0, remainingEvents),
            };

            filteredDays.push(limitedDay);
            totalEventsShown += limitedDay.events.length;
          }
        }
      }

      days = filteredDays;
    }
  }

  if (showEmptyDays || days.length === 0) {
    const translations = Localize.getTranslations(language);

    const customEmptyText = config.empty_day_text;
    const hasCustomEmptyText = Boolean(customEmptyText);
    const emptyDayText = customEmptyText || translations.noEvents;

    const startDateForEmptyDays = new Date(referenceDate);

    let endDateForEmptyDays: Date;

    if (isExpanded) {
      endDateForEmptyDays = new Date(referenceDate);
      endDateForEmptyDays.setDate(endDateForEmptyDays.getDate() + effectiveDaysToShow - 1);
    } else if (days.length === 0) {
      if (showEmptyDays) {
        endDateForEmptyDays = new Date(referenceDate);
        endDateForEmptyDays.setDate(endDateForEmptyDays.getDate() + effectiveDaysToShow - 1);
      } else {
        endDateForEmptyDays = new Date(referenceDate);
      }
    } else if (compactLimitsApply && config.compact_events_to_show) {
      if (days.length > 0) {
        const lastDayTimestamp = Math.max(...days.map((d) => d.timestamp));
        endDateForEmptyDays = new Date(lastDayTimestamp);
      } else {
        endDateForEmptyDays = new Date(referenceDate);
      }
    } else {
      // Everything else pads to the full window, including a compact day limit with no
      // event limit: `effectiveDaysToShow` has already been narrowed to that limit above,
      // so that case needs no branch of its own. It used to have one, whose body was a
      // byte-for-byte copy of this block, which read as a special case while doing nothing
      // a reader could distinguish from the default.
      endDateForEmptyDays = new Date(referenceDate);
      endDateForEmptyDays.setDate(endDateForEmptyDays.getDate() + effectiveDaysToShow - 1);
    }

    const existingDayKeys = new Set(
      days.map((day) => FormatUtils.getLocalDateKey(new Date(day.timestamp))),
    );

    const allDays: Types.EventsByDay[] = [...days];

    const dayDiff = FormatUtils.getCalendarDayDiff(startDateForEmptyDays, endDateForEmptyDays);

    for (let i = 0; i <= dayDiff; i++) {
      const currentDate = new Date(startDateForEmptyDays);
      currentDate.setDate(startDateForEmptyDays.getDate() + i);

      const dateKey = FormatUtils.getLocalDateKey(currentDate);

      if (!existingDayKeys.has(dateKey)) {
        const weekNumber = calculateWeekNumberWithMajorityRule(currentDate, config, firstDayOfWeek);

        const dayObj: Types.EventsByDay = {
          weekday: translations.daysOfWeek[currentDate.getDay()],
          day: currentDate.getDate(),
          month: translations.months[currentDate.getMonth()],
          timestamp: currentDate.getTime(),
          events: [
            {
              summary: emptyDayText,
              start: { date: dateKey },
              end: { date: dateKey },
              _entityId: '_empty_day_',
              _isEmptyDay: true,
              _isCustomEmptyText: hasCustomEmptyText,
              location: '',
            },
          ],
          weekNumber,
          monthNumber: currentDate.getMonth(),
        };

        allDays.push(dayObj);
      }
    }

    allDays.sort((a, b) => a.timestamp - b.timestamp);
    days = allDays;
  }

  return days.slice(0, effectiveDaysToShow);
}

function getEntityIndex(entityId: string | undefined, config: Types.Config): number {
  if (!entityId) return Number.MAX_SAFE_INTEGER;

  const index = config.entities.findIndex((e) =>
    typeof e === 'string' ? e === entityId : e.entity === entityId,
  );

  return index !== -1 ? index : Number.MAX_SAFE_INTEGER;
}

//-----------------------------------------------------------------------------
// EVENT PROCESSING & FILTERING
//-----------------------------------------------------------------------------

function processEvents(
  events: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
): Types.CalendarEventData[] {
  const processedEvents: Types.CalendarEventData[] = [];

  const wellFormed = keepWellFormedEvents(events);
  const malformedCount = events.length - wellFormed.length;
  if (malformedCount > 0) {
    Logger.warn(
      `Ignoring ${malformedCount} calendar event(s) missing a start or end; the calendar integration returned an incomplete payload`,
    );
  }

  config.entities.forEach((entityConfig) => {
    const entityId = typeof entityConfig === 'string' ? entityConfig : entityConfig.entity;
    const entityEvents = wellFormed.filter((event) => event._entityId === entityId);
    if (entityEvents.length === 0) return;

    const matchedEvents = filterEventsForEntity(entityEvents, entityConfig);

    const decoratedEvents = matchedEvents.map((event) => {
      const decorated: Types.CalendarEventData = {
        ...event,
        _matchedConfig: typeof entityConfig === 'object' ? entityConfig : undefined,
      };
      decorated._entityLabel = getEntityLabel(entityId, config, decorated);
      return decorated;
    });

    processedEvents.push(...decoratedEvents);
  });

  // Multi-day splitting deliberately does NOT happen here. This runs against the
  // raw card config, before the effective view is known, so splitting at this
  // point bakes the top-level `split_multiday_events` into `this.events` and a
  // view-scoped override can never undo it — `column: { split_multiday_events:
  // false }` was silently defeated whenever the top-level value was `true`.
  // `groupEventsByDay` resolves the option per view and splits there instead,
  // which also avoids materialising segments that fall outside the window.
  Logger.debug(`Processed ${processedEvents.length} events after filtering`);
  return processedEvents;
}

function processMultiDayEvents(
  events: Types.CalendarEventData[],
  config: Types.Config,
  ignorePerEntityOverride = false,
): Types.CalendarEventData[] {
  const result: Types.CalendarEventData[] = [];

  for (const event of events) {
    if (!shouldSplitEvent(event, config, ignorePerEntityOverride)) {
      result.push(event);
      continue;
    }

    if (!isMultiDayEvent(event)) {
      result.push(event);
      continue;
    }

    const segments = splitMultiDayEvent(event);
    result.push(...segments);
  }

  return result;
}

function isMultiDayEvent(event: Types.CalendarEventData): boolean {
  if (!event.start || !event.end) return false;

  if (event.start.date && event.end.date) {
    const startDate = new Date(event.start.date);
    const endDate = new Date(event.end.date);
    endDate.setDate(endDate.getDate() - 1);

    return startDate.toDateString() !== endDate.toDateString();
  }

  if (event.start.dateTime && event.end.dateTime) {
    const startDate = new Date(event.start.dateTime);
    const endDate = new Date(event.end.dateTime);

    return startDate.toDateString() !== endDate.toDateString();
  }

  return false;
}

function shouldSplitEvent(
  event: Types.CalendarEventData,
  config: Types.Config,
  ignorePerEntityOverride = false,
): boolean {
  if (
    !ignorePerEntityOverride &&
    event._entityId &&
    event._matchedConfig &&
    typeof event._matchedConfig.split_multiday_events !== 'undefined'
  ) {
    return event._matchedConfig.split_multiday_events;
  }

  return config.split_multiday_events;
}

function formatAllDayDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function splitMultiDayEvent(event: Types.CalendarEventData): Types.CalendarEventData[] {
  const segments: Types.CalendarEventData[] = [];

  if (event.start.date && event.end.date) {
    const startDate = FormatUtils.parseAllDayDate(event.start.date);
    const endDate = FormatUtils.parseAllDayDate(event.end.date);
    endDate.setDate(endDate.getDate() - 1); // Adjust end date (exclusive in iCal)

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const currentDateStr = formatAllDayDate(date);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = formatAllDayDate(nextDate);

      const segment: Types.CalendarEventData = {
        ...event,
        start: { date: currentDateStr },
        end: { date: nextDateStr },
        _isMultiDaySegment: true,
      };

      segments.push(segment);
    }
  } else if (event.start.dateTime && event.end.dateTime) {
    const startDateTime = new Date(event.start.dateTime);
    const endDateTime = new Date(event.end.dateTime);

    const firstDayEnd = new Date(startDateTime);
    firstDayEnd.setHours(23, 59, 59, 999);

    // An event that ends at exactly local midnight occupies no time on the following
    // day, so it is not multi-day. Testing against the last millisecond of the start
    // day treated it as one and pushed a zero-length segment (start === end) into the
    // next day's bucket, which surfaced as a phantom entry there. Testing against the
    // next day's first millisecond instead keeps the event whole and preserves the end
    // time the user actually set, rather than truncating it to 23:59:59.999.
    const nextDayStart = new Date(firstDayEnd.getTime() + 1);

    if (nextDayStart < endDateTime) {
      const firstDaySegment: Types.CalendarEventData = {
        ...event,
        start: { dateTime: startDateTime.toISOString() },
        end: { dateTime: firstDayEnd.toISOString() },
        _isMultiDaySegment: true,
      };
      segments.push(firstDaySegment);

      const middleStart = new Date(startDateTime);
      middleStart.setDate(middleStart.getDate() + 1);
      middleStart.setHours(0, 0, 0, 0);

      const lastDayStart = new Date(endDateTime);
      lastDayStart.setHours(0, 0, 0, 0);

      for (
        let date = new Date(middleStart);
        date < lastDayStart;
        date.setDate(date.getDate() + 1)
      ) {
        const currentDateStr = formatAllDayDate(date);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = formatAllDayDate(nextDate);

        const middleDaySegment: Types.CalendarEventData = {
          ...event,
          start: { date: currentDateStr },
          end: { date: nextDateStr },
          _isMultiDaySegment: true,
        };

        segments.push(middleDaySegment);
      }

      const lastDaySegment: Types.CalendarEventData = {
        ...event,
        start: { dateTime: lastDayStart.toISOString() },
        end: { dateTime: endDateTime.toISOString() },
        _isMultiDaySegment: true,
      };
      segments.push(lastDaySegment);
    } else {
      segments.push({ ...event });
    }
  }

  return segments;
}

function filterEventsForEntity(
  events: Types.CalendarEventData[],
  entityConfig: string | Types.EntityConfig,
): Types.CalendarEventData[] {
  if (typeof entityConfig === 'string') {
    return [...events];
  }

  let matchedEvents = [...events];

  if (entityConfig.allowlist) {
    try {
      const allowPattern = new RegExp(entityConfig.allowlist, 'i');
      matchedEvents = matchedEvents.filter(
        (event) => event.summary && allowPattern.test(event.summary),
      );
    } catch (error) {
      Logger.warn(`Invalid allowlist pattern: ${entityConfig.allowlist}`, error);
    }
  } else if (entityConfig.blocklist) {
    try {
      const blockPattern = new RegExp(entityConfig.blocklist, 'i');
      matchedEvents = matchedEvents.filter(
        (event) => !(event.summary && blockPattern.test(event.summary)),
      );
    } catch (error) {
      Logger.warn(`Invalid blocklist pattern: ${entityConfig.blocklist}`, error);
    }
  }

  return matchedEvents;
}

function generateEventSignature(event: Types.CalendarEventData): string {
  const summary = event.summary || '';
  const location = event.location || '';

  let timeSignature = '';

  if (event.start.dateTime) {
    const startTime = new Date(event.start.dateTime).getTime();
    const endTime = event.end.dateTime ? new Date(event.end.dateTime).getTime() : 0;
    timeSignature = `${startTime}|${endTime}`;
  } else {
    timeSignature = `${event.start.date || ''}|${event.end.date || ''}`;
  }

  return `${summary}|${timeSignature}|${location}`;
}

//-----------------------------------------------------------------------------
// DATA ACCESS FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Get entity accent color with applied opacity
 *
 * @param entityId - The entity ID to find color for
 * @param config - Current card configuration
 * @param opacity - Opacity value (0-100), if omitted returns solid color
 * @param event - Optional event data containing matched configuration
 * @returns Color string ready for use in CSS with opacity applied if requested
 */
export function getEntityAccentColorWithOpacity(
  entityId: string | undefined,
  config: Types.Config,
  opacity?: number,
  event?: Types.CalendarEventData,
): string {
  if (!entityId) return 'var(--calendar-card-line-color-vertical)';

  let entityConfig;
  if (event && event._matchedConfig) {
    entityConfig = event._matchedConfig;
  } else {
    entityConfig = config.entities.find(
      (e) =>
        (typeof e === 'string' && e === entityId) ||
        (typeof e === 'object' && e.entity === entityId),
    );
  }

  const baseColor =
    typeof entityConfig === 'string'
      ? config.accent_color // Use accent_color for simple entity strings
      : entityConfig?.accent_color || config.accent_color;

  if (opacity === undefined || opacity === 0 || isNaN(opacity)) {
    return baseColor;
  }

  return Helpers.convertToRGBA(baseColor, opacity);
}

/**
 * Get entity label from configuration based on entity ID
 *
 * @param entityId - The entity ID to find label for
 * @param config - Current card configuration
 * @param event - Optional event data containing matched configuration
 * @returns Label string or undefined if not set
 */
export function getEntityLabel(
  entityId: string | undefined,
  config: Types.Config,
  event?: Types.CalendarEventData,
): string | undefined {
  if (!entityId) return undefined;

  if (event && event._matchedConfig) {
    return event._matchedConfig.label;
  }

  const entityConfig = config.entities.find(
    (e) =>
      (typeof e === 'string' && e === entityId) || (typeof e === 'object' && e.entity === entityId),
  );

  if (!entityConfig || typeof entityConfig === 'string') return undefined;

  return entityConfig.label;
}

/**
 * Get entity-specific setting or fall back to global setting
 *
 * @param entityId - The entity ID to check settings for
 * @param settingName - Name of the setting to retrieve
 * @param config - Current card configuration
 * @param event - Optional event data containing matched configuration
 * @returns The entity-specific setting if available, or undefined if not set
 */
export function getEntitySetting<K extends keyof Types.EntityConfig>(
  entityId: string | undefined,
  settingName: K,
  config: Types.Config,
  event?: Types.CalendarEventData,
): Types.EntityConfig[K] | undefined {
  if (!entityId) return undefined;

  if (event && event._matchedConfig) {
    return event._matchedConfig[settingName];
  }

  const entityConfig = config.entities.find(
    (e) =>
      (typeof e === 'string' && e === entityId) || (typeof e === 'object' && e.entity === entityId),
  );

  if (!entityConfig || typeof entityConfig === 'string') return undefined;

  return entityConfig[settingName];
}

/**
 * Check if an event is currently running (started but not yet ended)
 *
 * @param event Calendar event to check
 * @returns True if the event is currently running
 */
export function isEventCurrentlyRunning(event: Types.CalendarEventData): boolean {
  if (!event || event._isEmptyDay) return false;

  const now = new Date();
  const isAllDayEvent = !event.start.dateTime;

  if (isAllDayEvent) return false;

  const startDateTime = event.start.dateTime ? new Date(event.start.dateTime) : null;
  const endDateTime = event.end.dateTime ? new Date(event.end.dateTime) : null;

  if (!startDateTime || !endDateTime) return false;

  return now >= startDateTime && now < endDateTime;
}

/**
 * Calculate progress percentage for a running event
 *
 * @param event Calendar event to calculate progress for
 * @returns Progress percentage (0-100) or null if event is not running
 */
export function calculateEventProgress(event: Types.CalendarEventData): number | null {
  if (!isEventCurrentlyRunning(event)) return null;

  const now = new Date();
  const startDateTime = new Date(event.start.dateTime!);
  const endDateTime = new Date(event.end.dateTime!);

  const totalDuration = endDateTime.getTime() - startDateTime.getTime();
  const elapsedTime = now.getTime() - startDateTime.getTime();

  const progressPercentage = Math.min(
    100,
    Math.max(0, Math.floor((elapsedTime / totalDuration) * 100)),
  );

  return progressPercentage;
}

//-----------------------------------------------------------------------------
// DATA FETCHING & API FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Fetch calendar events from Home Assistant API
 */
export async function fetchEvents(
  hass: Types.Hass,
  entities: Array<Types.EntityConfig>,
  timeWindow: { start: Date; end: Date },
): Promise<Types.EventFetchResult> {
  const allEvents: Types.CalendarEventData[] = [];
  const failedEntities: string[] = [];

  const fetchedEntityIds = new Set<string>();

  for (const entityConfig of entities) {
    if (fetchedEntityIds.has(entityConfig.entity)) {
      continue;
    }

    try {
      const path = `calendars/${entityConfig.entity}?start=${timeWindow.start.toISOString()}&end=${timeWindow.end.toISOString()}`;
      Logger.info(`Fetching calendar events with path: ${path}`);

      const events = await hass.callApi('GET', path);

      if (!events || !Array.isArray(events)) {
        Logger.warn(`Invalid response for ${entityConfig.entity}`);
        failedEntities.push(entityConfig.entity);
        continue;
      }

      const processedEvents = (events as Types.CalendarEventData[]).map(
        (event: Types.CalendarEventData) => ({
          ...event,
          _entityId: entityConfig.entity,
        }),
      );

      allEvents.push(...processedEvents);

      fetchedEntityIds.add(entityConfig.entity);
    } catch (error) {
      Logger.error(`Failed to fetch events for ${entityConfig.entity}:`, error);
      failedEntities.push(entityConfig.entity);

      try {
        Logger.info(
          'Available hass API methods:',
          Object.keys(hass).filter((k) => typeof hass[k as keyof Types.Hass] === 'function'),
        );
      } catch {}
    }
  }

  return { events: allEvents, failedEntities };
}

/**
 * Calculate time window for event fetching
 *
 * @param daysToShow - Number of days to show in the calendar
 * @param startDate - Optional start date: a relative expression (`today+7`,
 *   `start_of_week`, `monday+1w`, …), an ISO string, or `YYYY-MM-DD`
 * @param firstDayOfWeek - Resolved first day of week (0 = Sunday, 1 = Monday),
 *   required by week-relative expressions such as `start_of_week`
 * @returns Object containing start and end dates for the calendar window
 */
export function getTimeWindow(
  daysToShow: number,
  startDate: string | undefined,
  firstDayOfWeek: number,
): { start: Date; end: Date } {
  let start: Date;

  const today = (): Date => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const rawStartDate = startDate === undefined || startDate === null ? '' : String(startDate);

  if (rawStartDate.trim() !== '') {
    try {
      const trimmed = rawStartDate.trim();

      const parsed = parseStartDateExpression(trimmed, firstDayOfWeek, new Date());

      if (parsed.kind === 'ok') {
        start = parsed.date;

        if (isNaN(start.getTime())) {
          Logger.warn(
            `start_date "${trimmed}" resolved outside the supported date range. Falling back to today.`,
          );
          start = today();
        } else {
          Logger.info(`Resolved start_date "${trimmed}" to ${FormatUtils.getLocalDateKey(start)}`);
        }
      } else if (parsed.kind === 'error') {
        Logger.warn(`Invalid start_date "${trimmed}": ${parsed.message}. Falling back to today.`);
        start = today();
      } else if (trimmed.includes('T')) {
        start = new Date(trimmed);

        if (isNaN(start.getTime())) {
          Logger.warn(`Invalid ISO date: ${trimmed}, falling back to today`);
          start = today();
        }
      } else {
        const [year, month, day] = trimmed.split('-').map(Number);

        if (year && month && day && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          start = new Date(year, month - 1, day);

          // `new Date(y, m - 1, d)` cannot fail on numbers this guard already bounded —
          // it rolls a day past the end of its month forward instead, so `2025-02-30`
          // becomes March 2 and an `isNaN` check here never fires. Reading the parts back
          // is the only way to tell a real date from one JavaScript quietly moved.
          if (
            start.getFullYear() !== year ||
            start.getMonth() !== month - 1 ||
            start.getDate() !== day
          ) {
            Logger.warn(`Impossible date: ${trimmed}, falling back to today`);
            start = today();
          }
        } else {
          Logger.warn(`Malformed date: ${trimmed}, falling back to today`);
          start = today();
        }
      }
    } catch (error) {
      Logger.warn(`Error parsing date: ${rawStartDate}, falling back to today`, error);
      start = today();
    }
  } else {
    start = today();
  }

  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  const days = parseInt(daysToShow.toString()) || 3;
  end.setDate(start.getDate() + days);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Determine whether the current page load is a manual reload.
 *
 * @returns True when browser navigation metadata identifies a reload
 */
export function isManualPageLoad(): boolean {
  if (window.performance && window.performance.navigation) {
    return window.performance.navigation.type === 1; // reload
  }

  if (window.performance && window.performance.getEntriesByType) {
    const navEntries = window.performance.getEntriesByType('navigation');
    if (navEntries.length > 0 && 'type' in navEntries[0]) {
      return (navEntries[0] as { type: string }).type === 'reload';
    }
  }

  return false;
}

//-----------------------------------------------------------------------------
// CACHE MANAGEMENT FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Read cached event data if it is still valid.
 *
 * @param key Cache key
 * @param config Card configuration
 * @param isManualPageReload Whether this check happens during a manual reload
 * @returns Cached events, or null when absent or expired
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
 * Store event data in localStorage.
 *
 * @param key Cache key
 * @param events Calendar event data to cache
 * @param ttlMs Optional entry-specific TTL in milliseconds
 * @returns True when the entry can be read back
 */
export function cacheEvents(
  key: string,
  events: Types.CalendarEventData[],
  ttlMs?: number,
): boolean {
  try {
    Logger.info(`Caching ${events.length} events`);
    const cacheEntry: Types.CacheEntry = {
      events,
      timestamp: Date.now(),
    };

    if (typeof ttlMs === 'number' && ttlMs > 0) {
      cacheEntry.ttlMs = ttlMs;
    }

    localStorage.setItem(key, JSON.stringify(cacheEntry));

    return getValidCacheEntry(key) !== null;
  } catch (e) {
    Logger.error('Failed to cache calendar events:', e);
    return false;
  }
}

/**
 * Generate a base cache key from configuration
 * The key includes only API payload inputs; presentation and filtering options are
 * reapplied after every cache read.
 *
 * @param instanceId - Component instance ID for uniqueness
 * @param entities - Calendar entities
 * @param daysToShow - Number of days to display
 * @param startDate - Optional start date in YYYY-MM-DD format, ISO format, or the
 *   relative grammar (`start_of_week`, `monday+1w`, …)
 * @param firstDayOfWeek - Resolved numeric first day of week (0 = Sunday), which moves
 *   the window whenever `startDate` uses a week-relative expression. Numeric, not the
 *   raw `first_day_of_week` string: `'system'` resolves to a different weekday per user
 *   profile, so keying on the raw value gave two different windows one cache entry.
 * @returns Base cache key
 */
export function getBaseCacheKey(
  instanceId: string,
  entities: Array<string | Types.EntityConfig>,
  daysToShow: number,
  startDate?: string,
  firstDayOfWeek?: number,
): string {
  const entityIds = entities
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join('_');

  let normalizedStartDate = '';
  if (startDate) {
    try {
      if (startDate.includes('T')) {
        normalizedStartDate = startDate.split('T')[0];
      } else {
        normalizedStartDate = startDate;
      }
    } catch {
      normalizedStartDate = startDate; // Fallback to original
    }
  }

  const startDatePart = normalizedStartDate ? `_${normalizedStartDate}` : '';

  // Asked of the grammar rather than restated here. A regex over the raw value drifted
  // both ways: it matched `end_of_week`, which is not an anchor, and missed anything
  // carrying whitespace, because `getTimeWindow` trims before parsing and this did not —
  // so a quoted `" start_of_week"` was keyed as absolute while its window moved.
  //
  // Explicitly against `undefined`, not truthiness: Sunday resolves to 0, so a truthy
  // test would drop it from the key and collide a Sunday-start week with "no weekday".
  const firstDayPart =
    isWeekRelative(normalizedStartDate) && firstDayOfWeek !== undefined
      ? `_fdw${firstDayOfWeek}`
      : '';

  return `${Constants.CACHE.EVENT_CACHE_KEY_PREFIX}${instanceId}_${entityIds}_${daysToShow}${startDatePart}${firstDayPart}${Constants.VERSION.CURRENT}`;
}

/**
 * Verify that a parsed cache payload has the shape the render path assumes.
 *
 * @param value Value parsed from localStorage
 * @returns True when the value is a usable cache entry
 */
function isCacheEntryShape(value: unknown): value is Types.CacheEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const candidate = value as Partial<Types.CacheEntry>;

  if (typeof candidate.timestamp !== 'number' || !Number.isFinite(candidate.timestamp))
    return false;
  if (!Array.isArray(candidate.events)) return false;

  return candidate.events.every(
    (event) => typeof event === 'object' && event !== null && !Array.isArray(event),
  );
}

/**
 * Parse and validate a cache entry.
 *
 * @param key Cache key
 * @param config Card configuration
 * @param isManualPageReload Whether this validation happens during a manual reload
 * @returns Valid cache entry, or null when missing, malformed or expired
 */
export function getValidCacheEntry(
  key: string,
  config?: Types.Config,
  isManualPageReload: boolean = false,
): Types.CacheEntry | null {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const parsed: unknown = JSON.parse(item);

    // The cast alone trusted whatever the key held. Anything that survived
    // JSON.parse was treated as an entry, so a stale shape from an older
    // version — or a value written by something else — reached the render path.
    // A string `events` was the worst of them: iterating it yields characters,
    // so the card rendered garbage *and* counted the entry as a hit, which
    // suppressed the refetch that would have repaired it. Reject the entry so
    // the normal miss path refetches instead.
    if (!isCacheEntryShape(parsed)) {
      localStorage.removeItem(key);
      Logger.warn(`Malformed cache entry removed for ${key}`);
      return null;
    }

    const cache = parsed;
    const now = Date.now();

    let cacheDuration;

    if (typeof cache.ttlMs === 'number' && cache.ttlMs > 0) {
      cacheDuration = cache.ttlMs;
    } else if (isManualPageReload && config?.refresh_on_navigate) {
      cacheDuration = Constants.CACHE.MANUAL_RELOAD_CACHE_DURATION_SECONDS * 1000;
    } else {
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
 * Resolve the configured cache duration.
 *
 * @param config Card configuration
 * @returns Cache duration in milliseconds
 */
export function getCacheDuration(config?: Types.Config): number {
  return (config?.refresh_interval || Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES) * 60 * 1000;
}

//-----------------------------------------------------------------------------
// DATE HANDLING HELPERS
//-----------------------------------------------------------------------------

function getStartDateReference(config: Types.Config, firstDayOfWeek: number): Date {
  if (config.start_date && String(config.start_date).trim() !== '') {
    const timeWindow = getTimeWindow(config.days_to_show, config.start_date, firstDayOfWeek);
    return timeWindow.start;
  }

  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Calculate the week number using the majority-day rule.
 *
 * @param date Date to calculate from
 * @param firstDayOfWeek First day of the week, where 0 is Sunday
 * @returns Week number adjusted for majority ownership
 */
export function calculateWeekNumberWithMajorityRule(
  date: Date,
  config: Types.Config,
  firstDayOfWeek: number,
): number | null {
  let weekNumber = FormatUtils.getWeekNumber(date, config.show_week_numbers, firstDayOfWeek);

  if (config.show_week_numbers === 'iso' && firstDayOfWeek === 0 && date.getDay() === 0) {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    weekNumber = FormatUtils.getISOWeekNumber(nextDay);
  }

  return weekNumber;
}

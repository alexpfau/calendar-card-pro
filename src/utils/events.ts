/**
 * Event utilities for Calendar Card Pro
 * Functions for fetching, processing, caching, and organizing calendar events
 */

import * as EntityColors from './entity-colors';
import * as EntityIcons from './entity-icons';
import * as EventAge from './event-age';
import * as FormatUtils from './format';
import * as Helpers from './helpers';
import * as Logger from './logger';
import { isWeekRelative, parseStartDateExpression } from './start-date';
import * as TextReplace from './text-replace';
import * as Config from '../config/config';
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

//-----------------------------------------------------------------------------
// RENDER-TIME PER-CALENDAR FILTERS
//-----------------------------------------------------------------------------
//
// Both of the filters below are read from the `_matchedConfig` stamp while events are
// **grouped**, not while they are processed, which is what keeps them out of
// `PROCESSING_TIME_KEYS`: nothing about them is baked into `this.events`, so an edit
// reaches the screen on the next render. They are also per-calendar only, so the entity
// list changes whenever either does and `serializeEntities` already forces a reprocess —
// belt and braces, but the render-time read is the load-bearing half.
//
// They run **after** `processMultiDayEvents`, which is the opposite of where
// `filterEventsByType` has to sit and for a related reason. Splitting rewrites the middle
// days of a timed multi-day event as `start: { date }`, so a filter reading an event's
// *class* must precede it. These two read an event's *day* instead, which only exists once
// the splitter has decided how many days the event occupies.

/**
 * Which day a grouped event is drawn on.
 *
 * Extracted so the weekday filter and the grouping pass cannot disagree about it. The
 * distinction matters most for an event already in progress when the window opens: it is
 * clamped to the window's first day, so its row lands on a day its own `start` never
 * names. Filtering on the start date would then hide — or fail to hide — the wrong row.
 *
 * The second and third tests are reached only when `startDate < referenceStart`, since the
 * first returned otherwise; the original inline form repeated that as an explicit conjunct.
 *
 * @param startDate Event start, as the caller resolved it for its all-day-ness
 * @param endDate Event end, likewise, with the all-day exclusive day already removed
 * @param referenceStart Local midnight on the window's first day
 * @returns The day the event's row belongs to
 */
function resolveDisplayDate(startDate: Date, endDate: Date, referenceStart: Date): Date {
  if (startDate >= referenceStart) return startDate;
  if (endDate.toDateString() === referenceStart.toDateString()) return referenceStart;
  if (endDate > referenceStart) return referenceStart;

  return startDate;
}

/** `HH:MM`, or `HH:MM:SS`. A single-digit hour is accepted; 24 and above is not. */
const TIME_OF_DAY_PATTERN = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;

/** Values already reported as unparseable, so one typo warns once rather than per event. */
const reportedExpiryValues = new Set<string>();

/**
 * Read a wall-clock time of day out of a configured string.
 *
 * @param value Configured value, from a calendar's `allday_expires_at`
 * @returns The time, or `null` when the value is absent or not a time
 */
function parseTimeOfDay(
  value: unknown,
): { hours: number; minutes: number; seconds: number } | null {
  if (typeof value !== 'string') return null;

  const match = TIME_OF_DAY_PATTERN.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  if (hours > 23) return null;

  return { hours, minutes: Number(match[2]), seconds: match[3] ? Number(match[3]) : 0 };
}

/**
 * The instant an all-day event stops counting as upcoming.
 *
 * 🚨 The **default matters as much as the option**, and supplying it is what closes the
 * older defect this function also fixes. An all-day event has no end instant — its end is a
 * date — so the timed test beside this one could not be applied to it: `endDate` is local
 * midnight *at the start* of the last day, so from 00:00:01 onward every all-day event
 * happening **today** would have read as past. The card therefore exempted all-day events
 * from expiry altogether, which is right for today and wrong for every day before it. With
 * `show_past_events: false` and a window reaching backwards — `start_date: 'today-7'`, or
 * `start_of_week` mid-week — a finished all-day event kept its row while every timed event
 * beside it was correctly hidden.
 *
 * Supplying the missing instant fixes both at once. An all-day event is past at **midnight
 * after its last day**, so today's survives the whole day and last Saturday's does not, and
 * `allday_expires_at` moves that instant earlier *within* the final day. The option and the
 * default are then one rule at two settings rather than two mechanisms.
 *
 * The last day is the event's own, not today's, so a Monday-to-Wednesday holiday retires on
 * Wednesday night rather than on Monday's.
 *
 * An unparseable value falls back to midnight rather than to never, on the same principle
 * as `resolveEventType`: a typo should leave the card behaving as though the option were
 * absent. It is reported once per distinct value, because this runs per event and a silent
 * typo is a support question nobody can answer.
 *
 * 🚨 Nothing schedules a render at the returned instant. The card's only timer is the
 * refresh interval, so an event retires on the first render after its moment passes.
 *
 * @param endDate Last day the event covers, at local midnight
 * @param configured The calendar's `allday_expires_at`, unvalidated
 * @returns The local instant from which the event counts as past
 */
function allDayExpiryInstant(endDate: Date, configured: unknown): Date {
  const time = parseTimeOfDay(configured);

  if (!time) {
    if (typeof configured === 'string' && configured.trim() !== '') {
      const value = configured.trim();
      if (!reportedExpiryValues.has(value)) {
        reportedExpiryValues.add(value);
        Logger.warn(`Invalid allday_expires_at value "${value}" — expected a time such as 10:00`);
      }
    }

    // Midnight after the last day, built by adding a calendar day rather than by naming
    // 24:00, so a DST transition on that night shifts it correctly.
    const midnight = new Date(endDate);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);

    return midnight;
  }

  const expiresAt = new Date(endDate);
  expiresAt.setHours(time.hours, time.minutes, time.seconds, 0);

  return expiresAt;
}

/**
 * Which days of the week one calendar may put a row on.
 *
 * Per-calendar only, and deliberately so. The request behind it (#225) is a school-holidays
 * calendar whose entries run through the weekend, on a card that must keep showing every
 * *other* calendar's weekend events — so a card-wide value would answer a question nobody
 * asked, and narrowing the card's date window cannot express it at all.
 *
 * An unrecognized value filters nothing, so a typo shows too much rather than too little —
 * the same principle `resolveEventType` follows, and the reason this returns `undefined`
 * rather than throwing on a value the union does not name.
 *
 * @param entityConfig The calendar's own settings, where it has any
 * @returns The days that calendar's events may land on, or `undefined` for every day
 */
function resolveDaysOfWeek(
  entityConfig: Types.EntityConfig | undefined,
): Types.DaysOfWeekFilter | undefined {
  const configured = entityConfig?.days_of_week;

  return configured === 'weekdays' || configured === 'weekends' ? configured : undefined;
}

/**
 * Whether a day satisfies one calendar's `days_of_week`.
 *
 * @param displayDate The day the row would land on
 * @param filter The calendar's resolved filter
 * @returns True when the row may stay
 */
function dayPassesWeekFilter(displayDate: Date, filter: Types.DaysOfWeekFilter): boolean {
  return FormatUtils.isWeekendDate(displayDate) === (filter === 'weekends');
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

      // The all-day half of the same rule, and the half that needs an instant computed for
      // it. `show_past_events` decides *whether* past events are shown; the expiry decides
      // *when* an all-day event becomes past. With `show_past_events: true` there is
      // nothing for either to do, which is why both sit inside this branch.
      //
      // 🚨 A segment split out of a **timed** event reads as all-day here — splitting
      // rewrites the middle days as `start: { date }` — so it reaches this branch and the
      // configured time must not be applied to it. `allday_expires_at` is a statement about
      // all-day events; a conference running Monday to Wednesday is not one, and retiring
      // its Tuesday at 10:00 deleted a day out of the middle of an event still in progress.
      //
      // The configured value is withheld rather than the whole branch skipped, which is the
      // difference between fixing this and reopening the defect the option's **default**
      // was introduced to close. Skipping outright would exempt these segments from expiry
      // altogether, and a backwards window — `start_date: 'today-7'` — would then keep the
      // middle days of last week's meetings on a card that hides past events. Midnight
      // after the segment's own day is already the right answer for it.
      const configuredExpiry = event._splitFromTimedEvent
        ? undefined
        : getEntitySetting(event._entityId, 'allday_expires_at', config, event);

      if (isAllDayEvent && now >= allDayExpiryInstant(endDate, configuredExpiry)) {
        return false;
      }
    }

    const daysOfWeek = resolveDaysOfWeek(event._matchedConfig);

    if (
      daysOfWeek &&
      !dayPassesWeekFilter(resolveDisplayDate(startDate, endDate, referenceStart), daysOfWeek)
    ) {
      return false;
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

      const displayDate = resolveDisplayDate(startDate, endDate, referenceStart);

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

      const showDescription =
        getEntitySetting(event._entityId, 'show_description', config, event) ??
        config.show_description;

      // 🚨 Read the marker off the **raw** event and write the result into the display
      // copy. The `description` a few lines down is `''` whenever `show_description` is
      // off — which is the default — so scanning the display copy would leave the feature
      // doing nothing for the very people who asked for it: someone who hides
      // descriptions is exactly the person who does not want a bare `YEAR=1976` on their
      // card. Reading raw and writing display is the correct asymmetry.
      //
      // Stripping HTML *before* matching is not the same thing as reading the display
      // copy, and it is required: Google Calendar's description editor emits `&nbsp;`, so
      // `Geboren&nbsp;YEAR=1996` has no ordinary space in front of the marker until
      // entities are decoded. The prefilter keeps that off the hot path — almost no
      // description mentions "year" at all, and one regex test is cheaper than building a
      // detached textarea per event per render.
      const rawDescription = event.description || '';
      const mayCarryMarker = EventAge.mayCarryAgeMarker(rawDescription);

      const plainDescription =
        showDescription || mayCarryMarker ? FormatUtils.stripHtmlTags(rawDescription) : '';

      const markerYear = mayCarryMarker ? EventAge.readMarkerYear(plainDescription) : null;

      // The occurrence's own year, not the day the row lands on. With
      // `split_multiday_events: false` an ongoing event's display date is clamped to the
      // window start, which moves every day — so reading the display date would make the
      // count change from one day to the next while the card just sits there.
      const ageCount =
        markerYear === null ? null : EventAge.resolveAgeCount(startDate.getFullYear(), markerYear);

      const summary = event.summary || '';

      // Per-calendar text replacement (#153, #212). Read once per event and applied to
      // whichever single field it names — one field per block, because two blocks of one
      // calendar both match the same events and each pushes its own copy rather than
      // partitioning them the way two `blocklist`/`allowlist` blocks do.
      //
      // 🚨 **Ordering, which is decided here and not by accident.** Every rewrite runs on
      // the text the card has already finished formatting, so the user's pattern sees what
      // they see:
      //
      // 1. **After `formatLocation`** on a location. The country strip is end-anchored and
      //    does its own trailing-comma cleanup, so running it second would leave it
      //    matching against text a rewrite had already moved the end of.
      // 2. **After `stripHtmlTags` and the age-marker strip** on a description. A pattern
      //    should be written against the words the user typed, not against Google
      //    Calendar's `&nbsp;` and `<br>` or against card syntax the row never shows.
      // 3. **Before `appendAgeCount`** on a title, which `event-age.ts` asked for by issue
      //    number before this existed: a replacement pattern must see the calendar's own
      //    title rather than one the card has already decorated, or an end-anchored pattern
      //    has to tolerate a suffix its author never wrote.
      //
      // Written into the display copy only. Mutating `event` would bake the rewrite into
      // `this.events`, compound it on every render, and change the text the filters read.
      const replacement = TextReplace.resolveTextReplacement(
        getEntitySetting(event._entityId, 'replace_field', config, event),
        getEntitySetting(event._entityId, 'replace_pattern', config, event),
        getEntitySetting(event._entityId, 'replace_with', config, event),
      );

      const replacedSummary = TextReplace.applyTextReplacement(summary, replacement, 'title');

      // #124's count is suppressed on a title the user replaced outright, and on one their
      // pattern emptied. Both say the same thing — this event's own title is not to be
      // shown — and appending to either is the leak #212 asked to be spared: `Busy (40)`
      // announces that the hidden event is a birthday, and a bare `(40)` announces it
      // louder. A title merely *edited* keeps its count, which is the case #153 ex.1 wants:
      // stripping `Geburtstag von ` off a birthday should still say how old they are.
      //
      // 🚨 **Both sides are trimmed, and each side is trimmed for its own reason.** The
      // right-hand test has to ask the same question `appendAgeCount` asks — it draws a
      // bare count when `summary.trim()` is empty — because any disagreement between the
      // two is a leak by construction, and testing `text === ''` disagreed on precisely
      // the blank-but-not-empty titles an ordinary pattern produces: `Annas Geburtstag`
      // minus `[A-Za-z]+` is two spaces, which suppressed nothing and rendered `(40)`.
      // The left-hand side is trimmed so a title that was *already* only whitespace is not
      // read as a deletion — nothing was taken away from it, so it keeps the bare count an
      // untitled event has always drawn.
      const titleWithheld =
        replacedSummary.replacedWholeField ||
        (summary.trim() !== '' && replacedSummary.text.trim() === '');

      eventsByDay[eventDateKey].events.push({
        summary:
          ageCount === null || titleWithheld
            ? replacedSummary.text
            : EventAge.appendAgeCount(replacedSummary.text, ageCount),
        location:
          (getEntitySetting(event._entityId, 'show_location', config, event) ??
          config.show_location)
            ? TextReplace.applyTextReplacement(
                FormatUtils.formatLocation(event.location || '', config.remove_location_country),
                replacement,
                'location',
              ).text
            : '',
        description: showDescription
          ? TextReplace.applyTextReplacement(
              markerYear === null ? plainDescription : EventAge.stripAgeMarker(plainDescription),
              replacement,
              'description',
            ).text
          : '',
        start: event.start,
        end: event.end,
        _entityId: event._entityId,
        _entityLabel: getEntityLabel(event._entityId, config, event),
        _matchedConfig: event._matchedConfig,
        _isEmptyDay: event._isEmptyDay,
        _isCustomEmptyText: event._isCustomEmptyText,
        _isMultiDaySegment: event._isMultiDaySegment,
        _splitFromTimedEvent: event._splitFromTimedEvent,
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

    const matchedEvents = filterEventsForEntity(entityEvents, entityConfig, config);

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
        _splitFromTimedEvent: true,
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
          _splitFromTimedEvent: true,
        };

        segments.push(middleDaySegment);
      }

      const lastDaySegment: Types.CalendarEventData = {
        ...event,
        start: { dateTime: lastDayStart.toISOString() },
        end: { dateTime: endDateTime.toISOString() },
        _isMultiDaySegment: true,
        _splitFromTimedEvent: true,
      };
      segments.push(lastDaySegment);
    } else {
      segments.push({ ...event });
    }
  }

  return segments;
}

/**
 * Which class of event one calendar contributes.
 *
 * Per-entity first, card-level second — the same precedence `shouldSplitEvent` gives
 * `split_multiday_events`. An unrecognized value resolves to `all` rather than hiding
 * events: a typo should show too much, never too little.
 *
 * 🚨 This is the card's only *processing-time* top-level config read. Every other
 * per-calendar-capable option is applied at render time from the `_matchedConfig` stamp,
 * which is why they need no cache invalidation and this one does. Anything added here
 * must be registered in `PROCESSING_TIME_KEYS` in `config.ts`, or a card-level change to
 * it will render stale until the next refresh.
 *
 * @param entityConfig - The calendar's own settings, where it has any
 * @param config - Current card configuration
 * @returns The event class to keep for that calendar
 */
function resolveEventType(
  entityConfig: Types.EntityConfig | undefined,
  config: Types.Config,
): Types.EventType {
  const configured = entityConfig?.event_type ?? config.event_type;

  return configured === 'timed' || configured === 'all_day' ? configured : 'all';
}

/**
 * Keeps only the requested class of event.
 *
 * All-day-ness is read the way the rest of the card reads it — an event with no
 * `start.dateTime` is all-day — so this agrees with what the row will render rather
 * than with a second opinion about the same event.
 *
 * `timed` and `all_day` are exact complements, which is the property the two-block
 * pattern depends on: the same calendar listed twice, once each way, yields every event
 * exactly once.
 *
 * 🚨 Runs before `processMultiDayEvents`, and must. Splitting rewrites the middle days of
 * a *timed* multi-day event as `start: { date }` segments, which read as all-day — so a
 * filter applied after the split would keep the middle of a three-day meeting under
 * `all_day`.
 *
 * @param events - The calendar's events
 * @param type - Class to keep
 * @returns The surviving events, always a new array
 */
function filterEventsByType(
  events: ReadonlyArray<Types.CalendarEventData>,
  type: Types.EventType,
): Types.CalendarEventData[] {
  if (type === 'all') return [...events];

  const wantAllDay = type === 'all_day';

  return events.filter((event) => !event.start.dateTime === wantAllDay);
}

/**
 * The text one calendar's `blocklist` and `allowlist` are matched against.
 *
 * 🚨 Reads the event as the calendar delivered it, not as the card will draw it. The
 * display copies are made later, in `groupEventsByDay`, where `formatLocation` strips a
 * trailing country name and `stripHtmlTags` flattens the description — and where
 * `show_location: false` blanks the location outright. Filtering the drawn text would let
 * a *display* switch decide which events exist: turning descriptions off would empty the
 * subject of every `description` filter, and an allowlist would silently match nothing.
 *
 * Absent and empty behave alike, and identically to how the title filter has always
 * treated an event with no summary: an allowlist drops it, a blocklist keeps it. That is
 * what makes the two-block pattern an exact partition on any field — every event lands in
 * precisely one of the two blocks, whether or not it carries the field at all.
 *
 * @param event - Event being judged
 * @param field - Field this calendar filters on; unset means the title
 * @returns The text to match, or undefined when the event carries no such field
 */
function filterSubject(
  event: Types.CalendarEventData,
  field: Types.FilterField | undefined,
): string | undefined {
  if (field === 'location') return event.location;
  if (field === 'description') return event.description;

  return event.summary;
}

function filterEventsForEntity(
  events: Types.CalendarEventData[],
  entityConfig: string | Types.EntityConfig,
  config: Types.Config,
): Types.CalendarEventData[] {
  // Defensive rather than reachable: config normalization rewrites every bare entity id
  // into an object long before events are processed, so nothing arrives here as a string.
  // It still filters, so this cannot become the one path that ignores the card.
  if (typeof entityConfig === 'string') {
    return filterEventsByType(events, resolveEventType(undefined, config));
  }

  // Before the pattern filters, and unconditionally — a calendar that carries no settings
  // of its own still has to follow the card-level value.
  let matchedEvents = filterEventsByType(events, resolveEventType(entityConfig, config));

  const field = entityConfig.filter_field;

  if (entityConfig.allowlist) {
    try {
      const allowPattern = new RegExp(entityConfig.allowlist, 'i');
      matchedEvents = matchedEvents.filter((event) => {
        const subject = filterSubject(event, field);
        return Boolean(subject && allowPattern.test(subject));
      });
    } catch (error) {
      Logger.warn(`Invalid allowlist pattern: ${entityConfig.allowlist}`, error);
    }
  } else if (entityConfig.blocklist) {
    try {
      const blockPattern = new RegExp(entityConfig.blocklist, 'i');
      matchedEvents = matchedEvents.filter((event) => {
        const subject = filterSubject(event, field);
        return !(subject && blockPattern.test(subject));
      });
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
 * The sentinel adds one step above the existing chain rather than restructuring it: a
 * calendar deferring to Home Assistant uses the color the registry holds, and falls through
 * to whatever it would have rendered anyway when the registry holds none. That fall-through
 * is the common path, not the edge case — Google Calendar is the only integration in core
 * that populates a color, so most calendars have none until someone sets one by hand.
 *
 * @param entityId - The entity ID to find color for
 * @param config - Current card configuration
 * @param opacity - Opacity value (0-100), if omitted returns solid color
 * @param event - Optional event data containing matched configuration
 * @param registryColors - Colors Home Assistant holds, keyed by entity ID
 * @returns Color string ready for use in CSS with opacity applied if requested
 */
export function getEntityAccentColorWithOpacity(
  entityId: string | undefined,
  config: Types.Config,
  opacity?: number,
  event?: Types.CalendarEventData,
  registryColors?: ReadonlyMap<string, string>,
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

  const baseColor = resolveAccentColor(entityId, config, entityConfig, registryColors);

  if (opacity === undefined || opacity === 0 || isNaN(opacity)) {
    return baseColor;
  }

  return Helpers.convertToRGBA(baseColor, opacity);
}

/**
 * Walk the accent-color chain for one calendar.
 *
 * @param entityId - Calendar the event came from
 * @param config - Current card configuration
 * @param entityConfig - That calendar's own settings, where it has any
 * @param registryColors - Colors Home Assistant holds, keyed by entity ID
 * @returns The color to draw, before any opacity is applied
 */
function resolveAccentColor(
  entityId: string,
  config: Types.Config,
  entityConfig: string | Types.EntityConfig | undefined,
  registryColors?: ReadonlyMap<string, string>,
): string {
  const fromHomeAssistant = registryColors?.get(entityId);

  const perCalendar = typeof entityConfig === 'string' ? undefined : entityConfig?.accent_color;

  if (EntityColors.isEntityColorSentinel(perCalendar)) {
    if (fromHomeAssistant) return fromHomeAssistant;
  } else if (perCalendar) {
    return perCalendar;
  }

  if (EntityColors.isEntityColorSentinel(config.accent_color)) {
    // Nothing to fall back to at this level: the sentinel is occupying the slot the
    // card-wide literal would have held, so the shipped default is the floor.
    return fromHomeAssistant ?? Config.DEFAULT_CONFIG.accent_color;
  }

  return config.accent_color;
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
 * The label to draw for one calendar, with Home Assistant's icon substituted for the
 * sentinel that asks for it.
 *
 * 🚨 Render time, deliberately, and this is the one thing about the feature that cannot
 * move. `processEvents` bakes `_entityLabel` into the cached event, so resolving there would
 * freeze whatever icon Home Assistant held at fetch time and leave it frozen until the next
 * refresh — which is precisely the drift #188 was opened about, reintroduced by the fix for
 * it. Resolved here, changing the icon in Home Assistant repaints on its next state update.
 *
 * A calendar whose icon Home Assistant does not hold falls through to `undefined`, so
 * `renderLabel` draws nothing at all. That is the same nothing an unlabelled calendar draws,
 * rather than an `ha-icon` with no icon in it — which is a sized, empty box that indents the
 * title as though a label were there. It mirrors the colors' own fall-through, where a
 * calendar the registry has no color for renders the color it would have had anyway.
 *
 * @param entityId - Calendar the event came from
 * @param config - Current card configuration
 * @param event - Event data carrying the matched per-calendar configuration
 * @param hass - Home Assistant instance, which carries the icon in its state attributes
 * @returns The label to draw, or `undefined` when there is none
 */
export function resolveEntityLabel(
  entityId: string | undefined,
  config: Types.Config,
  event?: Types.CalendarEventData,
  hass?: Types.Hass | null,
): string | undefined {
  const label = getEntityLabel(entityId, config, event);

  if (!EntityIcons.isEntityIconSentinel(label)) return label;

  // An explicit shape outranks the sentinel, so `label_type: text` still renders the word.
  // `getLabelType` reads the sentinel as an icon precisely so this is the only way to say
  // otherwise; honouring it here as well is what keeps the two halves telling one story.
  const declared = getEntitySetting(entityId, 'label_type', config, event);
  if (Helpers.isLabelType(declared) && declared !== 'icon') return label;

  return EntityIcons.entityIcon(entityId, hass);
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

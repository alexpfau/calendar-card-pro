/**
 * Presentation models for Calendar Card Pro
 *
 * A presentation model is everything a view needs to know about an event that does *not*
 * depend on how the event is laid out: whether it has already ended, its accent colours,
 * and the pre-computed parts its body renders. The list view stacks events in table rows
 * and the column view stacks them inside a grid cell, but both ask exactly these
 * questions and must answer them identically.
 *
 * The column view work lifted this out of `renderEvent` in `render.ts`. It is not
 * abstraction ahead of need: `docs/development/column-view.md` §D1 requires the column
 * view's `.event-content` to be **byte-identical** to the list's, and that content is
 * driven by `EventContentParts`, which roughly a hundred lines of branching produce here.
 * Duplicating that branching per view would guarantee the two drift apart.
 *
 * Unlike `leaves.ts` this module contains no markup at all, so the whitespace rules that
 * govern the shared leaves do not apply — there is no template here whose indentation
 * could leak into the DOM.
 */

import type { EventContentParts } from './leaves';
import * as Types from '../config/types';
import * as EventUtils from '../utils/events';
import * as FormatUtils from '../utils/format';

/**
 * Everything about a single event that is independent of the view rendering it.
 */
export interface EventPresentation {
  /** True for the synthetic placeholder rendered on a day with no events. */
  isEmptyDay: boolean;
  /** True once the event has ended; drives the `past-event` styling in every view. */
  isPastEvent: boolean;
  /** Solid accent colour for the event's leading rule. */
  entityAccentColor: string;
  /** Accent colour at the configured background opacity, or `''` for no background. */
  entityAccentBackgroundColor: string;
  /** Pre-computed inputs for `renderEventContent`. */
  contentParts: EventContentParts;
}

/**
 * Compute the view-independent presentation of a single event.
 *
 * Deliberately takes neither the day, the event index, nor the weather forecasts: needing
 * none of them is what makes the result axis-agnostic. Anything positional — first/last
 * within its group, which cell it lands in — belongs to the container, not here.
 *
 * @param event - Event data to describe
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param hass - Home Assistant instance, used for locale-aware time formatting
 * @returns The event's view-independent presentation
 */
export function buildEventPresentation(
  event: Types.CalendarEventData,
  config: Types.Config,
  language: string,
  hass?: Types.Hass | null,
): EventPresentation {
  // Placeholder rows for days with no events; gates time, countdown and progress below.
  const isEmptyDay = Boolean(event._isEmptyDay);

  // Check if this is a past event (already ended)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let isPastEvent = false;

  if (!isEmptyDay) {
    const isAllDayEvent = !event.start.dateTime;

    if (isAllDayEvent) {
      // All-day events should NOT be marked as past when they:
      // 1. Occur today (single-day) OR
      // 2. End today (multi-day) OR
      // 3. Span across today (multi-day)

      // Get end date
      let endDate = event.end.date ? FormatUtils.parseAllDayDate(event.end.date) : null;

      // Adjust for iCal all-day end date convention (exclusive end date)
      if (endDate) {
        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
        endDate = adjustedEndDate;
      }

      // All-day events are only "past" if today is completely after their end date
      // If today is the end date or earlier, the event should NOT be greyed out
      isPastEvent = endDate !== null && today > endDate;
    } else {
      // Regular event with time - use end time to determine if it's past
      const endDateTime = event.end.dateTime ? new Date(event.end.dateTime) : null;
      isPastEvent = endDateTime !== null && now > endDateTime;
    }
  }

  // Get line color (solid) and background color (with opacity)
  const entityAccentColor = EventUtils.getEntityAccentColorWithOpacity(
    event._entityId,
    config,
    undefined,
    event,
  );

  // Explicitly check if event_background_opacity is defined and greater than 0
  const backgroundOpacity =
    config.event_background_opacity > 0 ? config.event_background_opacity : 0;
  const entityAccentBackgroundColor =
    backgroundOpacity > 0
      ? EventUtils.getEntityAccentColorWithOpacity(
          event._entityId,
          config,
          backgroundOpacity,
          event,
        )
      : ''; // Empty string for no background

  // Get entity-specific settings with fallback to global settings
  const showTime =
    EventUtils.getEntitySetting(event._entityId, 'show_time', config, event) ?? config.show_time;
  // Check if this is an all-day event
  const isAllDayEvent = !event.start.dateTime;

  // Check if this is a multi-day all-day event.
  // Asked of the event's dates via the shared predicate, never of the rendered text.
  // It used to substring-match the localized `multiDay` / `endsToday` / `endsTomorrow`
  // tokens, which made a rendering decision depend on translation wording: the formatter
  // composes that string, so this was parsing back something it already knew. Eight
  // languages translate one of those tokens to two characters, narrow enough that
  // ordinary event text could have matched by accident.
  //
  // No `isAllDayEvent &&` guard is needed — the predicate returns false for any event
  // with a `dateTime`, and repeating the check here would imply it does not.
  const isMultiDayAllDayEvent = FormatUtils.isMultiDayAllDayEvent(event);

  // Determine if we should show time for this specific event
  // Hide if:
  // 1. showTime is false (global setting or entity override) OR
  // 2. It's a SINGLE-DAY all-day event AND show_single_allday_time is false OR
  // 3. It's an empty day placeholder
  const shouldShowTime =
    showTime &&
    !(isAllDayEvent && !isMultiDayAllDayEvent && !config.show_single_allday_time) &&
    !isEmptyDay;

  // Calculate countdown if enabled
  // Hide if:
  // 1. show_countdown is false OR
  // 2. It's an all-day event AND show_countdown_allday is false OR
  // 3. It's an empty day placeholder or a past event
  let countdownStr: string | null = null;
  if (
    config.show_countdown &&
    !(isAllDayEvent && !config.show_countdown_allday) &&
    !isEmptyDay &&
    !isPastEvent
  ) {
    countdownStr = FormatUtils.getCountdownString(event, language);
  }

  // Check if event is currently running and calculate progress percentage for progress bar
  const isRunning = EventUtils.isEventCurrentlyRunning(event);
  const progressPercentage =
    isRunning && config.show_progress_bar ? EventUtils.calculateEventProgress(event) : null;

  // Format event time and location
  const eventTime = FormatUtils.formatEventTime(event, config, language, hass);
  // location and description are already filtered and formatted by groupEventsByDay()
  const eventLocation = event.location || '';
  const eventDescription = event.description || '';

  // Everything the event body needs that it must not recompute for itself.
  const contentParts: EventContentParts = {
    eventTime,
    eventLocation,
    eventDescription,
    shouldShowTime,
    countdownStr,
    progressPercentage,
  };

  return {
    isEmptyDay,
    isPastEvent,
    entityAccentColor,
    entityAccentBackgroundColor,
    contentParts,
  };
}

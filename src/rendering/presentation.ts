/**
 * View-independent event presentation for Calendar Card Pro.
 *
 * Both list and column views use these derived values so event content cannot drift.
 */

import type { EventContentParts } from './leaves';
import * as Types from '../config/types';
import * as EntityColors from '../utils/entity-colors';
import * as EventUtils from '../utils/events';
import * as FormatUtils from '../utils/format';
import * as Helpers from '../utils/helpers';

/**
 * Everything about a single event that is independent of the view rendering it.
 */
interface EventPresentation {
  isEmptyDay: boolean;

  isPastEvent: boolean;

  entityAccentColor: string;

  entityAccentBackgroundColor: string;

  contentParts: EventContentParts;
}

/**
 * Compute the view-independent presentation of a single event.
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
  const isEmptyDay = Boolean(event._isEmptyDay);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let isPastEvent = false;

  if (!isEmptyDay) {
    const isAllDayEvent = !event.start.dateTime;

    if (isAllDayEvent) {
      let endDate = event.end.date ? FormatUtils.parseAllDayDate(event.end.date) : null;

      if (endDate) {
        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
        endDate = adjustedEndDate;
      }

      isPastEvent = endDate !== null && today > endDate;
    } else {
      const endDateTime = event.end.dateTime ? new Date(event.end.dateTime) : null;
      isPastEvent = endDateTime !== null && now > endDateTime;
    }
  }

  const registryColors = EntityColors.entityColors();

  const entityAccentColor = EventUtils.getEntityAccentColorWithOpacity(
    event._entityId,
    config,
    undefined,
    event,
    registryColors,
  );

  const backgroundOpacity =
    config.event_background_opacity > 0 ? config.event_background_opacity : 0;
  const entityAccentBackgroundColor =
    backgroundOpacity > 0
      ? EventUtils.getEntityAccentColorWithOpacity(
          event._entityId,
          config,
          backgroundOpacity,
          event,
          registryColors,
        )
      : ''; // Empty string for no background

  const showTime =
    EventUtils.getEntitySetting(event._entityId, 'show_time', config, event) ?? config.show_time;
  const isAllDayEvent = !event.start.dateTime;

  const isMultiDayAllDayEvent = FormatUtils.isMultiDayAllDayEvent(event);

  const shouldShowTime =
    showTime &&
    !(isAllDayEvent && !isMultiDayAllDayEvent && !config.show_single_allday_time) &&
    !isEmptyDay;

  let countdownStr: string | null = null;
  if (
    config.show_countdown &&
    !(isAllDayEvent && !config.show_countdown_allday) &&
    !isEmptyDay &&
    !isPastEvent
  ) {
    countdownStr = FormatUtils.getCountdownString(event, language);
  }

  const isRunning = EventUtils.isEventCurrentlyRunning(event);
  const progressPercentage =
    isRunning && config.show_progress_bar ? EventUtils.calculateEventProgress(event) : null;

  const eventTimeParts = FormatUtils.formatEventTimeParts(event, config, language, hass);

  // The badge draws the all-day label itself, so at the TIME position the time text keeps
  // only what follows it — empty for a single-day all-day event, the end-date phrase for a
  // multi-day one. A split middle segment of a timed event is all-day for the day it
  // occupies, so it qualifies; an unsplit timed multi-day event carries no label and never
  // does.
  //
  // At the TITLE position the time row is left exactly as it would be with no badge at all,
  // reading "All day" or "All day, until Fri 29". That is deliberate and it is what makes
  // the two positions compose rather than compete. The title pill says *that* the event is
  // all-day; the time row says *how long* it runs, which for a multi-day event is real
  // information the pill cannot carry. Where a user finds the single-day case redundant,
  // `show_single_allday_time: false` drops that row and only that row — and unlike the time
  // position, the pill survives it, because the pill is not in the row being dropped. That
  // combination is the Apple-Calendar look: a capsule title, no time line for a single-day
  // all-day event, and the "until" line still there for a multi-day one.
  const badgePosition = Helpers.resolveAlldayBadgePosition(config.allday_badge);
  const badgeStyle = Helpers.resolveAlldayBadgeStyle(config.allday_badge_style);
  const hasAllDayLabel = eventTimeParts.allDayLabel !== undefined;

  const allDayBadge =
    badgePosition === 'time' && hasAllDayLabel
      ? {
          label: eventTimeParts.allDayLabel as string,
          lang: language,
          accent: entityAccentColor,
          mode: badgeStyle,
        }
      : undefined;

  // The title pill needs no label of its own — it wraps the title — but it does need the
  // accent and the treatment, and it must not appear on an event that is not all-day. The
  // same `allDayLabel !== undefined` test decides both positions, so the two can never
  // disagree about which events qualify.
  const titlePill =
    badgePosition === 'title' && hasAllDayLabel
      ? { accent: entityAccentColor, mode: badgeStyle }
      : undefined;

  const eventTime = allDayBadge
    ? eventTimeParts.text
    : FormatUtils.joinEventTimeParts(eventTimeParts);
  // Unlike `show_single_allday_time`, these all-day row suppressors intentionally apply to
  // multi-day all-day events too: their location and description are no less redundant than a
  // single-day all-day event's, while the time row may carry a real end date.
  const eventLocation = isAllDayEvent && !config.show_location_allday ? '' : event.location || '';
  const eventDescription =
    isAllDayEvent && !config.show_description_allday ? '' : event.description || '';

  // Read from the location the card is about to draw, not the raw event: this runs after
  // `groupEventsByDay` has applied `formatLocation`, and there is no raw copy left here.
  // That is the right text to read anyway — the icon should describe what the row says.
  const locationIcon = FormatUtils.resolveLocationIcon(
    eventLocation,
    EventUtils.getEntitySetting(event._entityId, 'location_icon', config, event),
  );

  const contentParts: EventContentParts = {
    eventTime,
    allDayBadge,
    titlePill,
    eventLocation,
    locationIcon,
    eventDescription,
    entityLabel: EventUtils.resolveEntityLabel(event._entityId, config, event, hass),
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

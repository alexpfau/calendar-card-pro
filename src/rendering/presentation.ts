/**
 * View-independent event presentation for Calendar Card Pro.
 *
 * Both list and column views use these derived values so event content cannot drift.
 */

import type { EventContentParts } from './leaves';
import * as Types from '../config/types';
import * as EventUtils from '../utils/events';
import * as FormatUtils from '../utils/format';

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

  const entityAccentColor = EventUtils.getEntityAccentColorWithOpacity(
    event._entityId,
    config,
    undefined,
    event,
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

  const eventTime = FormatUtils.formatEventTime(event, config, language, hass);
  const eventLocation = event.location || '';
  const eventDescription = event.description || '';

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

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

  // A row that collapsed two or more distinct calendars can be given an accent of its own.
  // Applied here rather than inside `getEntityAccentColorWithOpacity` so it overrides the
  // resolved value whatever produced it — a per-calendar `accent_color`, the card default,
  // or the `home-assistant` sentinel — and so the background tint below inherits it by
  // reading the same source, as does the all-day badge further down.
  const mergedAccent =
    event._mergedFrom && event._mergedFrom.length > 1 ? config.duplicate_accent_color : undefined;

  const entityAccentColor =
    mergedAccent ||
    EventUtils.getEntityAccentColorWithOpacity(
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
      ? mergedAccent
        ? Helpers.convertToRGBA(mergedAccent, backgroundOpacity)
        : EventUtils.getEntityAccentColorWithOpacity(
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

  // Two separate switches, because the two cases carry different information and a user who
  // wants one gone often wants the other kept.
  //
  // A SINGLE-day all-day event's time row says only "All day", which is exactly what the
  // badge says, so it is pure repetition once a badge is on. A MULTI-day one says "All day,
  // until Monday, Jun 29" -- the end date, which nothing else on the row carries. That asymmetry is
  // why `show_single_allday_time` was scoped the way it was, and why hiding both under it
  // would have been wrong.
  //
  // It is also why a second key rather than a widened first one: an unqualified
  // "hide all-day times" would take the end date away from anyone who only wanted the
  // redundant line gone.
  //
  // Both keys read the SAME predicate from opposite sides, so no event can fall through
  // between them or be caught by both. Note what that means once `split_multiday_events` is
  // on: every segment spans a single day, so `isMultiDayAllDayEvent` is false for all of them
  // and `show_single_allday_time` governs the lot -- including the middle days of a split
  // TIMED event, which are all-day for the day they occupy. The multi-day key only ever bites
  // on an UNSPLIT multi-day all-day event, which is the only shape that still draws an end
  // date.
  const shouldShowTime =
    showTime &&
    !(isAllDayEvent && !isMultiDayAllDayEvent && !config.show_single_allday_time) &&
    !(isMultiDayAllDayEvent && !config.show_multiday_allday_time) &&
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
  // reading "All day" or "All day, until Monday, Jun 29". That is deliberate and it is what makes
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

  // What feeds the treatment. `accent` and a custom color differ only in WHICH color the
  // pill is handed, so both arrive as the pill's accent and every stylesheet rule works
  // unchanged — a custom color is the accent, overridden card-wide. Only `text` is a
  // different question, because the answer is not a color this side of the render: it is
  // whatever the pill is nested in, which differs per position. That one carries a flag, and
  // each leaf supplies the token for its own position.
  const badgeColor = Helpers.resolveAlldayBadgeColor(config.allday_badge_color);
  const badgeAccent = badgeColor.source === 'custom' ? badgeColor.color : entityAccentColor;
  const badgeInheritsText = badgeColor.source === 'text';

  const allDayBadge =
    badgePosition === 'time' && hasAllDayLabel
      ? {
          label: eventTimeParts.allDayLabel as string,
          lang: language,
          accent: badgeAccent,
          mode: badgeStyle,
          inheritsText: badgeInheritsText,
        }
      : undefined;

  // The title pill needs no label of its own — it wraps the title — but it does need the
  // accent and the treatment, and it must not appear on an event that is not all-day. The
  // same `allDayLabel !== undefined` test decides both positions, so the two can never
  // disagree about which events qualify.
  //
  // `!isEmptyDay` is the one guard the two positions do NOT share, and leaving it out shipped
  // a pill around "No upcoming events". An empty day is a placeholder the card invents for a
  // day with nothing on it, not an event, and it carries a date-only start — so it looks
  // exactly like an all-day event to `allDayLabel` and qualified. The time position never
  // showed it because a badge is only PLACED inside the `shouldShowTime` branch and that
  // already excludes empty days; the title has no such branch to hide behind, so it needs the
  // test written out here.
  const titlePill =
    badgePosition === 'title' && hasAllDayLabel && !isEmptyDay
      ? { accent: badgeAccent, mode: badgeStyle, inheritsText: badgeInheritsText }
      : undefined;

  const eventTime = allDayBadge
    ? eventTimeParts.text
    : FormatUtils.joinEventTimeParts(eventTimeParts);
  // Unlike `show_single_allday_time`, these two apply to multi-day all-day events as well:
  // their location and description are no less redundant than a single-day all-day event's,
  // while the time row may carry a real end date.
  //
  // They stop at the middle days of a SPLIT TIMED event, which the badge deliberately does
  // not. Those days are genuinely all-day -- `splitMultiDayEvent` rewrites them as
  // `start: { date }` because the event does occupy the whole of them -- so the badge marks
  // them, and that is right. The trade is not the same here. Dropping a row because the pill
  // beside it already says "all day" is removing a repetition; dropping the VENUE from day 2
  // of a 3-day conference is losing information the other two days still show, and the
  // result reads as a fault: present, absent, present. Nobody turning off all-day locations
  // is asking for that.
  const suppressAllDayRows = isAllDayEvent && !event._splitFromTimedEvent;

  const eventLocation =
    suppressAllDayRows && !config.show_location_allday ? '' : event.location || '';
  const eventDescription =
    suppressAllDayRows && !config.show_description_allday ? '' : event.description || '';

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
    mergedLabels: EventUtils.resolveMergedLabels(event, config, hass),
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

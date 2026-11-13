/**
 * View-independent event presentation for Calendar Card Pro.
 *
 * List, column and grid views all use these derived values so event content cannot drift.
 */

import * as AccentText from './accent-text';
import type { EventContentParts } from './leaves';
import * as TextScale from './text-scale';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as EventActions from '../interaction/event-actions';
import { getNowString } from '../translations/dayjs';
import * as EntityColors from '../utils/entity-colors';
import * as EventUtils from '../utils/events';
import * as FormatUtils from '../utils/format';
import * as Helpers from '../utils/helpers';
import * as TextDirection from '../utils/text-direction';

/**
 * Everything about a single event that is independent of the view rendering it.
 */
interface EventPresentation {
  isEmptyDay: boolean;

  isPastEvent: boolean;

  /**
   * Whether the event is under way and the card marks it as "now": a timed event between its
   * start and its end, with `show_now_indicator` on. Drives the `event-now` class, which
   * colors the time row; the label itself travels in `contentParts.nowLabel`.
   */
  isNow: boolean;

  entityAccentColor: string;

  entityAccentBackgroundColor: string;

  /**
   * Custom properties the event element sets so its own text reads the calendar accent.
   *
   * Empty unless a governed color option holds the `accent` sentinel, and empty for an
   * empty-day row whatever the config says.
   */
  accentTextProperties: Readonly<Record<string, string>>;

  /**
   * Custom properties the event element sets so its text draws at its calendar's `text_scale`.
   *
   * Empty unless its block carries a scale other than 1, and always empty for an empty-day row,
   * which belongs to no calendar. See `text-scale.ts`.
   */
  textScaleProperties: Readonly<Record<string, string>>;

  /** Whether the event carries `TextScale.TEXT_SCALED_CLASS`: its scale is not 1. */
  textScaled: boolean;

  contentParts: EventContentParts;
}

/**
 * Whether an event, or an empty-day notice, is over and drawn as past.
 *
 * @param event - Event data, or an empty-day placeholder
 * @returns True once the event has ended, or the notice's date has
 */
export function isEventPast(event: Types.CalendarEventData): boolean {
  const isEmptyDay = Boolean(event._isEmptyDay);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let isPastEvent = false;

  if (isEmptyDay) {
    // An empty-day placeholder is not an event and has no interval. `groupEventsByDay`
    // builds it with `start.date === end.date ===` the date it is drawn on, so the only
    // question it can answer is whether that displayed local date has already ended.
    //
    // 🚨 This branch exists so the placeholder never reaches the real all-day branch
    // below, and that is not tidiness. A real all-day event's `end.date` is EXCLUSIVE,
    // so that branch subtracts a day to find the last date the event occupies. Run a
    // placeholder through it and the subtraction names the day BEFORE the one on
    // screen — which makes `today > endDate` true for today's own notice and dims it
    // from the moment it appears. Deleting this branch and dropping the `!isEmptyDay`
    // guard is the obvious-looking simplification and it is the one thing here that is
    // immediately visible to every user.
    //
    // `parseAllDayDate` rather than `new Date(dateString)`: the latter reads the date
    // as UTC, which lands a day early for every user behind UTC. Both halves are
    // pinned in `tests/past-empty-day-opacity.dst.test.ts`.
    //
    // Derived at render time, like real-event dimming. A visible list or column card is
    // rendered at local midnight by the clock repaint (`_nextClockRepaint`), so a notice dims
    // then, with no update from Home Assistant; a hidden tab catches up when it is shown.
    // `tests/clock-repaint.dst.test.ts` pins it. Grid draws no notice.
    isPastEvent = event.start.date ? FormatUtils.parseAllDayDate(event.start.date) < today : false;
  } else {
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

  return isPastEvent;
}

/**
 * The countdown an event carries, or null for none: the one gate every view draws through.
 *
 * @param event - Event data
 * @param config - Card configuration, resolved for the view
 * @param language - Language code
 * @param isPastEvent - Whether the event is over, when the caller already knows
 * @returns The countdown text, or null
 */
export function eventCountdown(
  event: Types.CalendarEventData,
  config: Types.Config,
  language: string,
  isPastEvent: boolean = isEventPast(event),
): string | null {
  const isAllDayEvent = !event.start.dateTime;
  if (
    !config.show_countdown ||
    (isAllDayEvent && !config.show_countdown_allday) ||
    event._isEmptyDay ||
    isPastEvent
  ) {
    return null;
  }

  return FormatUtils.getCountdownString(event, language, {
    exactDays: Boolean(config.countdown_exact_days),
    maxDays: config.countdown_max_days,
  });
}

/**
 * Which of a day's events leave their countdown out under `show_countdown: once_per_day`.
 *
 * A countdown is left out when it reads exactly as the nearest countdown above it on the same
 * day, so a day of bins counts down once. Two kinds are never left out. A countdown to a start
 * later today names a clock time ("in 5 hours"), and two of them reading alike can still name
 * different times, which would make one come and go as the minutes round. And a countdown that
 * differs stays: an event already under way when the window opens is drawn on its first day
 * but counts to its own start, so that day can read "tomorrow" above "in 7 days".
 *
 * Rows without a countdown are passed over, so an all-day row with `show_countdown_allday`
 * off, or one beyond `countdown_max_days`, never takes the first one's place. Read from the
 * day's events as drawn, after compact limits and merged duplicates, so the first drawn
 * countdown is the one kept. List and column view call this; a grid's blocks sit side by side
 * and are fitted one by one, so the grid draws every countdown.
 *
 * @param events - The day's events, in drawn order
 * @param config - Card configuration, resolved for the view
 * @param language - Language code
 * @returns The indexes of the events whose countdown is left out
 */
export function repeatedCountdowns(
  events: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
  language: string,
): ReadonlySet<number> {
  const repeated = new Set<number>();
  if (config.show_countdown !== Constants.COUNTDOWN_ONCE_PER_DAY) return repeated;

  const now = new Date();
  let above: string | null = null;
  events.forEach((event, index) => {
    const countdown = eventCountdown(event, config, language);
    if (countdown === null) return;

    const countsTheClock =
      event.start.dateTime !== undefined &&
      FormatUtils.getCalendarDayDiff(now, new Date(event.start.dateTime)) === 0;
    if (countdown === above && !countsTheClock) repeated.add(index);
    above = countdown;
  });
  return repeated;
}

/**
 * A presentation with its countdown left out.
 *
 * @param presentation - The event's presentation
 * @returns The same presentation, drawing no countdown
 */
export function withoutCountdown(presentation: EventPresentation): EventPresentation {
  return { ...presentation, contentParts: { ...presentation.contentParts, countdownStr: null } };
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

  const isPastEvent = isEventPast(event);

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

  const countdownStr = eventCountdown(event, config, language, isPastEvent);

  // `show_day_counter`: "Day 2 of 3" on a row of an event a day or more long, in the place the
  // countdown and the progress bar take. The three hand the place over in the order an event
  // lives through them: the countdown has it until the event starts, as it has today, and the
  // counter from then on, where the bar would have been. So a later day of a trip under way
  // says which day it is rather than "tomorrow", and a row with no countdown to show, because
  // it is off or out of range, names its day before the event starts too. `groupEventsByDay`
  // stamps the day only in the views that draw it.
  const dayOfEvent = config.show_day_counter && !isEmptyDay ? event._dayOfEvent : undefined;
  let dayCounter: string | null = null;
  if (
    dayOfEvent?.day != null &&
    (countdownStr === null || EventUtils.eventHasStarted(event, now))
  ) {
    countdownStr = null;
    dayCounter = FormatUtils.formatDayOfEvent(dayOfEvent.day, dayOfEvent.days, language);
  }

  const isRunning = EventUtils.isEventCurrentlyRunning(event);
  // Not gated on `isRunning`: a middle day of a split timed event reads as all-day, so it is
  // not "running" for the Now label below, but its day is part of an event under way and
  // carries the bar. `calculateEventProgress` answers null for every row that has none.
  //
  // No row of an event the day counter counts draws a bar: over a long event a bar barely moves,
  // and the counter says how far along it is instead. Asked of the event, through the stamp,
  // rather than of whether this row draws the counter, because the clock repaint asks the same
  // question of the event (`_drawsMovingClockText`): a row naming no day that still drew a bar
  // would have a bar nothing repaints.
  const progressPercentage =
    config.show_progress_bar && !dayOfEvent ? EventUtils.calculateEventProgress(event) : null;

  // All-day events never run in this sense — `isEventCurrentlyRunning` answers false for
  // them — so a day full of all-day entries does not turn into a column of "Now" labels.
  const nowLabel =
    isRunning && config.show_now_indicator && !isEmptyDay ? getNowString(language) : null;

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
  // a pill around the empty-day notice. An empty day is a placeholder the card invents for a
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
    : FormatUtils.joinEventTimeParts(eventTimeParts, language);
  // `show_location_allday` and `show_description_allday` decide these; see `shownRowText`.
  const { location: eventLocation, description: eventDescription } = shownRowText(event, config);

  // Read from the location the card is about to draw, not the raw event: this runs after
  // `groupEventsByDay` has applied `formatLocation`, and there is no raw copy left here.
  // That is the right text to read anyway — the icon should describe what the row says.
  const locationIcon = FormatUtils.resolveLocationIcon(
    eventLocation,
    EventUtils.getEntitySetting(event._entityId, 'location_icon', config, event),
  );

  const textScale = TextScale.textScaleOf(event, config);

  const contentParts: EventContentParts = {
    eventTime,
    eventTimeEnd: eventTimeParts.end,
    allDayBadge,
    titlePill,
    eventLocation,
    locationIcon,
    eventDescription,
    entityLabel: EventUtils.resolveEntityLabel(event._entityId, config, event, hass),
    entityLabelAlt: EventUtils.resolveLabelAlt(event._entityId, config, event, hass),
    mergedLabels: EventUtils.resolveMergedLabels(event, config, hass),
    shouldShowTime,
    countdownStr,
    dayCounter,
    progressPercentage,
    nowLabel,
    languageMark: TextDirection.languageMark(language, hass),
  };

  return {
    isEmptyDay,
    isPastEvent,
    isNow: nowLabel !== null,
    entityAccentColor,
    entityAccentBackgroundColor,
    accentTextProperties: AccentText.accentTextProperties(config, entityAccentColor, isEmptyDay),
    textScaleProperties: TextScale.textScaleProperties(config, textScale),
    textScaled: textScale !== 1,
    contentParts,
  };
}

/**
 * The location and the description an event row shows, before any link is drawn in them.
 *
 * `show_location_allday` and `show_description_allday` take them off all-day rows. Unlike
 * `show_single_allday_time`, these two apply to multi-day all-day events as well: their
 * location and description are no less redundant than a single-day all-day event's, while the
 * time row may carry a real end date.
 *
 * They stop at the middle days of a SPLIT TIMED event, which the badge deliberately does
 * not. Those days are genuinely all-day -- `splitMultiDayEvent` rewrites them as
 * `start: { date }` because the event does occupy the whole of them -- so the badge marks
 * them, and that is right. The trade is not the same here. Dropping a row because the pill
 * beside it already says "all day" is removing a repetition; dropping the VENUE from day 2
 * of a 3-day conference is losing information the other two days still show, and the
 * result reads as a fault: present, absent, present. Nobody turning off all-day locations
 * is asking for that.
 *
 * @param event - The event as grouping hands it to the views
 * @param config - Card configuration
 * @returns The two texts, each empty where the row draws none
 */
export function shownRowText(
  event: Types.CalendarEventData,
  config: Types.Config,
): { location: string; description: string } {
  const suppressAllDayRows = !event.start.dateTime && !event._splitFromTimedEvent;
  return {
    location: suppressAllDayRows && !config.show_location_allday ? '' : event.location || '',
    description:
      suppressAllDayRows && !config.show_description_allday ? '' : event.description || '',
  };
}

/**
 * Whether event rows draw the web addresses in their location and description as links:
 * `open_links` is on, and an event has no tap or hold of its own, so a press on a link is never
 * also a press on its event.
 *
 * Read from the configuration alone, not from whether events are targets right now: while the
 * card is edited its events are no targets whatever their actions, and the preview should draw
 * what the dashboard will. Views the option does not reach (`VIEW_SCOPE`) never ask.
 *
 * @param config - Card configuration
 * @returns True to draw the links
 */
export function rowLinksOn(config: Types.Config): boolean {
  return (
    config.open_links === true &&
    EventActions.eventActionKind(config.event_tap_action) === 'none' &&
    EventActions.eventActionKind(config.event_hold_action) === 'none'
  );
}

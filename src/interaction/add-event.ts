/**
 * What the add-event button needs to know, without opening anything.
 *
 * The button, a tap on a day and the card's own `add-event` action open the event popover on a
 * new event (`event-popover.ts`). This module decides whether there is anywhere to write, which
 * calendar and times the new event starts with, and what the button is called.
 */

import { CREATE_EVENT_FEATURE, calendarSupports } from './calendar-writes';
import type { EventTimes } from './event-times';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** Home Assistant's string for the button, so it reads as it does on the core card. */
const HA_ADD_EVENT_LABEL_KEY = 'ui.components.calendar.event.add';

/**
 * The accessible name of the card's controls that add an event, when Home Assistant has no
 * string for it: the add button and each day's add button.
 *
 * Only ever an `aria-label`: an English word drawn on a card set to another language would
 * be worse than an icon.
 */
export const UNLOCALIZED_ADD_EVENT_NAME = 'Add event';

//-----------------------------------------------------------------------------
// CONFIGURATION
//-----------------------------------------------------------------------------

/**
 * The configured calendars that accept new events, in configuration order.
 *
 * A calendar listed more than once appears once. Calendars that do not advertise the
 * create feature — typically holiday and other subscribed feeds — are left out, which is
 * what hides the button on a card that has nowhere to write to. Whether a calendar is
 * writable is the integration's call, not its name's.
 *
 * Calendars that failed on the card's last load are left out too: the popover preselects
 * the first calendar here, and preselecting one that is not answering invites a save that
 * fails, or one the card cannot show afterwards.
 *
 * @param hass - Home Assistant instance, or null before it arrives
 * @param entities - The card's configured calendars
 * @param failing - Calendars that failed on the card's most recent load
 * @returns Entity ids of writable calendars
 */
export function writableCalendarIds(
  hass: Types.Hass | null | undefined,
  entities: ReadonlyArray<string | Types.EntityConfig>,
  failing: ReadonlyArray<string> = [],
): string[] {
  if (!hass?.states) return [];

  const ids: string[] = [];
  for (const entry of entities) {
    const id = typeof entry === 'string' ? entry : entry?.entity;
    if (!id || ids.includes(id) || failing.includes(id)) continue;

    if (calendarSupports(hass, id, CREATE_EVENT_FEATURE)) {
      ids.push(id);
    }
  }

  return ids;
}

/**
 * The button label, in the language of the Home Assistant frontend.
 *
 * Taken from Home Assistant's own string table rather than the card's, because the card's
 * language files must each carry every key and Home Assistant already ships this one in
 * every language it supports. Undefined when Home Assistant has no string to give, which
 * the button answers by drawing only its icon: an English word is never drawn in its place.
 *
 * @param hass - Home Assistant instance
 * @returns Localized label, or undefined
 */
export function addEventLabel(hass: Types.Hass | null | undefined): string | undefined {
  const localized = hass?.localize?.(HA_ADD_EVENT_LABEL_KEY);
  return localized && localized !== HA_ADD_EVENT_LABEL_KEY ? localized : undefined;
}

/**
 * The date a new event starts on, before `newEventTimes` rounds it to the hour.
 *
 * Now, when today is one of the days the card covers, which opens the new event at the
 * current hour. Otherwise the first of those
 * days, at midnight, so a card looking at next month does not offer an event today; Home
 * Assistant's calendar card passes the first day of a week or day view the same way. The
 * days are the page's, whether or not the card draws a row for each of them.
 *
 * @param windowStart - First day the card covers, at local midnight
 * @param daysToShow - How many days the card covers from there
 * @param now - The current moment
 * @returns The date the new event starts on
 */
export function newEventDate(windowStart: Date, daysToShow: number, now: Date = new Date()): Date {
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + daysToShow);

  return now >= windowStart && now < windowEnd ? new Date(now) : new Date(windowStart);
}

/**
 * The span a new event added on one day of the card starts with.
 *
 * Where the press landed decides it. A press on a grid's time area names its quarter hour, and
 * the event starts there, an hour long. A press in a grid's all-day band adds an all-day event
 * on that day. Anything else on a day takes the hour it is now, as the add button does: a tap
 * on today opens at the current hour, and a tap on another day at the same clock hour that
 * day, which is a daytime hour whenever someone is adding one.
 *
 * Set as a wall-clock time on the day's own date, so a day on which the clocks change still
 * opens at that time, or at the first one after it where the time does not exist that day.
 *
 * @param dayTimestamp - The day, as any moment of it: the views stamp a day with its first
 *   event's display date where it has one
 * @param at - Where on the day: a minute from midnight a grid's time area named, `'all-day'`
 *   for its all-day band, or undefined to take the hour it is now
 * @param now - The current moment
 * @returns The span
 */
export function newEventTimesOn(
  dayTimestamp: number,
  at?: number | 'all-day',
  now: Date = new Date(),
): EventTimes {
  const day = new Date(dayTimestamp);
  day.setHours(0, 0, 0, 0);
  if (at === 'all-day') {
    return { allDay: true, start: day, end: new Date(day) };
  }
  const start = new Date(day);
  if (at === undefined) {
    start.setHours(now.getHours(), 0, 0, 0);
  } else {
    start.setHours(0, at, 0, 0);
  }
  return { allDay: false, start, end: new Date(start.getTime() + 60 * 60 * 1000) };
}

/**
 * The calendar a new event starts in: the first of the writable ones the
 * card currently shows.
 *
 * A calendar the legend hides is passed over, so hiding one never opens a new event in it.
 * When the legend hides every writable calendar the first writable one is taken anyway: the
 * popover's calendar picker offers all of the card's writable calendars, so this is only where
 * the choice starts, and adding must not stop working because of a filter.
 *
 * @param writable - The card's writable calendars, in configuration order
 * @param hidden - The calendars the legend hides now
 * @returns The calendar to preselect, or undefined when there is none
 */
export function preselectedCalendarId(
  writable: ReadonlyArray<string>,
  hidden: ReadonlySet<string>,
): string | undefined {
  return writable.find((id) => !hidden.has(id)) ?? writable[0];
}

/**
 * The span a new event starts with: the hour its date falls in, one hour long.
 *
 * @param date - The date it starts on, from `newEventDate` or `newEventDateOn`
 * @returns The span
 */
export function newEventTimes(date: Date): EventTimes {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
  return { allDay: false, start, end: new Date(start.getTime() + 60 * 60 * 1000) };
}

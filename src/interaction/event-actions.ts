/**
 * What a tap or a hold on an event runs, and the tapped event's fields it can use.
 *
 * `event_tap_action` and `event_hold_action` take `details`, which opens the event's dialog, or
 * any of Home Assistant's own actions, which the card hands to Home Assistant with the tapped
 * event's fields filled into it: `url_path: https://example.com/?q={title}`. No side effects
 * here; `calendar-card-pro.ts` runs the result.
 *
 * 🚨 **An event's text is not the dashboard owner's.** Anyone who can put an event into a
 * calendar the card shows writes its title, location and description: a shared calendar, a
 * subscribed feed, an invitation a calendar accepts on its own. So those three fill only where
 * text cannot change what the action does (`FREE_TEXT_FIELDS`). Filled into `perform_action`,
 * a target or a URL's host, a title of `lock.unlock` or a location of `evil.example` would
 * choose the service, the device or the site. Percent-encoding is not a defense there: it
 * leaves `.` alone, so a field can still name a host, or be `..` and climb out of a path.
 */

import { actionFiller } from './action-fill';
import * as Types from '../config/types';
import { stripHtmlTags } from '../utils/format';
import * as PrivateEvents from '../utils/private-events';
import * as TextReplace from '../utils/text-replace';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * The fields an event action can name, as `{title}` and so on.
 *
 * `title`, `location` and `description` are the event's own, with its calendar's text
 * replacement applied and markup removed from the description, so a calendar masked as
 * "Busy" gives "Busy". They do not follow what the card shows: a location the grid leaves
 * out, or a description `show_description` hides, is still there to use. `start` and `end` are
 * the whole event as the calendar stores it, never one day of a multi-day event the card
 * splits: ISO 8601 with its offset for a timed event, a date for an all-day one, whose end is
 * the day after its last day, as calendars store it.
 */
export const EVENT_FIELDS = [
  'title',
  'start',
  'end',
  'all_day',
  'location',
  'description',
  'calendar',
] as const;

/** One field an event action can name. */
export type EventField = (typeof EVENT_FIELDS)[number];

/**
 * The fields whose text comes from whoever wrote the event, and so may be anything. They fill
 * only into an action's payload: anything under `data` or `service_data`, a confirmation's
 * `text`, and the query or fragment of `url_path` or `navigation_path`. The other fields are
 * the event's times, its all-day flag and its calendar's entity ID, which no event can make
 * into anything but a date, a word or the configured calendar, so they fill anywhere.
 */
export const FREE_TEXT_FIELDS: ReadonlySet<EventField> = new Set([
  'title',
  'location',
  'description',
]);

// What an event action amounts to lives in a module of its own, which the editor reads too
// without taking this one's text handling with it.
export { eventActionKind, type EventActionKind } from './event-action-kind';

//-----------------------------------------------------------------------------
// FIELDS
//-----------------------------------------------------------------------------

/**
 * The tapped event's fields, as an event action names them.
 *
 * Read from `_source`, what the calendar returned, rather than from the row: a row carries
 * only what the card shows, so a location the grid hides, or any description while
 * `show_description` is off, would come through empty, and a title would carry an age count
 * the card appended. The calendar's text replacement is applied as the row applies it, from
 * the configuration the event was matched under, so a masked calendar stays masked. A private
 * entry's event fills its title, location and description as its popover shows them, Private
 * where the event has one (`private-events.ts`).
 *
 * @param event - A rendered event
 * @param language - The card's language, for a private event's placeholder
 * @returns Every field, each a string, empty where the event has none
 */
export function eventFields(
  event: Types.CalendarEventData,
  language: string,
): Record<EventField, string> {
  const source = event._source ?? event;
  const start = source.start?.dateTime ?? source.start?.date ?? '';
  const end = source.end?.dateTime ?? source.end?.date ?? '';
  const allDay = !source.start?.dateTime && Boolean(source.start?.date);

  const matched = event._matchedConfig;
  const rule = TextReplace.resolveTextReplacement(
    matched?.replace_field,
    matched?.replace_pattern,
    matched?.replace_with,
  );
  const replaced = (text: string | null | undefined, field: Types.ReplaceField) =>
    TextReplace.applyTextReplacement(text ?? '', rule, field).text;
  const shown = PrivateEvents.isPrivate(event)
    ? PrivateEvents.privateText(source, matched, language)
    : undefined;

  return {
    title: shown ? shown.title : replaced(source.summary, 'title'),
    start,
    end,
    all_day: allDay ? 'true' : 'false',
    location: shown ? shown.location : replaced(source.location, 'location'),
    description: shown
      ? shown.description
      : replaced(source.description ? stripHtmlTags(source.description) : '', 'description'),
    calendar: event._entityId ?? '',
  };
}

//-----------------------------------------------------------------------------
// FILLING
//-----------------------------------------------------------------------------

/** Fills an event's fields into an action; see `actionFiller` for the rules. */
const fillEvent = actionFiller(EVENT_FIELDS, FREE_TEXT_FIELDS);

/**
 * An event action with the tapped event's fields filled in, for Home Assistant to run, or
 * undefined when it must not run.
 *
 * The event's times, its all-day flag and its calendar fill anywhere. Its title, location and
 * description fill only into the payload (see `FREE_TEXT_FIELDS`); an action that puts one
 * anywhere else does not run. The rest of the rules, the name of the action never filled and a
 * filled `url` opening only over http or https among them, are `actionFiller`'s.
 *
 * @param action - `event_tap_action` or `event_hold_action`, one Home Assistant runs
 * @param fields - The tapped event's fields
 * @returns The action to run, or undefined when it must not run
 */
export function fillEventAction(
  action: Types.ActionConfig,
  fields: Record<EventField, string>,
): Types.ActionConfig | undefined {
  return fillEvent(action, fields);
}

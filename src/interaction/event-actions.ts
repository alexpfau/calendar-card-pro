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

import * as Types from '../config/types';
import { stripHtmlTags } from '../utils/format';
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

/** The keys whose value is part of a URL, where a field's value is percent-encoded. */
const URL_KEYS: ReadonlySet<string> = new Set(['url_path', 'navigation_path']);

/** Keys whose whole subtree is the action's payload, where free text may go. */
const PAYLOAD_KEYS: ReadonlySet<string> = new Set(['data', 'service_data']);

/** Schemes a `url` action may open once a field has been filled into its URL. */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set(['http', 'https']);

/** `{title}` and the rest; any other name in braces is left as written. */
const FIELD_PATTERN = new RegExp(`\\{(${EVENT_FIELDS.join('|')})\\}`, 'g');

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
 * the configuration the event was matched under, so a masked calendar stays masked.
 *
 * @param event - A rendered event
 * @returns Every field, each a string, empty where the event has none
 */
export function eventFields(event: Types.CalendarEventData): Record<EventField, string> {
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

  return {
    title: replaced(source.summary, 'title'),
    start,
    end,
    all_day: allDay ? 'true' : 'false',
    location: replaced(source.location, 'location'),
    description: replaced(
      source.description ? stripHtmlTags(source.description) : '',
      'description',
    ),
    calendar: event._entityId ?? '',
  };
}

//-----------------------------------------------------------------------------
// FILLING
//-----------------------------------------------------------------------------

/** Where a string sits in the action, which decides what may be filled into it. */
interface Place {
  /** The key the string sits under. */
  key: string | undefined;
  /** Whether the string is inside the action's payload, where free text may go. */
  payload: boolean;
}

/** Thrown, and caught by `fillEventAction`, when free text would land outside the payload. */
class OutsidePayload extends Error {}

/**
 * Fill the fields into one string, refusing free text where it could change what the action
 * does.
 *
 * In a URL, everything before the first `?` or `#` is the scheme, the host and the path, which
 * decide where it leads; free text may follow it only. Each field is percent-encoded there,
 * so it stays one query value.
 *
 * @param text - A value of the action as configured
 * @param fields - The event's fields
 * @param place - Where the value sits
 * @returns The string filled, and whether any field was
 */
function fillString(
  text: string,
  fields: Record<EventField, string>,
  place: Place,
): { text: string; filled: boolean } {
  const isUrl = place.key !== undefined && URL_KEYS.has(place.key);
  const freeFrom = isUrl ? firstIndexOf(text, ['?', '#']) : place.payload ? 0 : Infinity;

  let filled = false;
  const result = text.replace(FIELD_PATTERN, (_match, name: EventField, offset: number) => {
    if (FREE_TEXT_FIELDS.has(name) && offset < freeFrom) throw new OutsidePayload();
    filled = true;
    const value = fields[name];
    return isUrl ? encodeURIComponent(value) : value;
  });
  return { text: result, filled };
}

/**
 * The first index of any of several characters, or `Infinity` when none occurs.
 *
 * @param text - Text to search
 * @param chars - Characters to find
 * @returns The lowest index found
 */
function firstIndexOf(text: string, chars: ReadonlyArray<string>): number {
  const found = chars.map((char) => text.indexOf(char)).filter((index) => index >= 0);
  return found.length ? Math.min(...found) : Infinity;
}

/**
 * Fill the fields into a value, however deep: strings are filled, objects and arrays walked,
 * anything else kept. Keys are never filled.
 *
 * @param value - A value of the action as configured
 * @param fields - The event's fields
 * @param place - Where the value sits
 * @param filledKeys - Collects the keys a field was filled into
 * @returns The filled copy
 */
function fillValue(
  value: unknown,
  fields: Record<EventField, string>,
  place: Place,
  filledKeys: Set<string>,
): unknown {
  if (typeof value === 'string') {
    const { text, filled } = fillString(value, fields, place);
    if (filled && place.key !== undefined) filledKeys.add(place.key);
    return text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => fillValue(item, fields, place, filledKeys));
  }
  if (value && typeof value === 'object') {
    const isConfirmation = place.key === 'confirmation' && !place.payload;
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        fillValue(
          child,
          fields,
          {
            key: childKey,
            payload:
              place.payload ||
              PAYLOAD_KEYS.has(childKey) ||
              (isConfirmation && childKey === 'text'),
          },
          filledKeys,
        ),
      ]),
    );
  }
  return value;
}

/**
 * The scheme a URL opens with, lowercased, or undefined for a path or a relative URL.
 *
 * @param url - A URL as an action holds it
 * @returns The scheme, without its colon
 */
function urlScheme(url: string): string | undefined {
  return /^\s*([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
}

/**
 * An event action with the tapped event's fields filled in, for Home Assistant to run, or
 * undefined when it must not run.
 *
 * Every string in the action is filled, at any depth, except the name of the action itself, so
 * an event can never choose which action runs. The event's times, its all-day flag and its
 * calendar fill anywhere. Its title, location and description fill only into the payload (see
 * `FREE_TEXT_FIELDS`); an action that puts one anywhere else does not run, rather than running
 * with it left unfilled and failing somewhere less obvious. A name in braces that is not a field
 * is left as written.
 *
 * A `url` action whose URL had a field filled into it must open over http or https or be a
 * path, so a field cannot ride on a `javascript:` URL the configuration itself wrote.
 *
 * @param action - `event_tap_action` or `event_hold_action`, one Home Assistant runs
 * @param fields - The tapped event's fields
 * @returns The action to run, or undefined when it must not run
 */
export function fillEventAction(
  action: Types.ActionConfig,
  fields: Record<EventField, string>,
): Types.ActionConfig | undefined {
  const filledKeys = new Set<string>();
  const filled: Record<string, unknown> = { action: action.action };
  try {
    for (const [key, value] of Object.entries(action)) {
      if (key === 'action') continue;
      filled[key] = fillValue(value, fields, { key, payload: PAYLOAD_KEYS.has(key) }, filledKeys);
    }
  } catch (error) {
    if (error instanceof OutsidePayload) return undefined;
    throw error;
  }

  if (filled.action === 'url' && filledKeys.has('url_path')) {
    const scheme = urlScheme(String(filled.url_path ?? ''));
    if (scheme !== undefined && !SAFE_URL_SCHEMES.has(scheme)) return undefined;
  }

  return filled as unknown as Types.ActionConfig;
}

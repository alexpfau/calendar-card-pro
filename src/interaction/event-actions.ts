/**
 * What a tap or a hold on an event runs, and the tapped event's fields it can use.
 *
 * `event_tap_action` and `event_hold_action` take `details`, which opens the event's dialog, or
 * any of Home Assistant's own actions, which the card hands to Home Assistant with the tapped
 * event's fields filled into it: `url_path: https://example.com/?q={title}`. No side effects
 * here; `calendar-card-pro.ts` runs the result.
 */

import { CARD_ACTION_VALUES, EVENT_DETAILS_ACTION } from '../config/constants';
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

/** The keys whose value is part of a URL, where a field's value is percent-encoded. */
const URL_KEYS: ReadonlySet<string> = new Set(['url_path', 'navigation_path']);

/** Schemes a `url` action may open once a field has been filled into its URL. */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set(['http', 'https']);

/** `{title}` and the rest; any other name in braces is left as written. */
const FIELD_PATTERN = new RegExp(`\\{(${EVENT_FIELDS.join('|')})\\}`, 'g');

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/**
 * What an event action amounts to: open the event's dialog, hand an action to Home Assistant,
 * or nothing, which leaves the press to the card's own action.
 */
export type EventActionKind = 'details' | 'forward' | 'none';

//-----------------------------------------------------------------------------
// CLASSIFYING
//-----------------------------------------------------------------------------

/**
 * What an event action amounts to.
 *
 * `details` opens the dialog. `none`, a missing or bare action, and the card's own actions
 * (`expand`, `refresh`, `add-event`, `reset`) are nothing on an event: they act on the whole
 * card, which a press on an event reaches anyway when the event has no action of its own.
 * Every other action is Home Assistant's, including ones it adds after this was written.
 *
 * @param action - `event_tap_action` or `event_hold_action`, as configured
 * @returns What the action amounts to
 */
export function eventActionKind(action: Types.ActionConfig | null | undefined): EventActionKind {
  const name = action?.action;
  if (typeof name !== 'string' || name === '' || name === 'none') return 'none';
  if (name === EVENT_DETAILS_ACTION) return 'details';
  if ((CARD_ACTION_VALUES as ReadonlyArray<string>).includes(name)) return 'none';
  return 'forward';
}

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

/**
 * Fill the fields into one string.
 *
 * @param text - A value of the action as configured
 * @param fields - The event's fields
 * @param encode - Whether the value is part of a URL, where each field is percent-encoded
 * @returns The string filled, and whether any field was
 */
function fillString(
  text: string,
  fields: Record<EventField, string>,
  encode: boolean,
): { text: string; filled: boolean } {
  let filled = false;
  const result = text.replace(FIELD_PATTERN, (_match, name: EventField) => {
    filled = true;
    const value = fields[name];
    return encode ? encodeURIComponent(value) : value;
  });
  return { text: result, filled };
}

/**
 * Fill the fields into a value, however deep: strings are filled, objects and arrays walked,
 * anything else kept. Keys are never filled.
 *
 * @param value - A value of the action as configured
 * @param fields - The event's fields
 * @param key - The key the value sits under, which decides its encoding
 * @param filledKeys - Collects the keys a field was filled into
 * @returns The filled copy
 */
function fillValue(
  value: unknown,
  fields: Record<EventField, string>,
  key: string | undefined,
  filledKeys: Set<string>,
): unknown {
  if (typeof value === 'string') {
    const { text, filled } = fillString(value, fields, key !== undefined && URL_KEYS.has(key));
    if (filled && key !== undefined) filledKeys.add(key);
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => fillValue(item, fields, key, filledKeys));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        fillValue(child, fields, childKey, filledKeys),
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
 * An event action with the tapped event's fields filled in, for Home Assistant to run.
 *
 * Every string in the action is filled, at any depth, except the name of the action itself. In
 * `url_path` and `navigation_path` each field is percent-encoded, so a title or a description
 * can only ever add text to the URL, never a scheme, a host or another query parameter;
 * everywhere else, in `perform-action` data for example, it goes in as plain text. A name in
 * braces that is not a field is left as written.
 *
 * A `url` action whose URL had a field filled into it must open over http or https or be a
 * path. Encoding already keeps a field from forming a scheme, so this only refuses a URL whose
 * own scheme was something else, such as `javascript:`, before a field could ride on it.
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
  for (const [key, value] of Object.entries(action)) {
    if (key === 'action') continue;
    filled[key] = fillValue(value, fields, key, filledKeys);
  }

  if (filled.action === 'url' && filledKeys.has('url_path')) {
    const scheme = urlScheme(String(filled.url_path ?? ''));
    if (scheme !== undefined && !SAFE_URL_SCHEMES.has(scheme)) return undefined;
  }

  return filled as unknown as Types.ActionConfig;
}

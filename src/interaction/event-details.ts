/**
 * What the event popover is handed for one rendered event: the event as stored, as the card
 * shows it, and whether it may be changed and deleted. No side effects; the card opens the
 * popover (`event-popover.ts`).
 */

import { DELETE_EVENT_FEATURE, UPDATE_EVENT_FEATURE, calendarSupports } from './calendar-writes';
import * as Types from '../config/types';
import { stripHtmlTags } from '../utils/format';
import * as TextReplace from '../utils/text-replace';

//-----------------------------------------------------------------------------
// DIALOG PARAMETERS
//-----------------------------------------------------------------------------

/** Home Assistant's `CalendarEventData`: an event as it is stored. */
export interface DetailEntry {
  summary: string;
  dtstart: string;
  dtend: string;
  description?: string;
  location?: string;
  uid?: string;
  recurrence_id?: string;
  rrule?: string;
  status?: string;
}

/**
 * The end Home Assistant stores for an event, or undefined when it sent none.
 *
 * @param event - A rendered event
 * @returns The stored end, as a date or a date-time string
 */
function storedEnd(event: Types.CalendarEventData): string | undefined {
  const source = event._source ?? event;
  return source.end?.dateTime ?? source.end?.date ?? undefined;
}

/**
 * The event as stored, built from what Home Assistant returned.
 *
 * Reads `_source` rather than the row: a split segment's interval is one day of the event,
 * a repaired event's end is the card's, and the row's text is display text. Mirrors the
 * frontend's own `normalizeSubscriptionEventData`, including its `null` to absent
 * conversion.
 *
 * An end that is stored but before the start is handed over as stored. An event with no
 * end at all is shown as the instant at its start, since the popover needs an end to show;
 * `detailPermissions` then withholds editing, which would write that instant back as if the
 * calendar stored it.
 *
 * @param event - A rendered event
 * @returns The dialog entry, or undefined for a row that is not an event
 */
export function buildDetailEntry(event: Types.CalendarEventData): DetailEntry | undefined {
  if (event._isEmptyDay) return undefined;

  const source = event._source ?? event;
  const dtstart = source.start.dateTime ?? source.start.date;
  if (!dtstart) return undefined;

  return {
    summary: source.summary ?? '',
    dtstart,
    dtend: storedEnd(event) ?? dtstart,
    description: source.description ?? undefined,
    location: source.location ?? undefined,
    uid: source.uid ?? undefined,
    recurrence_id: source.recurrence_id ?? undefined,
    rrule: source.rrule ?? undefined,
    status: typeof source.status === 'string' ? source.status : undefined,
  };
}

/** What the card itself says about Edit and Delete, beside what each calendar supports. */
export interface DetailContext {
  /** `allow_event_edit`. */
  allowEdit: boolean;
  /** `allow_event_delete`. */
  allowDelete: boolean;
  /** Calendars that failed on the card's most recent load. */
  failedEntities: ReadonlyArray<string>;
}

/**
 * Whether the popover may change and delete this event.
 *
 * Follows the calendar's advertised features, as Home Assistant's calendar panel does,
 * and narrows them; nothing here can offer what a calendar does not support. Both need:
 *
 * - a `uid`: Home Assistant's update and delete services address an event by it, so
 *   offering either for an event without one would fail at the point of use;
 * - a row that is not a `filter_duplicates` merge of copies from several calendars.
 *   Editing one copy of a shared event is ambiguous, and deleting one brings the row
 *   straight back from the other calendar, which reads as a failed delete;
 * - a calendar that loaded on the card's last attempt. A failing calendar's events are
 *   drawn from the cache, up to a day old, and Edit would save those values over whatever
 *   the calendar holds now.
 *
 * Edit also needs `allow_event_edit` and an end the calendar stores (see
 * `buildDetailEntry`); Delete needs `allow_event_delete`.
 *
 * @param hass - Home Assistant instance
 * @param event - The rendered event
 * @param entry - Its dialog entry
 * @param context - The card's own say
 * @returns The two permissions
 */
export function detailPermissions(
  hass: Types.Hass | null | undefined,
  event: Types.CalendarEventData,
  entry: DetailEntry,
  context: DetailContext,
): { canEdit: boolean; canDelete: boolean } {
  const entityId = event._entityId;
  const merged = (event._mergedFrom?.length ?? 0) > 1;
  if (!entityId || !entry.uid || merged || context.failedEntities.includes(entityId)) {
    return { canEdit: false, canDelete: false };
  }

  return {
    canEdit:
      context.allowEdit &&
      calendarSupports(hass, entityId, UPDATE_EVENT_FEATURE) &&
      storedEnd(event) !== undefined,
    canDelete: context.allowDelete && calendarSupports(hass, entityId, DELETE_EVENT_FEATURE),
  };
}

/**
 * Which of an event's fields its calendar keeps out of the popover: the location or the
 * description, where the calendar sets `show_location` or `show_description` to false. Only the
 * calendar's own setting counts. A card or a view that leaves them out of its rows still shows
 * them in the popover, which is where one goes to read what the rows leave out; a calendar set
 * to Never show is kept private, as a calendar masked with `replace_with` is.
 *
 * @param event - A rendered event
 * @returns Whether each field is kept out
 */
export function hiddenFields(event: Types.CalendarEventData): {
  location: boolean;
  description: boolean;
} {
  const matched = event._matchedConfig;
  return {
    location: matched?.show_location === false,
    description: matched?.show_description === false,
  };
}

/**
 * The event's title, location and description as the card shows them, its calendar's text
 * replacement applied, for the popover to show while a field is not being edited.
 *
 * Built from `_source` rather than the row, which carries only what the card draws: a
 * location the grid hides, or any description while `show_description` is off, would be
 * empty there, and the title would carry an age count the card appended. A description keeps
 * its markup, so the popover can keep its links, unless a replacement rewrites it, which the
 * row applies to its plain text.
 *
 * @param event - A rendered event
 * @returns The three texts
 */
export function displayText(event: Types.CalendarEventData): {
  title: string;
  location: string;
  description: string;
} {
  const source = event._source ?? event;
  const matched = event._matchedConfig;
  const rule = TextReplace.resolveTextReplacement(
    matched?.replace_field,
    matched?.replace_pattern,
    matched?.replace_with,
  );
  const replaced = (text: string, field: Types.ReplaceField) =>
    TextReplace.applyTextReplacement(text, rule, field).text;
  const description = source.description ?? '';
  return {
    title: replaced(source.summary ?? '', 'title'),
    location: replaced(source.location ?? '', 'location'),
    description:
      rule?.field === 'description'
        ? replaced(stripHtmlTags(description), 'description')
        : description,
  };
}

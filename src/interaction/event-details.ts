/**
 * What the event popover is handed for one rendered event: the event as stored, as the card
 * shows it, and whether it may be changed and deleted. No side effects; the card opens the
 * popover (`event-popover.ts`).
 */

import { DELETE_EVENT_FEATURE, UPDATE_EVENT_FEATURE, calendarSupports } from './calendar-writes';
import * as Types from '../config/types';
import { stripHtmlTags } from '../utils/format';
import * as PrivateEvents from '../utils/private-events';
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
 * `buildDetailEntry`); Delete needs `allow_event_delete`. A private entry's event
 * (`EntityConfig.private`) is neither changed nor deleted here: editing a field shows what it
 * stores, and deleting what the card does not show is a guess. Its owner changes it where it is
 * not private.
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
  if (
    !entityId ||
    !entry.uid ||
    merged ||
    PrivateEvents.isPrivate(event) ||
    context.failedEntities.includes(entityId)
  ) {
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
 * The event's title, location and description as the card shows them, its calendar's text
 * replacement applied, for the popover to show while a field is not being edited.
 *
 * Built from `_source` rather than the row, which carries only what the card draws: a
 * location the grid hides, or any description while `show_description` is off, would be
 * empty there, and the title would carry an age count the card appended. So the popover shows
 * every field the event has, whatever the card, a layout or the calendar leaves out of the rows.
 * A calendar's `show_location: false` and `show_description: false` tidy its rows and nothing
 * else; only `private` keeps a field out of the popover. A description keeps its markup, so the popover can keep its links, unless a replacement
 * rewrites it, which the row applies to its plain text.
 *
 * A private entry's event shows Private in place of each field it has (`private-events.ts`).
 *
 * @param event - A rendered event
 * @param language - The card's language, for a private event's placeholder
 * @returns The three texts
 */
export function displayText(
  event: Types.CalendarEventData,
  language: string,
): {
  title: string;
  location: string;
  description: string;
} {
  const source = event._source ?? event;
  const matched = event._matchedConfig;
  if (PrivateEvents.isPrivate(event)) {
    const { title, location, description } = PrivateEvents.privateText(source, matched, language);
    return { title, location, description };
  }
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

/**
 * Which of a private entry's event's fields the popover draws as Private, after a lock.
 *
 * @param event - A rendered event
 * @param language - The card's language
 * @returns The fields, or undefined for an event that is not private
 */
export function privateFields(
  event: Types.CalendarEventData,
  language: string,
): Readonly<Record<PrivateEvents.PrivateField, boolean>> | undefined {
  if (!PrivateEvents.isPrivate(event)) return undefined;
  return PrivateEvents.privateText(event._source ?? event, event._matchedConfig, language).locked;
}

/**
 * A private event's entry as the popover is handed it: its title, location and description as
 * the card shows them (`displayText`), and no status, which would mark it Tentative. Nothing it
 * says reaches the popover, which offers no change to save it back (`detailPermissions`).
 *
 * @param entry - The event as stored
 * @param shown - Its three texts as the card shows them
 * @returns The entry to hand the popover
 */
export function privateEntry(
  entry: DetailEntry,
  shown: { title: string; location: string; description: string },
): DetailEntry {
  return {
    ...entry,
    summary: shown.title,
    location: shown.location || undefined,
    description: shown.description || undefined,
    status: undefined,
  };
}

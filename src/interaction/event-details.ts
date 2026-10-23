/**
 * What Home Assistant's event-detail dialog is handed for one rendered event.
 *
 * A tap on an event opens Home Assistant's own event-detail dialog — the one its calendar
 * panel opens — so the full description, the recurrence and, where the calendar allows
 * them, Edit and Delete all stay Home Assistant's. This module builds the entry and the
 * permissions; `ha-calendar-dialogs.ts` opens the dialog.
 */

import {
  DELETE_EVENT_FEATURE,
  UPDATE_EVENT_FEATURE,
  calendarSupports,
} from './ha-calendar-dialogs';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// DIALOG PARAMETERS
//-----------------------------------------------------------------------------

/** Home Assistant's `CalendarEventData`, the shape its event dialogs read. */
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
 * The event as Home Assistant's dialog expects it, built from what Home Assistant returned.
 *
 * Reads `_source` rather than the row: a split segment's interval is one day of the event,
 * a repaired event's end is the card's, and the row's text is display text. Mirrors the
 * frontend's own `normalizeSubscriptionEventData`, including its `null` to absent
 * conversion.
 *
 * An end that is stored but before the start is handed over as stored. An event with no
 * end at all is shown as the instant at its start, because Home Assistant's dialog
 * formats `dtend` unconditionally and cannot render without one; `detailPermissions`
 * then withholds Edit, which would write that instant back as if the calendar stored it.
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

/**
 * Whether the dialog may offer Edit and Delete for this event.
 *
 * Follows the calendar's advertised features, as Home Assistant's calendar panel does, and
 * additionally requires a `uid`: Home Assistant's update and delete services address an
 * event by it, so offering either for an event without one would fail at the point of use.
 * Edit also requires an end the calendar stores; see `buildDetailEntry`.
 *
 * @param hass - Home Assistant instance
 * @param event - The rendered event
 * @param entry - Its dialog entry
 * @returns The two permissions
 */
export function detailPermissions(
  hass: Types.Hass | null | undefined,
  event: Types.CalendarEventData,
  entry: DetailEntry,
): { canEdit: boolean; canDelete: boolean } {
  const entityId = event._entityId;
  if (!entityId || !entry.uid) return { canEdit: false, canDelete: false };

  return {
    canEdit:
      calendarSupports(hass, entityId, UPDATE_EVENT_FEATURE) && storedEnd(event) !== undefined,
    canDelete: calendarSupports(hass, entityId, DELETE_EVENT_FEATURE),
  };
}

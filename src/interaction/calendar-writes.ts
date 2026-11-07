/**
 * Writing a calendar: what each calendar allows, and the three WebSocket commands that add,
 * change and delete its events.
 *
 * These are Home Assistant's public calendar commands, the ones its own calendar panel sends,
 * unchanged since 2023.1 (`calendar/event/update`) and 2022.12 (`create`, `delete`). The card's
 * event popover sends all three, and dropping an event moved by a drag sends `update`
 * (`_writeMove`).
 */

import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// FEATURES
//-----------------------------------------------------------------------------

/** Home Assistant's `CalendarEntityFeature.CREATE_EVENT` bit. */
export const CREATE_EVENT_FEATURE = 1;

/** Home Assistant's `CalendarEntityFeature.DELETE_EVENT` bit. */
export const DELETE_EVENT_FEATURE = 2;

/** Home Assistant's `CalendarEntityFeature.UPDATE_EVENT` bit. */
export const UPDATE_EVENT_FEATURE = 4;

/**
 * Whether a calendar advertises one of Home Assistant's calendar features.
 *
 * Read from the entity's `supported_features`, as Home Assistant's own calendar panel
 * does. A calendar that is not in the states supports nothing.
 *
 * @param hass - Home Assistant instance, or null before it arrives
 * @param entityId - Calendar entity id
 * @param feature - One of the feature bits above
 * @returns Whether the bit is set
 */
export function calendarSupports(
  hass: Types.Hass | null | undefined,
  entityId: string,
  feature: number,
): boolean {
  const features = Number(hass?.states?.[entityId]?.attributes?.supported_features ?? 0);
  return (features & feature) !== 0;
}

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/**
 * An event as the write commands take it.
 *
 * `dtstart` and `dtend` are both dates (`YYYY-MM-DD`, the end the day after the last day) or
 * both date-times. The card sends date-times in UTC, `…Z`: Home Assistant requires the two to
 * carry the same time zone, which two offsets either side of a clock change would not, and
 * converts an aware time to its own zone itself.
 */
export interface EventWrite {
  summary: string;
  dtstart: string;
  dtend: string;
  description?: string;
  location?: string;
  rrule?: string;
}

/**
 * Which occurrences of a repeating event a change or a delete applies to: the one pressed, or
 * it and every later one. Home Assistant's `RecurrenceRange`.
 */
export type RecurrenceRange = '' | 'THISANDFUTURE';

/** The occurrence a change or a delete names. */
export interface EventTarget {
  entityId: string;
  uid: string;
  /** The occurrence of a repeating event, or undefined for a single event. */
  recurrenceId?: string;
  /** Which occurrences, for a repeating event. */
  range?: RecurrenceRange;
}

//-----------------------------------------------------------------------------
// COMMANDS
//-----------------------------------------------------------------------------

/**
 * Send one write command.
 *
 * @param hass - Home Assistant instance
 * @param message - The command
 * @returns Resolves once Home Assistant accepted it; rejects with its error otherwise
 */
async function send(hass: Types.Hass, message: Types.WebSocketMessage): Promise<void> {
  if (typeof hass.callWS !== 'function') {
    throw new Error('Home Assistant offers no WebSocket connection to write with');
  }
  await hass.callWS(message);
}

/**
 * Add an event to a calendar.
 *
 * @param hass - Home Assistant instance
 * @param entityId - The calendar
 * @param event - The new event
 * @returns Resolves once Home Assistant saved it
 */
export function createEvent(hass: Types.Hass, entityId: string, event: EventWrite): Promise<void> {
  return send(hass, { type: 'calendar/event/create', entity_id: entityId, event });
}

/**
 * Change an event, or one or more occurrences of a repeating one.
 *
 * @param hass - Home Assistant instance
 * @param target - The event, and for a repeating one the occurrence and the range
 * @param event - The event as it should now be
 * @returns Resolves once Home Assistant saved it
 */
export function updateEvent(
  hass: Types.Hass,
  target: EventTarget,
  event: EventWrite,
): Promise<void> {
  return send(hass, {
    type: 'calendar/event/update',
    entity_id: target.entityId,
    uid: target.uid,
    ...(target.recurrenceId
      ? { recurrence_id: target.recurrenceId, recurrence_range: target.range ?? '' }
      : {}),
    event,
  });
}

/**
 * Delete an event, or one or more occurrences of a repeating one.
 *
 * @param hass - Home Assistant instance
 * @param target - The event, and for a repeating one the occurrence and the range
 * @returns Resolves once Home Assistant deleted it
 */
export function deleteEvent(hass: Types.Hass, target: EventTarget): Promise<void> {
  return send(hass, {
    type: 'calendar/event/delete',
    entity_id: target.entityId,
    uid: target.uid,
    ...(target.recurrenceId
      ? { recurrence_id: target.recurrenceId, recurrence_range: target.range ?? '' }
      : {}),
  });
}

/**
 * The message an error from a write carries, for the popover to show as Home Assistant wrote
 * it.
 *
 * @param error - What the command rejected with
 * @returns Its message, or undefined when it has none
 */
export function writeErrorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error || undefined;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : undefined;
}

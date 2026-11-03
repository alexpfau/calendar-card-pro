/**
 * Telling every card on the page that the event popover changed a calendar.
 *
 * The card that opened the popover refreshes itself, but a dashboard often shows the same
 * calendar on several cards: a week on one, today on another. Without this, those keep
 * drawing the old events until their own next scheduled refresh.
 */

import { calendarSupports } from './calendar-writes';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * Window event announcing a saved change.
 *
 * 🚨 Must never contain `calendar-card-pro-dev`. The production build rewrites that string
 * to `calendar-card-pro` wherever it appears, which is how the element names move, and an
 * event name rewritten in one build only would stop a development card and an installed
 * release on the same dashboard from hearing each other.
 */
export const CALENDARS_CHANGED_EVENT = 'calendar-card-pro-calendars-changed';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** Which calendars a saved change may have touched. */
export type ChangedCalendars =
  /** These calendars. An edit or a delete names the event's own. */
  | { readonly ids: ReadonlyArray<string> }
  /**
   * Any calendar that advertises this feature bit, for a new event whose calendar is not
   * known: it cannot be narrowed to one calendar, but it cannot have landed in a read-only one
   * either. The popover names the calendar it wrote to, so it announces `ids`.
   */
  | { readonly feature: number };

/** What a `CALENDARS_CHANGED_EVENT` carries. */
export interface CalendarsChangedDetail {
  /** The calendars the change may have touched. */
  changed: ChangedCalendars;
  /**
   * The write's generation, from `advanceWriteGeneration`. Every card refreshes for this
   * number rather than advancing its own, which is what lets them share one request.
   */
  writeGeneration: number;
  /** The card that announced it, which has already refreshed. */
  source: EventTarget;
}

//-----------------------------------------------------------------------------
// FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Announce on `window` that the popover saved a change.
 *
 * @param source - The announcing card
 * @param changed - The calendars the change may have touched
 * @param writeGeneration - The write's generation
 */
export function announceCalendarsChanged(
  source: EventTarget,
  changed: ChangedCalendars,
  writeGeneration: number,
): void {
  window.dispatchEvent(
    new CustomEvent<CalendarsChangedDetail>(CALENDARS_CHANGED_EVENT, {
      detail: { changed, writeGeneration, source },
    }),
  );
}

/**
 * Whether an announced change concerns a card showing these calendars.
 *
 * A change announced by feature is read against the receiving card's own `hass`, the same
 * `supported_features` the announcing card read.
 *
 * @param detail - The announcement
 * @param shownIds - Entity ids of the calendars the card shows
 * @param hass - The receiving card's Home Assistant instance
 * @returns True when any of them may have changed
 */
export function concernsCalendars(
  detail: CalendarsChangedDetail,
  shownIds: ReadonlyArray<string>,
  hass: Types.Hass | null | undefined,
): boolean {
  return touchesCalendars(detail.changed, shownIds, hass);
}

/**
 * Whether a saved change may have touched any of these calendars.
 *
 * @param changed - The calendars the change may have touched
 * @param calendarIds - Entity ids of the calendars in question
 * @param hass - Home Assistant instance, for the feature a change is announced by
 * @returns True when any of them may have changed
 */
export function touchesCalendars(
  changed: ChangedCalendars,
  calendarIds: ReadonlyArray<string>,
  hass: Types.Hass | null | undefined,
): boolean {
  return 'ids' in changed
    ? changed.ids.some((id) => calendarIds.includes(id))
    : calendarIds.some((id) => calendarSupports(hass, id, changed.feature));
}

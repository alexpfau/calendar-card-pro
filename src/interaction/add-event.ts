/**
 * What the add-event button needs to know, without opening anything.
 *
 * The button opens Home Assistant's own create-event dialog through
 * `ha-calendar-dialogs.ts`. This module decides whether there is anywhere to write, which
 * calendar the dialog preselects, and what the button is called.
 */

import { CREATE_EVENT_FEATURE, calendarSupports } from './ha-calendar-dialogs';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/** Home Assistant's string for the button, so it reads as it does on the core card. */
const HA_ADD_EVENT_LABEL_KEY = 'ui.components.calendar.event.add';

const FALLBACK_LABEL = 'Add event';

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
 * @param hass - Home Assistant instance, or null before it arrives
 * @param entities - The card's configured calendars
 * @returns Entity ids of writable calendars
 */
export function writableCalendarIds(
  hass: Types.Hass | null | undefined,
  entities: ReadonlyArray<string | Types.EntityConfig>,
): string[] {
  if (!hass?.states) return [];

  const ids: string[] = [];
  for (const entry of entities) {
    const id = typeof entry === 'string' ? entry : entry?.entity;
    if (!id || ids.includes(id)) continue;

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
 * every language it supports.
 *
 * @param hass - Home Assistant instance
 * @returns Localized label
 */
export function addEventLabel(hass: Types.Hass | null | undefined): string {
  const localized = hass?.localize?.(HA_ADD_EVENT_LABEL_KEY);
  return localized && localized !== HA_ADD_EVENT_LABEL_KEY ? localized : FALLBACK_LABEL;
}

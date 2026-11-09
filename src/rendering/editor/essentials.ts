/**
 * Essentials Only: the editor cut down to the settings most cards need (backlog item 188).
 *
 * 🚨 A field is named by where it sits, not by the option it writes. The same option name
 * appears on more than one surface: `accent_color` card-wide and per calendar, `entity` as the
 * weather entity and a toolbar button's, `tap_action` as the card's and every button's. A bare
 * list of option names would therefore admit controls this set means to leave out. So a card
 * field is its data path joined with its name (`weather.entity`, `time_grid.start_time`), a
 * calendar field is its name inside one calendar's form, and toolbar buttons have no essentials.
 * `tests/editor-essentials.test.ts` reconciles both sets against the schemas the editor builds,
 * so a field that is renamed or leaves its surface fails there, even while its option name lives
 * on somewhere else.
 *
 * The switch is remembered in this browser, under one key shared by every card.
 *
 * Free of Lit and the DOM, like every editor module but the element and its styles.
 */

import type { HaFormSchema } from './ha-form';
import { deviceStorage } from '../../utils/view-choice';

/**
 * The card's own essential fields, by data path and name, in the order the panels show them.
 *
 * Fields that appear only once another is set are listed with it, so the switch that reveals
 * them never leaves them unreachable: Show End Time appears only while Show Time is on, a
 * start date's day or offset only once its mode asks for one, and Position only once a weather
 * entity is chosen.
 */
export const ESSENTIAL_CARD_FIELDS: ReadonlySet<string> = new Set([
  // Calendars
  'calendars',
  // Layout: the hours a grid covers
  'time_grid.start_time',
  'time_grid.end_time',
  // Time Range & Content
  'days_to_show',
  'start_date_mode',
  'start_date_fixed',
  'start_date_offset',
  'show_past_events',
  'show_empty_days',
  // Card & Header
  'title',
  'toolbar.show',
  'toolbar.legend',
  // Events
  'show_time',
  'show_end_time',
  'show_location',
  'show_description',
  'show_countdown',
  // Weather
  'weather.entity',
  'weather.position',
  // Actions & Refresh
  'tap_action',
  'day_tap_action_mode',
  'event_tap_action',
]);

/** Each calendar's essential fields: its name on the card, its label and its color. */
export const ESSENTIAL_CALENDAR_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'label_type',
  'label',
  'label_icon_source',
  'label_image_source',
  'accent_color_mode',
  'accent_color',
]);

/**
 * Whether a field on the card's own panels is an essential one.
 *
 * @param node - Schema node
 * @param dataPath - Enclosing object keys in the configuration, outermost first
 * @returns `true` when Essentials Only keeps it
 */
export function isEssentialCardField(node: HaFormSchema, dataPath: ReadonlyArray<string>): boolean {
  return ESSENTIAL_CARD_FIELDS.has([...dataPath, node.name].join('.'));
}

/**
 * Whether a field in one calendar's form is an essential one.
 *
 * @param node - Schema node
 * @returns `true` when Essentials Only keeps it
 */
export function isEssentialCalendarField(node: HaFormSchema): boolean {
  return ESSENTIAL_CALENDAR_FIELDS.has(node.name);
}

/** The one storage key, shared by every card in this browser. */
export const ESSENTIALS_STORAGE_KEY = 'calendar-card-pro-editor-essentials-only';

/**
 * Whether Essentials Only was left on in this browser. Off until someone switches it on.
 *
 * @returns The remembered choice
 */
export function rememberedEssentialsOnly(): boolean {
  try {
    return deviceStorage()?.getItem(ESSENTIALS_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Remembers the switch in this browser. Off removes the entry, so the default needs none.
 *
 * @param on - Whether Essentials Only is on
 */
export function rememberEssentialsOnly(on: boolean): void {
  try {
    const storage = deviceStorage();
    if (on) storage?.setItem(ESSENTIALS_STORAGE_KEY, 'on');
    else storage?.removeItem(ESSENTIALS_STORAGE_KEY);
  } catch {
    // A browser refusing storage forgets the choice; the switch still works for this visit.
  }
}

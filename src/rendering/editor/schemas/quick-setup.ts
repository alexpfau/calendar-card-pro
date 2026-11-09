/**
 * The forms Quick Setup renders, one per step that asks something (backlog item 188).
 *
 * Declared as chassis sub-forms under `quick_setup`, so `check:i18n` reconciles their strings
 * like every other form the editor draws. Their field names are deliberately not config keys:
 * the schema tests count every field name a chassis form offers as covering that option, and a
 * Quick Setup field named `title` would keep that test green the day the real Title field went.
 * The element maps answers to the configuration through `buildQuickSetupConfig`, never through
 * the routing every panel's form uses.
 */

import type { HaFormSchema } from '../ha-form';

/** The label path of every Quick Setup field: `quick_setup.<name>`. */
export const QUICK_SETUP_PATH: ReadonlyArray<string> = ['quick_setup'];

/** Step two: what the card is called, and which calendars it shows. */
export const QUICK_SETUP_CALENDARS_SCHEMA: ReadonlyArray<HaFormSchema> = [
  { name: 'card_title', selector: { text: {} } },
  {
    name: 'card_calendars',
    required: true,
    selector: { entity: { filter: { domain: 'calendar' }, multiple: true, reorder: true } },
  },
];

/** Step three: the weather entity, or none. */
export const QUICK_SETUP_WEATHER_SCHEMA: ReadonlyArray<HaFormSchema> = [
  { name: 'weather_entity', selector: { entity: { filter: { domain: 'weather' } } } },
];

/** Step four: the toolbar, and what a tap on an event or a day does. */
export const QUICK_SETUP_TAPS_SCHEMA: ReadonlyArray<HaFormSchema> = [
  { name: 'show_toolbar', selector: { boolean: {} } },
  { name: 'event_details', selector: { boolean: {} } },
  { name: 'day_adds', selector: { boolean: {} } },
];

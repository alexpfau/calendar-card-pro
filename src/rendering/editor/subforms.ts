/**
 * Reusable schema fragments for repeated subforms.
 */

import { FILTER_SCHEMA } from './filter';
import type { HaFormSchema } from './ha-form';
import { type PanelDef, type SchemaCtx, type SubformDef } from './panels';
import { buildDisplayViewSchema } from './schemas/layout';
import {
  QUICK_SETUP_CALENDARS_SCHEMA,
  QUICK_SETUP_PATH,
  QUICK_SETUP_TAPS_SCHEMA,
  QUICK_SETUP_WEATHER_SCHEMA,
} from './schemas/quick-setup';
import { buildWorkspaceSchema } from './workspace';

/** The forms the chassis renders itself, above the panels and belonging to none. */
export interface ChassisSchemas {
  /** The configured view, written to the config */
  displayView: ReadonlyArray<HaFormSchema>;
  /** Which view's options the panels show; never written */
  workspace: ReadonlyArray<HaFormSchema>;
  /** The search field; never written */
  filter: ReadonlyArray<HaFormSchema>;
  /** Add Calendar's picker; what it chooses joins the card only once Add is pressed */
  addCalendar: ReadonlyArray<HaFormSchema>;
  /** An entry page's Calendar, which points the entry at another calendar */
  entryCalendar: ReadonlyArray<HaFormSchema>;
}

/** The label path of Add Calendar's picker: `calendars.pick`. */
export const ADD_CALENDAR_PATH: ReadonlyArray<string> = ['calendars'];

/** The label path of an entry page's Calendar: `entry.calendar`. */
export const ENTRY_CALENDAR_PATH: ReadonlyArray<string> = ['entry'];

/**
 * Add Calendar's picker. The element adds the calendars already on the card as
 * `exclude_entities` as it draws it, so a calendar is added a second time only by Duplicate.
 */
const ADD_CALENDAR_SCHEMA: ReadonlyArray<HaFormSchema> = [
  { name: 'pick', selector: { entity: { filter: { domain: 'calendar' } } } },
];

/** An entry page's Calendar: required, since an entry reads some calendar. */
const ENTRY_CALENDAR_SCHEMA: ReadonlyArray<HaFormSchema> = [
  { name: 'calendar', required: true, selector: { entity: { filter: { domain: 'calendar' } } } },
];

/**
 * Schemas the chassis renders itself, belonging to no panel.
 *
 * The editor renders exactly these, and the i18n gate and the schema tests read them through
 * {@link chassisSubforms}, so a chassis form is declared to the gate by being rendered.
 *
 * @param language - Language used by the selectors' option labels
 * @returns Each chassis form's schema, by the place it renders
 */
export function chassisSchemas(language = 'en'): ChassisSchemas {
  return {
    displayView: buildDisplayViewSchema(language),
    workspace: buildWorkspaceSchema(language),
    filter: FILTER_SCHEMA,
    addCalendar: ADD_CALENDAR_SCHEMA,
    entryCalendar: ENTRY_CALENDAR_SCHEMA,
  };
}

/**
 * Schemas the chassis renders itself, as sub-forms.
 *
 * @param language - Language used by the selectors' option labels
 * @returns Sub-forms the chassis renders above the panels, in render order
 */
export function chassisSubforms(language = 'en'): SubformDef[] {
  const { displayView, workspace, filter, addCalendar, entryCalendar } = chassisSchemas(language);
  return [
    ...[displayView, workspace, filter].map((schema) => ({ path: [], schema })),
    { path: [...ADD_CALENDAR_PATH], schema: addCalendar },
    { path: [...ENTRY_CALENDAR_PATH], schema: entryCalendar },
    // Quick Setup, which takes the place of the panels while it is open.
    ...[QUICK_SETUP_CALENDARS_SCHEMA, QUICK_SETUP_WEATHER_SCHEMA, QUICK_SETUP_TAPS_SCHEMA].map(
      (schema) => ({ path: [...QUICK_SETUP_PATH], schema }),
    ),
  ];
}

/**
 * Prefixes of chassis strings held to their readers: every key under one must be looked up by a
 * literal in code (`_string(ctx, …)` or a view's `t(…)`) or named by the page
 * registry, else `check:i18n` reports it, as it does an orphaned field string. The older chassis
 * prefixes compose some of their keys, so a prefix alone vouches for them.
 */
export const REFERENCED_STRINGS: ReadonlyArray<string> = [
  'overview',
  'more',
  'nav',
  'settings_for',
  'announce',
  'summary',
  'history',
  'status',
  'calendars',
  'strip',
  'entry',
  'search',
  'gate',
  'add',
  'state',
  'reset',
  'inactive',
  'other_layouts',
  'prefs',
  'audit',
  'notices',
  'value',
];

export const CHASSIS_STRINGS: ReadonlyArray<string> = [
  'filter',
  'entity',
  'editing_workspace',
  'value_source',
  'grid_reconciliation',
  'config_migration',
  'misplaced',
  'quick_setup',
  'row',
  ...REFERENCED_STRINGS,
];

/**
 * Every schema a panel renders outside its own form.
 *
 * @param panel - Panel definition
 * @param ctx - Schema context
 * @returns Sub-forms, in render order
 */
export function panelSubforms(panel: PanelDef, ctx: SchemaCtx): SubformDef[] {
  return [...(panel.subforms?.(ctx) ?? [])];
}

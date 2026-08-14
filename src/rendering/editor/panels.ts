/**
 * Panel registry and schema walking helpers.
 */

import { mdiViewDashboardOutline } from '@mdi/js';

import type { HaFormSchema } from './ha-form';
import { ACTIONS_ICON, buildActionsSchema } from './schemas/actions';
import { CALENDARS_ICON, buildCalendarsSchema, calendarsSubforms } from './schemas/calendars';
import { CARD_ICON, buildCardSchema } from './schemas/card';
import { CONTENT_ICON, buildContentSchema } from './schemas/content';
import { DAY_HEADER_ICON, buildDayHeaderSchema } from './schemas/day-header';
import { EVENTS_ICON, buildEventsSchema } from './schemas/events';
import { buildLayoutSchema, layoutExtras } from './schemas/layout';
import { SEPARATORS_ICON, buildSeparatorsSchema } from './schemas/separators';
import { WEATHER_ICON, buildWeatherSchema } from './schemas/weather';
import * as Types from '../../config/types';

/**
 * Everything a schema builder is allowed to read.
 */
export interface SchemaCtx {
  view: Types.EffectiveView;
  config: Types.Config;
  language: string;
}

/**
 * One row of the layout width table.
 */
export interface WidthTableRow {
  width: string;
  layout: string;
}

/**
 * Panel content that is not a form field.
 */
export type PanelExtra = {
  kind: 'width-table';
  title: string;
  rows: ReadonlyArray<WidthTableRow>;
  note: string;
};

/**
 * A schema the panel renders itself, outside its own `<ha-form>`.
 */
export interface SubformDef {
  path: ReadonlyArray<string>;
  schema: ReadonlyArray<HaFormSchema>;
}

/**
 * One collapsible section of the editor.
 */
export interface PanelDef {
  id: string;
  titleKey: string;
  iconPath: string;
  strings?: ReadonlyArray<string>;
  /**
   * Builds the panel's form schema.
   *
   * @param ctx - Schema context
   * @returns Schema nodes, in render order
   */
  build(ctx: SchemaCtx): HaFormSchema[];
  /**
   * Builds content rendered below the panel's fields.
   *
   * @param ctx - Schema context
   * @returns Extra content, empty when the panel has none
   */
  extras?(ctx: SchemaCtx): PanelExtra[];
  /**
   * Declares schemas the panel renders outside its own form.
   *
   * @param ctx - Schema context
   * @returns Sub-forms, empty when the panel has none
   */
  subforms?(ctx: SchemaCtx): SubformDef[];
}

export const PANELS: ReadonlyArray<PanelDef> = [
  {
    id: 'calendars',
    titleKey: 'panel.calendars',
    iconPath: CALENDARS_ICON,
    build: buildCalendarsSchema,
    subforms: calendarsSubforms,
  },
  {
    id: 'layout',
    titleKey: 'panel.layout',
    iconPath: mdiViewDashboardOutline,
    strings: ['width_table'],
    build: buildLayoutSchema,
    extras: layoutExtras,
  },
  {
    id: 'content',
    titleKey: 'panel.content',
    iconPath: CONTENT_ICON,
    build: buildContentSchema,
  },
  {
    id: 'card',
    titleKey: 'panel.card',
    iconPath: CARD_ICON,
    build: buildCardSchema,
  },
  {
    id: 'day_header',
    titleKey: 'panel.day_header',
    iconPath: DAY_HEADER_ICON,
    build: buildDayHeaderSchema,
  },
  {
    id: 'events',
    titleKey: 'panel.events',
    iconPath: EVENTS_ICON,
    build: buildEventsSchema,
  },
  {
    id: 'separators',
    titleKey: 'panel.separators',
    iconPath: SEPARATORS_ICON,
    build: buildSeparatorsSchema,
  },
  {
    id: 'weather',
    titleKey: 'panel.weather',
    iconPath: WEATHER_ICON,
    build: buildWeatherSchema,
  },
  {
    id: 'actions',
    titleKey: 'panel.actions',
    iconPath: ACTIONS_ICON,
    build: buildActionsSchema,
  },
];

/**
 * Walks every node of a schema, groups included.
 *
 * @param schema - Schema to walk
 * @param path - Enclosing expandable group names, outermost first
 */
export function* walkSchema(
  schema: ReadonlyArray<HaFormSchema>,
  path: ReadonlyArray<string> = [],
): Generator<{ node: HaFormSchema; path: ReadonlyArray<string> }> {
  for (const node of schema) {
    yield { node, path };

    if ('schema' in node) {
      const nestsLabels = node.type === 'expandable' && node.name !== '';
      yield* walkSchema(node.schema, nestsLabels ? [...path, node.name] : path);
    }
  }
}

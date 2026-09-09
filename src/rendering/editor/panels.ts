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
import type { EditorWorkspace } from './workspace';
import * as Types from '../../config/types';

/**
 * Everything a schema builder is allowed to read.
 *
 * 🚨 `view` and `workspace` carry the same value in the live editor and are still two
 * fields. `_ctx` in `element.ts` sets `const view = workspace`, so every call site's
 * `ctx.workspace ?? ctx.view` resolves to the workspace there whichever half it reads —
 * which makes the pair look like a redundancy to delete, and it is not.
 *
 * `view` is what the card renders and is the only thing a builder can rely on, because it
 * is the only one that is required. `check:i18n` builds every schema from
 * `{ view, config, language }` and names no workspace at all, and most of the suite does
 * the same — collapsing to `workspace` would make the gate pass a concept it does not
 * have.
 *
 * `workspace` is what the editor is being *pointed at*, and it is optional because only
 * the live editor knows it. The two were genuinely different before the workspace
 * selector: the editor configured whatever the card displayed, so a user could not reach
 * a grid option without switching the card to grid. They are equal today because the
 * selector made pointing the editor the only way to change which view you configure.
 *
 * So read `ctx.workspace ?? ctx.view` when you want the view whose values are being
 * edited — the storage destination, `withholdInertFields`, `valueSource` — and read
 * `ctx.view` when you want the view a builder must work for regardless of caller. Do not
 * merge them on the evidence that they are equal; that equality is one assignment in one
 * getter, and the fallback is what lets everything else stay unaware of it.
 */
export interface SchemaCtx {
  view: Types.EffectiveView;
  /** Editor workspace, independent of the card's displayed view. See the note above. */
  workspace?: EditorWorkspace;
  config: Types.Config;
  /** Authored values before workspace projection, when supplied by the live editor. */
  rawConfig?: Types.Config;
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
 * Yields both paths, because they diverge and each answers a different question. Home
 * Assistant qualifies a label only under an expandable, while it nests *data* under any
 * named node that is not flattened — so a named `grid` moves a field's storage without
 * moving its label. Anything asking "where is this written in YAML" wants `dataPath`;
 * anything asking "what key does this label itself from" wants `path`. Deriving one from
 * the other is what the two rules below exist to prevent.
 *
 * @param schema - Schema to walk
 * @param path - Enclosing label group names, outermost first
 * @param dataPath - Enclosing configuration keys, outermost first
 */
export function* walkSchema(
  schema: ReadonlyArray<HaFormSchema>,
  path: ReadonlyArray<string> = [],
  dataPath: ReadonlyArray<string> = path,
): Generator<{
  node: HaFormSchema;
  path: ReadonlyArray<string>;
  dataPath: ReadonlyArray<string>;
}> {
  for (const node of schema) {
    yield { node, path, dataPath };

    if ('schema' in node) {
      const nestsLabels = node.type === 'expandable' && node.name !== '';
      const nestsData = node.name !== '' && node.flatten !== true;
      yield* walkSchema(
        node.schema,
        nestsLabels ? [...path, node.name] : path,
        nestsData ? [...dataPath, node.name] : dataPath,
      );
    }
  }
}

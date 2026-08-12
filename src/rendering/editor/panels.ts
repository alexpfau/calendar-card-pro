/**
 * The panel registry.
 *
 * One entry per collapsible section of the editor. A panel is a title, an icon, a
 * schema builder and — where it needs one — a builder for content that is not a form
 * field. Adding a panel is adding a module under `schemas/` and a line to `PANELS`,
 * which is the property that lets the remaining panels be built independently of each
 * other and of this file.
 *
 * Nothing here imports Lit or touches the DOM. That is deliberate and load-bearing: it
 * is what lets the test suite import a schema and assert on it directly, rather than
 * scraping source text for translation keys the way the old editor has to be checked.
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
 *
 * `view` is what the card is **configured** to render, not what it currently renders —
 * the editor is configuring a card, not observing one, and a column card measured
 * narrow in the preview is still a column card. Keeping the distinction explicit here
 * is what stops the editor from annotating options on the strength of a preview width.
 */
export interface SchemaCtx {
  /** View the card is configured to render. */
  view: Types.EffectiveView;
  /** Merged configuration, defaults already applied. */
  config: Types.Config;
  /** Effective language code for label resolution. */
  language: string;
}

/** One row of the layout width table. */
export interface WidthTableRow {
  /** Width condition, already formatted for display. */
  width: string;
  /** What the card renders at that width. */
  layout: string;
}

/**
 * Panel content that is not a form field.
 *
 * A discriminated union of **data**, not of templates, so that schema modules stay
 * free of Lit and the chassis keeps sole responsibility for how anything is drawn.
 */
export type PanelExtra = {
  kind: 'width-table';
  title: string;
  rows: ReadonlyArray<WidthTableRow>;
  note: string;
};

/**
 * A schema the panel renders itself, outside its own `<ha-form>`.
 *
 * Two things in this editor cannot be a member of the panel's schema and are still
 * built out of schema: the per-calendar settings, which are one form per item of a list
 * `ha-form` has no member for, and the per-view exceptions, which need an add-and-remove
 * control around them. Both are rendered by the chassis with their own form.
 *
 * Declaring them here is what keeps that seam honest. `check:i18n` reconciles the
 * string table against the fields the editor references, and it finds them by building
 * every panel and walking what comes back — so a schema rendered outside that walk
 * would be a set of fields nothing could check, in exactly the two places the editor
 * stops being schema-driven. The `path` is the label path the chassis renders them
 * under, so the keys reported are the keys that will actually be looked up.
 */
export interface SubformDef {
  /** Label-path prefix the chassis renders this schema under. */
  path: ReadonlyArray<string>;
  /** The schema, as it is handed to a form. */
  schema: ReadonlyArray<HaFormSchema>;
}

/** One collapsible section of the editor. */
export interface PanelDef {
  /** Stable id, used for the panel's expanded state. */
  id: string;
  /** String key for the panel's title. */
  titleKey: string;
  /** Material Design icon path. */
  iconPath: string;
  /**
   * String-key prefixes the panel resolves itself, beyond its fields.
   *
   * Almost every string the editor shows is reachable from a schema node, which is
   * what makes the schema a field registry the i18n check can reconcile against. The
   * exceptions are strings a panel resolves for content that is not a field — the
   * width table being the only one so far. Declaring the prefix here is what keeps
   * that check free of hardcoded knowledge about which panel owns which strings: an
   * undeclared prefix is reported as an unreferenced string, which is the truth.
   */
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

/**
 * The panels, in the order they are shown.
 *
 * Named for the thing they configure rather than for a region of one layout. That is
 * the point of the taxonomy and the only part of it that is load-bearing: *Date
 * Display* names a column that exists in one layout and not the other, whereas every
 * layout has a day and every day has a header. A noun that becomes false when a second
 * view exists cannot absorb a third.
 *
 * The order is the editor's order, so a new panel goes where it belongs rather than at
 * the end.
 */
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
 * Used by the tests to assert over the whole tree, by `check:i18n` to reconcile the
 * string table against the fields that reference it, and by anything that needs to
 * know what a panel actually renders rather than what its top level looks like.
 *
 * The path models **Home Assistant's label path**, which is not the same as the data
 * path. `ha-form-expandable` appends its own name before calling `computeLabel`
 * whether or not it is flattened, while its data is only nested when it is not — so a
 * flattened group keeps the configuration flat and still qualifies its children's
 * label keys. `ha-form-grid` passes the hooks straight through and contributes
 * nothing either way, which is also true of our grids because they are unnamed.
 *
 * `computeLabel` resolves the qualified key first and the bare key second, so a
 * flattened group's children are labelled by their config key without repeating the
 * group name in the string table.
 *
 * @param schema - Schema to walk
 * @param path - Enclosing expandable group names, outermost first
 * @yields Each node with the path it sits under
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

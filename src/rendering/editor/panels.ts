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
import { buildLayoutSchema, layoutExtras } from './schemas/layout';
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

/** One collapsible section of the editor. */
export interface PanelDef {
  /** Stable id, used for the panel's expanded state. */
  id: string;
  /** String key for the panel's title. */
  titleKey: string;
  /** Material Design icon path. */
  iconPath: string;
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
}

/**
 * The panels, in the order they are shown.
 *
 * Stage 1 registers one. The eight that follow are named in the design and land as
 * separate modules; the order of this array is the order of the editor, so a new entry
 * goes where it belongs rather than at the end.
 */
export const PANELS: ReadonlyArray<PanelDef> = [
  {
    id: 'layout',
    titleKey: 'panel.layout',
    iconPath: mdiViewDashboardOutline,
    build: buildLayoutSchema,
    extras: layoutExtras,
  },
];

/**
 * Walks every node of a schema, groups included.
 *
 * Used by the tests to assert over the whole tree, and by anything that needs to know
 * what a panel actually renders rather than what its top level looks like.
 *
 * @param schema - Schema to walk
 * @param path - Enclosing non-flattened group names, outermost first
 * @yields Each node with the path it sits under
 */
export function* walkSchema(
  schema: ReadonlyArray<HaFormSchema>,
  path: ReadonlyArray<string> = [],
): Generator<{ node: HaFormSchema; path: ReadonlyArray<string> }> {
  for (const node of schema) {
    yield { node, path };

    if ('schema' in node) {
      // A flattened group contributes nothing to the data path, so it contributes
      // nothing to the key path either — the two must agree or a label lookup would
      // qualify a key the data never nests.
      const childPath = node.flatten || node.name === '' ? path : [...path, node.name];
      yield* walkSchema(node.schema, childPath);
    }
  }
}

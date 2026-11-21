/**
 * Panel registry and schema walking helpers.
 */

import type { HaFormSchema } from './ha-form';
import { buildActionsSchema } from './schemas/actions';
import { calendarsSubforms } from './schemas/calendars';
import { buildCardSchema, cardSubforms } from './schemas/card';
import { buildContentSchema } from './schemas/content';
import { buildDayHeaderSchema } from './schemas/day-header';
import { buildEventsSchema } from './schemas/events';
import { buildLayoutSchema, layoutExtras } from './schemas/layout';
import { buildSeparatorsSchema } from './schemas/separators';
import { buildWeatherSchema } from './schemas/weather';
import type { EditorWorkspace } from './workspace';
import * as Types from '../../config/types';

/**
 * Everything a schema builder is allowed to read.
 *
 * 🚨 The two carry the same value for the three view workspaces and differ for Shared,
 * and they are two fields for that reason. `_ctx` in `element.ts` sets
 * `view = baseViewForWorkspace(workspace)`, which is the identity everywhere except
 * Shared, where it is `list` — so for a view workspace every call site's
 * `ctx.workspace ?? ctx.view` resolves to the same thing whichever half it reads, which
 * makes the pair look like a redundancy to delete, and it is not.
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
 * a grid option without switching the card to grid. Shared reopened that gap on purpose —
 * it edits the base every view reads, so it has no view of its own and its panels are
 * built as `list`, the one view that declares neither an only-key nor a divergent
 * default and therefore makes no view-specific claim. Building them as whatever the card
 * happened to display would have made a shared option appear and disappear from Shared as
 * the user switched the card.
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
  /**
   * Mode choices held for this scope, by mode field name (`synthetic.ts` › `MODE_FIELDS`): what a
   * mode control shows where its value reads as another mode. Builders read a mode through
   * `synthetic.ts` › `modeFor`, so the field a held mode reveals is built.
   */
  presentation?: Readonly<Record<string, string>>;
}

/**
 * One row of the layout width table.
 */
export interface WidthTableRow {
  width: string;
  layout: string;
}

/** One row of the fit summary: a card width, then what each layout draws there. */
export interface FitSummaryRow {
  width: string;
  cells: ReadonlyArray<string>;
}

/**
 * Panel content that is not a form field: one layout's width table, or the fit summary, which
 * names each layout the card can show and what it draws at a few common card widths.
 */
export type PanelExtra =
  | {
      kind: 'width-table';
      title: string;
      rows: ReadonlyArray<WidthTableRow>;
      note: string;
    }
  | {
      kind: 'fit-summary';
      title: string;
      layouts: ReadonlyArray<string>;
      rows: ReadonlyArray<FitSummaryRow>;
    };

/**
 * A schema the panel renders itself, outside its own `<ha-form>`.
 */
export interface SubformDef {
  path: ReadonlyArray<string>;
  schema: ReadonlyArray<HaFormSchema>;
}

/**
 * One field builder: the authority on which of its fields exist for a configuration. Where they
 * are drawn, under which heading and with which title, is the page registry's (`pages.ts`).
 */
export interface PanelDef {
  id: string;
  /** String prefixes the panel's own drawing names, beyond its fields' keys. */
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
    // No field of its own: the overview's calendar list stands where the picker was.
    build: () => [],
    subforms: calendarsSubforms,
  },
  {
    id: 'layout',
    // Its tables, and Month's Card Height choices, which Month labels under its own prefix.
    strings: ['width_table', 'fit_summary', 'month.height_mode'],
    build: buildLayoutSchema,
    extras: layoutExtras,
  },
  {
    id: 'content',
    build: buildContentSchema,
  },
  {
    id: 'card',
    // The words on the toolbar buttons' own rows (Add Button, Move Up and the rest), and the
    // toolbar's controls drawn as chips.
    strings: ['toolbar.buttons', 'toolbar.controls'],
    build: buildCardSchema,
    subforms: cardSubforms,
  },
  {
    id: 'day_header',
    build: buildDayHeaderSchema,
  },
  {
    id: 'events',
    build: buildEventsSchema,
  },
  {
    id: 'separators',
    build: buildSeparatorsSchema,
  },
  {
    id: 'weather',
    build: buildWeatherSchema,
  },
  {
    id: 'actions',
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

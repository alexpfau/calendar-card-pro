/**
 * The Layout panel — how the card arranges days, and how much room it takes.
 *
 * The reference implementation for every panel that follows, and the first place the
 * card has ever offered a control for `view` at all.
 *
 * Three things here are worth copying and one is worth not copying. Copy the
 * `type: 'grid'` pairing, which halves a panel's height for three lines of schema and
 * no CSS of ours; copy the nested `expandable` for an optional sub-group, which nests
 * the data under its own name and so edits `column:` with no plumbing; and copy the
 * derived helper text, which comes from one table rather than from siblings placed by
 * hand. Do **not** copy the width table into another panel — it is specific to a view
 * whose layout depends on measurement, and it is presented as data so that the
 * chassis, not the schema, decides how to draw it.
 *
 * No view name is written as a comparison anywhere below. What the panel offers is
 * driven by `VIEWS`, `OVERRIDE_BLOCK_BY_VIEW` and `VIEWS_WITH_WIDTH_FALLBACK`, so a
 * third view costs entries in those tables and an illustration, and nothing here.
 */

import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema, SelectOption } from '../ha-form';
import { humanize, lookup } from '../localize';
import type { PanelExtra, SchemaCtx, WidthTableRow } from '../panels';
import { interpolate } from '../strings';
import * as Synthetic from '../synthetic';

/**
 * Illustrations for the boxed view selector.
 *
 * Inline SVG rather than files, because HACS publishes exactly one asset for this card
 * and a second one would 404 in every user's browser — the failure mode that made us
 * turn sourcemaps off. A neutral grey reads acceptably on both light and dark themes,
 * which avoids shipping two variants of each.
 */
const VIEW_ARTWORK: Readonly<Record<Types.EffectiveView, string>> = {
  list:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><g fill="#8b8b8b">' +
    '<rect x="2" y="3" width="10" height="7" rx="2"/>' +
    '<rect x="15" y="3" width="31" height="7" rx="2" opacity=".4"/>' +
    '<rect x="2" y="12.5" width="10" height="7" rx="2"/>' +
    '<rect x="15" y="12.5" width="31" height="7" rx="2" opacity=".4"/>' +
    '<rect x="2" y="22" width="10" height="7" rx="2"/>' +
    '<rect x="15" y="22" width="31" height="7" rx="2" opacity=".4"/></g></svg>',
  column:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><g fill="#8b8b8b">' +
    '<rect x="2" y="3" width="13" height="5" rx="2"/>' +
    '<rect x="17.5" y="3" width="13" height="5" rx="2"/>' +
    '<rect x="33" y="3" width="13" height="5" rx="2"/>' +
    '<rect x="2" y="10.5" width="13" height="18.5" rx="2" opacity=".4"/>' +
    '<rect x="17.5" y="10.5" width="13" height="18.5" rx="2" opacity=".4"/>' +
    '<rect x="33" y="10.5" width="13" height="18.5" rx="2" opacity=".4"/></g></svg>',
};

/** Wraps an SVG document as a data URI an `<img>` can load. */
function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Builds the options for the view selector.
 *
 * Generated from `VIEWS`, which is what keeps `grid` out of it: the name is reserved
 * in the design and rejected by `validateView`, so offering it would let the editor
 * write a configuration the card refuses to load. It becomes selectable by being
 * implemented, not by being listed here.
 *
 * @param language - Effective language code
 * @returns One boxed option per implemented view
 */
function viewOptions(language: string): SelectOption[] {
  return ViewConfig.VIEWS.map((view) => ({
    value: view,
    label: lookup(language, `view.option.${view}.label`) ?? humanize(view),
    description: lookup(language, `view.option.${view}.description`),
    image: svgDataUri(VIEW_ARTWORK[view]),
  }));
}

/**
 * Column density — the options that decide how narrow the card may get.
 *
 * Nested under the block's own config key without `flatten`, so its children read and
 * write `config.column.*` directly. These are column-only options with no top-level
 * counterpart, which is why they are ordinary configuration here rather than
 * exceptions to something.
 *
 * @param blockKey - Config key holding this view's override block
 * @param daysToShow - Configured day count, which bounds the column floor
 * @param language - Effective language code
 * @returns The density group
 */
function densityGroup(blockKey: string, daysToShow: number, language: string): HaFormSchema {
  return {
    type: 'expandable',
    name: blockKey,
    title: lookup(language, `${blockKey}.density`) ?? humanize('density'),
    iconPath: 'M4 5h16v2H4V5m0 6h16v2H4v-2m0 6h16v2H4v-2Z',
    schema: [
      {
        type: 'grid',
        name: '',
        schema: [
          {
            name: 'min_day_width',
            selector: { number: { min: 60, max: 400, step: 1, unit_of_measurement: 'px' } },
          },
          {
            name: 'min_days_to_show',
            selector: {
              number: { min: 1, max: Math.max(1, Math.floor(daysToShow)), step: 1 },
            },
          },
        ],
      },
      {
        name: 'min_days_fallback',
        selector: {
          select: {
            mode: 'dropdown',
            options: (['list', 'cramp'] as const).map((value) => ({
              value,
              label:
                lookup(language, `${blockKey}.min_days_fallback.option.${value}.label`) ??
                humanize(value),
            })),
          },
        },
      },
      {
        name: 'day_header_gap',
        selector: { text: {} },
      },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'day_header_separator_width', selector: { text: {} } },
          { name: 'day_header_separator_color', selector: { ui_color: {} } },
        ],
      },
    ],
  };
}

/**
 * Builds the Layout panel schema.
 *
 * Memoised on the values it reads rather than on the context object, which is rebuilt
 * on every keystroke and so would never compare equal — a memoiser handed the whole
 * config is a memoiser that never hits. The arguments are therefore the view, the
 * height mode that gates which height field shows, `days_to_show`, which bounds the
 * column floor, and the language.
 *
 * @param view - View the card is configured to render
 * @param heightMode - Derived height mode
 * @param daysToShow - Configured day count
 * @param language - Effective language code
 * @returns The panel's schema
 */
export const layoutSchema = Helpers.memoizeLast(
  (
    view: Types.EffectiveView,
    heightMode: string,
    daysToShow: number,
    language: string,
  ): HaFormSchema[] => {
    const schema: HaFormSchema[] = [
      {
        name: 'view',
        selector: { select: { mode: 'box', options: viewOptions(language) } },
      },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'day_spacing', selector: { text: {} } },
          { name: 'event_spacing', selector: { text: {} } },
        ],
      },
      {
        name: 'additional_card_spacing',
        selector: { text: {} },
      },
      {
        name: 'height_mode',
        selector: {
          select: {
            mode: 'dropdown',
            options: (['auto', 'fixed', 'maximum'] as const).map((value) => ({
              value,
              label: lookup(language, `height_mode.option.${value}.label`) ?? humanize(value),
            })),
          },
        },
      },
    ];

    // Progressive disclosure on a value the user sets in this same panel, which is the
    // case where hiding is right: the two height fields are alternatives, and the
    // control that chooses between them is directly above.
    if (heightMode === 'fixed') {
      schema.push({ name: 'height', selector: { text: {} } });
    } else if (heightMode === 'maximum') {
      schema.push({ name: 'max_height', selector: { text: {} } });
    }

    const blockKey = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[view];
    if (blockKey !== undefined) {
      schema.push(densityGroup(blockKey, daysToShow, language));
    }

    return schema;
  },
);

/**
 * Builds the Layout panel schema for a context.
 *
 * The seam between the context object the chassis carries and the primitive arguments
 * the memoised builder compares.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildLayoutSchema(ctx: SchemaCtx): HaFormSchema[] {
  return layoutSchema(
    ctx.view,
    Synthetic.heightMode(ctx.config),
    ctx.config.days_to_show,
    ctx.language,
  );
}

/**
 * Formats the layout staircase as table rows.
 *
 * The thing this card will otherwise generate support threads about is *why does my
 * card look different on my phone*, and the honest answer is a table. Every figure
 * comes from `describeColumnLayoutBands`, which is the same arithmetic the renderer
 * uses to decide, so the table cannot describe a card the code would not produce.
 *
 * @param ctx - Schema context
 * @returns One row per column count, then one for the fallback
 */
export function widthTableRows(ctx: SchemaCtx): WidthTableRow[] {
  const t = (key: string, values: Record<string, string | number> = {}): string =>
    interpolate(lookup(ctx.language, key) ?? key, values);

  const bands = ViewConfig.describeColumnLayoutBands(ctx.config);

  const rows: WidthTableRow[] = bands.bands.map((band) => ({
    width: t('width_table.at_least', { width: band.minWidthPx }),
    layout:
      band.columns === 1
        ? t('width_table.columns_one')
        : t('width_table.columns', { count: band.columns }),
  }));

  rows.push({
    width: t('width_table.below', { width: bands.fallbackBelowPx }),
    layout:
      bands.fallback === 'cramp'
        ? t('width_table.cramped', { count: bands.bands[bands.bands.length - 1].columns })
        : t('width_table.as_list'),
  });

  return rows;
}

/**
 * Extra content rendered below the Layout panel's fields.
 *
 * Returned as data rather than as markup so this module stays free of Lit and of the
 * DOM, which is what lets the test suite import it and assert on the table directly.
 *
 * @param ctx - Schema context
 * @returns The width table, for views whose layout depends on how wide the card is
 */
export function layoutExtras(ctx: SchemaCtx): PanelExtra[] {
  if (!ViewConfig.VIEWS_WITH_WIDTH_FALLBACK.has(ctx.view)) {
    return [];
  }

  const t = (key: string, values: Record<string, string | number> = {}): string =>
    interpolate(lookup(ctx.language, key) ?? key, values);

  return [
    {
      kind: 'width-table',
      title: t('width_table.title'),
      rows: widthTableRows(ctx),
      note: t('width_table.hysteresis', {
        band: ViewConfig.describeColumnLayoutBands(ctx.config).hysteresisPx,
      }),
    },
  ];
}

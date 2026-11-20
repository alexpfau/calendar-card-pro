/**
 * Layout schema rows.
 */

import { blockScope, bool, color, select, text } from './common';
import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import { VIEW_PICTOGRAM_VIEWBOX, pictogramMarkup } from '../../view-pictograms';
import type { HaFormSchema, SelectOption } from '../ha-form';
import { humanize, lookup } from '../localize';
import type { PanelExtra, SchemaCtx, WidthTableRow } from '../panels';
import { interpolate } from '../strings';
import * as Synthetic from '../synthetic';

/**
 * Starting Layout's picture for a view: the card's shared pictogram in a fixed gray, which
 * reads on both light and dark editor themes. The toolbar's view switcher draws the same shapes
 * in the text color instead.
 *
 * @param view - The view to draw
 * @returns Standalone SVG markup
 */
function viewArtwork(view: Types.EffectiveView): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_PICTOGRAM_VIEWBOX}">` +
    `<g fill="#8b8b8b">${pictogramMarkup(view)}</g></svg>`
  );
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Builds the options for the view selector.
 *
 * @param language - Effective language code
 * @returns One boxed option per implemented view
 */
function viewOptions(language: string): SelectOption[] {
  return ViewConfig.VIEWS.map((view) => ({
    value: view,
    label: lookup(language, `view.option.${view}.label`) ?? humanize(view),
    description: lookup(language, `view.option.${view}.description`),
    image: svgDataUri(viewArtwork(view)),
  }));
}

/**
 * Builds the card's displayed-view selector, rendered above the editor panels.
 *
 * @param language - Editor language
 * @returns The existing illustrated view selector
 */
export function buildDisplayViewSchema(language: string): HaFormSchema[] {
  return [{ name: 'view', selector: { select: { mode: 'box', options: viewOptions(language) } } }];
}

/**
 * Column density — the options that decide how narrow the card may get.
 *
 * @param blockKey - Config key holding this view's override block
 * @param daysToShow - Configured day count, which bounds the column floor
 * @param language - Effective language code
 * @returns The density fields, in the view's own block
 */
function densityFields(blockKey: string, daysToShow: number, language: string): HaFormSchema {
  return blockScope(blockKey, [
    {
      name: 'min_day_width',
      // No ceiling: `normalizeColumnValue` accepts any positive number, and the
      // arithmetic in `computeColumnThresholdPxFor` has no upper bound either — a
      // large floor simply means "give me columns only if each can be this wide",
      // which is a real config on a wide dashboard card. A `max` here made that
      // unauthorable in the editor while YAML accepted it, and it was the only
      // arbitrary ceiling among the editor's numeric selectors (`min_days_to_show`
      // derives its own from `days_to_show`). The floor is `1` for the same reason:
      // it is the smallest integer the runtime's `parsed > 0` test admits at this
      // step. Dropping `max` also settles the control type, since Home Assistant
      // renders a slider only when both bounds are present — `mode` states that
      // rather than leaving it to be inferred.
      selector: { number: { min: 1, step: 1, mode: 'box', unit_of_measurement: 'px' } },
    },
    {
      name: 'min_days_to_show',
      selector: {
        number: { min: 1, max: Math.max(1, Math.floor(daysToShow)), step: 1 },
      },
    },
    select(language, 'min_days_fallback', ['list', 'cramp'], `${blockKey}.min_days_fallback`),
  ]);
}

/**
 * The time axis and what the grid draws on it — everything the `time_grid:` block owns that has
 * no top-level counterpart.
 *
 * 🚨 Wrapped in `blockScope`, never a bare `scope`: storage nesting and label nesting are
 * separate mechanisms, and a bare `scope` would keep the values in `time_grid:` while silently
 * dropping the `time_grid.` prefix their translations are filed under, in all nine languages at
 * once.
 *
 * @param blockKey - Config key holding this view's override block
 * @param language - Effective language code
 * @returns The fields, in the view's own block
 */
function timeAxisFields(blockKey: string, language: string): HaFormSchema[] {
  return [
    blockScope(blockKey, [
      text('start_time'),
      text('end_time'),
      select(language, 'slot_minutes', [15, 20, 30, 60], `${blockKey}.slot_minutes`),
      text('hour_height'),
      text('axis_width'),
      bool('show_axis_labels'),
      select(language, 'axis_label_minutes', [30, 60, 120, 180], `${blockKey}.axis_label_minutes`),
      color('weekend_background_color'),
      color('today_background_color'),
      bool('show_now_line'),
      {
        name: 'allday_band_max_rows',
        selector: { number: { min: 1, max: 10, step: 1, mode: 'box' } },
      },
      select(language, 'overlap_layout', ['cascade', 'columns'], `${blockKey}.overlap_layout`),
      {
        name: 'max_simultaneous_events',
        selector: { number: { min: 1, max: 10, step: 1, mode: 'box' } },
      },
    ]),
  ];
}

/**
 * Everything the `month:` block owns that has no top-level counterpart: the whole card's height and
 * its cap in each form, the day width below which the narrow form draws, the weekend's and today's
 * shading, and the font sizes of the wide month's days.
 *
 * 🚨 Two of the names, `card_height` and `card_max_height`, are also the names of the card's
 * synthetic Height fields, which write the shared `height` and `max_height`. The field ids differ
 * (`layout:month.card_height` against `layout:card_height`), and so does every string key, since
 * `blockScope` labels these under `month.`; what treats a name as synthetic has to ask about the
 * top level (`value.ts` › `stripBlockDefaults`, `routing.ts` › `workspaceFormData`).
 *
 * @param blockKey - Config key holding this view's override block
 * @returns The fields, in the view's own block
 */
function monthFields(blockKey: string): HaFormSchema[] {
  // No ceiling on the width, for the reason `densityFields` gives. Its floor is `1`, the smallest
  // integer the runtime's `parsed > 0` admits.
  return [
    blockScope(blockKey, [
      text('card_height'),
      text('card_max_height'),
      text('narrow_card_height'),
      text('narrow_card_max_height'),
      {
        name: 'min_day_width',
        selector: { number: { min: 1, step: 1, mode: 'box', unit_of_measurement: 'px' } },
      },
      color('weekend_background_color'),
      color('today_background_color'),
      text('cell_event_font_size'),
      text('cell_time_font_size'),
    ]),
  ];
}

/**
 * Builds the Layout panel schema.
 *
 * @param view - View the card is configured to render
 * @param heightMode - Derived height mode
 * @param daysToShow - Configured day count
 * @param language - Effective language code
 * @returns The panel's schema
 */
const layoutSchema = Helpers.memoizeLast(
  (
    view: Types.EffectiveView,
    heightMode: string,
    daysToShow: number,
    language: string,
  ): HaFormSchema[] => {
    // Grid keeps none of them: `event_spacing` and `event_gap` are inert there and withheld
    // by `VIEW_SCOPE`, and `day_spacing` is the column gutter rather than vertical space
    // between days, so Separators builds it beside the rules drawn inside it.
    const spacing: HaFormSchema[] =
      view === 'grid' ? [] : [text('day_spacing'), text('event_gap'), text('event_spacing')];

    const cardBox: HaFormSchema[] = [
      text('additional_card_spacing'),
      select(language, 'height_mode', ['auto', 'fixed', 'maximum']),
    ];

    if (heightMode === 'fixed') {
      cardBox.push(text('card_height'));
    } else if (heightMode === 'maximum') {
      cardBox.push(text('card_max_height'));
    }

    const blockKey = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[view];

    const schema: HaFormSchema[] =
      view === 'grid' && blockKey !== undefined
        ? [...timeAxisFields(blockKey, language), ...cardBox]
        : [...spacing, ...cardBox];

    // Gated on the view owning these keys, not merely on it owning a block: emitting the
    // density fields for any view with a block offered a list card three controls its config
    // does not accept. `VIEWS_WITH_WIDTH_FALLBACK` is the same concept the width table below
    // is gated on.
    if (blockKey !== undefined && ViewConfig.VIEWS_WITH_WIDTH_FALLBACK.has(view)) {
      schema.push(densityFields(blockKey, daysToShow, language));
    }

    if (view === 'month' && blockKey !== undefined) {
      schema.push(...monthFields(blockKey));
    }

    return schema;
  },
);

/**
 * Builds the Layout panel schema for a context.
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
 * Resolves and interpolates one string for a schema context.
 *
 * Falls back to {@link humanize} rather than to the raw key, matching `computeLabel` and
 * every other resolution in the editor. A missing key is then a slightly awkward label
 * instead of `width_table.at_least` rendered verbatim in the UI — and the two are not
 * equally likely to be noticed, because a raw key looks like a broken card while a
 * humanized one looks like a label somebody has not polished yet.
 *
 * @param ctx - Schema context, for the language
 * @param key - String key to resolve
 * @param values - Interpolation values
 * @returns The resolved string
 */
function translate(
  ctx: SchemaCtx,
  key: string,
  values: Record<string, string | number> = {},
): string {
  return interpolate(lookup(ctx.language, key) ?? humanize(key), values);
}

/**
 * Formats the layout staircase as table rows.
 *
 * @param ctx - Schema context
 * @returns One row per column count, then one for the fallback
 */
export function widthTableRows(ctx: SchemaCtx): WidthTableRow[] {
  const t = (key: string, values: Record<string, string | number> = {}): string =>
    translate(ctx, key, values);

  const bands = ViewConfig.describeColumnLayoutBands(ctx.config, ctx.view);

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
 * @param ctx - Schema context
 * @returns The width table, for views whose layout depends on how wide the card is
 */
export function layoutExtras(ctx: SchemaCtx): PanelExtra[] {
  if (!ViewConfig.VIEWS_WITH_WIDTH_FALLBACK.has(ctx.view)) {
    return [];
  }

  const t = (key: string, values: Record<string, string | number> = {}): string =>
    translate(ctx, key, values);

  return [
    {
      kind: 'width-table',
      title: t('width_table.title'),
      rows: widthTableRows(ctx),
      note: t('width_table.hysteresis', {
        band: ViewConfig.describeColumnLayoutBands(ctx.config, ctx.view).hysteresisPx,
      }),
    },
  ];
}

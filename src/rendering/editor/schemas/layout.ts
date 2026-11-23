/**
 * Layout schema rows.
 */

import { blockScope, bool, color, select, text } from './common';
import * as Config from '../../../config/config';
import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import { intlLocales } from '../../../translations/intl-locales';
import * as Helpers from '../../../utils/helpers';
import { VIEW_PICTOGRAM_VIEWBOX, pictogramMarkup } from '../../view-pictograms';
import type { HaFormSchema, SelectOption } from '../ha-form';
import { humanize, lookup } from '../localize';
import type { FitSummaryRow, PanelExtra, SchemaCtx, WidthTableRow } from '../panels';
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

/** When Too Narrow's choices, in the order they read: the default first, Custom last. */
export const NARROW_FIT_CHOICES = ['fewer', 'list', 'cramp', 'custom'] as const;

/**
 * How a side-by-side layout fits a narrow card: When Too Narrow, one choice over the two options
 * below it (`Synthetic.SYNTHETIC_FIELDS.narrow_fit`), and Minimum Day Width, how narrow a day may
 * get. Down To, the fewest days, is built while the choice sheds days or is Custom; Below That,
 * what happens past them, only while it is Custom. The choice is a top-level field, since the
 * editor routes a synthetic field from there into the block of the layout being edited; the rest
 * are stored in that block.
 *
 * @param blockKey - Config key holding this view's override block
 * @param fit - When Too Narrow as the configuration reads (`ViewConfig.narrowFit`)
 * @param daysToShow - The layout's day count, which Down To stays below
 * @param language - Effective language code
 * @returns The fields
 */
function densityFields(
  blockKey: string,
  fit: string,
  daysToShow: number,
  language: string,
): HaFormSchema[] {
  const block: HaFormSchema[] = [
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
  ];
  // Down To stops a day short of the day count: shedding to every day sheds none, which is what
  // Show a List and Keep the Days, Narrower write, so reaching it would switch the choice under
  // the field being edited. A one-day layout has nothing to shed.
  const days = Math.floor(daysToShow);
  if ((fit === 'fewer' || fit === 'custom') && days > 1) {
    block.push({
      name: 'min_days_to_show',
      selector: { number: { min: 1, max: days - 1, step: 1 } },
    });
  }
  if (fit === 'custom') {
    block.push(
      select(language, 'min_days_fallback', ['list', 'cramp'], `${blockKey}.min_days_fallback`),
    );
  }
  // A one-day layout has nothing to shed to, so no Custom, unless it already reads so.
  const choices = NARROW_FIT_CHOICES.filter(
    (choice) => choice !== 'custom' || daysToShow > 1 || fit === 'custom',
  );
  return [select(language, 'narrow_fit', choices), blockScope(blockKey, block)];
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
 * its cap in the narrow form, the day width below which the narrow form draws, which week the first
 * row is and, from the start date's week, how many weeks follow, the weekend's and today's
 * shading, and the font sizes of the wide month's days. The wide form's pair is the card's own
 * Card Height, which the panel builds for every layout.
 *
 * @param blockKey - Config key holding this view's override block
 * @param language - Effective language code
 * @param start - First Week as the configuration reads it (`month → start`)
 * @returns The fields, in the view's own block
 */
function monthFields(blockKey: string, language: string, start: Types.MonthStart): HaFormSchema[] {
  // No ceiling on the width, for the reason `densityFields` gives. Its floor is `1`, the smallest
  // integer the runtime's `parsed > 0` admits.
  return [
    blockScope(blockKey, [
      text('narrow_card_height'),
      text('narrow_card_max_height'),
      {
        name: 'min_day_width',
        selector: { number: { min: 1, step: 1, mode: 'box', unit_of_measurement: 'px' } },
      },
      select(language, 'start', ['month', 'week'], `${blockKey}.start`),
      // Weeks Shown only from the start date's week: a calendar month always draws six.
      ...(start === 'week'
        ? [
            {
              name: 'weeks',
              selector: {
                number: { min: 1, max: ViewConfig.MONTH_ROWS, step: 1, mode: 'box' as const },
              },
            },
          ]
        : []),
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
 * @param heightMode - Card Height's mode
 * @param eventsArea - Whether the layout reads the events area's own `height` and `max_height`
 * @param fit - When Too Narrow as the configuration reads, for Columns and Grid
 * @param daysToShow - Configured day count
 * @param language - Effective language code
 * @param monthStart - Month's First Week as the configuration reads it
 * @returns The panel's schema
 */
const layoutSchema = Helpers.memoizeLast(
  (
    view: Types.EffectiveView,
    heightMode: string,
    eventsArea: boolean,
    fit: string,
    daysToShow: number,
    language: string,
    monthStart: Types.MonthStart,
  ): HaFormSchema[] => {
    // Grid keeps none of them: `event_spacing` and `event_gap` are inert there and withheld
    // by `VIEW_SCOPE`, and `day_spacing` is the column gutter rather than vertical space
    // between days, so Separators builds it beside the rules drawn inside it.
    const spacing: HaFormSchema[] =
      view === 'grid' ? [] : [text('day_spacing'), text('event_gap'), text('event_spacing')];

    // Month's `auto` is its own default height rather than its content's, so its choice says so.
    const cardBox: HaFormSchema[] = [
      text('additional_card_spacing'),
      select(
        language,
        'height_mode',
        ['auto', 'fixed', 'maximum'],
        view === 'month' ? 'month.height_mode' : undefined,
      ),
    ];

    if (heightMode === 'fixed') {
      cardBox.push(text('fixed_height'));
    } else if (heightMode === 'maximum') {
      // A wide Month keeps its weeks inside the cap rather than growing to it.
      cardBox.push(
        view === 'month'
          ? { ...text('maximum_height'), titleKey: 'month.maximum_height' }
          : text('maximum_height'),
      );
    }

    // The events area's own pair, which Card Height has replaced. Its page draws it only where a
    // card still holds one, so it can be read and cleared, and never offers it (`pages.ts`, kept).
    if (eventsArea) cardBox.push(text('height'), text('max_height'));

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
      schema.push(...densityFields(blockKey, fit, daysToShow, language));
    }

    if (view === 'month' && blockKey !== undefined) {
      schema.push(...monthFields(blockKey, language, monthStart));
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
  const view = ctx.view;
  const fit = ViewConfig.VIEWS_WITH_WIDTH_FALLBACK.has(view)
    ? ViewConfig.narrowFit(ctx.config, view)
    : '';
  return layoutSchema(
    view,
    Synthetic.heightMode(ctx.config),
    ViewConfig.appliesToView('height', view),
    fit,
    ViewConfig.layoutDays(ctx.config, view),
    ctx.language,
    ViewConfig.resolveMonthOption(ctx.config, 'start'),
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
 * The card widths the fit summary reads at, with the string naming each: a phone, a Sections
 * dashboard's column on a desktop, a portrait tablet and a wide screen.
 */
export const FIT_SUMMARY_WIDTHS: ReadonlyArray<readonly [number, string]> = [
  [390, 'fit_summary.width_phone'],
  [480, 'fit_summary.width_sections'],
  [768, 'fit_summary.width'],
  [1280, 'fit_summary.width'],
];

/**
 * The configuration as the card reads it, every layout's block in place: the one each layout is
 * resolved from, whatever layout the page edits.
 *
 * @param ctx - Schema context
 * @returns The merged configuration
 */
function cardConfig(ctx: SchemaCtx): Types.Config {
  if (ctx.workspace === 'shared' || ctx.rawConfig === undefined) return ctx.config;
  return Config.normalizeLengthOptions(
    Config.normalizeNumericOptions({ ...Config.DEFAULT_CONFIG, ...ctx.rawConfig }),
  );
}

/**
 * The layouts the card can show: those the switcher offers, or the one it opens in.
 *
 * @param config - Merged configuration
 * @returns The layouts, in `VIEWS` order where the switcher offers several
 */
export function cardLayouts(config: Types.Config): ReadonlyArray<Types.EffectiveView> {
  const offered = Config.switcherOffers(config);
  if (offered.length > 0) return offered;
  return [ViewConfig.VIEWS.includes(config.view) ? config.view : 'list'];
}

/**
 * What a layout draws at one width, as a cell of the fit summary.
 *
 * @param ctx - Schema context, for the language
 * @param fit - What it draws (`ViewConfig.fitAtWidth`)
 * @returns The cell's text
 */
function fitCell(ctx: SchemaCtx, fit: ViewConfig.LayoutFit): string {
  const t = (key: string, values: Record<string, string | number> = {}): string =>
    translate(ctx, key, values);
  if (fit.kind === 'month') return t(`fit_summary.month_${fit.form}`);
  const base = {
    days: 'fit_summary.days',
    narrower: 'fit_summary.narrower',
    list: 'fit_summary.list',
  }[fit.kind];
  return fit.days === 1 ? t(`${base}_one`) : t(base, { count: fit.days });
}

/**
 * The fit summary: what each layout the card can show draws at a few common card widths, on a
 * fresh load (`ViewConfig.fitAtWidth`). `undefined` for a card that draws the same at every one of
 * them, such as one that shows List alone.
 *
 * @param ctx - Schema context
 * @returns The summary, or `undefined`
 */
export function fitSummary(
  ctx: SchemaCtx,
): Extract<PanelExtra, { kind: 'fit-summary' }> | undefined {
  const config = cardConfig(ctx);
  const layouts = cardLayouts(config);
  const format = new Intl.NumberFormat(intlLocales(ctx.language));
  const rows: FitSummaryRow[] = FIT_SUMMARY_WIDTHS.map(([width, key]) => ({
    width: translate(ctx, key, { width: format.format(width) }),
    cells: layouts.map((view) => fitCell(ctx, ViewConfig.fitAtWidth(config, view, width))),
  }));
  // A card that draws the same at every width, a List card above all, has nothing to summarize.
  if (rows.every((row) => row.cells.join('\u0000') === rows[0].cells.join('\u0000'))) {
    return undefined;
  }
  return {
    kind: 'fit-summary',
    title: translate(ctx, 'fit_summary.title'),
    layouts: layouts.map((view) => translate(ctx, `view.option.${view}.label`)),
    rows,
  };
}

/**
 * Month's width table: the card widths below which it draws its narrow form, and the one-way margin
 * it keeps once narrow (`ViewConfig.describeMonthWidths`).
 *
 * @param ctx - Schema context
 * @returns The table
 */
export function monthWidthTable(ctx: SchemaCtx): Extract<PanelExtra, { kind: 'width-table' }> {
  const { wideFromPx, wideAgainFromPx } = ViewConfig.describeMonthWidths(ctx.config);
  return {
    kind: 'width-table',
    title: translate(ctx, 'width_table.title'),
    rows: [
      {
        width: translate(ctx, 'width_table.at_least', { width: wideFromPx }),
        layout: translate(ctx, 'width_table.month_wide'),
      },
      {
        width: translate(ctx, 'width_table.below', { width: wideFromPx }),
        layout: translate(ctx, 'width_table.month_narrow'),
      },
    ],
    note: translate(ctx, 'width_table.month_hysteresis', { width: wideAgainFromPx }),
  };
}

/**
 * Extra content rendered below the Layout panel's fields: the fit summary, then the width table of
 * the layout being edited where its form depends on the card's width.
 *
 * @param ctx - Schema context
 * @returns The summary and the table, each where it applies
 */
export function layoutExtras(ctx: SchemaCtx): PanelExtra[] {
  const extras: PanelExtra[] = [];
  const summary = fitSummary(ctx);
  if (summary !== undefined) extras.push(summary);

  if (ctx.view === 'month') {
    extras.push(monthWidthTable(ctx));
  }

  if (ViewConfig.VIEWS_WITH_WIDTH_FALLBACK.has(ctx.view)) {
    extras.push({
      kind: 'width-table',
      title: translate(ctx, 'width_table.title'),
      rows: widthTableRows(ctx),
      note: translate(ctx, 'width_table.hysteresis', {
        band: ViewConfig.describeColumnLayoutBands(ctx.config, ctx.view).hysteresisPx,
      }),
    });
  }

  return extras;
}

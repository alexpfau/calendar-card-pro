/**
 * Layout schema rows.
 */

import { blockScope, bool, color, heading, row, text } from './common';
import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema, SelectOption } from '../ha-form';
import { humanize, lookup } from '../localize';
import type { PanelExtra, SchemaCtx, WidthTableRow } from '../panels';
import { interpolate } from '../strings';
import * as Synthetic from '../synthetic';

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
  // Reads left to right as the grid's own structure: an hour axis, three day headers,
  // an all-day banner spanning two of them, then blocks whose differing heights are the
  // whole point of the view. Same 48x32 frame and palette as its two siblings, so the
  // three picker tiles stay a set.
  grid:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><g fill="#8b8b8b">' +
    '<rect x="9" y="3" width="11" height="4" rx="1.5"/>' +
    '<rect x="22" y="3" width="11" height="4" rx="1.5"/>' +
    '<rect x="35" y="3" width="11" height="4" rx="1.5"/>' +
    '<rect x="9" y="9" width="24" height="3" rx="1.5" opacity=".55"/>' +
    '<rect x="2" y="15.5" width="5" height="1.5" rx=".75" opacity=".5"/>' +
    '<rect x="2" y="21" width="5" height="1.5" rx=".75" opacity=".5"/>' +
    '<rect x="2" y="26.5" width="5" height="1.5" rx=".75" opacity=".5"/>' +
    '<rect x="9" y="14.5" width="11" height="6" rx="1.5" opacity=".4"/>' +
    '<rect x="9" y="23" width="11" height="5" rx="1.5" opacity=".4"/>' +
    '<rect x="22" y="14.5" width="11" height="13.5" rx="1.5" opacity=".4"/>' +
    '<rect x="35" y="19" width="11" height="7" rx="1.5" opacity=".4"/></g></svg>',
};

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
    image: svgDataUri(VIEW_ARTWORK[view]),
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
 * @returns The density group
 */
function densityGroup(blockKey: string, daysToShow: number, language: string): HaFormSchema {
  const schema: HaFormSchema[] = [
    {
      type: 'grid',
      name: '',
      schema: [
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
  ];

  return {
    type: 'expandable',
    name: blockKey,
    title: lookup(language, `${blockKey}.density`) ?? humanize('density'),
    titleKey: `${blockKey}.density`,
    iconPath: 'M4 5h16v2H4V5m0 6h16v2H4v-2m0 6h16v2H4v-2Z',
    schema,
  };
}

/**
 * The time axis — everything the `time_grid:` block owns that has no top-level counterpart.
 *
 * These are **top-level captioned runs, not a collapsible**, and that is the whole point.
 * As a collapsed `Time Axis` group beside a collapsed `Grid Density` group, the Layout
 * panel opened on exactly two visible options — `additional_card_spacing` and the card
 * height — while first hour, last hour, height per hour, the now line and every axis
 * control sat behind a disclosure. That inverts the panel: the two options almost nobody
 * touches were the only ones on show, and the ones that decide what a grid card looks
 * like had to be hunted for. A collapsible is for the rare and the advanced; the axis is
 * neither in this view, it *is* the layout.
 *
 * Ordered coarse to fine by what each option decides, the same rule the panels themselves
 * follow: which slice of the day the card draws and how tall that slice is, then the
 * gutter that labels it, then what is laid on top of it and how much of it may stack.
 *
 * `start_time` and `end_time` share a row because they are a pair — a bad half resets
 * both, so reading them apart misleads.
 *
 * 🚨 Each run is wrapped in `blockScope`, never a bare `scope`: storage nesting and label
 * nesting are separate mechanisms, and a bare `scope` would keep the values in
 * `time_grid:` while silently dropping the `time_grid.` prefix their translations are
 * filed under, in all nine languages at once. The three sibling scopes share a name on
 * purpose — `workspaceFields` walks paths rather than keying by name, so they contribute
 * to one `time_grid:` block.
 *
 * @param blockKey - Config key holding this view's override block
 * @param language - Effective language code
 * @returns The captioned runs
 */
function timeAxisFields(blockKey: string, language: string): HaFormSchema[] {
  return [
    // This heading sits *inside* the scope while the two below sit outside it, and that is
    // deliberate rather than sloppy. `blockScope` stamps `time_grid.` onto its children,
    // so this one resolves `time_grid.axis` — the title the collapsible used to carry,
    // already translated into nine languages. "Time Axis" is the right caption for this
    // run on its own merits (it is literally the axis: which hours, how often ruled, how
    // tall), so nothing is bent to keep the strings; they simply come along. The other two
    // runs have no such key and use ordinary shared `heading_*` names.
    blockScope(blockKey, [
      heading('axis'),
      row(text('start_time'), text('end_time')),
      row(
        {
          name: 'slot_minutes',
          selector: {
            select: {
              mode: 'dropdown',
              options: ([15, 20, 30, 60] as const).map((value) => ({
                value,
                label:
                  lookup(language, `${blockKey}.slot_minutes.option.${value}.label`) ??
                  String(value),
              })),
            },
          },
        },
        text('hour_height'),
      ),
    ]),

    // The gutter, and the two options qualifying it. `axis_label_minutes` follows
    // `show_axis_labels` because it is moot without it — a cadence read before the switch
    // that turns labelling off is half an answer — and it sits with `axis_width` because
    // the two move together: below the hour every label carries minutes, which is what
    // makes a content-sized gutter wider.
    heading('heading_hour_labels'),
    blockScope(blockKey, [
      row(text('axis_width'), bool('show_axis_labels'), {
        name: 'axis_label_minutes',
        selector: {
          select: {
            mode: 'dropdown',
            options: ([30, 60, 120, 180] as const).map((value) => ({
              value,
              label:
                lookup(language, `${blockKey}.axis_label_minutes.option.${value}.label`) ??
                String(value),
            })),
          },
        },
      }),
    ]),

    // What is drawn onto the grid rather than what rules it, and then the two caps on how
    // much may stack there. The `hour_line_*` and `allday_band_line_*` rows that used to
    // sit with these are in Separators now, with every other rule the grid draws: a user
    // restyling "the grid's lines" was being sent to two panels. The shading stays here
    // because it fills a column rather than ruling one, and nothing in Separators would
    // caption it.
    heading('heading_on_the_grid'),
    blockScope(blockKey, [
      color('weekend_background_color'),
      row(bool('show_now_line'), color('now_line_color')),
      {
        name: 'allday_band_max_rows',
        selector: { number: { min: 1, max: 10, step: 1, mode: 'box' } },
      },
      {
        name: 'max_simultaneous_events',
        selector: { number: { min: 1, max: 10, step: 1, mode: 'box' } },
      },
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
    // Grid keeps neither: `event_spacing` is inert there and withheld by `VIEW_SCOPE`,
    // and `day_spacing` is the column gutter rather than vertical space between days, so
    // it is in Separators beside the rules drawn inside it. Building the row conditionally
    // rather than letting the filter empty it keeps the panel's shape a decision made
    // here, where it can be read.
    const spacing: HaFormSchema[] =
      view === 'grid'
        ? []
        : [
            {
              type: 'grid',
              name: '',
              schema: [
                { name: 'day_spacing', selector: { text: { type: 'text' } } },
                { name: 'event_spacing', selector: { text: { type: 'text' } } },
              ],
            },
          ];

    const cardBox: HaFormSchema[] = [
      {
        name: 'additional_card_spacing',
        selector: { text: { type: 'text' } },
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

    if (heightMode === 'fixed') {
      cardBox.push({ name: 'card_height', selector: { text: { type: 'text' } } });
    } else if (heightMode === 'maximum') {
      cardBox.push({ name: 'card_max_height', selector: { text: { type: 'text' } } });
    }

    const blockKey = ViewConfig.OVERRIDE_BLOCK_BY_VIEW[view];

    // Grid leads with the axis and ends with the card box; the other two views keep the
    // order they always had, spacing first and the card box after it. Both put the
    // card-level options last, so this is one convention rather than two — the grid simply
    // has a great deal more to say before it gets there, and captions what it says.
    //
    // Only grid is captioned. List and column have four or five plain fields here, and a
    // heading over a run that short labels the obvious; grid has thirteen, where the
    // captions are what makes the panel scannable at all.
    const schema: HaFormSchema[] =
      view === 'grid' && blockKey !== undefined
        ? [...timeAxisFields(blockKey, language), heading('heading_card_size'), ...cardBox]
        : [...spacing, ...cardBox];

    // Gated on the view owning these keys, not merely on it owning a block. The group is
    // the density story — `min_day_width`, `min_days_to_show`, `min_days_fallback` — and
    // emitting it for any view with a block offered a list card three controls its config
    // does not accept, each of which would have been stored and then ignored.
    // `VIEWS_WITH_WIDTH_FALLBACK` is the same concept the width table below is already
    // gated on. `day_header_gap` was a fourth member until it moved to the Day Header
    // panel, where it sits with the rule drawn inside it.
    //
    // Last in every view that has it, which is now the panel's only collapsible. That is
    // the convention this editor keeps: a panel's plain options first, its collapsed
    // subsections after them. It also earns the disclosure honestly — how narrow the card
    // may get before columns drop is a genuinely advanced question, unlike the axis.
    if (blockKey !== undefined && ViewConfig.VIEWS_WITH_WIDTH_FALLBACK.has(view)) {
      schema.push(densityGroup(blockKey, daysToShow, language));
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

/**
 * Layout schema rows.
 */

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
 * Column density — the options that decide how narrow the card may get.
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
    titleKey: `${blockKey}.density`,
    iconPath: 'M4 5h16v2H4V5m0 6h16v2H4v-2m0 6h16v2H4v-2Z',
    schema: [
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
      {
        name: 'day_header_gap',
        selector: { text: {} },
      },
    ],
  };
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

    if (heightMode === 'fixed') {
      schema.push({ name: 'card_height', selector: { text: {} } });
    } else if (heightMode === 'maximum') {
      schema.push({ name: 'card_max_height', selector: { text: {} } });
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

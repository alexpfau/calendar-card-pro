/**
 * Day-header schema rows.
 */

import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { blockScope, bool, color, select, text } from './common';

/**
 * The weights a date can be drawn in. `default` keeps the card's own and is the shipped value,
 * so choosing it writes nothing.
 */
export const DATE_FONT_WEIGHTS: ReadonlyArray<string> = [
  'default',
  'light',
  'regular',
  'medium',
  'bold',
];

/**
 * A date's scale: a multiplier, as a calendar's `text_scale` is, in the same box.
 *
 * @param name - Config key
 * @returns The field
 */
function dateScaleField(name: string): HaFormSchema {
  return { name, selector: { number: { min: 0.1, step: 'any', mode: 'box' } } };
}

/**
 * A date's weight.
 *
 * @param language - Effective language code
 * @param name - Config key
 * @returns The field
 */
function dateWeightField(language: string, name: string): HaFormSchema {
  return select(language, name, DATE_FONT_WEIGHTS);
}

export const TODAY_INDICATOR_STYLES: ReadonlyArray<string> = [
  'none',
  'tile',
  'dot',
  'pulse',
  'glow',
  'icon',
  'custom',
];

export const WEEK_NUMBER_MODES: ReadonlyArray<string> = ['none', 'iso', 'simple'];

/**
 * The style dropdown and whichever value control the chosen style calls for.
 *
 * @param language - Effective language code
 * @param style - Derived indicator style
 * @returns The dropdown, and its value control where the style has one
 */
export function todayIndicatorFields(language: string, style: string): HaFormSchema[] {
  const chooser: HaFormSchema[] = [];

  if (style === 'icon') {
    chooser.push({ name: 'today_indicator_icon', selector: { icon: {} } });
  } else if (style === 'custom') {
    chooser.push(text('today_indicator_custom'));
  }

  return [select(language, 'today_indicator_style', TODAY_INDICATOR_STYLES), ...chooser];
}

/**
 * The week-numbering dropdown.
 *
 * @param language - Effective language code
 * @returns The dropdown
 */
export function weekNumberFields(language: string): HaFormSchema[] {
  return [select(language, 'week_number_mode', WEEK_NUMBER_MODES)];
}

/**
 * The today indicator's fields, whose value control and styling depend on the style.
 *
 * @param language - Effective language code
 * @param style - Derived indicator style
 * @returns The fields
 */
function todayIndicatorRun(language: string, style: string): HaFormSchema[] {
  // The tile is sized from the day number and drawn on it, so it has a color and nothing
  // else: a size or a position field would be the silent no-op this editor avoids.
  const styling: HaFormSchema[] =
    style === 'none'
      ? []
      : style === 'tile'
        ? [color('today_indicator_color')]
        : [
            color('today_indicator_color'),
            text('today_indicator_size'),
            text('today_indicator_position'),
          ];

  return [...todayIndicatorFields(language, style), ...styling];
}

/**
 * How today's date is drawn, before the indicator that marks it.
 *
 * @param language - Effective language code
 * @param showMonth - Whether the month line is shown
 * @returns The fields
 */
function todayRun(language: string, showMonth: boolean): HaFormSchema[] {
  return [
    dateScaleField('today_date_scale'),
    dateWeightField(language, 'today_date_font_weight'),
    color('today_weekday_color'),
    color('today_day_color'),
    ...(showMonth ? [color('today_month_color')] : []),
  ];
}

/**
 * The week-number fields, whose styling depends on week numbers being on at all.
 *
 * @param language - Effective language code
 * @param mode - Derived week-number mode
 * @returns The fields
 */
function weekNumberRun(language: string, mode: string): HaFormSchema[] {
  const styling: HaFormSchema[] =
    mode === 'none'
      ? []
      : [
          bool('show_current_week_number'),
          text('week_number_font_size'),
          color('week_number_color'),
          color('week_number_background_color'),
        ];

  return [...weekNumberFields(language), ...styling];
}

/**
 * The gap under a day header and the rule drawn inside it.
 *
 * Both live in the view's own block, and keeping their data there is a separate mechanism from
 * keeping their strings: the `scope` keeps the **data** path, so the values are written to
 * `column:` / `time_grid:`, while Home Assistant qualifies a label only under an expandable.
 * `blockScope` stamps the `titleKey` that keeps the `${blockKey}.` prefix, so the two views keep
 * their separate descriptions.
 *
 * @param blockKey - Config key holding this view's override block
 * @returns The fields
 */
function dayHeaderRuleFields(blockKey: string): HaFormSchema[] {
  return [
    blockScope(blockKey, [
      text('day_header_gap'),
      text('day_header_separator_width'),
      color('day_header_separator_color'),
    ]),
  ];
}

/**
 * Builds the Day Header panel schema.
 *
 * @param language - Effective language code
 * @param showMonth - Whether the month line is shown
 * @param indicatorStyle - Derived today-indicator style
 * @param weekNumberMode - Derived week-number mode
 * @param blockKey - Config key holding this view's block, when it owns the rule keys
 * @returns The panel's schema
 */
const dayHeaderSchema = Helpers.memoizeLast(
  (
    language: string,
    showMonth: boolean,
    indicatorStyle: string,
    weekNumberMode: string,
    blockKey: string | undefined,
  ): HaFormSchema[] => [
    select(language, 'date_vertical_alignment', ['top', 'middle', 'bottom']),
    text('weekday_font_size'),
    color('weekday_color'),
    text('day_font_size'),
    color('day_color'),
    bool('show_month'),
    ...(showMonth ? [text('month_font_size'), color('month_color')] : []),
    ...(blockKey === undefined ? [] : dayHeaderRuleFields(blockKey)),
    ...weekNumberRun(language, weekNumberMode),
    ...todayRun(language, showMonth),
    ...todayIndicatorRun(language, indicatorStyle),
    {
      name: 'past_date_opacity',
      selector: {
        number: { min: 0, max: 100, step: 'any', mode: 'box', unit_of_measurement: '%' },
      },
    },
    dateScaleField('past_date_scale'),
    dateWeightField(language, 'past_date_font_weight'),
    color('weekend_weekday_color'),
    color('weekend_day_color'),
    ...(showMonth ? [color('weekend_month_color')] : []),
  ],
);

/**
 * Builds the Day Header panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildDayHeaderSchema(ctx: SchemaCtx): HaFormSchema[] {
  const block = ViewConfig.viewBlockFor(ctx.view);

  return dayHeaderSchema(
    ctx.language,
    ctx.config.show_month,
    Synthetic.todayIndicatorStyle(ctx.config),
    ctx.config.show_week_numbers ?? 'none',
    // Gated on the block owning the keys rather than on the view merely having one, the
    // same test Layout and Separators use. List has no block at all, so it gets none of them.
    block?.onlyKeys.includes('day_header_gap') === true ? block.blockKey : undefined,
  );
}

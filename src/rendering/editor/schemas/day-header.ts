/**
 * The Day Header panel — the weekday, day number and month a day is announced by.
 *
 * Renamed from *Date Display*, and the rename is the point. A list row's date cell and
 * a column's header band are the same thing under two layouts, so a noun naming one of
 * them cannot survive the other — `day_header_gap` and `day_header_separator_*` already
 * ship with this noun.
 *
 * Thirty-five stacked fields in the old editor; here it presents as six things,
 * because the four sub-groups that are genuinely optional are collapsed. `flatten`
 * keeps the configuration exactly as flat as it was, so the grouping costs no
 * migration at all.
 *
 * `today_indicator` is a union of six shapes stored in one key, which is why its style
 * selector is synthetic. Choosing a shape rewrites the key; the picker that follows
 * edits it. Nothing about that reaches the configuration as a phantom option.
 */

import { mdiCalendarWeekBegin } from '@mdi/js';

import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { bool, color, group, row, select, text } from './common';

/** Icon for the panel. */
export const DAY_HEADER_ICON = mdiCalendarWeekBegin;

/** Icon paths for the sub-groups, inlined to keep the bundle to one asset. */
const WEEKEND_ICON =
  'M12 20a8 8 0 0 1-8-8 8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8m0-18a10 10 0 0 0-10 10 10 10 0' +
  ' 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m.5 5H11v6l4.75 2.85.75-1.23-4-2.37V7Z';
const TODAY_COLOR_ICON = 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 4a6 6 0 0 1 0 12V6Z';
const INDICATOR_ICON = 'M12 8a4 4 0 1 1-4 4 4 4 0 0 1 4-4Z';
const WEEK_NUMBER_ICON = 'M4 5h16v2H4V5m0 6h16v2H4v-2m0 6h16v2H4v-2Z';

/**
 * The today-indicator group, whose second field depends on the first.
 *
 * @param language - Effective language code
 * @param style - Derived indicator style
 * @returns The group
 */
function todayIndicatorGroup(language: string, style: string): HaFormSchema {
  const chooser: HaFormSchema[] = [];

  if (style === 'icon') {
    chooser.push({ name: 'today_indicator_icon', selector: { icon: {} } });
  } else if (style === 'custom') {
    chooser.push(text('today_indicator_custom'));
  }

  const styling: HaFormSchema[] =
    style === 'none'
      ? []
      : [
          row(color('today_indicator_color'), text('today_indicator_size')),
          text('today_indicator_position'),
        ];

  return group(language, 'today_indicator', INDICATOR_ICON, [
    select(language, 'today_indicator_style', ['none', 'dot', 'pulse', 'glow', 'icon', 'custom']),
    ...chooser,
    ...styling,
  ]);
}

/**
 * The week-number group, whose styling depends on week numbers being on at all.
 *
 * @param language - Effective language code
 * @param mode - Derived week-number mode
 * @returns The group
 */
function weekNumberGroup(language: string, mode: string): HaFormSchema {
  const styling: HaFormSchema[] =
    mode === 'none'
      ? []
      : [
          bool('show_current_week_number'),
          row(text('week_number_font_size'), color('week_number_color')),
          color('week_number_background_color'),
        ];

  return group(language, 'week_numbers', WEEK_NUMBER_ICON, [
    select(language, 'week_number_mode', ['none', 'iso', 'simple']),
    ...styling,
  ]);
}

/**
 * Builds the Day Header panel schema.
 *
 * Memoised on the three values that decide which fields appear — whether the month is
 * shown, which indicator style is chosen, whether week numbers are on — plus the
 * language. The view is absent on purpose: no field here is added or removed by view,
 * only annotated, and annotation is the helper hook's job.
 *
 * @param language - Effective language code
 * @param showMonth - Whether the month line is shown
 * @param indicatorStyle - Derived today-indicator style
 * @param weekNumberMode - Derived week-number mode
 * @returns The panel's schema
 */
export const dayHeaderSchema = Helpers.memoizeLast(
  (
    language: string,
    showMonth: boolean,
    indicatorStyle: string,
    weekNumberMode: string,
  ): HaFormSchema[] => [
    select(language, 'date_vertical_alignment', ['top', 'middle', 'bottom']),

    row(text('weekday_font_size'), color('weekday_color')),
    row(text('day_font_size'), color('day_color')),
    bool('show_month'),
    ...(showMonth ? [row(text('month_font_size'), color('month_color'))] : []),

    group(language, 'weekend_colors', WEEKEND_ICON, [
      color('weekend_weekday_color'),
      color('weekend_day_color'),
      color('weekend_month_color'),
    ]),

    group(language, 'today_colors', TODAY_COLOR_ICON, [
      color('today_weekday_color'),
      color('today_day_color'),
      color('today_month_color'),
    ]),

    todayIndicatorGroup(language, indicatorStyle),
    weekNumberGroup(language, weekNumberMode),
  ],
);

/**
 * Builds the Day Header panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildDayHeaderSchema(ctx: SchemaCtx): HaFormSchema[] {
  return dayHeaderSchema(
    ctx.language,
    ctx.config.show_month,
    Synthetic.todayIndicatorStyle(ctx.config),
    ctx.config.show_week_numbers ?? 'none',
  );
}

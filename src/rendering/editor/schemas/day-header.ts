/**
 * Day-header schema rows.
 */

import { mdiCalendarWeekBegin } from '@mdi/js';

import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { bool, color, group, heading, row, scope, select, text } from './common';

export const DAY_HEADER_ICON = mdiCalendarWeekBegin;

const WEEKEND_ICON =
  'M12 20a8 8 0 0 1-8-8 8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8m0-18a10 10 0 0 0-10 10 10 10 0' +
  ' 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m.5 5H11v6l4.75 2.85.75-1.23-4-2.37V7Z';
const TODAY_COLOR_ICON = 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 4a6 6 0 0 1 0 12V6Z';
const INDICATOR_ICON = 'M12 8a4 4 0 1 1-4 4 4 4 0 0 1 4-4Z';
const WEEK_NUMBER_ICON = 'M4 5h16v2H4V5m0 6h16v2H4v-2m0 6h16v2H4v-2Z';

export const TODAY_INDICATOR_STYLES: ReadonlyArray<string> = [
  'none',
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
 * The today-indicator group, whose second field depends on the first.
 *
 * @param language - Effective language code
 * @param style - Derived indicator style
 * @returns The group
 */
function todayIndicatorGroup(language: string, style: string): HaFormSchema {
  const styling: HaFormSchema[] =
    style === 'none'
      ? []
      : [
          row(color('today_indicator_color'), text('today_indicator_size')),
          text('today_indicator_position'),
        ];

  return group(language, 'today_indicator', INDICATOR_ICON, [
    ...todayIndicatorFields(language, style),
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
    ...weekNumberFields(language),
    ...styling,
  ]);
}

/**
 * The gap under a day header and the rule drawn inside it.
 *
 * The rule was a collapsed `nested()` under Separators, which was wrong twice over: every
 * other rule in that panel is vertical in these two views and this one is horizontal, and
 * the gap it is drawn *inside* was in Layout, one panel further away again. Gap and rule
 * are one decision, so they are read together or not at all.
 *
 * Both live in the view's own block, and the two things that made this a presentation
 * change are separate mechanisms — assuming the first buys the second is the trap here.
 * The `scope` keeps the **data** path, so the values are still written to `column:` /
 * `time_grid:`. It does *not* keep the string keys: Home Assistant qualifies a label only
 * under an expandable, so without the `titleKey` below the three would label themselves
 * bare and the two views would share one description. Only the chrome around them goes.
 *
 * @param blockKey - Config key holding this view's override block
 * @returns The heading and its fields
 */
function dayHeaderRuleFields(blockKey: string): HaFormSchema[] {
  // See above: storage nesting does not carry the label with it, so each field names the
  // key it had when a collapsible earned that prefix for it.
  const keyed = <T extends HaFormSchema>(node: T): T => ({
    ...node,
    titleKey: `${blockKey}.${node.name}`,
  });

  return [
    heading('heading_gap_and_rule'),
    scope(blockKey, [
      keyed(text('day_header_gap')),
      row(keyed(text('day_header_separator_width')), keyed(color('day_header_separator_color'))),
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

    // Last, and that is a choice rather than an append. A heading claims whatever follows
    // it, so a run placed mid-panel would caption the two collapsibles above — and this is
    // the only run here that exists in some views and not others, so keeping it at the end
    // means a user moving between workspaces sees the same panel with a section added,
    // rather than the same options in a different order. The collapsibles above carry
    // their own titles, so nothing is left uncaptioned by putting a bare heading below
    // them.
    ...(blockKey === undefined ? [] : dayHeaderRuleFields(blockKey)),
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
    // same test Layout and Separators used before these fields moved here. List has no
    // block at all, so it gets neither the heading nor the fields.
    block?.onlyKeys.includes('day_header_gap') === true ? block.blockKey : undefined,
  );
}

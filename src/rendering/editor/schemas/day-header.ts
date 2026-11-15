/**
 * Day-header schema rows.
 */

import { mdiCalendarArrowLeft, mdiCalendarWeekBegin } from '@mdi/js';

import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { blockScope, bool, color, group, heading, row, select, text } from './common';

export const DAY_HEADER_ICON = mdiCalendarWeekBegin;

const WEEKEND_ICON =
  'M12 20a8 8 0 0 1-8-8 8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8m0-18a10 10 0 0 0-10 10 10 10 0' +
  ' 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m.5 5H11v6l4.75 2.85.75-1.23-4-2.37V7Z';

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
 * The today-indicator group, whose second field depends on the first.
 *
 * @param language - Effective language code
 * @param style - Derived indicator style
 * @returns The group
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
            row(color('today_indicator_color'), text('today_indicator_size')),
            text('today_indicator_position'),
          ];

  return [heading('today_indicator'), ...todayIndicatorFields(language, style), ...styling];
}

/**
 * Today's run: how today's date is drawn, before the indicator that marks it.
 *
 * The size and weight come first because they restyle the whole date, the colors next because
 * each restyles one part of it. They sat in a collapsed "Today Colors" group at the foot of the
 * panel, with Week Numbers between them and the indicator, so making today stand out meant
 * visiting two places; here everything about today reads as one run, and the indicator's own
 * heading follows it directly.
 *
 * @param language - Effective language code
 * @param showMonth - Whether the month line is shown
 * @returns The heading and its fields
 */
function todayRun(language: string, showMonth: boolean): HaFormSchema[] {
  return [
    heading('heading_today'),
    row(dateScaleField('today_date_scale'), dateWeightField(language, 'today_date_font_weight')),
    color('today_weekday_color'),
    color('today_day_color'),
    ...(showMonth ? [color('today_month_color')] : []),
  ];
}

/**
 * The week-number group, whose styling depends on week numbers being on at all.
 *
 * @param language - Effective language code
 * @param mode - Derived week-number mode
 * @returns The group
 */
function weekNumberRun(language: string, mode: string): HaFormSchema[] {
  const styling: HaFormSchema[] =
    mode === 'none'
      ? []
      : [
          bool('show_current_week_number'),
          row(text('week_number_font_size'), color('week_number_color')),
          color('week_number_background_color'),
        ];

  return [heading('week_numbers'), ...weekNumberFields(language), ...styling];
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
  return [
    heading('heading_gap_and_rule'),
    // `blockScope`, not `scope`: see its docblock. These three keep the `${blockKey}.`
    // string prefix a collapsible used to earn them, so nothing translated moves.
    blockScope(blockKey, [
      text('day_header_gap'),
      row(text('day_header_separator_width'), color('day_header_separator_color')),
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
    // What every date shares, then the header's geometry and week numbering, then the
    // exceptions, by the kind of day they change. Each later run overrides the first one for
    // its own days, so the order is also the order a reader resolves a date's look in.
    select(language, 'date_vertical_alignment', ['top', 'middle', 'bottom']),

    row(text('weekday_font_size'), color('weekday_color')),
    row(text('day_font_size'), color('day_color')),
    bool('show_month'),
    ...(showMonth ? [row(text('month_font_size'), color('month_color'))] : []),

    // Above the runs about particular days, not among them: the gap and the rule are drawn
    // under every day's header alike, so they belong with what every date shares.
    ...(blockKey === undefined ? [] : dayHeaderRuleFields(blockKey)),

    // Week numbers before today: they mark weeks, not days, and leaving them between today's
    // run and the other days' groups split the per-day controls in two.
    //
    // Both indicator and week numbers are headed runs rather than collapsed groups. Each held
    // exactly one control on a fresh card — a dropdown set to `none` with every styling field
    // conditional on it — so a group opened onto one field. The headings reuse the old group
    // titles' keys, which arrive translated in all nine languages; the labels beneath them,
    // `Style` and `Numbering`, mean nothing at panel level without them.
    ...weekNumberRun(language, weekNumberMode),

    // Today visible, the other kinds of day collapsed: today is what a card is mostly about,
    // and the indicator that marks it is on by default, so neither may hide behind a click.
    ...todayRun(language, showMonth),
    ...todayIndicatorRun(language, indicatorStyle),

    group(language, 'past_days', mdiCalendarArrowLeft, [
      // The fade first: it is what a past day is usually given, and it needs nothing else.
      {
        name: 'past_date_opacity',
        selector: {
          number: { min: 0, max: 100, step: 'any', mode: 'box', unit_of_measurement: '%' },
        },
      },
      row(dateScaleField('past_date_scale'), dateWeightField(language, 'past_date_font_weight')),
    ]),

    group(language, 'weekend_colors', WEEKEND_ICON, [
      color('weekend_weekday_color'),
      color('weekend_day_color'),
      ...(showMonth ? [color('weekend_month_color')] : []),
    ]),
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

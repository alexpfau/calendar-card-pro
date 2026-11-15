/**
 * Event schema rows.
 */

import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { resolveWorkspaceOption } from '../workspace';
import { bool, color, number, select, text } from './common';

/** `off` first: the default reads as the top of the list, and the rest are places. */
/* Title before time, because the title sits ABOVE the time row on the card -- a dropdown
 * that offers them the other way round reads against the thing it is describing. `off`
 * leads because it is the default. */
export const ALLDAY_BADGE_POSITION_OPTIONS: ReadonlyArray<string> = ['off', 'title', 'time'];

/**
 * The four shapes the dropdown offers, in `ALLDAY_BADGE_STYLES` order -- quietest first, so
 * the default leads the list and reading down it walks toward the loudest.
 *
 * 🚨 This is NOT the stylesheet's declaration order, and a comment here claimed it was until
 * 4.2 -- wrongly, and from before the badge shipped: the stylesheet leads with tinted, which
 * it declares first as the shape the base rule is written against. A dropdown is ordered for
 * a reader and a stylesheet for the cascade, so those two are deliberately unreconciled.
 * The runtime table IS reconciled, by order and not merely by membership, because both now
 * claim the same ordering and a claim made twice can disagree with itself.
 */
export const ALLDAY_BADGE_STYLE_OPTIONS: ReadonlyArray<string> = [
  'subtle',
  'outline',
  'tinted',
  'filled',
];

/**
 * Where `time_position` can put the time row, the shipped place first: it is the default, and
 * the other reads as the change from it. Kept in `TIME_POSITIONS` order, which the editor
 * tests reconcile against.
 */
export const TIME_POSITION_OPTIONS: ReadonlyArray<string> = ['below', 'title'];

/**
 * The colors a treatment can be drawn in.
 *
 * Two sources and an escape hatch, which is the same shape `accent_color_mode` has one
 * control up: the keywords are stored as themselves, and `custom` stands for "the stored
 * value is a color". Ordered by how many events they can tell apart -- `accent` gives every
 * calendar its own, `text` gives them all the row's, and a custom color gives them all one
 * the user picked.
 */
export const ALLDAY_BADGE_COLOR_MODES: ReadonlyArray<string> = ['accent', 'text', 'custom'];

/** Card-wide accent modes. No "inherit": nothing sits above the card to inherit from. */
const ACCENT_COLOR_MODES = ['custom', 'home_assistant'] as const;

/**
 * The all-day badge controls: where the pill goes, and -- once it goes anywhere -- which of
 * the four treatments draws it and in which color.
 *
 * Both styling controls are hidden while the position is off, following `accent_color_mode`
 * and its color picker. A styling control for a thing that is not drawn is a control that
 * cannot do anything, and offering it invites the reading that setting it turns the feature
 * on.
 *
 * The color follows the treatment rather than leading it, because the two are a shape and
 * then a fill: which of the four is the more consequential pick and the one carrying a
 * default worth keeping, and it reads oddly to choose a color for a shape not yet named.
 *
 * @param language - Effective language code
 * @param position - Currently configured position, already resolved
 * @param colorMode - Derived badge color mode
 * @returns The fields, which is one field or three
 */
function alldayBadgeFields(
  language: string,
  position: Helpers.AlldayBadgePosition | null,
  colorMode: string,
): HaFormSchema[] {
  const positionField = select(language, 'allday_badge_position', ALLDAY_BADGE_POSITION_OPTIONS);

  if (position === null) return [positionField];

  return [
    positionField,
    select(language, 'allday_badge_style', ALLDAY_BADGE_STYLE_OPTIONS),
    select(language, 'allday_badge_color_mode', ALLDAY_BADGE_COLOR_MODES),
    ...(colorMode === 'custom' ? [color('allday_badge_color')] : []),
  ];
}

/**
 * How the time line looks, once there is one. `show_time` itself is not here: whether the line
 * exists at all is the switch that gates these.
 *
 * @param showTime - Whether event times are shown
 * @returns The fields, or none when times are off
 */
function timeFields(showTime: boolean): HaFormSchema[] {
  if (!showTime) return [];

  return [
    bool('show_end_time'),
    bool('show_duration'),
    bool('show_single_allday_time'),
    bool('show_multiday_allday_time'),
    bool('time_two_digit_hours'),
    text('time_font_size'),
    color('time_color'),
    text('time_icon_size'),
    number('time_max_lines', 0),
  ];
}

export const LOCATION_COUNTRY_MODES: ReadonlyArray<string> = ['keep', 'builtin', 'custom'];

/**
 * The country-removal dropdown and the pattern it may call for.
 *
 * @param language - Effective language code
 * @param countryMode - Derived country-removal mode
 * @returns The dropdown, and the pattern field where the mode calls for one
 */
export function locationCountryFields(language: string, countryMode: string): HaFormSchema[] {
  return [
    select(language, 'location_country_mode', LOCATION_COUNTRY_MODES),
    ...(countryMode === 'custom' ? [text('location_country_pattern')] : []),
  ];
}

/**
 * How the location line looks, whose country handling is a union stored in one key.
 *
 * @param language - Effective language code
 * @param showLocation - Whether event locations are shown
 * @param countryMode - Derived country-removal mode
 * @returns The fields, or none when locations are off
 */
function locationFields(
  language: string,
  showLocation: boolean,
  countryMode: string,
): HaFormSchema[] {
  if (!showLocation) return [];

  return [
    bool('show_location_allday'),
    ...locationCountryFields(language, countryMode),
    text('location_font_size'),
    color('location_color'),
    text('location_icon_size'),
    number('location_max_lines', 0),
  ];
}

/**
 * How the description line looks.
 *
 * @param showDescription - Whether event descriptions are shown
 * @returns The fields, or none when descriptions are off
 */
function descriptionFields(showDescription: boolean): HaFormSchema[] {
  if (!showDescription) return [];

  return [
    bool('show_description_allday'),
    text('description_font_size'),
    color('description_color'),
    text('description_icon_size'),
    number('description_max_lines', 0),
  ];
}

/**
 * The countdown's and the progress bar's options — the two things the card says about *when* —
 * each while its switch is on.
 *
 * @param showCountdown - Whether the countdown is shown
 * @param showProgressBar - Whether the progress bar is shown
 * @param repeatsApply - Whether the workspace draws a day's events one above the other, which
 *   leaving out repeated countdowns needs; a grid draws every countdown
 * @returns The fields, or none when neither is on
 */
function progressFields(
  showCountdown: boolean,
  showProgressBar: boolean,
  repeatsApply: boolean,
): HaFormSchema[] {
  return [
    ...(showCountdown
      ? [
          number('countdown_max_days', 0),
          bool('show_countdown_allday'),
          ...(repeatsApply ? [bool('countdown_once_per_day')] : []),
          bool('countdown_exact_days'),
        ]
      : []),
    ...(showProgressBar
      ? [color('progress_bar_color'), text('progress_bar_height'), text('progress_bar_width')]
      : []),
  ];
}

/**
 * Builds the Events panel schema.
 *
 * @param language - Effective language code
 * @param showTime - Whether event times are shown
 * @param showLocation - Whether event locations are shown
 * @param showDescription - Whether event descriptions are shown
 * @param countryMode - Derived country-removal mode
 * @param showCountdown - Whether the countdown is shown
 * @param showProgressBar - Whether the progress bar is shown
 * @param accentMode - Derived card accent mode
 * @param badgePosition - Resolved all-day badge position, or null when off
 * @param badgeColorMode - Derived all-day badge color mode
 * @param repeatsApply - Whether leaving out repeated countdowns applies in the workspace
 * @returns The panel's schema
 */
const eventsSchema = Helpers.memoizeLast(
  (
    language: string,
    showTime: boolean,
    showLocation: boolean,
    showDescription: boolean,
    countryMode: string,
    showCountdown: boolean,
    showProgressBar: boolean,
    accentMode: string,
    badgePosition: Helpers.AlldayBadgePosition | null,
    badgeColorMode: string,
    repeatsApply: boolean,
  ): HaFormSchema[] => [
    bool('show_time'),
    // Not gated on `show_time`: with times off a countdown still sits beside the title when
    // this asks for it, and list view's progress bar still takes a row of its own. Grid hides
    // it through `VIEW_SCOPE`, where it has no title line to join.
    select(language, 'time_position', TIME_POSITION_OPTIONS),
    bool('show_location'),
    bool('show_description'),
    bool('show_countdown'),
    bool('show_progress_bar'),
    bool('show_now_indicator'),
    color('now_color'),
    {
      name: 'past_event_opacity',
      selector: {
        number: { min: 0, max: 100, step: 'any', mode: 'box', unit_of_measurement: '%' },
      },
    },
    bool('accent_event_text'),
    select(language, 'accent_color_mode', ACCENT_COLOR_MODES),
    ...(accentMode === 'custom' ? [color('accent_color')] : []),
    text('vertical_line_width'),
    number('event_background_opacity', 0, 100, '%'),
    text('event_font_size'),
    color('event_color'),
    number('title_max_lines', 0),
    bool('scroll_long_titles'),
    select(language, 'event_icon_vertical_alignment', ['top', 'middle', 'bottom']),
    // Not gated on `show_time`: the badge marks an event as all-day, and only one of its two
    // positions sits in the time row.
    ...alldayBadgeFields(language, badgePosition, badgeColorMode),
    ...timeFields(showTime),
    ...locationFields(language, showLocation, countryMode),
    ...descriptionFields(showDescription),
    ...progressFields(showCountdown, showProgressBar, repeatsApply),
  ],
);

/**
 * Builds the Events panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildEventsSchema(ctx: SchemaCtx): HaFormSchema[] {
  const workspace = ctx.workspace ?? ctx.view;
  return eventsSchema(
    ctx.language,
    resolveWorkspaceOption(ctx.config, 'show_time', workspace),
    resolveWorkspaceOption(ctx.config, 'show_location', workspace),
    resolveWorkspaceOption(ctx.config, 'show_description', workspace),
    Synthetic.locationCountryMode(ctx.config),
    Boolean(resolveWorkspaceOption(ctx.config, 'show_countdown', workspace)),
    resolveWorkspaceOption(ctx.config, 'show_progress_bar', workspace),
    Synthetic.accentColorMode(ctx.config),
    Helpers.resolveAlldayBadgePosition(
      resolveWorkspaceOption(ctx.config, 'allday_badge', workspace),
    ),
    // Mode and value use the same projection, including a custom color held by this view.
    Synthetic.alldayBadgeColorMode(ctx.config.allday_badge_color),
    workspace !== 'grid',
  );
}

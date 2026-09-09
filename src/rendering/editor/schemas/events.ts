/**
 * Event schema rows.
 */

import { mdiCalendarText } from '@mdi/js';

import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { bool, color, group, heading, number, row, select, text } from './common';

export const EVENTS_ICON = mdiCalendarText;

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
 * The colours a treatment can be drawn in.
 *
 * Two sources and an escape hatch, which is the same shape `accent_color_mode` has one
 * control up: the keywords are stored as themselves, and `custom` stands for "the stored
 * value is a colour". Ordered by how many events they can tell apart -- `accent` gives every
 * calendar its own, `text` gives them all the row's, and a custom colour gives them all one
 * the user picked.
 */
export const ALLDAY_BADGE_COLOR_MODES: ReadonlyArray<string> = ['accent', 'text', 'custom'];

const TIME_ICON =
  'M12 20a8 8 0 1 1 8-8 8 8 0 0 1-8 8m0-18a10 10 0 1 0 10 10A10 10 0 0 0 12 2m.5 5H11v6l5.25 3.15.75-1.23-4.5-2.67V7Z';
const LOCATION_ICON =
  'M12 11.5A2.5 2.5 0 0 1 9.5 9 2.5 2.5 0 0 1 12 6.5 2.5 2.5 0 0 1 14.5 9a2.5 2.5 0 0 1-2.5 2.5M12' +
  ' 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z';
const DESCRIPTION_ICON = 'M3 5h18v2H3V5m0 6h18v2H3v-2m0 6h12v2H3v-2Z';
const PROGRESS_ICON = 'M2 10h20v4H2v-4m2 2h8v0H4v0Z';

/** Card-wide accent modes. No "inherit": nothing sits above the card to inherit from. */
const ACCENT_COLOR_MODES = ['custom', 'home_assistant'] as const;

/**
 * The time group, and the seven fields it holds once times are shown at all.
 *
 * @param language - Effective language code
 * @param showTime - Whether event times are shown
 * @returns The group
 */
/**
 * The all-day badge controls: where the pill goes, and -- once it goes anywhere -- which of
 * the four treatments draws it and in which colour.
 *
 * Both styling controls are hidden while the position is off, following `accent_color_mode`
 * and its colour picker. A styling control for a thing that is not drawn is a control that
 * cannot do anything, and offering it invites the reading that setting it turns the feature
 * on.
 *
 * The colour follows the treatment rather than leading it, because the two are a shape and
 * then a fill: which of the four is the more consequential pick and the one carrying a
 * default worth keeping, and it reads oddly to choose a colour for a shape not yet named.
 *
 * @param language - Effective language code
 * @param position - Currently configured position, already resolved
 * @param colorMode - Derived badge colour mode
 * @returns The fields, which is one field or three
 */
function alldayBadgeFields(
  language: string,
  position: Helpers.AlldayBadgePosition | null,
  colorMode: string,
): HaFormSchema[] {
  const positionField = select(language, 'allday_badge_position', ALLDAY_BADGE_POSITION_OPTIONS);

  if (position === null) return [positionField];

  // The mode and the colour it governs share a row for the reason `accent_color_mode`
  // documents above: a grid collapses to one column on a narrow viewport, so a conditional
  // field placed after the row lands below whatever else the row held.
  const colorField =
    colorMode === 'custom'
      ? row(
          select(language, 'allday_badge_color_mode', ALLDAY_BADGE_COLOR_MODES),
          color('allday_badge_color'),
        )
      : select(language, 'allday_badge_color_mode', ALLDAY_BADGE_COLOR_MODES);

  return [
    positionField,
    select(language, 'allday_badge_style', ALLDAY_BADGE_STYLE_OPTIONS),
    colorField,
  ];
}

/**
 * The time group — how the time line looks, once there is one.
 *
 * `show_time` itself is not here: whether the line exists at all is a content decision
 * and sits in the panel's visible run. Returning an empty array rather than an empty
 * group is what stops a disclosure opening onto nothing; the same contract holds for the
 * three groups below.
 *
 * @param language - Effective language code
 * @param showTime - Whether event times are shown
 * @returns The group, or nothing when times are off
 */
function timeGroup(language: string, showTime: boolean): HaFormSchema[] {
  if (!showTime) return [];

  return [
    group(language, 'time', TIME_ICON, [
      bool('show_end_time'),
      bool('show_single_allday_time'),
      bool('show_multiday_allday_time'),
      bool('time_two_digit_hours'),
      row(text('time_font_size'), color('time_color')),
      row(text('time_icon_size'), number('time_max_lines', 0)),
    ]),
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
 * The location group, whose country handling is a union stored in one key.
 *
 * @param language - Effective language code
 * @param showLocation - Whether event locations are shown
 * @param countryMode - Derived country-removal mode
 * @returns The group, or nothing when locations are off
 */
function locationGroup(
  language: string,
  showLocation: boolean,
  countryMode: string,
): HaFormSchema[] {
  if (!showLocation) return [];

  return [
    group(language, 'location', LOCATION_ICON, [
      bool('show_location_allday'),
      ...locationCountryFields(language, countryMode),
      row(text('location_font_size'), color('location_color')),
      row(text('location_icon_size'), number('location_max_lines', 0)),
    ]),
  ];
}

/**
 * The description group.
 *
 * @param language - Effective language code
 * @param showDescription - Whether event descriptions are shown
 * @returns The group, or nothing when descriptions are off
 */
function descriptionGroup(language: string, showDescription: boolean): HaFormSchema[] {
  if (!showDescription) return [];

  return [
    group(language, 'description', DESCRIPTION_ICON, [
      bool('show_description_allday'),
      row(text('description_font_size'), color('description_color')),
      row(text('description_icon_size'), number('description_max_lines', 0)),
    ]),
  ];
}

/**
 * The countdown and progress group — the two things the card says about *when*.
 *
 * @param language - Effective language code
 * @param showCountdown - Whether the countdown is shown
 * @param showProgressBar - Whether the progress bar is shown
 * @returns The group, or nothing when neither is on
 */
function progressGroup(
  language: string,
  showCountdown: boolean,
  showProgressBar: boolean,
): HaFormSchema[] {
  if (!showCountdown && !showProgressBar) return [];

  return [
    group(language, 'progress', PROGRESS_ICON, [
      ...(showCountdown ? [bool('show_countdown_allday')] : []),
      ...(showProgressBar
        ? [
            color('progress_bar_color'),
            row(text('progress_bar_height'), text('progress_bar_width')),
          ]
        : []),
    ]),
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
 * @param badgeColorMode - Derived all-day badge colour mode
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
  ): HaFormSchema[] => [
    // The five switches that decide which lines an event is made of, in one visible run
    // and ahead of everything that styles them.
    //
    // They were one per collapsed group, each leading the styling it gates — which reads
    // well once you have opened the group and is invisible until you do. On a fresh card
    // the styling is conditional and mostly absent, so three of those four groups held a
    // single switch: `Location` was one checkbox behind a disclosure, `Description` the
    // same, `Countdown & Progress` two. A reader could not discover that this card shows
    // a location at all without opening a group captioned as though it were about
    // location *styling*.
    //
    // So the switch and its styling split by what they answer: whether the line exists is
    // a content decision and belongs with the other four; how it looks is a refinement of
    // a line that already exists. Each group is now emitted only when its switch is on,
    // which is why there is no group here holding nothing — a disclosure that opens onto
    // one checkbox is worse than the checkbox.
    //
    // `heading_details` rather than a new key: the per-calendar subform already captions
    // `show_time` / `show_location` / `show_description` with it, so this is the same
    // category one level up, and reusing it keeps the two surfaces reading alike in all
    // nine translated languages instead of putting an English-only caption over the
    // card-level copy. `What Each Event Shows` was considered and is the wording this
    // file's heading comment records as already rejected — the headings are terse noun
    // phrases, and that one collides with the panel about what a card shows.
    heading('heading_details'),
    bool('show_time'),
    bool('show_location'),
    bool('show_description'),
    bool('show_countdown'),
    bool('show_progress_bar'),

    // Accent next, because it is the coarsest of the styling runs: one color, taken from
    // the calendar, that the bar, the tint and — through the switch leading this run —
    // every line of text can be drawn from. Those four were spread across the panel with
    // `title_max_lines` and the background opacity in between, so the accent read as four
    // unrelated options rather than as one decision with three consequences.
    heading('heading_accent'),
    // Still first within it, and still ahead of every color control it governs, which is
    // the invariant this run was ordered around before it had a heading: it changes what
    // `event_color` and the four group colors below mean, so a reader meeting it after
    // picking one has already picked a color that is being overridden. It
    // forward-references the accent the next control decides; the helper says so.
    bool('accent_event_text'),
    // The mode and the colour it governs are one control, so they share a row. A grid
    // collapses to a single column on a narrow viewport, so a conditional field placed
    // after this row would land below whatever else the row held — which is how the
    // colour input ended up separated from its dropdown by `vertical_line_width` on a
    // phone while reading correctly on a desktop.
    accentMode === 'custom'
      ? row(select(language, 'accent_color_mode', ACCENT_COLOR_MODES), color('accent_color'))
      : select(language, 'accent_color_mode', ACCENT_COLOR_MODES),
    text('vertical_line_width'),
    // With the accent rather than with the title, because the tint is *made* of the accent
    // — `presentation.ts` mixes it from the same resolved color the bar uses. Reading it
    // beside a font size suggested it was a property of the event box; it is the third
    // place the accent shows up.
    number('event_background_opacity', 0, 100, '%'),

    // The title's own four, which were split in two by the accent run above: size and
    // color came before it, the line limit and the scroll after. Nothing separates them
    // now, and this is the only run in the panel that styles the title — the four groups
    // below each style one other line.
    heading('heading_title'),
    row(text('event_font_size'), color('event_color')),
    number('title_max_lines', 0),
    bool('scroll_long_titles'),

    // The two markers an event can carry, as opposed to the text it is made of. The badge
    // is not inside the time group and not gated on show_time: it marks an event as
    // all-day, only one of its two positions happens to sit in the time row, and gating
    // the pair on show_time would make the TITLE pill unreachable for anyone who has
    // turned times off — exactly the configuration the title position exists to serve.
    heading('heading_icon_and_badge'),
    select(language, 'event_icon_vertical_alignment', ['top', 'middle', 'bottom']),
    ...alldayBadgeFields(language, badgePosition, badgeColorMode),

    ...timeGroup(language, showTime),
    ...locationGroup(language, showLocation, countryMode),
    ...descriptionGroup(language, showDescription),
    ...progressGroup(language, showCountdown, showProgressBar),
  ],
);

/**
 * Builds the Events panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildEventsSchema(ctx: SchemaCtx): HaFormSchema[] {
  // The live editor supplies a workspace projection to both gates and synthetic values.
  // Keep the view-aware gates for standalone schema builders too. The resolved values
  // are memo keys, so a different view cannot reuse the previous view's visibility.
  return eventsSchema(
    ctx.language,
    ViewConfig.resolveViewOption(ctx.config, 'show_time', ctx.view),
    ViewConfig.resolveViewOption(ctx.config, 'show_location', ctx.view),
    ViewConfig.resolveViewOption(ctx.config, 'show_description', ctx.view),
    Synthetic.locationCountryMode(ctx.config),
    ViewConfig.resolveViewOption(ctx.config, 'show_countdown', ctx.view),
    ViewConfig.resolveViewOption(ctx.config, 'show_progress_bar', ctx.view),
    Synthetic.accentColorMode(ctx.config),
    // Resolved through the view, so a column-view override of the position shows the
    // treatment select when the column turns the badge on and the card level has it off.
    Helpers.resolveAlldayBadgePosition(
      ViewConfig.resolveViewOption(ctx.config, 'allday_badge', ctx.view),
    ),
    // Mode and value use the same projection, including a custom color held by this view.
    Synthetic.alldayBadgeColorMode(ctx.config.allday_badge_color),
  );
}

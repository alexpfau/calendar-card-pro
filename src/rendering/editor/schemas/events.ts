/**
 * Event schema rows.
 */

import { mdiCalendarText } from '@mdi/js';

import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { bool, color, group, number, row, select, text } from './common';

export const EVENTS_ICON = mdiCalendarText;

const TIME_ICON =
  'M12 20a8 8 0 1 1 8-8 8 8 0 0 1-8 8m0-18a10 10 0 1 0 10 10A10 10 0 0 0 12 2m.5 5H11v6l5.25 3.15.75-1.23-4.5-2.67V7Z';
const LOCATION_ICON =
  'M12 11.5A2.5 2.5 0 0 1 9.5 9 2.5 2.5 0 0 1 12 6.5 2.5 2.5 0 0 1 14.5 9a2.5 2.5 0 0 1-2.5 2.5M12' +
  ' 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z';
const DESCRIPTION_ICON = 'M3 5h18v2H3V5m0 6h18v2H3v-2m0 6h12v2H3v-2Z';
const PROGRESS_ICON = 'M2 10h20v4H2v-4m2 2h8v0H4v0Z';

/**
 * The time group, and the seven fields it holds once times are shown at all.
 *
 * @param language - Effective language code
 * @param showTime - Whether event times are shown
 * @returns The group
 */
function timeGroup(language: string, showTime: boolean): HaFormSchema {
  const styling: HaFormSchema[] = showTime
    ? [
        bool('show_end_time'),
        bool('show_single_allday_time'),
        bool('time_two_digit_hours'),
        row(text('time_font_size'), color('time_color')),
        row(text('time_icon_size'), number('time_max_lines', 0)),
      ]
    : [];

  return group(language, 'time', TIME_ICON, [bool('show_time'), ...styling]);
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
 * @returns The group
 */
function locationGroup(language: string, showLocation: boolean, countryMode: string): HaFormSchema {
  const styling: HaFormSchema[] = showLocation
    ? [
        ...locationCountryFields(language, countryMode),
        row(text('location_font_size'), color('location_color')),
        row(text('location_icon_size'), number('location_max_lines', 0)),
      ]
    : [];

  return group(language, 'location', LOCATION_ICON, [bool('show_location'), ...styling]);
}

/**
 * The description group.
 *
 * @param language - Effective language code
 * @param showDescription - Whether event descriptions are shown
 * @returns The group
 */
function descriptionGroup(language: string, showDescription: boolean): HaFormSchema {
  const styling: HaFormSchema[] = showDescription
    ? [
        row(text('description_font_size'), color('description_color')),
        row(text('description_icon_size'), number('description_max_lines', 0)),
      ]
    : [];

  return group(language, 'description', DESCRIPTION_ICON, [bool('show_description'), ...styling]);
}

/**
 * The countdown and progress group — the two things the card says about *when*.
 *
 * @param language - Effective language code
 * @param showCountdown - Whether the countdown is shown
 * @param showProgressBar - Whether the progress bar is shown
 * @returns The group
 */
function progressGroup(
  language: string,
  showCountdown: boolean,
  showProgressBar: boolean,
): HaFormSchema {
  return group(language, 'progress', PROGRESS_ICON, [
    bool('show_countdown'),
    ...(showCountdown ? [bool('show_countdown_allday')] : []),
    bool('show_progress_bar'),
    ...(showProgressBar
      ? [color('progress_bar_color'), row(text('progress_bar_height'), text('progress_bar_width'))]
      : []),
  ]);
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
  ): HaFormSchema[] => [
    row(text('event_font_size'), color('event_color')),
    row(color('accent_color'), text('vertical_line_width')),
    number('event_background_opacity', 0, 100, '%'),
    number('title_max_lines', 0),
    select(language, 'event_icon_vertical_alignment', ['top', 'middle', 'bottom']),

    timeGroup(language, showTime),
    locationGroup(language, showLocation, countryMode),
    descriptionGroup(language, showDescription),
    progressGroup(language, showCountdown, showProgressBar),
  ],
);

/**
 * Builds the Events panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildEventsSchema(ctx: SchemaCtx): HaFormSchema[] {
  return eventsSchema(
    ctx.language,
    ctx.config.show_time,
    ctx.config.show_location,
    ctx.config.show_description,
    Synthetic.locationCountryMode(ctx.config),
    ctx.config.show_countdown,
    ctx.config.show_progress_bar,
  );
}

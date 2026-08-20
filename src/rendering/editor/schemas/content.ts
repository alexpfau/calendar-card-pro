/**
 * Content schema rows.
 */

import { mdiCalendarRange } from '@mdi/js';

import * as Config from '../../../config/config';
import * as Types from '../../../config/types';
import * as ViewConfig from '../../../config/view';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { bool, color, group, heading, number, row, select, text } from './common';

export const CONTENT_ICON = mdiCalendarRange;

const COMPACT_ICON = 'M4 5h16v2H4V5m0 6h10v2H4v-2m0 6h16v2H4v-2Z';
const CONTENT_GROUP_ICON =
  'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0' +
  ' 2-2V5a2 2 0 0 0-2-2m-7 0a1 1 0 0 1 1 1 1 1 0 0 1-1 1 1 1 0 0 1-1-1 1 1 0 0 1 1-1Z';
const LANGUAGE_ICON =
  'M12.87 15.07l-2.54-2.51.03-.03A17.5 17.5 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44' +
  ' 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5' +
  ' 3.11 3.11.76-2.04M18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12m-2.62 7l1.62-4.33L19.12 17h-3.24Z';

/**
 * The start-date controls, which vary with the shape of the value.
 *
 * @param language - Effective language code
 * @param mode - Derived start-date mode
 * @returns The mode selector and the control it calls for
 */
function startDateFields(language: string, mode: string): HaFormSchema[] {
  const fields: HaFormSchema[] = [
    select(language, 'start_date_mode', ['default', 'fixed', 'offset']),
  ];

  if (mode === 'fixed') {
    fields.push({ name: 'start_date_fixed', selector: { text: { type: 'date' } } });
  } else if (mode === 'offset') {
    fields.push(text('start_date_offset'));
  }

  return fields;
}

/**
 * The compact-mode fields, in dependency order.
 *
 * @param hasEventLimit - Whether a card-wide compact event limit is set
 * @returns The two limits, and the modifier once it has something to modify
 */
function compactFields(hasEventLimit: boolean): HaFormSchema[] {
  return [
    row(number('compact_days_to_show', 1), number('compact_events_to_show', 0)),
    ...(hasEventLimit ? [bool('compact_events_complete_days')] : []),
  ];
}

/**
 * Builds the Time Range & Content panel schema.
 *
 * @param language - Effective language code
 * @param startMode - Derived start-date mode
 * @param languageMode - Derived language mode
 * @param hasEventLimit - Whether a compact event limit is set, which is what the
 *   `compact_events_complete_days` toggle depends on
 * @param showEmptyDays - Whether empty days are shown, which is what the two empty-day
 *   fields depend on
 * @returns The panel's schema
 */
const contentSchema = Helpers.memoizeLast(
  (
    language: string,
    startMode: string,
    languageMode: string,
    hasEventLimit: boolean,
    showEmptyDays: boolean,
  ): HaFormSchema[] => {
    const emptyDayFields: HaFormSchema[] = showEmptyDays
      ? [text('empty_day_text'), color('empty_day_color')]
      : [];

    return [
      number('days_to_show', 1),
      ...startDateFields(language, startMode),
      select(language, 'first_day_of_week', ['system', 'monday', 'sunday']),

      group(language, 'compact_mode', COMPACT_ICON, compactFields(hasEventLimit)),

      group(language, 'content', CONTENT_GROUP_ICON, [
        heading('heading_filters'),
        select(language, 'event_type', ['all', 'timed', 'all_day']),
        bool('show_past_events'),
        bool('filter_duplicates'),

        heading('heading_multiday'),
        bool('split_multiday_events'),

        heading('heading_nothing'),
        bool('show_empty_days'),
        ...emptyDayFields,
        bool('hide_when_empty'),
      ]),

      group(language, 'locale', LANGUAGE_ICON, [
        select(language, 'language_mode', ['system', 'custom']),
        ...(languageMode === 'custom' ? [text('language')] : []),
        select(language, 'time_format', ['system', '24', '12']),
      ]),
    ];
  },
);

/**
 * Builds the Time Range & Content panel schema for a context.
 *
 * @param ctx - Schema context
 * @returns The panel's schema
 */
export function buildContentSchema(ctx: SchemaCtx): HaFormSchema[] {
  return contentSchema(
    ctx.language,
    Synthetic.startDateMode(ctx.config),
    Synthetic.languageMode(ctx.config),
    hasCompactEventLimit(ctx.config),
    resolvesEmptyDays(ctx.config, ctx.view),
  );
}

/**
 * Whether a card-wide compact event limit is set.
 *
 * @param config - Merged configuration
 * @returns `true` when the complete-days modifier has something to modify
 */
function hasCompactEventLimit(config: Readonly<Types.Config>): boolean {
  return Config.toValidNumber(config.compact_events_to_show, 0) !== undefined;
}

/**
 * Whether the card shows empty days in the view it is configured for.
 *
 * @param config - Merged configuration
 * @param view - View the card is configured to render
 * @returns `true` when empty days can appear
 */
function resolvesEmptyDays(config: Readonly<Types.Config>, view: Types.EffectiveView): boolean {
  return Boolean(ViewConfig.resolveViewOption(config as Types.Config, 'show_empty_days', view));
}

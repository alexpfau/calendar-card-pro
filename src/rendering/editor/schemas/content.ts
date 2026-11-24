/**
 * Content schema rows.
 */

import * as Config from '../../../config/config';
import * as Types from '../../../config/types';
import * as Helpers from '../../../utils/helpers';
import type { HaFormSchema } from '../ha-form';
import type { SchemaCtx } from '../panels';
import * as Synthetic from '../synthetic';
import { resolveWorkspaceOption, viewForWorkspace } from '../workspace';
import { bool, color, number, select, text } from './common';

/**
 * The start-date controls, which vary with the shape of the value.
 *
 * @param language - Effective language code
 * @param mode - Start-date mode, as presented
 * @param modes - The choices offered: Month's page offers three (`Synthetic.MONTH_START_DATE_MODES`)
 * @returns The mode selector and the control it calls for
 */
function startDateFields(
  language: string,
  mode: string,
  modes: ReadonlyArray<string>,
): HaFormSchema[] {
  const fields: HaFormSchema[] = [select(language, 'start_date_mode', modes)];

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
    number('compact_days_to_show', 1),
    number('compact_events_to_show', 0),
    ...(hasEventLimit ? [bool('compact_events_complete_days')] : []),
  ];
}

/**
 * Builds the Time Range & Content panel schema.
 *
 * @param language - Effective language code
 * @param startMode - Start-date mode, as presented (`synthetic.ts` › `modeFor`)
 * @param hasEventLimit - Whether a compact event limit is set, which is what the
 *   `compact_events_complete_days` toggle depends on
 * @param showEmptyDays - Whether empty days are shown, which is what the two empty-day
 *   fields depend on, and what hides `show_empty_today`, which has nothing to add then
 * @param showEmptyToday - Whether today is shown even when it is empty, which also puts an
 *   empty day on the card and so also calls for the two empty-day fields
 * @param filterDuplicates - Whether duplicates are filtered, which is what the merged-row
 *   accent color depends on
 * @returns The panel's schema
 */
const contentSchema = Helpers.memoizeLast(
  (
    language: string,
    startMode: string,
    startModes: ReadonlyArray<string>,
    hasEventLimit: boolean,
    showEmptyDays: boolean,
    showEmptyToday: boolean,
    filterDuplicates: boolean,
  ): HaFormSchema[] => {
    const emptyDayFields: HaFormSchema[] =
      showEmptyDays || showEmptyToday ? [text('empty_day_text'), color('empty_day_color')] : [];

    return [
      number('days_to_show', 1),
      ...startDateFields(language, startMode, startModes),
      select(language, 'first_day_of_week', ['system', 'monday', 'sunday']),
      // A list option: the List workspace offers it, and the others withhold it.
      select(language, 'event_order', ['earliest_first', 'latest_first']),
      select(language, 'event_type', ['all', 'timed', 'all_day']),
      bool('show_past_events'),
      select(language, 'filter_duplicates_mode', Synthetic.FILTER_DUPLICATES_MODES),
      // Dependent on purpose: with duplicates showing there is no merged row to recolor,
      // so an always-visible field would be inert half the time — the silent no-op this
      // editor tries hard not to ship.
      ...(filterDuplicates ? [color('duplicate_accent_color')] : []),
      // A list option, like the order.
      number('skip_first_events', 0),
      // Each workspace offers the one its views read: the split for list and column, the
      // banner for the time grid.
      bool('split_multiday_events'),
      bool('multiday_banners'),
      bool('show_empty_days'),
      // Dependent for the same reason as the merged-row color above: with every empty day
      // showing, today is already one of them and the switch would do nothing.
      ...(showEmptyDays ? [] : [bool('show_empty_today')]),
      ...emptyDayFields,
      bool('hide_when_empty'),
      ...compactFields(hasEventLimit),
      select(language, 'language_mode', Synthetic.LANGUAGE_CHOICES),
      select(language, 'time_format', ['system', '24', '12']),
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
  const workspace = ctx.workspace ?? ctx.view;
  // Start Date's home is a Whole Card page, whose base view is List: only Month's own page reads it
  // as Month does.
  const month = viewForWorkspace(workspace) === 'month';
  return contentSchema(
    ctx.language,
    Synthetic.startDateModeShown(
      Synthetic.modeFor(ctx, 'start_date_mode', Synthetic.startDateMode),
      month ? 'month' : undefined,
    ),
    month ? Synthetic.MONTH_START_DATE_MODES : Synthetic.START_DATE_MODES,
    hasCompactEventLimit(ctx.config),
    Boolean(resolveWorkspaceOption(ctx.config, 'show_empty_days', workspace)),
    Boolean(resolveWorkspaceOption(ctx.config, 'show_empty_today', workspace)),
    Boolean(resolveWorkspaceOption(ctx.config, 'filter_duplicates', workspace)),
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

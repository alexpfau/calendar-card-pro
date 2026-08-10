/**
 * View resolution for Calendar Card Pro
 *
 * Resolves the effective value of a configuration option for the view the card is
 * currently rendering, and validates the contents of the `column:` override block.
 *
 * The card exposes two views. Most options are configured once at the top level and
 * apply to both. Options whose useful value genuinely differs between a full-width
 * row and a narrow column can be overridden per view inside `column:`.
 */

import { DEFAULT_CONFIG } from './config';
import * as Types from './types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// KEY CLASSIFICATION
//-----------------------------------------------------------------------------

/**
 * Every option that may appear inside the `column:` block.
 *
 * Exported so tests and future editor work can enumerate the block rather than
 * re-deriving it. Membership is deliberately narrow: see `ColumnOverrides`.
 */
export const COLUMN_OVERRIDE_KEYS: ReadonlyArray<keyof Types.ColumnOverrides> = [
  'show_empty_days',
  'empty_day_text',
  'vertical_line_width',
  'event_spacing',
  'additional_card_spacing',
  'height',
  'max_height',
  'today_indicator',
  'today_indicator_size',
  'weekday_font_size',
  'day_font_size',
  'show_month',
  'month_font_size',
  'event_background_opacity',
  'event_font_size',
  'show_countdown',
  'show_countdown_allday',
  'show_progress_bar',
  'progress_bar_height',
  'progress_bar_width',
  'event_icon_vertical_alignment',
  'show_time',
  'show_single_allday_time',
  'time_two_digit_hours',
  'show_end_time',
  'time_font_size',
  'time_icon_size',
  'show_location',
  'remove_location_country',
  'location_font_size',
  'location_icon_size',
  'show_description',
  'description_max_lines',
  'description_font_size',
  'description_icon_size',
];

const OVERRIDE_KEY_SET: ReadonlySet<string> = new Set<string>(COLUMN_OVERRIDE_KEYS);

/**
 * Options that influence which events are fetched from Home Assistant.
 *
 * These can never become overrides. Switching between views must not refetch, so an
 * option in this set would fire a Home Assistant API call every time the viewport
 * crossed the breakpoint between the two views.
 */
const FETCH_TIME_KEYS: ReadonlySet<string> = new Set([
  'entities',
  'start_date',
  'days_to_show',
  'first_day_of_week',
  'show_past_events',
  'filter_duplicates',
  'weather',
  'refresh_interval',
  'refresh_on_navigate',
]);

/**
 * Column-view options that are named in the design but not implemented yet.
 *
 * Reported separately so a user who copies an example from the design document is
 * told the truth — the option is real and planned — rather than being told it is a
 * typo.
 */
const NOT_YET_IMPLEMENTED_KEYS: ReadonlySet<string> = new Set([
  'day_gap',
  'day_header_separator_width',
  'day_header_separator_color',
]);

//-----------------------------------------------------------------------------
// RESOLUTION
//-----------------------------------------------------------------------------

/**
 * Determines whether an override block supplies a value for an option.
 *
 * Resolution is presence-based, not truthiness-based. `show_location: false` inside
 * the block must suppress a location that the top level enables, and
 * `show_location: true` must restore one that the top level disables. Reading the
 * value with `!== false` or `=== true` would collapse one of those two cases.
 *
 * `hasOwnProperty` rather than `in` keeps inherited members of `Object.prototype`
 * (`toString`, `valueOf`, …) from reading as configured options.
 *
 * An own property explicitly set to `undefined` counts as absent. `undefined` is
 * JavaScript's own "no value" sentinel and cannot be produced by YAML, so this only
 * affects programmatic callers, for whom it already means exactly that.
 */
function hasOverride(overrides: Types.ColumnOverrides, key: keyof Types.ColumnOverrides): boolean {
  return (
    Object.prototype.hasOwnProperty.call(overrides, key) &&
    (overrides as Record<string, unknown>)[key] !== undefined
  );
}

/**
 * Resolves the effective value of an option for the view being rendered.
 *
 * In list view the top-level value always wins. In column view the `column:` block
 * wins where it supplies the option, and the top-level value is inherited where it
 * does not.
 *
 * Inheritance reads the **merged** configuration passed in, never `DEFAULT_CONFIG`.
 * By the time a configuration reaches a renderer the defaults have already been
 * merged into it, so falling back to `DEFAULT_CONFIG` here would discard the user's
 * top-level value and silently substitute the shipped one.
 *
 * The active view must be supplied by the caller rather than read from
 * `config.view`, because column view falls back to list view on viewports too narrow
 * to hold its columns. `config.view` records what the user asked for; the argument
 * records what is actually being rendered.
 *
 * @param config - Merged configuration, defaults already applied
 * @param key - Option to resolve
 * @param effectiveView - View currently being rendered
 * @returns The value that applies in that view
 */
export function resolveViewOption<K extends keyof Types.ColumnOverrides & keyof Types.Config>(
  config: Types.Config,
  key: K,
  effectiveView: Types.EffectiveView,
): Types.Config[K] {
  const overrides = config.column;

  if (effectiveView !== 'column' || !overrides) {
    return config[key];
  }

  if (!hasOverride(overrides, key)) {
    return config[key];
  }

  // `hasOverride` has established that the option is present and not `undefined`,
  // which is the only way the optional override type can widen the config type.
  return overrides[key] as Types.Config[K];
}

//-----------------------------------------------------------------------------
// VALIDATION
//-----------------------------------------------------------------------------

/**
 * Reports options inside the `column:` block that will not take effect.
 *
 * Called once per `setConfig`. It never throws and never mutates the configuration:
 * an unusable option is ignored, exactly as Home Assistant ignores an unknown
 * option, so one stray line cannot blank the whole card.
 *
 * Note that this diagnostic is only visible in the development build. The
 * production bundle compiles out every log level below `error`, so the reference
 * documentation is what carries these boundaries for end users.
 *
 * @param config - Merged configuration to inspect
 */
export function validateColumnOverrides(config: Types.Config): void {
  const overrides = config.column;

  if (!overrides || typeof overrides !== 'object') {
    return;
  }

  for (const key of Object.keys(overrides)) {
    if (OVERRIDE_KEY_SET.has(key)) {
      continue;
    }

    if (FETCH_TIME_KEYS.has(key)) {
      Logger.warn(
        `Ignoring "column.${key}": it determines which events are loaded from Home Assistant, ` +
          `so it cannot differ between views — switching views would have to refetch. ` +
          `Set "${key}" at the top level instead.`,
      );
      continue;
    }

    if (NOT_YET_IMPLEMENTED_KEYS.has(key)) {
      Logger.warn(
        `Ignoring "column.${key}": this option is planned for column view but is not implemented yet.`,
      );
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) {
      Logger.warn(
        `Ignoring "column.${key}": "${key}" is a valid top-level option but cannot be overridden ` +
          `per view. Set it at the top level instead.`,
      );
      continue;
    }

    Logger.warn(`Ignoring "column.${key}": not a recognized option.`);
  }
}

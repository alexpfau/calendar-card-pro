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

/**
 * Column-only options — the ones with no top-level counterpart.
 *
 * Kept separate from `COLUMN_OVERRIDE_KEYS` because the two lists mean different
 * things, even though both are spelled inside `column:`. An override *replaces* a
 * top-level value for one view and inherits it otherwise; these have nothing to
 * inherit from, so they are configuration that simply does not exist in list view.
 *
 * The distinction is load-bearing rather than editorial: every key in
 * `COLUMN_OVERRIDE_KEYS` must also be a `DEFAULT_CONFIG` key — an override of an
 * option the card does not have would resolve to `undefined` at every call site —
 * and these three deliberately are not. Merging the lists would either break that
 * invariant or force three phantom top-level options into `DEFAULT_CONFIG` that no
 * list-view code path could ever read.
 */
export const COLUMN_ONLY_KEYS: ReadonlyArray<keyof Types.ColumnOverrides> = [
  'day_gap',
  'day_header_separator_width',
  'day_header_separator_color',
];

const OVERRIDE_KEY_SET: ReadonlySet<string> = new Set<string>([
  ...COLUMN_OVERRIDE_KEYS,
  ...COLUMN_ONLY_KEYS,
]);

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
 *
 * These are the keys the spec defers out of the column MVP (D1/D5). They matter
 * because of where they would otherwise fall: each one *is* a valid member of
 * `DEFAULT_CONFIG`, so without this set the validator reaches the "cannot be
 * overridden per view — set it at the top level instead" branch and gives advice
 * that does not work. Column view renders no week rows and no day, week or month
 * separators at all, so setting these at the top level changes nothing there.
 *
 * The set was briefly empty after Phase 4b implemented the three keys that used to
 * live here. It is kept rather than deleted because the situation it describes
 * recurs on every phase boundary: the design document is published, so a key can be
 * public knowledge before it is public behaviour, and "planned but not built" is a
 * materially different message from "not a recognized option".
 */
const NOT_YET_IMPLEMENTED_KEYS: ReadonlySet<string> = new Set([
  // Week numbering — column view renders no week rows (spec D1 table, :785-788).
  'show_week_numbers',
  'show_current_week_number',
  'week_number_font_size',
  'week_number_color',
  'week_number_background_color',
  // Separators — the boundary between days in a column layout is the grid gap,
  // which `day_gap` controls, so none of these have a surface to render on.
  'week_separator_width',
  'week_separator_color',
  'month_separator_width',
  'month_separator_color',
  'day_separator_width',
  'day_separator_color',
]);

//-----------------------------------------------------------------------------
// COLUMN-ONLY DEFAULTS
//-----------------------------------------------------------------------------

/**
 * Defaults for the Category C keys — the column-only options with no top-level
 * counterpart.
 *
 * These cannot live in `DEFAULT_CONFIG` the way every other default does.
 * `DEFAULT_CONFIG.column` is `undefined`, because an empty `column: {}` block must be
 * indistinguishable from no block at all; giving it a populated object would make the
 * block always present and defeat the presence-based resolution in `hasOverride`. So
 * the defaults for what goes *inside* the block live here instead.
 *
 * The chosen values make an absent `column:` block a visual no-op relative to the
 * list view's own defaults:
 *
 * - `day_gap` is `4px`, the value the spec's own worked example uses. B2 rules only
 *   the two separator keys, so this one was decided rather than cited. It shipped
 *   briefly as `10px`, justified as matching `DEFAULT_CONFIG.day_spacing` — the same
 *   vertical-to-horizontal category error that produced the B2 defect. `day_spacing`
 *   separates stacked days along the axis where space is free; this gap spends the
 *   horizontal budget D6's sizing table calls the scarce resource, roughly 161px per
 *   event in a 500px section. At the default `days_to_show: 3` the difference is
 *   12px of the width threshold (492px at 10px, 480px at 4px), which is most of the
 *   margin the card has against Home Assistant's 500px section.
 *
 *   The cost is real and is accepted knowingly: the MVP renders **no vertical rule
 *   between columns** (D6 defers that alongside week numbers), so this gap is the
 *   only thing separating two adjacent columns of text. 4px is therefore a
 *   legibility risk, not a free saving, and it is the first thing to re-measure if
 *   columns read as one block. Widening it costs threshold headroom, so the two
 *   cannot be traded independently.
 * - `day_header_separator_width` is `1px` — visible by default, which is the one
 *   place these defaults deliberately break the "match the list" rule. Every list
 *   separator defaults to `0px` because it is decoration between days that are
 *   already separated by vertical space. This rule is structural: it marks where a
 *   column's header ends and its events begin, a boundary that has no equivalent in
 *   a stacked layout. It exists only inside column view, so defaulting it visible
 *   cannot change list output.
 * - `day_header_separator_color` is `var(--divider-color)`, Home Assistant's semantic
 *   divider token, rather than the `var(--secondary-text-color)` the list separators
 *   use. That is a deliberate token-family choice, not an oversight: this is a
 *   structural divider, not text. Do not "fix" it to match the list separators.
 *
 * Both separator values are ruled by section B2 of the spec; the reasoning above is
 * a summary of it. An earlier implementation shipped `0px` /
 * `var(--secondary-text-color)` here by reasoning from local consistency with the
 * list defaults instead of reading B2, which is the exact change B2 forbids.
 */
export const COLUMN_DEFAULTS = {
  day_gap: '4px',
  day_header_separator_width: '1px',
  day_header_separator_color: 'var(--divider-color)',
} as const;

/**
 * Column-only options whose value is a CSS length.
 *
 * These accept a bare number from YAML, because that is what users write. Home
 * Assistant's YAML parser types `day_gap: 4` as a number, and a number is not a
 * valid CSS length: it reaches `styleMap` as `"4"`, the browser rejects the
 * declaration, and the rule silently disappears. Coercing here means the failure
 * cannot reach the renderer.
 */
const COLUMN_LENGTH_KEYS: ReadonlySet<string> = new Set(['day_gap', 'day_header_separator_width']);

/**
 * Normalizes a column-only option value to a usable CSS string.
 *
 * @param key - Option being resolved
 * @param value - Raw configured value, which YAML may have typed as a number
 * @returns A CSS-valid string
 */
function normalizeColumnValue(key: string, value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return COLUMN_LENGTH_KEYS.has(key) ? `${value}px` : String(value);
  }

  return String(value);
}

/**
 * Resolves a Category C column-only option.
 *
 * Separate from `resolveViewOption` because these keys have no top-level counterpart
 * and therefore no inheritance step: the value is either present in the block or it
 * is the shipped default. Calling `resolveViewOption` for one of them would not
 * compile, which is the intended guard.
 *
 * @param config - Merged configuration, defaults already applied
 * @param key - Column-only option to resolve
 * @returns The configured value, or its default
 */
export function resolveColumnOption<K extends keyof typeof COLUMN_DEFAULTS>(
  config: Types.Config,
  key: K,
): string {
  const overrides = config.column;

  if (overrides && hasOverride(overrides, key)) {
    return normalizeColumnValue(key, overrides[key]);
  }

  return COLUMN_DEFAULTS[key];
}

/**
 * Reports whether a resolved CSS length means "none".
 *
 * A renderer that compares against the literal `'0px'` misses `0`, `'0'` and
 * `'0em'`, each of which a user can reasonably write and every one of which means
 * the same thing. Getting this wrong does not merely render a thin line — it emits
 * an element that still occupies its own margin, leaving a gap with nothing in it.
 *
 * @param value - A resolved CSS length
 * @returns `true` when the length is zero in any unit
 */
export function isZeroLength(value: string): boolean {
  return /^0(?:[a-z%]*)$/i.test(value.trim());
}

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

  warnAboutTopLevelColumnOnlyKeys(config);
}

/**
 * Reports column-only options mistakenly written at the top level.
 *
 * `day_gap`, `day_header_separator_width` and `day_header_separator_color` only
 * exist inside `column:`. Written at the top level they are silently inert, which
 * is the *more* likely mistake of the two: the reference documentation lists them
 * in the same visual table as genuine top-level options, so nothing about their
 * presentation signals that they are nested.
 *
 * Without this, `column.foo` gets a tailored diagnostic while a misplaced
 * `day_gap: 32px` gets nothing at all.
 *
 * @param config - Merged configuration to inspect
 */
function warnAboutTopLevelColumnOnlyKeys(config: Types.Config): void {
  for (const key of COLUMN_ONLY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      Logger.warn(
        `Ignoring top-level "${key}": it is a column-view-only option and has no effect ` +
          `outside the "column:" block. Move it to "column: { ${key}: ... }".`,
      );
    }
  }
}

//-----------------------------------------------------------------------------
// WIDTH FALLBACK
//-----------------------------------------------------------------------------

/**
 * Horizontal padding the card reserves for itself in column view, in pixels.
 *
 * Column view narrows `ha-card`'s horizontal padding to a symmetric 8px. The list
 * view's asymmetric 8px-left / 16px-right exists to sit beside its fixed-width date
 * column, which column view does not have, so the asymmetry has no meaning here.
 *
 * This is not cosmetic — it is load-bearing arithmetic. See
 * `DEFAULT_CONFIG.min_day_column_width_px`.
 */
export const COLUMN_CARD_PADDING_PX = 16;

/**
 * Width band, in pixels, by which the column-to-list threshold is lowered once
 * column view is already showing.
 *
 * A single threshold oscillates: switching to column view changes the card's height,
 * which in a masonry dashboard can change the available width, which can switch the
 * view straight back (A3-C, risk 1). Two thresholds — enter at `T`, leave at
 * `T - band` — make the switch a Schmitt trigger, so a card sitting exactly on the
 * boundary settles instead of flapping.
 *
 * 32px is a judgement call, not a measurement: it is wide enough to absorb a
 * scrollbar appearing (typically 15-17px) plus sub-pixel layout rounding, and narrow
 * enough that it cannot strand a card in column view at a width where the columns
 * are visibly too tight. The spec leaves the band open (A3-C); revisit it with live
 * HA measurements at masonry widths.
 */
export const VIEW_SWITCH_HYSTERESIS_PX = 32;

/**
 * Parses a CSS pixel length into a number.
 *
 * Returns `fallback` for anything that is not a plain pixel value, because the
 * threshold arithmetic cannot be performed on `em`, `%` or `calc()`. A user who
 * writes one of those gets the default spacing in the calculation rather than a
 * `NaN` threshold that would disable the view entirely.
 *
 * @param value - CSS length, e.g. `"10px"`
 * @param fallback - Value to use when `value` is not a plain pixel length
 * @returns The parsed pixel count
 */
function parsePx(value: string, fallback: number): number {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number.parseFloat(match[1]) : fallback;
}

/**
 * Computes the card width, in pixels, at or above which column view can render.
 *
 * ```
 * min_day_column_width_px x days_to_show + card padding + (days_to_show - 1) x gutter
 * ```
 *
 * This is A3-C's formula verbatim. Every term is required: dropping the padding term
 * is what made an earlier iteration compute 500px for a layout that needs 524px.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns Minimum card width in pixels for the configured number of columns
 */
export function computeColumnThresholdPx(config: Types.Config): number {
  const days = Math.max(1, Math.floor(config.days_to_show));
  const gutter = parsePx(resolveColumnOption(config, 'day_gap'), 4);

  return config.min_day_column_width_px * days + COLUMN_CARD_PADDING_PX + (days - 1) * gutter;
}

/**
 * Resolves which view the card actually renders.
 *
 * The distinction this function exists to make (G10):
 *
 * - **`requestedView`** is what the user configured.
 * - **`effectiveView`** is what is rendered after the width fallback.
 *
 * Everything downstream — option resolution, grouping, compaction, rendering — takes
 * `effectiveView`. Nothing reads `config.view` directly, because below the threshold
 * that value still says `column` while the card renders a list, and every per-view
 * resolution would then resolve for the wrong view.
 *
 * The fallback is **wholesale**: below the threshold the card renders list view with
 * every configured day. It never renders column view with fewer columns than asked
 * for (A3-C, and decisions 11+12).
 *
 * @param requestedView - The configured view
 * @param measuredWidthPx - Measured card width, or `null` before first measurement
 * @param thresholdPx - Result of `computeColumnThresholdPx`
 * @param previousEffectiveView - Last resolved view, for hysteresis; `null` initially
 * @returns The view to render
 */
export function resolveEffectiveView(
  requestedView: Types.EffectiveView,
  measuredWidthPx: number | null,
  thresholdPx: number,
  previousEffectiveView: Types.EffectiveView | null = null,
): Types.EffectiveView {
  // List view has no width requirement, so there is nothing to fall back to.
  if (requestedView !== 'column') {
    return requestedView;
  }

  // Before the first measurement, honour the request. Rendering list first and
  // switching would flash the wrong layout on every load. A column view that is
  // momentarily too narrow self-corrects on the first *settled* measurement — the
  // host debounces measurements, so this is not corrected within one frame.
  if (measuredWidthPx === null || measuredWidthPx <= 0) {
    return 'column';
  }

  // Schmitt trigger: leaving column view requires dropping a further
  // VIEW_SWITCH_HYSTERESIS_PX below the threshold that entering it required.
  const effectiveThreshold =
    previousEffectiveView === 'column' ? thresholdPx - VIEW_SWITCH_HYSTERESIS_PX : thresholdPx;

  return measuredWidthPx >= effectiveThreshold ? 'column' : 'list';
}

/**
 * Resolves the view for a freshly measured width, given the previous measurement.
 *
 * This exists to keep one specific mistake out of the host, where it shipped once and
 * survived 152 tests because nothing exercises the element itself.
 *
 * `resolveEffectiveView` renders the *requested* view before any measurement exists,
 * so the card does not flash the wrong layout on load. That optimistic answer is a
 * bet, not an observation — and it must not seed the Schmitt trigger. If it does, the
 * first real measurement is judged against the leave threshold
 * (`thresholdPx - VIEW_SWITCH_HYSTERESIS_PX`) instead of the enter threshold, with two
 * consequences:
 *
 * 1. A card loading at a width inside the band enters column view without ever
 *    qualifying for it — measured live at a 464px card against a 492px threshold.
 * 2. The same width resolves differently depending on how it was reached, so the
 *    hysteresis stops being a tie-breaker and becomes load-order dependence.
 *
 * A `null` `previousMeasuredWidthPx` means "no measurement has confirmed the current
 * view yet", which is exactly when the band must not apply.
 *
 * @param requestedView - The configured view
 * @param previousMeasuredWidthPx - Width at the previous measurement, `null` if none
 * @param measuredWidthPx - The width just measured
 * @param thresholdPx - Result of `computeColumnThresholdPx`
 * @param previousEffectiveView - The view currently rendered
 * @returns The view to render
 */
export function resolveViewOnMeasurement(
  requestedView: Types.EffectiveView,
  previousMeasuredWidthPx: number | null,
  measuredWidthPx: number,
  thresholdPx: number,
  previousEffectiveView: Types.EffectiveView,
): Types.EffectiveView {
  return resolveEffectiveView(
    requestedView,
    measuredWidthPx,
    thresholdPx,
    previousMeasuredWidthPx === null ? null : previousEffectiveView,
  );
}

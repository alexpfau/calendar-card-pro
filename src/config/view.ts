/**
 * View resolution for Calendar Card Pro
 *
 * Resolves per-view configuration, column-only defaults and width fallback.
 */

import { DEFAULT_CONFIG, coercePixelLength, coercePixelLengthAgainst } from './config';
import * as Types from './types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// KEY CLASSIFICATION
//-----------------------------------------------------------------------------

/**
 * Every option that may appear inside the `column:` block.
 *
 * Every key here has a top-level counterpart. Column-only keys stay in
 * `COLUMN_ONLY_KEYS`, because applying them to `Types.Config` would create fields the
 * runtime type does not describe.
 */
export const COLUMN_OVERRIDE_KEYS = [
  'show_empty_days',
  'empty_day_text',
  'split_multiday_events',
  // Render-side filters; neither changes the Home Assistant request or cache key.
  'show_past_events',
  'filter_duplicates',
  'duplicate_accent_color',
  'vertical_line_width',
  'event_spacing',
  'day_spacing',
  'additional_card_spacing',
  'height',
  'max_height',
  'today_indicator',
  'today_indicator_size',
  'today_indicator_color',
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
  'show_multiday_allday_time',
  'allday_badge',
  'allday_badge_style',
  'allday_badge_color',
  'time_two_digit_hours',
  'show_end_time',
  'time_font_size',
  'time_icon_size',
  'time_max_lines',
  'show_location',
  'show_location_allday',
  'remove_location_country',
  'location_font_size',
  'location_icon_size',
  'location_max_lines',
  'show_description',
  'show_description_allday',
  'title_max_lines',
  'description_max_lines',
  'description_font_size',
  'description_icon_size',
  'show_week_numbers',
  'show_current_week_number',
  'week_number_font_size',
  'week_number_color',
  'week_number_background_color',
  'day_separator_width',
  'day_separator_color',
  'week_separator_width',
  'week_separator_color',
  'month_separator_width',
  'month_separator_color',
] as const;

/**
 * Column-only options — the ones with no top-level counterpart.
 *
 * These live inside `column:` but do not override anything. Keeping them separate
 * preserves the invariant that every `COLUMN_OVERRIDE_KEYS` member is also a
 * `DEFAULT_CONFIG` key.
 */
export const COLUMN_ONLY_KEYS = [
  'day_header_gap',
  'day_header_separator_width',
  'day_header_separator_color',
  'min_day_width',
  'min_days_to_show',
  'min_days_fallback',
] as const;

/**
 * Options a `grid:` block may override, each with a top-level counterpart.
 *
 * The same list as column's, and the same array rather than a copy. The question both
 * views ask is identical — how much room does one day get — and they answer it in the
 * same direction, away from the list layout. Separators included: a grid still rules
 * vertical lines between its day columns and still has week and month boundaries.
 *
 * 🚨 Aliased, not filtered. A `.filter()` here would type as `ReadonlyArray<union>`
 * rather than a literal tuple, which quietly makes the partition assertion below
 * tautological: every key would read as classified while the filtered-out ones were
 * dropped at runtime, producing exactly the accepted-then-silently-ignored override the
 * assertion exists to prevent. If grid ever needs a genuinely different set, write it
 * out `as const` — do not derive it.
 */
export const GRID_OVERRIDE_KEYS = COLUMN_OVERRIDE_KEYS;

/** Grid-only options — the ones describing the time axis and responsive density. */
export const GRID_ONLY_KEYS = [
  'min_day_width',
  'min_days_to_show',
  'min_days_fallback',
  'start_time',
  'end_time',
  'slot_minutes',
  'hour_height',
  'show_now_line',
  'now_line_color',
  'max_simultaneous_events',
  'allday_band_max_rows',
  'axis_width',
  'show_axis_labels',
] as const;

/**
 * Compile-time partition check for a view's two key arrays.
 *
 * The arrays are the only thing that decides whether an override reaches the renderer:
 * {@link resolveEffectiveConfig} hoists a view's `overrideKeys` and nothing else, so a
 * key that exists on the view's override interface but appears in neither array is
 * accepted by the editor, validated, stored — and then silently replaced by the
 * top-level default at render time. There is no error and no warning; the user's
 * override simply does nothing.
 *
 * That gap cannot be closed by a test. The suite's parity tests iterate the arrays
 * themselves, so a key missing from an array is equally missing from the loop that would
 * have caught it — they are structurally incapable of seeing the omission. Mutation testing
 * confirmed it: deleting any of 24 of the 54 override keys left the entire suite green.
 *
 * These assertions close it from the other side, by starting from the interface. `as const`
 * is what makes them work — with a `ReadonlyArray<...>` annotation the element type is the
 * declared union rather than the literal contents, which would make the whole check
 * tautological.
 *
 * 🚨 Written as three reusable helpers rather than as three checks about `column`, so a
 * second view is registered by instantiating them rather than by copying them. Copying
 * is how this kind of guard stops covering the case nobody has written yet — see
 * AGENTS.md § *Proximity is not reach*. Instantiate all three for every view that owns
 * an override block; a view with no block needs none.
 */
type AssertNever<T extends never> = T;

/**
 * Keys of a view's override interface that neither array classifies.
 *
 * 🚨 The three helpers compute a leftover type; `AssertNever` is applied at each
 * instantiation below rather than inside the helper. It cannot go inside: within a
 * generic alias the leftover is still unresolved, so TypeScript cannot prove it is
 * `never` and rejects the constraint outright.
 */
type UnclassifiedKeys<
  Overrides,
  OverrideKeys extends readonly PropertyKey[],
  OnlyKeys extends readonly PropertyKey[],
> = Exclude<keyof Overrides, OverrideKeys[number] | OnlyKeys[number]>;

/** Hoisted keys lacking the top-level counterpart hoisting assumes. */
type OverrideKeysWithoutCounterpart<
  Overrides,
  OverrideKeys extends readonly PropertyKey[],
> = Exclude<OverrideKeys[number], keyof Overrides & keyof Types.Config>;

/** View-only keys that do have a top-level counterpart, so belong in the other array. */
type OnlyKeysWithCounterpart<OnlyKeys extends readonly PropertyKey[]> = Extract<
  OnlyKeys[number],
  keyof Types.Config
>;

export type _AssertEveryColumnKeyClassified = AssertNever<
  UnclassifiedKeys<Types.ColumnOverrides, typeof COLUMN_OVERRIDE_KEYS, typeof COLUMN_ONLY_KEYS>
>;
export type _AssertEveryColumnOverrideKeyHoistable = AssertNever<
  OverrideKeysWithoutCounterpart<Types.ColumnOverrides, typeof COLUMN_OVERRIDE_KEYS>
>;
export type _AssertColumnOnlyKeysHaveNoCounterpart = AssertNever<
  OnlyKeysWithCounterpart<typeof COLUMN_ONLY_KEYS>
>;

export type _AssertEveryGridKeyClassified = AssertNever<
  UnclassifiedKeys<Types.GridOverrides, typeof GRID_OVERRIDE_KEYS, typeof GRID_ONLY_KEYS>
>;
export type _AssertEveryGridOverrideKeyHoistable = AssertNever<
  OverrideKeysWithoutCounterpart<Types.GridOverrides, typeof GRID_OVERRIDE_KEYS>
>;
export type _AssertGridOnlyKeysHaveNoCounterpart = AssertNever<
  OnlyKeysWithCounterpart<typeof GRID_ONLY_KEYS>
>;

export const VIEWS: ReadonlyArray<Types.EffectiveView> = ['list', 'column', 'grid'];

export const VIEWS_WITH_WIDTH_FALLBACK: ReadonlySet<Types.EffectiveView> =
  new Set<Types.EffectiveView>(['column', 'grid']);

/**
 * Which views each option actually affects. An absent key affects every view.
 *
 * Keyed by view so callers can say where an option applies, not merely that it is
 * inert somewhere. Compact limits apply only to list view for the same reason as
 * `viewAppliesCompactLimits`.
 */
export const VIEW_SCOPE: Readonly<Record<string, ReadonlySet<Types.EffectiveView>>> = {
  date_vertical_alignment: new Set<Types.EffectiveView>(['list']),
  today_indicator_position: new Set<Types.EffectiveView>(['list']),
  compact_events_to_show: new Set<Types.EffectiveView>(['list']),
  compact_days_to_show: new Set<Types.EffectiveView>(['list']),
  compact_events_complete_days: new Set<Types.EffectiveView>(['list']),

  // Inert as a card-level grid override: the grid never uses the upstream list splitter.
  // All-day multi-day events become one spanning banner, and timed multi-day events are
  // segmented by the grid renderer so every segment stays timed.
  split_multiday_events: new Set<Types.EffectiveView>(['list', 'column']),
};

/**
 * Which views a **per-entity** option affects, where that differs from the card-level
 * key of the same name.
 *
 * `split_multiday_events` differs: the card-level column override may skip splitting,
 * but a per-entity opt-out is ignored in column view so later days of a multi-day event
 * cannot disappear from their columns. `entityScopeFor` falls back to `VIEW_SCOPE`.
 */
export const ENTITY_VIEW_SCOPE: Readonly<Record<string, ReadonlySet<Types.EffectiveView>>> = {
  split_multiday_events: new Set<Types.EffectiveView>(['list']),
};

/**
 * Whether an option has any effect in the given view.
 *
 * @param key - Config key to test
 * @param view - View to test it against
 * @returns `true` when the option affects that view, including for every unlisted key
 */
export function appliesToView(key: string, view: Types.EffectiveView): boolean {
  const scope = VIEW_SCOPE[key];
  return scope === undefined || scope.has(view);
}

/**
 * The scope of an option as configured on a single calendar.
 *
 * @param key - Config key to test
 * @returns The views it affects, or `undefined` when it affects all of them
 */
export function entityScopeFor(key: string): ReadonlySet<Types.EffectiveView> | undefined {
  return ENTITY_VIEW_SCOPE[key] ?? VIEW_SCOPE[key];
}

// Fetch-time options cannot become view overrides because switching views must not refetch.
//
// Exported so `tests/view-config.test.ts` can iterate this set rather than keep a second
// hand-written copy of it. The two lists were maintained in parallel, which gated the
// removal direction only: adding an eighth key here and to `COLUMN_OVERRIDE_KEYS` left a
// literal list of seven unchanged and nothing failed, so the override was accepted, stored,
// and then ignored at fetch time — a no-op wearing the costume of a feature.
export const FETCH_TIME_KEYS: ReadonlySet<string> = new Set([
  'entities',
  'start_date',
  'days_to_show',
  'first_day_of_week',
  'weather',
  'refresh_interval',
  'refresh_on_navigate',
]);

//-----------------------------------------------------------------------------
// COLUMN-ONLY DEFAULTS
//-----------------------------------------------------------------------------

/**
 * Defaults for column-only options with no top-level counterpart.
 *
 * `DEFAULT_CONFIG.column` stays `undefined` so an empty `column: {}` block remains
 * equivalent to no block. Defaults for keys inside the block live here instead.
 *
 * The chosen values make an absent `column:` block a visual no-op relative to the
 * list view's own defaults:
 *
 * - `day_header_gap` is `8px` — the vertical space between a day's header and its
 *   first event. The separator, when present, sits centred in that gap.
 * - `day_header_separator_width` is `0px` — no rule by default. `day_header_gap`
 *   keeps the header spacing stable when the rule is off.
 * - `day_header_separator_color` is `var(--divider-color)`, Home Assistant's semantic
 *   divider token. It is a structural divider, not text.
 */
export const COLUMN_DEFAULTS = {
  day_header_gap: '8px',
  day_header_separator_width: '0px',
  day_header_separator_color: 'var(--divider-color)',

  // Chosen so three default columns fit inside a 500px Home Assistant section after
  // card padding, gutters and half the hysteresis band are included.
  min_day_width: 140,

  // Preserves the wholesale fallback unless a user explicitly opts into cramping.
  // Deliberately written bare rather than cast to `Types.ColumnMinDaysFallback`:
  // the surrounding `as const` already narrows it to the literal, so the cast bought
  // nothing, and `check:docs` reconciles this table by reading the source text --
  // an inline assertion there reads as a default of "'list' as Types..." and fails.
  min_days_fallback: 'list',
} as const;

/**
 * Defaults for grid-only options.
 *
 * `07:00`–`22:00` covers a domestic day without wasting a third of the axis on hours
 * nothing is scheduled in; the band is scrollable, so the bound is about where the card
 * *opens*, not what it can reach.
 *
 * `hour_height` is a CSS length rather than a number so it can be given in `em` and
 * track the font, and so `calc()` works. It sets the intrinsic height only — under
 * `height_mode: fixed` the axis compresses to the card instead.
 *
 * `max_simultaneous_events: 3` is where blocks stop carrying readable text at a typical
 * card width. `axis_width` is in `em` for the same reason as `hour_height`: an hour
 * label is text, so its gutter should scale with text.
 */
export const GRID_DEFAULTS = {
  // 100px keeps a three-day grid at 352px before hysteresis, or 368px to enter from
  // list once the hysteresis half-band is included. A grid column carries positioned blocks rather
  // than a full text list, so it can be narrower than column view's 140px default.
  min_day_width: 100,

  // A one-column grid is a useful day view with a now line, so grid sheds columns down to
  // one by default. Column view keeps its dynamic `days_to_show` default because one
  // cramped text column is not the layout a multi-day column card asked for.
  min_days_to_show: 1,

  // Preserves the wholesale fallback unless a user explicitly opts into cramping.
  min_days_fallback: 'list',

  start_time: '07:00',
  end_time: '22:00',
  slot_minutes: 30,
  hour_height: '48px',
  show_now_line: true,
  now_line_color: 'var(--error-color)',
  max_simultaneous_events: 3,
  allday_band_max_rows: 3,
  axis_width: '3.5em',
  show_axis_labels: true,
} as const;

/**
 * Value type a column-only option resolves to.
 *
 * Derived from `COLUMN_DEFAULTS`; the conditional widens numeric literals so user
 * values such as `220` remain assignable.
 */
type ColumnOptionValue<K extends keyof typeof COLUMN_DEFAULTS> =
  (typeof COLUMN_DEFAULTS)[K] extends number ? number : string;

/**
 * Normalizes a column-only option value to a usable value of its declared type.
 *
 * Numeric column-only values do not pass through `normalizeConfig`, so invalid
 * `min_day_width` values are caught here before they can break threshold arithmetic.
 *
 * Length-valued keys accept a bare number from either source — YAML's `day_header_gap: 12`
 * and the visual editor's text field, which hands back the *string* `'12'`. Both are
 * turned into `'12px'` by the same {@link coercePixelLengthAgainst} the rest of the
 * config uses, which infers length-ness from the shipped default rather than from a
 * hand-maintained list. There is no valid unitless CSS length, so a bare number is already
 * broken wherever one is expected: `border-top-width:12` is written to the style attribute
 * and then discarded by the browser, leaving the separator invisible with no error.
 *
 * @param key - Option being resolved
 * @param value - Raw configured value, which YAML or the editor may have typed as a number
 * @returns A value of the key's declared type
 */
export function normalizeColumnValue(
  key: keyof typeof COLUMN_DEFAULTS,
  value: unknown,
): string | number {
  const fallback = COLUMN_DEFAULTS[key];

  if (typeof fallback === 'number') {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  if (key === 'min_days_fallback') {
    return value === 'cramp' || value === 'list' ? value : fallback;
  }

  return String(coercePixelLengthAgainst(fallback, value, key));
}

/**
 * Resolves a Category C column-only option.
 *
 * These keys have no inheritance step: the value is present in the block or falls
 * back to `COLUMN_DEFAULTS`.
 *
 * @param config - Merged configuration, defaults already applied
 * @param key - Column-only option to resolve
 * @returns The configured value, or its default
 */
export function resolveColumnOption<K extends keyof typeof COLUMN_DEFAULTS>(
  config: Types.Config,
  key: K,
): ColumnOptionValue<K> {
  // Reached through the registry rather than as `config.column`, so this is one fewer
  // place a second view's block has to be threaded into by hand. The export keeps its
  // column name because that is what it resolves; a sibling view gets its own.
  const overrides = blockValues(config, 'column');

  if (overrides && hasOverride(overrides, key)) {
    return normalizeColumnValue(
      key,
      (overrides as Types.ColumnOverrides)[key],
    ) as ColumnOptionValue<K>;
  }

  return COLUMN_DEFAULTS[key] as ColumnOptionValue<K>;
}

/**
 * Value type a grid-only option resolves to.
 *
 * Derived from {@link GRID_DEFAULTS}; the conditionals widen the literals so a user
 * value such as `'06:30'` or `60` stays assignable.
 */
type GridOptionValue<K extends keyof typeof GRID_DEFAULTS> =
  (typeof GRID_DEFAULTS)[K] extends boolean
    ? boolean
    : (typeof GRID_DEFAULTS)[K] extends number
      ? number
      : string;

/**
 * Normalizes a grid-only option to a usable value of its declared type.
 *
 * These values never pass through `normalizeConfig`, so a malformed `slot_minutes` or a
 * unitless `hour_height` is caught here rather than reaching a stylesheet. `slot_minutes`
 * is clamped to the declared union instead of treated as an arbitrary positive number:
 * older editor builds could write `"60"`, and that should normalize to the numeric value
 * the type promises rather than widening the runtime vocabulary. Length-valued keys
 * accept a bare number from YAML or the editor's text field and gain `px`, for the reason
 * {@link normalizeColumnValue} documents: there is no valid unitless CSS length, so
 * `height:48` is written to the style attribute and silently discarded.
 *
 * `start_time` and `end_time` are deliberately **not** validated here — they are a pair,
 * and a bad half must reset both. {@link Grid.resolveBand} owns that.
 *
 * @param key - Option being resolved
 * @param value - Raw configured value
 * @returns A value of the key's declared type
 */
export function normalizeGridValue(
  key: keyof typeof GRID_DEFAULTS,
  value: unknown,
): string | number | boolean {
  const fallback = GRID_DEFAULTS[key];

  if (key === 'min_days_fallback') {
    return value === 'cramp' || value === 'list' ? value : fallback;
  }

  if (typeof fallback === 'boolean') {
    return typeof value === 'boolean' ? value : fallback;
  }

  if (typeof fallback === 'number') {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    if (key === 'slot_minutes') {
      return [15, 20, 30, 60].includes(parsed) ? parsed : fallback;
    }
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // Times are validated as a pair, not individually — see the docblock.
  if (key === 'start_time' || key === 'end_time') {
    return typeof value === 'string' ? value : fallback;
  }

  return String(coercePixelLengthAgainst(fallback, value, key));
}

/**
 * Resolves a grid-only option.
 *
 * No inheritance step: the value is in the `grid:` block or falls back to
 * {@link GRID_DEFAULTS}.
 *
 * @param config - Merged configuration, defaults already applied
 * @param key - Grid-only option to resolve
 * @returns The configured value, or its default
 */
export function resolveGridOption<K extends keyof typeof GRID_DEFAULTS>(
  config: Types.Config,
  key: K,
): GridOptionValue<K> {
  const overrides = blockValues(config, 'grid');

  if (overrides && hasOverride(overrides, key as keyof Types.ColumnOverrides)) {
    return normalizeGridValue(
      key,
      (overrides as Record<string, unknown>)[key],
    ) as GridOptionValue<K>;
  }

  return GRID_DEFAULTS[key] as GridOptionValue<K>;
}

/**
 * Reports whether a resolved CSS length means "none".
 *
 * Accepts every zero length spelling so renderers can avoid emitting an empty element
 * that still occupies separator spacing. That matters because a separator's margins do
 * not scale with its width: a `0.0px` rule still contributes a full `day_spacing`
 * margin above and below, so a user who asked for no separator gets an invisible one
 * and the gap it would have sat in.
 *
 * The numeric part is parsed rather than pattern-matched against a single `0`, because
 * the spellings that reach here are not hand-written CSS. Unitless input is coerced to
 * pixels by {@link Config.coercePixelLength}, so an editor free-text field accepting
 * `0.0` or `-0` arrives as `0.0px` or `-0px` — both zero, neither a literal `0`.
 *
 * @param value - A resolved CSS length
 * @returns `true` when the length is zero in any unit
 */
export function isZeroLength(value: string): boolean {
  const match = /^([-+]?(?:\d*\.)?\d+)[a-z%]*$/i.exec(value.trim());
  return match !== null && Number.parseFloat(match[1]) === 0;
}

/**
 * Multiplies a resolved CSS length by a factor, keeping the author's unit.
 *
 * Several lengths in the card are derived from another rather than configured directly:
 * list separators sit at a multiple of `day_spacing` (a week rule a full spacing away, a
 * month rule one and a half), and the date column is 1.75× the `day_font_size` it holds.
 * Computing those with `parseFloat` and re-appending `px` silently discards the unit, so
 * `day_spacing: 2em` spaced the day tables by `2em` while spacing the rules between them
 * by `2px` — the rules collapsed into the content they were meant to divide — and a `2em`
 * day number was given a `3.5px` column to sit in. A `calc()` fared worse still: it parsed
 * to `NaN` and emitted `NaNpx`, which is not a length at all.
 *
 * A simple `<number><unit>` length is scaled arithmetically so the common pixel case
 * still emits a plain `15px` rather than a `calc()` a reader has to evaluate. Anything
 * else — `calc()`, `var()`, or a unit this does not recognise — is wrapped and handed to
 * the browser, which can resolve at layout time what this cannot resolve at render time.
 * The wrap parenthesises the operand, because `calc(1.5 * var(--x, 1em + 2px))` would
 * otherwise bind the multiplication to only the first term of a defaulted variable.
 *
 * The arithmetic is deliberately not rounded, matching what the previous pixel-only path
 * emitted for the same inputs, so pixel output is unchanged to the byte.
 *
 * @param value - A resolved CSS length
 * @param factor - Multiplier to apply
 * @returns The scaled length in the original unit, or a `calc()` expression
 */
export function scaleLength(value: string, factor: number): string {
  const trimmed = value.trim();
  const match = /^([-+]?(?:\d*\.)?\d+)([a-z%]*)$/i.exec(trimmed);

  if (match) {
    const unit = match[2] || 'px';
    return `${Number.parseFloat(match[1]) * factor}${unit}`;
  }

  return `calc(${factor} * (${trimmed}))`;
}

//-----------------------------------------------------------------------------
// RESOLUTION
//-----------------------------------------------------------------------------

// Presence-based override test; `false` and `true` both count, `undefined` does not.
function hasOverride(overrides: Types.ColumnOverrides, key: keyof Types.ColumnOverrides): boolean {
  return (
    Object.prototype.hasOwnProperty.call(overrides, key) &&
    (overrides as Record<string, unknown>)[key] !== undefined
  );
}

/**
 * Options whose shipped default differs in column view.
 *
 * These keys do not inherit their top-level value in column view; the column default
 * stands until the `column:` block overrides it. Every key here must also be in
 * `COLUMN_OVERRIDE_KEYS`, or the escape hatch fails validation.
 */
export const COLUMN_DEFAULT_OVERRIDES: {
  readonly [K in keyof Types.ColumnOverrides & keyof Types.Config]?: Types.Config[K];
} = {
  show_empty_days: true,
  split_multiday_events: true,
};

/**
 * Options whose shipped default differs in grid view.
 *
 * `event_background_opacity` is the whole change. The list layout ships `0` — no tint,
 * just an accent line — which reads well against a full-width row. A grid block is a
 * shape whose *area* carries the meaning, and an untinted one is an outline the eye has
 * to reconstruct. Every calendar app that draws a time axis fills its blocks.
 *
 * 🚨 `split_multiday_events` is deliberately **not** here. Grid ignores it entirely, via
 * `VIEW_SCOPE`, rather than defaulting it off — a default in this table is overridable
 * from the view's own block, so `grid: { split_multiday_events: true }` would imply the
 * upstream list splitter could be switched back on. The grid instead answers `never` via
 * `multidaySplitPolicy` and segments timed events in its renderer.
 */
export const GRID_DEFAULT_OVERRIDES: {
  readonly [K in keyof Types.GridOverrides & keyof Types.Config]?: Types.Config[K];
} = {
  day_separator_width: '1px',
  event_background_opacity: 20,
  show_empty_days: true,
};

/** Views whose defaults depart from the top level, mapped to what they substitute. */
export const DEFAULT_OVERRIDES_BY_VIEW: Readonly<
  Partial<Record<Types.EffectiveView, Readonly<Record<string, unknown>>>>
> = {
  column: COLUMN_DEFAULT_OVERRIDES,
  grid: GRID_DEFAULT_OVERRIDES,
};

//-----------------------------------------------------------------------------
// VIEW BLOCK REGISTRY
//-----------------------------------------------------------------------------

/**
 * Everything the generic resolvers need to know about one view's override block.
 *
 * Before this existed, five functions each hardcoded `'column'` and `config.column`:
 * {@link resolveViewOption}, {@link resolveEffectiveConfig}, {@link validateView},
 * {@link validateViewOverrides} and its top-level-key warning. Registering a second
 * view meant editing all five and remembering all five. Now it is one entry here, and
 * a view with no block simply has none.
 *
 * 🚨 Declared **after** the tables it references, not beside `VIEWS`. These are
 * `const` bindings, so a registry declared earlier in the file would read
 * `COLUMN_DEFAULTS` in its own temporal dead zone and throw at module load — a failure
 * that appears as the whole card failing to register, nowhere near its cause.
 */
interface ViewBlock {
  /** The config key holding this view's block, e.g. `column` for `column: { … }`. */
  readonly blockKey: keyof Types.Config;

  /** Keys hoisted onto the effective config; each must have a top-level counterpart. */
  readonly overrideKeys: ReadonlyArray<string>;

  /** Keys that live only in the block and override nothing. */
  readonly onlyKeys: ReadonlyArray<string>;

  /** Defaults for `onlyKeys`, which have no top-level default to fall back to. */
  readonly onlyDefaults: Readonly<Record<string, string | number | boolean>>;

  /** Options whose shipped default differs in this view. */
  readonly defaultOverrides: Readonly<Record<string, unknown>>;
}

export const VIEW_BLOCKS: Readonly<Partial<Record<Types.EffectiveView, ViewBlock>>> = {
  column: {
    blockKey: 'column',
    overrideKeys: COLUMN_OVERRIDE_KEYS,
    onlyKeys: COLUMN_ONLY_KEYS,
    onlyDefaults: COLUMN_DEFAULTS,
    defaultOverrides: COLUMN_DEFAULT_OVERRIDES,
  },
  grid: {
    blockKey: 'grid',
    overrideKeys: GRID_OVERRIDE_KEYS,
    onlyKeys: GRID_ONLY_KEYS,
    onlyDefaults: GRID_DEFAULTS,
    defaultOverrides: GRID_DEFAULT_OVERRIDES,
  },
};

/**
 * The block a view reads its overrides from, or `undefined` when it has none.
 *
 * @param view - View to look up
 * @returns That view's registry entry
 */
export function viewBlockFor(view: Types.EffectiveView): ViewBlock | undefined {
  return VIEW_BLOCKS[view];
}

/**
 * Which config key holds each view's override block.
 *
 * Derived from {@link VIEW_BLOCKS} rather than written out again, so a view cannot be
 * registered in one and missed in the other. The editor reads this to decide which
 * panels grow an exceptions row.
 */
export const OVERRIDE_BLOCK_BY_VIEW: Readonly<
  Partial<Record<Types.EffectiveView, keyof Types.Config>>
> = Object.fromEntries(
  Object.entries(VIEW_BLOCKS).map(([view, block]) => [view, block.blockKey]),
) as Readonly<Partial<Record<Types.EffectiveView, keyof Types.Config>>>;

/**
 * The raw, unvalidated contents of a view's block on a given config.
 *
 * @param config - Merged configuration
 * @param view - View currently being rendered
 * @returns The block object, or `undefined` when absent or not an object
 */
function blockValues(
  config: Types.Config,
  view: Types.EffectiveView,
): Types.ColumnOverrides | Types.GridOverrides | undefined {
  const block = VIEW_BLOCKS[view];

  if (!block) {
    return undefined;
  }

  const values = config[block.blockKey];

  return values && typeof values === 'object'
    ? (values as Types.ColumnOverrides | Types.GridOverrides)
    : undefined;
}

/**
 * Whether a view substitutes its own default for an option.
 *
 * @param key - Config key to test
 * @param view - View the card is configured to render
 * @returns `true` when the view ignores the top-level value until the block overrides it
 */
export function hasDivergentDefault(key: string, view: Types.EffectiveView): boolean {
  const defaults = DEFAULT_OVERRIDES_BY_VIEW[view];
  return defaults !== undefined && Object.prototype.hasOwnProperty.call(defaults, key);
}

/**
 * Whether compact-mode limits apply in the given view.
 *
 * Compact limits trim the tail of a vertical list. Column view instead uses its column
 * density options, because deleting rightmost columns would hide days without changing
 * the card's height.
 *
 * @param view - View currently being rendered
 * @returns `true` when `compact_*` keys should be honoured
 */
export function viewAppliesCompactLimits(view: Types.EffectiveView): boolean {
  return view === 'list';
}

/**
 * How the shared event processor should handle multi-day splitting for the view.
 *
 * A column is a claim about one day. An unsplit multi-day event would appear only in
 * the column it starts in and leave every later column it spans silently blank, so the
 * split is required in column view. Per-entity precedence is ignored so one calendar
 * cannot make the layout truthful while another does not.
 *
 * List view inherits the card and per-entity options. Grid view returns `never`: it does
 * its own timed segmentation at render time, and the upstream list splitter would rewrite
 * the middle day of a timed event as all-day data.
 *
 * @param view - View currently being rendered
 * @returns Split policy for the shared event processor
 */
export type MultidaySplitPolicy = 'force' | 'inherit' | 'never';

export function multidaySplitPolicy(view: Types.EffectiveView): MultidaySplitPolicy {
  switch (view) {
    case 'column':
      return 'force';
    case 'grid':
      return 'never';
    case 'list':
      return 'inherit';
  }
}

/**
 * The root CSS class that selects a view's layout rules, or `''` for the default.
 *
 * List view is the unclassed default: its rules are written unqualified and every other
 * view opts out of them by adding a class. That is why this returns an empty string
 * rather than a `list-view` class. The switch keeps future views explicit.
 *
 * @param view - View currently being rendered
 * @returns The layout class name, or `''` when the view uses the unclassed default
 */
export function viewCssClass(view: Types.EffectiveView): string {
  switch (view) {
    case 'column':
      return 'column-view';
    case 'grid':
      return 'grid-view';
    case 'list':
      return '';
  }
}

/**
 * Resolves the effective value of an option for the view being rendered.
 *
 * In list view the top-level value always wins. In column view the `column:` block
 * wins where it supplies the option, and the top-level value is inherited where it
 * does not — except for the keys in `COLUMN_DEFAULT_OVERRIDES`, which substitute a
 * column-specific default instead of inheriting.
 *
 * The active view is supplied rather than read from `config.view`, because a requested
 * column view may be rendering the list fallback.
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
  const block = VIEW_BLOCKS[effectiveView];

  if (!block) {
    return config[key];
  }

  const overrides = blockValues(config, effectiveView);

  if (overrides && hasOverride(overrides, key)) {
    // `hasOverride` has established that the option is present and not `undefined`,
    // which is the only way the optional override type can widen the config type.
    //
    // Coerced for the same reason as in `resolveEffectiveConfig`: both resolvers read
    // the same block, so a bare `day_spacing: 4` has to become `'4px'` whichever one the
    // caller reached for. A total no-op on non-length keys — `coercePixelLength` acts
    // only when the value is a bare number and the shipped default is a `px` string, and
    // every current call site passes a boolean — so this is here to keep the two answers
    // identical as keys are added, not to fix a live defect.
    return coercePixelLength(key, overrides[key]) as Types.Config[K];
  }

  // `??` rather than a presence test on purpose: a view default of `false` is a
  // legitimate value and must not fall through to the top-level one.
  return (block.defaultOverrides[key] as Types.Config[K] | undefined) ?? config[key];
}

/**
 * Applies a view's override block to a configuration, once, for the view being rendered.
 *
 * This bulk form avoids threading the effective view through every renderer that reads
 * `Types.Config`. Only the view's `overrideKeys` are hoisted; its `onlyKeys` stay in
 * the block for {@link resolveColumnOption}. The block itself remains on the returned
 * object because downstream view-only resolution still needs it.
 *
 * @param config - Merged configuration, defaults already applied
 * @param effectiveView - View currently being rendered
 * @returns The configuration as it applies in that view
 */
export function resolveEffectiveConfig(
  config: Types.Config,
  effectiveView: Types.EffectiveView,
): Types.Config {
  const block = VIEW_BLOCKS[effectiveView];

  if (!block) {
    return config;
  }

  const overrides = blockValues(config, effectiveView);

  // Seeded first, so an explicit block value overwrites the view default and a card
  // carrying no block at all still receives the divergent defaults.
  const applied: Record<string, unknown> = { ...block.defaultOverrides };

  if (overrides) {
    for (const key of block.overrideKeys) {
      const typedKey = key as keyof Types.ColumnOverrides;

      if (hasOverride(overrides, typedKey)) {
        applied[key] = coercePixelLength(key as keyof Types.Config, overrides[typedKey]);
      }
    }
  }

  return { ...config, ...applied } as Types.Config;
}

//-----------------------------------------------------------------------------
// VALIDATION
//-----------------------------------------------------------------------------

/**
 * Coerces `view` to a member of its declared union, warning when it was not one.
 *
 * Coerces rather than only warning so downstream code can rely on `config.view`
 * matching `Types.EffectiveView`. Never throws; a bad value falls back to list view.
 *
 * @param config - Merged configuration, mutated in place when `view` is not valid
 */
export function validateView(config: Types.Config): void {
  const view = config.view as unknown;

  if (VIEWS.includes(view as Types.EffectiveView)) {
    return;
  }

  // Built from VIEWS rather than written out, so registering a view cannot leave the
  // diagnostic naming the old set — which would tell a user their correct value is
  // unrecognized while the card silently rendered it.
  const expected = VIEWS.map((name) => `"${name}"`).join(' or ');

  Logger.warn(
    `Ignoring "view: ${JSON.stringify(view)}": not a recognized view. ` +
      `Expected ${expected}. Falling back to "list".`,
  );

  config.view = 'list';
}

/**
 * Reports options inside any view's override block that will not take effect.
 *
 * Called once per `setConfig`. It never throws or mutates; unusable options are
 * ignored and logged in development builds.
 *
 * Iterates {@link VIEW_BLOCKS} rather than reading `config.column` directly, so a newly
 * registered view is validated by existing.
 *
 * The export keeps its column-era name because six modules and four test files import
 * it; renaming would be a large diff for no behavioral gain.
 *
 * @param config - Merged configuration to inspect
 */
export function validateColumnOverrides(config: Types.Config): void {
  for (const view of Object.keys(VIEW_BLOCKS) as Types.EffectiveView[]) {
    validateViewOverrides(config, view);
  }
}

/**
 * Reports unusable options inside one view's override block.
 *
 * @param config - Merged configuration to inspect
 * @param view - View whose block to check
 */
function validateViewOverrides(config: Types.Config, view: Types.EffectiveView): void {
  const block = VIEW_BLOCKS[view];

  if (!block) {
    return;
  }

  // Must run before the early return, or view-only keys written at the top level with
  // no block present at all would be skipped.
  warnAboutTopLevelOnlyKeys(config, block);

  const overrides = blockValues(config, view);

  if (!overrides) {
    return;
  }

  const ownKeys = new Set<string>([...block.overrideKeys, ...block.onlyKeys]);

  for (const key of Object.keys(overrides)) {
    if (ownKeys.has(key)) {
      continue;
    }

    if (FETCH_TIME_KEYS.has(key)) {
      Logger.warn(
        `Ignoring "${block.blockKey}.${key}": it determines which events are loaded from Home Assistant, ` +
          `so it cannot differ between views — switching views would have to refetch. ` +
          `Set "${key}" at the top level instead.`,
      );
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) {
      Logger.warn(
        `Ignoring "${block.blockKey}.${key}": "${key}" is a valid top-level option but cannot be overridden ` +
          `per view. Set it at the top level instead.`,
      );
      continue;
    }

    Logger.warn(`Ignoring "${block.blockKey}.${key}": not a recognized option.`);
  }
}

/**
 * Reports view-only options mistakenly written at the top level.
 *
 * Without this, an invalid `column.foo` gets a tailored diagnostic while a misplaced
 * `day_header_gap: 32px` is silently inert.
 *
 * @param config - Merged configuration to inspect
 * @param block - Registry entry for the view whose keys to check
 */
function warnAboutTopLevelOnlyKeys(config: Types.Config, block: ViewBlock): void {
  for (const key of block.onlyKeys) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      Logger.warn(
        `Ignoring top-level "${key}": it is a ${block.blockKey}-view-only option and has no effect ` +
          `outside the "${block.blockKey}:" block. Move it to "${block.blockKey}: { ${key}: ... }".`,
      );
    }
  }
}

//-----------------------------------------------------------------------------
// WIDTH FALLBACK
//-----------------------------------------------------------------------------

/** Horizontal padding the card reserves for itself in column view, in pixels. */
const COLUMN_CARD_PADDING_PX = 32;

/**
 * Width band, in pixels, by which the column-to-list threshold is lowered once
 * column view is already showing.
 *
 * A single threshold oscillates: switching to column view changes the card's height,
 * which in a masonry dashboard can change the available width, which can switch the
 * view straight back. Two thresholds make the switch a Schmitt trigger, so a card
 * sitting on the boundary settles instead of flapping.
 *
 * The band is centred on the computed threshold: half above to enter, half below to
 * leave. That keeps the calculated threshold as the midpoint while absorbing scrollbar
 * width and sub-pixel rounding.
 */
export const VIEW_SWITCH_HYSTERESIS_PX = 32;

/**
 * Replaces a negative gutter with the shipped default.
 *
 * `column-gap` is defined as `normal | <length-percentage [0,∞]>`, so a browser
 * discards a negative value outright and renders no gutter at all. Passing one
 * through would make the threshold arithmetic below *subtract* space that the
 * layout is in fact not saving, selecting more columns than can fit: at 280px with
 * three days, a 140px floor and a `-100px` gutter the threshold falls to 252px, so
 * columns render 83px wide against the 140px minimum the user asked for. Tracks are
 * `minmax(0, 1fr)`, so nothing downstream re-imposes that floor — the arithmetic is
 * the only thing holding it.
 *
 * Substituting the default rather than clamping to zero keeps the value that reaches
 * the renderer a valid length, so the separator offset — `calc(-0.5 * (gap + width))`,
 * which turns a negative gap into a *positive* margin and survives the browser's
 * validity check — stays centred in the gutter it is drawn in.
 *
 * This mirrors the `parsed > 0` guard {@link normalizeColumnValue} already applies to
 * `min_day_width`, the other operand of the same expression. Zero is legitimate here
 * and is kept, where a zero column width would not be.
 *
 * Only a leading minus is detected. A negative buried inside `calc()` is not, which is
 * the same bound the threshold arithmetic already accepts for non-pixel lengths.
 *
 * @param value - Configured gutter, as a CSS length
 * @returns The value, or the shipped default when it is negative
 */
export function sanitizeGutter(value: string): string {
  return value.trim().startsWith('-') ? DEFAULT_CONFIG.day_spacing : value;
}

// Threshold arithmetic can only use plain pixel lengths.
function parsePx(value: string, fallback: number): number {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(sanitizeGutter(value).trim());
  return match ? Number.parseFloat(match[1]) : fallback;
}

// Derived so the threshold fallback matches the rendered default gutter.
const DEFAULT_DAY_GAP_PX = parsePx(DEFAULT_CONFIG.day_spacing, 10);

/**
 * Computes the card width, in pixels, at or above which column view can render.
 *
 * ```
 * column.min_day_width x days_to_show + card padding + (days_to_show - 1) x gutter
 * ```
 *
 * Both the width floor and the gutter are read out of `column:` by hand, and cannot
 * use `resolveEffectiveConfig` to get there. This function decides *whether* column
 * view renders, so it necessarily runs before the view is known, whereas
 * `resolveEffectiveConfig` needs the view as an input. Resolving the two keys it
 * depends on directly is the way out of that ordering constraint — there is no
 * circularity, because neither `resolveColumnOption` nor `coercePixelLength`
 * consults the view.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns Minimum card width in pixels for the configured number of columns
 */
export function computeColumnThresholdPx(
  config: Types.Config,
  view: Types.EffectiveView = 'column',
): number {
  return computeColumnThresholdPxFor(config, configuredDays(config), view);
}

/**
 * Computes the card width, in pixels, at or above which `days` columns can render.
 *
 * Column reduction needs a threshold per candidate column count; `computeColumnThresholdPx`
 * calls this with `days_to_show`.
 *
 * @param config - Merged configuration, defaults already applied
 * @param days - Number of columns to size for
 * @returns Minimum card width in pixels for that many columns
 */
export function computeColumnThresholdPxFor(
  config: Types.Config,
  days: number,
  view: Types.EffectiveView = 'column',
): number {
  const count = Math.max(1, Math.floor(days));
  const gutter = dayColumnGutterPx(config, view);
  const minDayWidth = resolveMinDayWidth(config, view);

  return minDayWidth * count + COLUMN_CARD_PADDING_PX + (count - 1) * gutter;
}

// Read by hand because width arithmetic runs before the effective view is known.
function dayColumnGutterPx(config: Types.Config, view: Types.EffectiveView): number {
  const overrides = blockValues(config, view);
  const configuredGap =
    overrides && hasOverride(overrides, 'day_spacing')
      ? coercePixelLength('day_spacing', overrides.day_spacing)
      : config.day_spacing;

  return parsePx(String(configuredGap), DEFAULT_DAY_GAP_PX);
}

// Normalizes `days_to_show` to a usable column count.
function configuredDays(config: Types.Config): number {
  return Math.max(1, Math.floor(config.days_to_show));
}

function widthFallbackDefaults(view: Types.EffectiveView): Readonly<Record<string, unknown>> {
  return VIEW_BLOCKS[view]?.onlyDefaults ?? COLUMN_DEFAULTS;
}

function resolveMinDayWidth(config: Types.Config, view: Types.EffectiveView): number {
  const overrides = blockValues(config, view) as Record<string, unknown> | undefined;
  const fallback = widthFallbackDefaults(view).min_day_width;
  const defaultValue = typeof fallback === 'number' ? fallback : COLUMN_DEFAULTS.min_day_width;
  const raw =
    overrides && Object.prototype.hasOwnProperty.call(overrides, 'min_day_width')
      ? overrides.min_day_width
      : defaultValue;
  const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Resolves the fewest columns the card may reduce to.
 *
 * The default is dynamic (`days_to_show`), so it cannot live in `COLUMN_DEFAULTS`.
 * The result is clamped into `[1, days_to_show]`.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns Column floor, within `[1, days_to_show]`
 */
export function resolveMinDaysToShow(
  config: Types.Config,
  view: Types.EffectiveView = 'column',
): number {
  const days = configuredDays(config);
  const overrides = blockValues(config, view) as Record<string, unknown> | undefined;
  const fallback = widthFallbackDefaults(view).min_days_to_show;
  const defaultValue =
    typeof fallback === 'number' && Number.isFinite(fallback) ? Math.floor(fallback) : days;

  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, 'min_days_to_show')) {
    return Math.min(days, Math.max(1, defaultValue));
  }

  const raw = overrides.min_days_to_show;
  const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));

  if (!Number.isFinite(parsed)) {
    return Math.min(days, Math.max(1, defaultValue));
  }

  return Math.min(days, Math.max(1, Math.floor(parsed)));
}

/**
 * Resolves what the card does below its narrowest permitted column layout.
 *
 * Validates against the two legal values so typos fall back to `'list'`.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns `'list'` or `'cramp'`
 */
export function resolveMinDaysFallback(
  config: Types.Config,
  view: Types.EffectiveView = 'column',
): Types.ColumnMinDaysFallback {
  const overrides = blockValues(config, view) as Record<string, unknown> | undefined;
  const fallback = widthFallbackDefaults(view).min_days_fallback;
  const value =
    overrides && Object.prototype.hasOwnProperty.call(overrides, 'min_days_fallback')
      ? overrides.min_days_fallback
      : fallback;

  return value === 'cramp' ? 'cramp' : 'list';
}

/**
 * Resolves the view for a width, without resolving a column count.
 *
 * **Not the production path.** The card renders through {@link resolveColumnFit}, which
 * answers view *and* column count in one pass. This function survives as the reference
 * implementation of the view half: `tests/view-config.test.ts` pins `resolveColumnFit`
 * against it, so a future change to the fit logic that silently altered the view
 * decision fails there. It is tree-shaken out of the bundle, so keeping it costs
 * nothing shipped — but do not add callers, and do not delete it without replacing
 * that equivalence check.
 *
 * - **`requestedView`** is what the user configured.
 * - **`effectiveView`** is what is rendered after the width fallback.
 *
 * Everything downstream — option resolution, grouping, compaction, rendering — takes
 * the resolved effective view, and none of it reads `config.view`, because below the
 * threshold that value still says `column` while the card renders a list, and every
 * per-view resolution would then resolve for the wrong view. The three sites that do
 * read it all want the *requested* view by definition: the `requestedView` getter, the
 * `resolveColumnFit` call that consumes it as input, and the editor, which must show
 * the user what they configured rather than what the current width happens to render.
 *
 * The fallback this function models is **wholesale**: below the threshold it answers
 * list view, never column view with fewer columns. That is a property of *this
 * function*, not of the card — do not cite it as product behaviour. {@link
 * resolveColumnFit} reduces the column count to what fits and only falls back to list
 * when even `min_days_to_show` will not fit, so the card does render column view with
 * fewer columns than were asked for. `docs/features/column-view.md` describes that
 * behaviour; this block describes only the view half it is pinned against.
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
  if (!VIEWS_WITH_WIDTH_FALLBACK.has(requestedView)) {
    return requestedView;
  }

  // Before the first measurement, honour the request to avoid flashing the fallback.
  if (measuredWidthPx === null || measuredWidthPx <= 0) {
    return requestedView;
  }

  // Schmitt trigger, centred on the threshold: enter half a band above, leave half a
  // band below.
  const halfBand = VIEW_SWITCH_HYSTERESIS_PX / 2;
  const effectiveThreshold =
    previousEffectiveView === requestedView ? thresholdPx - halfBand : thresholdPx + halfBand;

  return measuredWidthPx >= effectiveThreshold ? requestedView : 'list';
}

/**
 * Resolves the view for a freshly measured width, given the previous measurement.
 *
 * **Not the production path**, for the same reason as {@link resolveEffectiveView}: the
 * card measures through {@link resolveColumnFitOnMeasurement}. This is the reference
 * implementation that check is pinned against.
 *
 * `resolveEffectiveView` renders the *requested* view before any measurement exists,
 * so that optimistic answer must not seed hysteresis. A `null`
 * `previousMeasuredWidthPx` means no measurement has confirmed the current view yet.
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

//-----------------------------------------------------------------------------
// COLUMN DENSITY
//-----------------------------------------------------------------------------

/**
 * The layout the card settles on at a given width.
 *
 * `columns` is meaningful only when `view` is `'column'`; in list view it is `0`,
 * because a column count is not a thing the list layout has. Returning both lets the
 * host detect column-count changes even when the view stays `'column'`.
 */
export interface ColumnFit {
  view: Types.EffectiveView;
  columns: number;
}

// Closed-form inverse of `computeColumnThresholdPxFor`; the epsilon protects exact
// boundaries from floating-point underflow. Removing it is invisible through
// `resolveColumnFit`, the only caller: an underflowed count stops matching
// `previousColumns`, so the hysteresis re-fit recomputes from a shifted width and
// lands back on the same number — measured at 0 divergent over 481,915 widths derived
// from exact column boundaries, against a control mutating this same expression that
// diverged on 41,307. No test can kill the epsilon because there is nothing to
// observe, so keep it on the arithmetic's own merits: a caller added without that
// re-fit would drop a column at an exact boundary.
function fitColumns(config: Types.Config, widthPx: number, view: Types.EffectiveView): number {
  const gutter = dayColumnGutterPx(config, view);
  const unit = resolveMinDayWidth(config, view) + gutter;

  if (unit <= 0) {
    return 0;
  }

  const fitted = Math.floor((widthPx - COLUMN_CARD_PADDING_PX + gutter) / unit + 1e-9);

  return Math.max(0, Math.min(configuredDays(config), fitted));
}

// Clamped half-band so adjacent column-count thresholds cannot overlap.
function columnHysteresisHalfBandPx(
  config: Types.Config,
  view: Types.EffectiveView = 'column',
): number {
  const spacing = resolveMinDayWidth(config, view) + dayColumnGutterPx(config, view);

  return Math.max(0, Math.min(VIEW_SWITCH_HYSTERESIS_PX / 2, (spacing - 1) / 2));
}

/**
 * Resolves the layout — view and column count — for a measured width.
 *
 * Day-column views render as many columns as the width carries, never more than
 * `days_to_show` and never fewer than `min_days_to_show`; below that floor
 * `min_days_fallback` decides between falling back to the list layout and holding
 * the floor with columns narrower than the configured minimum.
 *
 * Hysteresis applies to width: growing costs half a band, shrinking is granted half a
 * band, and widths inside a band hold the current layout. Column-count changes are
 * render-side only and must not become fetch-time behavior.
 *
 * @param requestedView - The configured view
 * @param config - Merged configuration, defaults already applied
 * @param measuredWidthPx - Card width, `null` before the first measurement
 * @param previous - Layout currently rendered, `null` if none is confirmed
 * @returns The layout to render
 */
export function resolveColumnFit(
  requestedView: Types.EffectiveView,
  config: Types.Config,
  measuredWidthPx: number | null,
  previous: ColumnFit | null,
): ColumnFit {
  const days = configuredDays(config);

  if (!VIEWS_WITH_WIDTH_FALLBACK.has(requestedView)) {
    return { view: requestedView, columns: 0 };
  }

  // Optimistic before the first measurement to avoid flashing the fallback.
  if (measuredWidthPx === null || measuredWidthPx <= 0) {
    return { view: requestedView, columns: days };
  }

  const floor = Math.min(resolveMinDaysToShow(config, requestedView), days);
  const previousColumns = previous && previous.view === requestedView ? previous.columns : 0;
  const halfBand = columnHysteresisHalfBandPx(config, requestedView);
  const raw = fitColumns(config, measuredWidthPx, requestedView);

  // A `null` previous layout uses the enter threshold; otherwise a card could qualify
  // for a column it has never been wide enough for.
  let fitted = raw;

  if (raw > previousColumns) {
    fitted = fitColumns(config, measuredWidthPx - halfBand, requestedView);
  } else if (raw < previousColumns) {
    fitted = fitColumns(config, measuredWidthPx + halfBand, requestedView);
  }

  if (fitted >= floor) {
    return { view: requestedView, columns: Math.min(fitted, days) };
  }

  return resolveMinDaysFallback(config, requestedView) === 'cramp'
    ? { view: requestedView, columns: floor }
    : { view: 'list', columns: 0 };
}

/**
 * Resolves the layout for a freshly measured width, given the previous measurement.
 *
 * Mirrors `resolveViewOnMeasurement`: the optimistic pre-measurement answer must not
 * seed hysteresis. A `null` `previousMeasuredWidthPx` means no measurement has
 * confirmed the current layout.
 *
 * @param requestedView - The configured view
 * @param config - Merged configuration, defaults already applied
 * @param previousMeasuredWidthPx - Width at the previous measurement, `null` if none
 * @param measuredWidthPx - The width just measured
 * @param previous - Layout currently rendered
 * @returns The layout to render
 */
export function resolveColumnFitOnMeasurement(
  requestedView: Types.EffectiveView,
  config: Types.Config,
  previousMeasuredWidthPx: number | null,
  measuredWidthPx: number,
  previous: ColumnFit,
): ColumnFit {
  return resolveColumnFit(
    requestedView,
    config,
    measuredWidthPx,
    previousMeasuredWidthPx === null ? null : previous,
  );
}

//-----------------------------------------------------------------------------
// WIDTH BANDS
//-----------------------------------------------------------------------------

/** One rung of the column staircase. */
export interface ColumnLayoutBand {
  columns: number;
  minWidthPx: number;
}

/** The layouts a configuration produces across every card width, widest first. */
export interface ColumnLayoutBands {
  bands: ReadonlyArray<ColumnLayoutBand>;
  fallback: Types.ColumnMinDaysFallback;
  fallbackBelowPx: number;
  hysteresisPx: number;
}

/**
 * Describes every layout a configuration can settle on, by card width.
 *
 * The editor renders this as a table using the same arithmetic as `resolveColumnFit`.
 *
 * Thresholds are the **entering** ones — the width a card must reach to gain a
 * layout. The sticky band on the way back down is exposed separately as
 * `hysteresisPx`.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns Bands widest first, plus what happens below the narrowest
 */
export function describeColumnLayoutBands(
  config: Types.Config,
  view: Types.EffectiveView = 'column',
): ColumnLayoutBands {
  const days = configuredDays(config);
  const floor = Math.min(resolveMinDaysToShow(config, view), days);
  const halfBand = columnHysteresisHalfBandPx(config, view);

  const bands: ColumnLayoutBand[] = [];
  for (let columns = days; columns >= floor; columns--) {
    bands.push({
      columns,
      minWidthPx: Math.ceil(computeColumnThresholdPxFor(config, columns, view) + halfBand),
    });
  }

  return {
    bands,
    fallback: resolveMinDaysFallback(config, view),
    fallbackBelowPx: Math.ceil(computeColumnThresholdPxFor(config, floor, view) + halfBand),
    hysteresisPx: halfBand,
  };
}

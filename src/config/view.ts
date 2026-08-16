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
  'time_two_digit_hours',
  'show_end_time',
  'time_font_size',
  'time_icon_size',
  'time_max_lines',
  'show_location',
  'remove_location_country',
  'location_font_size',
  'location_icon_size',
  'location_max_lines',
  'show_description',
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
 * Compile-time partition check for the two key arrays above.
 *
 * The arrays are the only thing that decides whether a `column:` override reaches the
 * renderer: `resolveEffectiveConfig` hoists `COLUMN_OVERRIDE_KEYS` and nothing else, so a
 * key that exists on `Types.ColumnOverrides` but appears in neither array is accepted by
 * the editor, validated, stored — and then silently replaced by the top-level default at
 * render time. There is no error and no warning; the user's override simply does nothing.
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
 */
type AssertNever<T extends never> = T;

/** Every `ColumnOverrides` key must be classified into exactly one of the two arrays. */
type _UnclassifiedColumnKeys = Exclude<
  keyof Types.ColumnOverrides,
  (typeof COLUMN_OVERRIDE_KEYS)[number] | (typeof COLUMN_ONLY_KEYS)[number]
>;
export type _AssertEveryColumnKeyClassified = AssertNever<_UnclassifiedColumnKeys>;

/** Every hoisted key must have the top-level counterpart hoisting it assumes. */
type _OverrideKeysWithoutCounterpart = Exclude<
  (typeof COLUMN_OVERRIDE_KEYS)[number],
  keyof Types.ColumnOverrides & keyof Types.Config
>;
export type _AssertEveryOverrideKeyHoistable = AssertNever<_OverrideKeysWithoutCounterpart>;

/** Column-only keys must have no top-level counterpart, or they belong in the other array. */
type _OnlyKeysWithCounterpart = Extract<(typeof COLUMN_ONLY_KEYS)[number], keyof Types.Config>;
export type _AssertColumnOnlyKeysHaveNoCounterpart = AssertNever<_OnlyKeysWithCounterpart>;

const OVERRIDE_KEY_SET: ReadonlySet<string> = new Set<string>([
  ...COLUMN_OVERRIDE_KEYS,
  ...COLUMN_ONLY_KEYS,
]);

export const VIEWS: ReadonlyArray<Types.EffectiveView> = ['list', 'column'];

export const VIEWS_WITH_WIDTH_FALLBACK: ReadonlySet<Types.EffectiveView> =
  new Set<Types.EffectiveView>(['column']);

export const OVERRIDE_BLOCK_BY_VIEW: Readonly<
  Partial<Record<Types.EffectiveView, keyof Types.Config>>
> = {
  column: 'column',
};

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
const FETCH_TIME_KEYS: ReadonlySet<string> = new Set([
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
function normalizeColumnValue(key: keyof typeof COLUMN_DEFAULTS, value: unknown): string | number {
  const fallback = COLUMN_DEFAULTS[key];

  if (typeof fallback === 'number') {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  return String(coercePixelLengthAgainst(fallback, value));
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
  const overrides = config.column;

  if (overrides && hasOverride(overrides, key)) {
    return normalizeColumnValue(key, overrides[key]) as ColumnOptionValue<K>;
  }

  return COLUMN_DEFAULTS[key] as ColumnOptionValue<K>;
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

/** Views whose defaults depart from the top level, mapped to what they substitute. */
export const DEFAULT_OVERRIDES_BY_VIEW: Readonly<
  Partial<Record<Types.EffectiveView, Readonly<Record<string, unknown>>>>
> = {
  column: COLUMN_DEFAULT_OVERRIDES,
};

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
  return view !== 'column';
}

/**
 * Whether the given view forces multi-day events to be split into per-day segments,
 * overriding any per-entity `split_multiday_events: false`.
 *
 * A column is a claim about one day. An unsplit multi-day event would appear only in
 * the column it starts in and leave every later column it spans silently blank, so the
 * split is required in column view. Per-entity precedence is ignored so one calendar
 * cannot make the layout truthful while another does not.
 *
 * List view returns `false`: the per-entity setting keeps its documented precedence
 * there, because a list shows a multi-day event once and reads correctly either way.
 *
 * @param view - View currently being rendered
 * @returns `true` when the per-entity override must be ignored and the split forced
 */
export function viewForcesMultidaySplit(view: Types.EffectiveView): boolean {
  return view === 'column';
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
  if (effectiveView !== 'column') {
    return config[key];
  }

  const overrides = config.column;

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

  // `??` rather than a presence test on purpose: a column default of `false` is a
  // legitimate value and must not fall through to the top-level one.
  return COLUMN_DEFAULT_OVERRIDES[key] ?? config[key];
}

/**
 * Applies the `column:` block to a configuration, once, for the view being rendered.
 *
 * This bulk form avoids threading the effective view through every renderer that reads
 * `Types.Config`. Only `COLUMN_OVERRIDE_KEYS` are hoisted; `COLUMN_ONLY_KEYS` stay in
 * the block for `resolveColumnOption`. The `column` block remains on the returned
 * object because downstream column-only resolution still needs it.
 *
 * @param config - Merged configuration, defaults already applied
 * @param effectiveView - View currently being rendered
 * @returns The configuration as it applies in that view
 */
export function resolveEffectiveConfig(
  config: Types.Config,
  effectiveView: Types.EffectiveView,
): Types.Config {
  if (effectiveView !== 'column') {
    return config;
  }

  const overrides = config.column;

  // Seeded first, so an explicit block value overwrites the column default and a card
  // carrying no block at all still receives the divergent defaults.
  const applied: Record<string, unknown> = { ...COLUMN_DEFAULT_OVERRIDES };

  if (overrides) {
    for (const key of COLUMN_OVERRIDE_KEYS) {
      if (hasOverride(overrides, key)) {
        applied[key] = coercePixelLength(key, overrides[key]);
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

  if (view === 'list' || view === 'column') {
    return;
  }

  Logger.warn(
    `Ignoring "view: ${JSON.stringify(view)}": not a recognized view. ` +
      `Expected "list" or "column". Falling back to "list".`,
  );

  config.view = 'list';
}

/**
 * Reports options inside the `column:` block that will not take effect.
 *
 * Called once per `setConfig`. It never throws or mutates; unusable options are
 * ignored and logged in development builds.
 *
 * @param config - Merged configuration to inspect
 */
export function validateColumnOverrides(config: Types.Config): void {
  // Must run before the early return, or top-level column-only keys without a
  // `column:` block would be skipped.
  warnAboutTopLevelColumnOnlyKeys(config);

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

/**
 * Reports column-only options mistakenly written at the top level.
 *
 * Without this, invalid `column.foo` gets a tailored diagnostic while a misplaced
 * `day_header_gap: 32px` is silently inert.
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
export function computeColumnThresholdPx(config: Types.Config): number {
  return computeColumnThresholdPxFor(config, configuredDays(config));
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
export function computeColumnThresholdPxFor(config: Types.Config, days: number): number {
  const count = Math.max(1, Math.floor(days));
  const gutter = columnGutterPx(config);
  const minDayWidth = resolveColumnOption(config, 'min_day_width');

  return minDayWidth * count + COLUMN_CARD_PADDING_PX + (count - 1) * gutter;
}

// Read by hand because width arithmetic runs before the effective view is known.
function columnGutterPx(config: Types.Config): number {
  const overrides = config.column;
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

/**
 * Resolves the fewest columns the card may reduce to.
 *
 * The default is dynamic (`days_to_show`), so it cannot live in `COLUMN_DEFAULTS`.
 * The result is clamped into `[1, days_to_show]`.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns Column floor, within `[1, days_to_show]`
 */
export function resolveMinDaysToShow(config: Types.Config): number {
  const days = configuredDays(config);
  const overrides = config.column;

  if (!overrides || !hasOverride(overrides, 'min_days_to_show')) {
    return days;
  }

  const raw = overrides.min_days_to_show;
  const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));

  if (!Number.isFinite(parsed)) {
    return days;
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
export function resolveMinDaysFallback(config: Types.Config): Types.ColumnMinDaysFallback {
  return resolveColumnOption(config, 'min_days_fallback') === 'cramp' ? 'cramp' : 'list';
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
 * the resolved effective view. Nothing reads `config.view` directly, because below the
 * threshold that value still says `column` while the card renders a list, and every
 * per-view resolution would then resolve for the wrong view.
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
  if (requestedView !== 'column') {
    return requestedView;
  }

  // Before the first measurement, honour the request to avoid flashing the fallback.
  if (measuredWidthPx === null || measuredWidthPx <= 0) {
    return 'column';
  }

  // Schmitt trigger, centred on the threshold: enter half a band above, leave half a
  // band below.
  const halfBand = VIEW_SWITCH_HYSTERESIS_PX / 2;
  const effectiveThreshold =
    previousEffectiveView === 'column' ? thresholdPx - halfBand : thresholdPx + halfBand;

  return measuredWidthPx >= effectiveThreshold ? 'column' : 'list';
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
// boundaries from floating-point underflow.
function fitColumns(config: Types.Config, widthPx: number): number {
  const gutter = columnGutterPx(config);
  const unit = resolveColumnOption(config, 'min_day_width') + gutter;

  if (unit <= 0) {
    return 0;
  }

  const fitted = Math.floor((widthPx - COLUMN_CARD_PADDING_PX + gutter) / unit + 1e-9);

  return Math.max(0, Math.min(configuredDays(config), fitted));
}

// Clamped half-band so adjacent column-count thresholds cannot overlap.
function columnHysteresisHalfBandPx(config: Types.Config): number {
  const spacing = resolveColumnOption(config, 'min_day_width') + columnGutterPx(config);

  return Math.max(0, Math.min(VIEW_SWITCH_HYSTERESIS_PX / 2, (spacing - 1) / 2));
}

/**
 * Resolves the layout — view and column count — for a measured width.
 *
 * Column view renders as many columns as the width carries, never more than
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

  if (requestedView !== 'column') {
    return { view: requestedView, columns: 0 };
  }

  // Optimistic before the first measurement to avoid flashing the fallback.
  if (measuredWidthPx === null || measuredWidthPx <= 0) {
    return { view: 'column', columns: days };
  }

  const floor = Math.min(resolveMinDaysToShow(config), days);
  const previousColumns = previous && previous.view === 'column' ? previous.columns : 0;
  const halfBand = columnHysteresisHalfBandPx(config);
  const raw = fitColumns(config, measuredWidthPx);

  // A `null` previous layout uses the enter threshold; otherwise a card could qualify
  // for a column it has never been wide enough for.
  let fitted = raw;

  if (raw > previousColumns) {
    fitted = fitColumns(config, measuredWidthPx - halfBand);
  } else if (raw < previousColumns) {
    fitted = fitColumns(config, measuredWidthPx + halfBand);
  }

  if (fitted >= floor) {
    return { view: 'column', columns: Math.min(fitted, days) };
  }

  return resolveMinDaysFallback(config) === 'cramp'
    ? { view: 'column', columns: floor }
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
export function describeColumnLayoutBands(config: Types.Config): ColumnLayoutBands {
  const days = configuredDays(config);
  const floor = Math.min(resolveMinDaysToShow(config), days);
  const halfBand = columnHysteresisHalfBandPx(config);

  const bands: ColumnLayoutBand[] = [];
  for (let columns = days; columns >= floor; columns--) {
    bands.push({
      columns,
      minWidthPx: Math.ceil(computeColumnThresholdPxFor(config, columns) + halfBand),
    });
  }

  return {
    bands,
    fallback: resolveMinDaysFallback(config),
    fallbackBelowPx: Math.ceil(computeColumnThresholdPxFor(config, floor) + halfBand),
    hysteresisPx: halfBand,
  };
}

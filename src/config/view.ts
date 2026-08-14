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

import { DEFAULT_CONFIG, coercePixelLength } from './config';
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
 *
 * The element type is intersected with `keyof Types.Config` to state the invariant the
 * list has always held but never enforced — every option here has a top-level
 * counterpart it overrides. That is what separates these from `COLUMN_ONLY_KEYS`, and
 * it is what lets `resolveEffectiveConfig` spread them onto a configuration without
 * inventing fields no `Types.Config` describes. Adding a column-only key here is now a
 * compile error rather than a silently malformed configuration.
 */
export const COLUMN_OVERRIDE_KEYS: ReadonlyArray<keyof Types.ColumnOverrides & keyof Types.Config> =
  [
    'show_empty_days',
    'empty_day_text',
    'split_multiday_events',
    // Content rather than density, and both were classified fetch-time until their
    // pipelines were traced. Neither reaches Home Assistant: `getTimeWindow` never
    // receives `show_past_events` and the window starts at midnight of the reference
    // date regardless, so past events are always fetched and this only decides whether
    // they render; `filter_duplicates` is applied after the fetch and is deliberately
    // absent from the cache key, which holds the raw payload and reprocesses on read.
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
 * and these deliberately are not. Merging the lists would either break that
 * invariant or force phantom top-level options into `DEFAULT_CONFIG` that no
 * list-view code path could ever read.
 */
export const COLUMN_ONLY_KEYS: ReadonlyArray<keyof Types.ColumnOverrides> = [
  'day_header_gap',
  'day_header_separator_width',
  'day_header_separator_color',
  'min_day_width',
  'min_days_to_show',
  'min_days_fallback',
];

const OVERRIDE_KEY_SET: ReadonlySet<string> = new Set<string>([
  ...COLUMN_OVERRIDE_KEYS,
  ...COLUMN_ONLY_KEYS,
]);

/**
 * Every view the card can render, in the order a user should meet them.
 *
 * Exported so callers can iterate the views rather than naming one. The editor is
 * built against this list specifically to keep `=== 'column'` out of it: a third
 * view should cost an entry here and a set below, not a hunt for comparisons.
 */
export const VIEWS: ReadonlyArray<Types.EffectiveView> = ['list', 'column'];

/**
 * Views that give way to another layout when the card is too narrow to render them.
 *
 * A card set to one of these renders **two** layouts over its lifetime — its own when
 * there is room, and the fallback when there is not — which is why the editor annotates
 * options rather than hiding them, and why it can offer a table of what happens at
 * which width. A view absent from this set always renders itself.
 */
export const VIEWS_WITH_WIDTH_FALLBACK: ReadonlySet<Types.EffectiveView> =
  new Set<Types.EffectiveView>(['column']);

/**
 * Views that carry a per-view override block, mapped to the config key holding it.
 *
 * `list` is absent because the top level *is* the list configuration — there is
 * nothing for it to override. A future view with its own block adds one entry, and
 * every consumer that iterates this map picks it up without further change.
 */
export const OVERRIDE_BLOCK_BY_VIEW: Readonly<
  Partial<Record<Types.EffectiveView, keyof Types.Config>>
> = {
  column: 'column',
};

/**
 * Which views each option actually affects. An absent key affects every view.
 *
 * Keyed by view rather than kept as a flat "inert in column view" list, because the
 * statement an editor needs to make is *"applies to the list layout"* rather than
 * *"does nothing"* — both layouts are live for one card, since a column card renders
 * as a list below its width threshold. A flat list also could not express a key that
 * applies to two views out of three, which is the shape a third view produces.
 *
 * The compact family is here in full. Compact limits cap how much a card shows along
 * the axis it grows on, which a vertical list has and a grid does not; see
 * `viewAppliesCompactLimits`, which is the runtime half of the same statement.
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
 * A separate table rather than an entry in `VIEW_SCOPE`, because the two genuinely
 * disagree for `split_multiday_events` and collapsing them would make one of the two
 * statements false. At card level the key is a real column override — `column:
 * { split_multiday_events: false }` skips the split entirely (`events.ts:225`). Per
 * entity it is ignored in column view, because `viewForcesMultidaySplit` passes
 * `ignorePerEntityOverride` and a column that silently omitted the later days of a
 * multi-day event would be a claim about a day that is not true.
 *
 * Consulted through `entityScopeFor`, which falls back to the card-level table, so a
 * key whose per-entity scope matches its card-level one needs no entry here.
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

/**
 * Options that influence which events are fetched from Home Assistant.
 *
 * These can never become overrides. Switching between views must not refetch, so an
 * option in this set would fire a Home Assistant API call every time the viewport
 * crossed the breakpoint between the two views.
 *
 * Membership is decided by tracing the option to the API call, not by whether it sounds
 * like it selects events. `show_past_events` and `filter_duplicates` both sound like it
 * and both sat here until they were traced: neither reaches `getTimeWindow` or the cache
 * key, so both are content filters applied to a payload that was fetched the same way
 * either way, and both are now overridable. `first_day_of_week` is the reverse — it
 * looks like a display preference and genuinely moves the window, because
 * `parseStartDateExpression` resolves `start_of_week` against it.
 */
const FETCH_TIME_KEYS: ReadonlySet<string> = new Set([
  'entities',
  'start_date',
  'days_to_show',
  'first_day_of_week',
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
 * that does not work. Column view renders no day, week or month separators at all,
 * so setting these at the top level changes nothing there.
 *
 * The set was briefly empty after Phase 4b implemented the three keys that used to
 * live here, shrank again when week numbers landed, and is empty once more now that
 * the day, week and month separators render. It is kept rather than deleted because
 * the situation it describes recurs on every phase boundary: the design document is
 * published, so a key can be public knowledge before it is public behaviour, and
 * "planned but not built" is a materially different message from "not a recognized
 * option".
 */
const NOT_YET_IMPLEMENTED_KEYS: ReadonlySet<string> = new Set([
  // Empty. Add a key here when the design document publishes it ahead of the code,
  // and remove it in the same commit that makes it render.
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
 * - `day_gap` no longer exists. The gap between columns is `day_spacing`, a
 *   `COLUMN_OVERRIDE_KEYS` member, resolved through the ordinary override path.
 *
 *   This reverses the reasoning recorded here across three prior amendments, and the
 *   reversal is a maintainer ruling — do not re-derive it. The argument for a separate
 *   key was that a horizontal gutter and a vertical one are different resources: the
 *   list view separates stacked days along the axis where space is free, whereas the
 *   column gutter spends the horizontal budget D6's sizing table calls scarce, roughly
 *   161px per event in a 500px section. That argument produced a genuine defect twice
 *   over — the value shipped at `10px`, was narrowed to `4px` on the spec's own worked
 *   example, and was twice ruled back up after live review (8px, then 12px) because
 *   adjacent columns read as one block.
 *
 *   What settled it is that the two keys always described **one concept on two axes**:
 *   the configurable space between adjacent days. The reference documentation had
 *   already conceded as much, describing `day_gap` as "the column-view counterpart to
 *   `day_spacing`" — which is the definition of a duplicate, not of a sibling. A user
 *   who wants tighter days should not have to learn a second name for it depending on
 *   which way the days are laid out.
 *
 *   The default is `DEFAULT_CONFIG.day_spacing`, `10px`, for both views. That is 2px
 *   tighter than the ruled `12px`, and the maintainer accepted the difference
 *   explicitly rather than carry a per-view default: `resolveColumnOption` returns its
 *   default whenever no override is present, so a column-specific default would shadow
 *   an explicit top-level `day_spacing` — a value the user *did* write losing to one
 *   they did not. Correcting that needs explicitness tracking, which fights the
 *   merge-once-at-the-boundary model. Not worth 2px. Anyone wanting the old feel writes
 *   `column: { day_spacing: 12px }`.
 *
 *   Threshold cost still tracks the value, because widening the gap and widening the
 *   width threshold remain the same act: at `days_to_show: 3` the gutter contributes
 *   20px at 10px. See `computeColumnThresholdPx`.
 * - `day_header_gap` is `8px` — the vertical space between a day's header and its
 *   first event. It exists as its own option because that space used to be an
 *   emergent property of two unrelated rules, a 4px padding under the header plus a
 *   4px margin under the separator, so switching the separator off silently halved
 *   it. The gap is now the header's alone and does not move when the rule does; the
 *   rule, when present, sits centred in it.
 * - `day_header_separator_width` is `0px` — no rule by default, which lines up with
 *   every list separator and with `show_*` defaults generally. This **reverses** the
 *   original B2 ruling, which made it visible because the boundary it marks is
 *   structural rather than decorative. That argument was sound in the abstract and
 *   wrong in practice: seen against the coloured accent bars beside each event, a
 *   full-width horizontal rule reads as a table border and dates the card. The
 *   reversal was made on the maintainer's explicit ruling after live review, and B2
 *   in the spec has been amended to match — this is not a re-derivation from local
 *   consistency, which is the change B2 still forbids. Constant header spacing is
 *   what `day_header_gap` above now guarantees, so turning the rule off no longer
 *   collapses the header against the events.
 * - `day_header_separator_color` is `var(--divider-color)`, Home Assistant's semantic
 *   divider token, rather than the `var(--secondary-text-color)` the list separators
 *   use. That is a deliberate token-family choice, not an oversight: this is a
 *   structural divider, not text. Do not "fix" it to match the list separators. This
 *   half of B2 stands unchanged.
 */
export const COLUMN_DEFAULTS = {
  day_header_gap: '8px',
  day_header_separator_width: '0px',
  day_header_separator_color: 'var(--divider-color)',

  // 140, not the 160 the G13 spike reported. G13 measured the floor a column can
  // survive at, but computed the fit as `160 x 3 + 20 = 500` against a measured
  // 500px HA section -- arithmetic with no room for the card's own horizontal
  // padding, which is real. Fitting three columns into that section is the
  // constraint that sets this number, because a single section is the most common
  // desktop placement and column view must activate there at defaults.
  //
  // The full sum is `min x days + COLUMN_CARD_PADDING_PX + (days - 1) x day_spacing`,
  // and the *entering* threshold adds half the hysteresis band on top
  // (VIEW_SWITCH_HYSTERESIS_PX / 2). At the current 32px padding, 10px gutter and
  // 16px half-band: `140 x 3 + 32 + 2 x 10 = 472`, entering at 488 -- 12px under a
  // 500px section. 144 would compute 484 and enter at 500, exactly on the boundary
  // with nothing left for a scrollbar; the margin here is thinner than it looks, so
  // recompute all three terms rather than adjusting one.
  //
  // The gutter term was `day_gap` until it merged into `day_spacing`, taking the
  // default from 12px to 10px and buying back 4px of headroom.
  //
  // Do not "restore" this to 160 on the strength of the G13 number alone: that
  // reintroduces a large deficit and silently disables the feature at defaults.
  min_day_width: 140,

  // 'list' preserves the wholesale fallback the card shipped with. The alternative,
  // 'cramp', is only reachable by writing it, and only *matters* once the user has
  // also lowered `min_days_to_show` -- at the default floor of `days_to_show` the two
  // values differ solely in whether an over-narrow card shows a list or a squeezed
  // grid, and 'list' is the honest answer there.
  // Deliberately written bare rather than cast to `Types.ColumnMinDaysFallback`:
  // the surrounding `as const` already narrows it to the literal, so the cast bought
  // nothing, and `check:docs` reconciles this table by reading the source text --
  // an inline assertion there reads as a default of "'list' as Types..." and fails.
  min_days_fallback: 'list',
} as const;

/**
 * Value type a column-only option resolves to.
 *
 * Derived from the shape of the key's `COLUMN_DEFAULTS` entry rather than from a
 * second hand-maintained list, for the same reason `coercePixelLength` infers
 * length-ness that way: a list that has to be edited in lockstep with the table
 * above is a list that will eventually disagree with it.
 *
 * The conditional widens the literal type — `COLUMN_DEFAULTS.min_day_width`
 * is typed `140` under `as const`, and a user who configures `220` must still be
 * assignable to the return type.
 */
type ColumnOptionValue<K extends keyof typeof COLUMN_DEFAULTS> =
  (typeof COLUMN_DEFAULTS)[K] extends number ? number : string;

/**
 * Column-only options whose value is a CSS length.
 *
 * These accept a bare number from YAML, because that is what users write. Home
 * Assistant's YAML parser types `day_header_gap: 4` as a number, and a number is not a
 * valid CSS length: it reaches `styleMap` as `"4"`, the browser rejects the
 * declaration, and the rule silently disappears. Coercing here means the failure
 * cannot reach the renderer.
 *
 * Override keys get the same protection from `coercePixelLength`, which infers
 * length-ness from the shape of the key's `DEFAULT_CONFIG` value rather than from a
 * second hand-maintained list.
 */
const COLUMN_LENGTH_KEYS: ReadonlySet<string> = new Set([
  'day_header_gap',
  'day_header_separator_width',
]);

/**
 * Normalizes a column-only option value to a usable value of its declared type.
 *
 * Numeric keys carry their own validation here, and must: the `column:` block is raw
 * user input that never passes through `normalizeConfig`'s `toValidNumber` sweep, so
 * this is the only place a bad value can be caught. A non-finite or non-positive
 * `min_day_width` would otherwise produce a zero or `NaN` view-switch threshold
 * — column view rendering at every width, at any degree of crampedness, or never
 * rendering at all. Falling back to the default is the only safe reading of a value
 * the card cannot use.
 *
 * @param key - Option being resolved
 * @param value - Raw configured value, which YAML may have typed as a number
 * @returns A value of the key's declared type
 */
function normalizeColumnValue(key: keyof typeof COLUMN_DEFAULTS, value: unknown): string | number {
  const fallback = COLUMN_DEFAULTS[key];

  if (typeof fallback === 'number') {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

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
 * Options whose shipped default differs in column view.
 *
 * These are the keys where the two views disagree about what "unconfigured" should
 * mean. `show_empty_days` is the case in hand: a list of events reads perfectly well
 * with the blank days omitted, but a grid of day columns with the blank ones missing
 * does not — the columns stop corresponding to consecutive days, and the card silently
 * becomes a different thing than it looks like.
 *
 * The rule is deliberately *not* "inherit unless the user said otherwise". A key
 * listed here does **not** inherit its top-level value in column view at all: the
 * column default stands until the `column:` block overrides it. The alternative —
 * inheriting only when the user left the top level untouched — needs a record of
 * which keys were written by hand, and produces the surprising result that two cards
 * with identical *effective* list behaviour render differently in column view
 * depending on whether a value was typed or defaulted. One sentence of documentation
 * beats a distinction that is invisible in the YAML.
 *
 * The escape hatch is therefore always the block, never the top level:
 *
 * ```yaml
 * view: column
 * column:
 *   show_empty_days: false   # the only way to switch it off for columns
 * ```
 *
 * Every key here must also be a member of `COLUMN_OVERRIDE_KEYS`, or that escape
 * hatch fails validation and the default becomes unconditional.
 */
export const COLUMN_DEFAULT_OVERRIDES: {
  readonly [K in keyof Types.ColumnOverrides & keyof Types.Config]?: Types.Config[K];
} = {
  show_empty_days: true,
  split_multiday_events: true,
};

/**
 * Views whose defaults depart from the top level, mapped to what they substitute.
 *
 * The lookup form of `COLUMN_DEFAULT_OVERRIDES`, so that a caller can ask *which*
 * options a view has already decided for the user without naming the view. The editor
 * is the caller in hand: an option whose default differs in the view the card is set to
 * needs saying so beside the shared control, or the user reads a switch that does not
 * describe what they are looking at.
 */
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
 * Compact mode caps how much a card shows, and the cap only means something in a view
 * that grows along the axis it trims. A vertical list does: capping it is a tail-trim,
 * the card gets shorter, and the events that survive are the soonest ones. A grid does
 * not: the same cap deletes columns from the right while the card keeps its full
 * height, so the result is a differently-shaped card of identical size that merely
 * holds less, with nothing on screen to say the rest is missing. Column view answers
 * the density question with `min_days_to_show` / `min_days_fallback` instead, which
 * reduce columns only when the width genuinely cannot carry them (spec §D7).
 *
 * Written as a predicate over the view rather than an inline `!== 'column'` because the
 * reasoning is about *grid layouts*, not about column view specifically. A time grid
 * (Phase 5) will need its own answer here, and a negative-form comparison would have
 * silently given it the list answer. Prefer extending this function to adding a second
 * comparison at the call site.
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
 * split is not a preference in column view — it is what makes the layout truthful
 * (spec §D5). Per-entity precedence is therefore ignored, since honouring it would let
 * one calendar be honest and another not within the same card.
 *
 * List view returns `false`: the per-entity setting keeps its documented precedence
 * there, because a list shows a multi-day event once and reads correctly either way.
 *
 * A time grid (Phase 5) is a genuinely open third answer rather than a copy of either.
 * Grid conventions usually hoist all-day and multi-day events into a banner row above
 * the grid, spanning their real duration, which is neither "split per day" nor "leave
 * as one block in the first day". Extend this function when that view lands.
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
 * rather than a `list-view` class — adding one would mean requalifying the entire
 * stylesheet, which is a much larger change than it appears and buys nothing.
 *
 * A mapping rather than a predicate, because the answer is not a yes or no: a third view
 * needs a third class, and the alternative shape at the call site — a ternary on
 * `=== 'column'` — silently hands a time grid (Phase 5) the *list* class, which is the
 * one outcome that produces a broken layout rather than a visible error. Extend the
 * switch when that view lands and the compiler will require the new case.
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
  if (effectiveView !== 'column') {
    return config[key];
  }

  const overrides = config.column;

  if (overrides && hasOverride(overrides, key)) {
    // `hasOverride` has established that the option is present and not `undefined`,
    // which is the only way the optional override type can widen the config type.
    return overrides[key] as Types.Config[K];
  }

  // `??` rather than a presence test on purpose: a column default of `false` is a
  // legitimate value and must not fall through to the top-level one.
  return COLUMN_DEFAULT_OVERRIDES[key] ?? config[key];
}

/**
 * Applies the `column:` block to a configuration, once, for the view being rendered.
 *
 * This is the bulk resolution counterpart to `resolveViewOption`, and it exists
 * because the per-option form does not scale to where the options are actually read.
 * Roughly two thirds of the override keys are consumed several frames deep in the
 * render tree — inside `presentation.ts`, the leaf renderers, and the custom-property
 * map — none of which take an effective view. Reaching them one option at a time
 * would mean threading a view argument through every function that accepts a
 * `Types.Config` and rewriting each `config.x` read into a resolver call, where a
 * single missed read is an override that silently does nothing. Merging once, at the
 * one boundary where the effective view is known, makes every existing read correct
 * by construction and leaves exactly one place to test.
 *
 * `resolveViewOption` remains for callers that run *outside* that boundary and must
 * resolve a single option against an explicitly supplied view — `groupEventsByDay`
 * being the case in hand, since it is also called for a count that deliberately wants
 * list semantics regardless of what is on screen.
 *
 * Two properties of the merge are load-bearing:
 *
 * - Only `COLUMN_OVERRIDE_KEYS` are applied. `COLUMN_ONLY_KEYS` are deliberately left
 *   in the block for `resolveColumnOption` to read, because they have no top-level
 *   counterpart; hoisting them would put keys on the configuration that no
 *   `Types.Config` field describes. `NOT_YET_IMPLEMENTED_KEYS` are excluded for free,
 *   as they are not members of the override list either.
 * - The `column` block itself survives on the returned object, because
 *   `resolveColumnOption` still reads it downstream. Spreading the applied keys over
 *   the configuration preserves it, and nothing in the applied set can shadow it.
 *
 * The original object is returned by identity in list view, where nothing can apply.
 * Column view always allocates, because `COLUMN_DEFAULT_OVERRIDES` applies there
 * whether or not a block exists. That is safe only because the card memoizes this
 * call on configuration *and* view identity — see `effectiveConfig` — so a column
 * card allocates once per configuration rather than once per render.
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
 * `view` is the only option whose value selects an entire render path, and it is
 * compared by equality at every one of those branch points. A typo therefore fails
 * every comparison rather than any single one: `view: 'colunm'` is not `'column'`
 * anywhere, so the card renders a complete, correct-looking **list** and gives the
 * user nothing at all to connect that to what they wrote. Every other mistyped option
 * either loses one visual detail or is caught by `validateColumnOverrides`.
 *
 * Coerces rather than only warning, so that `config.view` always satisfies the type
 * that describes it. Downstream code — the editor's view selector included — reads it
 * back and is entitled to assume the union holds. The rendered result is the same
 * either way; what changes is that the configuration object stops lying.
 *
 * Follows the same contract as `validateColumnOverrides`: never throws, so one stray
 * line cannot blank the card, and the diagnostic reaches only the development build.
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
  // Before the early return below, not after the loop: a user who writes
  // `day_header_gap` at the top level is by definition one who did not write a
  // `column:` block, so running this last would skip the check for exactly the
  // population it exists for.
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

/**
 * Reports column-only options mistakenly written at the top level.
 *
 * `day_header_gap`, `day_header_separator_width` and `day_header_separator_color` only
 * exist inside `column:`. Written at the top level they are silently inert, which
 * is the *more* likely mistake of the two: the reference documentation lists them
 * in the same visual table as genuine top-level options, so nothing about their
 * presentation signals that they are nested.
 *
 * Without this, `column.foo` gets a tailored diagnostic while a misplaced
 * `day_header_gap: 32px` gets nothing at all.
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
 * 32px = 16px on each side. Column view keeps `ha-card`'s horizontal padding
 * symmetric at 16px, matching the inset the list view builds up in two steps
 * (8px of card padding plus 8px on `.date-column`). A column grid has no inner
 * offset to lean on, so the card carries the whole amount.
 *
 * This shipped briefly as 16px, when the stylesheet narrowed the card to 8px a
 * side to buy width against Home Assistant's 500px single-span section. The
 * saving was real but bought nothing: below the threshold the card falls back to
 * list view anyway, so the only visible effect was the first column sitting 8px
 * left of the card title. Reverted; the arithmetic follows the stylesheet.
 *
 * This is not cosmetic — it is load-bearing arithmetic. See
 * `COLUMN_DEFAULTS.min_day_width`.
 */
export const COLUMN_CARD_PADDING_PX = 32;

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
 *
 * The band is applied *symmetrically* -- half above the threshold to enter, half below
 * it to leave. An asymmetric band (enter at `T`, leave at `T - band`) has the same
 * anti-flap behaviour but biases the whole hysteresis window upward, so a card had to
 * grow a full band past the computed threshold before column view returned. That was
 * reported from live use as the view being much harder to get back into than out of.
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
 * Numeric form of the default column gutter, derived rather than restated.
 *
 * The threshold fallback and the rendered default must be the same number: a user who
 * writes an unresolvable length such as `2em` should get the default spacing in the
 * arithmetic, so an unparseable value costs nothing. Hardcoding it here is how those
 * two drifted apart once already, back when the gutter was a separate `day_gap` key
 * and it moved from 8px to 12px.
 */
const DEFAULT_DAY_GAP_PX = parsePx(DEFAULT_CONFIG.day_spacing, 10);

/**
 * Computes the card width, in pixels, at or above which column view can render.
 *
 * ```
 * column.min_day_width x days_to_show + card padding + (days_to_show - 1) x gutter
 * ```
 *
 * This is A3-C's formula verbatim. Every term is required: dropping the padding term
 * is what made an earlier iteration compute 500px for a layout that needs 524px.
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
 * The generalized form of `computeColumnThresholdPx`, which is this function at
 * `days_to_show`. Column reduction needs a threshold per candidate column count, not
 * just the one, so the arithmetic moved here and the original became a call site.
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

/**
 * Resolves the gutter between day columns, in pixels.
 *
 * Read out of `column:` by hand for the ordering reason documented on
 * `computeColumnThresholdPx`: width arithmetic runs before the view is known, so it
 * cannot go through `resolveEffectiveConfig`.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns Gutter width in pixels
 */
function columnGutterPx(config: Types.Config): number {
  const overrides = config.column;
  const configuredGap =
    overrides && hasOverride(overrides, 'day_spacing')
      ? coercePixelLength('day_spacing', overrides.day_spacing)
      : config.day_spacing;

  return parsePx(String(configuredGap), DEFAULT_DAY_GAP_PX);
}

/**
 * Normalizes `days_to_show` to a usable column count.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns At least one day
 */
function configuredDays(config: Types.Config): number {
  return Math.max(1, Math.floor(config.days_to_show));
}

/**
 * Resolves the fewest columns the card may reduce to.
 *
 * Unlike its siblings this key has no `COLUMN_DEFAULTS` entry, because its default is
 * not a constant: it is `days_to_show`, the value at which the reduction range
 * collapses to a point and the card behaves exactly as it did before the key existed.
 * `COLUMN_DEFAULTS` is a static table and cannot express that, so resolution lives
 * here rather than being faked with a sentinel that every reader would have to
 * decode.
 *
 * The result is always clamped into `[1, days_to_show]`. A floor above the ceiling is
 * not a configuration the card can honour, and a floor of zero would ask it to render
 * a grid with no columns in it.
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
 * Validated against the two legal values rather than passed through, because
 * `normalizeColumnValue` has no notion of an enum: a typo would otherwise reach the
 * caller as an unrecognized string and be read as "not 'list'", silently selecting
 * the behaviour the user did not ask for.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns `'list'` or `'cramp'`
 */
export function resolveMinDaysFallback(config: Types.Config): Types.ColumnMinDaysFallback {
  return resolveColumnOption(config, 'min_days_fallback') === 'cramp' ? 'cramp' : 'list';
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

  // Schmitt trigger, centred on the threshold: entering column view requires half the
  // band above it, leaving requires half the band below it. The band is the same width
  // as an asymmetric one, but centring it means the layout the arithmetic actually
  // predicts appears at the width it predicts, rather than only once the card is a full
  // band wider -- which is what made re-entering column view feel much stickier than
  // leaving it. See VIEW_SWITCH_HYSTERESIS_PX.
  const halfBand = VIEW_SWITCH_HYSTERESIS_PX / 2;
  const effectiveThreshold =
    previousEffectiveView === 'column' ? thresholdPx - halfBand : thresholdPx + halfBand;

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

//-----------------------------------------------------------------------------
// COLUMN DENSITY
//-----------------------------------------------------------------------------

/**
 * The layout the card settles on at a given width.
 *
 * `columns` is meaningful only when `view` is `'column'`; in list view it is `0`,
 * because a column count is not a thing the list layout has. Keeping the two in one
 * record rather than as two returns is what lets the host detect a change in either
 * with a single comparison — a width change that drops a column without changing the
 * view still has to re-render, and a host tracking only the view would miss it.
 */
export interface ColumnFit {
  view: Types.EffectiveView;
  columns: number;
}

/**
 * Largest number of columns that fits in a width, ignoring the floor.
 *
 * Closed form of `computeColumnThresholdPxFor`. That function is monotonic in `days`,
 * so inverting it is exact and avoids a loop:
 *
 * ```
 * w >= min x d + padding + (d - 1) x gutter
 *   <=>  d <= (w - padding + gutter) / (min + gutter)
 * ```
 *
 * The epsilon absorbs binary-floating-point error at an exact boundary, where a
 * fractional gutter can make a quotient that is mathematically `3` evaluate as
 * `2.9999999999999996` and floor to `2`.
 *
 * @param config - Merged configuration, defaults already applied
 * @param widthPx - Card width to fit into
 * @returns Column count, `0` when not even one column fits
 */
function fitColumns(config: Types.Config, widthPx: number): number {
  const gutter = columnGutterPx(config);
  const unit = resolveColumnOption(config, 'min_day_width') + gutter;

  if (unit <= 0) {
    return 0;
  }

  const fitted = Math.floor((widthPx - COLUMN_CARD_PADDING_PX + gutter) / unit + 1e-9);

  return Math.max(0, Math.min(configuredDays(config), fitted));
}

/**
 * Half-width of the hysteresis band applied at each column boundary.
 *
 * `VIEW_SWITCH_HYSTERESIS_PX / 2` was chosen when there was exactly one boundary to
 * defend. Column reduction introduces `days_to_show - min_days_to_show + 1` of them,
 * spaced `min_day_width + gutter` apart, and bands wider than half that spacing
 * would overlap — at which point a single width could satisfy the enter condition for
 * one count and the leave condition for the next, and the trigger would oscillate
 * instead of damping.
 *
 * At defaults the spacing is 150px and the clamp never binds. It binds only for a
 * user who has driven `min_day_width` down near the gutter, which is a
 * configuration the card deliberately permits.
 *
 * @param config - Merged configuration, defaults already applied
 * @returns Half-band in pixels, never negative
 */
function columnHysteresisHalfBandPx(config: Types.Config): number {
  const spacing = resolveColumnOption(config, 'min_day_width') + columnGutterPx(config);

  return Math.max(0, Math.min(VIEW_SWITCH_HYSTERESIS_PX / 2, (spacing - 1) / 2));
}

/**
 * Resolves the layout — view and column count — for a measured width.
 *
 * Generalizes `resolveEffectiveView` from a single yes/no boundary to a staircase.
 * Column view renders as many columns as the width carries, never more than
 * `days_to_show` and never fewer than `min_days_to_show`; below that floor
 * `min_days_fallback` decides between falling back to the list layout and holding
 * the floor with columns narrower than the configured minimum.
 *
 * **At defaults this reduces exactly to the previous behaviour.** `min_days_to_show`
 * defaults to `days_to_show`, so the staircase has one step: either every configured
 * column fits and the view is `'column'`, or none of them do and
 * `min_days_fallback: 'list'` returns the list layout — the same two outcomes, at the
 * same threshold, with the same 16px band. The generalization is inert until a user
 * lowers the floor.
 *
 * The Schmitt trigger is applied to the *width* rather than to each threshold, which
 * is the same trick in a form that survives having more than one boundary: growing
 * costs half a band, shrinking is granted half a band, and a width inside a band
 * holds whatever is already rendered.
 *
 * Neither key is a `FETCH_TIME_KEY` and neither may become one. Reducing the column
 * count renders a subset of a fetch already sized to `days_to_show`, so every
 * transition here is render-side and costs zero Home Assistant API calls — the same
 * guarantee (G10) that governs the view switch itself.
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

  // Optimistic before the first measurement, for the reason documented on
  // `resolveEffectiveView`: rendering the list layout and then swapping flashes the
  // wrong thing at every load on a card that is wide enough.
  if (measuredWidthPx === null || measuredWidthPx <= 0) {
    return { view: 'column', columns: days };
  }

  const floor = Math.min(resolveMinDaysToShow(config), days);
  const previousColumns = previous && previous.view === 'column' ? previous.columns : 0;
  const halfBand = columnHysteresisHalfBandPx(config);
  const raw = fitColumns(config, measuredWidthPx);

  // Note that a `null` previous layout deliberately lands in the growing branch, via a
  // previous count of zero. That matches `resolveEffectiveView`, where a `null`
  // previous view means "not currently in column view" and so requires the *enter*
  // threshold rather than no band at all. Skipping the band for an unknown previous
  // layout would let a card qualify for a column it has never been wide enough for.
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
 * Stands to `resolveColumnFit` exactly as `resolveViewOnMeasurement` stands to
 * `resolveEffectiveView`, and for the identical reason: the optimistic
 * pre-measurement answer is a bet rather than an observation and must not seed the
 * hysteresis. A `null` `previousMeasuredWidthPx` means no measurement has confirmed
 * the current layout, which is precisely when the band must not apply.
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

/**
 * One rung of the column staircase: a column count and the width that earns it.
 */
export interface ColumnLayoutBand {
  /** Day columns rendered in this band. */
  columns: number;
  /** Card width, in pixels, at or above which the band is entered. */
  minWidthPx: number;
}

/**
 * The layouts a configuration produces across every card width.
 *
 * Ordered widest first, which is how it reads as a table.
 */
export interface ColumnLayoutBands {
  /** Column counts from `days_to_show` down to `min_days_to_show`. */
  bands: ReadonlyArray<ColumnLayoutBand>;
  /** What happens below the narrowest band. */
  fallback: Types.ColumnMinDaysFallback;
  /** Width, in pixels, below which `fallback` applies. */
  fallbackBelowPx: number;
  /** Width either side of a boundary within which the current layout is held. */
  hysteresisPx: number;
}

/**
 * Describes every layout a configuration can settle on, by card width.
 *
 * The editor renders this as a table, which is the only honest answer to the
 * question column view generates most often — *why does my card look different on my
 * phone*. It lives here rather than in the editor because it is the same arithmetic
 * `resolveColumnFit` runs, and a second copy of a formula whose every term is
 * load-bearing (see `COLUMN_DEFAULTS.min_day_width`) is a copy that will drift.
 *
 * Thresholds are the **entering** ones — the width a card must reach to gain a
 * layout, `computeColumnThresholdPxFor` plus half the hysteresis band, exactly as
 * `resolveColumnFit` computes when growing. Reporting the entering figure for every
 * rung keeps the table internally consistent; the band that makes a boundary sticky
 * on the way back down is surfaced separately as `hysteresisPx` rather than as a
 * second column of numbers nobody asked for.
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

/**
 * Configuration module for Calendar Card Pro
 */

import * as Constants from './constants';
import * as Types from './types';
import * as Helpers from '../utils/helpers';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// CORE CONFIGURATION
//-----------------------------------------------------------------------------

export const DEFAULT_CONFIG: Types.Config = {
  entities: [],
  view: 'list',
  start_date: undefined,
  days_to_show: 3,
  compact_days_to_show: undefined,
  compact_events_to_show: undefined,
  compact_events_complete_days: false,
  show_empty_days: false,
  hide_when_empty: false,
  empty_day_text: undefined,
  filter_duplicates: false,
  duplicate_accent_color: undefined,
  split_multiday_events: false,
  event_type: 'all',
  language: undefined,

  title: undefined,
  title_font_size: undefined,
  title_color: undefined,

  background_color: 'var(--ha-card-background)',
  accent_color: '#03a9f4',
  vertical_line_width: '2px',
  day_spacing: '10px',
  event_spacing: '4px',
  additional_card_spacing: '0px',
  height: 'auto',
  max_height: 'none',

  first_day_of_week: 'system',
  show_week_numbers: null,
  show_current_week_number: true,
  week_number_font_size: '12px',
  week_number_color: 'var(--primary-text-color)',
  week_number_background_color: '#03a9f450',
  day_separator_width: '0px',
  day_separator_color: 'var(--secondary-text-color)',
  week_separator_width: '0px',
  week_separator_color: '#03a9f450',
  month_separator_width: '0px',
  month_separator_color: 'var(--primary-text-color)',

  today_indicator: false,
  today_indicator_position: '15% 50%',
  today_indicator_color: '#03a9f4',
  today_indicator_size: '6px',

  date_vertical_alignment: 'middle',
  weekday_font_size: '14px',
  weekday_color: 'var(--primary-text-color)',
  day_font_size: '26px',
  day_color: 'var(--primary-text-color)',
  show_month: true,
  month_font_size: '12px',
  month_color: 'var(--primary-text-color)',
  weekend_weekday_color: undefined, // Inherit from weekday_color
  weekend_day_color: undefined, // Inherit from day_color
  weekend_month_color: undefined, // Inherit from month_color
  today_weekday_color: undefined, // Inherit from weekday_color or weekend_weekday_color
  today_day_color: undefined, // Inherit from day_color or weekend_day_color
  today_month_color: undefined, // Inherit from month_color or weekend_month_color,

  event_background_opacity: 0,
  show_past_events: false,
  show_countdown: false,
  show_countdown_allday: true,
  show_progress_bar: false,
  progress_bar_color: 'var(--secondary-text-color)',
  progress_bar_height: 'calc(var(--calendar-card-font-size-time) * 0.75)',
  // Deliberately absent: each progress-bar placement supplies its own width fallback.
  progress_bar_width: undefined,
  // Top alignment keeps icons level with the first line when text wraps.
  event_icon_vertical_alignment: 'top',
  event_font_size: '14px',
  event_color: 'var(--primary-text-color)',
  empty_day_color: 'var(--primary-text-color)',
  show_time: true,
  show_single_allday_time: true,
  show_multiday_allday_time: true,
  allday_badge: 'off',
  allday_badge_style: 'subtle',
  allday_badge_color: 'accent',
  time_24h: 'system',
  time_two_digit_hours: false,
  show_end_time: true,
  time_font_size: '12px',
  time_color: 'var(--secondary-text-color)',
  time_icon_size: '14px',
  time_max_lines: 0,
  show_location: true,
  show_location_allday: true,
  remove_location_country: false,
  location_font_size: '12px',
  location_color: 'var(--secondary-text-color)',
  location_icon_size: '14px',
  location_max_lines: 0,
  show_description: false,
  show_description_allday: true,
  title_max_lines: 0,
  description_max_lines: 0,
  description_font_size: '12px',
  description_color: 'var(--secondary-text-color)',
  description_icon_size: '14px',

  // Weather. `color` is deliberately absent so each placement can use its own fallback;
  // adding a default would be written to YAML by the editor and become indistinguishable
  // from a user choice.
  weather: {
    entity: undefined,
    position: 'date',
    date: {
      show_conditions: true,
      show_high_temp: true,
      show_low_temp: false,
      show_uv_index: false,
      uv_index_threshold: 0,
      icon_size: '14px',
      font_size: '12px',
    },
    event: {
      show_conditions: true,
      show_temp: true,
      show_uv_index: false,
      uv_index_threshold: 0,
      daily_forecast_fallback: true,
      max_lines: 0,
      icon_size: '14px',
      font_size: '12px',
    },
  },

  tap_action: { action: 'none' },
  hold_action: { action: 'none' },

  refresh_interval: Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES,
  refresh_on_navigate: true,

  column: undefined,
};

//-----------------------------------------------------------------------------
// CONFIGURATION UTILITIES
//-----------------------------------------------------------------------------

/**
 * Coerces a raw configuration value into a usable number.
 *
 * Empty editor values, `null` and non-numeric YAML must not collapse numeric options
 * to zero.
 *
 * @param value - Raw value taken from the user configuration
 * @param minimum - Smallest value that should be treated as valid
 * @returns The numeric value, or `undefined` when it cannot be used
 */
export function toValidNumber(value: unknown, minimum = 0): number | undefined {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < minimum) {
    return undefined;
  }

  return parsed;
}

// Also read by the editor's upgrade path.
export const DEPRECATED_CONFIG_MAP: Readonly<Record<string, string>> = {
  max_events_to_show: 'compact_events_to_show',
  vertical_line_color: 'accent_color',
  horizontal_line_width: 'day_separator_width',
  horizontal_line_color: 'day_separator_color',
  row_spacing: 'day_spacing',
};

export const DEPRECATED_ENTITY_CONFIG_MAP: Readonly<Record<string, string>> = {
  max_events_to_show: 'compact_events_to_show',
};

/**
 * Merges a user configuration over the defaults, filling nested blocks key by key.
 *
 * A plain spread merges the top level only, so a `weather:` block naming just `entity:`
 * replaced the whole default sub-tree and arrived with `position`, `date` and `event` all
 * `undefined` — even though each is published with a default. That produced two defects in
 * v4 review, both fixed at the symptom: `resolveWeatherPosition` had to centralise a
 * `position` default the subscribe and render halves were resolving differently, and
 * `isCustomized` had to treat an absent value as not-customized so the editor's filter
 * stopped flagging keys the user never wrote. This is the cause behind both.
 *
 * Only plain objects recurse. **Arrays are replaced wholesale**, which is what `entities:`
 * needs — merging a two-calendar list over a three-calendar default would leave behind a
 * third calendar the user had deleted. A user value that is not a plain object always wins,
 * so `weather: null` clears the block rather than being merged into.
 *
 * The write path already matches this: `toStoredConfig` routes `weather` through
 * `stripWeatherDefaults`, which compares each nested option against these same defaults and
 * drops the ones that agree, so filling them in here does not make the editor write them
 * back into the user's YAML.
 *
 * @param defaults - Shipped defaults, treated as the shape to fill in from
 * @param overrides - Raw user configuration, which wins wherever it is present
 * @returns A new object; neither input is mutated
 */
export function mergeConfig(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults };

  for (const [key, value] of Object.entries(overrides)) {
    const fallback = defaults[key];

    merged[key] =
      Helpers.isConfigBlock(value) && Helpers.isConfigBlock(fallback)
        ? mergeConfig(fallback, value)
        : value;
  }

  return merged;
}

/**
 * Reports removed config keys found in the raw user configuration.
 *
 * Reads the raw config before `DEFAULT_CONFIG` fills every key in. Entity entries are
 * inspected before `normalizeEntities` turns them into the canonical shape.
 *
 * @param config - Raw configuration passed to `setConfig`
 * @returns Human-readable messages, one per removed key found; empty when the config is clean
 */
export function findDeprecatedKeys(config: Partial<Types.Config>): string[] {
  const raw = config as Record<string, unknown>;
  const messages: string[] = [];

  for (const [oldKey, newKey] of Object.entries(DEPRECATED_CONFIG_MAP)) {
    if (oldKey in raw) {
      messages.push(`"${oldKey}" was removed in v3.0.0 and is being ignored — use "${newKey}"`);
    }
  }

  const entities = raw.entities;
  if (Array.isArray(entities)) {
    entities.forEach((entity, index) => {
      if (typeof entity !== 'object' || entity === null) return;
      const entry = entity as Record<string, unknown>;

      for (const [oldKey, newKey] of Object.entries(DEPRECATED_ENTITY_CONFIG_MAP)) {
        if (oldKey in entry) {
          messages.push(
            `"${oldKey}" on entities[${index}] was removed in v3.0.0 and is being ignored — use "${newKey}"`,
          );
        }
      }
    });
  }

  return messages;
}

/**
 * Sanitizes every numeric option so invalid values fall back to their defaults.
 *
 * @param config - Configuration to normalize (mutated in place)
 * @returns The same configuration instance, for chaining
 */
export function normalizeNumericOptions(config: Types.Config): Types.Config {
  // Required values fall back to their defaults; a missing or invalid value must never
  // reduce the visible range to zero.
  config.days_to_show = toValidNumber(config.days_to_show, 1) ?? DEFAULT_CONFIG.days_to_show;
  config.refresh_interval =
    toValidNumber(config.refresh_interval, 1) ?? DEFAULT_CONFIG.refresh_interval;
  config.event_background_opacity =
    toValidNumber(config.event_background_opacity, 0) ?? DEFAULT_CONFIG.event_background_opacity;

  // Optional limits: `undefined` means "no limit", so invalid values clear them rather
  // than collapsing to zero and hiding content.
  config.compact_days_to_show = toValidNumber(config.compact_days_to_show, 1);
  config.compact_events_to_show = toValidNumber(config.compact_events_to_show, 0);

  return config;
}

/**
 * Coerces a bare number written against a length-valued option into pixels.
 *
 * Two paths produce one. Home Assistant's YAML parser types `day_spacing: 4` as a number,
 * and the visual editor renders these options as free-text fields, so typing `10` into one
 * hands back the string `'10'`. Neither is a valid CSS length: it reaches `styleMap` or a
 * custom property unitless, the browser rejects the declaration, and the rule silently
 * disappears. Nothing errors and nothing is logged — the option simply has no effect,
 * which reads as the option being broken.
 *
 * A rejected declaration is not merely a missing gap, because the browser discards the
 * whole declaration rather than the offending part: `additional_card_spacing: 8` takes the
 * card's `padding: calc(var(--…) + 16px) 16px` down to `0`, losing the base padding too.
 *
 * Length-ness is inferred from the shipped default, falling back to {@link
 * LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT} for the options whose default cannot express it.
 * Values that carry no bare number, and genuinely numeric options, pass through untouched
 * — except a missing one. A blank YAML value parses as `null`, which means "no value
 * supplied" rather than a value to preserve, so a length-valued option falls back to what
 * it ships with.
 *
 * @param key - Option the value was written against
 * @param value - Raw configured value, which YAML or the editor may have typed as a number
 * @returns The value, with a bare number turned into a pixel length and a missing one
 *   replaced by the shipped default, where appropriate
 */
export function coercePixelLength(key: string, value: unknown): unknown {
  return coercePixelLengthAgainst(
    (DEFAULT_CONFIG as unknown as Record<string, unknown>)[key],
    value,
    key,
  );
}

/**
 * {@link coercePixelLength} against a shipped default supplied directly.
 *
 * Split out so the nested walk can pass the default it has already descended to, and
 * exported so the column-only options can reuse the *same* inference. Those keys are
 * absent from `DEFAULT_CONFIG` — they live in `COLUMN_DEFAULTS` — so {@link
 * coercePixelLength} looks them up as `undefined` and returns every value untouched.
 * Reusing this rather than repeating the test is what stops the two tables of lengths
 * from drifting apart.
 *
 * @param shippedDefault - The value this option ships with, at the same nesting level
 * @param value - Raw configured value, which YAML or the editor may have typed as a number
 * @param key - Top-level option name, where one applies. Only consulted for the options in
 *   {@link LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT}, whose default cannot mark them itself.
 * @returns The value, with a bare number turned into a pixel length and a missing one
 *   replaced by the shipped default, where appropriate
 */
export function coercePixelLengthAgainst(
  shippedDefault: unknown,
  value: unknown,
  key?: string,
): unknown {
  const lengthValued = isLengthValued(shippedDefault, key);

  // A blank YAML value — `day_separator_width:` with nothing after the colon — parses as
  // `null`, and a key written explicitly as `undefined` survives `setConfig`'s merge the
  // same way. Both mean "no value supplied", so a length-valued option has to
  // fall back to what it ships with. This mirrors the contract `toValidNumber` already
  // states for numeric options: empty editor values and `null` must not collapse an
  // option. Without it the `null` reaches `isZeroLength`, which calls `.trim()` on it and
  // throws a `TypeError` that takes the whole card down to a blank box.
  //
  // Deliberately narrow. An empty string, `NaN` and `Infinity` also reach here and are
  // pinned as pass-through by `tests/pixel-length-coercion.test.ts`: none of them throws,
  // and substituting a default for them would replace a dead rule with a guess.
  if (value === null || value === undefined) {
    return lengthValued ? shippedDefault : value;
  }

  const bare = bareNumber(value);
  if (bare === undefined) {
    return value;
  }

  return lengthValued ? `${bare}px` : value;
}

/**
 * Length-valued options whose shipped default cannot mark them as such.
 *
 * Inferring length-ness from the default is right for almost every option and is what
 * keeps this from being a list somebody has to remember to update — but it can only work
 * when the default *is* a pixel length. These five ship something else, so the inference
 * reads them as ordinary strings and returns every value untouched:
 *
 * | Option                | Ships          | Why it is not a pixel length          |
 * | --------------------- | -------------- | ------------------------------------- |
 * | `title_font_size`     | `undefined`    | unset means "inherit the HA card size" |
 * | `progress_bar_width`  | `undefined`    | unset means "per placement" — 60px in list view, 80% in column |
 * | `progress_bar_height` | `calc(…)`      | derived from the time font size       |
 * | `height`              | `'auto'`       | a CSS keyword                         |
 * | `max_height`          | `'none'`       | a CSS keyword                         |
 *
 * All five reach CSS where a length is expected, so a bare number breaks them exactly as
 * it breaks `day_spacing`: `font-size: var(--calendar-card-font-size-title, …)` given a
 * unitless `24` **substitutes** rather than falling back, so the declaration goes invalid
 * at computed-value time and the title silently drops to its inherited size — worse than
 * never setting the option. Three of the five are free-text fields in the visual editor,
 * where typing `24` is the natural thing to do.
 *
 * `today_indicator_position` is deliberately absent. It ships `'15% 50%'`, which is a
 * background-position *pair* rather than a length, so a bare number there is genuinely
 * ambiguous — `20` could mean `20%` or `20px`, and it is parsed by
 * `parseIndicatorPosition` rather than handed to CSS. Appending a unit would be a guess.
 *
 * Only consulted at the top level of the walk, so a nested key that happens to share one
 * of these names cannot pick up the exception by accident.
 */
export const LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT: ReadonlySet<string> = new Set([
  'title_font_size',
  'progress_bar_width',
  'progress_bar_height',
  'height',
  'max_height',
]);

/**
 * Whether an option takes a CSS length.
 *
 * The single place the inference lives, so the bare-number coercion and the missing-value
 * fallback above read the same answer and cannot drift apart.
 *
 * @param shippedDefault - The value an option ships with
 * @param key - Top-level option name, where one applies
 * @returns `true` when the option takes a CSS length
 */
function isLengthValued(shippedDefault: unknown, key?: string): boolean {
  return (
    isPixelLengthDefault(shippedDefault) ||
    (key !== undefined && LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT.has(key))
  );
}

/**
 * Whether a shipped default marks its option as length-valued.
 *
 * The primary half of the inference, covering every option that ships a pixel length —
 * which is nearly all of them. {@link isLengthValued} pairs it with the named exceptions.
 *
 * @param shippedDefault - The value an option ships with
 * @returns `true` when the default is a plain pixel length
 */
function isPixelLengthDefault(shippedDefault: unknown): boolean {
  return typeof shippedDefault === 'string' && /^-?\d+(?:\.\d+)?px$/.test(shippedDefault);
}

/**
 * The numeric text of a value that carries a number and no unit, in either form config
 * arrives in: a YAML-typed number, or the string a visual-editor text field hands back.
 *
 * There is no valid unitless CSS length, so a value matching this is already broken
 * wherever a length is expected — which is what makes appending `px` safe rather than a
 * guess. Surrounding whitespace is tolerated for the same reason: `' 10 '` cannot mean
 * anything else either.
 *
 * @param value - Raw configured value
 * @returns Its numeric text, or `undefined` when it carries no bare number
 */
function bareNumber(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}` : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return /^-?\d+(?:\.\d+)?$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Applies {@link coercePixelLength} across every option, including nested groups.
 *
 * The walk descends `config` and `DEFAULT_CONFIG` **together**, which is what lets it
 * reach nested groups. Both structures carry the same nesting, so their values can be
 * compared in step.
 *
 * Descent requires a plain object on **both** sides. That excludes arrays — `entities` has
 * no per-index shipped default to descend into, so walking it could only do harm — and it
 * excludes any key the defaults do not describe, such as the `column:` block, whose own
 * keys are coerced during view resolution instead. Neither kind of key the block holds
 * reaches this walk, and the two are coerced by different resolvers against different
 * tables: `resolveEffectiveConfig` hoists the ones that override a top-level option and
 * coerces them against `DEFAULT_CONFIG`, while the column-only keys are coerced on read
 * by `resolveColumnOption` against `COLUMN_DEFAULTS`.
 *
 * **Nested groups are copied, never written through.** Home Assistant hands cards a frozen
 * configuration. `mergeConfig` rebuilds any block the user also wrote, so those are safe to
 * touch — but a block the user did not mention is still `DEFAULT_CONFIG`'s own object by
 * reference, and writing into that would edit the defaults for every card in the process.
 * Rebuilding changed groups covers both cases without having to tell them apart.
 *
 * @param config - Configuration to normalize in place
 * @returns The same object, for chaining alongside `normalizeNumericOptions`
 */
export function normalizeLengthOptions(config: Types.Config): Types.Config {
  coerceLengthsAgainst(
    config as unknown as Record<string, unknown>,
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    true,
  );

  return config;
}

/**
 * Recursive half of {@link normalizeLengthOptions}.
 *
 * Writes only changed values. Nested callers use the return value to attach rebuilt
 * objects only when needed.
 *
 * @param target - Configuration level to normalize in place
 * @param defaults - The matching level of `DEFAULT_CONFIG`
 * @param topLevel - Whether this is the outermost level, where option names are the ones
 *   {@link LENGTH_OPTIONS_WITHOUT_PIXEL_DEFAULT} names
 * @returns Whether anything at or below this level changed
 */
function coerceLengthsAgainst(
  target: Record<string, unknown>,
  defaults: Record<string, unknown>,
  topLevel = false,
): boolean {
  let changed = false;

  for (const key of Object.keys(target)) {
    const value = target[key];
    const shipped = defaults[key];

    if (isPlainObject(value) && isPlainObject(shipped)) {
      const rebuilt = { ...value };

      if (coerceLengthsAgainst(rebuilt, shipped)) {
        target[key] = rebuilt;
        changed = true;
      }

      continue;
    }

    const coerced = coercePixelLengthAgainst(shipped, value, topLevel ? key : undefined);

    if (coerced !== value) {
      target[key] = coerced;
      changed = true;
    }
  }

  return changed;
}

/**
 * Whether a value is a plain object, i.e. something with named keys to descend into.
 *
 * @param value - Value to test
 * @returns `true` for a non-null, non-array object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalizes entity configuration to ensure consistent format. */
export function normalizeEntities(
  entities: Array<
    | string
    | {
        entity: string;
        label?: string;
        label_type?: string;
        color?: string;
        accent_color?: string;
        label_icon_color?: string;
        show_time?: boolean;
        show_location?: boolean;
        location_icon?: string;
        show_description?: boolean;
        compact_events_to_show?: number;
        blocklist?: string;
        allowlist?: string;
        filter_field?: Types.FilterField;
        replace_field?: Types.ReplaceField;
        replace_pattern?: string;
        replace_with?: string;
        split_multiday_events?: boolean;
        event_type?: Types.EventType;
        days_of_week?: Types.DaysOfWeekFilter;
        allday_expires_at?: string;
      }
  >,
): Array<Types.EntityConfig> {
  if (!Array.isArray(entities)) {
    return [];
  }

  return entities
    .map((item) => {
      if (typeof item === 'string') {
        return {
          entity: item,
          color: undefined,
          accent_color: undefined,
          label_icon_color: undefined,
        };
      }
      // Let malformed YAML entries reach the `.filter(Boolean)` instead of throwing.
      if (item && typeof item === 'object' && item.entity) {
        return {
          entity: item.entity,
          label: item.label,
          // Unknown label types fall back to the legacy value-label behavior.
          label_type: Helpers.isLabelType(item.label_type) ? item.label_type : undefined,
          color: item.color || undefined,
          accent_color: item.accent_color || undefined,
          label_icon_color: item.label_icon_color || undefined,
          show_time: item.show_time,
          show_location: item.show_location,
          location_icon: item.location_icon || undefined,
          show_description: item.show_description,
          compact_events_to_show: toValidNumber(item.compact_events_to_show, 0),
          blocklist: item.blocklist,
          allowlist: item.allowlist,
          filter_field: item.filter_field,
          // 🚨 This projection is a hand-written field list, and a per-calendar option
          // left out of it is **dropped before it reaches anything** — normalization runs
          // in `setConfig`, so the key never lands in `_matchedConfig` and the option is
          // inert however carefully the rest of it was wired. Silent, too: nothing in the
          // editor, the schema or the types can see it. `serializeEntities` below is
          // field-agnostic precisely to avoid this shape, and it does not protect this
          // list. `tests/entity-config-reprocess.test.ts` reconciles the whole set against
          // `EntityConfig` and is what catches an omission here.
          replace_field: item.replace_field,
          replace_pattern: item.replace_pattern,
          replace_with: item.replace_with,
          split_multiday_events: item.split_multiday_events,
          event_type: item.event_type,
          days_of_week: item.days_of_week,
          allday_expires_at: item.allday_expires_at,
        };
      }
      return null;
    })
    .filter(Boolean) as Array<Types.EntityConfig>;
}

/**
 * Serialize an entity list so two lists can be compared without naming their fields.
 *
 * Key order is normalized because the same YAML can reach us with its keys in any order,
 * but element order is deliberately preserved: listing one calendar twice with different
 * filters is a supported pattern, and those copies are processed independently.
 *
 * Being field-agnostic is the point. A hand-written field list would silently stop
 * covering the next per-calendar option somebody adds.
 *
 * @param entities Entity list, normalized or raw
 * @returns Stable string that changes if and only if some entity field changes
 */
function serializeEntities(entities: Array<string | Types.EntityConfig> | undefined): string {
  return JSON.stringify(
    (entities || []).map((item) => {
      const entity = typeof item === 'string' ? { entity: item } : item;
      const record = entity as unknown as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]);
    }),
  );
}

/**
 * Top-level options read while events are **processed**, not while they are rendered.
 *
 * 🚨 Registering a key here is what makes a card-level change to it take effect. The
 * distinction is not "is this option also per-calendar" — `show_time`, `show_location`
 * and `split_multiday_events` are all of those and none belongs here, because they are
 * applied at render time from the `_matchedConfig` stamp and so need no reprocessing.
 * What matters is *when the value is read*: an option consulted inside `processEvents`
 * is baked into `this.events`, and a later edit to it cannot reach the screen until the
 * payload is run through processing again.
 *
 * Forgetting this registration is silent — the card keeps rendering the previous
 * filter until the next scheduled refresh, a reload, or an unrelated entity edit.
 * `tests/entity-config-reprocess.test.ts` scans the filter path's source and fails if a
 * key is read there without being listed here.
 */
export const PROCESSING_TIME_KEYS: ReadonlyArray<keyof Types.Config> = ['event_type'];

/**
 * Determine if per-calendar configuration changed without moving the fetch window.
 *
 * Per-calendar options are not applied at render time — they are stamped onto each event
 * as `_matchedConfig` during processing, which happens only on the fetch path, and the
 * readers prefer that stamp over the live config. So an edit to a label, a color or a
 * filter needs the raw payload reprocessed even though the API request is unchanged.
 *
 * The same is true of the card-level half of a processing-time option, which is why
 * {@link PROCESSING_TIME_KEYS} is consulted here as well as the entity list. Only the
 * entity list was compared until `event_type` arrived, so a card-wide filter change
 * reprocessed nothing at all.
 *
 * Callers should reprocess rather than refetch: neither the event cache key nor the
 * instance ID contains anything but entity IDs, so the cached payload is still valid.
 *
 * @param previous Previous configuration
 * @param current Current configuration
 * @returns True when the entity list or a processing-time option changed
 */
export function hasEntityProcessingChanged(
  previous: Partial<Types.Config> | undefined,
  current: Types.Config,
): boolean {
  if (!previous || Object.keys(previous).length === 0) {
    return false;
  }

  if (serializeEntities(previous.entities) !== serializeEntities(current.entities)) {
    return true;
  }

  return PROCESSING_TIME_KEYS.some((key) => previous[key] !== current[key]);
}

/**
 * Determine if configuration changes affect data retrieval
 */
export function hasConfigChanged(
  previous: Partial<Types.Config> | undefined,
  current: Types.Config,
): boolean {
  if (!previous || Object.keys(previous).length === 0) {
    return true;
  }

  // Entity colors are styling only and do not require an API data refresh.
  const previousEntityIds = (previous.entities || [])
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join(',');

  const currentEntityIds = (current.entities || [])
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join(',');

  const refreshIntervalChanged = previous?.refresh_interval !== current?.refresh_interval;

  const dataChanged =
    previousEntityIds !== currentEntityIds ||
    previous.days_to_show !== current.days_to_show ||
    previous.start_date !== current.start_date ||
    // Deliberately unconditional, and deliberately inconsistent with the exclusions
    // below. `first_day_of_week` only moves the fetch window when `start_date` is
    // week-relative; with an absolute date — or with none at all, which is the
    // default — `getTimeWindow` returns a byte-identical window, so the refresh it
    // triggers is waste by the very standard those exclusions set. It is kept anyway:
    // narrowing it means re-deriving "is this start date week-relative" here, and a
    // wrong predicate serves a stale window rather than merely re-fetching a fresh
    // one. One avoidable request is the cheaper failure. Do not narrow this without
    // `getBaseCacheKey` (`src/utils/events.ts`) and `generateDeterministicId`
    // (`src/utils/helpers.ts`) in view — both were made weekday-aware to close real
    // staleness bugs, so this is the conservative end of a settled trade-off.
    previous.first_day_of_week !== current.first_day_of_week;

  // `show_past_events` and `filter_duplicates` are deliberately absent. Both are
  // applied inside `groupEventsByDay`, which runs from an unmemoized getter on every
  // render, so a new config object is all either one needs. Neither reaches
  // `getTimeWindow`, so toggling one produced a byte-identical Home Assistant request
  // — the refresh spent a network round-trip and a loading state to re-fetch data the
  // cache already held. See `src/config/view.ts` (render-side filter classification).

  if (dataChanged || refreshIntervalChanged) {
    Logger.debug('Configuration change requires data refresh');
  }

  return dataChanged || refreshIntervalChanged;
}

//-----------------------------------------------------------------------------
// INITIALIZATION HELPERS
//-----------------------------------------------------------------------------

// Finds a calendar entity in common Home Assistant state shapes.
export function findCalendarEntity(hass: Record<string, { state: string }>): string | null {
  if (!hass || typeof hass !== 'object') {
    return null;
  }

  if ('states' in hass && typeof hass.states === 'object') {
    const stateKeys = Object.keys(hass.states);
    const calendarInStates = stateKeys.find((key) => key.startsWith('calendar.'));
    if (calendarInStates) {
      return calendarInStates;
    }
  }

  return Object.keys(hass).find((entityId) => entityId.startsWith('calendar.')) || null;
}

/**
 * Grid layout hint attached to the card picker suggestion.
 *
 * Full width avoids cramped text wrapping in the picker. `'auto'` leaves height to
 * the fetched content instead of pinning a fixed row count.
 */
const SUGGESTION_GRID_OPTIONS = {
  columns: 'full',
  rows: 'auto',
};

/**
 * The label distinguishing the column-layout suggestion from the list one.
 *
 * Home Assistant renders a suggestion's heading as `${cardName} - ${label}`,
 * taking `cardName` from our `window.customCards` entry. Deliberately untranslated:
 * custom card labels are passed through verbatim, and this runs outside the lazy
 * editor bundle.
 */
const SUGGESTION_COLUMN_LABEL = 'Columns';

/**
 * Build the opinionated starting configuration for a set of calendar entities.
 *
 * Shared by the card picker preview (`getStubConfig`) and the entity suggestion so
 * the two recipes cannot drift apart. Entities are emitted in the simplest valid
 * form — a plain array of entity IDs — rather than the object form used for
 * per-calendar styling.
 *
 * The `-dev` suffix must stay a plain string literal; the build rewrites that exact
 * literal to the production element name.
 *
 * @param entities - Calendar entity IDs to pre-fill
 * @returns A ready-to-use card configuration
 */
function buildDefaultCardConfig(entities: ReadonlyArray<string>): Record<string, unknown> {
  return {
    type: 'custom:calendar-card-pro-dev',
    entities: [...entities],
    days_to_show: 3,
    show_location: true,
  };
}

/** Generates a stub configuration for the card editor. */
export function getStubConfig(hass: Record<string, { state: string }>): Record<string, unknown> {
  const calendarEntity = findCalendarEntity(hass);
  return {
    ...buildDefaultCardConfig(calendarEntity ? [calendarEntity] : []),
    _description: !calendarEntity
      ? 'A calendar card that displays events from multiple calendars with individual styling. Add a calendar integration to Home Assistant to use this card.'
      : undefined,
  };
}

/**
 * Offer this card for an entity picked in the Home Assistant card picker.
 *
 * Home Assistant (2026.6+) calls this synchronously for every entity a user
 * selects. The body is deliberately trivial and total: every input is treated as
 * untrusted, nothing is assumed about the shape of `hass`, and anything
 * unexpected returns `null` (never an empty array).
 *
 * The domain check is the whole filter. A calendar entity carries no capability
 * signal worth testing: there is no meaningful device class, no relevant
 * `supported_features`, and its state only reports whether an event is currently
 * running, which says nothing about whether this card suits it.
 *
 * The two configs differ only by `view`, so they share the same event-cache key.
 * Changing fetch-affecting options in the column suggestion would make each picker
 * preview issue its own calendar request.
 *
 * The column preview renders as columns rather than falling back to a list,
 * because `hui-card` sets `preview` on the element it mounts and `effectiveView`
 * returns the requested view whenever that flag is set.
 *
 * @param hass - Home Assistant instance, treated as possibly absent or malformed
 * @param entityId - Entity ID selected in the card picker
 * @returns A two-entry suggestion list, or `null` when nothing should be offered
 */
export function getEntitySuggestion(
  hass: Types.Hass | null | undefined,
  entityId: string,
): Types.EntitySuggestion[] | null {
  if (typeof entityId !== 'string' || entityId.split('.')[0] !== 'calendar') {
    return null;
  }

  if (!hass || typeof hass !== 'object') {
    return null;
  }

  const states = hass.states;
  if (!states || typeof states !== 'object' || !states[entityId]) {
    return null;
  }

  return [
    {
      config: {
        ...buildDefaultCardConfig([entityId]),
        grid_options: { ...SUGGESTION_GRID_OPTIONS },
      },
    },
    {
      label: SUGGESTION_COLUMN_LABEL,
      config: {
        ...buildDefaultCardConfig([entityId]),
        view: 'column',
        grid_options: { ...SUGGESTION_GRID_OPTIONS },
      },
    },
  ];
}

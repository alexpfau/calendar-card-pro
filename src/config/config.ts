/**
 * Configuration module for Calendar Card Pro
 */

import * as Constants from './constants';
import * as Types from './types';
import * as Logger from '../utils/logger';

//-----------------------------------------------------------------------------
// CORE CONFIGURATION
//-----------------------------------------------------------------------------

/**
 * Default configuration for Calendar Card Pro
 */
export const DEFAULT_CONFIG: Types.Config = {
  // Core settings
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
  split_multiday_events: false,
  language: undefined,

  // Header
  title: undefined,
  title_font_size: undefined,
  title_color: undefined,

  // Layout and spacing
  background_color: 'var(--ha-card-background)',
  accent_color: '#03a9f4',
  vertical_line_width: '2px',
  day_spacing: '10px',
  event_spacing: '4px',
  additional_card_spacing: '0px',
  height: 'auto',
  max_height: 'none',

  // Week numbers and horizontal separators
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

  // Today indicator
  today_indicator: false,
  today_indicator_position: '15% 50%',
  today_indicator_color: '#03a9f4',
  today_indicator_size: '6px',

  // Date column
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

  // Event column
  event_background_opacity: 0,
  show_past_events: false,
  show_countdown: false,
  show_countdown_allday: true,
  show_progress_bar: false,
  progress_bar_color: 'var(--secondary-text-color)',
  progress_bar_height: 'calc(var(--calendar-card-font-size-time) * 0.75)',
  progress_bar_width: '60px',
  event_icon_vertical_alignment: 'middle',
  event_font_size: '14px',
  event_color: 'var(--primary-text-color)',
  empty_day_color: 'var(--primary-text-color)',
  show_time: true,
  show_single_allday_time: true,
  time_24h: 'system',
  time_two_digit_hours: false,
  show_end_time: true,
  time_font_size: '12px',
  time_color: 'var(--secondary-text-color)',
  time_icon_size: '14px',
  time_max_lines: 0,
  show_location: true,
  remove_location_country: false,
  location_font_size: '12px',
  location_color: 'var(--secondary-text-color)',
  location_icon_size: '14px',
  location_max_lines: 0,
  show_description: false,
  title_max_lines: 0,
  description_max_lines: 0,
  description_font_size: '12px',
  description_color: 'var(--secondary-text-color)',
  description_icon_size: '14px',

  // Weather
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
      color: 'var(--primary-text-color)',
    },
    event: {
      show_conditions: true,
      show_temp: true,
      show_uv_index: false,
      uv_index_threshold: 0,
      daily_forecast_fallback: true,
      icon_size: '14px',
      font_size: '12px',
      color: 'var(--primary-text-color)',
    },
  },

  // Actions
  tap_action: { action: 'none' },
  hold_action: { action: 'none' },

  // Cache and refresh settings
  refresh_interval: Constants.CACHE.DEFAULT_DATA_REFRESH_MINUTES,
  refresh_on_navigate: true,

  // Column view
  //
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
  min_day_column_width_px: 140,
  column: undefined,
};

//-----------------------------------------------------------------------------
// CONFIGURATION UTILITIES
//-----------------------------------------------------------------------------

/**
 * Coerces a raw configuration value into a usable number.
 *
 * The visual editor persists an empty string when a numeric field is cleared, and
 * hand-written YAML can supply `null` or non-numeric text. Such values pass the
 * `!== undefined` guards used throughout the card but then coerce to `0` in numeric
 * comparisons, silently suppressing events or entire days (issue #327).
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

/**
 * Sanitizes every numeric option so invalid values fall back to their defaults.
 *
 * Applied on each `setConfig` call, which means configurations already saved with an
 * empty value recover automatically without the user having to edit them again.
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
  config.min_day_column_width_px =
    toValidNumber(config.min_day_column_width_px, 1) ?? DEFAULT_CONFIG.min_day_column_width_px;

  // Optional limits: `undefined` means "no limit", so invalid values clear them rather
  // than collapsing to zero and hiding content.
  config.compact_days_to_show = toValidNumber(config.compact_days_to_show, 1);
  config.compact_events_to_show = toValidNumber(config.compact_events_to_show, 0);

  return config;
}

/**
 * Normalizes entity configuration to ensure consistent format
 */
export function normalizeEntities(
  entities: Array<
    | string
    | {
        entity: string;
        label?: string;
        color?: string;
        accent_color?: string;
        label_icon_color?: string;
        show_time?: boolean;
        show_location?: boolean;
        show_description?: boolean;
        compact_events_to_show?: number;
        blocklist?: string;
        allowlist?: string;
        split_multiday_events?: boolean;
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
      // `typeof null === 'object'`, so a bare `-` list item in YAML — which parses
      // as null — would reach `item.entity` and throw, taking down setConfig and
      // with it the whole card. The `.filter(Boolean)` below already intends to
      // drop malformed entries; this guard lets them reach it.
      if (item && typeof item === 'object' && item.entity) {
        return {
          entity: item.entity,
          label: item.label,
          color: item.color || undefined,
          accent_color: item.accent_color || undefined,
          label_icon_color: item.label_icon_color || undefined,
          show_time: item.show_time,
          show_location: item.show_location,
          show_description: item.show_description,
          compact_events_to_show: toValidNumber(item.compact_events_to_show, 0),
          blocklist: item.blocklist,
          allowlist: item.allowlist,
          split_multiday_events: item.split_multiday_events,
        };
      }
      return null;
    })
    .filter(Boolean) as Array<Types.EntityConfig>;
}

/**
 * Determine if configuration changes affect data retrieval
 */
export function hasConfigChanged(
  previous: Partial<Types.Config> | undefined,
  current: Types.Config,
): boolean {
  // Handle empty/undefined config
  if (!previous || Object.keys(previous).length === 0) {
    return true;
  }

  // Extract entity IDs without colors for comparison - entity colors are styling only
  // and don't require API data refresh
  const previousEntityIds = (previous.entities || [])
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join(',');

  const currentEntityIds = (current.entities || [])
    .map((e) => (typeof e === 'string' ? e : e.entity))
    .sort()
    .join(',');

  // Check refresh interval separately (it affects both timers and cache now)
  const refreshIntervalChanged = previous?.refresh_interval !== current?.refresh_interval;

  // Check if core data-affecting properties changed
  const dataChanged =
    previousEntityIds !== currentEntityIds ||
    previous.days_to_show !== current.days_to_show ||
    previous.start_date !== current.start_date ||
    previous.show_past_events !== current.show_past_events ||
    previous.filter_duplicates !== current.filter_duplicates;

  if (dataChanged || refreshIntervalChanged) {
    Logger.debug('Configuration change requires data refresh');
  }

  return dataChanged || refreshIntervalChanged;
}

/**
 * Check if entity colors have changed in the configuration
 * This is used to determine if a re-render (but not data refresh) is needed
 *
 * @param previous - Previous configuration
 * @param current - New configuration
 * @returns True if entity colors have changed
 */
export function haveEntityColorsChanged(
  previous: Partial<Types.Config> | undefined,
  current: Types.Config,
): boolean {
  if (!previous || !previous.entities) return false;

  const prevEntities = previous.entities;
  const currEntities = current.entities;

  // If entity count changed, let other functions handle it
  if (prevEntities.length !== currEntities.length) return false;

  // Create a map of entity IDs to colors for previous config
  const prevColorMap = new Map<string, string>();
  prevEntities.forEach((entity) => {
    if (typeof entity === 'string') {
      prevColorMap.set(entity, 'var(--primary-text-color)');
    } else {
      prevColorMap.set(entity.entity, entity.color || 'var(--primary-text-color)');
    }
  });

  // Check if any entity colors changed in current config
  for (const entity of currEntities) {
    const entityId = typeof entity === 'string' ? entity : entity.entity;
    const color =
      typeof entity === 'string'
        ? 'var(--primary-text-color)'
        : entity.color || 'var(--primary-text-color)';

    if (!prevColorMap.has(entityId)) {
      // New entity, let other functions handle it
      continue;
    }

    // If color changed for an existing entity, return true
    if (prevColorMap.get(entityId) !== color) {
      Logger.debug(`Entity color changed for ${entityId}, will re-render`);
      return true;
    }
  }

  return false;
}

//-----------------------------------------------------------------------------
// INITIALIZATION HELPERS
//-----------------------------------------------------------------------------

/**
 * Find a calendar entity in Home Assistant states
 */
export function findCalendarEntity(hass: Record<string, { state: string }>): string | null {
  // No valid hass object provided
  if (!hass || typeof hass !== 'object') {
    return null;
  }

  // Check for entities in the states property (standard Home Assistant structure)
  if ('states' in hass && typeof hass.states === 'object') {
    const stateKeys = Object.keys(hass.states);
    const calendarInStates = stateKeys.find((key) => key.startsWith('calendar.'));
    if (calendarInStates) {
      return calendarInStates;
    }
  }

  // Check for entities at the top level (alternative structure)
  return Object.keys(hass).find((entityId) => entityId.startsWith('calendar.')) || null;
}

/**
 * Grid layout hint attached to the card picker suggestion.
 *
 * Full width, because this card is a text-heavy list: every row carries a date,
 * a title, a time and optionally a location. A section has a capped maximum
 * width, so half of one lands around 230-250px on any screen, and below roughly
 * 250px those fields wrap aggressively - a long location can spill over several
 * lines. That makes the card harder to read *and* taller than the full-width
 * equivalent showing the same events, so half width costs horizontal space
 * without buying anything back.
 *
 * The row count is deliberately left to the content. A numeric `rows` pins the
 * card to a fixed height rather than a minimum, and this card's height is not
 * knowable at suggestion time: `days_to_show` says nothing about how many events
 * fall in those days. A fixed height would leave dead space on a quiet calendar
 * and silently truncate a busy one. `'auto'` avoids both.
 *
 * These mirror the card's own `getGridOptions()`, so the suggestion asks for exactly
 * what a hand-added card gets by default. `columns` is the string `'full'`, not the
 * number 12: a section's grid is `12 * column_span` tracks wide, so 12 is one section
 * column's worth of width no matter how wide the section actually is, while `'full'`
 * fills it. They are stated explicitly rather than left out so the intent is legible
 * at the call site.
 */
const SUGGESTION_GRID_OPTIONS = {
  columns: 'full',
  rows: 'auto',
};

/**
 * Build the opinionated starting configuration for a set of calendar entities.
 *
 * Shared by the card picker preview (`getStubConfig`) and the entity suggestion so
 * the two recipes cannot drift apart. Entities are emitted in the simplest valid
 * form — a plain array of entity IDs — rather than the object form used for
 * per-calendar styling.
 *
 * The `-dev` suffix on the element name is intentional and must stay a plain
 * string literal: the build rewrites that exact literal to the production element
 * name, so a computed or pre-stripped name would break one of the two bundles.
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

/**
 * Generate a stub configuration for the card editor
 */
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
 * selects, and discards the entire community suggestion list — including entries
 * contributed by other custom cards — if any implementation throws. The body is
 * therefore deliberately trivial and total: every input is treated as untrusted,
 * nothing is assumed about the shape of `hass`, and anything unexpected returns
 * `null` (never an empty array).
 *
 * The domain check is the whole filter. A calendar entity carries no capability
 * signal worth testing: there is no meaningful device class, no relevant
 * `supported_features`, and its state only reports whether an event is currently
 * running, which says nothing about whether this card suits it.
 *
 * Exactly one suggestion is returned, unlabelled. The picker mounts every returned
 * suggestion as a live card without virtualization, and every live instance of
 * this card fetches calendar events on setup, so each extra variant would cost a
 * real calendar API request every time anyone picks a calendar entity.
 *
 * @param hass - Home Assistant instance, treated as possibly absent or malformed
 * @param entityId - Entity ID selected in the card picker
 * @returns A single-entry suggestion list, or `null` when nothing should be offered
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
  ];
}

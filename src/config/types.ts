/**
 * Type definitions for Calendar Card Pro
 *
 * This file contains all type definitions used throughout the Calendar Card Pro application.
 */

// -----------------------------------------------------------------------------
// CORE CONFIGURATION
// -----------------------------------------------------------------------------

/**
 * Main configuration interface for the card
 */
export interface Config {
  // Core settings
  entities: Array<string | EntityConfig>;
  view: EffectiveView;
  start_date?: string;
  days_to_show: number;
  compact_days_to_show?: number;
  compact_events_to_show?: number;
  compact_events_complete_days?: boolean;
  show_empty_days: boolean;
  hide_when_empty: boolean;
  empty_day_text?: string;
  filter_duplicates: boolean;
  split_multiday_events: boolean;
  language?: string;

  // Header
  title?: string;
  title_font_size?: string;
  title_color?: string;

  // Layout and spacing
  background_color: string;
  accent_color: string;
  vertical_line_width: string;
  day_spacing: string;
  event_spacing: string;
  additional_card_spacing: string;
  max_height: string;
  height: string;

  // Week numbers and horizontal separators
  first_day_of_week: 'sunday' | 'monday' | 'system';
  show_week_numbers: null | 'iso' | 'simple';
  show_current_week_number: boolean;
  week_number_font_size: string;
  week_number_color: string;
  week_number_background_color: string;
  day_separator_width: string;
  day_separator_color: string;
  week_separator_width: string;
  week_separator_color: string;
  month_separator_width: string;
  month_separator_color: string;

  // Today indicator
  today_indicator: string | boolean;
  today_indicator_position: string;
  today_indicator_color: string;
  today_indicator_size: string;

  // Date column
  date_vertical_alignment: string;
  weekday_font_size: string;
  weekday_color: string;
  day_font_size: string;
  day_color: string;
  show_month: boolean;
  month_font_size: string;
  month_color: string;
  weekend_weekday_color?: string;
  weekend_day_color?: string;
  weekend_month_color?: string;
  today_weekday_color?: string;
  today_day_color?: string;
  today_month_color?: string;

  // Event column
  event_background_opacity: number;
  show_past_events: boolean;
  show_countdown: boolean;
  show_countdown_allday: boolean;
  show_progress_bar: boolean;
  progress_bar_color: string;
  progress_bar_height: string;
  progress_bar_width: string;
  event_icon_vertical_alignment: string;
  event_font_size: string;
  event_color: string;
  empty_day_color: string;
  show_time: boolean;
  show_single_allday_time: boolean;
  time_24h: boolean | 'system';
  time_two_digit_hours: boolean;
  show_end_time: boolean;
  time_font_size: string;
  time_color: string;
  time_icon_size: string;
  time_max_lines: number;
  show_location: boolean;
  remove_location_country: boolean | string;
  location_font_size: string;
  location_color: string;
  location_icon_size: string;
  location_max_lines: number;
  show_description: boolean;
  title_max_lines: number;
  description_max_lines: number;
  description_font_size: string;
  description_color: string;
  description_icon_size: string;

  // Weather
  weather?: WeatherConfig;

  // Actions
  tap_action: ActionConfig;
  hold_action: ActionConfig;

  // Cache and refresh settings
  refresh_interval: number;
  refresh_on_navigate: boolean;

  // Column view
  min_day_column_width_px: number;
  column?: ColumnOverrides;
}

/**
 * Views the card can render.
 *
 * Two values only. There is no `auto`: the narrow-viewport fallback belongs to
 * `column` itself, so it is a behaviour of that view rather than a third mode.
 */
export type EffectiveView = 'list' | 'column';

/**
 * Per-view configuration overrides applied when the card renders in column view.
 *
 * Shape follows the `WeatherConfig` precedent — one option family, two rendering
 * contexts, configured separately. The resolution semantics deliberately do **not**:
 * an override is applied when the key is *present*, so `show_location: false`
 * against a top-level `true` suppresses the location, and `show_location: true`
 * against a top-level `false` restores it. Reading with `!== false` or `=== true`
 * would conflate "not set" with "set to false" and break exactly the case this
 * block exists to express.
 *
 * Membership is narrow by design. Only render-time and grouping-time options
 * appear here: an option that influences the Home Assistant fetch window would
 * trigger an API call every time the viewport crossed the column/list breakpoint.
 * That is why `days_to_show`, `start_date`, `first_day_of_week`, `entities`,
 * `show_past_events`, `filter_duplicates`, `weather.position`, `refresh_interval`
 * and `refresh_on_navigate` are absent and can never be added.
 *
 * @see resolveViewOption in `src/config/view.ts`
 */
export interface ColumnOverrides {
  // Day grouping and empty days
  show_empty_days?: boolean;
  empty_day_text?: string;

  // Layout and spacing
  vertical_line_width?: string;
  event_spacing?: string;
  day_spacing?: string;
  additional_card_spacing?: string;
  height?: string;
  max_height?: string;

  // Today indicator
  today_indicator?: string | boolean;
  today_indicator_size?: string;

  // Date column
  weekday_font_size?: string;
  day_font_size?: string;
  show_month?: boolean;
  month_font_size?: string;

  // Event column
  event_background_opacity?: number;
  event_font_size?: string;
  show_countdown?: boolean;
  show_countdown_allday?: boolean;
  show_progress_bar?: boolean;
  progress_bar_height?: string;
  progress_bar_width?: string;
  event_icon_vertical_alignment?: string;
  show_time?: boolean;
  show_single_allday_time?: boolean;
  time_two_digit_hours?: boolean;
  show_end_time?: boolean;
  time_font_size?: string;
  time_icon_size?: string;
  time_max_lines?: number;
  show_location?: boolean;
  remove_location_country?: boolean | string;
  location_font_size?: string;
  location_icon_size?: string;
  location_max_lines?: number;
  show_description?: boolean;
  title_max_lines?: number;
  description_max_lines?: number;
  description_font_size?: string;
  description_icon_size?: string;
  show_week_numbers?: null | 'iso' | 'simple';
  show_current_week_number?: boolean;
  week_number_font_size?: string;
  week_number_color?: string;
  week_number_background_color?: string;

  // Separators between days
  //
  // These keep their top-level names because they keep their meaning: the rule that
  // divides one day from the next. Only its axis rotates, from a horizontal rule
  // between stacked days to a vertical rule between side-by-side columns. A width
  // that reads well as a horizontal rule can read heavily as a full-height vertical
  // one, which is exactly the case the override block exists for.
  day_separator_width?: string;
  day_separator_color?: string;
  week_separator_width?: string;
  week_separator_color?: string;
  month_separator_width?: string;
  month_separator_color?: string;

  // Column-only layout — Category C
  //
  // These have no top-level counterpart, so they are not overrides and do not
  // participate in inheritance: there is nothing above them to inherit from. They
  // live here because `column:` is where column-only configuration belongs, not
  // because they behave like the keys above.
  //
  // `resolveViewOption` excludes them structurally rather than by convention — its
  // key parameter is constrained to `keyof ColumnOverrides & keyof Config`, and none
  // of these is a `Config` key, so passing one is a compile error rather than a
  // silent `undefined`. Read them with `resolveColumnOption`, which owns their
  // defaults.
  day_header_gap?: string;
  day_header_separator_width?: string;
  day_header_separator_color?: string;
}

/**
 * Calendar entity configuration
 */
export interface EntityConfig {
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

/**
 * Weather position-specific styling configuration
 */
export interface WeatherPositionConfig {
  show_conditions?: boolean;
  show_high_temp?: boolean;
  show_low_temp?: boolean;
  show_temp?: boolean;
  show_uv_index?: boolean;
  uv_index_threshold?: number;
  daily_forecast_fallback?: boolean;
  icon_size?: string;
  font_size?: string;
  color?: string;
}

/**
 * Weather configuration
 */
export interface WeatherConfig {
  entity?: string;
  position?: 'date' | 'event' | 'both';
  date?: WeatherPositionConfig;
  event?: WeatherPositionConfig;
}

/**
 * Raw weather forecast data from Home Assistant
 */
export interface WeatherForecast {
  datetime: string;
  condition: string;
  temperature: number;
  templow?: number;
  precipitation?: number;
  precipitation_probability?: number;
  wind_speed?: number;
  wind_bearing?: number;
  humidity?: number;
  uv_index?: number;
}

/**
 * Processed weather data for use in templates
 */
export interface WeatherData {
  icon: string;
  condition: string;
  temperature: string | number;
  templow?: string | number;
  uv_index?: number;
  datetime: string;
  hour?: number;
  precipitation?: number;
  precipitation_probability?: number;
}

/**
 * Weather forecasts organized by type and date/time
 */
export interface WeatherForecasts {
  daily?: Record<string, WeatherData>;
  hourly?: Record<string, WeatherData>;
}

// -----------------------------------------------------------------------------
// CALENDAR DATA STRUCTURES
// -----------------------------------------------------------------------------

/**
 * Calendar event data structure
 */
export interface CalendarEventData {
  readonly start: { readonly dateTime?: string; readonly date?: string };
  readonly end: { readonly dateTime?: string; readonly date?: string };
  summary?: string;
  location?: string;
  description?: string;
  _entityId?: string;
  _entityLabel?: string;
  _isEmptyDay?: boolean;
  /**
   * Set when an empty-day placeholder shows a user-supplied string
   * (`empty_day_text`) rather than the translated default. Only used to
   * suppress the checkmark prefix at render time.
   *
   * This never affects `visibleEventCount`, which filters on `_isEmptyDay`.
   */
  _isCustomEmptyText?: boolean;
  _matchedConfig?: EntityConfig;
  time?: string;
}

/**
 * Result of a calendar fetch, including which entities failed.
 *
 * Per-entity fetch errors are tolerated so that one broken calendar cannot
 * blank out the others, which means an empty `events` array on its own is
 * ambiguous — it is either a genuinely empty calendar or a failed request.
 * `failedEntities` is what lets callers tell those two apart.
 */
export interface EventFetchResult {
  events: CalendarEventData[];
  /** Entity IDs whose calendar could not be retrieved during this fetch. */
  failedEntities: string[];
}

/**
 * Grouped events by day
 */
export interface EventsByDay {
  weekday: string;
  day: number;
  month: string;
  timestamp: number;
  events: CalendarEventData[];
  weekNumber?: number | null; // Changed from number | undefined to number | null
  isFirstDayOfWeek?: boolean;
  isFirstDayOfMonth?: boolean;
  monthNumber?: number;
}

/**
 * Cache entry structure
 */
export interface CacheEntry {
  events: CalendarEventData[];
  timestamp: number;
  ttlMs?: number;
}

// -----------------------------------------------------------------------------
// USER INTERACTION
// -----------------------------------------------------------------------------

/**
 * Action configuration for tap and hold actions
 */
export interface ActionConfig {
  action: string;
  navigation_path?: string;
  service?: string;
  service_data?: object;
  url_path?: string;
  open_tab?: string;
}

// -----------------------------------------------------------------------------
// HOME ASSISTANT INTEGRATION
// -----------------------------------------------------------------------------

/**
 * Home Assistant interface
 */
export interface Hass {
  states: Record<string, { state: string }>;
  callApi: (method: string, path: string, parameters?: object) => Promise<unknown>;
  callService: (domain: string, service: string, serviceData?: object) => void;
  locale?: {
    language: string;
    time_format?: string;
  };
  connection?: {
    subscribeEvents: (callback: (event: unknown) => void, eventType: string) => Promise<() => void>;
    subscribeMessage: <T = WeatherForecastMessage>(
      callback: (message: T) => void,
      options: SubscribeMessageOptions,
    ) => Promise<() => void>;
  };
  formatEntityState?: (stateObj: HassEntity, state: string) => string;
}

/**
 * Weather forecast message structure received from Home Assistant
 */
export interface WeatherForecastMessage {
  forecast: WeatherForecast[];
  forecast_type?: string;
  [key: string]: unknown;
}

/**
 * Home Assistant subscribe message options
 */
export interface SubscribeMessageOptions {
  type: string;
  /** Required by `weather/subscribe_forecast`, absent from `render_template`. */
  entity_id?: string;
  forecast_type?: string;
  [key: string]: unknown;
}

/**
 * Successful `render_template` result pushed by Home Assistant.
 *
 * `result` is not necessarily a string: Home Assistant renders templates with
 * native type parsing enabled, so `{{ 1 + 1 }}` arrives as the number `2`.
 *
 * `listeners.time` is true for templates that depend on the current time (for
 * example `now()`), which Home Assistant re-renders on its own timer.
 */
export interface RenderTemplateResult {
  result: unknown;
  listeners?: {
    all: boolean;
    domains: string[];
    entities: string[];
    time: boolean;
  };
}

/**
 * Template error pushed by Home Assistant when `report_errors` is enabled.
 */
export interface RenderTemplateError {
  error: string;
  level: 'ERROR' | 'WARNING';
}

/**
 * Home Assistant state object type
 */
export interface HassEntity {
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
  context?: {
    id?: string;
    parent_id?: string;
    user_id?: string | null;
  };
}

/**
 * A single card recipe offered by the Home Assistant card picker after the user
 * selects an entity.
 *
 * The first entry of a suggestion list is the canonical recipe and carries no
 * `label`; any further entry is a labelled variant.
 */
export interface EntitySuggestion {
  label?: string;
  config: Record<string, unknown>;
}

/**
 * Custom card registration interface for Home Assistant
 */
export interface CustomCard {
  type: string;
  name: string;
  preview: boolean;
  description: string;
  documentationURL?: string;
  /**
   * Optional hook (Home Assistant 2026.6+) that offers this card for a picked
   * entity. Must be synchronous and must never throw: Home Assistant discards
   * the whole community suggestion list — including entries contributed by other
   * custom cards — when a single implementation raises. Returns `null`, never an
   * empty array, when there is nothing to offer.
   *
   * Older Home Assistant versions ignore this key.
   */
  getEntitySuggestion?: (hass: Hass, entityId: string) => EntitySuggestion[] | null;
}

/**
 * Home Assistant more-info event interface
 */
export interface HassMoreInfoEvent extends CustomEvent {
  detail: {
    entityId: string;
  };
}

// -----------------------------------------------------------------------------
// UI SUPPORT
// -----------------------------------------------------------------------------

/**
 * Interface for language translations
 */
export interface Translations {
  loading: string;
  noEvents: string;
  error: string;
  allDay: string;
  multiDay: string;
  at: string;
  months: string[];
  daysOfWeek: string[];
  fullDaysOfWeek: string[];
  endsToday: string;
  endsTomorrow: string;
  editor?: {
    [key: string]: string | string[];
  };
}

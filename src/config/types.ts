/**
 * Type definitions for Calendar Card Pro
 */

// Type-only, so this module keeps zero runtime dependencies.
import type { LabelType } from '../utils/helpers';

// -----------------------------------------------------------------------------
// CORE CONFIGURATION
// -----------------------------------------------------------------------------

/** Main configuration interface for the card. */
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
  event_type: EventType;
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
  progress_bar_width?: string;
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
  column?: ColumnOverrides;
}

/** Views the card can render. Width fallback belongs to `column`, not a third mode. */
export type EffectiveView = 'list' | 'column';

/**
 * Which class of event a calendar contributes.
 *
 * Named for the axis rather than for one class, so a second axis can land beside it
 * symmetrically. It says nothing about how long an event lasts: a 23:30–00:30 dinner is
 * `timed` however many dates it touches.
 *
 * `timed` and `all_day` are exact complements over the same calendar, so listing one
 * entity twice — once each way — partitions it without overlap, which is what styling
 * the two classes differently requires.
 */
export type EventType = 'all' | 'timed' | 'all_day';

/**
 * Which days of the week a calendar's events are allowed to land on.
 *
 * A **display-date** axis, not an event-property one. `event_type` above asks what an
 * event *is*; this asks where a row *lands*, which is why it is resolved after multi-day
 * splitting and after the window clamp rather than from the event's own start date. A
 * three-week holiday already in progress shows on the window's first day whatever weekday
 * that is, so reading the start date would answer about a day the card is not drawing.
 *
 * Weekend means Saturday and Sunday — {@link isWeekendDate} in `utils/format.ts` is the
 * single definition, shared with the weekend day-header colors so the two cannot disagree.
 *
 * 🚨 There is deliberately no `all` member, unlike `EventType`. This option is
 * per-calendar only, so it has no card-level value to override and an explicit `all` would
 * mean exactly what the absent key already means — two dropdown entries with one behavior
 * and, inevitably, one label between them. Absent is the unfiltered state; the editor
 * spells that `inherit`, the way it spells `show_week_numbers`' absent value `none`.
 */
export type DaysOfWeekFilter = 'weekdays' | 'weekends';

/** What column view does when even its narrowest permitted layout will not fit. */
export type ColumnMinDaysFallback = 'list' | 'cramp';

/**
 * Per-view configuration overrides applied when the card renders in column view.
 *
 * Overrides are presence-based. Fetch-time options are excluded because switching views
 * must not trigger Home Assistant API requests.
 *
 * @see resolveViewOption in `src/config/view.ts`
 */
export interface ColumnOverrides {
  // Day grouping and empty days
  show_empty_days?: boolean;
  empty_day_text?: string;
  split_multiday_events?: boolean;

  // Render-side filters; they do not refetch on width transitions.
  show_past_events?: boolean;
  filter_duplicates?: boolean;

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
  today_indicator_color?: string;

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

  // Separators between days. The meaning stays the same; only the axis changes.
  day_separator_width?: string;
  day_separator_color?: string;
  week_separator_width?: string;
  week_separator_color?: string;
  month_separator_width?: string;
  month_separator_color?: string;

  // Column-only layout. These have no top-level counterpart and are read with
  // `resolveColumnOption`, not `resolveViewOption`.
  day_header_gap?: string;
  day_header_separator_width?: string;
  day_header_separator_color?: string;

  // Column density
  min_day_width?: number;

  /**
   * Fewest day columns the card may reduce to when the width will not carry
   * `days_to_show` of them.
   *
   * Defaults dynamically to `days_to_show`, so `resolveMinDaysToShow` owns it.
   */
  min_days_to_show?: number;

  /** What the card does once even `min_days_to_show` columns will not fit. */
  min_days_fallback?: ColumnMinDaysFallback;
}

/** Calendar entity configuration. */
export interface EntityConfig {
  entity: string;
  label?: string;
  label_type?: LabelType;
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
  event_type?: EventType;
  days_of_week?: DaysOfWeekFilter;
  /**
   * Clock time at which this calendar's all-day events start counting as past, `HH:MM`.
   *
   * All-day events are exempt from expiry by construction — the `show_past_events` test
   * compares an end *instant*, and an all-day event has none — so without this they sit on
   * the card until midnight. Unset keeps that. Read only while `show_past_events` is
   * `false`; it decides *when* an all-day event becomes past, not whether past events show.
   */
  allday_expires_at?: string;
}

/** Weather position-specific styling configuration. */
export interface WeatherPositionConfig {
  show_conditions?: boolean;
  show_high_temp?: boolean;
  show_low_temp?: boolean;
  show_temp?: boolean;
  show_uv_index?: boolean;
  uv_index_threshold?: number;
  daily_forecast_fallback?: boolean;
  /**
   * Lines the per-event weather row may occupy before it truncates. `0` is unlimited.
   *
   * Read for the **event** position only; the day-header row has a different width and
   * no nested max-lines option.
   */
  max_lines?: number;
  icon_size?: string;
  font_size?: string;
  color?: string;
}

/** Weather configuration. */
export interface WeatherConfig {
  entity?: string;
  position?: 'none' | 'date' | 'event' | 'both';
  date?: WeatherPositionConfig;
  event?: WeatherPositionConfig;
}

/** Raw weather forecast data from Home Assistant. */
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

/** Processed weather data for use in templates. */
export interface WeatherData {
  icon: string;
  condition: string;
  temperature: string | number;
  templow?: string | number;
  uv_index?: number;
  datetime: string;
  hour?: number;
}

/** Weather forecasts organized by type and date/time. */
export interface WeatherForecasts {
  daily?: Record<string, WeatherData>;
  hourly?: Record<string, WeatherData>;
}

// -----------------------------------------------------------------------------
// CALENDAR DATA STRUCTURES
// -----------------------------------------------------------------------------

/** Calendar event data structure. */
export interface CalendarEventData {
  readonly start: { readonly dateTime?: string; readonly date?: string };
  readonly end: { readonly dateTime?: string; readonly date?: string };
  summary?: string;
  location?: string;
  description?: string;
  _entityId?: string;
  _entityLabel?: string;
  _isEmptyDay?: boolean;
  /** Empty-day placeholder uses custom text; suppresses the checkmark prefix only. */
  _isCustomEmptyText?: boolean;
  /**
   * Set on every segment produced by splitting a multi-day event, so a row can
   * tell "one day of a longer event" from a standalone event.
   *
   * Split timed events can look all-day after segmentation; this flag lets countdowns
   * count whole calendar days for every segment.
   */
  _isMultiDaySegment?: boolean;
  _matchedConfig?: EntityConfig;
}

/**
 * Result of a calendar fetch, including which entities failed.
 *
 * Per-entity fetch errors are tolerated, so `failedEntities` distinguishes an empty
 * calendar from a failed request.
 */
export interface EventFetchResult {
  events: CalendarEventData[];
  /** Entity IDs whose calendar could not be retrieved during this fetch. */
  failedEntities: string[];
}

/** Grouped events by day. */
export interface EventsByDay {
  weekday: string;
  day: number;
  month: string;
  timestamp: number;
  events: CalendarEventData[];
  weekNumber?: number | null;
  monthNumber?: number;
}

/** Cache entry structure. */
export interface CacheEntry {
  events: CalendarEventData[];
  timestamp: number;
  ttlMs?: number;
}

// -----------------------------------------------------------------------------
// USER INTERACTION
// -----------------------------------------------------------------------------

/** Action configuration for tap and hold actions. */
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

/** Home Assistant interface. */
export interface Hass {
  /** Every entity Home Assistant knows about, as full state objects. */
  states: Record<string, HassEntity>;
  callApi: (method: string, path: string, parameters?: object) => Promise<unknown>;
  callService: (domain: string, service: string, serviceData?: object) => void;
  locale?: {
    language: string;
    time_format?: string;
    /** Home Assistant's first-weekday profile setting: a weekday name, or 'language'. */
    first_weekday?: string;
  };
  connection?: {
    subscribeEvents: (callback: (event: unknown) => void, eventType: string) => Promise<() => void>;
    subscribeMessage: <T = WeatherForecastMessage>(
      callback: (message: T) => void,
      options: SubscribeMessageOptions,
    ) => Promise<() => void>;
    /** One-shot WebSocket request; not every custom-card `hass` also has `callWS`. */
    sendMessagePromise?: <T = unknown>(message: WebSocketMessage) => Promise<T>;
  };
  /** Sends a one-shot WebSocket command; optional so callers can degrade gracefully. */
  callWS?: <T = unknown>(message: WebSocketMessage) => Promise<T>;
  /**
   * Home Assistant's own entity-state formatter.
   *
   * The second parameter is an **override**: `computeStateDisplay` resolves the value
   * as `state !== undefined ? state : stateObj.state`, so passing a forecast's
   * condition returns *that* condition's localized text rather than the entity's
   * current one. Optional because older or non-standard `hass` objects may omit it.
   */
  formatEntityState?: (stateObj: HassEntity, state?: string) => string;
}

/** Weather forecast message structure received from Home Assistant. */
export interface WeatherForecastMessage {
  forecast: WeatherForecast[];
  forecast_type?: string;
  [key: string]: unknown;
}

/** Home Assistant subscribe message options. */
export interface SubscribeMessageOptions {
  type: string;
  /** Required by `weather/subscribe_forecast`, absent from `render_template`. */
  entity_id?: string;
  forecast_type?: string;
  [key: string]: unknown;
}

/**
 * A one-shot WebSocket command. `type` is the command name; everything else is
 * command-specific, which is why the rest is left open.
 */
export interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Home Assistant's reply to `frontend/get_translations`.
 *
 * `resources` is a flat map of fully-qualified key to translated string — for the
 * weather component's states, `component.weather.entity_component._.state.<condition>`.
 */
export interface TranslationsResponse {
  resources?: Record<string, unknown>;
}

/**
 * One entry of Home Assistant's reply to `config/entity_registry/list`.
 *
 * Only the two fields the card reads are declared. A calendar's color lives in the
 * generic per-domain `options` blob rather than in a field of its own, and it is absent
 * from the compressed `list_for_display` shape that feeds `hass.entities` — so this
 * command is the only way to reach it.
 */
export interface EntityRegistryEntry {
  entity_id: string;
  options?: {
    calendar?: {
      color?: string | null;
    } | null;
  } | null;
}

/**
 * Successful `render_template` result pushed by Home Assistant.
 *
 * `result` is not necessarily a string: Home Assistant renders templates with
 * native type parsing enabled. `listeners.time` is true for templates that depend on
 * the current time.
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

/** Template error pushed by Home Assistant when `report_errors` is enabled. */
export interface RenderTemplateError {
  error: string;
  level: 'ERROR' | 'WARNING';
}

/** Home Assistant state object type. */
export interface HassEntity {
  /**
   * The entity's own id, and the reason this field is required rather than optional.
   *
   * `computeStateDisplay` builds its translation key from `computeDomain(stateObj.entity_id)`.
   * A state object without one produces `component.undefined.entity_component._.state.sunny`,
   * misses every table and falls through to the raw state. Every Home Assistant state
   * object carries this field.
   */
  entity_id: string;
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
 * `label`; any further entry is a labelled variant naming only what differs.
 */
export interface EntitySuggestion {
  label?: string;
  config: Record<string, unknown>;
}

/** Custom card registration interface for Home Assistant. */
export interface CustomCard {
  type: string;
  name: string;
  preview: boolean;
  description: string;
  documentationURL?: string;
  /**
   * Optional hook (Home Assistant 2026.6+) that offers this card for a picked
   * entity. Must be synchronous and should return `null`, never an empty array, when
   * there is nothing to offer.
   *
   * Older Home Assistant versions ignore this key.
   */
  getEntitySuggestion?: (hass: Hass, entityId: string) => EntitySuggestion[] | null;
}

// -----------------------------------------------------------------------------
// UI SUPPORT
// -----------------------------------------------------------------------------

/** Interface for language translations. */
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
}

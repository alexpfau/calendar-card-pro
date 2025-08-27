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
  start_date?: string;
  days_to_show: number;
  compact_days_to_show?: number;
  compact_events_to_show?: number;
  compact_events_complete_days?: boolean;
  show_empty_days: boolean;
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
  show_progress_bar: boolean;
  progress_bar_color: string;
  progress_bar_height: string;
  progress_bar_width: string;
  event_font_size: string;
  event_color: string;
  empty_day_color: string;
  show_time: boolean;
  show_single_allday_time: boolean;
  time_24h: boolean | 'system';
  show_end_time: boolean;
  time_font_size: string;
  time_color: string;
  time_icon_size: string;
  show_location: boolean;
  remove_location_country: boolean | string;
  location_font_size: string;
  location_color: string;
  location_icon_size: string;

  // Weather
  weather?: WeatherConfig;

  // Actions
  tap_action: ActionConfig;
  hold_action: ActionConfig;

  // Cache and refresh settings
  refresh_interval: number;
  refresh_on_navigate: boolean;
}

/**
 * Calendar entity configuration
 */
export interface EntityConfig {
  entity: string;
  label?: string;
  color?: string;
  accent_color?: string;
  show_time?: boolean;
  show_location?: boolean;
  compact_events_to_show?: number;
  blocklist?: string;
  allowlist?: string;
  split_multiday_events?: boolean;
}

// Add these interfaces to src/config/types.ts

/**
 * Weather position-specific styling configuration
 */
export interface WeatherPositionConfig {
  show_conditions?: boolean;
  show_high_temp?: boolean;
  show_low_temp?: boolean;
  show_temp?: boolean;
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
}

/**
 * Processed weather data for use in templates
 */
export interface WeatherData {
  icon: string;
  condition: string;
  temperature: string | number;
  templow?: string | number;
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
  _entityId?: string;
  _entityLabel?: string;
  _isEmptyDay?: boolean;
  _matchedConfig?: EntityConfig;
  time?: string;
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

/**
 * Context data for action execution
 */
export interface ActionContext {
  element: Element;
  hass: Hass | null;
  entityId?: string;
  toggleCallback?: () => void;
}

/**
 * Configuration for interaction module
 */
export interface InteractionConfig {
  tapAction?: ActionConfig;
  holdAction?: ActionConfig;
  context: ActionContext;
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
    subscribeMessage: (
      callback: (message: WeatherForecastMessage) => void,
      options: SubscribeMessageOptions,
    ) => () => void;
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
  entity_id: string;
  forecast_type?: string;
  [key: string]: unknown;
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
 * Custom card registration interface for Home Assistant
 */
export interface CustomCard {
  type: string;
  name: string;
  preview: boolean;
  description: string;
  documentationURL?: string;
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

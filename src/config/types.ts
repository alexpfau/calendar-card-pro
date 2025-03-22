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
  days_to_show: number;
  max_events_to_show?: number;
  language: string;

  // Header
  title: string;
  title_font_size: string;
  title_color: string;

  // Layout and spacing
  background_color: string;
  row_spacing: string;
  additional_card_spacing: string;
  vertical_line_width: string;
  vertical_line_color: string;
  horizontal_line_width: string;
  horizontal_line_color: string;

  // Date column
  date_vertical_alignment: string;
  weekday_font_size: string;
  weekday_color: string;
  day_font_size: string;
  day_color: string;
  show_month: boolean;
  month_font_size: string;
  month_color: string;

  // Event column
  event_background_opacity: number;
  show_past_events: boolean;
  event_font_size: string;
  event_color: string;
  show_time: boolean;
  time_24h: boolean;
  show_end_time: boolean;
  time_font_size: string;
  time_color: string;
  time_icon_size: string;
  show_location: boolean;
  remove_location_country: boolean;
  location_font_size: string;
  location_color: string;
  location_icon_size: string;
  show_single_allday_time: boolean;

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
  // Fix API call method signature to match what Home Assistant actually provides
  callApi: (method: string, path: string, parameters?: object) => Promise<unknown>;
  callService: (domain: string, service: string, serviceData?: object) => void;
  locale?: {
    language: string;
  };
  // Add connection property that may be needed
  connection?: {
    subscribeEvents: (callback: (event: unknown) => void, eventType: string) => Promise<() => void>;
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
}

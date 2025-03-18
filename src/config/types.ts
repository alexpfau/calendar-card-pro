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
  entities: Array<string | EntityConfig>;
  days_to_show: number;
  max_events_to_show?: number;
  show_past_events: boolean;
  refresh_interval: number;
  language: string;
  time_24h: boolean;
  show_end_time: boolean;
  show_month: boolean;
  show_location: boolean;
  remove_location_country: boolean;
  title: string;
  background_color: string;
  row_spacing: string;
  additional_card_spacing: string;
  vertical_line_width: string;
  vertical_line_color: string;
  horizontal_line_width: string;
  horizontal_line_color: string;
  title_font_size: string;
  weekday_font_size: string;
  day_font_size: string;
  month_font_size: string;
  event_font_size: string;
  time_font_size: string;
  location_font_size: string;
  time_location_icon_size: string;
  title_color: string;
  weekday_color: string;
  day_color: string;
  month_color: string;
  event_color: string;
  time_color: string;
  location_color: string;
  tap_action: ActionConfig;
  hold_action: ActionConfig;
}

/**
 * Calendar entity configuration
 */
export interface EntityConfig {
  entity: string;
  color?: string;
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
 * Interaction state for tracking pointer events and visual feedback
 * Enhanced with additional flags for better state management
 */
export interface InteractionState {
  // Pointer tracking
  activePointerId: number | null;

  // Action state
  holdTriggered: boolean;
  holdTimer: number | null;
  pendingHoldAction: boolean;

  // Visual elements
  holdIndicator: HTMLElement | null;
  lastPointerEvent: PointerEvent | null;

  // Timing
  lastActionTime: number;
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

// -----------------------------------------------------------------------------
// PERFORMANCE & UTILITIES
// -----------------------------------------------------------------------------

/**
 * Performance monitoring data
 */
export interface PerformanceData {
  readonly renderTime: number[];
  eventCount: number;
  lastUpdate: number;
}

/**
 * Performance metrics structure
 */
export interface PerfMetrics {
  startTime: number;
  eventCount: number;
}

/**
 * Memoization cache interface
 */
export interface MemoCache<T> {
  readonly cache: Map<string, T>;
  clear(): void;
}

/**
 * Calendar component interface for component instances
 */
export interface CalendarComponent {
  config: Config;
  events: CalendarEventData[];
  _hass: Hass | null;
  isLoading: boolean;
  isExpanded: boolean;
  renderTimeout?: number;
  updateEvents: (force?: boolean) => Promise<void>;
  toggleExpanded: () => void;
  renderCard: () => void;
  performanceMetrics: PerformanceData;
  memoizedFormatTime: (date: Date) => string & MemoCache<string>;
  memoizedFormatLocation: (location: string) => string & MemoCache<string>;
  interactionManager: {
    state: InteractionState;
    container: HTMLElement | null;
    cleanup: (() => void) | null;
  };
  shadowRoot: ShadowRoot | null;
  visibilityCleanup?: () => void;
  refreshTimer?: {
    start: () => void;
    stop: () => void;
    restart: () => void;
  };
  cleanupInterval: number;
}

/**
 * Performance tracker interface
 */
export interface PerformanceTracker {
  beginMeasurement: (eventCount: number) => PerfMetrics;
  endMeasurement: (metrics: PerfMetrics, performanceData: PerformanceData) => number;
  getAverageRenderTime: (performanceData: PerformanceData) => number;
}

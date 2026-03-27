/**
 * Calendar Card Pro Constants
 *
 * This module contains all constant values used throughout the application.
 * Centralizing constants makes them easier to adjust and ensures consistency.
 */

//-----------------------------------------------------------------------------
// CORE APPLICATION INFORMATION
//-----------------------------------------------------------------------------

/**
 * Version information
 */
export const VERSION = {
  /** Current version of Calendar Card Pro - will be replaced during build with version defined in package.json */
  CURRENT: 'vPLACEHOLDER',
};

//-----------------------------------------------------------------------------
// CORE CONFIGURATION
//-----------------------------------------------------------------------------

/**
 * Cache-related constants
 */
export const CACHE = {
  /** Default interval (minutes) for refreshing event data from API */
  DEFAULT_DATA_REFRESH_MINUTES: 30,

  /** Cache duration (milliseconds) to use when manual page reload is detected */
  MANUAL_RELOAD_CACHE_DURATION_SECONDS: 5, // 5 seconds

  /** Short cache duration for empty results to avoid blank first loads */
  EMPTY_RESULTS_CACHE_DURATION_SECONDS: 15, // 15 seconds

  /** Multiplier used with cache lifetime to calculate when entries should be purged */
  CACHE_EXPIRY_MULTIPLIER: 4,

  /** Interval (milliseconds) between cache cleanup operations */
  CACHE_CLEANUP_INTERVAL_MS: 3600000, // 1 hour

  /** Prefix for calendar event cache keys in localStorage */
  EVENT_CACHE_KEY_PREFIX: 'cache_data_',
};

/**
 * Logging-related constants
 */
export const LOGGING = {
  /**
   * Current log level
   * 0 = ERROR, 1 = WARN, 2 = INFO, 3 = DEBUG
   */
  CURRENT_LOG_LEVEL: 3,

  /** Standard prefix for log messages */
  PREFIX: '📅 Calendar Card Pro',
};

//-----------------------------------------------------------------------------
// UI BEHAVIOR & INTERACTIONS
//-----------------------------------------------------------------------------

/**
 * Timing-related constants
 */
export const TIMING = {
  /** Hold indicator threshold in milliseconds */
  HOLD_THRESHOLD: 500,

  /** Hold indicator transition duration in milliseconds */
  HOLD_INDICATOR_TRANSITION: 200,

  /** Hold indicator fadeout duration in milliseconds */
  HOLD_INDICATOR_FADEOUT: 300,

  /** Threshold in milliseconds for refreshing data when returning to a tab */
  VISIBILITY_REFRESH_THRESHOLD: 300000, // 5 minutes
};

/**
 * DOM and UI constants
 */
export const UI = {
  /** Week/month horizontal separator spacing multipliers */
  SEPARATOR_SPACING: {
    /** Multiplier for week separators (1x day_spacing) */
    WEEK: 1,
    /** Multiplier for month separators (2x day_spacing) */
    MONTH: 1.5,
  },

  /** Opacity for hold indicators */
  HOLD_INDICATOR_OPACITY: 0.2,

  /** Hold indicator sizes */
  HOLD_INDICATOR: {
    /** Size for touch devices */
    TOUCH_SIZE: 100,
    /** Size for mouse/pointer devices */
    POINTER_SIZE: 50,
  },
};

/**
 * Default list of country names to remove when remove_location_country is true
 * These are commonly used country names across different calendars
 */
export const COUNTRY_NAMES: string[] = [
  'Germany',
  'Deutschland',
  'United States',
  'USA',
  'United States of America',
  'United Kingdom',
  'Great Britain',
  'France',
  'Italy',
  'Italia',
  'Spain',
  'España',
  'Netherlands',
  'Nederland',
  'Austria',
  'Österreich',
  'Switzerland',
  'Schweiz',
];

/**
 * Calendar Card Pro Constants
 */

//-----------------------------------------------------------------------------
// CORE APPLICATION INFORMATION
//-----------------------------------------------------------------------------

export const VERSION = {
  /** Replaced during build with the version from package.json. */
  CURRENT: 'vPLACEHOLDER',
};

//-----------------------------------------------------------------------------
// CORE CONFIGURATION
//-----------------------------------------------------------------------------

export const CACHE = {
  DEFAULT_DATA_REFRESH_MINUTES: 30,

  MANUAL_RELOAD_CACHE_DURATION_SECONDS: 5, // 5 seconds

  EMPTY_RESULTS_CACHE_DURATION_SECONDS: 15, // 15 seconds

  EVENT_CACHE_KEY_PREFIX: 'cache_data_',
};

export const LOGGING = {
  /** 0 = ERROR, 1 = WARN, 2 = INFO, 3 = DEBUG */
  CURRENT_LOG_LEVEL: 3,

  PREFIX: '📅 Calendar Card Pro',
};

//-----------------------------------------------------------------------------
// UI BEHAVIOR & INTERACTIONS
//-----------------------------------------------------------------------------

export const TIMING = {
  HOLD_THRESHOLD: 500,

  HOLD_INDICATOR_TRANSITION: 200,

  HOLD_INDICATOR_FADEOUT: 300,

  VISIBILITY_REFRESH_THRESHOLD: 300000, // 5 minutes

  /**
   * Trailing delay, in milliseconds, between the last width measurement and acting on it.
   *
   * Home Assistant's sections grid lays a card out at its unconstrained width for at
   * least one frame before applying the section's own constraint: a card that settles
   * at 464px is measured at 500px first. Acting on that first measurement lets a card
   * enter column view above the threshold and then keep it via the hysteresis band all
   * the way down to its settled width, rendering columns narrower than
   * `min_day_width` — the exact outcome the threshold exists to prevent.
   *
   * Waiting for the measurements to stop means the band is only ever earned by a width
   * the layout has actually committed to. 100ms is long enough to outlast the transient
   * and short enough to be imperceptible against Home Assistant's own load.
   */
  WIDTH_SETTLE_DELAY: 100,
};

export const UI = {
  SEPARATOR_SPACING: {
    WEEK: 1,
    MONTH: 1.5,
  },

  HOLD_INDICATOR_OPACITY: 0.2,

  HOLD_INDICATOR: {
    TOUCH_SIZE: 100,
    POINTER_SIZE: 50,
  },
};

/**
 * Common country names removed when `remove_location_country` is true.
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

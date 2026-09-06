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

  /**
   * How often the grid view repaints its now line, in milliseconds.
   *
   * A minute, because that is the resolution the line is drawn at — anything finer
   * repaints for a position that has not moved. It is deliberately not aligned to the
   * wall-clock minute: the line slides continuously, so being up to a minute stale is
   * invisible where the arithmetic to align it would not be.
   */
  NOW_LINE_INTERVAL: 60_000,
};

export const UI = {
  /**
   * Pointer travel that still counts as a tap rather than a scroll or drag.
   */
  POINTER_MOVE_TOLERANCE: 8,

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
 * Tuning for `scroll_long_titles` — the opt-in horizontal auto-scroll of overflowing
 * event titles. Read by the measurement step in calendar-card-pro.ts; the keyframes and
 * the pause/reduced-motion behaviour live in the stylesheet.
 */
export const TITLE_SCROLL = {
  /** Overflow past which a title scrolls, in CSS pixels. Below it the title never moves. */
  MIN_OVERFLOW_PX: 1,

  /**
   * Perceived travel speed, in CSS pixels per second, over the part of the cycle actually
   * moving. Duration is derived from the overflow distance and this constant so every title
   * scrolls at the same speed rather than the same duration — a short overflow does not crawl
   * while a long one sprints.
   */
  SPEED_PX_PER_S: 45,

  /**
   * Fraction of the cycle spent moving rather than paused. Must match the
   * calendar-card-title-scroll keyframes in styles.ts: 15%->85% is 70% travel, the
   * remaining 30% split evenly as holds at the start and the end.
   */
  TRAVEL_FRACTION: 0.7,

  /**
   * Shortest scroll, in seconds, so a small overflow eases rather than snaps.
   *
   * It also bounds how often the marquee's reset is seen. The cycle travels the overflow
   * once and then restarts, so the floor is what stops a title that overflows by a few
   * pixels from snapping back several times a second.
   */
  MIN_DURATION_S: 4,
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

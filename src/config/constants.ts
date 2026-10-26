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

  /**
   * With `refresh_on_navigate` on, a card that appears refetches in the background — but
   * not when its data is younger than this. Reloading the page twice in a row, or a
   * dashboard re-laying its cards out, is not a reason to ask every calendar again.
   */
  NAVIGATION_REFETCH_MIN_AGE_SECONDS: 5,

  EMPTY_RESULTS_CACHE_DURATION_SECONDS: 15, // 15 seconds

  /**
   * Oldest cached data the card will still draw while it fetches, and the longest a
   * calendar that keeps failing goes on showing its last loaded events.
   */
  MAX_STALE_HOURS: 24,

  /**
   * First retry after a calendar failed to load. Each further failure doubles it, up to
   * `refresh_interval`, so a blip recovers in a minute and a calendar that stays broken
   * settles at the normal cadence.
   */
  RETRY_INITIAL_SECONDS: 60,

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

  /**
   * How long after a pointer gesture ends the `click` it owes is still expected.
   *
   * Browsers dispatch that click straight after the pointer-up, so the window only bounds a
   * gesture no click follows. Generous, because a wall tablet can be slow to get to the
   * click, and an activation by assistive technology of the very event a pointer gesture
   * just ended on, this soon after it, is not a thing a person does. A click on any other
   * event is never held back; see `_derivedClick` in the card.
   */
  DERIVED_CLICK_WINDOW: 1000,

  HOLD_INDICATOR_TRANSITION: 200,

  HOLD_INDICATOR_FADEOUT: 300,

  VISIBILITY_REFRESH_THRESHOLD: 300000, // 5 minutes

  /**
   * How long one calendar may take to answer before it counts as failed.
   *
   * `hass.callApi` has no timeout of its own, and a request that never settles used to
   * pin the shared in-flight entry for good: every later refresh joined it, so the card
   * silently stopped refreshing until the page was reloaded.
   */
  CALENDAR_FETCH_TIMEOUT: 30000,

  /** Shortest delay the refresh timer is armed with, so it can never spin. */
  REFRESH_MIN_DELAY: 1000,

  /**
   * Shortest time the refresh button, or the corner spinner where there is no button, turns
   * after someone asks for a refresh: one turn of the button's icon, which the stylesheet
   * declares as `ccp-spin 1s`. On a fast network the load itself ends within a frame or two,
   * which would leave the press with nothing to show for it.
   */
  REFRESH_MIN_TURN: 1000,

  /**
   * How long a refresh someone asked for shows how it ended, a check or an alert, before the
   * button or the corner is itself again. Presses do nothing until then.
   */
  REFRESH_CONFIRMATION: 1500,

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
  /** Longest wait for the next event boundary before the timer re-arms (24 hours). */
  NOW_BOUNDARY_MAX_DELAY: 86_400_000,
};

export const UI = {
  /**
   * Pointer travel that still counts as a tap rather than a scroll or drag.
   */
  POINTER_MOVE_TOLERANCE: 8,

  /**
   * Card width, in CSS pixels, from which the header toolbar's controls carry a text label
   * beside their icon. Narrower cards draw the icon alone, named for assistive technology.
   * This one holds while the add button is the only control.
   */
  TOOLBAR_LABEL_MIN_WIDTH: 480,

  /**
   * The same, once the view switcher shares the bar. Its three labeled segments and a
   * labeled add button take about 400px in English and more in German, so the title keeps
   * room for a word or two only from here up. Labels are all or nothing across the bar.
   */
  TOOLBAR_SWITCHER_LABEL_MIN_WIDTH: 640,

  /**
   * The same two, once the date navigation shares the band. Its track and the widest range
   * take about 300px before any trailing control, so labels need that much more room. These
   * are first guesses: a labeled band that still wraps onto a second row drops its labels
   * until the card is wider (`_syncToolbarLabelFit`), so a guess too low costs one frame and
   * never a broken layout.
   */
  TOOLBAR_BAND_LABEL_MIN_WIDTH: 600,
  TOOLBAR_BAND_SWITCHER_LABEL_MIN_WIDTH: 840,

  /**
   * What each command beyond the first adds to those thresholds: refresh, or the legend
   * folded into a button. Each fixed threshold allows for one, the add button it was measured
   * with; a labeled refresh or "My calendars" is about a hundred pixels wider than its icon in
   * English. A first guess under the same rule as the band's: labels that still do not fit
   * are dropped until the card is wider (`_syncToolbarLabelFit`).
   */
  TOOLBAR_EXTRA_LABEL_MIN_WIDTH: 112,

  /**
   * How much wider than its chips need the card must be before a folded legend draws them
   * again. Layout widths are fractional and `clientWidth` is not, so without a margin a card
   * resting exactly at the threshold could be judged to fit and then not.
   */
  LEGEND_UNFOLD_MARGIN: 2,

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
 * the pause/reduced-motion behavior live in the stylesheet.
 */
export const TITLE_SCROLL = {
  /** Overflow past which a title scrolls, in CSS pixels. Below it the title never moves. */
  MIN_OVERFLOW_PX: 1,

  /**
   * Perceived travel speed, in CSS pixels per second, over the part of the cycle actually
   * moving, except short trips that use the minimum forward duration.
   */
  SPEED_PX_PER_S: 45,

  START_PAUSE_S: 0.6,
  MIN_FORWARD_S: 2.8,
  END_PAUSE_S: 0.6,
  RETURN_SPEED_PX_PER_S: 360,
  MIN_RETURN_S: 0.2,
  MAX_RETURN_S: 0.6,

  /**
   * Legacy fallback's fraction spent moving rather than paused. Must match the
   * calendar-card-title-scroll keyframes in styles.ts: 15%->85% is 70% travel, the
   * remaining 30% split evenly as holds at the start and the end.
   */
  TRAVEL_FRACTION: 0.7,

  /**
   * Shortest legacy fallback cycle, in seconds.
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

/* eslint-disable import/order */
/**
 * Styles module for Calendar Card Pro
 */

import { css } from 'lit';
import * as Config from '../config/config';
import type * as Types from '../config/types';

/**
 * Generate CSS custom properties object based on card configuration
 * Returns an object with property-value pairs for use with styleMap
 */
export function generateCustomPropertiesObject(config: Types.Config): Record<string, string> {
  const props: Record<string, string> = {
    '--calendar-card-background-color': config.background_color,
    '--calendar-card-font-size-weekday': config.weekday_font_size,
    '--calendar-card-font-size-day': config.day_font_size,
    '--calendar-card-font-size-month': config.month_font_size,
    '--calendar-card-font-size-event': config.event_font_size,
    '--calendar-card-font-size-time': config.time_font_size,
    '--calendar-card-font-size-location': config.location_font_size,
    '--calendar-card-font-size-description': config.description_font_size,
    '--calendar-card-color-weekday': config.weekday_color,
    '--calendar-card-color-day': config.day_color,
    '--calendar-card-color-month': config.month_color,
    '--calendar-card-color-event': config.event_color,
    '--calendar-card-color-time': config.time_color,
    '--calendar-card-color-location': config.location_color,
    '--calendar-card-color-description': config.description_color,
    '--calendar-card-line-color-vertical': config.accent_color,
    '--calendar-card-line-width-vertical': config.vertical_line_width,
    '--calendar-card-day-spacing': config.day_spacing,
    '--calendar-card-event-spacing': config.event_spacing,
    '--calendar-card-spacing-additional': config.additional_card_spacing,
    '--calendar-card-height': config.height || 'auto',
    '--calendar-card-max-height': config.max_height,
    '--calendar-card-progress-bar-color': config.progress_bar_color,
    '--calendar-card-progress-bar-height': config.progress_bar_height,
    '--calendar-card-icon-size-time': config.time_icon_size || '14px',
    '--calendar-card-icon-size-location': config.location_icon_size || '14px',
    '--calendar-card-icon-size-description': config.description_icon_size || '14px',
    '--calendar-card-description-max-lines':
      config.description_max_lines > 0 ? String(config.description_max_lines) : 'none',
    '--calendar-card-title-max-lines':
      config.title_max_lines > 0 ? String(config.title_max_lines) : 'none',
    '--calendar-card-time-max-lines':
      config.time_max_lines > 0 ? String(config.time_max_lines) : 'none',
    '--calendar-card-location-max-lines':
      config.location_max_lines > 0 ? String(config.location_max_lines) : 'none',
    // The title is the one clamp target whose parent (.summary) is not a flex
    // container, so blockifying it with -webkit-box is NOT layout-neutral -- it
    // measurably tightens every event row. Keep the span inline until the user
    // actually asks for a limit. The other three targets sit inside flex parents
    // and are already blockified, so they need no such guard.
    '--calendar-card-title-display': config.title_max_lines > 0 ? '-webkit-box' : 'inline',
    // The same conditional, for the time text, and for a second reason on top of the
    // title's. `-webkit-box` is block-level, so a clamped time cannot share a line with
    // anything -- which is fatal in the countdown's `text` placement, where the countdown
    // is an inline sibling of the time inside `.time-text` and would be pushed onto a line
    // of its own the moment a limit was set. Left at `inline` the two read as one phrase
    // and break at any word boundary, which is the whole point of that placement.
    //
    // This property is read *only* by the text placement. The trailing placement keeps the
    // unconditional `-webkit-box` it has always had, because there the time span is a flex
    // item with no inline siblings, and its `overflow: hidden` is load-bearing for the
    // shrink-below-min-content behaviour documented beside that rule.
    //
    // Setting `time_max_lines` in the text placement therefore trades the shared line for
    // the limit that was asked for. That is the same trade `weather.event.max_lines`
    // already makes for `.weather-condition`, via the property directly below this one.
    '--calendar-card-time-display': config.time_max_lines > 0 ? '-webkit-box' : 'inline',
    '--calendar-card-date-column-width': `${parseFloat(config.day_font_size) * 1.75}px`,
    '--calendar-card-date-column-vertical-alignment': config.date_vertical_alignment,
    '--calendar-card-event-icon-vertical-alignment':
      config.event_icon_vertical_alignment === 'top'
        ? 'flex-start'
        : config.event_icon_vertical_alignment === 'bottom'
          ? 'flex-end'
          : 'center',
    '--calendar-card-event-border-radius': 'calc(var(--ha-card-border-radius, 10px) / 2)',
    '--ha-ripple-hover-opacity': '0.04',
    '--ha-ripple-hover-color': config.accent_color,
    '--ha-ripple-pressed-opacity': '0.12',
    '--ha-ripple-pressed-color': config.accent_color,

    // Today indicator settings
    '--calendar-card-today-indicator-color': config.today_indicator_color,
    '--calendar-card-today-indicator-size': config.today_indicator_size,

    // Week and month separator properties
    '--calendar-card-week-number-font-size': config.week_number_font_size,
    '--calendar-card-week-number-color': config.week_number_color,
    '--calendar-card-week-number-bg-color': config.week_number_background_color,

    // Custom empty day color with opacity for default value
    '--calendar-card-empty-day-color':
      config.empty_day_color === Config.DEFAULT_CONFIG.empty_day_color
        ? 'color-mix(in srgb, var(--primary-text-color) 60%, transparent)'
        : config.empty_day_color,

    // Weather styling properties.
    //
    // These six deliberately mirror the nested `weather.date` and `weather.event`
    // presentation options. The renderers emit semantic markup only; the stylesheet is
    // the single reader for size and colour, matching the rest of the card's theming
    // pattern and making the host properties a real override surface. Keep the fallbacks
    // position-specific: date badges sit beside primary-coloured day-header text, event
    // badges sit beside secondary-coloured time/location rows.
    //
    // The event icon size is also the unit for the row placement's hanging indent, so the
    // wrapped text continues to start under the temperature when a user enlarges the
    // icon. `--calendar-card-weather-event-max-lines` remains separate: it controls only
    // the optional condition clamp, not the badge's visual styling.
    '--calendar-card-weather-date-icon-size': config.weather?.date?.icon_size || '14px',
    '--calendar-card-weather-date-font-size': config.weather?.date?.font_size || '12px',
    '--calendar-card-weather-date-color':
      config.weather?.date?.color || 'var(--primary-text-color)',
    '--calendar-card-weather-event-icon-size': config.weather?.event?.icon_size || '14px',
    '--calendar-card-weather-event-font-size': config.weather?.event?.font_size || '12px',
    '--calendar-card-weather-event-color':
      config.weather?.event?.color || 'var(--secondary-text-color)',
    // Read with a fallback rather than from the merged default, because `setConfig`
    // merges shallowly: a user's `weather:` block replaces DEFAULT_CONFIG's whole
    // sub-tree, so `weather.event.max_lines` is absent from any config that configures
    // weather at all. Every weather property above reads the same way, for the same
    // reason.
    '--calendar-card-weather-event-max-lines':
      (config.weather?.event?.max_lines ?? 0) > 0
        ? String(config.weather?.event?.max_lines)
        : 'none',
    '--calendar-card-weather-event-condition-display':
      (config.weather?.event?.max_lines ?? 0) > 0 ? '-webkit-box' : 'inline',
  };

  // Optional properties
  //
  // The progress bar's width is emitted only when the user set one, and that is what
  // makes a per-placement default possible at all. Emitting it unconditionally would
  // hand the stylesheet a value it cannot distinguish from a deliberate choice, so both
  // the inline bar and the row would be pinned to whatever shipped here. Left absent,
  // each `var()` reaches its own fallback; set, both resolve to the user's value --
  // which is exactly the "a plain width, not a maximum" behaviour that was ruled.
  if (config.progress_bar_width) {
    props['--calendar-card-progress-bar-width'] = config.progress_bar_width;
  }

  if (config.title_font_size) {
    props['--calendar-card-font-size-title'] = config.title_font_size;
  }

  if (config.title_color) {
    props['--calendar-card-color-title'] = config.title_color;
  }

  return props;
}

/**
 * Base styles for the card component
 * Using direct css template literal for proper variable processing
 */
export const cardStyles = css`
  /* ===== CORE CONTAINER STYLES ===== */

  :host {
    display: block;
    height: 100%;
  }

  ha-card {
    /* Layout */
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    overflow: hidden;

    /* Box model */
    box-sizing: border-box;
    padding: calc(var(--calendar-card-spacing-additional) + 16px) 16px
      calc(var(--calendar-card-spacing-additional) + 16px) 8px;

    /* Visual */
    background: var(--calendar-card-background-color, var(--card-background-color));
    cursor: pointer;
  }

  /* Focus states */
  ha-card:focus {
    outline: none;
  }

  ha-card:focus-visible {
    outline: 2px solid var(--calendar-card-line-color-vertical);
  }

  /* Structure containers for stable DOM */
  .header-container,
  .content-container {
    width: 100%;
  }

  /* Content container with unified scrolling behavior */
  .content-container {
    max-height: var(--calendar-card-max-height, none);
    height: var(--calendar-card-height, auto);
    overflow-x: hidden;
    overflow-y: auto;
    padding-bottom: 1px;
    hyphens: auto;

    /* Hide scrollbars across browsers */
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }

  /* Show scrollbars on hover */
  .content-container:hover {
    scrollbar-width: thin; /* Firefox */
    scrollbar-color: var(--secondary-text-color) transparent; /* Firefox */
    -ms-overflow-style: auto; /* IE/Edge */
  }

  .card-header-placeholder {
    height: 0;
  }

  /* ===== HEADER STYLES ===== */

  .card-header {
    /* Layout */
    float: left;

    /* Spacing */
    margin: 0 0 16px 8px;
    padding: 0;

    /* Typography
     * The literal fallbacks are load-bearing: Home Assistant removed the
     * --paper-font-headline_-_* variables, and a var() that references an
     * undefined property without a fallback is invalid at computed-value time,
     * which silently downgraded the title to inherited body text. */
    color: var(--calendar-card-color-title, var(--primary-text-color));
    font-size: var(--calendar-card-font-size-title, var(--ha-card-header-font-size, 24px));
    font-weight: var(--ha-font-weight-normal, 400);
    letter-spacing: -0.012em;
    line-height: 1.33;
  }

  /* ===== WEEK NUMBER & SEPARATOR STYLES ===== */

  /* Table structure for week number pills and their separator lines
   * Creates consistent alignment with calendar data below */
  /* Margins are applied dynamically in renderWeekRow */
  .week-row-table {
    height: calc(var(--calendar-card-week-number-font-size) * 1.5);
    width: 100%;
    table-layout: fixed;
    padding-left: 8px;
    border-spacing: 0;
    border: none !important;
  }

  /* Make both cells take full height of the row */
  .week-number-cell,
  .separator-cell {
    height: 100%;
  }

  /* Left cell containing the week number pill
   * Sized to match date column width for proper alignment */
  .week-number-cell {
    width: var(--calendar-card-date-column-width);
    position: relative;
    text-align: center;
    vertical-align: middle;
    padding-right: 12px; /* Match date column padding */
  }

  /* Week number pill - positioned absolutely and centered within its cell */
  .week-number {
    width: calc(var(--calendar-card-week-number-font-size) * 2.5);
    height: calc(var(--calendar-card-week-number-font-size) * 1.5);
    display: inline-flex; /* Centering */
    align-items: center;
    justify-content: center;
    font-size: var(--calendar-card-week-number-font-size);
    font-weight: 500;
    color: var(--calendar-card-week-number-color);
    background-color: var(--calendar-card-week-number-bg-color);
    border-radius: 999px;
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Safari-specific adjustment for iOS vertical alignment issues */
  @supports (-webkit-touch-callout: none) {
    .week-number {
      /* Adjust padding to improve vertical alignment on iOS Safari */
      padding-top: calc(var(--calendar-card-week-number-font-size) * 0.1);
    }
  }

  /* Right cell containing the horizontal separator line
   * Takes up remaining width of the table */
  .separator-cell {
    vertical-align: middle;
  }

  /* The actual separator line */
  .separator-line {
    width: 100%;
    height: var(--separator-border-width, 0);
    background-color: var(--separator-border-color, transparent);
    /* Only show when width > 0px */
    display: var(--separator-display, none);
  }

  /* Day separator - Horizontal line between individual days
   * Used when days aren't at week or month boundaries */
  .separator {
    width: 100%;
    margin-left: 8px;
  }

  /* Week separator (full-width) - Used when show_week_numbers is null
   * Creates a horizontal line at week boundaries without week number pill
   * Margins are applied dynamically in createSeparatorStyle in render.ts */
  .week-separator {
    width: 100%;
    margin-left: 8px;
    border-top-style: solid; /* Ensure line is visible */
  }

  /* Month separator - Used at month boundaries
   * Creates a horizontal line between months, has priority over week separators
   * Margins are applied dynamically in createSeparatorStyle in render.ts */
  .month-separator {
    width: 100%;
    margin-left: 8px;
    border-top-style: solid; /* Ensure line is visible */
  }

  /* ===== DAY TABLE STYLES ===== */

  table {
    /* Layout */
    width: 100%;
    table-layout: fixed;
    border-spacing: 0;
    border-collapse: separate;

    /* Borders & Spacing */
    margin-bottom: var(--calendar-card-day-spacing);
  }

  .day-table {
    /* Override the default table border-bottom for day tables */
    border: none !important;
  }

  table:last-of-type {
    margin-bottom: 0;
    border-bottom: 0;
  }

  /* ===== DATE COLUMN STYLES ===== */

  .date-column {
    /* Layout */
    width: var(--calendar-card-date-column-width);
    min-width: var(--calendar-card-date-column-width);
    max-width: var(--calendar-card-date-column-width);
    vertical-align: var(--calendar-card-date-column-vertical-alignment);
    text-align: center;
    position: relative;

    /* Borders & Spacing */
    padding-left: 8px;
    padding-right: 12px;
  }

  .date-content {
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 2; /* Ensure date content is above indicator */
  }

  /*
   * Today indicator styling.
   *
   * :not(.inline) rather than a bare selector, because these declarations describe the
   * list view's placement model specifically: a full-size overlay inside the date cell
   * that the indicator is then positioned within. An inline indicator is a normal-flow
   * item its container places, so a 100% box and an absolute position are both actively
   * wrong for it.
   */
  .today-indicator-container:not(.inline) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  /* Date components */
  .weekday {
    font-size: var(--calendar-card-font-size-weekday);
    line-height: var(--calendar-card-font-size-weekday);
    color: var(--calendar-card-color-weekday);
  }

  .day {
    font-size: var(--calendar-card-font-size-day);
    line-height: var(--calendar-card-font-size-day);
    font-weight: 500;
    color: var(--calendar-card-color-day);
  }

  .month {
    font-size: var(--calendar-card-font-size-month);
    line-height: var(--calendar-card-font-size-month);
    text-transform: uppercase;
    color: var(--calendar-card-color-month);
  }

  /*
   * Today indicator styling, second half: the declarations that apply to both layouts.
   *
   * This rule used to restate position: absolute, which read as harmless redundancy
   * with the rule above and was for as long as there was only one layout. Dropping it
   * is now load-bearing -- left in place it would force absolute positioning onto the
   * inline indicator from a selector the .inline rule below cannot outrank on
   * specificity alone.
   */
  .today-indicator-container {
    color: var(--calendar-card-today-indicator-color);
    pointer-events: none;
    z-index: 1;
  }

  /*
   * The inline layout, used by the column view. A flex box rather than a bare
   * container so the indicator centres on the weekday regardless of whether it is an
   * icon, an image or an emoji, each of which reports a different intrinsic box.
   */
  .today-indicator-container.inline {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  /* Set proper sizing for icon-based indicators */
  ha-icon.today-indicator {
    --mdc-icon-size: var(--calendar-card-today-indicator-size);
  }

  /* Special styling for image type */
  img.today-indicator.image {
    width: var(--calendar-card-today-indicator-size);
    height: auto;
    max-height: var(--calendar-card-today-indicator-size);
    object-fit: contain;
  }

  /* Special styling for emoji type */
  span.today-indicator.emoji {
    font-size: var(--calendar-card-today-indicator-size);
    line-height: 1;
  }

  /* Animation for pulse indicator */
  ha-icon.today-indicator.pulse {
    animation: pulse-animation 2s infinite ease-in-out;
  }

  /* Special styling for glow effect */
  ha-icon.today-indicator.glow {
    filter: drop-shadow(
      0 0 calc(var(--calendar-card-today-indicator-size) * 0.5)
        var(--calendar-card-today-indicator-color)
    );
  }

  /* Pulse animation keyframes */
  @keyframes pulse-animation {
    0% {
      transform: scale(0.95);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.1);
      opacity: 1;
    }
    100% {
      transform: scale(0.95);
      opacity: 0.7;
    }
  }

  /* Date column weather */
  .date-column .weather,
  .column-date-content .weather {
    font-size: var(--calendar-card-weather-date-font-size, 12px);
    color: var(--calendar-card-weather-date-color, var(--primary-text-color));
  }

  .date-column .weather {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .weather ha-icon {
    margin-right: 1px;
  }

  .date-column .weather ha-icon,
  .column-date-content .weather ha-icon {
    --mdc-icon-size: var(--calendar-card-weather-date-icon-size, 14px);
  }

  .weather-temp-high,
  .weather-temp-low {
    line-height: 1;
    vertical-align: middle;
  }

  .weather-temp-high {
    font-weight: 500;
  }

  .weather-temp-low {
    opacity: 0.8;
  }

  .weather .weather-uv-index {
    line-height: 1;
    vertical-align: middle;
    font-weight: 500;
    margin-left: 2px;
  }

  .event-weather .weather-uv-index {
    font-weight: 500;
    margin-left: 2px;
  }

  /* ===== EVENT STYLES ===== */

  /* Base event */
  .event {
    padding: var(--calendar-card-event-spacing) 0 var(--calendar-card-event-spacing) 12px;
    border-radius: 0;
  }

  /* Event positioning variations */
  .event-first.event-last {
    border-start-start-radius: 0;
    border-start-end-radius: var(--calendar-card-event-border-radius);
    border-end-end-radius: var(--calendar-card-event-border-radius);
    border-end-start-radius: 0;
  }

  .event-first {
    border-start-end-radius: var(--calendar-card-event-border-radius);
    border-start-start-radius: 0;
  }

  .event-middle {
    /* No additional styles needed */
  }

  .event-last {
    border-end-end-radius: var(--calendar-card-event-border-radius);
    border-end-start-radius: 0;
  }

  /* Past event styling */
  .past-event .event-content {
    opacity: 0.6;
  }

  /* Event content */
  .event-content {
    display: flex;
    flex-direction: column;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  /*
   * The 12px trailing gutter belongs here, not on .event-title. Every content row in an
   * event carries one -- .time/.location/.description share a rule for it -- but those
   * are block boxes, so the margin sits outside the box and merely narrows it.
   * .event-title is an inline span *inside* this overflow: hidden box, so a margin there
   * counted as scrollable content: .summary's min-content became longestWord + 12px, and
   * at any width inside that 12px window scrollWidth exceeded clientWidth while every
   * glyph was still painted. text-overflow then appended an ellipsis to a title that had
   * lost nothing. Measured at 201 spurious overflows in one 400px column-width sweep, and
   * reproducible in list view with any word long enough to approach the card's width.
   *
   * text-overflow goes with it. It had no limit to signal at the default: title_max_lines
   * unset means titles are unbounded, so an ellipsis on one could only ever mean the
   * phantom overflow above, or a real word too long for the column that it would then
   * have clipped silently. When title_max_lines *is* set the ellipsis comes from
   * -webkit-line-clamp on .event-title, which renders its own -- exactly as
   * description_max_lines already does on .description span. overflow-wrap breaks an
   * over-long word onto the next line instead, so removing the ellipsis does not trade a
   * false truncation for a hidden one. overflow: hidden stays as the backstop for
   * anything genuinely unbreakable.
   */
  .summary {
    flex: 1;
    margin-right: 12px;
    overflow: hidden;
    overflow-wrap: break-word;
  }

  .event-title {
    font-size: var(--calendar-card-font-size-event);
    font-weight: 500;
    line-height: 1.2;
    color: var(--calendar-card-color-event);
    padding-bottom: 2px;
    /* The hanging indent below is set on .summary, and text-indent inherits.
       That is harmless while this span is inline, but the moment
       title_max_lines blockifies it the inherited value would indent the
       title's own first line as well. Neutralise it here once. */
    text-indent: 0;
    /* Per-field line clamping. The clamp lands on this element because it is
       what directly contains the text, and -webkit-line-clamp only takes
       effect on a display: -webkit-box element. Unlimited is expressed as the
       string 'none', emitted by generateCustomPropertiesObject when the option
       is 0 -- see the note on --calendar-card-title-display for why the
       display value is a variable rather than a literal here. */
    display: var(--calendar-card-title-display);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-title-max-lines);
    overflow: hidden;
  }

  /* Hanging indent for glyph labels.
   *
   * A wrapped title otherwise returns to the far left and tucks underneath its
   * own label, which reads as a second event. Hanging the glyph in the margin
   * instead lines every continuation line up with the first.
   *
   * This is deliberately done with text-indent rather than by making .summary a
   * flex or grid container: either of those would blockify .event-title, which
   * measurably retightens every event row (the same trap documented on
   * --calendar-card-title-display). text-indent changes no formatting context.
   *
   * Prose labels are excluded on purpose -- indenting by the width of
   * "Familienkalender: " would consume most of a narrow column. :has() keeps the
   * distinction in CSS so no wrapper element or DOM change is needed.
   *
   * The offsets mirror each label type's own box: icons and images are sized to
   * the event font size, an emoji's advance width runs about 1.25x that, and all
   * three carry the same 4px margin-right. */
  .summary:has(> .label-icon),
  .summary:has(> .label-image) {
    text-indent: calc(-1 * (var(--calendar-card-font-size-event) + 4px));
    padding-inline-start: calc(var(--calendar-card-font-size-event) + 4px);
  }

  .summary:has(> .label-emoji) {
    text-indent: calc(-1 * (var(--calendar-card-font-size-event) * 1.25 + 4px));
    padding-inline-start: calc(var(--calendar-card-font-size-event) * 1.25 + 4px);
  }

  /* Text label styling */
  .calendar-label {
    display: inline;
    margin-right: 4px;
  }

  /* MDI icon label styling */
  .label-icon {
    --mdc-icon-size: var(--calendar-card-font-size-event);
    vertical-align: middle;
    margin-right: 4px;
  }

  /* Image label styling */
  .label-image {
    height: var(--calendar-card-font-size-event);
    width: auto;
    vertical-align: middle;
    margin-right: 4px;
  }

  /* Event weather */
  .event-weather {
    display: flex;
    align-items: center;
    font-weight: 500;
    margin-left: 8px;
    margin-right: 12px;
  }

  .event-weather ha-icon {
    margin-right: 2px;
    --mdc-icon-size: var(--calendar-card-weather-event-icon-size, 14px);
  }

  /* ===== TIME, LOCATION & DESCRIPTION STYLES ===== */

  .time-location {
    display: flex;
    flex-direction: column;
    margin-top: 0;
  }

  .time,
  .location,
  .description {
    display: flex;
    align-items: var(--calendar-card-event-icon-vertical-alignment);
    line-height: 1.2;
    margin-top: 2px;
    margin-right: 12px;
  }

  /*
   * overflow-wrap: break-word is load-bearing, not cosmetic.
   *
   * .description span carries overflow: hidden further down, to give its
   * -webkit-line-clamp something to clip against, and the column-view work extended the
   * same pattern to .time and .location. That declaration is applied unconditionally,
   * but the clamp is not: time_max_lines, location_max_lines and description_max_lines
   * all default to 0, which generateCustomPropertiesObject emits as the keyword none. So
   * at the default the clamp does nothing and only the overflow: hidden survives.
   *
   * That matters because these spans are flex items. Per CSS Flexbox 4.5 the automatic
   * minimum size of a flex item applies only while its overflow is visible; any other
   * value collapses min-width: auto to 0. So a span is free to shrink below the width
   * of its own longest word, and overflow: hidden then clips that word mid-glyph -- with
   * no ellipsis, because these rules never set text-overflow. Measured in list view at a
   * 300px card: a box 167px wide holding a 179px word, painting 12px of the final
   * character and silently dropping the rest.
   *
   * break-word makes the word break to fit rather than overhang, so nothing is clipped.
   * It deliberately does not change min-content -- CSS Text 3 exempts break-word from
   * intrinsic sizing -- so it cannot widen a row that fits today. Below roughly one
   * character of usable width there is nothing left to give: a cramped column narrower
   * than a single glyph still overflows, which is the degenerate limit of
   * min_days_fallback: 'cramp' rather than a defect.
   */
  .time span,
  .location span,
  .description span {
    display: inline-block;
    vertical-align: middle;
    overflow-wrap: break-word;
  }

  /*
   * The time row holds the time itself plus, optionally, a countdown or a progress bar.
   * It wraps, so that a row too narrow for both moves the trailing element onto a second
   * line rather than overflowing its container. Flex resolves wrapping before shrinking,
   * so the time text keeps the full width of the first line and only ever wraps as a last
   * resort, when it does not fit on a line of its own.
   *
   * The list view has a wide event cell and effectively never reaches either point; the
   * column view, whose narrowest track is 152px, reaches the first one routinely.
   *
   * align-items: center below is deliberate and overrides the shared
   * .time, .location, .description rule at equal specificity by source order. It is
   * about this row's siblings -- .time-actual against a countdown or progress bar --
   * not about the icon, which is nested a level deeper. The icon's alignment is honoured
   * on .time-actual; do not "restore" the variable here, because it would tilt the
   * countdown and still leave the icon centred.
   */
  .time {
    font-size: var(--calendar-card-font-size-time);
    color: var(--calendar-card-color-time);
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    flex-wrap: wrap;
    row-gap: 2px;
    column-gap: 8px;
  }

  /*
   * Deliberately shrinkable. This carried flex-shrink: 0 from the commit that added the
   * countdown, to stop a long countdown from squashing the time. Wrapping now serves that
   * intent strictly better -- the countdown leaves the line entirely instead of competing
   * for it -- and removing the lock lets the time wrap instead of overflowing in the one
   * case wrapping cannot help, where the time alone is wider than the column.
   */
  /*
   * The icon's alignment lives here, not on .time.
   *
   * .time is a row of siblings -- this wrapper, plus a countdown or a progress bar --
   * so its align-items positions those against each other and has nothing to say about
   * where the icon sits relative to its own text. .time-actual is the container whose
   * children are (icon, text), which is the same shape .location and .description
   * have, so honouring the option here is what makes the three rows agree.
   *
   * That is also why the shared .time, .location, .description rule above cannot do it:
   * .time's own later rule sets align-items: center at equal specificity and wins on
   * source order, so the variable was dead there — and even had it applied, it would have
   * moved the countdown rather than the icon. A user setting top or bottom was getting
   * two rows out of three, silently, in both views.
   *
   * Safe to change: the option defaults to middle, which resolves to center, so a card
   * that never set it renders identically and the DOM goldens do not move.
   *
   * 🚨 That last paragraph was true when it was written and is not true now, on both
   * halves. The default is top as of v4, so the resolved value is flex-start; and in
   * the countdown's text placement this element's height is the *whole* wrapped block
   * rather than one line, so the option finally has something to choose between. Aligning
   * the clock icon against two lines of "7:00 - 23:59 · in 7 hours" is exactly what the
   * maintainer asked for when the countdown stopped breaking atomically -- and it is also
   * why the default moved, since centring an icon against a two-line block reads as a
   * misalignment rather than as a choice.
   */
  .time-actual {
    display: flex;
    align-items: var(--calendar-card-event-icon-vertical-alignment);
  }

  /*
   * The countdown's text placement -- see EventContentOptions.countdownPlacement.
   *
   * This wrapper is the whole mechanism, and it is the same one .event-weather-text is.
   * .time-actual stays a two-item flex row of (icon, text) so the icon keeps aligning
   * against the text through event_icon_vertical_alignment; everything that has to break
   * as running text goes inside this one item, where it is ordinary inline content in an
   * ordinary inline formatting context. A flex item is placed as a unit, so the time and
   * the countdown as two items could only ever break *between* themselves -- Chromium
   * takes the whole countdown to a second flex line before it will look at the spaces
   * inside either string.
   *
   * Emitted only by that placement, so every rule keyed on it is placement-scoped by
   * construction and reaches the list view nowhere. That is deliberate rather than
   * incidental: the list view's DOM is frozen, and this way its golden does not move at
   * all. .event-weather-text made the opposite call because both of *its* placements
   * carry the same three chips and needed the same wrapper; here the trailing placement
   * would carry an element with one child and no job.
   *
   * min-width: 0 is not optional. As a flex item this box's automatic minimum size is its
   * min-content width, and CSS Text 3 exempts overflow-wrap: break-word from intrinsic
   * sizing -- so a single long word would refuse to shrink and push the row out of the
   * column instead of breaking. The same declaration is on .event-weather-text for the
   * same reason.
   */
  .time .time-actual .time-text {
    min-width: 0;
    flex: 1 1 auto;
  }

  /*
   * The time text, rejoining the inline flow.
   *
   * .time span above blockifies every span in these rows to inline-block, which is
   * atomic: it cannot break across lines, so the countdown beside it could still only move
   * as a whole. Both pieces are put back to inline here, and the time's value is carried by
   * a custom property so a configured time_max_lines can still turn it into the
   * -webkit-box its clamp requires -- see that property in
   * generateCustomPropertiesObject for what setting a limit costs in this placement.
   *
   * vertical-align: baseline undoes the same rule's middle. On a flex item that
   * declaration was inert; on an inline box it is not, and middle would sit the countdown
   * off the time's baseline by half an x-height, which reads as a typo in a phrase meant to
   * scan as one line.
   */
  .time .time-actual .time-text > span {
    display: var(--calendar-card-time-display);
    vertical-align: baseline;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-time-max-lines);
    overflow: hidden;
  }

  /*
   * The countdown inside that wrapper.
   *
   * Always inline, and never the clamp target: time_max_lines limits the *time*, and a
   * limit that silently ate the countdown would be data loss rather than a line limit. The
   * clamp above reaches this span too -- it is the rule's sibling, not its child -- so the
   * three declarations that would enforce one are switched off again here. On an inline
   * box overflow and -webkit-line-clamp are no-ops anyway; they are written out because
   * a future display change on this element would otherwise silently arm them.
   *
   * Both margins are reset because the trailing placement's rule below sets auto at the
   * start and 12px at the end, neither of which means anything useful here -- auto
   * computes to zero on an inline box, and the 12px would open a gap inside a phrase.
   */
  .time .time-actual .time-text > .time-countdown {
    display: inline;
    -webkit-line-clamp: none;
    overflow: visible;
    margin-inline-start: 4px;
    margin-inline-end: 0;
    white-space: normal;
  }

  /*
   * The separator, generated rather than baked into the strings: the countdown is
   * translated into 35 languages and every one of them would otherwise carry punctuation
   * that only this placement wants.
   *
   * 4px on the inline-end here against the wrapper's 4px margin-inline-start above, so the
   * middot is spaced equally on both sides and matches the weather row's separator gutter.
   * Measured live between the two text runs: 11.14px at 12px text, which is 4 + 3.14 + 4.
   *
   * The three characters are the weather row's, for the same reasons, and that rule's
   * comment carries the long version. The differences worth stating here:
   *
   * 🚨 The word joiner is load-bearing in this row, where in the weather row it is belt
   * and braces. An earlier version of this comment said the middot "cannot be orphaned at
   * the end of a line -- there is no white space between the generated glyph and the first
   * word, the gap is margin, and a margin is not a break opportunity". Measured over 53
   * wrapped rows, that held: 0 cases of the dot leading a continuation line. It held
   * because of the *script*, not because of this rule. The character before the dot was
   * always a digit (UAX #14 class NU) or a Latin letter (AL), and LB23/LB28 forbid a break
   * between either and the middot (class AI, resolving to AL). Nothing here was doing it.
   *
   * Force the time text and hold everything else fixed -- 96 rows per string across five
   * viewport widths, counting rows where the dot leads a continuation line:
   *
   *     0:00 - 20:00   NU       0        全天  / 終日      ID       0
   *     Ganztägig      AL       0        하루 종일         Hangul  16
   *     All day        AL       0        9:00～17:00時     ID      32
   *
   * Hangul and an ideograph carry no rule welding them to a following AL, so LB31 permits
   * the break and the dot leads the next line -- which is exactly the defect the maintainer
   * reported in the weather row, reachable here in three of the languages the card ships.
   * U+2060 removes it unconditionally: all eight strings read 0 with it.
   *
   * The zero-width space is the other half, and it is what the maintainer meant by asking
   * for the two rows to match. Without a break opportunity behind the glyph, 20:00 · in is
   * a single unbreakable run: the whole junction moves down together rather than the line
   * ending at the dot, so a narrow column renders 0:00 - / 20:00 · in 4 / hours and wastes
   * the first line. With it the line can end at the dot, as the weather row's now does --
   * 116 rows gained that across the sweep, and none gained a dot alone on a line.
   *
   * The gap before the dot is a margin on the *element* here and on the ::before in the
   * weather row. That asymmetry is deliberate and does no harm: the joiner sits at the head
   * of the element's own content, so a break before the element is the same position as a
   * break before the joiner and is forbidden either way. Leaving it where it is keeps the
   * reset of the trailing placement's auto margin intact -- see the rule above.
   *
   * 🚨 None of this transfers to .column-events .time-countdown::before, the trailing
   * placement. There the countdown is its own flex item and the dot is the first thing in
   * it, so a break straight after the glyph would strand it at the top of that box -- the
   * orphan every version of this rule has been avoiding. The joiner would be inert there
   * as well: there is no preceding text run in the same inline formatting context for it to
   * weld to. stylesheet.test.ts asserts that rule still carries a bare middot.
   */
  .time .time-actual .time-text > .time-countdown::before {
    content: '\\2060·\\200B';
    margin-inline-end: 4px;
  }

  /*
   * margin-inline-start: auto right-aligns the countdown on its own line when the
   * time row wraps. Without it, a lone item on the second line sits at flex-start
   * (justify-content: space-between places a single item at the start), which reads
   * as a stray fragment rather than a right-hand column. On the first line the auto
   * margin is equivalent to space-between, and .time's column-gap keeps the minimum
   * separation the old margin-left: 8px used to provide.
   */
  .time-countdown {
    text-align: right;
    color: var(--calendar-card-color-time);
    font-size: var(--calendar-card-font-size-time);
    margin-inline-start: auto;
    margin-inline-end: 12px;
    white-space: nowrap;
  }

  .location {
    font-size: var(--calendar-card-font-size-location);
    color: var(--calendar-card-color-location);
  }

  .description {
    font-size: var(--calendar-card-font-size-description);
    color: var(--calendar-card-color-description);
  }

  /*
   * The event weather badge in its own-row placement -- see renderEventContent's
   * weatherPlacement parameter. The descendant selector is the whole distinction: the
   * same element inside .summary-row is the list view's title-row badge and must not
   * pick this up. The two placements are structurally exclusive, so no modifier class
   * is needed to tell them apart.
   *
   * These are the .time/.location/.description values, repeated rather than folded into
   * that rule, because those three are shared with the list view and this row exists
   * only here.
   *
   * The two resets below are what actually line the condition icon up under the clock
   * and map-marker icons, and neither is optional. .event-weather carries
   * margin-left: 8px and .event-weather ha-icon carries margin-right: 2px, both
   * for the list view's title-row badge, where the badge floats to the right of the
   * title and has no gutter to join. Inherited here they pushed the icon 8px right of
   * the gutter and its text a further 2px -- measured live at v=260, against an earlier
   * version of this comment that asserted the opposite without checking.
   *
   * font-weight is a third such reset. The badge is 500 so it reads as a distinct chip
   * beside the title; in this placement it is one row among four, and the other three
   * declare no weight at all. Leaving it inherited made the temperature the only
   * semi-bold text in the block.
   *
   * flex-wrap is the fourth, and it is deliberately *not* the wrapping mechanism now.
   * A previous fix let flex wrap the direct span children, which stopped the condition
   * from being squeezed to zero but made the condition an atomic flex item: Chromium
   * collected the whole "· Clear, night" item onto the next flex line before it ever
   * considered the ordinary break opportunity inside the text. The row now keeps one flex
   * line -- icon plus text wrapper -- and the wrapper's own inline formatting context
   * wraps the temperature, UV index and condition as normal running text.
   *
   * The padding and the icon's matching negative margin are a hanging indent, and they
   * are what makes a wrapped line start under the *temperature* rather than under the
   * icon. The icon's own margin box collapses to zero width, so it still paints in the
   * gutter and the first line is unmoved; every subsequent line begins at the padding
   * edge, which is exactly where the temperature sits. .column-events .time carries the
   * same pair for the countdown, for the same reason and with the same shape.
   *
   * The gutter is icon size plus the icon's own 4px trailing margin.
   * --calendar-card-weather-event-icon-size is the host property that carries
   * weather.event.icon_size, so a user who enlarges the icon moves the indent with it.
   * The weather size and colour values are read from host custom properties rather than
   * inline styles, matching the rest of the card's theming surface.
   */
  .time-location .event-weather {
    display: flex;
    flex-wrap: nowrap;
    row-gap: 2px;
    align-items: var(--calendar-card-event-icon-vertical-alignment);
    line-height: 1.2;
    font-weight: normal;
    margin-top: 2px;
    margin-inline-start: 0;
    margin-inline-end: 12px;
    padding-inline-start: calc(var(--calendar-card-weather-event-icon-size, 14px) + 4px);
  }

  .time-location .event-weather ha-icon {
    margin-inline-end: 4px;
    margin-inline-start: calc(-1 * (var(--calendar-card-weather-event-icon-size, 14px) + 4px));
    color: var(--calendar-card-weather-event-color, var(--secondary-text-color));
  }

  .time-location .event-weather .event-weather-text {
    min-width: 0;
    flex: 1 1 auto;
    color: var(--calendar-card-weather-event-color, var(--secondary-text-color));
    overflow-wrap: break-word;
  }

  .time-location .event-weather .event-weather-text > span {
    font-size: var(--calendar-card-weather-event-font-size, 12px);
  }

  /*
   * The condition words.
   *
   * show_conditions states the condition verbally in this placement, which puts
   * variable-length prose into the narrowest layout the card has -- the column track
   * bottoms out at 152px, and German is not kind: "Strömender Regen" is longer than the
   * track it has to sit in.
   *
   * The flex item is the .event-weather-text wrapper, not this span. That distinction is
   * load-bearing: as a direct flex item, the condition moved to a new line as one block.
   * As an inline child of the wrapper, "Clear, night" can break at its space while the
   * generated separator remains attached to the first word.
   *
   * By default the words *wrap* rather than truncate: weather.event.max_lines is 0,
   * which generateCustomPropertiesObject emits as the keyword none, so the clamp below
   * does nothing. That is deliberate and matches the other four line limits -- a wrapped
   * row explains itself, a silently truncated one looks like missing data. Set a limit
   * and the clamp truncates with an ellipsis, exactly as title_max_lines and its three
   * siblings do.
   *
   * hyphens: manual turns off hyphenation for this element and this element only, and
   * the "per element" part is the whole decision. .content-container sets hyphens: auto
   * for the card, which is right for the strings a *user* wrote -- a title or a location
   * can be a long compound noun with no break opportunity in it, and hyphenating beats
   * overflowing. The condition is not one of those. It is generated text that Home
   * Assistant translated, it is at most three short words, and the row already has a
   * better answer for "does not fit": wrap the text normally. Hyphenating
   * it only ever produced 'Sun-' / 'ny', which reads as a rendering fault rather than as
   * typesetting. manual rather than none, so an explicit soft hyphen inside a translated
   * condition is still honoured -- this turns off automatic hyphenation, not the author's.
   *
   * 🚨 overflow-wrap lives on .event-weather-text, one level up, and it was briefly
   * normal on this element -- which is the whole of a bug the maintainer reported: at a
   * larger weather font the condition ran sideways out of its own column into the next
   * one, with a long single word appearing to be cut off mid-glyph. Every part of the
   * diagnosis is a trap, so all of it is worth spelling out.
   *
   *   - The track is not at fault. .day-column carries min-width: 0 and shrinks correctly.
   *   - overflow: hidden below is not the backstop it looks like. At the default
   *     max_lines: 0 the display property beside it resolves to inline, and overflow does
   *     not apply to a non-replaced inline box -- so nothing was clipping. The text
   *     genuinely escaped the column, and what looked like clipping was the next column
   *     painting over it. Set max_lines and the element becomes a -webkit-box, overflow
   *     starts applying, and the symptom disappears -- which is exactly why a fix verified
   *     with a clamp set would have proved nothing about the default path.
   *   - With overflow-wrap: normal a word wider than its container cannot break at all,
   *     and simply overhangs.
   *
   * The reason normal looked safe is a real hazard, which had already been fixed one
   * commit earlier by a different means, and the two got read as one. break-word *was*
   * able to orphan the separator: while the middot was ordinary in-flow content with a
   * break opportunity on either side of it, a break could land after the dot and leave it
   * alone on a line, floated above the row by align-items: center. Turning break-word off
   * afterwards protected against nothing and cost the row its only defence against a long
   * word.
   *
   * 🚨 And putting it back *here* fixes only three quarters of it, which is the part that
   * had to be measured rather than reasoned about. Restoring break-word on this element
   * alone took the worst overhang from 113.3px to 26.6px and left it overflowing. The
   * residue is not this chip's own text: the three chips carry no white space between
   * them, so UV0Regnerisch is a single unbreakable run as far as line breaking is
   * concerned, and the break the browser needs falls on characters belonging to the
   * *previous* chip. overflow-wrap is consulted at the position a break is attempted, so
   * it has to be in effect there too. Measured live at a 98px row and 20px text, worst
   * overhang past the row box: 113.3px at normal, 26.6px with break-word here, and -0.8px
   * with break-word on .event-weather-text. So it is declared on the wrapper and inherited
   * by all three chips, rather than on the one that happens to hold the long word.
   *
   * 🚨 That overhang number is also the worked example of a metric that cannot falsify the
   * hypothesis it came from, and it is recorded in AGENTS.md as such. The bug was believed
   * to be overhang, so overhang was measured, and three versions drove it 113.3 -> 26.6 ->
   * -0.8 while the row was still visibly broken: at -0.8px nothing overflowed and every
   * chip was being severed mid-token instead. Only a screenshot taken after the number
   * already read as finished broke the frame. Do not judge this row by one number.
   *
   * break-word and the separator below are a pair, and the pairing survives the separator
   * going back into flow -- but the argument for it changed completely, so read it there
   * rather than assuming this paragraph still says what it used to.
   */
  .time-location .event-weather .weather-condition {
    display: var(--calendar-card-weather-event-condition-display);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-weather-event-max-lines);
    overflow: hidden;
    hyphens: manual;
  }

  /*
   * The separators.
   *
   * The row is one composed string that breaks like running text. A line ends *after* a
   * middot and the words it introduces start the next line:
   *
   *     29° · UV0 ·
   *     Teilweise bewölkt
   *
   * That is the maintainer's ruling, and it is the fourth iteration of this rule, so the
   * reasoning behind each part is written out rather than left to be rediscovered.
   *
   * The text pieces are inline children of .event-weather-text and the template keeps them
   * adjacent, so no source whitespace participates in the gaps and no break opportunity
   * exists anywhere in the row except the ones generated here. That makes the *order of
   * the characters in this one content string* the whole of the line-breaking behaviour:
   *
   *     '\\2060·\\200B'   ->  29° · UV0 ·  /  Teilweise bewölkt      (wanted)
   *     '\\200B·'         ->  29° · UV0    /  · Teilweise bewölkt    (the reported bug)
   *
   * Three characters, three separate jobs:
   *
   *   - U+2060 WORD JOINER forbids a break *before* the glyph. Together with the margins
   *     -- a margin is not a break opportunity -- that removes every *legal* break in
   *     front of the dot, which is what makes the reported bug structurally impossible
   *     rather than merely unobserved. Measured: 0 occurrences across 539 rows at seven
   *     viewport widths and every weather font size from 8px to 26px, against 444 for the
   *     mechanism this replaced, on the same rows at the same widths.
   *
   *     🚨 What it does *not* do is stop overflow-wrap: break-word taking an *emergency*
   *     break there, and an earlier draft of this comment claimed otherwise -- "the dot
   *     can never begin a line, and a glyph that cannot begin a line cannot be alone on
   *     one". That is false, and it is false in the one direction that matters: break-word
   *     breaks at an arbitrary point when the run between two legal opportunities does not
   *     fit on a line by itself, and [chip text][WJ][dot] is exactly such a run. So when a
   *     column is narrower than one chip plus its separator -- about 30px at 12px text --
   *     the glyph can be pushed onto a line of its own.
   *
   *     Measured on the 25.8px columns that a 12-day card with min_days_fallback: cramp
   *     produces at a 1300px viewport: 0 to 22 occurrences depending on font size. The old
   *     mechanism scored 0 there, because an out-of-flow dot cannot be broken at all --
   *     but it put the dot at the head of a line of words on all 22, which is the bug this
   *     rule exists to fix, on every row. In the same regime the new one also severs fewer
   *     words (14 against 25) and stays inside its column at 26px text, where the old one
   *     escapes by 6.3px. The trade is deliberate and the regime is one where every token
   *     in the row is already being severed.
   *
   *     overflow-wrap: normal on this pseudo-element was tried as a way to forbid the
   *     emergency break. It changes nothing, at any size. Do not re-derive it.
   *   - the middot itself. Not a comma: Home Assistant's own condition vocabulary contains
   *     "Clear, night", and a comma would be indistinguishable from the one inside it.
   *   - U+200B ZERO WIDTH SPACE is the row's only break opportunity between chips. Class
   *     ZW, so it is a break with no width, no ink and no rendered character, and it
   *     provides that break *after* itself -- which is why it goes last. Without it the row
   *     is the single unbreakable run 30degUV7Sonnig and overflow-wrap: break-word has
   *     nothing but emergency breaks to work with: measured at a 98px row and 20px text,
   *     30deg / UV | 7 . Sonni | g, every chip severed mid-token. It also lowers the
   *     wrapper's min-content width from the whole run to one chip plus its separator.
   *
   * 🚨 The trailing margin is on this pseudo-element and not on the chip, and that is not
   * interchangeable. A margin on the chip would sit at the start of the continuation line
   * and indent it 4px past the row's hanging indent -- one line indented and no other,
   * which reads as a rendering fault. Here the break falls after the ZWSP, which is the
   * last thing in the content, so the ::before never splits across the two lines and both
   * its margins stay on the line it started. If a future edit moves the ZWSP off the end,
   * the box splits at the break, CSS 2.1 §9.2.2 puts the end margin on the *last* fragment,
   * and the indent comes back.
   *
   * 🚨 Margins, not spaces, and that is not interchangeable either. A rendered space is a
   * break opportunity, so a space before the glyph would let a line end between the chip
   * and its dot -- putting the dot back at the head of the next line, which is the bug
   * this rule exists to fix. Margins are also exact: the gutter this replaced centred the
   * glyph inside calc(2 * 4px + 0.28em), and 0.28em is an estimate of a middot rather than
   * a measurement of one. Measured live at 20px text the glyph is 5.21px against the 5.6px
   * reserved, so both gaps came out at 4.195px. 4px matches .column-events .time's
   * countdown separator exactly, at any font size, without CSS having to know how wide a
   * middot is.
   *
   * An earlier version of this comment recorded a 3.34px phantom space on the inline-end
   * side of the first middot, caused by a chip template that wrote its letters after a
   * newline and an indent, and cited it as a reason the separator had to leave the flow.
   * That template no longer exists: renderEventWeather writes each chip's own template on
   * one line, so the rendered chips carry the text nodes 29 / ° / UV / 0 and no whitespace
   * at all. Verified by dumping the rendered DOM rather than by reading the template, and
   * again live -- both gaps measure 4.00px. The hazard is gone with its cause, which is
   * what makes going back into flow safe.
   *
   * Scoped under .time-location so it reaches the row placement only -- the list view's
   * title-row badge keeps rendering 30° UV4 run together, which is the deliberate status
   * quo of a layout that has been stable for years. See renderEventWeather for why the
   * condition keeps its capital.
   */
  .time-location .event-weather .event-weather-text > span + span::before {
    content: '\\2060·\\200B';
    margin-inline-start: 4px;
    margin-inline-end: 4px;
  }

  /*
   * Two more properties the badge sets for the title row and this placement has to
   * undo, both on the UV index and both missed when the row was first built.
   *
   * The margin is 2px because in the title row it was the only separator there was;
   * here it lands on top of the one above and makes one gap 2px wider than the other.
   *
   * The weight is the same reset .time-location .event-weather already performs, and it
   * did not reach this element: font-weight: normal on the container is *inherited*, so
   * a descendant that declares 500 outright still wins. The UV index was therefore the
   * only semi-bold text in the whole event block -- precisely the symptom that reset
   * was written to fix, surviving on the one element it could not reach.
   */
  .time-location .event-weather .weather-uv-index {
    margin-inline-start: 0;
    font-weight: normal;
  }

  .description span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-description-max-lines);
    overflow: hidden;
  }

  /* Per-field line clamping. Each clamp lands on the element that directly
     contains the text, because -webkit-line-clamp only takes effect on a
     display: -webkit-box element. Unlimited is expressed as the string 'none',
     emitted by generateCustomPropertiesObject when the option is 0.
     The .event-title clamp is declared with the rest of its styling above,
     because that one has to co-exist with the hanging-indent reset. */

  /* Target the text span inside .time-actual only -- the .time row also holds a
     countdown and/or a progress bar as siblings, and clamping the .time or the
     .time-actual wrapper itself would clamp those away too.

     The child combinator plus :not(.time-text) makes this the *trailing* placement's rule
     and nothing else. In the countdown's text placement the only direct-child span is the
     wrapper, which is excluded, and the pieces inside it are matched by their own rule up
     beside .time-actual. The two selectors are disjoint by construction rather than by
     specificity, so neither can start winning over the other because a rule moved. */
  .time .time-actual > span:not(.time-text) {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-time-max-lines);
    overflow: hidden;
  }

  .location span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--calendar-card-location-max-lines);
    overflow: hidden;
  }

  /* ===== PROGRESS BAR STYLES ===== */

  /* Width falls back here rather than defaulting in DEFAULT_CONFIG, because the two
     placements want different answers and a shipped default can only give one. 60px is
     what the inline bar has always been. See leaves.ts progressPlacement.

     margin-inline-start: auto for the same reason as .time-countdown -- it is the
     other element that can end up alone on the time row's second line. */
  .progress-bar {
    width: var(--calendar-card-progress-bar-width, 60px);
    height: var(--calendar-card-progress-bar-height);
    background-color: color-mix(in srgb, var(--calendar-card-progress-bar-color) 20%, transparent);
    border-radius: 999px;
    overflow: hidden;
    margin-inline-start: auto;
    margin-inline-end: 12px;
  }

  /* The own-row placement. Must stay directly after .progress-bar: both selectors are one
     class, so source order is what lets the modifier win. Unscoped on purpose -- this is
     a placement, not a view. Flush left aligns it with the title above rather than the
     time below. THE ROW WIDTH is the 80%, a percentage because the row is as wide as the
     column; ruled by the maintainer after seeing 75% live. */
  .progress-bar-row {
    width: var(--calendar-card-progress-bar-width, 80%);
    margin-inline-start: 0;
    margin-top: 2px;
  }

  .progress-bar-filled {
    height: 100%;
    background-color: var(--calendar-card-progress-bar-color);
    border-radius: 999px 0 0 999px;
  }

  /* ===== ICON STYLES ===== */

  ha-icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    position: relative;
    vertical-align: top;
    top: 0;
    margin-right: 4px;
  }

  .time ha-icon {
    --mdc-icon-size: var(--calendar-card-icon-size-time, 14px);
  }

  .location ha-icon {
    --mdc-icon-size: var(--calendar-card-icon-size-location, 14px);
  }

  .description ha-icon {
    --mdc-icon-size: var(--calendar-card-icon-size-description, 14px);
  }

  /* ===== STATUS MESSAGES ===== */

  .loading,
  .error {
    text-align: center;
    padding: 16px;
  }

  .error {
    color: var(--error-color);
  }

  /* ===== CORNER LOADING INDICATOR ===== */
  .loading-indicator {
    position: absolute;
    top: calc(var(--ha-card-border-radius, 12px) * 0.5 + 2px);
    right: calc(var(--ha-card-border-radius, 12px) * 0.5 + 2px);
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    pointer-events: none;
  }

  .loading-indicator .spinner {
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border: 2px solid color-mix(in srgb, var(--primary-text-color) 25%, transparent);
    border-top-color: var(--primary-text-color);
    border-radius: 50%;
    animation: ccp-spin 0.8s linear infinite;
  }

  @keyframes ccp-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /*
   * Column view uses a symmetric 16px horizontal padding, matching the inset the
   * list view gives its own content.
   *
   * The list view reaches 16px in two steps -- 8px of card padding plus 8px on
   * .date-column -- and the title matches it the same way, 8px of card padding
   * plus its own 8px margin. A column grid has no such inner offset to lean on,
   * so the card supplies the whole 16px and the title's extra margin is removed
   * below to keep the two aligned.
   *
   * An earlier revision narrowed this to 8px to buy width against the 500px
   * single-span Home Assistant section. That traded a visible misalignment
   * against the title for headroom in the one layout that renders as a list
   * anyway when it does not fit, so it is reverted; see COLUMN_CARD_PADDING_PX.
   *
   * Scoped to the column class so list output is untouched.
   */
  .calendar-card-pro.column-view {
    padding-inline: 16px;
  }

  /* The title's 8px margin exists to add to the list view's 8px card padding.
     Column view already supplies the full 16px, so the margin would push the
     title 8px past the first column's edge. */
  .calendar-card-pro.column-view .card-header {
    margin-inline-start: 0;
  }

  /* ===== COLUMN VIEW STYLES ===== */

  /*
   * Deliberately last in the stylesheet. Several of these rules refine shared classes
   * (.event, .weekday, .day, .month) only inside a column, and equal-specificity rules
   * are resolved by source order, so they must come after the list-view definitions
   * they refine.
   */

  .column-grid {
    display: grid;
    /* grid-template-columns and column-gap are set inline: the track count is the
       number of days being rendered, and the gap is the day_spacing option. */
    align-items: start;
    width: 100%;
  }

  /*
   * Each column is a flex column so that its events stack vertically and the header
   * stays pinned to the top. The grid's own align-items: start keeps a short column
   * from stretching to the height of the busiest day, which would leave its accent
   * borders floating in empty space.
   */
  .day-column {
    display: flex;
    flex-direction: column;
    min-width: 0; /* Allow the track to shrink below its content's intrinsic width. */
  }

  /*
   * The day header. position: relative is retained as the containing block for
   * anything the header needs to position against itself; the today indicator no
   * longer needs it, having moved into normal flow inside .column-date-content.
   *
   * The bottom padding is the whole gap between a day's header and its first event,
   * and it is configurable as day_header_gap. It used to be a hardcoded 4px here plus
   * another 4px of margin under the separator, which meant switching the separator off
   * silently halved the gap: the spacing was an emergent property of two unrelated
   * rules rather than something anyone had chosen. Owning it here makes it constant
   * whether or not a rule is drawn.
   */
  .column-day-header {
    position: relative;
    padding-bottom: var(--calendar-card-column-header-gap, 8px);
  }

  /*
   * The axis flip, in two rows. The list view stacks weekday over day over month down
   * a narrow date column; a column header has the full track width but very little of
   * it -- roughly 150px at the point the view engages.
   *
   * A single row spends about 98px of that on "Mon 10 AUG" alone, leaving the weather
   * badge some 43px, which truncates it to nothing useful. Splitting the weekday onto
   * its own row costs one line of height and returns roughly 115px to weather, because
   * the badge now sits beside the short "10 AUG" pair rather than the whole string.
   * It also reads better: a small weekday, a large number and a small month strung
   * along one line is an odd rhythm horizontally, though it works stacked.
   *
   * Grid rather than flex, because the children arrive as flat siblings from
   * renderDateContent -- the same markup the list view uses, deliberately unwrapped so
   * this stays a pure CSS difference. Named areas place them without extra elements.
   * The height is fixed at two rows by construction, so this does not reintroduce the
   * unpredictable-height problem that the weather badge's nowrap exists to avoid.
   *
   * align-items: baseline keeps the day number and month level within row two, which
   * is what makes a 12px month sit correctly beside a 26px day.
   */
  .column-date-content {
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-template-areas:
      'weekday weekday .'
      'day month weather';
    align-items: baseline;
    column-gap: 6px;
    row-gap: 2px;
    position: relative;
    z-index: 2; /* Above the today indicator, matching the list view. */
    min-width: 0;
  }

  .column-date-content .weekday {
    grid-area: weekday;
  }

  .column-date-content .day {
    grid-area: day;
  }

  .column-date-content .month {
    grid-area: month;
  }

  /*
   * The today indicator as a leading item on the weekday row.
   *
   * It shares the weekday's grid cell rather than taking a track of its own. A
   * dedicated leading track would indent today's day number relative to every other
   * column, breaking the horizontal alignment of the number row that makes the grid
   * scan as a row of days. Sharing the cell confines the shift to the weekday, which
   * is the line the dot belongs to.
   *
   * The weekday is then padded out of the way by exactly the indicator's own width
   * plus a 4px gap, so the reserved space tracks today_indicator_size instead of
   * assuming the 6px default. The padding is applied by the container class rather
   * than by :has(), because the renderer already knows whether an indicator was
   * emitted -- and it knows more than isToday does, since the indicator also
   * declines for type none.
   */
  .column-date-content .today-indicator-container.inline {
    grid-area: weekday;
    justify-self: start;
    align-self: center;
    z-index: 3;
  }

  .column-date-content.with-today-indicator .weekday {
    padding-inline-start: calc(var(--calendar-card-today-indicator-size, 6px) + 4px);
  }

  /*
   * The weather badge sits on the second row, immediately after the month, sharing
   * that row's baseline -- so a header reads as "Tue" over "11 AUG 31deg".
   *
   * justify-self is start, not end. The third track is 1fr and absorbs every pixel of
   * slack, so ending the badge parks it against the *next* column's edge rather than
   * its own: at a 304px column the badge landed 275px from the date it belongs to and
   * 35px from the date it does not. Starting it pins the badge to the track's leading
   * edge, which is the month, making the placement independent of column width.
   *
   * The alternative reviewed alongside this one put the badge on the top row beside
   * the weekday. Both fix the drift; this one was chosen on the maintainer's ruling
   * after live review, and it is also 3px shorter, because the badge shares a row with
   * the tall day number instead of the short weekday.
   *
   * It truncates rather than wrapping, because wrapping would push the header onto a
   * third line and change the height of every column in the row.
   */
  .column-date-content .weather {
    grid-area: weather;
    justify-self: start;
    align-self: baseline;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
   * The column view's separator. The list view separates days with horizontal rules
   * between stacked tables; here the equivalent boundary between days is the grid gap,
   * so the only rule that makes sense is the one under the day header. Opt-in: the
   * element is not rendered at all when the width resolves to 0px, which is the
   * default.
   *
   * Its bottom margin matches the header's bottom padding, so a rule sits centred in
   * the gap rather than adding to one side of it. Turning the rule on therefore widens
   * the gap symmetrically instead of shifting the events down.
   */
  .column-header-separator {
    margin-bottom: var(--calendar-card-column-header-gap, 8px);
  }

  /*
   * Week numbers occupy a reserved row at the top of the day header, above the
   * weekday. The row exists only when week numbers are on, so the default header keeps
   * its two-row shape and pays nothing for a feature that is off.
   *
   * Every column emits a cell whether or not it starts a week -- the non-starts hide
   * theirs -- because an empty grid area collapses, and a collapsed area in some
   * columns and not others would stagger the weekday, day number and event stack
   * across the row. See buildWeekRows in column.ts.
   */
  .column-date-content.with-week-number {
    grid-template-areas:
      'week week .'
      'weekday weekday .'
      'day month weather';
  }

  .column-date-content .column-week-number {
    grid-area: week;
    justify-self: start;

    /* The grid aligns to baselines, which a fixed-height pill has no useful one for.
     * Centring in its own row keeps it off the weekday's baseline entirely. */
    align-self: center;
  }

  .column-events {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /*
   * Every content row inside an event already carries its own 12px trailing margin --
   * .summary, and the shared .time/.location/.description rule -- so an event in a
   * column already ends 12px short of the track's right edge. An earlier revision added
   * padding-inline-end: 12px here on the belief that the trailing gutter was missing,
   * reading the base .event rule's padding-right: 0 in isolation. It was not missing;
   * that padding doubled it to 24px and quietly spent 12px of the column's width, which
   * is the dimension the layout is short of. The rule is gone.
   *
   * What does need correcting is the countdown and the progress bar: both sit inside
   * .time, which already supplies the 12px, and both add a further 12px of their own, so
   * they end 12px inside every other row. Invisible in a list, where nothing lines up
   * against them; obvious in a column once the time row wraps and the trailing element
   * is right-aligned on its own line. Zeroed here rather than in the shared rule so
   * list output is byte-identical.
   */
  .column-events .time-countdown,
  .column-events .progress-bar {
    margin-inline-end: 0;
  }

  /* The countdown in column view (C5). Stays inline with the time, marked off with a
     middot; a row of its own was rejected because every other row leads with an icon and
     a bare text row reads as one that lost its icon. The auto margin and space-between
     together stranded it at the far right of an empty second line once the column got
     narrow, so both go. Stays a flex row -- inline flow would stack .time-actual and the
     countdown and drop align-items. Pinned in stylesheet.test.ts.

     🚨 Two of the sentences below now describe only half of what this view renders, and
     the half they describe is the smaller one. C5 left the countdown a *sibling* of
     .time-actual, which is a flex item, which is placed as a unit -- so the phrase could
     only ever break before the middot, and the icon centred against the time alone while
     the countdown sat on a second flex line outside .time-actual's height. Both were
     reported live. The countdown now moves *into* the time text in this view, through
     countdownPlacement: 'text' and the .time-text wrapper up beside .time-actual, and
     everything about how it wraps, where its separator sits and what it aligns against
     lives there. Read that block first; these rules now serve only the leftover case.

     That leftover case is show_time off with a countdown on, where there is no time text
     to fold into and the countdown is still a trailing <div>. It is unmoved in shape: the
     empty .time-actual collapses to nothing and the countdown sits one column-gap in.

     The padding and .time-actual's matching negative margin are a hanging indent, and
     they are the correction to where the countdown lands once it wraps. Left-aligning it
     was the C5 fix and it put the wrapped countdown under the *icon*; the maintainer
     wants it under the time text, so the middot sits directly below the first digit of
     16:00. The icon is nested inside .time-actual rather than being a child of .time, so
     the negative margin goes on that wrapper: its margin box collapses to zero width,
     the icon still paints in the gutter, and every wrapped line starts at the padding
     edge where the time text begins. .time-location .event-weather carries the same pair
     for the same reason.

     The indent survives the move unchanged, and is in fact now structural rather than
     emergent: .time-text begins at the padding edge because the icon it follows is
     exactly as wide as the gutter, so every line it wraps to begins there too, without
     the second line having to be the one that lands on it.

     box-sizing is not optional here: .time declares width: 100%, so with the inherited
     content-box the padding would be added *outside* that and overflow the column.

     white-space below releases the nowrap the list view sets, and it is the indent's
     own bill being paid. Reserving the gutter costs the wrapped countdown 18px of the
     line it lands on, and a nowrap box cannot give that back: measured at a 90px track,
     'in 10 hours' is 68.7px against 56px of room and overflowed the column by 10.7px --
     which it did not before the indent. Wrapping absorbs it. The nowrap was there to
     stop the separator being orphaned at the end of a line, and that job is now done
     properly, by the word joiner in the folded separator's own content rather than by
     forbidding the whole phrase to wrap -- see that rule for why the margin-and-no-space
     argument this comment used to make was true only for Latin scripts. Scoped to the
     column, so the list view keeps its single line. */
  .column-events .time {
    justify-content: flex-start;
    box-sizing: border-box;
    column-gap: 4px;
    padding-inline-start: calc(var(--calendar-card-icon-size-time, 14px) + 4px);
  }

  .column-events .time-actual {
    margin-inline-start: calc(-1 * (var(--calendar-card-icon-size-time, 14px) + 4px));
  }

  .column-events .time-countdown {
    margin-inline-start: 0;
    text-align: start;
    white-space: normal;
  }

  /* Generated, not baked into the strings: the countdown is translated into 35 languages
     and every one would then carry the punctuation in list view too. .time's column-gap
     supplies the leading space; this matches it, so the middot is spaced equally on both
     sides. Inside the nowrap box, so the separator travels with the phrase instead of
     being orphaned at the end of the line.

     4px, down from the 8px this and the column-gap above both inherited from .time, and
     now matching the weather row's separator gutter. */
  .column-events .time-countdown::before {
    content: '·';
    margin-inline-end: 4px;
  }

  /*
   * A vertical rule in the gutter between two day columns: day, week or month.
   *
   * Everything variable -- width, colour, which track it precedes and the negative
   * margin that centres it -- is set inline per rule, because all four depend on the
   * boundary and on day_spacing. Only the two properties that never vary live here.
   *
   * align-self: stretch is the load-bearing one. The grid sets align-items: start so a
   * quiet day is only as tall as its own events, and a rule inheriting that would be
   * as short as the column it happens to precede -- so a run of rules would have
   * ragged lengths determined by which day sat to their right. Stretching against the
   * row instead makes every rule the height of the busiest day, which is what a
   * separator between days has to be to read as one.
   *
   * justify-self: start pins it to the inline-start edge of its cell, which the
   * inline margin then pulls out into the gutter. Without it the item would stretch
   * to fill the track, and the inline width would be fighting a stretched box.
   */
  .column-separator {
    align-self: stretch;
    justify-self: start;
    pointer-events: none;
  }
`;

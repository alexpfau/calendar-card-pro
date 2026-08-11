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
    '--calendar-card-progress-bar-width': config.progress_bar_width,
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

    // Weather styling properties
    '--calendar-card-weather-date-icon-size': config.weather?.date?.icon_size || '14px',
    '--calendar-card-weather-date-font-size': config.weather?.date?.font_size || '12px',
    '--calendar-card-weather-date-color':
      config.weather?.date?.color || 'var(--primary-text-color)',
    '--calendar-card-weather-event-icon-size': config.weather?.event?.icon_size || '14px',
    '--calendar-card-weather-event-font-size': config.weather?.event?.font_size || '12px',
    '--calendar-card-weather-event-color':
      config.weather?.event?.color || 'var(--primary-text-color)',
  };

  // Optional properties
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
  .date-column .weather {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .weather ha-icon {
    margin-right: 1px;
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

  .time span,
  .location span,
  .description span {
    display: inline-block;
    vertical-align: middle;
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
  .time-actual {
    display: flex;
    align-items: center;
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
   */
  .time-location .event-weather {
    display: flex;
    align-items: var(--calendar-card-event-icon-vertical-alignment);
    line-height: 1.2;
    font-weight: normal;
    margin-top: 2px;
    margin-inline-start: 0;
    margin-inline-end: 12px;
  }

  .time-location .event-weather ha-icon {
    margin-inline-end: 4px;
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
     .time-actual wrapper itself would clamp those away too. */
  .time .time-actual span {
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

  /* margin-inline-start: auto for the same reason as .time-countdown -- it is the
     other element that can end up alone on the time row's second line. */
  .progress-bar {
    width: var(--calendar-card-progress-bar-width);
    height: var(--calendar-card-progress-bar-height);
    background-color: color-mix(in srgb, var(--calendar-card-progress-bar-color) 20%, transparent);
    border-radius: 999px;
    overflow: hidden;
    margin-inline-start: auto;
    margin-inline-end: 12px;
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

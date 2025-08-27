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
    '--calendar-card-color-weekday': config.weekday_color,
    '--calendar-card-color-day': config.day_color,
    '--calendar-card-color-month': config.month_color,
    '--calendar-card-color-event': config.event_color,
    '--calendar-card-color-time': config.time_color,
    '--calendar-card-color-location': config.location_color,
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
    '--calendar-card-date-column-width': `${parseFloat(config.day_font_size) * 1.75}px`,
    '--calendar-card-date-column-vertical-alignment': config.date_vertical_alignment,
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

    /* Typography */
    color: var(--calendar-card-color-title, var(--primary-text-color));
    font-size: var(--calendar-card-font-size-title, var(--paper-font-headline_-_font-size));
    font-weight: var(--paper-font-headline_-_font-weight);
    letter-spacing: var(--paper-font-headline_-_letter-spacing);
    line-height: var(--paper-font-headline_-_line-height);

    /* Additional Typography */
    -webkit-font-smoothing: var(--paper-font-headline_-_-webkit-font-smoothing);
    text-rendering: var(--paper-font-common-expensive-kerning_-_text-rendering);
    opacity: var(--dark-primary-opacity);
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

  /* Today indicator styling */
  .today-indicator-container {
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

  /* Today indicator styling */
  .today-indicator-container {
    position: absolute;
    color: var(--calendar-card-today-indicator-color);
    pointer-events: none;
    z-index: 1;
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

  /* ===== EVENT STYLES ===== */

  /* Base event */
  .event {
    padding: var(--calendar-card-event-spacing) 0 var(--calendar-card-event-spacing) 12px;
    border-radius: 0;
  }

  /* Event positioning variations */
  .event-first.event-last {
    border-radius: 0 var(--calendar-card-event-border-radius)
      var(--calendar-card-event-border-radius) 0;
  }

  .event-first {
    border-radius: 0 var(--calendar-card-event-border-radius) 0 0;
  }

  .event-middle {
    /* No additional styles needed */
  }

  .event-last {
    border-radius: 0 0 var(--calendar-card-event-border-radius) 0;
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

  .summary {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-title {
    font-size: var(--calendar-card-font-size-event);
    font-weight: 500;
    line-height: 1.2;
    color: var(--calendar-card-color-event);
    margin-right: 12px;
    padding-bottom: 2px;
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
    font-weight: 500;
    margin-left: 8px;
    margin-right: 12px;
  }

  .event-weather ha-icon {
    margin-right: 2px;
  }

  /* ===== TIME & LOCATION STYLES ===== */

  .time-location {
    display: flex;
    flex-direction: column;
    margin-top: 0;
  }

  .time,
  .location {
    display: flex;
    align-items: center;
    line-height: 1.2;
    margin-top: 2px;
    margin-right: 12px;
  }

  .time span,
  .location span {
    display: inline-block;
    vertical-align: middle;
  }

  .time {
    font-size: var(--calendar-card-font-size-time);
    color: var(--calendar-card-color-time);
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .time-actual {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .time-countdown {
    text-align: right;
    color: var(--calendar-card-color-time);
    font-size: var(--calendar-card-font-size-time);
    margin-left: 8px;
    margin-right: 12px;
    white-space: nowrap;
  }

  .location {
    font-size: var(--calendar-card-font-size-location);
    color: var(--calendar-card-color-location);
  }

  /* ===== PROGRESS BAR STYLES ===== */

  .progress-bar {
    width: var(--calendar-card-progress-bar-width);
    height: var(--calendar-card-progress-bar-height);
    background-color: color-mix(in srgb, var(--calendar-card-progress-bar-color) 20%, transparent);
    border-radius: 999px;
    overflow: hidden;
    margin-left: 8px;
    margin-right: 12px;
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

  /* ===== STATUS MESSAGES ===== */

  .loading,
  .error {
    text-align: center;
    padding: 16px;
  }

  .error {
    color: var(--error-color);
  }
`;

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
    '--calendar-card-line-color-vertical': config.vertical_line_color,
    '--calendar-card-line-width-vertical': config.vertical_line_width,
    '--calendar-card-day-spacing': config.day_spacing,
    '--calendar-card-event-spacing': config.event_spacing,
    '--calendar-card-spacing-additional': config.additional_card_spacing,
    '--calendar-card-height': config.height || 'auto',
    '--calendar-card-max-height': config.max_height,
    '--calendar-card-icon-size-time': config.time_icon_size || '14px',
    '--calendar-card-icon-size-location': config.location_icon_size || '14px',
    '--calendar-card-date-column-width': `${parseFloat(config.day_font_size) * 1.75}px`,
    '--calendar-card-date-column-vertical-alignment': config.date_vertical_alignment,
    '--calendar-card-event-border-radius': 'calc(var(--ha-card-border-radius, 10px) / 2)',
    '--ha-ripple-hover-opacity': '0.04',
    '--ha-ripple-hover-color': config.vertical_line_color,
    '--ha-ripple-pressed-opacity': '0.12',
    '--ha-ripple-pressed-color': config.vertical_line_color,

    // Week and month separator properties
    '--calendar-card-week-number-font-size': config.week_number_font_size,
    '--calendar-card-week-number-color': config.week_number_color,
    '--calendar-card-week-number-bg-color': config.week_number_background_color,

    // Custom empty day color with opacity for default value
    '--calendar-card-empty-day-color':
      config.empty_day_color === Config.DEFAULT_CONFIG.empty_day_color
        ? 'rgba(var(--rgb-primary-text-color, 255, 255, 255), 0.6)'
        : config.empty_day_color,
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
    padding: calc(var(--calendar-card-spacing-additional) + 16px) 16px;

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
    margin: 0 0 16px 0;
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
  }

  /* Week separator (full-width) - Used when show_week_numbers is null
   * Creates a horizontal line at week boundaries without week number pill
   * Margins are applied dynamically in createSeparatorStyle in render.ts */
  .week-separator {
    width: 100%;
    border-top-style: solid; /* Ensure line is visible */
  }

  /* Month separator - Used at month boundaries
   * Creates a horizontal line between months, has priority over week separators
   * Margins are applied dynamically in createSeparatorStyle in render.ts */
  .month-separator {
    width: 100%;
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
    vertical-align: var(--calendar-card-date-column-vertical-alignment);
    text-align: center;

    /* Borders & Spacing */
    padding-right: 12px;
  }

  .date-content {
    display: flex;
    flex-direction: column;
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

  .event-title {
    font-size: var(--calendar-card-font-size-event);
    font-weight: 500;
    line-height: 1.2;
    color: var(--calendar-card-color-event);
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
  }

  .time span,
  .location span {
    display: inline-block;
    vertical-align: middle;
  }

  .time {
    font-size: var(--calendar-card-font-size-time);
    color: var(--calendar-card-color-time);
  }

  .location {
    font-size: var(--calendar-card-font-size-location);
    color: var(--calendar-card-color-location);
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

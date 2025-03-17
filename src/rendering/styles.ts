/* eslint-disable import/order */
/**
 * Styles module for Calendar Card Pro
 *
 * Contains functions for generating card styles based on configuration.
 */

import * as Constants from '../config/constants';
import type * as Types from '../config/types';

//-----------------------------------------------------------------------------
// HIGH-LEVEL API FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Generate complete styles for the calendar card
 *
 * @param config - Card configuration
 * @returns Complete CSS string with all styles
 */
export function getStyles(config: Types.Config): string {
  // Combine custom properties with base styles
  return `
    ${generateCustomProperties(config)}
    ${generateBaseStyles()}
  `;
}

/**
 * Generate a simple error message style
 *
 * Creates minimal CSS for error message display
 *
 * @returns CSS string for error message styling
 */
export function getErrorStyles(): string {
  return `
    .card-content {
      background: var(--card-background-color, #FFF);
      border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color));
      border-radius: var(--ha-card-border-radius, 10px);
      padding: 16px;
      color: var(--primary-text-color);
      text-align: center;
    }
  `;
}

//-----------------------------------------------------------------------------
// STYLE GENERATION HELPERS
//-----------------------------------------------------------------------------

/**
 * Generate CSS custom properties based on card configuration
 *
 * Creates a set of CSS custom properties that control the appearance
 * of the calendar card based on user configuration
 *
 * @param config - Card configuration
 * @returns CSS string with custom property definitions
 */
export function generateCustomProperties(config: Types.Config): string {
  return `
    :host {
      --card-font-size-title: ${config.title_font_size};
      --card-font-size-weekday: ${config.weekday_font_size};
      --card-font-size-day: ${config.day_font_size};
      --card-font-size-month: ${config.month_font_size};
      --card-font-size-event: ${config.event_font_size};
      --card-font-size-time: ${config.time_font_size};
      --card-font-size-location: ${config.location_font_size};
      --card-color-title: ${config.title_color};
      --card-color-weekday: ${config.weekday_color};
      --card-color-day: ${config.day_color};
      --card-color-month: ${config.month_color};
      --card-color-event: ${config.event_color};
      --card-color-time: ${config.time_color};
      --card-color-location: ${config.location_color};
      --card-line-color-vertical: ${config.vertical_line_color};
      --card-line-color-horizontal: ${config.horizontal_line_color};
      --card-line-width-vertical: ${config.vertical_line_width};
      --card-line-width-horizontal: ${config.horizontal_line_width};
      --card-spacing-row: ${config.row_spacing};
      --card-spacing-additional: ${config.additional_card_spacing};
      --card-icon-size: ${config.time_location_icon_size};
      --card-date-column-width: ${parseFloat(config.day_font_size) * 1.75}px;
      --card-custom-background: ${config.background_color};
      --ha-ripple-hover-opacity: ${Constants.UI.RIPPLE_OPACITY.HOVER};
      --ha-ripple-hover-color: ${config.vertical_line_color};
      --ha-ripple-pressed-opacity: ${Constants.UI.RIPPLE_OPACITY.PRESSED};
      --ha-ripple-pressed-color: ${config.vertical_line_color};
    }
  `;
}

/**
 * Generate base styles for the calendar card
 *
 * Creates the foundational CSS styles that define the structure and
 * basic appearance of the calendar card
 *
 * @returns CSS string with base styles
 */
export function generateBaseStyles(): string {
  return `

    :host {
      display: block;
    }

    .card-container {
      cursor: pointer;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      border-radius: var(--ha-card-border-radius, 10px);
      transition: transform 180ms ease-in-out;
    }
    
    .background {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      border-radius: var(--ha-card-border-radius, 12px);
      margin: calc(-1 * var(--ha-card-border-width, 1px));
      overflow: hidden;
    }
    
    .content-container {
      position: relative;
      z-index: 1;
    }
    
    .card-content {
      background: var(--card-custom-background, var(--card-background-color, #FFF));
      border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color));
      border-radius: var(--ha-card-border-radius, 10px);
      padding: 16px;
      padding-top: calc(16px + var(--card-spacing-additional));
      padding-bottom: calc(16px + var(--card-spacing-additional));
    }

    .title {
      font-size: var(--card-font-size-title);
      line-height: var(--card-font-size-title);
      font-weight: 500;
      color: var(--card-color-title);
      margin-top: 0px;
      margin-bottom: 16px;
    }

    ha-icon {
      margin-right: 4px;
      --mdc-icon-size: var(--card-icon-size);
      vertical-align: middle;
      position: relative;
      transform: translateZ(0);
    }

    table {
      width: 100%;
      table-layout: fixed;
      border-spacing: 0;
      margin-bottom: var(--card-spacing-row);
      border-bottom: var(--card-line-width-horizontal) solid var(--card-line-color-horizontal);
      padding-bottom: var(--card-spacing-row);
    }

    .date {
      width: var(--card-date-column-width);
      text-align: center;
      padding-right: 12px;
      border-right: var(--card-line-width-vertical) solid var(--card-line-color-vertical);
      vertical-align: top;
    }

    .weekday {
      font-size: var(--card-font-size-weekday);
      line-height: var(--card-font-size-weekday);
      color: var(--card-color-weekday);
    }

    .day {
      font-size: var(--card-font-size-day);
      line-height: var(--card-font-size-day);
      font-weight: 500;
      color: var(--card-color-day);
    }

    .month {
      font-size: var(--card-font-size-month);
      line-height: var(--card-font-size-month);
      text-transform: uppercase;
      color: var(--card-color-month);
    }
    .event {
      padding-left: 12px;
    }
    
    .event-not-first {
      padding-top: 4px;
    }
    
    .event-title {
      font-size: var(--card-font-size-event);
      font-weight: 500;
      color: var(--card-color-event);
    }

    .time-location {
      display: flex;
      flex-direction: column;
      margin-top: 0px;
    }

    .time, .location {
      display: flex;
      align-items: center;
      line-height: 1.2;
      margin-top: 2px;
    }
    
    .time ha-icon, .location ha-icon {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: var(--card-icon-size);
      width: var(--card-icon-size);
      vertical-align: top;
      position: relative;
      top: 0px;
    }
    
    .time span, .location span {
      display: inline-block;
      vertical-align: middle;
    }
    
    .time {
      font-size: var(--card-font-size-time);
      color: var(--card-color-time);
    }

    .location {
      font-size: var(--card-font-size-location);
      color: var(--card-color-location);
    }

    table:last-of-type {
      margin-bottom: 0;
      border-bottom: 0;
      padding-bottom: 0;
    }

    .no-events {
      text-align: center;
      color: var(--secondary-text-color);
      font-style: italic;
      padding: 16px;
    }
  `;
}

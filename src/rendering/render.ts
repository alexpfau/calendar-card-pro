/* eslint-disable import/order */
/**
 * Rendering module for Calendar Card Pro
 *
 * Contains pure functions for rendering the calendar card's UI components.
 * These functions generate Lit TemplateResult objects that can be used
 * within the main component's render method.
 */

import { TemplateResult, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as FormatUtils from '../utils/format';
import * as EventUtils from '../utils/events';

//-----------------------------------------------------------------------------
// CONTENT GENERATION FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Render a single day with its events
 *
 * @param day - Day data containing events
 * @param config - Card configuration
 * @param language - Language code for translations
 * @returns TemplateResult for the day
 */
export function renderDay(
  day: Types.EventsByDay,
  config: Types.Config,
  language: string,
): TemplateResult {
  return html`
    <table>
      ${repeat(
        day.events,
        (event, index) => `${event._entityId}-${event.summary}-${index}`,
        (event, index) => renderEvent(event, day, index, config, language),
      )}
    </table>
  `;
}

/**
 * Render a single event
 *
 * @param event - Event data to render
 * @param day - Day that contains this event
 * @param index - Event index within the day
 * @param config - Card configuration
 * @param language - Language code for translations
 * @returns TemplateResult for the event
 */
export function renderEvent(
  event: Types.CalendarEventData,
  day: Types.EventsByDay,
  index: number,
  config: Types.Config,
  language: string,
): TemplateResult {
  // Get color from config based on entity ID
  const entityColor = EventUtils.getEntityColor(event._entityId, config);

  // Format event time and location
  const eventTime = FormatUtils.formatEventTime(event, config, language);
  const eventLocation =
    event.location && config.show_location
      ? FormatUtils.formatLocation(event.location, config.remove_location_country)
      : '';

  // Determine event position for styling
  const isFirst = index === 0;
  const isLast = index === day.events.length - 1;
  const isMiddle = !isFirst && !isLast;

  // Create class map with position classes
  const eventClasses = {
    event: true,
    'event-first': isFirst,
    'event-middle': isMiddle,
    'event-last': isLast,
  };

  return html`
    <tr>
      ${index === 0
        ? html`
            <td class="date-column" rowspan="${day.events.length}">
              <div class="date-content">
                <div class="weekday">${day.weekday}</div>
                <div class="day">${day.day}</div>
                ${config.show_month ? html`<div class="month">${day.month}</div>` : ''}
              </div>
            </td>
          `
        : ''}
      <td class=${classMap(eventClasses)}>
        <div class="event-content">
          <div class="event-title" style="color: ${entityColor}">${event.summary}</div>
          <div class="time-location">
            ${eventTime
              ? html`
            <div class="time">
              <ha-icon icon="mdi:clock-outline"></ha-icon>
              <span>${eventTime}</span>
            </div>
                `
              : ''}
            ${eventLocation
              ? html`
                  <div class="location">
                    <ha-icon icon="mdi:map-marker"></ha-icon>
                    <span>${eventLocation}</span>
                  </div>
                `
              : ''}
          </div>
        </div>
      </td>
    </tr>
  `;
}

/**
 * Render error, loading, or empty states
 *
 * @param state - State to render ('loading', 'empty', or 'error')
 * @param config - Card configuration
 * @param language - Language code for translations
 * @returns TemplateResult for the state
 */
export function renderError(
  state: 'loading' | 'empty' | 'error',
  config: Types.Config,
  language: string,
): TemplateResult {
  const translations = Localize.getTranslations(language);

  if (state === 'loading') {
    return html`
      <ha-card>
        <div class="calendar-card">
          <div class="loading">${translations.loading}</div>
        </div>
      </ha-card>
    `;
  }

  if (state === 'error') {
    return html`
      <ha-card>
        <div class="calendar-card">
          <div class="error">${translations.error}</div>
        </div>
      </ha-card>
    `;
  }

  // Empty state
  const now = new Date();
  const emptyDay = {
    weekday: Localize.getDayName(language, now.getDay()),
    day: now.getDate(),
    month: Localize.getMonthName(language, now.getMonth()),
  };

  return html`
    <ha-card>
      <div class="calendar-card">
        <table>
          <tr>
            <td class="date-column" rowspan="1">
              <div class="date-content">
                <div class="weekday">${emptyDay.weekday}</div>
                <div class="day">${emptyDay.day}</div>
                ${config.show_month ? html`<div class="month">${emptyDay.month}</div>` : ''}
              </div>
            </td>
            <td class="event">
              <div class="event-content">
                <div class="event-title">${translations.noEvents}</div>
              </div>
            </td>
          </tr>
        </table>
      </div>
    </ha-card>
  `;
}

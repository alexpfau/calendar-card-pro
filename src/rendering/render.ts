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
import { styleMap } from 'lit/directives/style-map.js';
import { repeat } from 'lit/directives/repeat.js';

import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as FormatUtils from '../utils/format';
import * as EventUtils from '../utils/events';

//-----------------------------------------------------------------------------
// MAIN CARD STRUCTURE RENDERING
//-----------------------------------------------------------------------------

/**
 * Render the main calendar card structure
 * Creates a stable DOM structure for card-mod compatibility
 *
 * @param customStyles Custom style properties from configuration
 * @param title Card title from configuration
 * @param content Main card content (events or status)
 * @param handlers Event handler functions
 * @returns TemplateResult for the complete card
 */
export function renderMainCardStructure(
  customStyles: Record<string, string>,
  title: string | undefined,
  content: TemplateResult,
  handlers: {
    keyDown: (ev: KeyboardEvent) => void;
    pointerDown: (ev: PointerEvent) => void;
    pointerUp: (ev: PointerEvent) => void;
    pointerCancel: (ev: Event) => void;
    pointerLeave: (ev: Event) => void;
  },
): TemplateResult {
  return html`
    <ha-card
      class="calendar-card-pro"
      style=${styleMap(customStyles)}
      tabindex="0"
      @keydown=${handlers.keyDown}
      @pointerdown=${handlers.pointerDown}
      @pointerup=${handlers.pointerUp}
      @pointercancel=${handlers.pointerCancel}
      @pointerleave=${handlers.pointerLeave}
    >
      <ha-ripple></ha-ripple>

      <!-- Title is always rendered with the same structure, even if empty -->
      <div class="header-container">
        ${title
          ? html`<h1 class="card-header">${title}</h1>`
          : html`<div class="card-header-placeholder"></div>`}
      </div>

      <!-- Content container is always present -->
      <div class="content-container">${content}</div>
    </ha-card>
  `;
}

/**
 * Render card content based on state
 *
 * @param state Card state (loading, error, no entities, events)
 * @param config Card configuration
 * @param language Language code for translations
 * @param events Calendar events grouped by day
 * @returns Template result for card content
 */
export function renderCardContent(
  state: 'loading' | 'error' | 'empty' | 'events',
  config: Types.Config,
  language: string,
  events?: Types.EventsByDay[],
): TemplateResult {
  // Show error states
  if (state === 'loading' || state === 'error' || state === 'empty') {
    return renderError(state, config, language);
  }

  // Regular content rendering (events grouped by day)
  if (events && events.length > 0) {
    return html`${events.map((day) => renderDay(day, config, language))}`;
  }

  // Fallback for empty events
  return renderError('empty', config, language);
}

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
  // Check if this day is today
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDate = new Date(day.timestamp);
  const isToday = dayDate.toDateString() === todayStart.toDateString();

  return html`
    <table class="day-table ${isToday ? 'today' : 'future-day'}">
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
  // Get colors from config based on entity ID
  const entityColor = EventUtils.getEntityColor(event._entityId, config);

  // Get line color (solid) and background color (with opacity)
  const entityAccentColor = EventUtils.getEntityAccentColorWithOpacity(event._entityId, config);

  // Explicitly check if event_background_opacity is defined and greater than 0
  const backgroundOpacity =
    config.event_background_opacity > 0 ? config.event_background_opacity : 0;
  const entityAccentBackgroundColor =
    backgroundOpacity > 0
      ? EventUtils.getEntityAccentColorWithOpacity(event._entityId, config, backgroundOpacity)
      : ''; // Empty string for no background

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
      <td
        class=${classMap(eventClasses)}
        style="border-left: var(--calendar-card-line-width-vertical) solid ${entityAccentColor}; background-color: ${entityAccentBackgroundColor};"
      >
        <div class="event-content">
          <div class="event-title" style="color: ${entityColor}">
            ${event._entityLabel
              ? html`<span class="calendar-label">${event._entityLabel}</span> `
              : ''}${event.summary}
          </div>
          <div class="time-location">
            ${config.show_time
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
      <div class="calendar-card">
        <div class="loading">${translations.loading}</div>
      </div>
    `;
  }

  if (state === 'error') {
    return html`
      <div class="calendar-card">
        <div class="error">${translations.error}</div>
      </div>
    `;
  }

  // Empty state
  const now = new Date();
  const emptyDay = {
    weekday: Localize.getDayName(language, now.getDay()),
    day: now.getDate(),
    month: Localize.getMonthName(language, now.getMonth()),
  };

  // Get the accent color for the empty state's vertical line
  const accentColor = config.vertical_line_color || 'var(--calendar-card-line-color-vertical)';

  return html`
    <div class="calendar-card">
      <table class="day-table today">
        <tr>
          <td class="date-column" rowspan="1">
            <div class="date-content">
              <div class="weekday">${emptyDay.weekday}</div>
              <div class="day">${emptyDay.day}</div>
              ${config.show_month ? html`<div class="month">${emptyDay.month}</div>` : ''}
            </div>
          </td>
          <td
            class="event event-first event-last"
            style="border-left: var(--calendar-card-line-width-vertical) solid ${accentColor};"
          >
            <div class="event-content">
              <div class="no-events">${translations.noEvents}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

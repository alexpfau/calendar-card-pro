/**
 * List-view rendering functions for Calendar Card Pro.
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Leaves from './leaves';
import * as Presentation from './presentation';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import * as Localize from '../translations/localize';

/**
 * Re-exported so the card can dispatch between views through a single import namespace. Keeping both renderers reachable as `Render.*` means the two call
 */

export { renderColumnGroupedEvents } from './column';

//-----------------------------------------------------------------------------
// MAIN CARD STRUCTURE RENDERING
//-----------------------------------------------------------------------------

/**
 * Render the main calendar card structure Creates a stable DOM structure for card-mod compatibility
 *
 * @param customStyles Custom style properties from configuration
 * @param title Card title from configuration
 * @param content Main card content (events or status)
 * @param handlers Event handler functions
 * @param maxHeightSet Flag to add max-height-set class
 * @param isLoading Flag to mark the card as busy while events load
 * @param titlePending True while a templated title awaits its first value
 * @param effectiveView The view actually being rendered, after any width fallback
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
  maxHeightSet: boolean = false,
  isLoading: boolean = false,
  titlePending: boolean = false,
  effectiveView: Types.EffectiveView = 'list',
): TemplateResult {
  const cardClasses = [
    'calendar-card-pro',
    maxHeightSet ? 'max-height-set' : '',
    ViewConfig.viewCssClass(effectiveView),
  ]
    .filter((cls) => cls !== '')
    .join(' ');

  return html`
    <ha-card
      class=${cardClasses}
      style=${styleMap(customStyles)}
      tabindex="0"
      aria-busy=${isLoading ? 'true' : 'false'}
      @keydown=${handlers.keyDown}
      @pointerdown=${handlers.pointerDown}
      @pointerup=${handlers.pointerUp}
      @pointercancel=${handlers.pointerCancel}
      @pointerleave=${handlers.pointerLeave}
    >
      <ha-ripple></ha-ripple>

      ${isLoading
        ? html`
            <div class="loading-indicator" role="status" aria-live="polite" title="Loading">
              <div class="spinner" aria-hidden="true"></div>
            </div>
          `
        : nothing}

      <!-- Title is always rendered with the same structure, even if empty.
           A templated title keeps the h1 from first paint so the element
           identity does not change when its value arrives. -->
      <div class="header-container">
        ${title || titlePending
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
 * @param state Card state (loading, error)
 * @param language Language code for translations
 * @returns Template result for card content
 */

export function renderCardContent(state: 'loading' | 'error', language: string): TemplateResult {
  const translations = Localize.getTranslations(language);

  if (state === 'loading') {
    return html`
      <div class="calendar-card">
        <div class="loading">${translations.loading}</div>
      </div>
    `;
  }

  return html`
    <div class="calendar-card">
      <div class="error">${translations.error}</div>
    </div>
  `;
}

//-----------------------------------------------------------------------------
// SEPARATOR RENDERING HELPERS
//-----------------------------------------------------------------------------

/**
 * Create consistent separator styles for any type of horizontal separator Properly calculates margins based on day_spacing to ensure vertical centering
 *
 * @param lineWidth - Border width for the separator
 * @param lineColor - Border color for the separator
 * @param config - Card configuration for spacing values
 * @param separatorType - Type of separator (day, week, or month)
 * @returns Style object for use with styleMap
 */

function createSeparatorStyle(
  lineWidth: string,
  lineColor: string,
  config: Types.Config,
  separatorType: 'day' | 'week' | 'month' = 'day',
): Record<string, string> {
  const baseSpacing = parseFloat(config.day_spacing);

  if (separatorType === 'day') {
    return {
      borderTopWidth: lineWidth,
      borderTopColor: lineColor,
      borderTopStyle: 'solid',
      marginTop: '0px', // No additional margin needed on top (table already has margin)
      marginBottom: `${baseSpacing}px`, // Equal spacing below
    };
  }

  let multiplier = Constants.UI.SEPARATOR_SPACING.WEEK; // Default to week multiplier
  if (separatorType === 'month') {
    multiplier = Constants.UI.SEPARATOR_SPACING.MONTH;
  }

  const finalSpacing = baseSpacing * multiplier;

  return {
    borderTopWidth: lineWidth,
    borderTopColor: lineColor,
    borderTopStyle: 'solid',
    marginTop: `${finalSpacing}px`,
    marginBottom: `${finalSpacing}px`,
  };
}

/**
 * Render a horizontal separator line with consistent styling
 *
 * @param lineWidth - Width of the separator line
 * @param lineColor - Color of the separator line
 * @param className - CSS class to apply (week-separator or month-separator)
 * @param config - Card configuration
 * @param isFirstWeek - Whether this is the first week in the view
 * @returns TemplateResult or nothing
 */

function renderHorizontalSeparator(
  lineWidth: string,
  lineColor: string,
  className: string,
  config: Types.Config,
  isFirstWeek: boolean = false,
  separatorType: 'day' | 'week' | 'month' = 'day',
): TemplateResult | typeof nothing {
  if (lineWidth === '0px' || isFirstWeek) {
    return nothing;
  }

  const separatorStyle = createSeparatorStyle(lineWidth, lineColor, config, separatorType);

  return html`<div class="${className}" style=${styleMap(separatorStyle)}></div>`;
}

/**
 * Render a month separator line
 *
 * @param config - Card configuration
 * @returns TemplateResult or nothing
 */

function renderMonthSeparator(config: Types.Config): TemplateResult | typeof nothing {
  return renderHorizontalSeparator(
    config.month_separator_width,
    config.month_separator_color,
    'month-separator',
    config,
    false,
    'month',
  );
}

/**
 * Render a full-width week separator line (when show_week_numbers is null)
 *
 * @param config - Card configuration
 * @param isFirstWeek - Whether this is the first week in the view
 * @returns TemplateResult or nothing
 */

function renderWeekSeparator(
  config: Types.Config,
  isFirstWeek: boolean = false,
): TemplateResult | typeof nothing {
  return renderHorizontalSeparator(
    config.week_separator_width,
    config.week_separator_color,
    'week-separator',
    config,
    isFirstWeek,
    'week',
  );
}

/**
 * Render a week row with a week number pill and a separator line Uses table structure to align perfectly with day tables
 *
 * @param weekNumber - Week number to display
 * @param isMonthBoundary - Whether this is also a month boundary
 * @param config - Card configuration
 * @param isFirstWeek - Whether this is the first week in the view
 * @returns TemplateResult or nothing
 */

function renderWeekRow(
  weekNumber: number | null,
  isMonthBoundary: boolean,
  config: Types.Config,
  isFirstWeek: boolean = false,
): TemplateResult | typeof nothing {
  if (weekNumber === null) {
    return nothing;
  }

  const baseSpacing = parseFloat(config.day_spacing);
  const multiplier = isMonthBoundary
    ? Constants.UI.SEPARATOR_SPACING.MONTH
    : Constants.UI.SEPARATOR_SPACING.WEEK;
  const finalSpacing = (baseSpacing * multiplier) / 2;
  const marginTop = isFirstWeek ? 0 : finalSpacing - baseSpacing;

  const rowStyle = {
    marginTop: `${marginTop}px`, // Adjusted margin that accounts for existing table margin
    marginBottom: `${finalSpacing}px`, // Half of the desired spacing below
  };

  const lineStyle: Record<string, string> = {};

  if (!isFirstWeek) {
    if (isMonthBoundary && config.month_separator_width !== '0px') {
      lineStyle['--separator-border-width'] = config.month_separator_width;
      lineStyle['--separator-border-color'] = config.month_separator_color;
      lineStyle['--separator-display'] = 'block';
    } else if (config.week_separator_width !== '0px') {
      lineStyle['--separator-border-width'] = config.week_separator_width;
      lineStyle['--separator-border-color'] = config.week_separator_color;
      lineStyle['--separator-display'] = 'block';
    } else {
      lineStyle['--separator-display'] = 'none';
    }
  } else {
    lineStyle['--separator-display'] = 'none';
  }

  return html`
    <table class="week-row-table" style=${styleMap(rowStyle)}>
      <tr>
        <td class="week-number-cell">
          <div class="week-number">${weekNumber}</div>
        </td>
        <td class="separator-cell" style=${styleMap(lineStyle)}>
          <div class="separator-line"></div>
        </td>
      </tr>
    </table>
  `;
}

// CONTENT GENERATION FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Render a date column for the given date with appropriate styling
 *
 * @param date Date to display
 * @param config Card configuration
 * @param language - Language code for translations
 * @param isToday Whether the date is today
 * @returns Rendered date column
 */

function renderDateColumn(
  date: Date,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherForecasts?: Types.WeatherForecasts,
): TemplateResult {
  const weatherContent = Leaves.renderDateWeather(date, config, weatherForecasts);

  return Leaves.renderDateContent(date, config, language, isToday, weatherContent);
}

/**
 * Render a single day with its events
 *
 * @param day - Day data containing events
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param prevDay - Previous day data for determining separators
 * @param boundaryInfo - Information about week and month boundaries
 * @returns TemplateResult for the day
 */

export function renderDay(
  day: Types.EventsByDay,
  config: Types.Config,
  language: string,
  prevDay?: Types.EventsByDay,
  boundaryInfo?: { isNewWeek: boolean; isNewMonth: boolean },
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const { isToday, isTomorrow } = Leaves.classifyDay(day.timestamp);

  let daySeparator: TemplateResult | typeof nothing = nothing;

  const isMonthBoundary = boundaryInfo?.isNewMonth || false;
  const isWeekBoundary = boundaryInfo?.isNewWeek || false;
  const hasMonthSeparator = isMonthBoundary && config.month_separator_width !== '0px';
  const hasWeekSeparator =
    isWeekBoundary && (config.show_week_numbers !== null || config.week_separator_width !== '0px');

  const daySeparatorWidth = config.day_separator_width;
  const daySeparatorColor = config.day_separator_color;

  if (prevDay && daySeparatorWidth !== '0px' && !hasMonthSeparator && !hasWeekSeparator) {
    const separatorStyle = createSeparatorStyle(
      daySeparatorWidth,
      daySeparatorColor,
      config,
      'day',
    );

    daySeparator = html`<div class="separator" style=${styleMap(separatorStyle)}></div>`;
  }

  return html`
    ${daySeparator}
    <table
      class=${classMap({
        'day-table': true,
        today: isToday,
        tomorrow: isTomorrow,
        'future-day': !isToday,
      })}
    >
      ${repeat(
        day.events,
        (event, index) => `${event._entityId}-${event.summary}-${index}`,
        (event, index) =>
          renderEvent(event, day, index, config, language, isToday, weatherForecasts, hass),
      )}
    </table>
  `;
}

/**
 * Render grouped events with week and month separators Uses a precedence system for different separator types
 */

export function renderGroupedEvents(
  days: Types.EventsByDay[],
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  return html`
    ${days.map((day, index) => {
      const prevDay = index > 0 ? days[index - 1] : undefined;
      const weekNumber = day.weekNumber ?? null;

      let isNewWeek = false;

      if (!prevDay) {
        isNewWeek = true;
      } else {
        const currentWeekNumber = day.weekNumber;
        const prevWeekNumber = prevDay.weekNumber;

        isNewWeek = currentWeekNumber !== prevWeekNumber;
      }

      const isNewMonth = prevDay && day.monthNumber !== prevDay.monthNumber;
      const isFirstWeek = index === 0;

      const boundaryInfo = {
        isNewWeek,
        isNewMonth: Boolean(isNewMonth),
      };

      let separator: TemplateResult | typeof nothing = nothing;

      if (
        isNewMonth &&
        config.month_separator_width !== '0px' &&
        (!isNewWeek || config.show_week_numbers === null)
      ) {
        separator = renderMonthSeparator(config);
      } else if (isNewWeek) {
        if (isFirstWeek && config.show_week_numbers !== null && !config.show_current_week_number) {
          separator = isNewMonth
            ? renderMonthSeparator(config)
            : renderWeekSeparator(config, isFirstWeek);
        } else {
          separator =
            config.show_week_numbers !== null
              ? renderWeekRow(weekNumber, Boolean(isNewMonth), config, isFirstWeek)
              : renderWeekSeparator(config, isFirstWeek);
        }
      }

      return html`
        ${separator}
        ${renderDay(day, config, language, prevDay, boundaryInfo, weatherForecasts, hass)}
      `;
    })}
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
  isToday: boolean,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const presentation = Presentation.buildEventPresentation(event, config, language, hass);

  const dayDate = new Date(day.timestamp);
  const isWeekendDay = Leaves.isWeekendDate(dayDate);

  const isFirst = index === 0;
  const isLast = index === day.events.length - 1;
  const isMiddle = !isFirst && !isLast;

  const eventClasses = {
    event: true,
    'event-first': isFirst,
    'event-middle': isMiddle,
    'event-last': isLast,
    'past-event': presentation.isPastEvent,
  };

  return html`
    <tr>
      ${index === 0
        ? html`
            <td
              class="date-column ${isWeekendDay ? 'weekend' : ''}"
              rowspan="${day.events.length}"
              style="position: relative;"
            >
              ${renderDateColumn(dayDate, config, language, isToday, weatherForecasts)}
              ${Leaves.renderTodayIndicator(config, isToday)}
            </td>
          `
        : ''}
      <td
        class=${classMap(eventClasses)}
        style="border-inline-start: var(--calendar-card-line-width-vertical) solid ${presentation.entityAccentColor}; background-color: ${presentation.entityAccentBackgroundColor};"
      >
        ${Leaves.renderEventContent(event, config, presentation.contentParts, {
          weatherForecasts,
        })}
      </td>
    </tr>
  `;
}

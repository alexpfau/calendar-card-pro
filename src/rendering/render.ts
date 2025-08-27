/* eslint-disable import/order */
/**
 * Rendering module for Calendar Card Pro
 *
 * Contains pure functions for rendering the calendar card's UI components.
 * These functions generate Lit TemplateResult objects that can be used
 * within the main component's render method.
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { repeat } from 'lit/directives/repeat.js';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as FormatUtils from '../utils/format';
import * as EventUtils from '../utils/events';
import * as Helpers from '../utils/helpers';
import * as Weather from '../utils/weather';

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
 * @param maxHeightSet Flag to add max-height-set class
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
): TemplateResult {
  return html`
    <ha-card
      class="calendar-card-pro ${maxHeightSet ? 'max-height-set' : ''}"
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
 * @param state Card state (loading, error)renderWeekRow
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
 * Create consistent separator styles for any type of horizontal separator
 * Properly calculates margins based on day_spacing to ensure vertical centering
 * with appropriate multipliers for different separator types
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
  // Base spacing from configuration
  const baseSpacing = parseFloat(config.day_spacing);

  // Special handling for day separators to balance margins
  if (separatorType === 'day') {
    // For day separators, we want equal spacing above and below
    return {
      borderTopWidth: lineWidth,
      borderTopColor: lineColor,
      borderTopStyle: 'solid',
      marginTop: '0px', // No additional margin needed on top (table already has margin)
      marginBottom: `${baseSpacing}px`, // Equal spacing below
    };
  }

  // For week and month separators, determine the appropriate multiplier
  let multiplier = Constants.UI.SEPARATOR_SPACING.WEEK; // Default to week multiplier
  if (separatorType === 'month') {
    multiplier = Constants.UI.SEPARATOR_SPACING.MONTH;
  }

  // Calculate the desired total spacing between elements (finalSpacing)
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
  // Don't render for zero width or first week
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
 * Render a week row with a week number pill and a separator line
 * Uses table structure to align perfectly with day tables
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

  // Use the appropriate multiplier for week separator spacing
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

  // Modified line style generation
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

//-----------------------------------------------------------------------------
// EVENT CONTENT RENDERING HELPERS
//-----------------------------------------------------------------------------

/**
 * Render calendar label with support for text, emojis, images, and icons
 *
 * @param label - Label content from entity configuration
 * @returns TemplateResult for the appropriate label type
 */
function renderLabel(label: string | undefined): TemplateResult | typeof nothing {
  if (!label) return nothing;

  // Handle Material Design Icons (mdi:icon-name syntax)
  if (label.startsWith('mdi:')) {
    return html`<ha-icon icon="${label}" class="label-icon"> </ha-icon>`;
  }

  // Handle image paths (either /local/ path or image file extension)
  if (label.startsWith('/local/') || /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(label)) {
    return html`<img src="${label}" class="label-image"> </img>`;
  }

  // Default: text/emoji (original behavior)
  return html`<span class="calendar-label">${label}</span>`;
}

//-----------------------------------------------------------------------------
// CONTENT GENERATION FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Check if a given date is a weekend day (Saturday or Sunday)
 *
 * @param date - Date to check
 * @returns True if the date is a weekend day
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Parse position from CSS-like syntax (e.g., "10% 50%")
 * and convert to absolute positioning styles with centering transform
 *
 * @param position Position in CSS-like syntax ("x y" format)
 * @returns Style object with positioning properties
 */
function parseIndicatorPosition(position: string): Record<string, string> {
  // Default positioning styles
  const positionStyles: Record<string, string> = {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
  };

  // Split the position string by whitespace
  const parts = position.trim().split(/\s+/);

  // Parse horizontal position (x)
  if (parts.length >= 1) {
    positionStyles.left = parts[0];
  }

  // Parse vertical position (y)
  if (parts.length >= 2) {
    positionStyles.top = parts[1];
  } else {
    // Default to vertically centered if only one value provided
    positionStyles.top = '50%';
  }

  return positionStyles;
}

/**
 * Render the today indicator based on configuration
 *
 * @param config Calendar card configuration
 * @param isToday Whether the current day is today
 * @returns TemplateResult or nothing
 */
function renderTodayIndicator(
  config: Types.Config,
  isToday: boolean,
): TemplateResult | typeof nothing {
  // Don't render anything if indicator is disabled or this isn't today
  if (!config.today_indicator || !isToday) {
    return nothing;
  }

  const indicatorValue = config.today_indicator;
  const indicatorType = Helpers.getTodayIndicatorType(indicatorValue);

  // If type is none, don't render anything
  if (indicatorType === 'none') {
    return nothing;
  }

  // Get position styles using CSS-like syntax
  const positionStyles = parseIndicatorPosition(config.today_indicator_position);

  // Render indicator based on type
  return html`
    <div class="today-indicator-container">
      ${renderIndicatorByType(indicatorType, indicatorValue, positionStyles)}
    </div>
  `;
}

/**
 * Render specific indicator based on type
 */
function renderIndicatorByType(
  type: string,
  value: string | boolean,
  positionStyles: Record<string, string>,
): TemplateResult | typeof nothing {
  // Determine which icon to use based on type
  let icon = '';

  switch (type) {
    case 'dot':
      icon = 'mdi:circle';
      break;
    case 'pulse':
      icon = 'mdi:circle';
      break;
    case 'glow':
      icon = 'mdi:circle';
      break;
    case 'mdi':
      // For custom MDI icons, use the value directly
      icon = typeof value === 'string' ? value : 'mdi:circle';
      break;
    case 'image':
      // For images, render an img tag instead
      if (typeof value === 'string') {
        return html`
          <img 
            src="${value}" 
            class="today-indicator image"
            style=${styleMap(positionStyles)}
            alt="Today">
          </img>`;
      }
      return nothing;
    case 'emoji':
      // For emojis, render a span with the emoji
      if (typeof value === 'string') {
        return html` <span class="today-indicator emoji" style=${styleMap(positionStyles)}>
          ${value}
        </span>`;
      }
      return nothing;
    default:
      return nothing;
  }

  // For all MDI-based indicators, render with the appropriate class
  if (icon) {
    return html` <ha-icon
      icon="${icon}"
      class="today-indicator ${type}"
      style=${styleMap(positionStyles)}
    >
    </ha-icon>`;
  }

  return nothing;
}

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
  const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;

  // Start with base colors
  let weekdayColor = config.weekday_color;
  let dayColor = config.day_color;
  let monthColor = config.month_color;

  // Apply weekend styling if applicable and defined
  if (isWeekendDay) {
    weekdayColor = config.weekend_weekday_color || weekdayColor;
    dayColor = config.weekend_day_color || dayColor;
    monthColor = config.weekend_month_color || monthColor;
  }

  // Apply today styling if applicable and defined (takes precedence)
  if (isToday) {
    weekdayColor = config.today_weekday_color || weekdayColor;
    dayColor = config.today_day_color || dayColor;
    monthColor = config.today_month_color || monthColor;
  }

  // Get translations for the current language
  const translations = Localize.getTranslations(language);

  // Get formatted date parts from translations
  const weekday = translations.daysOfWeek[date.getDay()];
  const day = date.getDate();
  const month = translations.months[date.getMonth()];

  // Add weather if configured
  const showDateWeather =
    (config.weather?.position === 'date' || config.weather?.position === 'both') &&
    config.weather?.entity;

  let weatherContent: TemplateResult | typeof nothing = nothing;

  if (showDateWeather && weatherForecasts?.daily) {
    const dailyForecast = Weather.findDailyForecast(date, weatherForecasts.daily);

    if (dailyForecast) {
      // Get options from date-specific config
      const dateConfig = config.weather?.date || {};
      const showConditions = dateConfig.show_conditions !== false;
      const showHighTemp = dateConfig.show_high_temp !== false;
      const showLowTemp = dateConfig.show_low_temp === true && dailyForecast.templow !== undefined;

      // Get styling from config
      const iconSize = dateConfig.icon_size || '14px';
      const fontSize = dateConfig.font_size || '12px';
      const color = dateConfig.color || 'var(--primary-text-color)';

      weatherContent = html`
        <div class="weather" style="font-size: ${fontSize}; color: ${color};">
          ${showConditions
            ? html`
                <ha-icon
                  .icon=${dailyForecast.icon}
                  style="--mdc-icon-size: ${iconSize};"
                ></ha-icon>
              `
            : nothing}
          ${showHighTemp
            ? html` <span class="weather-temp-high">${dailyForecast.temperature}°</span> `
            : nothing}
          ${showLowTemp
            ? html` <span class="weather-temp-low">/${dailyForecast.templow}°</span> `
            : nothing}
        </div>
      `;
    }
  }

  return html`
    <div
      class="weekday"
      style=${styleMap({
        'font-size': config.weekday_font_size,
        color: weekdayColor,
      })}
    >
      ${weekday}
    </div>
    <div
      class="day"
      style=${styleMap({
        'font-size': config.day_font_size,
        color: dayColor,
      })}
    >
      ${day}
    </div>
    ${config.show_month
      ? html`
          <div
            class="month"
            style=${styleMap({
              'font-size': config.month_font_size,
              color: monthColor,
            })}
          >
            ${month}
          </div>
        `
      : nothing}
    ${weatherContent}
  `;
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
  // Check if this day is today
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDate = new Date(day.timestamp);
  const dayDateString = dayDate.toDateString();
  const todayStartString = todayStart.toDateString();
  const isToday = dayDateString === todayStartString;

  // Check if this day is tomorrow
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowStartString = tomorrowStart.toDateString();
  const isTomorrow = dayDateString === tomorrowStartString;

  // Separator precedence hierarchy (highest to lowest):
  // 1. Month boundaries (with month separator enabled)
  // 2. Week boundaries (with week separator or week numbers enabled)
  // 3. Regular day boundaries (with regular day separator enabled)
  // Only render the highest precedence separator that applies

  let daySeparator: TemplateResult | typeof nothing = nothing;

  // Only add a regular day separator between days IF:
  // 1. This is not the first day displayed (prevDay exists)
  // 2. This is not a month boundary with month separators enabled
  // 3. This is not a week boundary with week separators or week numbers enabled
  // 4. Day separator width is not zero
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
 * Render grouped events with week and month separators
 * Uses a precedence system for different separator types
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

      // Enhanced week boundary detection - compare week numbers instead of just day of week
      let isNewWeek = false;

      if (!prevDay) {
        // First day is always a new week
        isNewWeek = true;
      } else {
        // Compare week numbers to detect week boundaries
        // This works even when days are missing (show_empty_days: false)
        const currentWeekNumber = day.weekNumber;
        const prevWeekNumber = prevDay.weekNumber;

        // Week boundary if week numbers differ
        isNewWeek = currentWeekNumber !== prevWeekNumber;
      }

      const isNewMonth = prevDay && day.monthNumber !== prevDay.monthNumber;
      const isFirstWeek = index === 0;

      // Pass boundary information to renderDay
      const boundaryInfo = {
        isNewWeek,
        isNewMonth: Boolean(isNewMonth),
      };

      // Determine which separator to show based on precedence rules
      let separator: TemplateResult | typeof nothing = nothing;

      // Don't prioritize month separator if its width is 0px
      if (
        isNewMonth &&
        config.month_separator_width !== '0px' &&
        (!isNewWeek || config.show_week_numbers === null)
      ) {
        // Month boundaries without week change get month separator
        separator = renderMonthSeparator(config);
      } else if (isNewWeek) {
        // Check for first week + config setting
        if (isFirstWeek && config.show_week_numbers !== null && !config.show_current_week_number) {
          // Skip week number pill for first week if setting disabled, but keep month/week separators if needed
          separator = isNewMonth
            ? renderMonthSeparator(config)
            : renderWeekSeparator(config, isFirstWeek);
        } else {
          // Normal rendering logic - week boundaries get either week number pill or week separator
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
  // Add CSS class for empty days
  const isEmptyDay = Boolean(event._isEmptyDay);

  // Check if this is a weekend day
  const dayDate = new Date(day.timestamp);
  const isWeekendDay = isWeekend(dayDate);

  // Check if this is a past event (already ended)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  let isPastEvent = false;

  if (!isEmptyDay) {
    const isAllDayEvent = !event.start.dateTime;

    if (isAllDayEvent) {
      // All-day events should NOT be marked as past when they:
      // 1. Occur today (single-day) OR
      // 2. End today (multi-day) OR
      // 3. Span across today (multi-day)

      // Get end date
      let endDate = event.end.date ? FormatUtils.parseAllDayDate(event.end.date) : null;

      // Adjust for iCal all-day end date convention (exclusive end date)
      if (endDate) {
        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
        endDate = adjustedEndDate;
      }

      // All-day events are only "past" if today is completely after their end date
      // If today is the end date or earlier, the event should NOT be greyed out
      isPastEvent = endDate !== null && today > endDate;
    } else {
      // Regular event with time - use end time to determine if it's past
      const endDateTime = event.end.dateTime ? new Date(event.end.dateTime) : null;
      isPastEvent = endDateTime !== null && now > endDateTime;
    }
  }

  // Get line color (solid) and background color (with opacity)
  const entityAccentColor = EventUtils.getEntityAccentColorWithOpacity(
    event._entityId,
    config,
    undefined,
    event,
  );

  // Explicitly check if event_background_opacity is defined and greater than 0
  const backgroundOpacity =
    config.event_background_opacity > 0 ? config.event_background_opacity : 0;
  const entityAccentBackgroundColor =
    backgroundOpacity > 0
      ? EventUtils.getEntityAccentColorWithOpacity(
          event._entityId,
          config,
          backgroundOpacity,
          event,
        )
      : ''; // Empty string for no background

  // Get entity-specific settings with fallback to global settings
  const showTime =
    EventUtils.getEntitySetting(event._entityId, 'show_time', config, event) ?? config.show_time;
  const showLocation =
    EventUtils.getEntitySetting(event._entityId, 'show_location', config, event) ??
    config.show_location;

  // Check if this is an all-day event
  const isAllDayEvent = !event.start.dateTime;

  // Check if this is a multi-day all-day event
  const isMultiDayAllDayEvent =
    isAllDayEvent &&
    event.time &&
    (event.time.includes(Localize.getTranslations(language).multiDay) ||
      event.time.includes(Localize.getTranslations(language).endsTomorrow) ||
      event.time.includes(Localize.getTranslations(language).endsToday));

  // Determine if we should show time for this specific event
  // Hide if:
  // 1. showTime is false (global setting or entity override) OR
  // 2. It's a SINGLE-DAY all-day event AND show_single_allday_time is false OR
  // 3. It's an empty day placeholder
  const shouldShowTime =
    showTime &&
    !(isAllDayEvent && !isMultiDayAllDayEvent && !config.show_single_allday_time) &&
    !isEmptyDay;

  // Calculate countdown if enabled
  let countdownStr: string | null = null;
  if (config.show_countdown && !isEmptyDay && !isPastEvent) {
    countdownStr = FormatUtils.getCountdownString(event, language);
  }

  // Check if event is currently running and calculate progress percentage for progress bar
  const isRunning = EventUtils.isEventCurrentlyRunning(event);
  const progressPercentage =
    isRunning && config.show_progress_bar ? EventUtils.calculateEventProgress(event) : null;

  // Format event time and location
  const eventTime = FormatUtils.formatEventTime(event, config, language, hass);
  const eventLocation =
    event.location && showLocation
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
    'past-event': isPastEvent,
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
              ${renderTodayIndicator(config, isToday)}
            </td>
          `
        : ''}
      <td
        class=${classMap(eventClasses)}
        style="border-left: var(--calendar-card-line-width-vertical) solid ${entityAccentColor}; background-color: ${entityAccentBackgroundColor};"
      >
        <div class="event-content">
          ${renderEventTitle(event, config, weatherForecasts)}
          <div class="time-location">
            ${shouldShowTime
              ? html`
                  <div class="time">
                    <div class="time-actual">
                      <ha-icon icon="mdi:clock-outline"></ha-icon>
                      <span>${eventTime}</span>
                    </div>
                    ${countdownStr
                      ? html`<div class="time-countdown">${countdownStr}</div>`
                      : progressPercentage !== null && config.show_progress_bar
                        ? html`
                            <div class="progress-bar">
                              <div
                                class="progress-bar-filled"
                                style="width: ${progressPercentage}%"
                              ></div>
                            </div>
                          `
                        : nothing}
                  </div>
                `
              : countdownStr
                ? html`
                    <div class="time">
                      <div class="time-actual"></div>
                      <div class="time-countdown">${countdownStr}</div>
                    </div>
                  `
                : progressPercentage !== null && config.show_progress_bar
                  ? html`
                      <div class="time">
                        <div class="time-actual"></div>
                        <div class="progress-bar">
                          <div
                            class="progress-bar-filled"
                            style="width: ${progressPercentage}%"
                          ></div>
                        </div>
                      </div>
                    `
                  : nothing}
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
 * Render an event title with optional label and weather data
 */
export function renderEventTitle(
  event: Types.CalendarEventData,
  config: Types.Config,
  weatherForecasts?: Types.WeatherForecasts,
): TemplateResult {
  const isEmptyDay = !!event._isEmptyDay;
  const entityColor = isEmptyDay
    ? 'var(--calendar-card-empty-day-color)'
    : event._matchedConfig?.color || config.event_color;

  return html`
    <div class="summary-row">
      <div class="summary">
        ${EventUtils.getEntityLabel(event._entityId, config, event)
          ? renderLabel(EventUtils.getEntityLabel(event._entityId, config, event))
          : ''}
        <span
          class="event-title ${isEmptyDay ? 'empty-day-title' : ''}"
          style="color: ${entityColor}"
        >
          ${isEmptyDay ? `✓ ${event.summary}` : event.summary}
        </span>
      </div>
      ${renderEventWeather(event, config, weatherForecasts)}
    </div>
  `;
}

/**
 * Render weather information for an event
 */
function renderEventWeather(
  event: Types.CalendarEventData,
  config: Types.Config,
  weatherForecasts?: Types.WeatherForecasts,
): TemplateResult {
  // Only render if weather is enabled for events
  const showEventWeather =
    config.weather?.entity &&
    (config.weather.position === 'event' || config.weather.position === 'both');

  if (!showEventWeather || !weatherForecasts?.hourly) {
    return html``;
  }

  // Check if this is a timed event (has dateTime) that has ended
  if (event.end?.dateTime) {
    const now = new Date();
    const eventEndTime = new Date(event.end.dateTime);

    // If event has ended, don't show weather
    if (eventEndTime < now) {
      return html``;
    }
  }

  // Find the appropriate forecast - pass both hourly and daily forecasts
  const forecast = Weather.findForecastForEvent(
    event,
    weatherForecasts.hourly,
    weatherForecasts.daily,
  );

  if (!forecast) {
    return html``;
  }

  // Get options from event-specific config
  const eventConfig = config.weather?.event || {};
  const showConditions = eventConfig.show_conditions !== false;
  const showTemp = eventConfig.show_temp !== false;

  // Get styling from config
  const iconSize = eventConfig.icon_size || '14px';
  const fontSize = eventConfig.font_size || '12px';
  const color = eventConfig.color || 'var(--secondary-text-color)';

  // Render weather with position-specific options
  return html`
    <div class="event-weather">
      ${showConditions
        ? html`<ha-icon .icon=${forecast.icon} style="--mdc-icon-size: ${iconSize};"></ha-icon>`
        : nothing}
      ${showTemp
        ? html`<span style="font-size: ${fontSize}; color: ${color};">
            ${forecast.temperature}°
          </span>`
        : nothing}
    </div>
  `;
}

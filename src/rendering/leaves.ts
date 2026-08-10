/* eslint-disable import/order */
/**
 * Shared leaf renderers for Calendar Card Pro
 *
 * These are the axis-agnostic pieces of the card: the date block, the event body, the
 * weather badges, the today indicator. None of them knows whether it is being placed
 * into the list view's `<table>`, the column view's grid, or the time grid — the
 * container owns layout, these own content.
 *
 * Phase 1 of the column view moved them here out of `render.ts` unchanged, so the list
 * keeps consuming them through its existing table while the new views consume the same
 * functions from their own containers. See `docs/development/column-view.md` §Phase 1.
 *
 * ## Why the template indentation looks wrong
 *
 * Do not "tidy" the indentation inside the `html` templates below. Lit preserves
 * whitespace, so leading whitespace on a line that contains interpolated **text**
 * becomes a real text node in the DOM. `tests/list-dom.test.ts` compares serialized
 * DOM and only collapses whitespace *between tags* — whitespace around text survives
 * into the snapshot verbatim.
 *
 * These blocks therefore keep the exact indentation they had at their old nesting depth
 * inside `render.ts`, which is why some of them sit further right than their new
 * function nesting would suggest. That is what makes the Phase 1 extraction provably
 * DOM-neutral rather than merely believed to be. Prettier does not reformat the inside
 * of tagged templates, so it will not fight you either way; the constraint is the
 * rendered output, not the formatter.
 */

import { TemplateResult, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as EventUtils from '../utils/events';
import * as Helpers from '../utils/helpers';
import * as Weather from '../utils/weather';

//-----------------------------------------------------------------------------
// WEATHER LEAVES
//-----------------------------------------------------------------------------

/**
 * Render the weather badge that belongs to a date block.
 *
 * Returns `nothing` in three cases, all of which are normal: weather is not configured
 * for the date position, no daily forecasts were fetched, or no forecast matches this
 * date.
 *
 * @param date Date the badge describes
 * @param config Card configuration
 * @param weatherForecasts Fetched forecasts, if any
 * @returns Rendered badge, or `nothing`
 */
export function renderDateWeather(
  date: Date,
  config: Types.Config,
  weatherForecasts?: Types.WeatherForecasts,
): TemplateResult | typeof nothing {
  // Add weather if configured
  const showDateWeather =
    (config.weather?.position === 'date' || config.weather?.position === 'both') &&
    config.weather?.entity;

  if (!showDateWeather || !weatherForecasts?.daily) {
    return nothing;
  }

  const dailyForecast = Weather.findDailyForecast(date, weatherForecasts.daily);

  if (!dailyForecast) {
    return nothing;
  }

  // Get options from date-specific config
  const dateConfig = config.weather?.date || {};
  const showConditions = dateConfig.show_conditions !== false;
  const showHighTemp = dateConfig.show_high_temp !== false;
  const showUvIndex =
    dateConfig.show_uv_index === true &&
    dailyForecast.uv_index !== undefined &&
    dailyForecast.uv_index >= (dateConfig.uv_index_threshold ?? 0);
  const showLowTemp =
    dateConfig.show_low_temp === true && !showUvIndex && dailyForecast.templow !== undefined;

  // Get styling from config
  const iconSize = dateConfig.icon_size || '14px';
  const fontSize = dateConfig.font_size || '12px';
  const color = dateConfig.color || 'var(--primary-text-color)';

  return html`
    <div class="weather" style="font-size: ${fontSize}; color: ${color};">
      ${showConditions
        ? html`
            <ha-icon .icon=${dailyForecast.icon} style="--mdc-icon-size: ${iconSize};"></ha-icon>
          `
        : nothing}
      ${showHighTemp
        ? html` <span class="weather-temp-high">${dailyForecast.temperature}°</span> `
        : nothing}
      ${showLowTemp
        ? html` <span class="weather-temp-low">/${dailyForecast.templow}°</span> `
        : nothing}
      ${showUvIndex
        ? html` <span class="weather-uv-index">UV${dailyForecast.uv_index}</span> `
        : nothing}
    </div>
  `;
}

/**
 * Check whether a date falls on a weekend (Saturday or Sunday).
 *
 * Lives with the leaves because three separate places need the same answer: the list
 * view's date cell, the column view's day header, and `renderDateContent`'s colour
 * precedence chain. It was previously computed independently in each, which is a
 * cheap duplication to make but an expensive one to keep consistent — a card that
 * ever disagreed with itself about which days are weekends would colour the header
 * one way and the date another.
 *
 * @param date Date to check
 * @returns True when the date is a Saturday or Sunday
 */
export function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

//-----------------------------------------------------------------------------
// DATE LEAVES
//-----------------------------------------------------------------------------

/**
 * Render the contents of a date block: weekday, day number, optional month, and the
 * already-rendered weather badge.
 *
 * Owns the weekday/today colour precedence chain. Weather is passed in rather than
 * rendered here so a container can position the badge independently — the column view
 * puts it in the day header, the list view stacks it under the month.
 *
 * @param date Date to display
 * @param config Card configuration
 * @param language Language code for translations
 * @param isToday Whether the date is today
 * @param weatherContent Already-rendered weather badge, or `nothing`
 * @returns Rendered date block contents
 */
export function renderDateContent(
  date: Date,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherContent: TemplateResult | typeof nothing = nothing,
): TemplateResult {
  const isWeekendDay = isWeekendDate(date);

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

//-----------------------------------------------------------------------------
// EVENT LEAVES
//-----------------------------------------------------------------------------
/**
 * Render calendar label with support for text, emojis, images, and icons
 *
 * @param label - Label content from entity configuration
 * @param labelIconColor - Optional color for icon labels
 * @returns TemplateResult for the appropriate label type
 */
export function renderLabel(
  label: string | undefined,
  labelIconColor?: string,
): TemplateResult | typeof nothing {
  if (!label) return nothing;

  // style attribute only if a color was provided
  const styleAttr = labelIconColor ? `color: ${labelIconColor};` : nothing;

  // Handle icons (mdi:, phu:, fas:, hass:, etc.)
  if (Helpers.isIconValue(label)) {
    return html`<ha-icon icon="${label}" class="label-icon" style=${styleAttr}></ha-icon>`;
  }

  // Handle image paths (either /local/ path or image file extension)
  if (label.startsWith('/local/') || /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(label)) {
    return html`<img src="${label}" class="label-image"></img>`;
  }

  // Default: text/emoji (original behavior)
  return html`<span class="calendar-label">${label}</span>`;
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
  // The checkmark reads as "nothing on" and only suits the default text.
  // A user-supplied string ("Leftovers") already carries its own meaning,
  // so the prefix is dropped whenever one is configured.
  const showEmptyDayCheckmark = isEmptyDay && !event._isCustomEmptyText;
  const entityColor = isEmptyDay
    ? 'var(--calendar-card-empty-day-color)'
    : event._matchedConfig?.color || config.event_color;

  const entityLabel = EventUtils.getEntityLabel(event._entityId, config, event);

  // label_icon_color from the matched entity config
  const labelIconColor = event._matchedConfig?.label_icon_color;

  return html`
    <div class="summary-row">
      <div class="summary">
        ${entityLabel ? renderLabel(entityLabel, labelIconColor) : nothing}
        <span
          class="event-title ${isEmptyDay ? 'empty-day-title' : ''}"
          style="color: ${entityColor}"
        >
          ${showEmptyDayCheckmark ? `✓ ${event.summary}` : event.summary}
        </span>
      </div>
      ${renderEventWeather(event, config, weatherForecasts)}
    </div>
  `;
}

/**
 * Render weather information for an event
 */
export function renderEventWeather(
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

  // Get options from event-specific config
  const eventConfig = config.weather?.event || {};

  // Find the appropriate forecast - pass both hourly and daily forecasts
  const forecast = Weather.findForecastForEvent(
    event,
    weatherForecasts.hourly,
    weatherForecasts.daily,
    eventConfig.daily_forecast_fallback !== false,
  );

  if (!forecast) {
    return html``;
  }

  const showConditions = eventConfig.show_conditions !== false;
  const showTemp = eventConfig.show_temp !== false;
  const showUvIndex =
    eventConfig.show_uv_index === true &&
    forecast.uv_index !== undefined &&
    forecast.uv_index >= (eventConfig.uv_index_threshold ?? 0);

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
      ${showUvIndex
        ? html`<span class="weather-uv-index" style="font-size: ${fontSize}; color: ${color};">
            UV${forecast.uv_index}
          </span>`
        : nothing}
    </div>
  `;
}

/**
 * Locals that `renderEventContent` needs but must not recompute.
 *
 * Every one of these is derived in the caller from entity overrides, the event's
 * all-day/multi-day shape, and the current time. Recomputing them here would both
 * duplicate that logic and let the two copies drift, so the container computes once
 * and hands the results down.
 */
export interface EventContentParts {
  /** Formatted time range, already localized. */
  eventTime: string;
  /** Filtered/formatted location, or `''` when there is none to show. */
  eventLocation: string;
  /** Filtered/formatted description, or `''` when there is none to show. */
  eventDescription: string;
  /** Whether the time row should carry the clock icon and time text. */
  shouldShowTime: boolean;
  /** Countdown text, or `null` when no countdown applies. */
  countdownStr: string | null;
  /** Progress 0-100 for a currently-running event, or `null`. */
  progressPercentage: number | null;
}

/**
 * Render the body of a single event: title row, time, location and description.
 *
 * Deliberately excludes the wrapper element. Accent colour, background, padding and the
 * first/middle/last position classes belong to the container, because they are what
 * differs between the list's `<td class="event">` and the column view's card.
 *
 * @param event Event to render
 * @param config Card configuration
 * @param parts Pre-computed locals from the container - see `EventContentParts`
 * @param weatherForecasts Fetched forecasts, if any
 * @returns Rendered event body
 */
export function renderEventContent(
  event: Types.CalendarEventData,
  config: Types.Config,
  parts: EventContentParts,
  weatherForecasts?: Types.WeatherForecasts,
): TemplateResult {
  const {
    eventTime,
    eventLocation,
    eventDescription,
    shouldShowTime,
    countdownStr,
    progressPercentage,
  } = parts;

  return html`
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
                      <div class="progress-bar-filled" style="width: ${progressPercentage}%"></div>
                    </div>
                  </div>
                `
              : nothing}
        ${eventLocation
          ? html`
              <div class="location">
                <ha-icon icon="mdi:map-marker-outline"></ha-icon>
                <span>${eventLocation}</span>
              </div>
            `
          : ''}
        ${eventDescription
          ? html`
              <div class="description">
                <ha-icon icon="mdi:information-outline"></ha-icon>
                <span>${eventDescription}</span>
              </div>
            `
          : ''}
      </div>
    </div>
  `;
}

//-----------------------------------------------------------------------------
// TODAY-INDICATOR LEAVES
//
// The indicator is absolutely positioned inside its container and knows nothing
// about the container's own layout, so it moves here whole: `renderTodayIndicator`
// is the entry point, and the two helpers below it are implementation detail.
//-----------------------------------------------------------------------------

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
export function renderTodayIndicator(
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

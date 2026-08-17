/**
 * Shared leaf renderers for Calendar Card Pro.
 *
 * These functions own content, not layout. Keep whitespace inside `html` templates exact:
 * Lit preserves text-node whitespace and DOM snapshots pin it.
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

  const dateConfig = config.weather?.date || {};
  const showConditions = dateConfig.show_conditions !== false;
  const showHighTemp = dateConfig.show_high_temp !== false;
  const showUvIndex =
    dateConfig.show_uv_index === true &&
    dailyForecast.uv_index !== undefined &&
    dailyForecast.uv_index >= (dateConfig.uv_index_threshold ?? 0);
  const showLowTemp =
    dateConfig.show_low_temp === true && !showUvIndex && dailyForecast.templow !== undefined;

  // Keep the rendered parts adjacent; whitespace here becomes text nodes in column headers.
  // prettier-ignore
  return html`
    <div class="weather">${
      showConditions
        ? html`<ha-icon .icon=${dailyForecast.icon}></ha-icon>`
        : nothing
    }${
      showHighTemp
        ? html`<span class="weather-temp-high">${dailyForecast.temperature}°</span>`
        : nothing
    }${
      showLowTemp
        ? html`<span class="weather-temp-low">/${dailyForecast.templow}°</span>`
        : nothing
    }${
      showUvIndex
        ? html`<span class="weather-uv-index">UV${dailyForecast.uv_index}</span>`
        : nothing
    }</div>
  `;
}

/**
 * Check whether a date falls on a weekend (Saturday or Sunday).
 *
 * @param date Date to check
 * @returns True when the date is a Saturday or Sunday
 */
export function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Classify a day's start-of-day timestamp as today and/or tomorrow.
 *
 * @param timestamp Start-of-day timestamp for the day
 * @returns Whether the day is today, and whether it is tomorrow
 */
export function classifyDay(timestamp: number): { isToday: boolean; isTomorrow: boolean } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDateString = new Date(timestamp).toDateString();

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  return {
    isToday: dayDateString === todayStart.toDateString(),
    isTomorrow: dayDateString === tomorrowStart.toDateString(),
  };
}

//-----------------------------------------------------------------------------
// DATE LEAVES
//-----------------------------------------------------------------------------

/**
 * Render the contents of a date block: weekday, day number, optional month, and the already-rendered weather badge.
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

  let weekdayColor = config.weekday_color;
  let dayColor = config.day_color;
  let monthColor = config.month_color;

  if (isWeekendDay) {
    weekdayColor = config.weekend_weekday_color || weekdayColor;
    dayColor = config.weekend_day_color || dayColor;
    monthColor = config.weekend_month_color || monthColor;
  }

  if (isToday) {
    weekdayColor = config.today_weekday_color || weekdayColor;
    dayColor = config.today_day_color || dayColor;
    monthColor = config.today_month_color || monthColor;
  }

  const translations = Localize.getTranslations(language);

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
 * A pictographic character: emoji (as a surrogate pair) or a symbol/dingbat.
 *
 * The `\u2000-\u3300` range is deliberately coarse and overlaps several scripts
 * (Hiragana, Katakana, Bopomofo, Hangul Jamo). `PROSE_CHAR` is what vetoes those,
 * so the two constants have to be read together.
 */
const GLYPH_CHAR =
  /[\u2000-\u3300]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/;

/**
 * A character that makes a label prose rather than ornament: any letter, in any
 * script, plus whitespace.
 *
 * This must stay `\p{L}` and not `A-Za-z`. Matching only Latin letters classified
 * every non-Latin label as a glyph -- either when an emoji was joined directly to
 * a word (`🎉Отпуск`), or, because `GLYPH_CHAR` covers kana, for plain Japanese
 * labels with no emoji at all (`やすみ`). Those then got the single-glyph hanging
 * indent below sized for their full width. Digits are excluded on purpose: `①`
 * and other numeric glyphs are ornament, not prose.
 */
const PROSE_CHAR = /[\s\p{L}]/u;

/**
 * Whether a text label is a compact glyph (emoji, symbol) rather than prose.
 */
function isGlyphLabel(label: string): boolean {
  return GLYPH_CHAR.test(label) && !PROSE_CHAR.test(label);
}

/**
 * Render calendar label with support for text, emojis, images, and icons
 *
 * @param label - Label content from entity configuration
 * @param labelIconColor - Optional color for icon labels
 * @param labelType - Shape the entity configuration names, if it names one
 * @returns TemplateResult for the appropriate label type
 */
export function renderLabel(
  label: string | undefined,
  labelIconColor?: string,
  labelType?: Helpers.LabelType,
): TemplateResult | typeof nothing {
  if (!label) return nothing;

  const type = Helpers.resolveLabelType(label, labelType);
  if (type === 'none') return nothing;

  const styleAttr = labelIconColor ? `color: ${labelIconColor};` : nothing;

  if (type === 'icon') {
    return html`<ha-icon icon="${label}" class="label-icon" style=${styleAttr}></ha-icon>`;
  }

  if (type === 'image') {
    return html`<img src="${label}" class="label-image" />`;
  }

  const glyphClass = isGlyphLabel(label) ? ' label-emoji' : '';
  return html`<span class="calendar-label${glyphClass}">${label}</span>`;
}
/**
 * Render an event title with optional label and weather data
 */
function renderEventTitle(
  event: Types.CalendarEventData,
  config: Types.Config,
  weatherForecasts?: Types.WeatherForecasts,
): TemplateResult {
  const isEmptyDay = !!event._isEmptyDay;
  const showEmptyDayCheckmark = isEmptyDay && !event._isCustomEmptyText;
  const entityColor = isEmptyDay
    ? 'var(--calendar-card-empty-day-color)'
    : event._matchedConfig?.color || config.event_color;

  const entityLabel = EventUtils.getEntityLabel(event._entityId, config, event);

  const labelIconColor = event._matchedConfig?.label_icon_color;
  const labelType = event._matchedConfig?.label_type;

  return html`
    <div class="summary-row">
      <div class="summary">
        ${entityLabel ? renderLabel(entityLabel, labelIconColor, labelType) : nothing}
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
 * Whether the card is configured to show a weather badge on individual events.
 */
function hasEventWeather(config: Types.Config): boolean {
  return !!(
    config.weather?.entity &&
    (config.weather.position === 'event' || config.weather.position === 'both')
  );
}

/**
 * Render weather information for an event
 *
 * @param event Event the badge describes
 * @param config Card configuration
 * @param weatherForecasts Fetched forecasts, if any
 * @param placement Where the badge is being placed. `'title'` is the list view's inline
 *   badge inside the summary row; `'row'` is column view's dedicated line, which always
 *   shows the icon and localizes the condition text.
 * @param hass Home Assistant instance, used only to localize the condition text
 * @returns Rendered badge, or an empty template when there is nothing to show
 */
export function renderEventWeather(
  event: Types.CalendarEventData,
  config: Types.Config,
  weatherForecasts?: Types.WeatherForecasts,
  placement: 'title' | 'row' = 'title',
  hass?: Types.Hass | null,
): TemplateResult {
  const showEventWeather = hasEventWeather(config);

  if (!showEventWeather || !weatherForecasts?.hourly) {
    return html``;
  }

  if (event.end?.dateTime) {
    const now = new Date();
    const eventEndTime = new Date(event.end.dateTime);

    if (eventEndTime < now) {
      return html``;
    }
  }

  const eventConfig = config.weather?.event || {};

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

  const ownRow = placement === 'row';
  const showIcon = ownRow || showConditions;
  const conditionText =
    ownRow && showConditions
      ? Weather.formatCondition(hass, config.weather?.entity, forecast.condition, config.language)
      : undefined;

  // prettier-ignore
  return html`
    <div class="event-weather">${
      showIcon ? html`<ha-icon .icon=${forecast.icon}></ha-icon>` : nothing
    }<span class="event-weather-text">${
      showTemp
        ? html`<span>${forecast.temperature}°</span>`
        : nothing
    }${
      showUvIndex
        ? html`<span class="weather-uv-index">UV${forecast.uv_index}</span>`
        : nothing
    }${
      conditionText
        ? html`<span class="weather-condition">${conditionText}</span>`
        : nothing
    }</span></div>
  `;
}

/**
 * Locals that `renderEventContent` needs but must not recompute.
 */
export interface EventContentParts {
  eventTime: string;

  eventLocation: string;

  eventDescription: string;

  shouldShowTime: boolean;

  countdownStr: string | null;

  progressPercentage: number | null;
}

/**
 * Per-view choices `renderEventContent` cannot derive for itself.
 */
export interface EventContentOptions {
  weatherForecasts?: Types.WeatherForecasts;
  /**
   * Where the event weather badge goes. `'title'` uses the summary row; `'row'`
   * gives the badge its own row beneath the time.
   */
  weatherPlacement?: 'title' | 'row';
  /**
   * Where the progress bar goes. `'inline'` keeps it on the time row; `'row'`
   * gives it a dedicated row.
   */
  progressPlacement?: 'inline' | 'row';
  /**
   * Where the countdown goes. `'trailing'` keeps it at the end of the time row;
   * `'text'` folds it into the time text.
   */
  countdownPlacement?: 'trailing' | 'text';
  /**
   * Home Assistant instance, used only to localize the condition text the own-row weather placement can carry. Absent for the title placement, which has no words.
   */
  hass?: Types.Hass | null;
}

/**
 * Render the body of a single event: title row, time, location and description.
 *
 * @param event Event to render
 * @param config Card configuration
 * @param parts Pre-computed locals from the container - see `EventContentParts`
 * @param options Per-view placement choices - see `EventContentOptions`
 * @returns Rendered event body
 */
export function renderEventContent(
  event: Types.CalendarEventData,
  config: Types.Config,
  parts: EventContentParts,
  options: EventContentOptions = {},
): TemplateResult {
  const {
    weatherForecasts,
    weatherPlacement = 'title',
    progressPlacement = 'inline',
    countdownPlacement = 'trailing',
    hass,
  } = options;
  const {
    eventTime,
    eventLocation,
    eventDescription,
    shouldShowTime,
    countdownStr,
    progressPercentage,
  } = parts;

  const hasProgressBar = progressPercentage !== null && config.show_progress_bar;
  const showInlineProgress = hasProgressBar && progressPlacement === 'inline';

  const progressRow =
    hasProgressBar && progressPlacement === 'row'
      ? html`
          <div class="progress-bar progress-bar-row">
            <div class="progress-bar-filled" style="width: ${progressPercentage}%"></div>
          </div>
        `
      : nothing;

  const titleForecasts = weatherPlacement === 'title' ? weatherForecasts : undefined;

  const weatherRow =
    weatherPlacement === 'row' && hasEventWeather(config)
      ? renderEventWeather(event, config, weatherForecasts, 'row', hass)
      : nothing;

  const foldCountdown = countdownPlacement === 'text' && countdownStr !== null;

  const trailingCountdown = foldCountdown ? null : countdownStr;

  // Keep folded time/countdown spans adjacent; whitespace would render before the separator.
  // prettier-ignore
  const timeText = foldCountdown
    ? html`<span class="time-text"><span>${eventTime}</span><span class="time-countdown">${countdownStr}</span></span>`
    : html`<span>${eventTime}</span>`;

  return html`
    <div class="event-content">
      ${renderEventTitle(event, config, titleForecasts)}
      <div class="time-location">
        ${progressRow}
        ${shouldShowTime
          ? html`
              <div class="time">
                <div class="time-actual">
                  <ha-icon icon="mdi:clock-outline"></ha-icon>
                  ${timeText}
                </div>
                ${trailingCountdown
                  ? html`<div class="time-countdown">${trailingCountdown}</div>`
                  : showInlineProgress
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
          : // No text placement here: with `show_time: false` there is no time text to
            // fold the countdown into, so it always renders on its own.
            countdownStr
            ? html`
                <div class="time">
                  <div class="time-actual"></div>
                  <div class="time-countdown">${countdownStr}</div>
                </div>
              `
            : showInlineProgress
              ? html`
                  <div class="time">
                    <div class="time-actual"></div>
                    <div class="progress-bar">
                      <div class="progress-bar-filled" style="width: ${progressPercentage}%"></div>
                    </div>
                  </div>
                `
              : nothing}
        ${weatherRow}
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
//-----------------------------------------------------------------------------

/**
 * Parse position from CSS-like syntax (e.g., "10% 50%") and convert to absolute positioning styles with centering transform
 *
 * @param position Position in CSS-like syntax ("x y" format)
 * @returns Style object with positioning properties
 */
function parseIndicatorPosition(position: string): Record<string, string> {
  const positionStyles: Record<string, string> = {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
  };

  const parts = position.trim().split(/\s+/);

  if (parts.length >= 1) {
    positionStyles.left = parts[0];
  }

  if (parts.length >= 2) {
    positionStyles.top = parts[1];
  } else {
    positionStyles.top = '50%';
  }

  return positionStyles;
}

/**
 * Render the today indicator based on configuration
 *
 * @param config Calendar card configuration
 * @param isToday Whether the current day is today
 * @param layout Placement strategy — `absolute` positions by percentage from
 *   `today_indicator_position` (list view), `inline` ignores that option and lets the
 *   indicator flow inside the column-view day header.
 * @returns TemplateResult or nothing
 */
export function renderTodayIndicator(
  config: Types.Config,
  isToday: boolean,
  layout: 'absolute' | 'inline' = 'absolute',
): TemplateResult | typeof nothing {
  if (!config.today_indicator || !isToday) {
    return nothing;
  }

  const indicatorValue = config.today_indicator;
  const indicatorType = Helpers.getTodayIndicatorType(indicatorValue);

  if (indicatorType === 'none') {
    return nothing;
  }

  const positionStyles =
    layout === 'inline' ? {} : parseIndicatorPosition(config.today_indicator_position);

  return html`
    <div class="today-indicator-container${layout === 'inline' ? ' inline' : ''}">
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
      icon = typeof value === 'string' ? value : 'mdi:circle';
      break;
    case 'image':
      if (typeof value === 'string') {
        return html` <img
          src="${value}"
          class="today-indicator image"
          style=${styleMap(positionStyles)}
          alt="Today"
        />`;
      }
      return nothing;
    case 'emoji':
      if (typeof value === 'string') {
        return html` <span class="today-indicator emoji" style=${styleMap(positionStyles)}>
          ${value}
        </span>`;
      }
      return nothing;
    default:
      return nothing;
  }

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

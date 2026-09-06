/**
 * Shared leaf renderers for Calendar Card Pro.
 *
 * These functions own content, not layout. Keep whitespace inside `html` templates exact:
 * Lit preserves text-node whitespace and DOM snapshots pin it.
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as FormatUtils from '../utils/format';
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
  const position = Weather.resolveWeatherPosition(config.weather);
  const showDateWeather = (position === 'date' || position === 'both') && config.weather?.entity;

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
 * Render the shared column-style day header.
 *
 * The class names are the shared day-header classes now, even though they still say
 * `column`. They predate grid view, and renaming them would be a separate mechanical
 * change that should not be bundled with a behavior fix.
 *
 * @param date Date to display
 * @param config Card configuration
 * @param language Language code for translations
 * @param isToday Whether the date is today
 * @param weatherContent Already-rendered weather badge, or `nothing`
 * @param separator Optional rule under the header
 * @param hass Home Assistant instance, whose locale decides which days are the weekend
 * @returns Rendered shared day header
 */
export function renderSharedDayHeader(
  date: Date,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherContent: TemplateResult | typeof nothing = nothing,
  separator?: { width: string; color: string } | null,
  hass?: Types.Hass | null,
): TemplateResult {
  const todayIndicator = renderTodayIndicator(config, isToday, 'inline');
  const hasInlineIndicator = todayIndicator !== nothing;
  const headerSeparator = separator
    ? html`<div
        class="column-header-separator"
        style=${styleMap({
          borderTopWidth: separator.width,
          borderTopColor: separator.color,
          borderTopStyle: 'solid',
        })}
      ></div>`
    : nothing;

  return html`
    <div class="column-day-header">
      <div
        class=${classMap({
          'column-date-content': true,
          'with-today-indicator': hasInlineIndicator,
        })}
      >
        ${todayIndicator}
        ${renderDateContent(date, config, language, isToday, weatherContent, hass)}
      </div>
    </div>
    ${headerSeparator}
  `;
}

/**
 * Render one day's week-number cell.
 *
 * The class name is shared with column view for the same reason as the day-header
 * classes in {@link renderSharedDayHeader}: it was named before grid view reused it.
 *
 * @param weekNumber Week number for this day, or null when unavailable
 * @param visible Whether this column is the one that shows the number
 * @param gridColumn One-based CSS grid column line for the cell
 * @returns Rendered week-number cell
 */
export function renderDayWeekNumber(
  weekNumber: number | null | undefined,
  visible: boolean,
  gridColumn: number,
): TemplateResult {
  return html`
    <div
      class="column-week-number"
      style=${styleMap({
        gridColumn: String(gridColumn),
        gridRow: '1',
        ...(visible ? {} : { visibility: 'hidden' }),
      })}
    >
      <div class="week-number">${weekNumber ?? ''}</div>
    </div>
  `;
}

/**
 * Render the contents of a date block: weekday, day number, optional month, and the already-rendered weather badge.
 *
 * @param date Date to display
 * @param config Card configuration
 * @param language Language code for translations
 * @param isToday Whether the date is today
 * @param weatherContent Already-rendered weather badge, or `nothing`
 * @param hass Home Assistant instance, whose locale decides which days are the weekend
 * @returns Rendered date block contents
 */
export function renderDateContent(
  date: Date,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherContent: TemplateResult | typeof nothing = nothing,
  hass?: Types.Hass | null,
): TemplateResult {
  const isWeekendDay = FormatUtils.isWeekendDate(date, hass?.locale);

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
  entityLabel: string | undefined,
  weatherForecasts?: Types.WeatherForecasts,
  titlePill?: { accent: string; mode: Helpers.AlldayBadgeStyle; inheritsText: boolean },
  mergedLabels?: Types.ResolvedLabel[],
): TemplateResult {
  const isEmptyDay = !!event._isEmptyDay;
  const showEmptyDayCheckmark = isEmptyDay && !event._isCustomEmptyText;
  const entityColor = isEmptyDay
    ? 'var(--calendar-card-empty-day-color)'
    : event._matchedConfig?.color || config.event_color;

  const labelIconColor = event._matchedConfig?.label_icon_color;
  const labelType = event._matchedConfig?.label_type;

  const titleText = showEmptyDayCheckmark ? `✓ ${event.summary}` : event.summary;

  // The pill is nested INSIDE `.event-title` rather than replacing it, and that placement is
  // what makes the `neutral` treatment mean the right thing here.
  //
  // `neutral` is defined as `color: inherit`, so what it resolves to is decided entirely by
  // what it is nested in -- and its wash is currentColor at 14% alpha, so the ground follows
  // the ink. In the time row it inherits the time colour, which is the whole point of that
  // treatment: the row's own ink in a capsule of itself. Put the pill where `.event-title`'s
  // inline `color` is in scope and it inherits the TITLE colour -- `event_color`, or this
  // calendar's own `color` override -- so the treatment keeps its meaning at both positions
  // without either needing a rule of its own.
  //
  // Nesting is also the only arrangement that works at all. `.event-title` carries its colour
  // as an inline style, and an inline style beats any class selector -- so putting the pill
  // classes ON that element would let the inline colour override `--badge-ink` and every
  // treatment but the text source would silently render in the title colour.
  //
  // 🚨 The text source publishes the title's colour as `--badge-source` rather than letting
  // the stylesheet read `currentColor`, and that is not redundant with inheriting it. The
  // pill's own `color` is what the treatments SET, so a `currentColor` inside any other
  // property reads the colour the treatment just wrote instead of the one the row had.
  // Three treatments get away with it because they set `color` to the inherited value
  // anyway; `filled` deliberately does not, and its ground would come out as its own ink.
  // A token settled before the treatment runs has no such ordering.
  const pillClass = titlePill
    ? `allday-title-pill allday-pill-${titlePill.mode}` +
      (titlePill.inheritsText ? ' allday-source-text' : '')
    : '';
  const pillStyle = titlePill
    ? `--calendar-card-event-accent: ${titlePill.accent};` +
      (titlePill.inheritsText ? ` --badge-source: ${entityColor};` : '')
    : '';

  // prettier-ignore
  const titleContent = titlePill
    ? html`<span
        class=${pillClass}
        style=${pillStyle}
        >${titleText}</span
      >`
    : titleText;

  // A merged row answers for every calendar that contributed a copy, so it draws each of
  // their labels, in `entities` order, with nothing inserted between them — the 4px gap is
  // the `margin-right` every label kind already carries. The branch is behavioral rather
  // than defensive: `mergedLabels` is undefined unless there are two labels to draw, so a
  // merge whose winner carries none renders as it always has.
  const labels = mergedLabels
    ? mergedLabels.map((entry) => renderLabel(entry.value, entry.iconColor, entry.type))
    : entityLabel
      ? renderLabel(entityLabel, labelIconColor, labelType)
      : nothing;

  // `scroll_long_titles` forces the title onto a single line so it can scroll horizontally
  // when it overflows. That mode and `title_max_lines` are mutually exclusive by nature —
  // you cannot scroll one line horizontally and wrap it to N lines at once — so scrolling
  // wins: the extra classes here switch `.event-title` from the wrapping/-webkit-box clamp
  // (see the note on --calendar-card-title-display in styles.ts) to a single-line clip, and
  // whatever `title_max_lines` is set to is ignored for that event. When the option is off,
  // both branches below are byte-identical to the historical markup so no snapshot moves.
  //
  // The text is wrapped in `.event-title-scroll` only in the scroll branch: `.event-title`
  // is the fixed-width clip viewport and the inner span is the full-width element the
  // measurement step (in calendar-card-pro.ts) animates once it confirms real overflow.
  const scrollTitles = config.scroll_long_titles;
  const titleInner = scrollTitles
    ? html`<span class="event-title-scroll">${titleContent}</span>`
    : titleContent;

  return html`
    <div class="summary-row">
      <div class="summary${scrollTitles ? ' summary-scroll' : ''}">
        ${labels}
        <span
          class="event-title ${isEmptyDay ? 'empty-day-title' : ''}${scrollTitles
            ? ' title-scrollable'
            : ''}"
          style="color: ${entityColor}"
        >
          ${titleInner}
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
  const position = Weather.resolveWeatherPosition(config.weather);
  return !!(config.weather?.entity && (position === 'event' || position === 'both'));
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

  /**
   * The all-day label to draw as its own badge, present only when `allday_badge` names a
   * treatment and the event is all-day. When set, `eventTime` holds only what follows the
   * label, which is empty for a single-day all-day event.
   *
   * Carries its own `lang` because the badge uppercases in CSS, and only a declared language
   * gets that right — Greek must lose its tonos in capitals.
   *
   * Carries its own `accent` because this calendar's color reaches the row as an inline
   * border value, which no descendant can read. The badge republishes it as a custom
   * property on itself and the stylesheet derives every colour from it, so the derivation
   * stays themeable and no event that has no badge pays for the property.
   *
   * `inheritsText` is `allday_badge_color: text` — the one source whose colour this side of
   * the render cannot name, because it differs per position. A custom colour needs no flag:
   * it arrives as `accent` and is indistinguishable from one by the time it gets here.
   */
  allDayBadge?: {
    label: string;
    lang: string;
    accent: string;
    mode: Helpers.AlldayBadgeStyle;
    inheritsText: boolean;
  };

  /**
   * The pill to draw around the event title, present only when `allday_badge` names the
   * title position and the event is all-day.
   *
   * Carries no label: the pill wraps the title the row was going to draw anyway, so unlike
   * the time-row badge there is no text to hand it and no language to declare — the title is
   * the user's own words and is never uppercased.
   *
   * Carries its own `accent` for the same reason the time badge does: this calendar's colour
   * reaches the row as an inline border value, which no descendant can read.
   */
  titlePill?: {
    accent: string;
    mode: Helpers.AlldayBadgeStyle;
    inheritsText: boolean;
  };

  eventLocation: string;

  /**
   * Icon for the location row: this calendar's `location_icon`, the Teams icon where the
   * location names a Teams meeting, or the default marker.
   *
   * Resolved by the container rather than here, so both views draw one answer — and so
   * that `renderEventContent` stays free of per-calendar config reads.
   */
  locationIcon: string;

  eventDescription: string;

  /**
   * The label drawn before the event title: this calendar's own, or the icon Home Assistant
   * holds for it where the label defers to Home Assistant.
   *
   * Resolved by the container for the same reason as `locationIcon` above — one answer for
   * both views, and no per-calendar config reads down here — and for one more that is
   * specific to it: substituting the icon needs `hass`, which the list view does not pass
   * into `renderEventContent` at all.
   */
  entityLabel: string | undefined;

  /**
   * One label per calendar that contributed a copy of a merged duplicate, present only on
   * a row `filter_duplicates` collapsed across two or more calendars that each carry one.
   *
   * 🚨 Kept beside `entityLabel` rather than replacing it, and **not** because an iterable
   * binding would disturb the DOM. That was the original justification here and it is
   * false: routing every single-label row through a one-element list was measured to leave
   * the whole unit suite green, snapshots included. What `undefined` buys is behavioral.
   * It is how a row says "no merge to draw", which sends it down the branch below and
   * leaves a merge involving an unlabelled winner rendering exactly as it does today,
   * rather than promoting the label of a calendar that lost.
   */
  mergedLabels?: Types.ResolvedLabel[];

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
    allDayBadge,
    titlePill,
    eventLocation,
    locationIcon,
    eventDescription,
    shouldShowTime,
    countdownStr,
    progressPercentage,
    entityLabel,
    mergedLabels,
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

  // A single-day all-day event has nothing left to say once the badge has the label, so
  // there is no empty span to lay out beside it.
  const timeValue = eventTime ? html`<span>${eventTime}</span>` : nothing;

  // The badge is a direct child of `.time-actual`, never of `.time-text`: inside the latter
  // it would match the `time_max_lines` clamp selector and be truncated like body text.
  //
  // No whitespace between the badge and what follows it. Today that is belt and braces
  // rather than the fix it looks like: `.time-actual` is a flex row, and flex drops a
  // whitespace-only text node between two items, so the space this used to carry was never
  // rendering. The real double gap was two margins — the badge's own and the countdown's
  // lead-in — and the stylesheet drops the second when it follows a badge. Written tightly
  // anyway so the markup does not quietly depend on the container staying a flex row.
  // `--calendar-card-color-time` is the property `.time` sets its own colour from, so naming
  // it here hands the pill exactly the colour it is sitting in -- the shipped grey, or the
  // user's `time_color`. See the note at the title pill for why this is published as a token
  // rather than read as `currentColor`: a treatment that sets `color` would otherwise be
  // read back by its own ground.
  const allDayBadgeEl = allDayBadge
    ? // prettier-ignore
      html`<span
        class=${'allday-badge allday-pill-' + allDayBadge.mode + (allDayBadge.inheritsText ? ' allday-source-text' : '')}
        lang=${allDayBadge.lang}
        style=${`--calendar-card-event-accent: ${allDayBadge.accent};` + (allDayBadge.inheritsText ? ' --badge-source: var(--calendar-card-color-time);' : '')}
        >${allDayBadge.label}</span
      >`
    : nothing;

  // Keep folded time/countdown spans adjacent; whitespace would render before the separator.
  // prettier-ignore
  const timeText = foldCountdown
    ? html`<span class="time-text">${timeValue}<span class="time-countdown">${countdownStr}</span></span>`
    : timeValue;

  return html`
    <div class="event-content">
      ${renderEventTitle(event, config, entityLabel, titleForecasts, titlePill, mergedLabels)}
      <div class="time-location">
        ${progressRow}
        ${shouldShowTime
          ? html`
              <div class="time">
                <div class="time-actual">
                  <ha-icon icon="mdi:clock-outline"></ha-icon>
                  ${allDayBadgeEl}${timeText}
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
                <ha-icon icon="${locationIcon}"></ha-icon>
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

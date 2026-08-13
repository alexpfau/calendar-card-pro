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

  // Written with no whitespace between the parts, which is load-bearing rather than
  // stylistic and is the opposite of the rule at the top of this file.
  //
  // `.date-column .weather` is `display: flex`, and a flex container drops the
  // whitespace between its items -- so in the list view the indentation this template
  // would otherwise carry costs nothing and is invisible. `.column-date-content
  // .weather` is a grid *item*, not a flex container: there the very same text nodes
  // collapse to a real rendered space, which put the temperature roughly a space and a
  // half from the icon instead of the 1px `margin-right` the stylesheet asks for.
  //
  // Fixed here rather than by flexing the column container, which would have been the
  // shorter change and the wrong one: that container carries `text-overflow: ellipsis`
  // and `white-space: nowrap`, both of which need a block container, so flexing it
  // trades a spacing bug for a truncation bug.
  //
  // Note this is not only the icon-to-temperature gap the report named. The same
  // phantom space sat between the temperature and the UV index, where it was added to
  // the 2px margin that is supposed to be the whole gap. Removing the whitespace makes
  // every gap in this badge identical in the two views, which is what the acceptance
  // criterion actually asks for.
  //
  // Each part therefore begins immediately after the previous `}`. The line breaks that
  // keep this readable are placed *inside* the `${ }`, where they are JavaScript rather
  // than template text and so reach no DOM. `prettier-ignore` is what keeps them there:
  // Prettier formats embedded HTML inside `html` templates, and left to itself it puts
  // the indentation -- and the bug -- straight back.
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

/**
 * Classify a day's start-of-day timestamp as today and/or tomorrow.
 *
 * Both views need this and both computed it independently — `renderDay` inline, the
 * column renderer in its own local helper — which is exactly the duplication
 * `isWeekendDate` above was extracted to end, one field over. Kept here so a change to
 * what "today" means (a timezone fix, say) reaches both views in a single edit rather
 * than being applied to whichever one the author happened to be reading.
 *
 * Deliberately compares `toDateString()` rather than timestamps: the day boundary is a
 * *calendar* boundary in the browser's local zone, and comparing numbers would make it
 * a UTC one.
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
 * A pictographic character: emoji (as a surrogate pair) or a symbol/dingbat.
 *
 * Written out longhand rather than as `\p{Extended_Pictographic}` because
 * tsconfig targets ES2017 and Unicode property escapes are ES2018.
 */
const GLYPH_CHAR =
  /[\u2000-\u3300]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/;

/** Whitespace or a Latin letter -- the tell-tale of prose rather than a glyph. */
const PROSE_CHAR = /[\sA-Za-z]/;

/**
 * Whether a text label is a compact glyph (emoji, symbol) rather than prose.
 *
 * This drives the hanging indent applied to wrapped titles. Hanging a single
 * glyph in the margin buys the title a couple of characters back on a narrow
 * column view; hanging a text label such as "Familienkalender: " would throw
 * most of the column away, so those keep the flush-left wrap they have today.
 *
 * Icon and image labels are already distinguishable by their own classes, so
 * only this text branch needs splitting.
 */
function isGlyphLabel(label: string): boolean {
  return GLYPH_CHAR.test(label) && !PROSE_CHAR.test(label);
}

/**
 * Render calendar label with support for text, emojis, images, and icons
 *
 * The shape is **resolved**, not inferred: a calendar may name it with `label_type`,
 * and where it does that naming wins. Inference remains the fallback and is what every
 * configuration written before the key existed uses, so this renders those unchanged.
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

  // style attribute only if a color was provided
  const styleAttr = labelIconColor ? `color: ${labelIconColor};` : nothing;

  // Handle icons (mdi:, phu:, fas:, hass:, etc.)
  if (type === 'icon') {
    return html`<ha-icon icon="${label}" class="label-icon" style=${styleAttr}></ha-icon>`;
  }

  // Handle image paths (either /local/ path or image file extension)
  if (type === 'image') {
    return html`<img src="${label}" class="label-image"></img>`;
  }

  // Default: text/emoji (original behavior). The extra class on the emoji case
  // is what lets the stylesheet hang a glyph in the margin without doing the
  // same to a prose label.
  const glyphClass = isGlyphLabel(label) ? ' label-emoji' : '';
  return html`<span class="calendar-label${glyphClass}">${label}</span>`;
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

  // label_icon_color and label_type from the matched entity config
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
 *
 * Extracted so `renderEventContent` can ask the question without calling the renderer.
 * It has to: `renderEventWeather` answers "no" with an empty template, which lit renders
 * as a comment marker, and a marker the list view does not emit is a real DOM divergence
 * that `tests/column-dom.test.ts`'s byte-identity gate correctly rejects. Asking first
 * lets the column view emit `nothing` -- exactly what the list view emits -- whenever no
 * badge was configured, so the two views stay byte-identical on the default path and
 * diverge only where the placement genuinely differs.
 *
 * Shared rather than duplicated: an inline copy of this predicate in the caller would be
 * free to drift from the one the renderer actually enforces.
 */
export function hasEventWeather(config: Types.Config): boolean {
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
 * @param placement Where the badge is being placed. `'title'` is the list view's
 *   summary-row badge; `'row'` is the column view's own row. See the block comment
 *   below for why the two differ in more than position.
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
  // Only render if weather is enabled for events
  const showEventWeather = hasEventWeather(config);

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

  // What `show_conditions` means depends on the placement, and only there.
  //
  // On the title row it gates the icon, which is what it has always done and what the
  // docs advertise: turning it off leaves a bare temperature floating beside the
  // summary, which reads fine because the badge has no gutter to join.
  //
  // In its own row it cannot. That row is one of four siblings inside .time-location,
  // and the other three each lead with an icon in a shared gutter that the stylesheet
  // does explicit work to line this one up with (styles.ts, and the comment there says
  // neither reset is optional). Dropping the icon leaves a temperature hanging in an
  // empty icon column between two icon-led rows, which looks broken rather than
  // configured. So the icon is unconditional here and `show_conditions` states the
  // condition in words instead -- the same promise the option's name makes, in the one
  // layout with room to keep it.
  //
  // Keyed on the placement rather than on the view: the placement *is* the reason, and
  // a future layout that gives the badge its own row inherits the fix by asking for the
  // row rather than by being named here.
  const ownRow = placement === 'row';
  const showIcon = ownRow || showConditions;
  const conditionText =
    ownRow && showConditions
      ? Weather.formatCondition(hass, config.weather?.entity, forecast.condition)
      : undefined;

  // Render weather with position-specific options.
  //
  // The words come last, after both numbers. Deliberate, and the reason is
  // weather.event.max_lines: whatever truncates eats the condition and never the
  // temperature or the UV index, which are the two fields a user configured on purpose.
  //
  // No separators are emitted here. The pieces are optional and independent, so a
  // template that placed its own separators would have to enumerate every combination
  // of the three, and would emit a stray one the moment a fourth piece is added. They
  // are supplied instead by `.event-weather-text > span + span::before` in the
  // stylesheet, which follows from which pieces are actually present and never fires
  // after the icon because the icon is outside the text wrapper.
  //
  // Two decisions about the composed string live here rather than beside that rule,
  // because they are about the text and not about the CSS.
  //
  // **A middot, not a comma.** Home Assistant's own condition vocabulary contains
  // "Clear, night". With a comma the row would read `20°, UV 0, Clear, night`, in which
  // nothing distinguishes our separator from the one inside the translated string.
  //
  // **The condition keeps its capital.** Lowercasing it reads better in English and is
  // the obvious thing to reach for; it is also wrong in some of the 35 languages the
  // card ships, and it is not our string to edit -- Home Assistant translated it. The
  // middot dissolves the question rather than trading it away: it makes each piece a
  // standalone chip, and Home Assistant's own capitalisation reads correctly there.
  //
  // **`UV4` stays closed up.** The middot has already made three chips of the row, and
  // a space inside `UV 4` would split a fourth at the same visual weight as the
  // separators, weakening the grouping the middot just created. It also keeps this
  // spelling identical to the day header's, which is not separated at all.
  // The nested text wrapper is the wrapping boundary. The row stays flex so the icon can
  // use the same alignment mechanism as time/location/description, while the weather
  // text itself stays ordinary inline content and can break inside "Clear, night".
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
 * Per-view choices `renderEventContent` cannot derive for itself.
 *
 * An object rather than a positional tail, and that is a decision taken once rather
 * than half-taken. The two placements below are both string unions containing `'row'`,
 * so as positional arguments separated by `hass` they would read
 * `(…, 'row', hass, 'row')` at the call site -- two identical literals meaning
 * different things, with nothing but argument order to tell a reader which is which.
 * Naming them removes the question. The precedent this replaces was positional, so the
 * whole optional tail moved together; nothing is left half-converted.
 */
export interface EventContentOptions {
  /** Fetched forecasts, if any. */
  weatherForecasts?: Types.WeatherForecasts;
  /**
   * Where the event weather badge goes. `'title'` (the default, and the list view's
   * behaviour) puts it on the summary row; `'row'` gives it its own row beneath the
   * time.
   */
  weatherPlacement?: 'title' | 'row';
  /**
   * Where the progress bar goes. `'inline'` (the default, and the list view's
   * behaviour) makes it a child of `.time`, right-aligned on that row; `'row'` gives
   * it its own row above the time, between the title and the time.
   *
   * The countdown deliberately has no such parameter, and the asymmetry is the design.
   * Inline, both wrap to a right-aligned position beneath the time once the row is too
   * narrow to hold them -- invisible in a list, where the event cell is as wide as the
   * card, and routine in a column, where it strands the element in dead space. The
   * countdown is fixed in the stylesheet, by left-aligning it and marking the join with
   * a separator, because it is *text* and reads as a continuation of the line above. A
   * bar cannot be: it is a *graphic*, and a wrapped graphic reads as a mistake wherever
   * it lands. So it gets a row instead.
   *
   * The reverse is equally true, which is why the countdown does not simply follow it
   * onto a row: every other row here leads with an icon, so a bare *text* row reads as
   * one whose icon has gone missing, while a bare *graphic* row reads as intentional.
   *
   * This can never produce a visually inconsistent event, because the two are strictly
   * mutually exclusive -- `getCountdownString` returns `null` once the event has started
   * and `progressPercentage` is non-null only while it is running, so a reader only ever
   * sees one of them.
   *
   * 🚨 A note for anyone revisiting the countdown half. The C5 specification proposed
   * dropping `display: flex` from `.time` in column view so the time and countdown would
   * "wrap as one string rather than as two atomic boxes". They cannot: `.time-actual` is
   * itself a flex container wrapping a `-webkit-box` clamp, so the time is an atomic
   * inline-level box either way and the wrapping is identical. Inline flow would instead
   * have stacked the two vertically -- `.time-actual` is block-level -- and taken
   * `align-items` out of play. It was built as a flex row for that reason.
   *
   * That note is still correct about what CSS alone can do, and `countdownPlacement`
   * below is the answer it was missing: the fix is a markup change, not a display change.
   */
  progressPlacement?: 'inline' | 'row';
  /**
   * Where the countdown goes. `'trailing'` (the default, and the list view's behaviour)
   * makes it a sibling of `.time-actual` at the end of the time row; `'text'` folds it
   * into the time text so the two read and break as one running phrase.
   *
   * The distinction is the same one the weather row learned: a flex item is placed as a
   * unit, so `7:00 - 23:59` and `in 7 hours` as two items can only ever break *between*
   * themselves. Chromium moves the whole countdown to a second flex line before it will
   * consider the ordinary break opportunities inside either string, which is why a narrow
   * column produced `7:00 - 23:59` over `· in 7 hours` and never `7:00 - 23:59 ·` over
   * `in 7 hours`. Ruled "less broken" by the maintainer after live review, reversing the
   * earlier decision to keep the countdown atomic.
   *
   * `'text'` therefore nests both inside a single `.time-text` span, exactly as
   * `.event-weather-text` nests the temperature, UV index and condition. `.time-actual`
   * stays a flex row of (icon, text), so the icon keeps aligning through
   * `event_icon_vertical_alignment` -- and now aligns against the *whole* wrapped block
   * rather than against the time alone, which is the second half of what was asked for.
   *
   * The list view keeps `'trailing'` and is untouched, markup included. Its countdown is
   * not a continuation of the time at all: there is no separator between them, and
   * `justify-content: space-between` parks it at the far right of a cell as wide as the
   * card. Folding it into the text would have to reproduce that right-alignment from
   * inside an inline formatting context, which needs a float, and would move a view whose
   * DOM is deliberately frozen. Two placements, two right answers -- the same shape as
   * `progressPlacement` above.
   */
  countdownPlacement?: 'trailing' | 'text';
  /**
   * Home Assistant instance, used only to localize the condition text the own-row
   * weather placement can carry. Absent for the title placement, which has no words.
   */
  hass?: Types.Hass | null;
}

/**
 * Render the body of a single event: title row, time, location and description.
 *
 * Deliberately excludes the wrapper element. Accent colour, background, padding and the
 * first/middle/last position classes belong to the container, because they are what
 * differs between the list's `<td class="event">` and the column view's card.
 *
 * Weather placement is the one axis-dependent decision left in here, and it is a markup
 * decision rather than a CSS one, which is why it is a parameter instead of a class.
 * In the list view the badge sits on the title row, to the right of the summary: there is
 * always slack there, because the event cell is as wide as the card. In the column view
 * there is none -- the narrowest track is 152px -- so a badge on the title row competes
 * with the title for the same line and the title wraps *around* it, breaking a two-word
 * summary into three lines. Live-verified at 6 columns, where `Team Sync Meeting` rendered
 * as `Team` / `Sync 24 degrees` / `Meeting`.
 *
 * So the column view moves it to a row of its own directly beneath the time, where it
 * lines up in the same icon gutter as the time, location and description rows and costs
 * one predictable line instead of fragmenting the title. Both placements share
 * `renderEventWeather`; the insertion point moves, and so does what `show_conditions`
 * gates -- see that function for why the icon cannot be optional in this placement.
 *
 * Progress placement is the second axis-dependent markup decision, and it is deliberately
 * asymmetric with the countdown -- see `EventContentOptions.progressPlacement` for why
 * that can never produce a visually inconsistent event.
 *
 * @param event Event to render
 * @param config Card configuration
 * @param parts Pre-computed locals from the container - see `EventContentParts`
 * @param options Per-view placement choices - see `EventContentOptions`. The defaults are
 *   the list view's behaviour, so omitting it renders exactly what the list view renders.
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

  // Asked once, so the two placements read off one answer and can never both fire.
  const hasProgressBar = progressPercentage !== null && config.show_progress_bar;
  const showInlineProgress = hasProgressBar && progressPlacement === 'inline';

  // Resolved to a value for the same reason `weatherRow` is: an inline
  // `${cond ? x : nothing}` would give one view a lit child-part the other lacks, and
  // the byte-identity gate compares serialized DOM with markers included.
  //
  // `.progress-bar-row` is a modifier on the same element rather than a wrapper. The
  // bar is already the box being sized and `.time-location` is already a column flex
  // container, so a wrapper would add a node that does nothing but inherit a width.
  const progressRow =
    hasProgressBar && progressPlacement === 'row'
      ? html`
          <div class="progress-bar progress-bar-row">
            <div class="progress-bar-filled" style="width: ${progressPercentage}%"></div>
          </div>
        `
      : nothing;

  // Withholding the forecasts is what suppresses the title-row badge -- `renderEventTitle`
  // renders nothing without them. Deliberately not a second flag: one source of truth for
  // "is there a badge here", so the two placements can never both fire.
  const titleForecasts = weatherPlacement === 'title' ? weatherForecasts : undefined;

  // Resolved to a value rather than branched inside the template, so both placements share
  // one template shape. A `${cond ? x : nothing}` inline would give the column view a lit
  // child-part the list view lacks, and `tests/column-dom.test.ts`'s byte-identity gate --
  // which compares serialized DOM, markers included -- would fail on the marker alone.
  //
  // `hasEventWeather` is asked first for the same reason: without it, the no-weather case
  // would emit the renderer's empty template, which lit renders as a marker the list view
  // does not have. With it, both views emit `nothing` unless a badge was actually asked for.
  const weatherRow =
    weatherPlacement === 'row' && hasEventWeather(config)
      ? renderEventWeather(event, config, weatherForecasts, 'row', hass)
      : nothing;

  // The countdown's placement, resolved once so the two halves cannot disagree.
  //
  // Folding is conditional on there actually *being* a countdown, not merely on the
  // placement asking for one. A wrapper around a single piece of text has no job -- it
  // exists to give two pieces one inline formatting context -- and emitting it anyway
  // would cost the strictest gate in the suite: under default config nothing here fires,
  // and column-dom.test.ts compares the two views byte for byte on exactly that basis.
  const foldCountdown = countdownPlacement === 'text' && countdownStr !== null;

  // The countdown in its own box at the end of the row -- the list view's placement, and
  // the only one the show_time: false branches below know about. Narrowed from
  // countdownStr rather than tested alongside it, so a folded countdown cannot also
  // render here.
  const trailingCountdown = foldCountdown ? null : countdownStr;

  // The time text, and the whole of the countdown's placement decision.
  //
  // Written with no whitespace between the tags, which is load-bearing rather than
  // stylistic: a newline between </span> and <span class="time-countdown"> is a real
  // rendered space in an inline formatting context, and it would sit *before* the
  // separator the stylesheet generates, making one side of the middot wider than the
  // other. That is the same defect .event-weather-text hit, diagnosed at length in
  // styles.ts beside the weather separators.
  //
  // The `// prettier-ignore` keeps that shape, and it is worth being exact about what it
  // is doing, because the obvious claim is false and I checked rather than asserting it.
  // Removing the directive and running `npm run format` *does* reflow the template — but
  // Prettier breaks inside the opening tag, as `<span class="time-text"\n>`, which is the
  // same trick it uses for `</span\n><span` and introduces no text node. So the tests
  // stay green: measured, 95 passing across both DOM gates with the directive gone.
  //
  // It stays for two reasons that are true. The reflowed form is materially harder to
  // read, and this is a template where reading it correctly is the whole safety argument.
  // And it only survives reformatting by luck of Prettier finding a tag boundary to break
  // at — add a third piece to the wrapper, or an attribute that changes where the line
  // fits, and the break can land somewhere that does emit a space. Freezing the shape is
  // cheaper than re-deriving that each time. Contrast leaves.ts:122, where the directive
  // genuinely is load-bearing: that template puts its interpolations at tag boundaries
  // across several lines, so reformatting moves indentation *adjacent to bindings*, and
  // deleting it turns five tests red.
  //
  // Every other case emits the span it always emitted, byte for byte, so neither the list
  // view's DOM golden nor the two views' byte-identity under defaults moves at all.
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
            // fold the countdown into, so both placements render the same trailing box.
            // This is why the branch reads `countdownStr` and not `trailingCountdown` --
            // narrowing it would delete the countdown outright in the column view.
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
 * Two layouts, because the two views give the indicator very different room.
 *
 * `absolute` is the list view's: the indicator floats inside the date cell, placed by
 * `today_indicator_position` as a percentage pair. That works there because the date
 * cell is a narrow, centre-aligned column — roughly 66px — so the default `15% 50%`
 * lands the dot in the margin beside the date, and the percentages stay meaningful
 * because the box is the size of the thing being marked.
 *
 * `inline` is the column view's, and it exists because percentages stop meaning
 * anything once the axis flips. A column header is the full track width with its date
 * flush left, so `15%` resolves *into* the day number rather than beside it, and no
 * other percentage fixes it: the header's own content box is full-width too, so there
 * is no box in the column whose width tracks the date text. Right-anchored values are
 * worse than wrong — at `95%` the dot lands in the gutter, closer to the *next* day's
 * content than to the day it marks. Rather than ask users to calibrate a percentage
 * against their column width, the column view drops positioning entirely and sets the
 * indicator as a leading item on the weekday row, giving an unambiguous `● Tue`.
 *
 * `today_indicator_position` is therefore inert in column view, in the same way and
 * for the same reason as `date_vertical_alignment`: it describes a placement the
 * layout does not have. `today_indicator`, `_size` and `_color` all still apply.
 *
 * @param config Calendar card configuration
 * @param isToday Whether the current day is today
 * @param layout Placement strategy — `absolute` positions by percentage, `inline`
 *   emits the indicator in normal flow for a container to place
 * @returns TemplateResult or nothing
 */
export function renderTodayIndicator(
  config: Types.Config,
  isToday: boolean,
  layout: 'absolute' | 'inline' = 'absolute',
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

  // Get position styles using CSS-like syntax. An inline indicator is placed by its
  // container, so it takes none: passing them would leave `position: absolute` on an
  // element whose containing block is the one it is supposed to sit beside.
  const positionStyles =
    layout === 'inline' ? {} : parseIndicatorPosition(config.today_indicator_position);

  // Render indicator based on type. The class is bare for the absolute layout rather
  // than spelled out, so the list view's markup is byte-identical to what it was
  // before the inline layout existed -- the DOM equality gate in tests/list-dom is
  // there to catch exactly that kind of incidental churn.
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

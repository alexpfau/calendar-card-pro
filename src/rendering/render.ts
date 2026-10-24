/**
 * List-view rendering functions for Calendar Card Pro.
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Activation from './activation';
import { gridDrawsEvent } from './grid';
import * as Leaves from './leaves';
import * as Presentation from './presentation';
import * as Toolbar from './toolbar';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import * as Localize from '../translations/localize';
import * as FormatUtils from '../utils/format';
import * as Helpers from '../utils/helpers';

/**
 * Re-exported so the card can dispatch between views through a single import namespace. Keeping every renderer reachable as `Render.*` means the call sites in the card's view dispatch read as a set rather than pulling from different modules.
 */
export { renderColumnGroupedEvents } from './column';
export { renderGridGroupedEvents } from './grid';

/**
 * Whether a view draws at least one event for these days, rather than only empty-day
 * placeholders, a grid `+N` block or nothing at all.
 *
 * Asked before the content renders, because the card decides from it whether `ha-card`
 * hosts tap targets, and so whether it may still present itself as a button. List and
 * column views draw every event their days hold; grid view draws a subset, which
 * `gridDrawsEvent` works out.
 *
 * @param view - The view that renders the days
 * @param days - The days it renders, after any width-driven reduction
 * @param config - Card configuration, resolved for that view
 * @returns True when at least one event is drawn
 */
export function drawsEvent(
  view: Types.EffectiveView,
  days: Types.EventsByDay[],
  config: Types.Config,
): boolean {
  if (view === 'grid') return gridDrawsEvent(days, config);
  return days.some((day) => day.events.some((event) => !event._isEmptyDay));
}

//-----------------------------------------------------------------------------
// MAIN CARD STRUCTURE RENDERING
//-----------------------------------------------------------------------------

/**
 * Render the main calendar card structure. Creates a stable DOM structure for card-mod compatibility.
 *
 * @param customStyles Custom style properties from configuration
 * @param title Card title from configuration
 * @param content Main card content (events or status)
 * @param handlers Event handler functions
 * @param isLoading Flag to mark the card as busy while events load
 * @param titlePending True while a templated title awaits its first value
 * @param effectiveView The view actually being rendered, after any width fallback
 * @param hasTapAction Whether the card has a keyboard-accessible tap action
 * @param hasHoldAction Whether the card has a pointer hold action
 * @param notice The fetch-failure notice, drawn after the content
 * @param toolbar The controls for the header toolbar; none draws no toolbar
 * @param hostsControls Whether the card draws interactive children of its own
 * @returns TemplateResult for the complete card
 */
export function renderMainCardStructure(
  customStyles: Record<string, string>,
  title: string | undefined,
  content: TemplateResult,
  handlers: {
    keyDown: (ev: KeyboardEvent) => void;
    keyUp: (ev: KeyboardEvent) => void;
    click: (ev: MouseEvent) => void;
    pointerDown: (ev: PointerEvent) => void;
    pointerMove: (ev: PointerEvent) => void;
    pointerUp: (ev: PointerEvent) => void;
    pointerCancel: (ev: PointerEvent) => void;
    pointerLeave: (ev: PointerEvent) => void;
    lostPointerCapture: (ev: PointerEvent) => void;
  },
  isLoading: boolean = false,
  titlePending: boolean = false,
  effectiveView: Types.EffectiveView = 'list',
  hasTapAction: boolean = false,
  hasHoldAction: boolean = false,
  notice: TemplateResult | typeof nothing = nothing,
  toolbar: Toolbar.HeaderToolbar = {},
  hostsControls: boolean = false,
): TemplateResult {
  const isPointerInteractive = hasTapAction || hasHoldAction;
  // A button may not contain another. While the card hosts controls of its own it stops
  // presenting itself as one to assistive technology, but keeps its tab stop: keys aimed
  // at the card itself still run its tap action, and those aimed at a control inside it
  // are the control's. A pointer tap anywhere off the controls still runs the tap action
  // too, which is why the ripple and cursor stay.
  const isCardButton = hasTapAction && !hostsControls;
  const hasTitle = Boolean(title || titlePending);
  const titleBlock = hasTitle
    ? html`<h1 class="card-header">${title}</h1>`
    : html`<div class="card-header-placeholder"></div>`;
  // The header toolbar rule:
  // - no control: no toolbar, and the header exactly as it was before there was one. Hence
  //   a single binding below; a second, even one rendering nothing, adds a marker and a
  //   text node to the header.
  // - trailing actions only (refresh and the view switch later, add always last): in the
  //   title's row at its inline end, or in a slim row of their own when there is no title.
  // - a leading group (previous / Today / next and the visible range, later): a row of its
  //   own between the title and the events, with the legend lane below it.
  // The toolbar stays inside `.header-container`, after the h1 or the
  // `.card-header-placeholder`, so both keep the place card-mod styles find them in.
  const toolbarBlock = Toolbar.renderHeaderToolbar(toolbar, hasTitle);
  // `viewCssClass` returns '' for list view, so the filter is what keeps a stray
  // separator out of the class attribute.
  const cardClasses = [
    'calendar-card-pro',
    ViewConfig.viewCssClass(effectiveView),
    isPointerInteractive ? 'card-interactive' : '',
  ]
    .filter((cls) => cls !== '')
    .join(' ');

  return html`
    <ha-card
      class=${cardClasses}
      style=${styleMap(customStyles)}
      tabindex=${hasTapAction ? '0' : nothing}
      role=${isCardButton ? 'button' : nothing}
      aria-busy=${isLoading ? 'true' : 'false'}
      @keydown=${handlers.keyDown}
      @keyup=${handlers.keyUp}
      @click=${handlers.click}
      @pointerdown=${handlers.pointerDown}
      @pointermove=${handlers.pointerMove}
      @pointerup=${handlers.pointerUp}
      @pointercancel=${handlers.pointerCancel}
      @pointerleave=${handlers.pointerLeave}
      @lostpointercapture=${handlers.lostPointerCapture}
    >
      ${isPointerInteractive ? html`<ha-ripple></ha-ripple>` : nothing}
      ${
        isLoading
          ? html`
              <div class="loading-indicator" role="status" aria-live="polite" title="Loading">
                <div class="spinner" aria-hidden="true"></div>
              </div>
            `
          : nothing
      }

      <!-- Title is always rendered with the same structure, even if empty.
           A templated title holds the h1 open from first paint, so the header
           does not gain 16px of margin the moment its value arrives. That is a
           claim about the *pending* window only: once a value is in hand the
           header behaves exactly as it would for a static title of the same
           text, so a template resolving to an empty string collapses back to
           the zero-height placeholder rather than leaving an empty heading
           taking up space forever. -->
      <div class=${toolbarBlock ? 'header-container has-toolbar' : 'header-container'}>
        ${toolbarBlock ? html`${titleBlock}${toolbarBlock}` : titleBlock}
      </div>

      <!-- Content container is always present -->
      <div class="content-container">${content}</div>
      ${notice}
    </ha-card>
  `;
}

/**
 * Render the line naming the calendars that could not be loaded.
 *
 * A label followed by the names rather than a sentence with a slot in it, so it reads
 * naturally in every language without the card needing an interpolation mechanism. The
 * label carries its own colon, because the punctuation differs by language.
 *
 * @param names Display names of the calendars that failed
 * @param language Language code for translations
 * @returns Template result for the notice
 */
export function renderFetchErrorNotice(names: string[], language: string): TemplateResult {
  const translations = Localize.getTranslations(language);

  return html`
    <div class="fetch-error" role="status">
      <ha-icon class="fetch-error-icon" icon="mdi:alert-circle-outline"></ha-icon>
      <span class="fetch-error-text">${translations.loadFailed} ${names.join(', ')}</span>
    </div>
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
 * Create consistent separator styles for any type of horizontal separator. Properly calculates margins based on day_spacing to ensure vertical centering.
 *
 * Offsets are derived with {@link ViewConfig.scaleLength} rather than `parseFloat`, so a
 * `day_spacing` expressed in `em` positions the rules in `em` too. The day rule needs no
 * scaling at all: its margin is one `day_spacing` by definition, so the configured value
 * passes straight through.
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
  if (separatorType === 'day') {
    return {
      borderTopWidth: lineWidth,
      borderTopColor: lineColor,
      borderTopStyle: 'solid',
      marginTop: '0px', // No additional margin needed on top (table already has margin)
      marginBottom: config.day_spacing, // Equal spacing below
    };
  }

  let multiplier = Constants.UI.SEPARATOR_SPACING.WEEK; // Default to week multiplier
  if (separatorType === 'month') {
    multiplier = Constants.UI.SEPARATOR_SPACING.MONTH;
  }

  const finalSpacing = ViewConfig.scaleLength(config.day_spacing, multiplier);

  return {
    borderTopWidth: lineWidth,
    borderTopColor: lineColor,
    borderTopStyle: 'solid',
    marginTop: finalSpacing,
    marginBottom: finalSpacing,
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
  if (ViewConfig.isZeroLength(lineWidth) || isFirstWeek) {
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
 * Render a week row with a week number pill and a separator line. Uses table structure to align perfectly with day tables.
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

  const multiplier = isMonthBoundary
    ? Constants.UI.SEPARATOR_SPACING.MONTH
    : Constants.UI.SEPARATOR_SPACING.WEEK;

  // The row carries half the separator spacing below it, and pulls up by whatever the
  // day table's own margin already contributed, so the rule lands centered on the gap.
  const rowStyle = {
    marginTop: isFirstWeek ? '0px' : ViewConfig.scaleLength(config.day_spacing, multiplier / 2 - 1),
    marginBottom: ViewConfig.scaleLength(config.day_spacing, multiplier / 2),
  };

  const lineStyle: Record<string, string> = {};

  if (!isFirstWeek) {
    if (isMonthBoundary && !ViewConfig.isZeroLength(config.month_separator_width)) {
      lineStyle['--separator-border-width'] = config.month_separator_width;
      lineStyle['--separator-border-color'] = config.month_separator_color;
      lineStyle['--separator-display'] = 'block';
    } else if (!ViewConfig.isZeroLength(config.week_separator_width)) {
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
 * @param weatherForecasts Fetched forecasts, if any
 * @param hass Home Assistant instance, whose country decides which days are the weekend,
 *   or its language when no country is set
 * @returns Rendered date column
 */
function renderDateColumn(
  date: Date,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const weatherContent = Leaves.renderDateWeather(date, config, weatherForecasts);

  return Leaves.renderDateContent(date, config, language, isToday, weatherContent, hass);
}

/**
 * Render a single day with its events
 *
 * @param day - Day data containing events
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param prevDay - Previous day data for determining separators
 * @param boundaryInfo - Information about week and month boundaries
 * @param eventsTappable - Whether each event is a tap target of its own
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
  eventsTappable = false,
): TemplateResult {
  const { isToday, isTomorrow } = Leaves.classifyDay(day.timestamp);
  // Column view carries `weekend` on its day container, so list view does too — a card-mod
  // rule targeting weekends should not need to know which view is active. List view also
  // keeps it on `.date-column`, where it drives the built-in date-cell styling.
  const isWeekendDay = FormatUtils.isWeekendDate(new Date(day.timestamp), hass);

  let daySeparator: TemplateResult | typeof nothing = nothing;

  const isMonthBoundary = boundaryInfo?.isNewMonth || false;
  const isWeekBoundary = boundaryInfo?.isNewWeek || false;
  const hasMonthSeparator =
    isMonthBoundary && !ViewConfig.isZeroLength(config.month_separator_width);
  const hasWeekSeparator =
    isWeekBoundary &&
    (config.show_week_numbers !== null || !ViewConfig.isZeroLength(config.week_separator_width));

  const dayLabelId = eventsTappable ? Activation.dayLabelId(day.timestamp) : undefined;

  const daySeparatorWidth = config.day_separator_width;
  const daySeparatorColor = config.day_separator_color;

  if (
    prevDay &&
    !ViewConfig.isZeroLength(daySeparatorWidth) &&
    !hasMonthSeparator &&
    !hasWeekSeparator
  ) {
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
        weekend: isWeekendDay,
      })}
    >
      ${repeat(
        day.events,
        (event, index) => `${event._entityId}-${event.summary}-${index}`,
        (event, index) =>
          renderEvent(
            event,
            day,
            index,
            config,
            language,
            isToday,
            weatherForecasts,
            hass,
            eventsTappable,
            dayLabelId,
          ),
      )}
    </table>
  `;
}

/**
 * Render grouped events with week and month separators. Uses a precedence system for different separator types.
 *
 * @param eventsTappable - Whether each event is a tap target of its own
 */
export function renderGroupedEvents(
  days: Types.EventsByDay[],
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  eventsTappable = false,
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
        !ViewConfig.isZeroLength(config.month_separator_width) &&
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
        ${renderDay(
          day,
          config,
          language,
          prevDay,
          boundaryInfo,
          weatherForecasts,
          hass,
          eventsTappable,
        )}
      `;
    })}
  `;
}

/**
 * A list event's content, inside the button that makes the event a tap target when it is one.
 *
 * Not the cell itself: in a table exposed as one, ARIA in HTML keeps a `<td>` a cell, and a
 * cell given `role="button"` stops being the row's cell. So the button is an element of its
 * own, drawn only while events are tap targets, which leaves the default markup exactly as it
 * was. The cell carries `event-tappable` meanwhile, which is what lets the button answer for
 * the whole cell; see `.event-button` in `styles.ts`.
 *
 * @param content - The event's rendered content
 * @param tap - The event's tap target, or undefined when it is not one
 * @param dayLabelId - The id of the day's date cell, which describes the button
 * @returns The content, wrapped in the button when the event is a tap target
 */
function renderEventButton(
  content: TemplateResult,
  tap: Activation.EventTapTarget | undefined,
  dayLabelId: string | undefined,
): TemplateResult {
  if (!tap) return content;
  return html`<div
    class="event-button event-interactive"
    role="button"
    tabindex="0"
    aria-describedby=${dayLabelId ?? nothing}
    .calendarCardEventTap=${tap}
  >
    ${content}
  </div>`;
}

/**
 * Render a single event
 *
 * @param event - Event data to render
 * @param day - Day that contains this event
 * @param index - Event index within the day
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param eventsTappable - Whether the event is a tap target of its own
 * @param dayLabelId - The id the day's date cell carries while events are tap targets, by
 *   which each event names its day
 * @returns TemplateResult for the event
 */
function renderEvent(
  event: Types.CalendarEventData,
  day: Types.EventsByDay,
  index: number,
  config: Types.Config,
  language: string,
  isToday: boolean,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  eventsTappable = false,
  dayLabelId?: string,
): TemplateResult {
  const presentation = Presentation.buildEventPresentation(event, config, language, hass);
  const tap = Activation.eventTapTarget(event, presentation.entityAccentColor, eventsTappable);

  const dayDate = new Date(day.timestamp);
  const isWeekendDay = FormatUtils.isWeekendDate(dayDate, hass);

  const isFirst = index === 0;
  const isLast = index === day.events.length - 1;
  const isMiddle = !isFirst && !isLast;

  const eventClasses = {
    event: true,
    'event-first': isFirst,
    'event-middle': isMiddle,
    'event-last': isLast,
    'past-event': presentation.isPastEvent,
    'event-tappable': tap !== undefined,
    'event-now': presentation.isNow,
  };

  // Prettier 3.9 would put each multi-line `${…}` below on lines of its own, which breaks
  // the source-shape guard on the `: ''` idiom here ("preserves no-output idioms at
  // extraction seams" in tests/list-dom.test.ts).
  // prettier-ignore
  return html`
    <tr>
      ${index === 0
        ? html`
            <td
              class="date-column ${isWeekendDay ? 'weekend' : ''}"
              rowspan="${day.events.length}"
              style="position: relative;"
              id=${dayLabelId ?? nothing}
            >
              ${renderDateColumn(dayDate, config, language, isToday, weatherForecasts, hass)}
              ${Leaves.renderTodayIndicator(config, isToday)}
            </td>
          `
        : ''}
      <td
        class=${classMap(eventClasses)}
        style="border-inline-start: var(--calendar-card-line-width-vertical) solid ${presentation.entityAccentColor}; background-color: ${presentation.entityAccentBackgroundColor};${Helpers.styleDeclarations(
          presentation.accentTextProperties,
        )}"
      >
        ${renderEventButton(
          Leaves.renderEventContent(event, config, presentation.contentParts, {
            weatherForecasts,
          }),
          tap,
          dayLabelId,
        )}
      </td>
    </tr>
  `;
}

/**
 * Column view rendering for Calendar Card Pro.
 *
 * The list and column views share leaves and event presentation. This file owns only
 * the column-view axis: day columns, header rows, and vertical separators.
 *
 * @see renderGroupedEvents in `render.ts` for the list-view counterpart
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Leaves from './leaves';
import * as Presentation from './presentation';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';

//-----------------------------------------------------------------------------
// DAY BOUNDARIES
//-----------------------------------------------------------------------------

/**
 * Where each day sits relative to the one before it.
 */
interface DayBoundary {
  isNewWeek: boolean;

  isNewMonth: boolean;
}

/**
 * Classify every day in a run by the boundaries it opens.
 *
 * Week boundaries compare week numbers, not weekday indices, so missing days under
 * `show_empty_days: false` do not hide the boundary.
 *
 * @param days - Days to classify, already grouped and in ascending date order
 * @returns One entry per day, index-aligned with the input
 */
function computeDayBoundaries(days: Types.EventsByDay[]): DayBoundary[] {
  return days.map((day, index) => {
    const prevDay = index > 0 ? days[index - 1] : undefined;

    return {
      isNewWeek: !prevDay || day.weekNumber !== prevDay.weekNumber,
      isNewMonth: Boolean(prevDay && day.monthNumber !== prevDay.monthNumber),
    };
  });
}

//-----------------------------------------------------------------------------
// SEPARATORS
//-----------------------------------------------------------------------------

type SeparatorKind = 'day' | 'week' | 'month';

interface ColumnSeparator {
  kind: SeparatorKind;
  width: string;
  color: string;
}

/**
 * Decide which rule, if any, belongs in the gutter to the inline-start of a column.
 *
 * Precedence is month, then week, then day, matching list view. Each family is gated
 * on its own width: week-number pills live inside columns, while rules live between
 * columns, so there is no list-view-style collision to suppress.
 *
 * @param boundary - What this column opens relative to the one before it
 * @param config - Card configuration, already resolved for the column view
 * @returns The rule to draw, or null when this gutter carries none
 */
function resolveSeparator(boundary: DayBoundary, config: Types.Config): ColumnSeparator | null {
  if (boundary.isNewMonth && !ViewConfig.isZeroLength(config.month_separator_width)) {
    return {
      kind: 'month',
      width: config.month_separator_width,
      color: config.month_separator_color,
    };
  }

  if (boundary.isNewWeek && !ViewConfig.isZeroLength(config.week_separator_width)) {
    return {
      kind: 'week',
      width: config.week_separator_width,
      color: config.week_separator_color,
    };
  }

  if (!ViewConfig.isZeroLength(config.day_separator_width)) {
    return { kind: 'day', width: config.day_separator_width, color: config.day_separator_color };
  }

  return null;
}

/**
 * Render one vertical rule, centred in the gutter to the inline-start of a column.
 *
 * The separator overlays the column's grid cell and is pulled into the gutter, so
 * enabling a rule paints the boundary without moving any columns.
 *
 * @param separator - The resolved rule for this gutter
 * @param columnIndex - Zero-based index of the column this rule precedes
 * @param gap - The grid's column gap, i.e. the resolved `day_spacing`
 * @returns Rendered separator
 */
function renderColumnSeparator(
  separator: ColumnSeparator,
  columnIndex: number,
  gap: string,
): TemplateResult {
  return html`
    <div
      class="column-separator column-separator-${separator.kind}"
      style=${styleMap({
        gridColumn: String(columnIndex + 1),
        gridRow: '1',
        width: separator.width,
        backgroundColor: separator.color,
        marginInlineStart: `calc(-0.5 * (${gap} + ${separator.width}))`,
      })}
    ></div>
  `;
}

//-----------------------------------------------------------------------------
// EVENT RENDERING
//-----------------------------------------------------------------------------

/**
 * Render a single event inside a day column.
 *
 * @param event - Event to render
 * @param day - Day that contains this event
 * @param index - Event index within the day
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param weatherForecasts - Fetched forecasts, if any
 * @param hass - Home Assistant instance, for locale-aware formatting
 * @returns Rendered event
 */
function renderColumnEvent(
  event: Types.CalendarEventData,
  day: Types.EventsByDay,
  index: number,
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const presentation = Presentation.buildEventPresentation(event, config, language, hass);

  const isFirst = index === 0;
  const isLast = index === day.events.length - 1;

  const eventClasses = {
    event: true,
    'event-first': isFirst,
    'event-middle': !isFirst && !isLast,
    'event-last': isLast,
    'past-event': presentation.isPastEvent,
  };

  return html`
    <div
      class=${classMap(eventClasses)}
      style="border-inline-start: var(--calendar-card-line-width-vertical) solid ${presentation.entityAccentColor}; background-color: ${presentation.entityAccentBackgroundColor};"
    >
      ${Leaves.renderEventContent(event, config, presentation.contentParts, {
        weatherForecasts,
        weatherPlacement: 'row',
        progressPlacement: 'row',
        countdownPlacement: 'text',
        hass,
      })}
    </div>
  `;
}

//-----------------------------------------------------------------------------
// DAY COLUMN
//-----------------------------------------------------------------------------

/**
 * Render one day as a column: header, optional rule, then the day's events.
 *
 * @param day - Day data containing events
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param weekRow - Reserved week-number row, or `nothing` when week numbers are off
 * @param columnIndex - Zero-based track this column occupies
 * @param weatherForecasts - Fetched forecasts, if any
 * @param hass - Home Assistant instance, for locale-aware formatting
 * @returns Rendered day column
 */
function renderDayColumn(
  day: Types.EventsByDay,
  config: Types.Config,
  language: string,
  weekRow: TemplateResult | typeof nothing,
  columnIndex: number,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const dayDate = new Date(day.timestamp);
  const { isToday, isTomorrow } = Leaves.classifyDay(day.timestamp);
  const isWeekendDay = Leaves.isWeekendDate(dayDate);

  const weatherContent = Leaves.renderDateWeather(dayDate, config, weatherForecasts);

  const separatorWidth = ViewConfig.resolveColumnOption(config, 'day_header_separator_width');
  const separatorColor = ViewConfig.resolveColumnOption(config, 'day_header_separator_color');

  const headerSeparator = ViewConfig.isZeroLength(separatorWidth)
    ? nothing
    : html`<div
        class="column-header-separator"
        style=${styleMap({
          borderTopWidth: separatorWidth,
          borderTopColor: separatorColor,
          borderTopStyle: 'solid',
        })}
      ></div>`;

  const todayIndicator = Leaves.renderTodayIndicator(config, isToday, 'inline');
  const hasInlineIndicator = todayIndicator !== nothing;

  return html`
    <div
      class=${classMap({
        'day-column': true,
        today: isToday,
        tomorrow: isTomorrow,
        'future-day': !isToday,
        weekend: isWeekendDay,
      })}
      style=${styleMap({ gridColumn: String(columnIndex + 1), gridRow: '1' })}
    >
      <div class="column-day-header">
        <div
          class=${classMap({
            'column-date-content': true,
            'with-today-indicator': hasInlineIndicator,
            'with-week-number': weekRow !== nothing,
          })}
        >
          ${weekRow} ${todayIndicator}
          ${Leaves.renderDateContent(dayDate, config, language, isToday, weatherContent)}
        </div>
      </div>
      ${headerSeparator}
      <div class="column-events">
        ${repeat(
          day.events,
          (event, index) => `${event._entityId}-${event.summary}-${index}`,
          (event, index) =>
            renderColumnEvent(event, day, index, config, language, weatherForecasts, hass),
        )}
      </div>
    </div>
  `;
}

//-----------------------------------------------------------------------------
// WEEK NUMBERS
//-----------------------------------------------------------------------------

/**
 * Render one column's week-number cell.
 *
 * @param weekNumber - Week number for this day, or null when unavailable
 * @param visible - Whether this column is the one that shows the number
 * @returns Rendered week-number cell
 */
function renderColumnWeekNumber(
  weekNumber: number | null | undefined,
  visible: boolean,
): TemplateResult {
  return html`
    <div class="column-week-number" style=${styleMap(visible ? {} : { visibility: 'hidden' })}>
      <div class="week-number">${weekNumber ?? ''}</div>
    </div>
  `;
}

/**
 * Build the week-number row for every column, or `nothing` for all of them.
 *
 * @param days - Days to render, already grouped and sorted
 * @param config - Card configuration, already resolved for the column view
 * @returns One cell per day, or one `nothing` per day when no row is warranted
 */
function buildWeekRows(
  days: Types.EventsByDay[],
  config: Types.Config,
): Array<TemplateResult | typeof nothing> {
  const boundaries = computeDayBoundaries(days);

  const visible = boundaries.map(
    (boundary, index) => boundary.isNewWeek && !(index === 0 && !config.show_current_week_number),
  );

  if (config.show_week_numbers === null || !visible.some(Boolean)) {
    return days.map(() => nothing);
  }

  return days.map((day, index) => renderColumnWeekNumber(day.weekNumber, visible[index]));
}

//-----------------------------------------------------------------------------
// GRID CONTAINER
//-----------------------------------------------------------------------------
/**
 * Render grouped events as side-by-side day columns.
 *
 * Tracks use `minmax(0, 1fr)` so long titles wrap instead of forcing the grid wider
 * than the card. Every item is placed explicitly because auto-placement would move
 * day columns when separator overlays claim the same grid row.
 *
 * @param days - Days to render, already grouped and sorted
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param weatherForecasts - Fetched forecasts, if any
 * @param hass - Home Assistant instance, for locale-aware formatting
 * @returns Rendered column grid
 */
export function renderColumnGroupedEvents(
  days: Types.EventsByDay[],
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const headerGap = ViewConfig.resolveColumnOption(config, 'day_header_gap');
  const weekRows = buildWeekRows(days, config);
  const boundaries = computeDayBoundaries(days);

  const separators = boundaries
    .map((boundary, index) => ({ separator: resolveSeparator(boundary, config), index }))
    .filter(({ separator, index }) => separator !== null && index > 0)
    .map(({ separator, index }) =>
      renderColumnSeparator(separator as ColumnSeparator, index, config.day_spacing),
    );

  return html`
    <div
      class="column-grid"
      style=${styleMap({
        gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        columnGap: config.day_spacing,
        '--calendar-card-column-header-gap': headerGap,
      })}
    >
      ${days.map((day, index) =>
        renderDayColumn(day, config, language, weekRows[index], index, weatherForecasts, hass),
      )}
      ${separators}
    </div>
  `;
}

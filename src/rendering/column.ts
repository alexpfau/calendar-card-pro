/* eslint-disable import/order */
/**
 * Column view rendering for Calendar Card Pro
 *
 * Renders each day as a vertical column laid out side by side, rather than as a row in
 * a vertical list. The two views share every leaf — date block, event body, today
 * indicator — and differ only in the container that arranges them.
 *
 * That sharing is the point of the module boundary. Phase 1 extracted the leaves into
 * `leaves.ts` and Phase 2 extracted the per-event derived values into
 * `presentation.ts`, both explicitly so this file could compose them rather than
 * reimplement them. Nothing here recomputes an event's time string, countdown,
 * accent colour or past/future state: those come from `buildEventPresentation`, the
 * same function the list view calls, so the two views cannot drift.
 *
 * What this file owns is the axis, and only the axis:
 *
 * - a CSS grid with one track per day, instead of a stack of tables
 * - a horizontal day header, instead of a fixed-width date cell beside the events
 * - an optional horizontal rule under that header, instead of vertical day separators
 *
 * @see renderGroupedEvents in `render.ts` for the list-view counterpart
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { repeat } from 'lit/directives/repeat.js';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import * as Leaves from './leaves';
import * as Presentation from './presentation';

//-----------------------------------------------------------------------------
// EVENT RENDERING
//-----------------------------------------------------------------------------

/**
 * Render a single event inside a day column.
 *
 * The body is produced by the same leaf the list view uses, so the two views render
 * identical event content. Only the wrapper differs: a `<div>` in a flex column here,
 * a `<td>` in a table row there. `renderEventContent` excludes that wrapper for
 * exactly this reason.
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
      ${Leaves.renderEventContent(event, config, presentation.contentParts, weatherForecasts)}
    </div>
  `;
}

//-----------------------------------------------------------------------------
// DAY COLUMN
//-----------------------------------------------------------------------------

/**
 * Render one day as a column: header, optional rule, then the day's events.
 *
 * The header arranges the weekday, day number, month and weather badge horizontally.
 * Those elements are produced by `renderDateContent`, unchanged from the list view —
 * it takes the weather badge as a parameter precisely so a container can decide where
 * to put it, and it owns the weekend/today colour precedence chain so both views
 * apply the same rules.
 *
 * @param day - Day data containing events
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param weatherForecasts - Fetched forecasts, if any
 * @param hass - Home Assistant instance, for locale-aware formatting
 * @returns Rendered day column
 */
function renderDayColumn(
  day: Types.EventsByDay,
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const dayDate = new Date(day.timestamp);
  const { isToday, isTomorrow } = Leaves.classifyDay(day.timestamp);
  const isWeekendDay = Leaves.isWeekendDate(dayDate);

  const weatherContent = Leaves.renderDateWeather(dayDate, config, weatherForecasts);

  // A zero width means "no rule", matching how every other separator width in the
  // card is switched off. Zero is checked in any unit rather than against the literal
  // `0px`, because a user can write `0`, `'0'` or `'0em'` and mean the same thing.
  // Rendering a zero-width border would still emit an element that carries the
  // separator's own 4px bottom margin, adding dead space under the header. (The
  // header's 4px bottom padding is unconditional and applies either way — an earlier
  // comment here attributed the margin to the header, which is wrong.)
  // Unlike the list separators this one defaults to `1px` rather than `0px` (spec B2) —
  // it is structural, not decorative — so this branch is the opt-out path rather than
  // the default one.
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

  return html`
    <div
      class=${classMap({
        'day-column': true,
        today: isToday,
        tomorrow: isTomorrow,
        'future-day': !isToday,
        weekend: isWeekendDay,
      })}
    >
      <div class="column-day-header">
        <div class="column-date-content">
          ${Leaves.renderDateContent(dayDate, config, language, isToday, weatherContent)}
        </div>
        ${Leaves.renderTodayIndicator(config, isToday)}
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
// GRID CONTAINER
//-----------------------------------------------------------------------------

/**
 * Render grouped events as side-by-side day columns.
 *
 * The track definition is `repeat(N, minmax(0, 1fr))` rather than `repeat(N, 1fr)`.
 * A bare `1fr` expands to `minmax(auto, 1fr)`, whose `auto` floor refuses to shrink a
 * track below the intrinsic width of its widest content — so a single long event
 * title would push the grid wider than the card instead of wrapping. `minmax(0, 1fr)`
 * removes that floor. Flexbox has the identical trap in `min-width: auto`.
 *
 * Columns are deliberately *not* stretched to equal heights. CSS grid would do that by
 * default, and the result is wrong here: an accent border and a day's background run the
 * full height of the track, so a quiet Tuesday next to a busy Wednesday would draw a
 * border down a stretch of empty space with nothing beside it. The grid sets
 * `align-items: start` (styles.ts) so each column is only as tall as its own content.
 * The headers still line up, because every column starts at the same grid row.
 *
 * Day, week and month separators are not rendered. The list view's separators are
 * horizontal rules between stacked days; in a column layout the equivalent boundary
 * is the gap between tracks, which `day_gap` already controls. The header rule is the
 * column view's own separator, and it is opt-out: it defaults to visible (spec B2)
 * and is suppressed by setting its width to `0px`.
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
  const dayGap = ViewConfig.resolveColumnOption(config, 'day_gap');

  return html`
    <div
      class="column-grid"
      style=${styleMap({
        gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        columnGap: dayGap,
      })}
    >
      ${days.map((day) => renderDayColumn(day, config, language, weatherForecasts, hass))}
    </div>
  `;
}

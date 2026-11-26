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

import * as Activation from './activation';
import * as LaneRender from './lanes';
import * as Leaves from './leaves';
import * as Presentation from './presentation';
import * as TextScale from './text-scale';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import * as ColorMix from '../utils/color-mix';
import * as FormatUtils from '../utils/format';
import * as Helpers from '../utils/helpers';

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
  /** The pill's number color, for a week separator that takes the pill's background. */
  ink?: string;
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
      color: Leaves.weekSeparatorColor(config),
      ink: Leaves.weekSeparatorInk(config),
    };
  }

  if (!ViewConfig.isZeroLength(config.day_separator_width)) {
    return { kind: 'day', width: config.day_separator_width, color: config.day_separator_color };
  }

  return null;
}

/**
 * Render one vertical rule, centered in the gutter to the inline-start of a column.
 *
 * The separator overlays the column's grid cell and is pulled into the gutter, so
 * enabling a rule paints the boundary without moving any columns.
 *
 * A day rule is confined to the day row, so it stops below the week-number band
 * rather than slicing through a week-number pill that belongs to the whole week.
 * Week and month rules span both rows, because separating the weeks is exactly
 * what they mean and the pill is part of what they separate. With week numbers
 * off the band row collapses to zero and all three kinds are the same length.
 *
 * With lanes, a day rule runs down the day headers' row and every lane's, below the band.
 *
 * @param separator - The resolved rule for this gutter
 * @param columnIndex - Zero-based index of the column this rule precedes
 * @param gap - The grid's column gap, i.e. the resolved `day_spacing`
 * @param lanes - Whether the grid draws a row per lane
 * @returns Rendered separator
 */
function renderColumnSeparator(
  separator: ColumnSeparator,
  columnIndex: number,
  gap: string,
  lanes = false,
): TemplateResult {
  return html`
    <div
      class="column-separator column-separator-${separator.kind}"
      style=${styleMap({
        gridColumn: String(columnIndex + 1),
        gridRow: separator.kind === 'day' ? (lanes ? '2 / -1' : '2') : '1 / -1',
        width: separator.width,
        backgroundColor: ColorMix.floorColor(separator.color),
        color: separator.ink,
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
 * @param eventsTappable - Whether the event is a tap target of its own
 * @param dayLabelId - The id of the day's header, which describes a tappable event; in a lane,
 *   the lane's name's id too
 * @param countdownRepeated - Whether the countdown repeats the one above it and is left out
 * @param laneLabel - In a lane, the label its header shows alone, and how, which the event
 *   leaves out where it would draw the same
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
  eventsTappable = false,
  dayLabelId?: string,
  countdownRepeated = false,
  laneLabel?: LaneRender.LaneOfEvent['label'],
): TemplateResult {
  const built = Presentation.buildEventPresentation(event, config, language, hass);
  const presented = Presentation.withoutLaneLabel(
    built,
    laneLabel,
    event._matchedConfig?.label_type,
  );
  const presentation = countdownRepeated ? Presentation.withoutCountdown(presented) : presented;
  const tap = Activation.eventTapTarget(event, presentation.entityAccentColor, eventsTappable);

  const isFirst = index === 0;
  const isLast = index === day.events.length - 1;

  const eventClasses = {
    event: true,
    'event-first': isFirst,
    'event-middle': !isFirst && !isLast,
    'event-last': isLast,
    'past-event': presentation.isPastEvent,
    'event-interactive': tap !== undefined,
    'event-now': presentation.isNow,
    'search-ring': event._searchRing === true,
    [TextScale.TEXT_SCALED_CLASS]: presentation.textScaled,
  };

  // Column view places two of these differently from list view: the countdown rides the
  // time row, and the progress bar takes a row of its own. Documented for users at
  // docs/features/column-view.md § Progress Bar & Countdown.
  return html`
    <div
      class=${classMap(eventClasses)}
      style="--calendar-card-event-accent-bar-color: ${presentation.entityAccentColor}; background-color: ${presentation.entityAccentBackgroundColor};${Helpers.styleDeclarations(
        { ...presentation.accentTextProperties, ...presentation.textScaleProperties },
      )}"
      role=${tap ? 'button' : nothing}
      tabindex=${tap ? '0' : nothing}
      aria-describedby=${tap && dayLabelId ? dayLabelId : nothing}
      .calendarCardEventTap=${tap}
      .calendarCardDaySlot=${event._isEmptyDay ? undefined : Activation.COVERED}
    >
      ${Leaves.renderAccentBar()}
      ${Leaves.renderEventContent(event, config, presentation.contentParts, {
        weatherForecasts,
        weatherPlacement: 'row',
        progressPlacement: 'row',
        countdownPlacement: 'text',
        hass,
        links: Presentation.rowLinksOn(config),
        timePosition: Helpers.resolveTimePosition(config.time_position),
      })}
    </div>
  `;
}

//-----------------------------------------------------------------------------
// LANES
//-----------------------------------------------------------------------------

/**
 * One day's events in a column drawing lanes, divided among the lanes: a cell per lane, each
 * holding that lane's events as the column draws them, in the lane's row of the day's column
 * (`.column-lanes`). A cell with nothing on keeps its row, and a press there adds an event in the
 * lane's calendar. What belongs to no lane, the day's "No events" notice, runs down every lane's
 * row over the empty cells.
 *
 * @param day - The day
 * @param heads - The lanes drawn, in order
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param weatherForecasts - Fetched forecasts, if any
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether each event is a tap target of its own
 * @param dayLabelId - The id of the day's header, which describes a tappable event
 * @returns The cells
 */
function renderColumnLaneCells(
  day: Types.EventsByDay,
  heads: ReadonlyArray<LaneRender.LaneHead>,
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  eventsTappable = false,
  dayLabelId?: string,
): TemplateResult {
  const { lanes, rest } = LaneRender.eventsByLane(day.events, heads);
  const eventsClass = ViewConfig.hasEventGap(config)
    ? 'column-events with-event-gap'
    : 'column-events';

  // Each lane's cell is placed outright, in its lane's row, so the notice laid down the lanes
  // over the empty cells cannot move one out of its place.
  const cell = (
    events: ReadonlyArray<Types.CalendarEventData>,
    lane?: { head: LaneRender.LaneHead; index: number },
  ) => {
    const laneDay: Types.EventsByDay = { ...day, events: [...events] };
    const repeated = Presentation.repeatedCountdowns(laneDay.events, config, language);
    const ofEvent = lane ? LaneRender.laneOfEvent(lane.head, lane.index) : undefined;
    const describedBy = [dayLabelId, ofEvent?.id].filter(Boolean).join(' ') || undefined;
    // A lane's cell holding events is a group named by its header, as a list's is.
    const grouped = ofEvent !== undefined && events.length > 0;
    return html`<div
      class=${lane ? 'lane-cell' : 'lane-cell lane-across'}
      data-lane=${lane?.head.key ?? nothing}
      role=${grouped ? 'group' : nothing}
      aria-labelledby=${grouped ? ofEvent.id : nothing}
      style=${styleMap({ gridArea: lane ? `${lane.index + 2} / 1` : undefined })}
      .calendarCardDaySlot=${lane ? Activation.daySlot(day.timestamp, lane.head.key) : undefined}
    >
      <div class=${eventsClass}>
        ${repeat(
          laneDay.events,
          (event, index) => `${event._entityId}-${event.summary}-${index}`,
          (event, index) =>
            renderColumnEvent(
              event,
              laneDay,
              index,
              config,
              language,
              weatherForecasts,
              hass,
              eventsTappable,
              describedBy,
              repeated.has(index),
              ofEvent?.label,
            ),
        )}
      </div>
    </div>`;
  };

  return html`${heads.map((head, index) => cell(lanes[index], { head, index }))}${
    rest.length > 0 ? cell(rest) : nothing
  }`;
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
 * @param columnIndex - Zero-based track this column occupies
 * @param weatherForecasts - Fetched forecasts, if any
 * @param hass - Home Assistant instance, for locale-aware formatting
 * @param eventsTappable - Whether each event is a tap target of its own
 * @param dayAdd - How to draw the header as the day's add button, or undefined for none
 * @param heads - The lanes drawn, a row each, or none for a single stack of events
 * @returns Rendered day column
 */
function renderDayColumn(
  day: Types.EventsByDay,
  config: Types.Config,
  language: string,
  columnIndex: number,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  eventsTappable = false,
  dayAdd?: Activation.DayAddButtons,
  heads: ReadonlyArray<LaneRender.LaneHead> = [],
): TemplateResult {
  const dayDate = new Date(day.timestamp);
  const { isToday, isTomorrow, isPast } = Leaves.classifyDay(day.timestamp);
  const isWeekendDay = FormatUtils.isWeekendDate(dayDate, hass);

  const weatherContent = Leaves.renderDateWeather(dayDate, config, weatherForecasts);
  const dayLabelId = eventsTappable || dayAdd ? Activation.dayLabelId(day.timestamp) : undefined;

  const separatorWidth = ViewConfig.resolveColumnOption(config, 'day_header_separator_width');
  const separatorColor = ViewConfig.resolveColumnOption(config, 'day_header_separator_color');
  const headerSeparator = ViewConfig.isZeroLength(separatorWidth)
    ? null
    : { width: separatorWidth, color: separatorColor };
  const repeatedCountdowns = Presentation.repeatedCountdowns(day.events, config, language);
  // With lanes the day's events box gives its place in the day's column to a cell per lane
  // (display: contents), each in that lane's row; without, it is the stack of events it always was.
  const lanes = heads.length > 0;
  const eventsClass = lanes
    ? 'column-events column-lanes'
    : ViewConfig.hasEventGap(config)
      ? 'column-events with-event-gap'
      : 'column-events';

  return html`
    <div
      class=${classMap({
        'day-column': true,
        today: isToday,
        tomorrow: isTomorrow,
        'future-day': !isToday,
        'past-day': isPast,
        weekend: isWeekendDay,
      })}
      style=${styleMap({
        gridColumn: String(columnIndex + 1),
        gridRow: lanes ? `2 / span ${heads.length + 1}` : '2',
      })}
      .calendarCardDaySlot=${Activation.daySlot(day.timestamp)}
    >
      ${Leaves.renderSharedDayHeader(
        dayDate,
        config,
        language,
        isToday,
        weatherContent,
        headerSeparator,
        hass,
        dayLabelId,
        dayAdd && { label: dayAdd.label, timestamp: day.timestamp },
      )}
      <div class=${eventsClass}>
        ${
          lanes
            ? renderColumnLaneCells(
                day,
                heads,
                config,
                language,
                weatherForecasts,
                hass,
                eventsTappable,
                dayLabelId,
              )
            : repeat(
                day.events,
                (event, index) => `${event._entityId}-${event.summary}-${index}`,
                (event, index) =>
                  renderColumnEvent(
                    event,
                    day,
                    index,
                    config,
                    language,
                    weatherForecasts,
                    hass,
                    eventsTappable,
                    dayLabelId,
                    repeatedCountdowns.has(index),
                  ),
              )
        }
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
 * The cell is a top-level grid item on the band row, not a child of its day column,
 * so the outer grid carries a real row boundary for day separators to stop at.
 *
 * @param weekNumber - Week number for this day, or null when unavailable
 * @param visible - Whether this column is the one that shows the number
 * @param columnIndex - Zero-based track this cell occupies
 * @returns Rendered week-number cell
 */
function renderColumnWeekNumber(
  weekNumber: number | null | undefined,
  visible: boolean,
  columnIndex: number,
): TemplateResult {
  return Leaves.renderDayWeekNumber(weekNumber, visible, columnIndex + 1);
}

/**
 * Build the week-number row for every column, or `nothing` for all of them.
 *
 * @param days - Days to render, already grouped and sorted
 * @param boundaries - Day boundaries already computed for this render pass
 * @param config - Card configuration, already resolved for the column view
 * @param offset - Tracks before the first day's, the lane track's where the grid draws lanes
 * @returns One cell per day, or one `nothing` per day when no row is warranted
 */
function buildWeekRows(
  days: Types.EventsByDay[],
  boundaries: DayBoundary[],
  config: Types.Config,
  offset = 0,
): Array<TemplateResult | typeof nothing> {
  const visible = boundaries.map(
    (boundary, index) => boundary.isNewWeek && !(index === 0 && !config.show_current_week_number),
  );

  if (config.show_week_numbers === null || !visible.some(Boolean)) {
    return days.map(() => nothing);
  }

  return days.map((day, index) =>
    renderColumnWeekNumber(day.weekNumber, visible[index], index + offset),
  );
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
 * @param eventsTappable - Whether each event is a tap target of its own
 * @param dayAdd - How to draw each day's header as its add button, or undefined while a tap
 *   on a day adds nothing
 * @param heads - The lanes drawn (`lanes`): a track at the start naming each, and a row per lane
 *   across the days; none for the plain columns
 * @returns Rendered column grid
 */
export function renderColumnGroupedEvents(
  days: Types.EventsByDay[],
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  eventsTappable = false,
  dayAdd?: Activation.DayAddButtons,
  heads: ReadonlyArray<LaneRender.LaneHead> = [],
): TemplateResult {
  const headerGap = ViewConfig.resolveColumnOption(config, 'day_header_gap');
  const gutter = ViewConfig.sanitizeGutter(config.day_spacing);
  const boundaries = computeDayBoundaries(days);
  const lanes = heads.length > 0;
  // The lane track comes first, so every day moves one track along.
  const offset = lanes ? 1 : 0;
  const weekRows = buildWeekRows(days, boundaries, config, offset);

  const separators = boundaries
    .map((boundary, index) => ({ separator: resolveSeparator(boundary, config), index }))
    .filter(({ separator, index }) => separator !== null && index > 0)
    .map(({ separator, index }) =>
      renderColumnSeparator(separator as ColumnSeparator, index + offset, gutter, lanes),
    );

  return html`
    <div
      class=${lanes ? 'column-grid with-lanes' : 'column-grid'}
      style=${styleMap({
        gridTemplateColumns: lanes
          ? `${Constants.UI.LANE_TRACK}px repeat(${days.length}, minmax(0, 1fr))`
          : `repeat(${days.length}, minmax(0, 1fr))`,
        gridTemplateRows: lanes ? `auto auto repeat(${heads.length}, auto)` : undefined,
        columnGap: gutter,
        '--calendar-card-column-header-gap': headerGap,
      })}
      .calendarCardDaySlot=${Activation.COLUMNS_AMONG_CHILDREN}
    >
      ${weekRows}
      ${days.map((day, index) =>
        renderDayColumn(
          day,
          config,
          language,
          index + offset,
          weatherForecasts,
          hass,
          eventsTappable,
          dayAdd,
          heads,
        ),
      )}
      ${separators}${heads.map((head, index) => LaneRender.renderLaneHeader(head, index, 3 + index))}
    </div>
  `;
}

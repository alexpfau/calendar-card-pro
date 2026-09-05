/**
 * Grid view rendering for Calendar Card Pro.
 *
 * The list and column views share leaves and event presentation, and so does this one.
 * This file owns only the grid-view axis: an hour scale, day columns placed against it,
 * a band of all-day banners between the headers and the body, and the now line.
 *
 * The geometry itself lives in `utils/grid.ts` and is pure. Nothing here computes a
 * position; it asks for one and turns it into a style. That split is what lets the hard
 * part — DST, overlap packing, banner spans — be tested without a DOM.
 *
 * @see renderGroupedEvents in `render.ts` for the list-view counterpart
 * @see renderColumnGroupedEvents in `column.ts` for the day-column counterpart
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Leaves from './leaves';
import * as Presentation from './presentation';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import * as FormatUtils from '../utils/format';
import * as Grid from '../utils/grid';

//-----------------------------------------------------------------------------
// EVENT SORTING
//-----------------------------------------------------------------------------

/**
 * One day's events, separated into the two things the grid draws differently.
 */
interface DayParts {
  /** All-day events, which belong in the band above the axis. */
  allDay: Types.CalendarEventData[];

  /** Timed segments confined to this day, with their minute extents resolved. */
  timed: Array<Types.CalendarEventData & Grid.LaneInput>;
}

/**
 * Where each day sits relative to the one before it.
 */
interface DayBoundary {
  isNewWeek: boolean;

  isNewMonth: boolean;
}

type SeparatorKind = 'day' | 'week' | 'month';

interface GridSeparator {
  kind: SeparatorKind;
  width: string;
  color: string;
}

/**
 * Split a day's events into the band and the body.
 *
 * A placeholder for an empty day is dropped outright: the grid already shows an empty
 * day as an empty column of axis, which says the same thing without occupying a row.
 *
 * @param day - Grouped day whose events to sort
 * @returns The day's events, separated
 */
function sortDayEvents(day: Types.EventsByDay): DayParts {
  const allDay: Types.CalendarEventData[] = [];
  const timed: Array<Types.CalendarEventData & Grid.LaneInput> = [];

  for (const event of day.events) {
    if (event._isEmptyDay) {
      continue;
    }

    if (!event.start.dateTime) {
      allDay.push(event);
      continue;
    }

    const extent = Grid.segmentMinutes(event);

    if (extent) {
      timed.push({ ...event, ...extent });
    }
  }

  return { allDay, timed };
}

/**
 * Expand timed events across the day columns the grid is about to draw.
 *
 * The shared event processor deliberately leaves grid events unsplit: its list-view
 * splitter turns a timed event's middle days into all-day-looking data. Splitting here
 * keeps every segment timed and makes the DOM path depend on `splitTimedEventByDay`, so
 * a missing caller leaves visible columns empty and fails the grid DOM tests.
 *
 * @param days - Days to render
 * @returns Days with timed multi-day events copied into every touched column
 */
function splitTimedEventsAcrossGridDays(days: Types.EventsByDay[]): Types.EventsByDay[] {
  if (days.length === 0) {
    return days;
  }

  const visibleDayStarts = days.map((day) => Grid.startOfDay(new Date(day.timestamp)));
  const dayIndexByTime = new Map(visibleDayStarts.map((day, index) => [day.getTime(), index]));
  const windowStart = visibleDayStarts[0];
  const windowEnd = Grid.addDays(visibleDayStarts[visibleDayStarts.length - 1], 1);
  const expanded = days.map((day) => ({ ...day, events: [] as Types.CalendarEventData[] }));

  for (const day of days) {
    for (const event of day.events) {
      if (event._isEmptyDay) {
        continue;
      }

      if (!event.start.dateTime) {
        const index = dayIndexByTime.get(Grid.startOfDay(new Date(day.timestamp)).getTime());
        if (index !== undefined) {
          expanded[index].events.push(event);
        }
        continue;
      }

      for (const segment of Grid.splitTimedEventByDay(event, windowStart, windowEnd)) {
        if (!segment.start.dateTime) {
          continue;
        }

        const segmentDay = Grid.startOfDay(new Date(segment.start.dateTime));
        const index = dayIndexByTime.get(segmentDay.getTime());

        if (index !== undefined) {
          expanded[index].events.push(segment);
        }
      }
    }
  }

  return expanded;
}

/**
 * Classify every day by the boundary it opens.
 *
 * This mirrors column view rather than importing a shared renderer helper: the
 * boundary test is the same, but the row a rule spans is view-specific and needs to
 * live beside each view's grid-template reasoning.
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

/**
 * Decide which vertical rule belongs in the gutter to the inline-start of a day.
 *
 * Precedence is month, then week, then day, matching list and column view. Each
 * family is gated on its own width, so a disabled month or week rule falls through to
 * the next visible boundary rather than leaving a blank gap.
 *
 * @param boundary - What this day opens relative to the previous one
 * @param config - Card configuration, already resolved for the grid view
 * @returns The rule to draw, or null when the gutter carries none
 */
function resolveSeparator(boundary: DayBoundary, config: Types.Config): GridSeparator | null {
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
 * Render one vertical separator, centered in the gutter before a day column.
 *
 * The rule overlays the outer grid and is pulled into the gap with a negative margin,
 * so enabling it paints the boundary without changing day-column widths.
 *
 * Grid has four rows: week numbers, day headers, all-day banners and the time body. All
 * separator families are confined to the time body. A day rule crossing a spanning
 * all-day banner makes one event read as chopped into days, and a week/month rule would
 * do the same at a larger boundary; headers and week numbers are labels, not ruled
 * paper. The boundary is still visible where it matters: against the hour axis.
 *
 * @param separator - The resolved rule for this gutter
 * @param columnIndex - Zero-based day column the rule precedes
 * @param gap - The grid's column gap, i.e. the resolved `day_spacing`
 * @returns Rendered separator
 */
function renderGridSeparator(
  separator: GridSeparator,
  columnIndex: number,
  gap: string,
): TemplateResult {
  return html`
    <div
      class="grid-separator grid-separator-${separator.kind}"
      style=${styleMap({
        gridColumn: String(columnIndex + 2),
        gridRow: '4',
        width: separator.width,
        backgroundColor: separator.color,
        marginInlineStart: `calc(-0.5 * (${gap} + ${separator.width}))`,
      })}
    ></div>
  `;
}

//-----------------------------------------------------------------------------
// TIME AXIS
//-----------------------------------------------------------------------------

/**
 * Render the hour labels down the left gutter.
 *
 * Each label is positioned by the same percentage arithmetic as the events, so the two
 * cannot drift apart — the misalignment that appears the moment a label is laid out by
 * one rule and a block by another.
 *
 * Labels are nudged up by half their own line height so the text centres on its rule
 * rather than hanging below it.
 *
 * @param band - The visible band
 * @param config - Card configuration
 * @param hass - Home Assistant instance, for locale-aware hour formatting
 * @returns Rendered axis labels
 */
function renderAxis(
  band: Grid.GridBand,
  config: Types.Config,
  hass?: Types.Hass | null,
): TemplateResult {
  const hours = Grid.axisHours(band);
  const bandLength = band.endMin - band.startMin;
  const use24h = FormatUtils.resolveTimeFormat24h(config, hass);
  const labels = hours.map((hour) => formatHour(hour, use24h));

  return html`
    <div class="grid-axis" style=${styleMap({ gridColumn: '1', gridRow: '4' })}>
      <div class="grid-axis-sizer" aria-hidden="true">
        ${labels.map((label) => html`<span>${label}</span>`)}
      </div>
      ${hours.map((hour, index) => {
        const topPct = ((hour * 60 - band.startMin) / bandLength) * 100;

        return html`<div class="grid-axis-label" style=${styleMap({ top: `${topPct}%` })}>
          ${labels[index]}
        </div>`;
      })}
    </div>
  `;
}

/**
 * Format one axis hour.
 *
 * Hour-only, deliberately: `FormatUtils.formatTime` always emits minutes, and `06:00`
 * down the whole gutter spends width on three characters that never change.
 *
 * @param hour - Hour of the day, 0-23
 * @param use24h - Whether to use 24-hour time
 * @returns The label
 */
function formatHour(hour: number, use24h: boolean): string {
  if (use24h) {
    return String(hour);
  }

  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;

  return `${twelve} ${suffix}`;
}

/**
 * Render the horizontal rules across the body.
 *
 * Drawn as a repeating gradient rather than as one element per slot, so a day at a
 * 15-minute resolution costs one painted layer instead of sixty elements per column.
 *
 * @param band - The visible band
 * @param slotMinutes - Configured rule spacing
 * @param columnCount - Day columns to span
 * @returns The ruled backdrop
 */
function renderRules(
  band: Grid.GridBand,
  slotMinutes: number,
  columnCount: number,
): TemplateResult {
  const bandLength = band.endMin - band.startMin;
  const slotPct = (slotMinutes / bandLength) * 100;
  const hourPct = (60 / bandLength) * 100;

  return html`
    <div
      class="grid-rules"
      aria-hidden="true"
      style=${styleMap({
        gridColumn: `2 / span ${columnCount}`,
        gridRow: '4',
        '--calendar-card-grid-slot-pct': `${slotPct}%`,
        '--calendar-card-grid-hour-pct': `${hourPct}%`,
      })}
    ></div>
  `;
}

//-----------------------------------------------------------------------------
// EVENT BLOCKS
//-----------------------------------------------------------------------------

/**
 * Render one timed event as a block positioned by its clock time.
 *
 * Lane geometry is expressed with `calc()` against a percentage width so a block keeps
 * a real gutter beside its neighbour at any column width. Vertical geometry is pure
 * percentage: nothing here knows the band's pixel height, which is what lets a fixed
 * card height compress the whole grid with no arithmetic.
 *
 * @param event - Event to render, carrying its lane assignment
 * @param placement - Where it sits in the band
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param weatherForecasts - Weather forecasts for event badges
 * @param hass - Home Assistant instance
 * @returns Rendered block
 */
function renderTimedEvent(
  event: Grid.LanePlacement<Types.CalendarEventData & Grid.LaneInput>,
  placement: Grid.EventPlacement,
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const presentation = Presentation.buildEventPresentation(event, config, language, hass);
  const contentParts = gridTimedEventContentParts(event, presentation.contentParts, config, hass);
  const laneWidth = 100 / event.laneCount;

  return html`
    <div
      class=${classMap({
        event: true,
        'grid-event': true,
        'past-event': presentation.isPastEvent,
        'clipped-top': placement.clippedTop,
        'clipped-bottom': placement.clippedBottom,
      })}
      style=${styleMap({
        top: `${placement.topPct}%`,
        height: `${placement.heightPct}%`,
        insetInlineStart: `calc(${event.laneIndex * laneWidth}% + var(--calendar-card-grid-event-gap))`,
        width: `calc(${laneWidth}% - var(--calendar-card-grid-event-gap) * 2)`,
        borderInlineStartColor: presentation.entityAccentColor,
        backgroundColor: presentation.entityAccentBackgroundColor,
      })}
    >
      <div class="grid-event-disclosure">
        ${Leaves.renderEventContent(event, config, contentParts, {
          weatherForecasts,
          weatherPlacement: 'row',
          progressPlacement: 'inline',
          countdownPlacement: 'text',
          hass,
        })}
      </div>
    </div>
  `;
}

/**
 * Adapt shared event content to the grid's per-day timed block convention.
 *
 * List and column views need cross-day time phrases because their rows do not themselves
 * show where the event starts and ends. A grid block's position and height already do, so a
 * timed segment either keeps only its true start time for that day or shows title only.
 *
 * @param event - Timed grid event segment
 * @param parts - Shared presentation content
 * @param config - Card configuration
 * @param hass - Home Assistant instance
 * @returns Content parts with grid-specific time text
 */
function gridTimedEventContentParts(
  event: Types.CalendarEventData,
  parts: Leaves.EventContentParts,
  config: Types.Config,
  hass?: Types.Hass | null,
): Leaves.EventContentParts {
  if (!event._isMultiDaySegment) {
    return parts;
  }

  if (!event._gridSegmentStartsEvent || !event.start.dateTime) {
    return { ...parts, eventTime: '', shouldShowTime: false, countdownStr: null };
  }

  const startDate = new Date(event.start.dateTime);
  if (Number.isNaN(startDate.getTime())) {
    return { ...parts, eventTime: '', shouldShowTime: false, countdownStr: null };
  }

  const use24h = FormatUtils.resolveTimeFormat24h(config, hass);

  return {
    ...parts,
    eventTime: FormatUtils.formatTime(startDate, use24h, config.time_two_digit_hours),
  };
}

/**
 * Render the block standing in for events a column had no room to draw.
 *
 * It reports how many it hides rather than hiding them silently — a cap that quietly
 * drops events is worse than no cap, because the card then lies about the day.
 *
 * @param overflow - The overflow block to draw
 * @param placement - Where it sits in the band
 * @returns Rendered overflow block
 */
function renderOverflow(
  overflow: Grid.LaneOverflow<Types.CalendarEventData & Grid.LaneInput>,
  placement: Grid.EventPlacement,
): TemplateResult {
  const laneWidth = 100 / overflow.laneCount;

  // A bare numeral, deliberately. No card translation carries a "+N more" phrase, and
  // adding one would mean a new key in all 35 language files for a label that reads the
  // same in every one of them. The hidden summaries are on the title attribute.
  const label = `+${overflow.hidden.length}`;

  return html`
    <div
      class="event grid-event grid-event-overflow"
      title=${overflow.hidden.map((event) => event.summary ?? '').join('\n')}
      style=${styleMap({
        top: `${placement.topPct}%`,
        height: `${placement.heightPct}%`,
        insetInlineStart: `calc(${overflow.laneIndex * laneWidth}% + var(--calendar-card-grid-event-gap))`,
        width: `calc(${laneWidth}% - var(--calendar-card-grid-event-gap) * 2)`,
      })}
    >
      <div class="grid-event-overflow-label">${label}</div>
    </div>
  `;
}

//-----------------------------------------------------------------------------
// ALL-DAY BAND
//-----------------------------------------------------------------------------

/**
 * Render one all-day event as a banner spanning the columns it covers.
 *
 * One banner rather than one chip per day, because a multi-day event is one thing and
 * a run of separate chips never reads as one. The continuation marks say the event
 * carries on outside the window, which a clamped banner otherwise misreports as ending
 * exactly at the card's edge.
 *
 * @param event - All-day event to render
 * @param placement - Columns it spans
 * @param row - Band row it occupies, 1-based
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param hass - Home Assistant instance
 * @returns Rendered banner
 */
function renderBanner(
  event: Types.CalendarEventData,
  placement: Grid.BannerPlacement,
  row: number,
  config: Types.Config,
  language: string,
  hass?: Types.Hass | null,
): TemplateResult {
  const presentation = Presentation.buildEventPresentation(event, config, language, hass);

  return html`
    <div
      class=${classMap({
        event: true,
        'grid-banner': true,
        'past-event': presentation.isPastEvent,
        'continues-before': placement.continuesBefore,
        'continues-after': placement.continuesAfter,
      })}
      style=${styleMap({
        gridColumn: `${placement.columnIndex + 2} / span ${placement.span}`,
        gridRow: String(row),
        borderInlineStartColor: presentation.entityAccentColor,
        backgroundColor: presentation.entityAccentBackgroundColor,
      })}
    >
      <span class="grid-banner-title">${event.summary ?? ''}</span>
    </div>
  `;
}

/**
 * Lay every all-day banner out into rows, packing non-overlapping ones together.
 *
 * Greedy first-fit on columns, which is the same shape as the timed lane packing one
 * axis over. Banners beyond `allday_band_max_rows` are dropped, so the band cannot grow
 * without bound on a week containing a long holiday.
 *
 * Nothing marks the ones that did not fit, which is the opposite of the timed path's
 * `+N` block, and the asymmetry is forced rather than chosen: a timed overflow marker
 * has a lane to sit in, whereas a banner that does not fit has no row to announce
 * itself from without occupying the very row the cap just refused. This counted the
 * drops for a while and threw the number away — `docs/features/grid-view.md` says
 * plainly that they are dropped, so the card was not claiming otherwise, and a total
 * nothing reads is not a lesser bug than one that lies.
 *
 * @param days - Days on screen, in order
 * @param maxRows - Rows the band may use
 * @returns Placed banners, in row order
 */
function layoutBanners(
  days: Types.EventsByDay[],
  maxRows: number,
): Array<{ event: Types.CalendarEventData; placement: Grid.BannerPlacement; row: number }> {
  const seen = new Set<string>();
  const banners: Array<{ event: Types.CalendarEventData; placement: Grid.BannerPlacement }> = [];
  const visibleDayStarts = days.map((day) => Grid.startOfDay(new Date(day.timestamp)));

  for (const day of days) {
    for (const event of sortDayEvents(day).allDay) {
      // A multi-day all-day event appears in every day it covers, but its banner spans
      // them all, so it must be drawn once. Keyed on what identifies the event rather
      // than on object identity, which grouping does not preserve.
      const key = `${event._entityId ?? ''}|${event.summary ?? ''}|${event.start.date ?? ''}|${event.end.date ?? ''}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const placement = Grid.computeBannerPlacement(event, visibleDayStarts);

      if (placement) {
        banners.push({ event, placement });
      }
    }
  }

  // Longest first, so a week-long banner takes the top row and the short ones tuck in
  // beneath it rather than the other way round.
  banners.sort(
    (a, b) =>
      b.placement.span - a.placement.span || a.placement.columnIndex - b.placement.columnIndex,
  );

  const rowSpans: Array<Array<[number, number]>> = [];
  const placed: Array<{
    event: Types.CalendarEventData;
    placement: Grid.BannerPlacement;
    row: number;
  }> = [];

  for (const banner of banners) {
    const start = banner.placement.columnIndex;
    const end = start + banner.placement.span;

    let row = rowSpans.findIndex((occupied) =>
      occupied.every(([from, to]) => end <= from || start >= to),
    );

    if (row < 0) {
      if (rowSpans.length >= maxRows) {
        continue;
      }

      row = rowSpans.length;
      rowSpans.push([]);
    }

    rowSpans[row].push([start, end]);
    placed.push({ ...banner, row: row + 1 });
  }

  return placed;
}

//-----------------------------------------------------------------------------
// GRID CONTAINER
//-----------------------------------------------------------------------------

/**
 * Render grouped events as day columns against an hour axis.
 *
 * The whole card is one grid sharing a single column template — an axis gutter, then
 * one track per day. Every row is placed against that same template, which is what
 * keeps the day headers, the all-day band and the body aligned. Laying the rows out
 * independently is the classic way for an axis to end up a few pixels out from the
 * columns it is supposed to be measuring.
 *
 * Rows, top to bottom: week numbers, day headers, the all-day band, the time body.
 *
 * @param days - Days to render, already grouped and sorted
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param weatherForecasts - Fetched forecasts, if any
 * @param hass - Home Assistant instance, for locale-aware formatting
 * @param now - The instant to draw the now line at, injected so a whole render is
 *   evaluated against one clock reading
 * @returns Rendered grid
 */
export function renderGridGroupedEvents(
  days: Types.EventsByDay[],
  config: Types.Config,
  language: string,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
  now: Date = new Date(),
): TemplateResult {
  if (days.length === 0) {
    return html`<div class="grid-container"></div>`;
  }

  const gridDays = splitTimedEventsAcrossGridDays(days);

  const band = Grid.resolveBand(
    ViewConfig.resolveTimeGridOption(config, 'start_time'),
    ViewConfig.resolveTimeGridOption(config, 'end_time'),
  );
  const slotMinutes = ViewConfig.resolveTimeGridOption(config, 'slot_minutes');
  const hourHeight = ViewConfig.resolveTimeGridOption(config, 'hour_height');
  const axisWidth = ViewConfig.resolveTimeGridOption(config, 'axis_width');
  const maxLanes = ViewConfig.resolveTimeGridOption(config, 'max_simultaneous_events');
  const showNowLine = ViewConfig.resolveTimeGridOption(config, 'show_now_line');
  const nowLineColor = ViewConfig.resolveTimeGridOption(config, 'now_line_color');
  const showAxisLabels = ViewConfig.resolveTimeGridOption(config, 'show_axis_labels');
  const maxRows = ViewConfig.resolveTimeGridOption(config, 'allday_band_max_rows');
  const headerGap = ViewConfig.resolveTimeGridOption(config, 'day_header_gap');

  const bandHours = (band.endMin - band.startMin) / 60;
  const gutter = ViewConfig.sanitizeGutter(config.day_spacing);
  const boundaries = computeDayBoundaries(gridDays);

  const banners = layoutBanners(gridDays, maxRows);
  const bandRows = banners.reduce((max, banner) => Math.max(max, banner.row), 0);
  const separators = boundaries
    .map((boundary, index) => ({ separator: resolveSeparator(boundary, config), index }))
    .filter(({ separator, index }) => separator !== null && index > 0)
    .map(({ separator, index }) => renderGridSeparator(separator as GridSeparator, index, gutter));

  return html`
    <div
      class="grid-container"
      style=${styleMap({
        gridTemplateColumns: `${axisWidth} repeat(${gridDays.length}, minmax(0, 1fr))`,
        columnGap: gutter,
        // The band's height is the one place a configured length becomes the scale. It is
        // handed to CSS as a calc() rather than multiplied here, so `4em` and
        // `calc(3vh + 2px)` survive intact.
        '--calendar-card-grid-body-height': `calc(${hourHeight} * ${bandHours})`,
        '--calendar-card-grid-now-color': nowLineColor,
        '--calendar-card-column-header-gap': headerGap,
      })}
    >
      ${renderWeekNumbers(gridDays, config)}
      ${gridDays.map((day, index) =>
        renderDayHeader(day, config, language, index, weatherForecasts),
      )}
      ${bandRows > 0
        ? html`
            <div
              class="grid-allday-band"
              style=${styleMap({
                gridColumn: `1 / span ${gridDays.length + 1}`,
                gridRow: '3',
                gridTemplateColumns: `${axisWidth} repeat(${gridDays.length}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${bandRows}, auto)`,
                columnGap: gutter,
              })}
            >
              ${banners.map((banner) =>
                renderBanner(banner.event, banner.placement, banner.row, config, language, hass),
              )}
            </div>
          `
        : nothing}
      ${showAxisLabels ? renderAxis(band, config, hass) : nothing}
      ${renderRules(band, slotMinutes, gridDays.length)}
      ${gridDays.map((day, index) =>
        renderDayBody(
          day,
          band,
          config,
          language,
          index,
          maxLanes,
          showNowLine,
          now,
          weatherForecasts,
          hass,
        ),
      )}
      ${separators}
    </div>
  `;
}

/**
 * Build one week-number cell per day column, following column view.
 *
 * Grid's first column is the hour axis, so day week-number cells are offset by one
 * track. They sit above their own dates, not in the gutter, so a window crossing a week
 * boundary can label the upcoming week too.
 *
 * @param days - Days on screen
 * @param config - Card configuration
 * @returns One cell per day, or one `nothing` per day when no row is warranted
 */
function renderWeekNumbers(
  days: Types.EventsByDay[],
  config: Types.Config,
): Array<TemplateResult | typeof nothing> {
  const visible = days.map((day, index) => {
    const prevDay = index > 0 ? days[index - 1] : undefined;
    const isNewWeek = !prevDay || day.weekNumber !== prevDay.weekNumber;

    return isNewWeek && !(index === 0 && !config.show_current_week_number);
  });

  if (config.show_week_numbers === null || !visible.some(Boolean)) {
    return days.map(() => nothing);
  }

  return days.map((day, index) =>
    Leaves.renderDayWeekNumber(day.weekNumber, visible[index], index + 2),
  );
}

/**
 * Render one day's header cell.
 *
 * Uses the same date leaf as column view, so the two layouts label a day identically
 * and a change to date formatting reaches both.
 *
 * @param day - Day to label
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param columnIndex - Zero-based day track
 * @param weatherForecasts - Fetched forecasts, if any
 * @returns Rendered header
 */
function renderDayHeader(
  day: Types.EventsByDay,
  config: Types.Config,
  language: string,
  columnIndex: number,
  weatherForecasts?: Types.WeatherForecasts,
): TemplateResult {
  const dayDate = new Date(day.timestamp);
  const { isToday, isTomorrow } = Leaves.classifyDay(day.timestamp);
  const weatherContent = Leaves.renderDateWeather(dayDate, config, weatherForecasts);
  const separatorWidth = ViewConfig.resolveTimeGridOption(config, 'day_header_separator_width');
  const separatorColor = ViewConfig.resolveTimeGridOption(config, 'day_header_separator_color');
  const headerSeparator = ViewConfig.isZeroLength(separatorWidth)
    ? null
    : { width: separatorWidth, color: separatorColor };

  return html`
    <div
      class=${classMap({
        'grid-day-header': true,
        today: isToday,
        tomorrow: isTomorrow,
        'future-day': !isToday,
        weekend: FormatUtils.isWeekendDate(dayDate),
      })}
      style=${styleMap({ gridColumn: String(columnIndex + 2), gridRow: '2' })}
    >
      ${Leaves.renderSharedDayHeader(
        dayDate,
        config,
        language,
        isToday,
        weatherContent,
        headerSeparator,
      )}
    </div>
  `;
}

/**
 * Render one day's column of the time body.
 *
 * @param day - Day whose events to place
 * @param band - The visible band
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param columnIndex - Zero-based day track
 * @param maxLanes - Overlap cap
 * @param showNowLine - Whether the now line is enabled
 * @param now - Instant to draw the now line at
 * @param weatherForecasts - Weather forecasts for event badges
 * @param hass - Home Assistant instance
 * @returns Rendered column
 */
function renderDayBody(
  day: Types.EventsByDay,
  band: Grid.GridBand,
  config: Types.Config,
  language: string,
  columnIndex: number,
  maxLanes: number,
  showNowLine: boolean,
  now: Date,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
): TemplateResult {
  const dayDate = new Date(day.timestamp);
  const { isToday } = Leaves.classifyDay(day.timestamp);
  const { timed } = sortDayEvents(day);
  const { placed, overflows } = Grid.layoutLanes(timed, maxLanes);

  // Only today's column carries the line, and only when the current time is inside the
  // band. A line drawn across every column would say nothing; one clamped to an edge
  // would say something false.
  const nowPct = showNowLine && isToday ? Grid.computeNowLinePct(now, band) : null;

  return html`
    <div
      class=${classMap({
        'grid-day-body': true,
        today: isToday,
        weekend: FormatUtils.isWeekendDate(dayDate),
      })}
      style=${styleMap({ gridColumn: String(columnIndex + 2), gridRow: '4' })}
    >
      ${repeat(
        placed,
        (event, index) => `${event._entityId}-${event.summary}-${index}`,
        (event) => {
          const placement = Grid.computeEventPlacement(event.startMin, event.endMin, band);

          return placement
            ? renderTimedEvent(event, placement, config, language, weatherForecasts, hass)
            : nothing;
        },
      )}
      ${overflows.map((overflow) => {
        const placement = Grid.computeEventPlacement(overflow.startMin, overflow.endMin, band);

        return placement ? renderOverflow(overflow, placement) : nothing;
      })}
      ${nowPct === null
        ? nothing
        : html`<div
            class="grid-now-line"
            aria-hidden="true"
            style=${styleMap({ top: `${nowPct}%` })}
          ></div>`}
    </div>
  `;
}

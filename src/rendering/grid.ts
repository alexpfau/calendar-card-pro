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
import * as Localize from '../translations/localize';
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

/**
 * Render the weekend tint, one element per weekend day.
 *
 * A stripe of its own rather than a background on `.grid-day-body`, because the tint has
 * to run further than the body does: from immediately under the date row, through the
 * all-day band, and down the time grid, so a weekend reads as one continuous column
 * rather than as a tinted rectangle with the band floating above it. Spanning rows 3 and
 * 4 is what buys that, and it costs nothing when the band is empty — row 3 is an `auto`
 * track and an empty stripe gives it no height to take.
 *
 * The date row is deliberately outside the span. It is a label, not part of the day's
 * field, and macOS Calendar leaves it clear too.
 *
 * Painted behind everything by being a plain grid item: banners, blocks and rules are
 * either positioned or carry a `z-index`, so they all paint later whatever the DOM order.
 *
 * @param days - Days on screen, in order
 * @param hass - Home Assistant instance, whose locale decides which days are the weekend
 * @returns One stripe per weekend day, and `nothing` for every other day
 */
function renderWeekendStripes(
  days: Types.EventsByDay[],
  hass?: Types.Hass | null,
): Array<TemplateResult | typeof nothing> {
  return days.map((day, index) =>
    FormatUtils.isWeekendDate(new Date(day.timestamp), hass?.locale)
      ? html`
          <div
            class="grid-weekend"
            aria-hidden="true"
            style=${styleMap({ gridColumn: String(index + 2), gridRow: '3 / span 2' })}
          ></div>
        `
      : nothing,
  );
}

/**
 * Whether a resolved color value would paint anything at all.
 *
 * `transparent` and `none` are what a user writes to switch an optional fill off, and an
 * empty string is what an editor text field hands back when it is cleared. None of them
 * needs a custom property emitted for it, and leaving the property unset lets the
 * stylesheet's own fallback stand rather than overriding it with a no-op.
 *
 * @param value - A resolved CSS color
 * @returns `true` when the value is worth writing to the DOM
 */
function paintsSomething(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return normalized !== '' && normalized !== 'transparent' && normalized !== 'none';
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
 * Labels are centred on their rule where their line box fits, then clamped inside the
 * axis so a short fixed-height grid cannot create scrollable overflow.
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

        return html`<div
          class="grid-axis-label"
          style=${styleMap({
            '--calendar-card-grid-axis-label-top': `${topPct}%`,
          })}
        >
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
  const slotOffsetPct =
    (((slotMinutes - (band.startMin % slotMinutes)) % slotMinutes) / bandLength) * 100;
  const hourOffsetPct = (((60 - (band.startMin % 60)) % 60) / bandLength) * 100;

  return html`
    <div
      class="grid-rules"
      aria-hidden="true"
      style=${styleMap({
        gridColumn: `2 / span ${columnCount}`,
        gridRow: '4',
        '--calendar-card-grid-slot-pct': `${slotPct}%`,
        '--calendar-card-grid-hour-pct': `${hourPct}%`,
        '--calendar-card-grid-slot-offset': `${slotOffsetPct}%`,
        '--calendar-card-grid-hour-offset': `${hourOffsetPct}%`,
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
 * content height compress the whole grid with no arithmetic.
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
          progressPlacement: 'row',
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
  const banners: Array<{ event: Types.CalendarEventData; placement: Grid.BannerPlacement }> = [];
  const visibleDayStarts = days.map((day) => Grid.startOfDay(new Date(day.timestamp)));

  for (const day of days) {
    for (const event of sortDayEvents(day).allDay) {
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
  const weekendTint = ViewConfig.resolveTimeGridOption(config, 'weekend_background_color');

  const bandHours = (band.endMin - band.startMin) / 60;
  const gutter = ViewConfig.sanitizeGutter(config.day_spacing);
  const boundaries = computeDayBoundaries(gridDays);

  const banners = layoutBanners(gridDays, maxRows);
  // The all-day band below takes `grid-template-columns: subgrid` rather than repeating the
  // parent's own template. The two have to agree on where every day column starts, and
  // neither can be the authority: repeating `${axisWidth} repeat(N, 1fr)` inside the band
  // looked equivalent and was not, because the band's leading gutter cell holds nothing.
  // Its `max-content` track collapsed to zero while the body's stayed as wide as the hour
  // labels, so every banner drew shifted left of its own column by that difference and each
  // day span came out proportionally too wide. Subgrid removes the second opinion instead of
  // correcting it — there is no template here left to drift.
  //
  // This is the card's only use of subgrid, so it is worth naming the floor it sets: Chrome
  // 117, Safari 16, Firefox 71. Grid view already required container queries (Chrome 105,
  // Safari 16, Firefox 110) for the event disclosure ladder, so the binding constraint was
  // already this generation, and the view is opt-in. But the failure is not graceful: an
  // engine that does not know `subgrid` drops the declaration, leaving a grid with no column
  // template at all, and each banner's `grid-column` then invents an implicit track. Keep
  // one source for the columns in anything that replaces it.
  const bandRows = banners.reduce((max, banner) => Math.max(max, banner.row), 0);
  const separators = boundaries
    .map((boundary, index) => ({ separator: resolveSeparator(boundary, config), index }))
    .filter(({ separator, index }) => separator !== null && index > 0)
    .map(({ separator, index }) => renderGridSeparator(separator as GridSeparator, index, gutter));

  // A configured `height` turns the axis from a fixed scale into a share of the content
  // area, as both `docs/features/grid-view.md` and the `.grid-container` stylesheet
  // comment promise.
  // Reserve at least half the content height for time, letting the all-day band scroll
  // in the remaining space rather than starving the body. That remainder is what the day
  // headers leave behind, and they do not compress -- so the band's share is roughly
  // `0.5 * height - <header height>`, measured at 40px on a 180px card.
  //
  // Two things follow, both measured in a browser rather than derived, because happy-dom
  // computes no layout. Shrinking the card drives that share to zero at about twice the
  // header height, but the band does not vanish there: it floors at its own 4px padding
  // and keeps `overflow-y: auto` with its full scrollHeight (127px for six banners), so
  // its events are still scrollable and still a labelled tab stop -- unreachable by mouse
  // at that size, never dropped. Past the same threshold the non-compressing header plus
  // the body's 50% floor exceed the declared height, so the container overflows and
  // `ha-card`'s `overflow: hidden` clips the bottom of the axis (10px at 80px, 20px at
  // 60px). Growing the card cannot starve the band in the opposite direction: the cap
  // rises with the height, and once it passes the content the band simply stops there
  // (126.8px of 126.8px, nothing clipped, at 400px, 800px and 1200px).
  //
  // There is no floor, deliberately: giving the band one guaranteed row only moves the
  // overflow point up to roughly 146px, trading a scroll-only band for a clipped time
  // axis, and `height` is a free-text CSS length so it cannot be clamped in JS from here.
  //
  // Fractional tracks only distribute space once the grid itself has a definite height --
  // so the container is stretched to `100%` of the fixed-height `.content-container` it
  // sits directly inside. `max_height` is deliberately excluded: it caps and scrolls rather
  // than compresses, so its body stays the natural pixel height and only the container
  // clips. `height` defaults to the string `'auto'`, so a truthy check is not enough -- a
  // fixed height is a real length, matching the editor's own `heightMode` 'fixed' predicate.
  const fixedHeight = config.height != null && config.height !== '' && config.height !== 'auto';
  // Cramp trades readability for keeping days, not for losing zero-width tracks.
  // Below two root-font units per day, preserve the tracks and scroll horizontally.
  const cramp = ViewConfig.resolveMinDaysFallback(config, 'grid') === 'cramp';

  // Both scroll regions are focusable so a keyboard user can reach them, and a tab stop
  // with no accessible name is announced as nothing useful. The band is therefore named
  // wherever it is focusable, with `group` rather than `region`: the latter is a landmark,
  // which would list a card-internal strip of banners beside the page's own navigation.
  // The container is deliberately left unnamed — naming it needs a new string in all 35
  // card languages, and axe's scrollable-region-focusable is satisfied by the tab stop
  // alone; a name there is APG best practice, not a conformance requirement.

  return html`
    <div
      class="grid-container"
      tabindex=${cramp ? '0' : nothing}
      style=${styleMap({
        gridTemplateColumns: `${axisWidth} repeat(${gridDays.length}, minmax(${cramp ? '2rem' : '0'}, 1fr))`,
        ...(cramp ? { overflowX: 'auto' } : {}),
        columnGap: gutter,
        // The time band's height is the one place a configured length becomes the scale.
        // It is handed to CSS as a calc() rather than multiplied here, so `4em` and
        // `calc(3vh + 2px)` survive intact. Under a fixed content height it is a track
        // function instead of a length, and the block above stretches the container so the
        // `1fr` has room to fill.
        '--calendar-card-grid-body-height': fixedHeight
          ? 'minmax(50%, 1fr)'
          : `calc(${hourHeight} * ${bandHours})`,
        ...(fixedHeight
          ? { height: '100%', '--calendar-card-grid-allday-height': 'minmax(0, auto)' }
          : {}),
        '--calendar-card-grid-now-color': nowLineColor,
        '--calendar-card-column-header-gap': headerGap,
        // Written only when it paints something, so the stylesheet's transparent fallback
        // is the off state rather than a placeholder. `transparent` and `none` are how a
        // user turns the shading off, and both are cheaper to drop here than to paint.
        ...(paintsSomething(weekendTint) ? { '--calendar-card-grid-weekend': weekendTint } : {}),
      })}
    >
      ${paintsSomething(weekendTint) ? renderWeekendStripes(gridDays, hass) : nothing}
      ${renderWeekNumbers(gridDays, config)}
      ${gridDays.map((day, index) =>
        renderDayHeader(day, config, language, index, weatherForecasts, hass),
      )}
      ${bandRows > 0
        ? html`
            <div
              class="grid-allday-band"
              role=${fixedHeight ? 'group' : nothing}
              aria-label=${fixedHeight
                ? FormatUtils.capitalizeFirstLetter(Localize.getTranslations(language).allDay)
                : nothing}
              tabindex=${fixedHeight ? '0' : nothing}
              style=${styleMap({
                gridColumn: `1 / span ${gridDays.length + 1}`,
                gridRow: '3',
                gridTemplateColumns: 'subgrid',
                gridTemplateRows: `repeat(${bandRows}, auto)`,
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
 * @param hass - Home Assistant instance, whose locale decides which days are the weekend
 * @returns Rendered header
 */
function renderDayHeader(
  day: Types.EventsByDay,
  config: Types.Config,
  language: string,
  columnIndex: number,
  weatherForecasts?: Types.WeatherForecasts,
  hass?: Types.Hass | null,
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
        weekend: FormatUtils.isWeekendDate(dayDate, hass?.locale),
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
        hass,
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
  // Lanes are shared out among events that overlap, so the set they are computed over
  // decides how wide each drawn block is. Handing `layoutLanes` the whole day let an event
  // outside the visible hours claim a lane it would never draw into: a card showing 18:00
  // onward gave a lone evening event half its column because a lunchtime meeting, nowhere
  // on screen, was still counted as overlapping it. Narrow to what the band can actually
  // show first, so width is decided by what the reader can see.
  const visible = timed.filter((event) => Grid.intersectsBand(event.startMin, event.endMin, band));
  const { placed, overflows } = Grid.layoutLanes(visible, maxLanes);

  // Only today's column carries the line, and only when the current time is inside the
  // band. A line drawn across every column would say nothing; one clamped to an edge
  // would say something false.
  const nowPct = showNowLine && isToday ? Grid.computeNowLinePct(now, band) : null;

  return html`
    <div
      class=${classMap({
        'grid-day-body': true,
        today: isToday,
        weekend: FormatUtils.isWeekendDate(dayDate, hass?.locale),
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

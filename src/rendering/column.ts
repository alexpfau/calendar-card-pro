/**
 * Column view rendering for Calendar Card Pro
 *
 * Renders each day as a vertical column laid out side by side, rather than as a row in
 * a vertical list. The two views share every leaf — date block, event body, today
 * indicator — and differ only in the container that arranges them.
 *
 * That sharing is the point of the module boundary. The leaves live in `leaves.ts` and
 * the per-event derived values in `presentation.ts`, both lifted out of the list view's
 * own renderer explicitly so this file could compose them rather than reimplement them.
 * Nothing here recomputes an event's time string, countdown,
 * accent colour or past/future state: those come from `buildEventPresentation`, the
 * same function the list view calls, so the two views cannot drift.
 *
 * What this file owns is the axis, and only the axis:
 *
 * - a CSS grid with one track per day, instead of a stack of tables
 * - a horizontal day header, instead of a fixed-width date cell beside the events
 * - an optional horizontal rule under that header, which the list view has no counterpart for
 * - vertical day/week/month separators in the gutters, rotating the list's horizontal rules
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
 *
 * The list view derives the same two flags inline inside `renderGroupedEvents`
 * (render.ts:434-454). This is a separate, column-local copy on purpose: the list
 * view's copy is load-bearing for a DOM the snapshot gate pins byte-for-byte, and
 * nothing is gained by rewriting working code to share four lines of arithmetic.
 *
 * What it *is* shared by is everything on this side of the axis. Week numbers read
 * `isNewWeek`; the day, week and month separators read both. Computing them once
 * per render for the whole run keeps the two features from disagreeing about where a
 * boundary is, which is the failure mode that matters — a week pill on one column and
 * a week rule between two others.
 */
interface DayBoundary {
  /** True when this day starts a new week. The first day always does. */
  isNewWeek: boolean;
  /** True when this day starts a new month. The first day never does — nothing precedes it. */
  isNewMonth: boolean;
}

/**
 * Classify every day in a run by the boundaries it opens.
 *
 * Week boundaries compare week *numbers* rather than weekday indices, so they survive
 * `show_empty_days: false` removing the day a week nominally starts on. Month
 * boundaries compare month numbers for the same reason.
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

/** Which of the three separator families is drawn at a given boundary. */
type SeparatorKind = 'day' | 'week' | 'month';

/** A resolved rule: what to draw in one gutter, and in which family's colours. */
interface ColumnSeparator {
  kind: SeparatorKind;
  width: string;
  color: string;
}

/**
 * Decide which rule, if any, belongs in the gutter to the inline-start of a column.
 *
 * Precedence is month, then week, then day — the list view's order (`render.ts:463-488`
 * for the outer pair, `:375-400` for the day rule), so a user who has tuned the three
 * widths sees the same one win in both views.
 *
 * **This deliberately drops one piece of list-view behaviour, and the spec text saying
 * to keep it is amended rather than ignored.** D5 instructed column view to "carry the
 * coupling over": in list view `hasWeekSeparator` (`render.ts:385-386`) is true when
 * `show_week_numbers !== null` *or* `week_separator_width` is non-zero, which D5 read as
 * "switching week numbers on implicitly switches a week separator on". It does not. The
 * flag suppresses the *day* rule at week boundaries and renders nothing itself
 * (`render.ts:282-296` sets `--separator-display: none` when the width is zero). It
 * exists because the list view's week-number pill is a full-width table row sitting in
 * the exact slot a day separator would occupy — two horizontal rules in one gap.
 *
 * Column view has no such collision. The pill is a header row *inside* a column; the
 * rules are vertical and live *between* columns, so they cannot overlap. Carrying the
 * suppression over would mean a card with day separators and week numbers both on
 * silently loses the rule at every week boundary — a gap in an otherwise regular run
 * of rules, which reads as a bug rather than as a design. So each family is gated on
 * its own width and nothing else.
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
 * Three things make this work, and each replaces an approach that does not.
 *
 * **It is a grid item sharing a cell with the column it precedes, not a track of its
 * own.** Giving separators their own tracks would put a `column-gap` on *both* sides of
 * each rule, so the gutter would visibly widen at every boundary that carried one —
 * enabling a 1px rule would move every column. Overlaying the item in an existing cell
 * leaves the track geometry untouched, so switching separators on changes only what is
 * painted.
 *
 * **It is pulled into the gutter by a negative inline-start margin**, half the gutter
 * plus half its own width, which centres it on the boundary for any `day_spacing` and
 * any rule width. `margin-inline-start` rather than `margin-left` so RTL mirrors for
 * free. At `day_spacing: 0` the calc still resolves — the rule straddles the seam,
 * which is the only place left for it.
 *
 * **`align-self: stretch` (styles.ts) makes it full height** while the grid keeps
 * `align-items: start` for the columns themselves. The row is as tall as the busiest
 * day, so every rule runs from the top of the header to the bottom of that day's last
 * event and they are all the same length — the maintainer's ruling. A rule drawn as a
 * `border-inline-start` on the column instead would stop at that column's own content,
 * making a quiet Tuesday's rule shorter than its neighbours'.
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
 * The header arranges the weekday, day number, month and weather badge horizontally.
 * Those elements are produced by `renderDateContent`, unchanged from the list view —
 * it takes the weather badge as a parameter precisely so a container can decide where
 * to put it, and it owns the weekend/today colour precedence chain so both views
 * apply the same rules.
 *
 * @param day - Day data containing events
 * @param config - Card configuration
 * @param language - Language code for translations
 * @param weekRow - Reserved week-number row, or `nothing` when week numbers are off
 * @param columnIndex - Zero-based track this column occupies, placed explicitly so
 *   the separators can share the same cells without displacing it
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

  // A zero width means "no rule", matching how every other separator width in the
  // card is switched off. Zero is checked in any unit rather than against the literal
  // `0px`, because a user can write `0`, `'0'` or `'0em'` and mean the same thing.
  //
  // This is the default path, not the opt-out one: the rule ships off. The original
  // spec B2 ruling made it visible on the argument that the header/events boundary is
  // structural rather than decorative, which read well on paper and badly on screen --
  // against the coloured accent bars beside each event, a full-width horizontal rule
  // looks like a table border. B2 has been amended; see the COLUMN_DEFAULTS docstring.
  //
  // Omitting the element rather than emitting a zero-width one matters because the
  // separator carries its own bottom margin. What it must *not* do is take the gap
  // above the events with it, which is why that gap now lives on the header as
  // `day_header_gap` and the separator sits centred inside it.
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

  // Column view places the indicator inline, as a leading item on the weekday row,
  // rather than floating it by percentage the way the list view does. See
  // `renderTodayIndicator` for why the percentage model does not survive the axis flip.
  //
  // The rendered result is the authority on whether a dot is actually present, not
  // `isToday`: the indicator also declines to render when the option is off or resolves
  // to type `none`. Reading the sentinel back keeps that logic in one place instead of
  // restating a second, driftable copy of it here.
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
 * The pill reuses the list view's `.week-number` class, so the three
 * `week_number_*` options style both views from one set of custom properties and a
 * user who has tuned the colours does not have to tune them twice.
 *
 * What differs is the container. The list view hangs its pill in a table row that
 * spans the full card width; here it is a grid item in the day header, taking a
 * reserved row directly above the weekday — the position the maintainer specified,
 * and the only one that reads as "this column belongs to week 32" rather than
 * decorating the events below it.
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
 * Returns one entry per day, index-aligned with `days`, so the caller can hand each
 * column its own cell without re-deriving anything.
 *
 * Two rulings are encoded here.
 *
 * **Every column emits a cell, not only the week starts.** An empty grid area
 * collapses, so emitting the pill only where a week begins would give those columns a
 * taller header and push their weekday, day number and entire event stack down
 * relative to their neighbours — the row of dates would stop reading as a row, which
 * is the one thing the column view exists to provide. The non-starts therefore render
 * the same element and hide it with `visibility: hidden`. That reserves the exact
 * height from the real pill rather than from a guessed constant, keeps a single code
 * path, and is correctly skipped by assistive technology. It is the same collapse
 * constraint that ruled out a leading grid track for the today dot (spec D8-A).
 *
 * **The row is dropped entirely when nothing would fill it.** `show_current_week_number:
 * false` suppresses the pill on the week already in progress, which is the first
 * column by construction. A short span sitting wholly inside that week would then
 * reserve a row of blank space in every column for a number none of them shows, so
 * the row is omitted unless at least one column will actually fill it.
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

  // A column shows its pill when it starts a week. The first column always starts one
  // by construction, and `show_current_week_number: false` suppresses exactly that
  // one, mirroring the list view (render.ts:476) where the flag skips the first week's
  // pill and nothing else.
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
 * Day, week and month separators render as vertical rules in the gutters between
 * tracks, in the same month > week > day precedence the list view uses and off by
 * default at `0px`, exactly as there. `resolveSeparator` documents the one piece of
 * list-view behaviour they deliberately drop. They are laid out as overlaid grid items
 * rather than tracks of their own so that switching one on cannot move a column; see
 * `renderColumnSeparator`.
 *
 * The header rule is a separate thing again — a horizontal rule *inside* a column,
 * between its header and its events, controlled by `column → day_header_separator_*`.
 *
 * Every item in the grid is placed explicitly. Auto-placement fills only cells that no
 * explicitly-placed item claims, so mixing the two would push the auto-placed day
 * columns down into row 2 the moment a separator claimed a row-1 cell.
 *
 * Week numbers, by contrast, *are* rendered — as a reserved header row above the
 * weekday. See `renderColumnWeekNumber` for why every column emits one.
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

  // A separator sits *before* the column it is resolved for, so index 0 is skipped:
  // there is no gutter to the left of the first column. This mirrors the list view's
  // `isFirstWeek` guard (`render.ts:196`) -- `boundaries[0]` reports a new week and a
  // new month by construction, and in both views that first boundary has no edge to
  // draw on.
  const separators = boundaries
    .map((boundary, index) => ({ separator: resolveSeparator(boundary, config), index }))
    .filter(({ separator, index }) => separator !== null && index > 0)
    .map(({ separator, index }) =>
      renderColumnSeparator(separator as ColumnSeparator, index, config.day_spacing),
    );

  // `day_header_gap` is published as a custom property on the grid rather than applied
  // inline per column, because two separate rules consume it -- the header's bottom
  // padding and, when a rule is shown, the separator's bottom margin -- and they must
  // stay equal for the rule to sit centred in the gap. One declaration here beats the
  // same pair of inline styles repeated on every day.
  //
  // It is not registered in `generateCustomPropertiesObject` because that runs for both
  // views from top-level config, and this option exists only inside `column:`. Scoping
  // it to the grid keeps a column-only value out of the list view's cascade.
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

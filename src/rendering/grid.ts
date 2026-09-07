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
 * Grid has four rows: week numbers, day headers, all-day banners and the time body. The
 * rules run the last two, so a day column is ruled from under its date down to the foot
 * of the axis, as macOS Calendar draws it. Week numbers and dates stay clear — they are
 * labels, not ruled paper.
 *
 * 🚨 They used to stop at the band, on the reasoning that a rule crossing a spanning
 * all-day banner would make one event read as chopped into days. That reasoning was
 * sound and the remedy was wrong: the band now carries a `z-index` above the rules, so a
 * banner paints **over** them and reads as continuous, while the empty part of the band
 * shows the day columns it belongs to. Removing that `z-index` brings the original defect
 * straight back, which is why it is a declaration with a comment rather than a default.
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
        gridRow: '3 / span 2',
        width: separator.width,
        '--calendar-card-grid-rule-paint': separator.color,
        marginInlineStart: `calc(-0.5 * (${gap} + ${separator.width}))`,
      })}
    ></div>
  `;
}

/**
 * Render one horizontal rule across the day columns at an all-day band boundary.
 *
 * Unbroken, which is the whole point: the per-day header rule these replace was drawn
 * inside each day header, so `day_spacing` cut it into one dash per column and the row it
 * was supposed to close read as a row of ticks. One element spanning every day track
 * covers the gutters too, so the band sits in a frame rather than beside one.
 *
 * 🚨 It starts at the first day column, not at the card's edge, and both earlier answers
 * were wrong in opposite directions. `1 / -1` runs the rule across the hour axis as well,
 * which puts a horizontal line beside the hour labels where macOS Calendar has none;
 * cancelling the card's inset on top of that ran it out to the card's own edges and made
 * the grid look framed by the card rather than ruled inside it. `2 / -1` is the range the
 * hourly rules already use — `renderRules` spans `2 / span columnCount`, which ends on the
 * same line — so the horizontal rules of the grid now all begin and end together, at the
 * left edge of the first day column and the right edge of the last.
 *
 * That also means `.grid-boundary` carries no inline margin. The negative one it used to
 * have existed only to escape the container's padding, and there is nothing left to
 * escape.
 *
 * 🚨 The two rules take **different options**, and that is the correctness fix rather than
 * a styling choice. Both used to come from `day_separator_*`, the lower one as
 * `scaleLength(day_separator_width, 2)` — so one option drove the rule between two days,
 * the rule under the date row, the rule under the band and the ink of every hour rule.
 * Four visually distinct rules, one key, and a long-standing option quietly meaning
 * something new in one view. The upper rule is now `day_header_separator_*`, which already
 * existed as a grid-only key and already named exactly this boundary; the lower is
 * `allday_band_line_*`, new, and a literal rather than a multiple of anything, because a
 * derivation across two independently settable options is a coupling the user cannot see.
 * `2px` is what the old derivation produced at the shipped width, so nothing moved.
 *
 * macOS Calendar still draws the lower boundary heavier than the hour rules — that is a
 * boundary between two kinds of row rather than between two hours — and the defaults keep
 * that proportion. What changed is that a user can now break it.
 *
 * An explicit height keeps a rule out of the row sizing, and `alignSelf` decides which
 * edge of its row it sits on, so turning the frame on cannot change how tall the band or
 * the axis is.
 *
 * 🚨 The lower rule grows **upward, into the band**, rather than downward into the time
 * body. Drawn at the top of row 4 it bled into the first events of the day and sat on the
 * body's own first hour rule; drawn at the end of row 3 it lands inside the band's bottom
 * padding, where it is the band's floor rather than the body's ceiling — and the padding
 * is sized from the rule so the banners above it keep the same clear space they keep under
 * the upper rule.
 *
 * With no banners there is no band to grow into: row 3 collapses, so the rule stays at the
 * top of row 4 and the caller says so by passing the row.
 *
 * @param kind - Which boundary this is, used for the class
 * @param width - Resolved CSS length for the rule
 * @param color - Resolved CSS color for the rule
 * @param row - Grid row the rule is placed in
 * @param alignSelf - Which edge of that row it sits on
 * @returns The rendered rule
 */
function renderGridBoundary(
  kind: 'band-top' | 'band-bottom',
  width: string,
  color: string,
  row: number,
  alignSelf: 'start' | 'end',
) {
  return html`
    <div
      class="grid-boundary grid-boundary-${kind}"
      aria-hidden="true"
      style=${styleMap({
        gridColumn: '2 / -1',
        gridRow: String(row),
        alignSelf,
        height: width,
        '--calendar-card-grid-rule-paint': color,
      })}
    ></div>
  `;
}

/**
 * Render the rule that closes the body at the band's configured end.
 *
 * The hour rules stop one hour short of the bottom edge, because a
 * `repeating-linear-gradient` paints each rule *downward* from its boundary and the
 * boundary at 100% is outside the box. So the body trailed off into the card's padding
 * with nothing under it, which reads worst where a block runs to the edge — a block
 * carrying the clipped-end marking said "this continues past the window" and then had
 * nothing to continue past.
 *
 * 🚨 It is drawn only where the ruling would have drawn one, which the caller decides
 * with `Grid.bandEndHasRule`. This element is the gradients' missing last rule, not a
 * frame around the body: `end_time: 21:30` on hourly rules gets no line, because no
 * interior 21:30 gets one either. Drawing it unconditionally put a rule at a time the
 * cadence never rules, which is a line the user cannot account for from their own config.
 *
 * Drawn as an element rather than as a third gradient stop for the same reason the band's
 * own rules are: it has to sit at the END of its row, and a gradient cannot be told to.
 * `alignSelf: 'end'` puts its lower edge on the band's lower edge, so it grows *upward*
 * into the last pixel of the body rather than downward into the card's padding — the same
 * direction the band's heavier rule grows, and the reason a block ending at `end_time`
 * terminates against a line instead of under one.
 *
 * It takes its width from `--calendar-card-grid-rule-width` in the stylesheet rather than
 * from an inline height, so "matching the hour rules that precede it" is one value read
 * twice rather than a literal repeated in two files.
 *
 * @param color - Resolved colour for one hour rule
 * @returns The closing rule
 */
function renderGridEndRule(color: string): TemplateResult {
  return html`
    <div
      class="grid-boundary grid-boundary-body-end"
      aria-hidden="true"
      style=${styleMap({
        gridColumn: '2 / -1',
        gridRow: '4',
        alignSelf: 'end',
        '--calendar-card-grid-rule-paint': color,
      })}
    ></div>
  `;
}

/**
 * Render the weekend tint, one element per run of adjacent weekend days.
 *
 * A stripe of its own rather than a background on `.grid-day-body`, because the tint has
 * to run further than the body does: from immediately under the date row, through the
 * all-day band, and down the time grid, so a weekend reads as one continuous column
 * rather than as a tinted rectangle with the band floating above it. Spanning rows 3 and
 * 4 is what buys that, and it costs nothing when the band is empty — row 3 is an `auto`
 * track and an empty stripe gives it no height to take.
 *
 * 🚨 A **run**, not a day, and that is what closes the gutter. One element per weekend day
 * left the `day_spacing` gutter between Saturday and Sunday untinted, so the weekend read
 * as two stripes where macOS Calendar has one block; a grid area spanning two tracks covers
 * the gutter between them, so the tint is continuous for free and cannot spill past the
 * ends of the run. That last part is the reason for spanning rather than for a negative
 * margin, which would have needed a rule about which side to bleed on and would have got
 * the outer edges wrong at some window.
 *
 * A run is grown from **adjacency**, never from a hardcoded Saturday and Sunday.
 * `WEEKEND_BY_LOCALE` gives `ar` and `he` a Friday–Saturday weekend, whose interior
 * boundary is somewhere else entirely, and `fa`, `hi`, `ml`, `ta` and `te` a single weekend
 * day, which has no interior boundary at all and must stay one column wide.
 *
 * Both halves of adjacency are required, and the second is not redundant. Two weekend days
 * can be neighbouring **columns** without being neighbouring **dates** — a card with
 * `show_empty_days: false` can drop every weekday between a Sunday and the next Saturday,
 * which would otherwise bleed a tint across a gutter six days wide.
 *
 * The date row is deliberately outside the span. It is a label, not part of the day's
 * field, and macOS Calendar leaves it clear too.
 *
 * Painted behind everything by being a plain grid item: banners, blocks and rules are
 * either positioned or carry a `z-index`, so they all paint later whatever the DOM order.
 *
 * @param days - Days on screen, in order
 * @param hass - Home Assistant instance, whose locale decides which days are the weekend
 * @returns One stripe per run of adjacent weekend days
 */
function renderWeekendStripes(
  days: Types.EventsByDay[],
  hass?: Types.Hass | null,
): TemplateResult[] {
  const runs: Array<{ start: number; span: number }> = [];

  days.forEach((day, index) => {
    const date = new Date(day.timestamp);

    if (!FormatUtils.isWeekendDate(date, hass?.locale)) {
      return;
    }

    const open = runs[runs.length - 1];
    const joins =
      open !== undefined &&
      open.start + open.span === index &&
      FormatUtils.getCalendarDayDiff(new Date(days[index - 1].timestamp), date) === 1;

    if (joins) {
      open.span += 1;
    } else {
      runs.push({ start: index, span: 1 });
    }
  });

  return runs.map(
    ({ start, span }) => html`
      <div
        class="grid-weekend"
        aria-hidden="true"
        style=${styleMap({ gridColumn: `${start + 2} / span ${span}`, gridRow: '3 / span 2' })}
      ></div>
    `,
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
 * 🚨 There is nothing special about the band's own end here, and there used to be. Every
 * label comes from `axisHours`, which includes the closing boundary only when it is a
 * whole hour like any other; a band ending at `21:30` gets no label there, because no
 * interior half hour gets one either. The label list is therefore one list, and the
 * clamp — not a second rule here — is what places its ends. The first label resolves to
 * `clamp(0px, -0.5em, …)` and lands flush at the top, entirely BELOW its rule, so it
 * cannot bleed up into the all-day band. A label at 100% resolves to
 * `clamp(0px, 100% - 0.5em, 100% - 1em)`, which the upper bound wins, so it lands flush at
 * the bottom, entirely ABOVE the closing rule. The treatment is symmetric with the first
 * by construction rather than by a second declaration, and it is why the label cannot
 * influence the card's height: it is absolutely positioned inside an `overflow: hidden`
 * axis whose height is the body row's, so there is no box for it to grow. Centring it on
 * the rule instead would need `overflow: visible` here, which is the one declaration
 * keeping a compressed axis from extending the card past its configured `height`.
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
  const bandLength = band.endMin - band.startMin;
  const use24h = FormatUtils.resolveTimeFormat24h(config, hass);
  const labels = Grid.axisHours(band).map((hour) => ({
    text: formatHour(hour, use24h),
    topPct: ((hour * 60 - band.startMin) / bandLength) * 100,
  }));

  return html`
    <div class="grid-axis" style=${styleMap({ gridColumn: '1', gridRow: '4' })}>
      <div class="grid-axis-sizer" aria-hidden="true">
        ${labels.map(({ text }) => html`<span>${text}</span>`)}
      </div>
      ${labels.map(
        ({ text, topPct }) =>
          html`<div
            class="grid-axis-label"
            style=${styleMap({
              '--calendar-card-grid-axis-label-top': `${topPct}%`,
            })}
          >
            ${text}
          </div>`,
      )}
    </div>
  `;
}

/**
 * Format one axis hour.
 *
 * Hour-only, deliberately: `FormatUtils.formatTime` always emits minutes, and `06:00`
 * down the whole gutter spends width on three characters that never change.
 *
 * 🚨 Hour 24 is wrapped to 0, and it is reachable straight from the editor: `end_time`
 * accepts `24:00`, the one bound that is a minute count rather than a clock reading, and
 * `axisHours` now emits it as a whole hour like any other. Unwrapped it would label `24`
 * in 24-hour mode and — worse, because it looks like a real time — `12 PM` in 12-hour
 * mode, since 24 is not less than 12 and 24 % 12 is 0.
 *
 * @param hour - Hour of the day, 0-24, where 24 is midnight at the end of the day
 * @param use24h - Whether to use 24-hour time
 * @returns The label
 */
function formatHour(hour: number, use24h: boolean): string {
  const wrapped = hour % 24;

  if (use24h) {
    return String(wrapped);
  }

  const suffix = wrapped < 12 ? 'AM' : 'PM';
  const twelve = wrapped % 12 === 0 ? 12 : wrapped % 12;

  return `${twelve} ${suffix}`;
}

/**
 * Render the horizontal rules across the body.
 *
 * Drawn as a repeating gradient rather than as one element per slot, so a day at a
 * 15-minute resolution costs one painted layer instead of sixty elements per column.
 *
 * 🚨 The topmost line of the body is drawn once, by the band's own lower frame rule, and
 * this layer is masked so it cannot draw it a second time. A band opening on the hour puts
 * a gradient rule at 0% — exactly where that frame rule sits — and the two do not merge,
 * they composite: `var(--divider-color)` is translucent, so the overlap paints darker than
 * either. Measured on the deployed build at the band boundary: one row at
 * `rgb(173, 173, 173)` above a row at `rgb(224, 224, 224)`, which is three translucent
 * layers against one and reads as a thin rule stacked on a thicker one.
 *
 * Shifting the offset does NOT fix it, and that was measured too rather than reasoned
 * about. A `repeating-linear-gradient` tiles in **both** directions from its first stop, so
 * an offset of one whole period is the same phase as an offset of none: the deployed build
 * reported `hour-offset: 6.666667%` against a `6.666667%` period and still painted a rule
 * at the top of the body. The mask on `.grid-rules` is what removes it, and it is exact —
 * insetting the layer instead would leave every rule up to half a pixel out from the blocks
 * it is supposed to align with, because the percentages would resolve against a shorter box.
 *
 * 🚨 The slot gradient is painted in `transparent` when the slot IS the hour, and that is
 * not a tidy-up. Translucent ink composites rather than merging, so two identical patterns
 * are not one pattern drawn twice — they are one pattern drawn at nearly twice the ink.
 * Measured on the deployed build at the shipped `slot_minutes: 60`: an hour rule came back
 * `rgb(197, 197, 197)` where a vertical day rule of the same colour and width came back
 * `rgb(224, 224, 224)`, which is 0.226 alpha against 0.12. The stylesheet claimed the two
 * families carried identical ink and they had not since the slot gradient arrived.
 *
 * Below the hour the doubling is left alone, because there it says something: a rule that
 * is both a slot boundary and an hour boundary paints darker than one that is only a slot
 * boundary, which is the hierarchy macOS Calendar draws by hand.
 *
 * @param band - The visible band
 * @param slotMinutes - Configured rule spacing
 * @param columnCount - Day columns to span
 * @param ruleColor - Resolved `hour_line_color`
 * @returns The ruled backdrop
 */
function renderRules(
  band: Grid.GridBand,
  slotMinutes: number,
  columnCount: number,
  ruleColor: string,
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
        '--calendar-card-grid-rule-color': ruleColor,
        '--calendar-card-grid-slot-color': slotMinutes < 60 ? ruleColor : 'transparent',
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
 * Compose a block's vertical geometry from its placement.
 *
 * The percentages arrive from `computeEventPlacement`, which knows minutes and nothing
 * else — deliberately, so a fixed content height can compress the whole grid with no
 * arithmetic. The pixel of clearance is composed onto them in the stylesheet rather than
 * folded in here, because a percentage of a band whose height this card does not yet know
 * cannot express "one pixel". So this returns custom properties and `.grid-event` does the
 * `calc()`; `top` and `height` are never written from here.
 *
 * The gap the stylesheet reaches for is `--calendar-card-grid-event-gap`, the same
 * property that already holds a block a pixel clear of its column edges, so a block clears
 * its neighbours by one value on every side. A block starting at 13:00 used to draw its
 * top edge exactly on the 13:00 rule, which reads as the block hanging off the line rather
 * than sitting under it; macOS Calendar leaves the same small gap it leaves between
 * columns.
 *
 * 🚨 The upper edge additionally clears `--calendar-card-grid-rule-width`, and the lower
 * one must not. An hour rule paints downward from its boundary, so the gap alone puts a
 * block's top edge on the rule's underside with nothing between them — see the composition
 * comment on `.grid-event`, which carries the measurement.
 *
 * 🚨 Per edge, not per block, and the clipped ends are why. A block running past the band
 * edge is cut off there rather than ending there, so a gap at that edge would draw the one
 * thing the clipping marks exist to deny — it would say the event stops at the top of the
 * window. Only an edge the event genuinely owns gets the clearance, so an owned edge says
 * nothing and inherits the stylesheet's default while a clipped one writes `0px` over it.
 *
 * A block shorter than the two gaps computes a negative height, which CSS resolves to
 * zero, and `min-height` on `.grid-event` then floors it exactly as it already floors a
 * ten-minute event. Nothing here needs to clamp.
 *
 * @param placement - Where the block sits in the band
 * @returns Custom properties for the block's inline style
 */
function verticalGeometry(placement: Grid.EventPlacement): Record<string, string> {
  return {
    '--calendar-card-grid-block-top': `${placement.topPct}%`,
    '--calendar-card-grid-block-height': `${placement.heightPct}%`,
    ...(placement.clippedTop ? { '--calendar-card-grid-block-gap-above': '0px' } : {}),
    ...(placement.clippedBottom ? { '--calendar-card-grid-block-gap-below': '0px' } : {}),
  };
}

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
        ...verticalGeometry(placement),
        insetInlineStart: `calc(${event.laneIndex * laneWidth}% + var(--calendar-card-grid-event-gap))`,
        width: `calc(${laneWidth}% - var(--calendar-card-grid-event-gap) * 2)`,
        borderInlineStartColor: presentation.entityAccentColor,
        backgroundColor: presentation.entityAccentBackgroundColor,
        ...presentation.accentTextProperties,
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
        ...verticalGeometry(placement),
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
 * The calendar's color arrives as the fill and nothing else. A banner has no accent edge,
 * where a timed block does — see the stylesheet comment on `.grid-banner` for why the two
 * differ, and note that removing the edge is what lets the pill ends read as ends rather
 * than as a shape with something stuck to one side of it.
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
        backgroundColor: presentation.entityAccentBackgroundColor,
        ...presentation.accentTextProperties,
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
  const hourLineWidth = ViewConfig.resolveTimeGridOption(config, 'hour_line_width');
  const hourLineColor = ViewConfig.resolveTimeGridOption(config, 'hour_line_color');

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

  // The two horizontal rules framing the all-day band, each on its own option now.
  //
  // 🚨 They used to be one option — `day_separator_*`, which also drew the vertical rules
  // and coloured the hour rules. `day_separator_*` has meant *the rule between two days*
  // since the card shipped, and driving four visually distinct rules from it made all four
  // impossible to configure apart. The upper rule is `day_header_separator_*`, a grid-only
  // key that already existed and already named this boundary and which the renderer never
  // read; the lower is the new `allday_band_line_*`.
  //
  // Using `day_header_separator_*` here also closes a live hazard rather than only tidying
  // one up. It used to be handed to the shared day-header leaf, which draws a rule inside
  // each day's own header — so a user switching it on got a second, `day_spacing`-broken
  // rule at the same boundary the frame rule was already drawn at. After this there is one
  // rule there and one key controlling it.
  //
  // The upper rule is only drawn when there is a band to close: with no all-day events
  // row 3 collapses to nothing and the two rules would land on the same line, a hairline
  // stacked under a heavier one. The lower rule is the boundary either way.
  //
  // Which row the lower rule sits in is the band's presence, not a constant. With a band
  // it belongs at the END of row 3, growing up into the band's bottom padding rather than
  // down into the first events of the day; with no band there is no row 3 to grow into and
  // it stays at the top of row 4.
  const bandTopWidth = ViewConfig.resolveTimeGridOption(config, 'day_header_separator_width');
  const bandTopColor = ViewConfig.resolveTimeGridOption(config, 'day_header_separator_color');
  const bandBottomWidth = ViewConfig.resolveTimeGridOption(config, 'allday_band_line_width');
  const bandBottomColor = ViewConfig.resolveTimeGridOption(config, 'allday_band_line_color');
  const bandBoundaries = [
    ...(bandRows > 0 && !ViewConfig.isZeroLength(bandTopWidth)
      ? [renderGridBoundary('band-top', bandTopWidth, bandTopColor, 3, 'start')]
      : []),
    ...(!ViewConfig.isZeroLength(bandBottomWidth)
      ? [
          renderGridBoundary(
            'band-bottom',
            bandBottomWidth,
            bandBottomColor,
            bandRows > 0 ? 3 : 4,
            bandRows > 0 ? 'end' : 'start',
          ),
        ]
      : []),
  ];

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
        // The band's padding is sized from the two rules it has to clear, one per edge, so
        // the banners keep the same clear space under the upper rule as above the lower one
        // at whatever widths a user picks. Two properties rather than one because the two
        // rules are separate options now — a single `frame-width` was only ever right while
        // the lower rule was a fixed multiple of the upper. Written unconditionally, `0px`
        // included: with a rule off there is nothing to clear and the padding falls back to
        // the bare inset.
        '--calendar-card-grid-band-top-width': bandTopWidth,
        '--calendar-card-grid-band-bottom-width': bandBottomWidth,
        // The thickness of one hour rule, read in three places a long way apart: the
        // gradients in `.grid-rules` paint it, the closing rule at the band's end matches
        // it, and a block's top clearance has to clear it. Written from here rather than
        // declared in the stylesheet so those three cannot disagree and so the option is
        // reachable at all.
        '--calendar-card-grid-rule-width': hourLineWidth,
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
      ${renderRules(band, slotMinutes, gridDays.length, hourLineColor)}
      ${Grid.bandEndHasRule(band, slotMinutes) ? renderGridEndRule(hourLineColor) : nothing}
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
      ${separators} ${bandBoundaries}
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
 * 🚨 `null` for the leaf's own separator, and that is the point rather than an omission.
 * Column view draws `day_header_separator_*` inside each day's header, which `day_spacing`
 * cuts into one dash per column; grid spends the same option on the unbroken rule between
 * the date row and the all-day band, drawn by `renderGridBoundary`. Passing it here as well
 * would put two rules at one boundary — a broken one on top of a whole one — which is
 * exactly what a user switching the option on used to get.
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
        null,
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

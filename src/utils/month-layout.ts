/**
 * Where a month's events sit in one week row: which line each takes under its day's date, and
 * which of them the row has no room for.
 *
 * Pure: no Lit, no DOM and no pixels. The renderer measures how many lines fit under a date
 * (the capacity) and hands it in; everything here is arithmetic on columns and lines, so the
 * hard part, a bar that has to be visible on every day it covers or on none, is testable
 * without a layout engine.
 *
 * A row draws two kinds of item. A **bar** is an all-day event, or a timed one a full day or
 * longer that `multiday_banners` draws across its days (`_gridBanner`), joined over the row's
 * days by Grid's own run logic (`resolveBannerRuns`), so a day `days_of_week` leaves out, or a
 * change in the calendars a deduplicated event stands for, breaks it as it breaks Grid's
 * banner. A one-day all-day event is a bar one day long, a pill. A **line** is every other
 * event, one per day it touches: a timed event, or each day's part of an overnight one.
 *
 * Bars are placed first, by first column, then longest, then their event's start, then title,
 * and lines after them, each day's by start; each item takes the lowest line free across all
 * its columns (`lowestFreeRows`, shared with Grid's all-day band). An item set in larger text, by
 * its calendar's `text_scale`, takes as many lines as it is tall, so a week never holds more than
 * its capacity's height.
 *
 * Then the capacity decides what shows. An item is visible only where it is visible on every
 * day it covers, so a bar is never drawn cut at a day that has no room for it. A day holding
 * an item it cannot show keeps its last line for "+N more", so on that day only the lines
 * above it show. Reserving that line can hide a bar there, which hides the bar on its other
 * days, which can make them reserve theirs: so it is repeated until nothing changes. Each
 * round can only hide more, so it ends within one round per day.
 */

import * as FormatUtils from './format';
import * as Grid from './grid';
import * as Types from '../config/types';

/** An event as one week row draws it. */
export interface MonthItem {
  /** A bar spanning its days, or a line in one day. */
  readonly kind: 'bar' | 'line';

  /**
   * The event drawn. For a bar, its first day's copy carrying its whole event's start and end,
   * as Grid's banner is drawn from; for a line, that day's segment.
   */
  readonly event: Types.CalendarEventData;

  /**
   * The columns it covers in the row, and whether its event carries on before or after them.
   * A line covers one column; it continues before where it is a later day of an overnight
   * event, and after where its event runs on into the next day.
   */
  readonly placement: Grid.BannerPlacement;
}

/** An item, the line it takes under its days' dates, and whether it is drawn. */
export interface MonthPlacement {
  readonly item: MonthItem;

  /** The line, from 0 just under the date. */
  readonly line: number;

  /** How many lines it takes from there: more than one for an item set in larger text. */
  readonly lines: number;

  /** Whether it is drawn: on every day it covers, the line is one the day shows. */
  readonly visible: boolean;
}

/** What one day of the row cannot show. */
export interface MonthDayLayout {
  /** The items covering the day that are not drawn, in placement order. "+N" counts them. */
  readonly hidden: readonly MonthItem[];

  /**
   * Whether the day draws "+N more", on its last line: where it hides an item and has a line
   * to say so on. With no line under the date at all it has none, and hides its items silently.
   */
  readonly more: boolean;
}

/** One week row's layout. */
export interface MonthWeekLayout {
  /** Every item, bars first, with its line and whether it is drawn. */
  readonly placements: readonly MonthPlacement[];

  /** One entry per day of the row, in column order. */
  readonly days: readonly MonthDayLayout[];
}

/**
 * Whether month draws an event of a day as a bar rather than as a line: an all-day event, or a
 * timed one grouping marked for a banner (`_gridBanner`).
 *
 * @param event - One of a day's events, as grouping hands it over
 * @returns True for a bar
 */
export function isMonthBar(event: Types.CalendarEventData): boolean {
  return !event.start.dateTime || event._gridBanner === true;
}

/**
 * The instant a start or an end stands for: a date's local midnight, or a time's own moment.
 *
 * @param point - An event's start or end
 * @returns Milliseconds since the epoch, or NaN for neither
 */
function instantOf(point: Types.CalendarEventData['start']): number {
  if (point.dateTime) return Date.parse(point.dateTime);
  if (point.date) return FormatUtils.parseAllDayDate(point.date).getTime();
  return Number.NaN;
}

/**
 * The order bars take their lines in: first column, then the longer first, then the earlier
 * event, then the title, so the same events always stack the same way.
 *
 * @param a - One bar
 * @param b - Another
 * @returns Negative where `a` goes first
 */
function compareBars(a: Grid.BannerRun, b: Grid.BannerRun): number {
  return (
    a.placement.columnIndex - b.placement.columnIndex ||
    b.placement.span - a.placement.span ||
    (instantOf(a.event.start) || 0) - (instantOf(b.event.start) || 0) ||
    ((a.event.summary ?? '') < (b.event.summary ?? '')
      ? -1
      : (a.event.summary ?? '') > (b.event.summary ?? '')
        ? 1
        : 0)
  );
}

/**
 * One day's lines: its timed segments that are not bars, by start, ties in the order grouping
 * gave them.
 *
 * @param events - The day's events
 * @param column - The day's column in its row
 * @returns The day's line items
 */
function dayLines(events: ReadonlyArray<Types.CalendarEventData>, column: number): MonthItem[] {
  return events
    .filter((event) => !event._isEmptyDay && !isMonthBar(event))
    .map((event, order) => ({ event, order, start: instantOf(event.start) }))
    .sort((a, b) => (a.start || 0) - (b.start || 0) || a.order - b.order)
    .map(({ event }) => {
      const sourceEnd = event._gridSource ? instantOf(event._gridSource.end) : Number.NaN;
      return {
        kind: 'line' as const,
        event,
        placement: {
          columnIndex: column,
          span: 1,
          continuesBefore: event._gridSegmentStartsEvent === false,
          continuesAfter: instantOf(event.end) < sourceEnd,
        },
      };
    });
}

/**
 * Lay one week row out: every bar and line on its line, and what each day cannot show at a
 * capacity.
 *
 * @param days - Each day's events, as grouping hands them over, in column order; a day with
 *   none is an empty list
 * @param dayStarts - Local midnights of the same days
 * @param capacity - Lines that fit under a date. Below 1, a day shows none, and no "+N more"
 * @param linesOf - How many lines an item's event takes, 1 unless its text is set larger
 * @returns The row's layout
 */
export function layoutMonthWeek(
  days: ReadonlyArray<ReadonlyArray<Types.CalendarEventData>>,
  dayStarts: readonly Date[],
  capacity: number,
  linesOf: (event: Types.CalendarEventData) => number = () => 1,
): MonthWeekLayout {
  const bars = Grid.resolveBannerRuns(
    days.map((events) => events.filter((event) => !event._isEmptyDay && isMonthBar(event))),
    dayStarts,
  ).sort(compareBars);

  const items: MonthItem[] = [
    ...bars.map(({ event, placement }) => ({ kind: 'bar' as const, event, placement })),
    ...days.flatMap((events, column) => dayLines(events, column)),
  ];
  const heights = items.map(({ event }) => Math.max(1, Math.floor(linesOf(event))));
  const lines = Grid.lowestFreeRows(
    items.map(({ placement }, index) => ({
      start: placement.columnIndex,
      end: placement.columnIndex + placement.span,
      rows: heights[index],
    })),
  );

  const columns = days.length;
  const covers = (item: MonthItem, column: number): boolean =>
    column >= item.placement.columnIndex &&
    column < item.placement.columnIndex + item.placement.span;

  // The days that keep their last line for "+N more". Each round can only add days, since a
  // reserved day shows fewer lines, so the loop ends within one round per day.
  let reserved: boolean[] = Array.from({ length: columns }, () => false);
  let visible: boolean[] = [];
  for (;;) {
    visible = items.map((item, index) => {
      for (let column = 0; column < columns; column++) {
        if (!covers(item, column)) continue;
        const shown = reserved[column] ? capacity - 1 : capacity;
        if (lines[index] + heights[index] > shown) return false;
      }
      return true;
    });
    const next = reserved.map((_, column) =>
      items.some((item, index) => !visible[index] && covers(item, column)),
    );
    if (next.every((value, column) => value === reserved[column])) break;
    reserved = next;
  }

  return {
    placements: items.map((item, index) => ({
      item,
      line: lines[index],
      lines: heights[index],
      visible: visible[index],
    })),
    days: Array.from({ length: columns }, (_, column) => {
      const hidden = items.filter((item, index) => !visible[index] && covers(item, column));
      return { hidden, more: hidden.length > 0 && capacity >= 1 };
    }),
  };
}

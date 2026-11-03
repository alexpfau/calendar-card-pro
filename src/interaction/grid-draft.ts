/**
 * The new event a drag draws in a grid (`day_tap_action: add-event`): its span from where the
 * press began and where the pointer is now, and where each day's piece of it sits.
 *
 * No DOM here. The recognizer in `calendar-card-pro.ts` reads the days under the pointer and
 * draws the pieces onto the grid's own day elements through attributes and custom properties
 * (`_drawDraft`), never through elements of their own, which the grid's structure observers
 * would take for a change in what it draws.
 */

import type { EventTimes } from './event-times';
import * as Constants from '../config/constants';

/**
 * A day's local midnight, from any moment of it.
 *
 * The days the views draw are stamped with a moment of the day rather than its midnight (the
 * first event's display date, where it has one), so everything here takes the day from it.
 *
 * @param timestamp - Any moment of the day
 * @returns The day's local midnight
 */
export function dayOf(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** A slot in a grid's time area: a day, and the first minute of its quarter hour. */
export interface TimePoint {
  /** The day, as any moment of it. */
  readonly timestamp: number;
  /** The slot's first minute, from midnight. */
  readonly minute: number;
}

/** What a drag that draws a new event began on. */
export type DraftAnchor =
  | { readonly allDay: false; readonly point: TimePoint }
  | { readonly allDay: true; readonly timestamp: number };

/**
 * A wall-clock time on a day, which a day on which the clocks change keeps as written, or
 * moves to the first that exists.
 *
 * @param timestamp - The day's local midnight
 * @param minute - Minutes from that midnight, which may run past the day
 * @returns The date
 */
export function atMinute(timestamp: number, minute: number): Date {
  const date = new Date(dayOf(timestamp));
  date.setHours(0, minute, 0, 0);
  return date;
}

/**
 * The span a timed draft stands for.
 *
 * Until the pointer leaves the slot the press began in, it is what a tap there adds: an hour
 * from that slot. From then on it runs from the earlier of the two slots to the end of the
 * later, at least one slot long, so dragging down draws the end and dragging up draws the
 * start, on one day or across several. Back in its first slot after leaving it, it is that one
 * slot, as drawn.
 *
 * @param anchor - The slot the press began in
 * @param current - The slot under the pointer
 * @param moved - Whether the pointer has left the first slot since the draft began
 * @returns The span
 */
export function timedDraft(anchor: TimePoint, current: TimePoint, moved: boolean): EventTimes {
  const step = Constants.UI.ADD_SLOT_MINUTES;
  const start = atMinute(anchor.timestamp, anchor.minute);
  if (!moved) {
    return { allDay: false, start, end: atMinute(anchor.timestamp, anchor.minute + 60) };
  }
  const here = atMinute(current.timestamp, current.minute);
  return here < start
    ? { allDay: false, start: here, end: atMinute(anchor.timestamp, anchor.minute + step) }
    : { allDay: false, start, end: atMinute(current.timestamp, current.minute + step) };
}

/**
 * The span an all-day draft stands for: every day from the one the press began on to the one
 * under the pointer, in either direction. The end is the last day, as `EventTimes` keeps an
 * all-day span.
 *
 * @param anchorDay - The day the press began on, as any moment of it
 * @param currentDay - The day under the pointer, as any moment of it
 * @returns The span
 */
export function allDayDraft(anchorDay: number, currentDay: number): EventTimes {
  const [first, last] = [dayOf(anchorDay), dayOf(currentDay)].sort((a, b) => a - b);
  return { allDay: true, start: new Date(first), end: new Date(last) };
}

/**
 * The minutes of one day a timed span covers, from that day's midnight: from 0 on a day after
 * its first, and to 1440 on a day before its last. Undefined for a day it does not reach.
 *
 * @param times - A timed span
 * @param timestamp - The day, as any moment of it
 * @returns The day's piece, or undefined
 */
export function pieceOnDay(
  times: EventTimes,
  timestamp: number,
): { fromMin: number; untilMin: number } | undefined {
  const dayStart = new Date(dayOf(timestamp));
  const nextDay = new Date(dayOf(timestamp));
  nextDay.setDate(nextDay.getDate() + 1);
  if (times.end <= dayStart || times.start >= nextDay) return undefined;

  const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
  return {
    fromMin: times.start <= dayStart ? 0 : minutesOf(times.start),
    untilMin: times.end >= nextDay ? 24 * 60 : minutesOf(times.end),
  };
}

/**
 * Whether two slots are the same.
 *
 * @param a - A slot
 * @param b - Another
 * @returns True for the same day and minute
 */
export function sameSlot(a: TimePoint, b: TimePoint): boolean {
  return dayOf(a.timestamp) === dayOf(b.timestamp) && a.minute === b.minute;
}

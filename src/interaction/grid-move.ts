/**
 * An event a drag moves in a grid: which events may be moved, where the pointer puts one, and
 * the change Home Assistant is sent once it is dropped.
 *
 * No DOM here. The recognizer in `calendar-card-pro.ts` reads the day and the height under the
 * pointer and draws the moved event as it draws a new one (`_paintNew`).
 */

import type { EventWrite } from './calendar-writes';
import type { DetailEntry } from './event-details';
import type { EventTimes } from './event-times';
import * as Times from './event-times';
import { atMinute, dayOf } from './grid-draft';
import * as Constants from '../config/constants';

/** Where a pointer is in a grid's time area: a day, and how far into it, unrounded. */
export interface MovePoint {
  /** The day, as any moment of it. */
  readonly timestamp: number;
  /** Minutes from the day's midnight, with their fraction. */
  readonly minute: number;
}

/**
 * The minute a point in a grid's time area stands for, unrounded, so a drag can move an event by
 * how far the pointer went rather than to the slot it is in. Held to the area, as `minuteAt`
 * holds it, so a pointer above or below the area moves the event no further.
 *
 * @param rect - The area's client rect
 * @param y - The pointer's viewport y
 * @param startMin - First minute the area shows
 * @param endMin - Minute it ends at, exclusive
 * @returns Minutes from midnight
 */
export function preciseMinuteAt(
  rect: { top: number; height: number },
  y: number,
  startMin: number,
  endMin: number,
): number {
  const span = endMin - startMin;
  if (!(rect.height > 0) || !(span > 0)) return startMin;
  return startMin + Math.min(1, Math.max(0, (y - rect.top) / rect.height)) * span;
}

/**
 * An event's times, where a drag may move it: a timed event that starts and ends on one day,
 * an end at the following midnight included. An all-day event, one that runs over several days
 * and one whose times cannot be read move by the popover only.
 *
 * @param entry - The event as stored
 * @returns Its span, or undefined where it may not be dragged
 */
export function movableTimes(entry: DetailEntry): EventTimes | undefined {
  const times = Times.timesFromEntry(entry.dtstart, entry.dtend);
  if (!times || times.allDay) return undefined;
  const start = times.start.getTime();
  const end = times.end.getTime();
  if (end < start) return undefined;
  return dayOf(start) === dayOf(Math.max(start, end - 1)) ? times : undefined;
}

/**
 * Where a drag puts an event: moved by whole quarter hours (`ADD_SLOT_MINUTES`), as many as the
 * pointer went up or down from where it grabbed the event, and by as many days as it went
 * across. Its minute within the quarter stays, so an event at 10:10 moves to 10:25 or 9:55, and
 * so does its length in time, which a clock change on either day would otherwise stretch or
 * shrink. Its start stays on the day it is dropped on.
 *
 * @param times - The event's span, from `movableTimes`
 * @param grab - Where the pointer grabbed it
 * @param at - Where the pointer is now
 * @returns The span it would have
 */
export function movedTimes(times: EventTimes, grab: MovePoint, at: MovePoint): EventTimes {
  const step = Constants.UI.ADD_SLOT_MINUTES;
  const start = times.start;
  const startMin = start.getHours() * 60 + start.getMinutes();
  const lowest = Math.ceil(-startMin / step);
  const highest = Math.floor((24 * 60 - 1 - startMin) / step);
  const steps = Math.min(highest, Math.max(lowest, Math.round((at.minute - grab.minute) / step)));
  const days = Times.dayDifference(new Date(dayOf(grab.timestamp)), new Date(dayOf(at.timestamp)));
  const day = Times.addDays(new Date(dayOf(start.getTime())), days);
  const newStart = atMinute(day.getTime(), startMin + steps * step);
  newStart.setSeconds(start.getSeconds(), start.getMilliseconds());
  return {
    allDay: false,
    start: newStart,
    end: new Date(newStart.getTime() + (times.end.getTime() - start.getTime())),
  };
}

/**
 * The change a drop writes: the event as stored, at its new times. A field the event does not
 * carry is left out rather than written empty.
 *
 * @param entry - The event as stored
 * @param times - Its new span
 * @returns The event to write
 */
export function moveWrite(entry: DetailEntry, times: EventTimes): EventWrite {
  return {
    summary: entry.summary,
    ...Times.writeTimes(times),
    ...(entry.description !== undefined && { description: entry.description }),
    ...(entry.location !== undefined && { location: entry.location }),
  };
}

/** What names the event a drag moves, among those a render draws. */
export interface MoveKey {
  readonly entityId: string;
  readonly uid: string;
  readonly recurrenceId?: string;
  /** Its stored start, as an instant. */
  readonly start: number;
}

/**
 * Whether a rendered event is the one a drag moves: same calendar, uid, occurrence and stored
 * start. The start is what tells the event where it was from the event where a refresh has put
 * it since, which the grid may draw in the same element.
 *
 * @param key - The event moved
 * @param entityId - The rendered event's calendar
 * @param entry - The rendered event as stored
 * @returns True for the same event at the same times
 */
export function isMoveOrigin(
  key: MoveKey,
  entityId: string | undefined,
  entry: DetailEntry | undefined,
): boolean {
  if (!entry || entityId !== key.entityId || entry.uid !== key.uid) return false;
  if ((entry.recurrence_id ?? undefined) !== key.recurrenceId) return false;
  return Times.timesFromEntry(entry.dtstart, entry.dtend)?.start.getTime() === key.start;
}

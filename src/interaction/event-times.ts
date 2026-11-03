/**
 * An event's start and end, as the popover edits them and as Home Assistant stores them.
 *
 * The popover shows and edits times in the browser's own zone, as the card's rows do. An
 * all-day event is two calendar dates there, its end the last day it covers; Home Assistant
 * stores the day after instead. A timed event goes back in UTC: see `EventWrite` in
 * `calendar-writes.ts` for why.
 */

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/**
 * An event's span as the popover edits it.
 *
 * For an all-day event `start` and `end` are local midnights and `end` is the last day it
 * covers, so a one-day event has `end` equal to `start`. For a timed event they are the two
 * instants.
 */
export interface EventTimes {
  allDay: boolean;
  start: Date;
  end: Date;
}

/** A date as Home Assistant stores an all-day bound. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The start of an ISO 8601 date-time, as Home Assistant stores a timed bound. */
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

//-----------------------------------------------------------------------------
// READING
//-----------------------------------------------------------------------------

/**
 * Local midnight of a `YYYY-MM-DD` date. Never `new Date('YYYY-MM-DD')`, which reads it as UTC
 * and lands on the previous day west of Greenwich.
 *
 * @param value - A date as Home Assistant stores an all-day bound
 * @returns Local midnight on that date, or undefined when it is not a date
 */
export function parseDate(value: string): Date | undefined {
  const match = DATE_ONLY.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The same local date shifted by whole days, as calendar days rather than 24-hour spans, so a
 * day with a clock change counts once.
 *
 * @param date - A date
 * @param days - Days to add, negative to go back
 * @returns The shifted copy
 */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * An event's span from what Home Assistant stores.
 *
 * @param dtstart - Stored start: a date, or a date-time with its offset
 * @param dtend - Stored end, of the same kind
 * @returns The span as the popover edits it, or undefined when either bound cannot be read
 */
export function timesFromEntry(dtstart: string, dtend: string): EventTimes | undefined {
  const allDay = DATE_ONLY.test(dtstart);
  if (allDay) {
    const start = parseDate(dtstart);
    const after = parseDate(dtend);
    if (!start) return undefined;
    const last = after ? addDays(after, -1) : start;
    return { allDay, start, end: last < start ? start : last };
  }

  if (!DATE_TIME.test(dtstart)) return undefined;
  const start = new Date(dtstart);
  const end = new Date(dtend);
  if (Number.isNaN(start.getTime())) return undefined;
  return { allDay, start, end: Number.isNaN(end.getTime()) ? new Date(start) : end };
}

//-----------------------------------------------------------------------------
// WRITING
//-----------------------------------------------------------------------------

/**
 * `YYYY-MM-DD` for a date's local calendar day.
 *
 * @param date - A date
 * @returns The local date, as a date input and Home Assistant both take it
 */
export function dateValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * `HH:mm` for a date's local time of day, as a time input takes it.
 *
 * @param date - A date
 * @returns The local time
 */
export function timeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The span as Home Assistant's write commands take it: two dates for an all-day event, the
 * end the day after the last day, or two UTC date-times, to the second.
 *
 * @param times - The span as the popover edits it
 * @returns `dtstart` and `dtend`
 */
export function writeTimes(times: EventTimes): { dtstart: string; dtend: string } {
  if (times.allDay) {
    return { dtstart: dateValue(times.start), dtend: dateValue(addDays(times.end, 1)) };
  }
  const utc = (date: Date) => `${date.toISOString().slice(0, 19)}Z`;
  return { dtstart: utc(times.start), dtend: utc(times.end) };
}

//-----------------------------------------------------------------------------
// EDITING
//-----------------------------------------------------------------------------

/**
 * A date with its local calendar day replaced, keeping its time of day.
 *
 * @param date - The date to change
 * @param value - The new day, `YYYY-MM-DD`
 * @returns The changed copy, or undefined when the value is not a date
 */
export function withDate(date: Date, value: string): Date | undefined {
  const day = parseDate(value);
  if (!day) return undefined;
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    date.getHours(),
    date.getMinutes(),
  );
}

/**
 * A date with its local time of day replaced, keeping its day.
 *
 * Built from the parts, so a time a clock change skips lands on the first one that exists.
 *
 * @param date - The date to change
 * @param value - The new time, `HH:mm`
 * @returns The changed copy, or undefined when the value is not a time
 */
export function withTime(date: Date, value: string): Date | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

/**
 * The span with a new start, keeping its length, as calendars do: moving a meeting moves its
 * end with it. An all-day event keeps its number of days.
 *
 * @param times - The span
 * @param start - The new start
 * @returns The moved span
 */
export function moveStart(times: EventTimes, start: Date): EventTimes {
  if (times.allDay) {
    const days = Math.round(
      (Date.UTC(times.end.getFullYear(), times.end.getMonth(), times.end.getDate()) -
        Date.UTC(times.start.getFullYear(), times.start.getMonth(), times.start.getDate())) /
        86400000,
    );
    return { allDay: true, start, end: addDays(start, days) };
  }
  return {
    allDay: false,
    start,
    end: new Date(start.getTime() + (times.end.getTime() - times.start.getTime())),
  };
}

/**
 * The span switched to or from all day.
 *
 * To all day, it covers the days its times touched; an end at midnight belongs to the day
 * before. From all day, it starts on its first day at `hour` and lasts an hour.
 *
 * @param times - The span
 * @param allDay - Whether it is to be all day
 * @param hour - The hour a timed event starts at, when switching from all day
 * @returns The switched span
 */
export function setAllDay(times: EventTimes, allDay: boolean, hour: number): EventTimes {
  if (allDay === times.allDay) return times;
  if (allDay) {
    const startDay = new Date(
      times.start.getFullYear(),
      times.start.getMonth(),
      times.start.getDate(),
    );
    const endAtMidnight =
      times.end.getHours() === 0 && times.end.getMinutes() === 0 && times.end > times.start;
    const endSource = endAtMidnight ? new Date(times.end.getTime() - 1) : times.end;
    const endDay = new Date(endSource.getFullYear(), endSource.getMonth(), endSource.getDate());
    return { allDay: true, start: startDay, end: endDay < startDay ? startDay : endDay };
  }
  const start = new Date(
    times.start.getFullYear(),
    times.start.getMonth(),
    times.start.getDate(),
    hour,
  );
  return { allDay: false, start, end: new Date(start.getTime() + 3600000) };
}

/**
 * Whether Home Assistant would accept the span: a timed event must end after it starts, and an
 * all-day event may not end before its first day.
 *
 * @param times - The span
 * @returns Whether it is valid
 */
export function validTimes(times: EventTimes): boolean {
  if (Number.isNaN(times.start.getTime()) || Number.isNaN(times.end.getTime())) return false;
  return times.allDay ? times.end >= times.start : times.end > times.start;
}

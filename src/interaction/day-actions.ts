/**
 * What a tap on a day runs, and the tapped day's fields it can use.
 *
 * `day_tap_action` takes `add-event`, which opens a new event on the day in the card's popover,
 * or any of Home Assistant's own actions, which the card hands to Home Assistant with the day's
 * fields filled into it: `data: { date: '{date}' }`. No side effects here; `calendar-card-pro.ts`
 * runs the result.
 *
 * Every field is a date, a date and time, or `true` or `false`, computed by the card from where
 * the press landed. None is text anyone else wrote, so each fills anywhere in the action, as an
 * event's times do (`event-actions.ts`).
 */

import { actionFiller } from './action-fill';
import { newEventTimesOn } from './add-event';
import { eventActionKind } from './event-action-kind';
import { addDays, dateValue } from './event-times';
import { ADD_EVENT_ACTION } from '../config/constants';
import * as Types from '../config/types';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * The fields a day action can name, as `{date}` and so on, written as an event action's are.
 *
 * `date` is the day tapped. `start` and `end` are the span `add-event` would open with there: in
 * a grid's time area, the quarter hour tapped and an hour after it, ISO 8601 with their offset;
 * anywhere else the whole day, as an all-day event's dates, the end the day after. `all_day` says
 * which.
 */
export const DAY_FIELDS = ['date', 'start', 'end', 'all_day'] as const;

/** One field a day action can name. */
export type DayField = (typeof DAY_FIELDS)[number];

/** No day field is anyone's text, so every one fills anywhere. */
const NO_FREE_TEXT: ReadonlySet<DayField> = new Set();

//-----------------------------------------------------------------------------
// KIND
//-----------------------------------------------------------------------------

/**
 * What a day action amounts to: add an event on the day, hand an action to Home Assistant, or
 * nothing, which leaves the tap to the card's own action.
 */
export type DayActionKind = 'add' | 'forward' | 'none';

/**
 * What a day action amounts to.
 *
 * `add-event` adds. `none`, a missing or bare action, the card's other own actions (`expand`,
 * `refresh`, `reset`, `overlay`, `back`) and an event's `details` are nothing on a day, as they
 * are on an event (`eventActionKind`). Every other action is Home Assistant's, including ones it
 * adds after this was written.
 *
 * @param action - `day_tap_action`, as configured
 * @returns What the action amounts to
 */
export function dayActionKind(action: Types.ActionConfig | null | undefined): DayActionKind {
  if (action?.action === ADD_EVENT_ACTION) return 'add';
  return eventActionKind(action) === 'forward' ? 'forward' : 'none';
}

//-----------------------------------------------------------------------------
// FIELDS
//-----------------------------------------------------------------------------

/**
 * A moment in ISO 8601 with the browser zone's offset at that moment, as a calendar writes a
 * timed event's start: `2026-12-01T10:00:00+01:00`.
 *
 * @param date - A moment
 * @returns The local date and time, to the second, with its offset
 */
function localIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return (
    `${dateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/**
 * The tapped day's fields, as a day action names them.
 *
 * The span is the one `add-event` would open with at the same place (`newEventTimesOn`), so the
 * two always agree: a quarter hour in a grid's time area, set as a wall-clock time on that day,
 * an hour long; the whole day anywhere else.
 *
 * @param timestamp - The day, as any moment of it
 * @param minute - The quarter hour tapped in a grid's time area, in minutes from midnight, or
 *   undefined anywhere else
 * @returns Every field, each a string
 */
export function dayFields(timestamp: number, minute?: number): Record<DayField, string> {
  const times = newEventTimesOn(timestamp, minute ?? 'all-day');
  if (times.allDay) {
    return {
      date: dateValue(times.start),
      start: dateValue(times.start),
      end: dateValue(addDays(times.start, 1)),
      all_day: 'true',
    };
  }
  return {
    date: dateValue(times.start),
    start: localIso(times.start),
    end: localIso(times.end),
    all_day: 'false',
  };
}

//-----------------------------------------------------------------------------
// FILLING
//-----------------------------------------------------------------------------

/** Fills a day's fields into an action; see `actionFiller` for the rules. */
const fillDay = actionFiller(DAY_FIELDS, NO_FREE_TEXT);

/**
 * A day action with the tapped day's fields filled in, for Home Assistant to run, or undefined
 * when it must not run: a `url` action whose filled address would open other than over http or
 * https. A field fills anywhere but the name of the action, percent-encoded in `url_path` and
 * `navigation_path`.
 *
 * @param action - `day_tap_action`, one Home Assistant runs
 * @param fields - The tapped day's fields
 * @returns The action to run, or undefined when it must not run
 */
export function fillDayAction(
  action: Types.ActionConfig,
  fields: Record<DayField, string>,
): Types.ActionConfig | undefined {
  return fillDay(action, fields);
}

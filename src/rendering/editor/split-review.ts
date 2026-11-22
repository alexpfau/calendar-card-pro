/**
 * Split This Calendar's review: which of an entry's upcoming events the card shows in the layout
 * displayed, and the part each of them lands in once the entry is split.
 *
 * DOM-free. The window and the per-entry eligibility are the card's own, mirrored from
 * `events.ts` rather than imported, because importing the card's filter would carry most of its
 * event module into the editor. The card's small utilities are reused as they are: the start
 * date grammar, `resolveEffectiveConfig` and a few `format.ts` helpers. What keeps the mirror
 * honest is `tests/editor-split-review.dst.test.ts`, which runs the card's `processEvents` and
 * `groupEventsByDay` beside it in four time zones and fails where the two name a different
 * event or a different first day.
 *
 * Filters that act on the card's whole list (Filter Duplicates against other calendars, a
 * card-wide compact budget, Skip First Events) act alike before and after a split, events sharing
 * a start included, because the card draws a calendar listed more than once in the order it sent
 * its events, whichever entry kept them (`events.ts` › `groupEventsByDay`); so they are not
 * applied. The one exception is Filter Duplicates over two events of this calendar alike but for
 * the field a split by words reads, where the split keeps the worded copy, drawn where the first
 * arrived. An entry with its own
 * compact budget is refused (`split.ts` › `refusals`).
 */

import * as Days from './calendar-days';
import { asEntityConfig } from './entities';
import { lookup } from './localize';
import { effectiveEventType, filterFieldOf } from './split';
import { interpolate } from './strings';
import { compiles } from './word-lists';
import * as Config from '../../config/config';
import type * as Types from '../../config/types';
import {
  multidaySplitPolicy,
  resolveEffectiveConfig,
  resolveTimeGridOption,
} from '../../config/view';
import { intlLocales } from '../../translations/intl-locales';
import { parseStartDateExpression } from '../../utils/start-date';
import { readStartWindow, startsInWindow } from '../../utils/start-window';

/** How long the review waits for Home Assistant before showing each part's rule alone. */
export const READ_TIMEOUT = 15000;

/** The events a part's card lists, at most; the rest are counted. */
const LISTED = 4;

/** The window the card draws in the layout displayed. */
export interface ReviewWindow {
  /** The card's configuration, resolved for that layout. */
  readonly config: Types.Config;
  /** Its first day, at local midnight. */
  readonly start: Date;
  /** The local midnight after its last day. */
  readonly end: Date;
}

/** One part's card in the review. */
export interface ReviewPart {
  /** How many of the entry's shown events land in it. */
  readonly count: number;
  /** Up to four of them, as "Tue 27 · 16:00 · Dentist", then "+3" for the rest. */
  readonly lines: ReadonlyArray<string>;
}

type Entry = string | Types.EntityConfig;

const day = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * The first day of the window, as `events.ts` › `getTimeWindow` resolves `start_date`: none is
 * today; then a relative expression, an ISO date-time or a fixed `YYYY-MM-DD`; anything
 * impossible or unreadable falls back to today.
 *
 * @param startDate - The configured `start_date`
 * @param firstDay - The resolved first day of the week
 * @param now - The moment it is resolved against
 * @returns The first day, at local midnight
 */
function windowStart(startDate: unknown, firstDay: number, now: Date): Date {
  const text = startDate === undefined || startDate === null ? '' : String(startDate).trim();
  let start = day(now);
  if (text !== '') {
    try {
      const parsed = parseStartDateExpression(text, firstDay, now);
      if (parsed.kind === 'ok') {
        if (!isNaN(parsed.date.getTime())) start = parsed.date;
      } else if (parsed.kind === 'nomatch' && text.includes('T')) {
        const iso = new Date(text);
        if (!isNaN(iso.getTime())) start = iso;
      } else if (parsed.kind === 'nomatch') {
        const [year, month, date] = text.split('-').map(Number);
        const fixed = new Date(year, month - 1, date);
        if (
          year &&
          month >= 1 &&
          month <= 12 &&
          date >= 1 &&
          date <= 31 &&
          fixed.getFullYear() === year &&
          fixed.getMonth() === month - 1 &&
          fixed.getDate() === date
        ) {
          start = fixed;
        }
      }
    } catch {
      start = day(now);
    }
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * The card's window for the layout displayed: that layout's configuration
 * (`resolveEffectiveConfig`), its first day of the week as the card resolves it, the start from
 * `start_date` in every form the card accepts, and the end that layout's `days_to_show` later
 * (`groupEventsByDay`'s `windowEnd`).
 *
 * @param raw - The card's configuration
 * @param view - The layout displayed
 * @param hass - Home Assistant, whose locale `first_day_of_week: system` follows
 * @param now - The moment it is resolved against
 * @returns The window
 */
export function reviewWindow(
  raw: Types.Config,
  view: Types.EffectiveView,
  hass: Days.Home | undefined,
  now: Date = new Date(),
): ReviewWindow {
  const config = resolveEffectiveConfig(Config.normalizeNumericOptions({ ...raw }), view);
  const start = windowStart(
    config.start_date,
    Days.firstDayOfWeek(config.first_day_of_week, hass?.locale),
    now,
  );
  // Stepped as the card steps it, keeping the hour where a day has no midnight.
  const end = new Date(start);
  end.setDate(end.getDate() + config.days_to_show);
  return { config, start, end };
}

/**
 * Whether an entry keeps an event, by its event type, the hours its timed events start in and its
 * word lists, as `filterEventsForEntity` decides it: a list the card cannot compile is skipped,
 * and the hours are read by the card's own rule (`utils/start-window.ts`).
 *
 * @param event - The event as Home Assistant sent it
 * @param entry - The entry
 * @param card - The card's configuration
 * @returns True where the entry keeps it
 */
export function entryKeeps(
  event: Types.CalendarEventData,
  entry: Entry,
  card: Readonly<Types.Config>,
): boolean {
  const own = asEntityConfig(entry);
  const type = effectiveEventType(own, card);
  if (type !== 'all' && !event.start.dateTime !== (type === 'all_day')) return false;
  const hours = readStartWindow(own.starts_after, own.starts_before).window;
  if (hours && event.start.dateTime && !startsInWindow(new Date(event.start.dateTime), hours)) {
    return false;
  }
  const field = filterFieldOf(own.filter_field);
  const subject =
    field === 'location'
      ? event.location
      : field === 'description'
        ? event.description
        : event.summary;
  for (const [list, keep] of [
    [own.allowlist, true],
    [own.blocklist, false],
  ] as const) {
    if (!list || !compiles(String(list))) continue;
    const matches = Boolean(subject && new RegExp(String(list), 'i').test(subject));
    if (matches !== keep) return false;
  }
  return true;
}

/**
 * The event as `keepWellFormedEvents` keeps it, or null where the card drops it: a timed event
 * with an end missing or before its start drawn at its start.
 *
 * @param event - The event as Home Assistant sent it
 * @returns The event the card works with
 */
function wellFormed(event: Types.CalendarEventData): Types.CalendarEventData | null {
  if (!event || typeof event.start !== 'object' || event.start === null) return null;
  const end = event.end as Types.CalendarEventData['end'] | null | undefined;
  if (end != null && typeof end !== 'object') return null;
  const texts = [
    event.start.date,
    event.start.dateTime,
    end?.date,
    end?.dateTime,
    event.summary,
    event.location,
    event.description,
  ];
  if (texts.some((value) => value != null && typeof value !== 'string')) return null;
  if (event.start.dateTime) {
    const startMs = Date.parse(event.start.dateTime);
    if (event.start.date || end?.date || !Number.isFinite(startMs)) return null;
    if (end?.dateTime) {
      const endMs = Date.parse(end.dateTime);
      if (!Number.isFinite(endMs)) return null;
      if (endMs >= startMs) return event;
    }
    return { ...event, end: { dateTime: event.start.dateTime } };
  }
  if (!end || end.dateTime) return null;
  const valid = [event.start.date, end.date].every(
    (value) => typeof value === 'string' && Days.dateKey(Days.parseDate(value)) === value,
  );
  return valid && end.date! > event.start.date! ? event : null;
}

/**
 * A row as the card draws it: the event's own, or one day of it.
 */
interface Row {
  readonly start: Types.CalendarEventData['start'];
  readonly end: Types.CalendarEventData['end'];
  /** The middle or last day of a timed event split across days in a list. */
  readonly fromTimed?: boolean;
  /** Grid's: the event as Home Assistant sent it, for the past rule of a banner or all-day row. */
  readonly source?: Pick<Types.CalendarEventData, 'start' | 'end'>;
  readonly banner?: boolean;
}

/**
 * The rows a list or column draws for an event (`processMultiDayEvents`): one, or one per day
 * where the entry's or the card's `split_multiday_events` splits it.
 *
 * @param event - A well-formed event
 * @param split - Whether it is split across days
 * @returns The rows
 */
function listRows(event: Types.CalendarEventData, split: boolean): Row[] {
  const { start, end } = event;
  if (!split) return [{ start, end }];
  if (start.date && end.date) {
    const first = Days.parseDate(start.date);
    const last = Days.parseDate(end.date);
    last.setDate(last.getDate() - 1);
    if (first.toDateString() === last.toDateString()) return [{ start, end }];
    const lastKey = Days.dateKey(last);
    const rows: Row[] = [];
    for (
      let date = new Date(first);
      Days.dateKey(date) <= lastKey;
      date.setDate(date.getDate() + 1)
    ) {
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      rows.push({
        start: { date: Days.dateKey(date) },
        end: { date: Days.dateKey(next) },
      });
    }
    return rows;
  }
  const from = new Date(start.dateTime!);
  const to = new Date(end.dateTime!);
  if (from.toDateString() === to.toDateString()) return [{ start, end }];
  const firstEnd = new Date(from);
  firstEnd.setHours(23, 59, 59, 999);
  if (new Date(firstEnd.getTime() + 1) >= to) return [{ start, end }];
  const rows: Row[] = [
    {
      start: { dateTime: from.toISOString() },
      end: { dateTime: firstEnd.toISOString() },
      fromTimed: true,
    },
  ];
  const middle = new Date(from);
  middle.setDate(middle.getDate() + 1);
  middle.setHours(0, 0, 0, 0);
  const lastStart = new Date(to);
  lastStart.setHours(0, 0, 0, 0);
  for (let date = new Date(middle); date < lastStart; date.setDate(date.getDate() + 1)) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    rows.push({
      start: { date: Days.dateKey(date) },
      end: { date: Days.dateKey(next) },
      fromTimed: true,
    });
  }
  if (to > lastStart) {
    rows.push({
      start: { dateTime: lastStart.toISOString() },
      end: { dateTime: to.toISOString() },
      fromTimed: true,
    });
  }
  return rows;
}

/**
 * The hours Grid draws (`grid.ts` › `resolveBand`), in minutes from midnight: its `start_time`
 * and `end_time`, both falling back to 07:00 and 22:00 where either cannot be read.
 *
 * @param config - The configuration, resolved for Grid
 * @returns The first minute and the minute after the last
 */
function gridBand(config: Types.Config): readonly [number, number] {
  const minutes = (value: unknown): number | null => {
    const shape = typeof value === 'string' ? /^(\d{2}):(\d{2})$/.exec(value) : null;
    if (!shape || Number(shape[2]) > 59) return null;
    const hours = Number(shape[1]);
    if (hours === 24) return shape[2] === '00' ? 1440 : null;
    return hours < 24 ? hours * 60 + Number(shape[2]) : null;
  };
  const from = minutes(resolveTimeGridOption(config, 'start_time'));
  const to = minutes(resolveTimeGridOption(config, 'end_time'));
  return from === null || to === null || from >= to ? [420, 1320] : [from, to];
}

/**
 * Whether one day of a timed event reaches into the hours Grid draws, by Grid's own measure
 * (`grid.ts` › `segmentMinutes` and `intersectsBand`, as `search.ts` › `drawnIn` applies them):
 * a day carried over from the one before starts at the top of its column, and a day running to
 * midnight ends at its foot.
 *
 * @param from - The day's start
 * @param to - Its end
 * @param startsEvent - Whether the event starts on it
 * @param band - The hours drawn
 * @returns True where the day is drawn
 */
function inBand(
  from: Date,
  to: Date,
  startsEvent: boolean,
  band: readonly [number, number],
): boolean {
  const ofDay = (date: Date): number =>
    date.getHours() * 60 +
    date.getMinutes() +
    date.getSeconds() / 60 +
    date.getMilliseconds() / 60000;
  const startMin = !startsEvent && from.getTime() === day(from).getTime() ? 0 : ofDay(from);
  let endMin = day(to).getTime() > day(from).getTime() ? 1440 : ofDay(to);
  if (
    Math.floor(endMin) <= Math.floor(startMin) &&
    to.getTimezoneOffset() > from.getTimezoneOffset()
  ) {
    endMin = startMin + (to.getTime() - from.getTime()) / 60000;
  }
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin < startMin) return false;
  return endMin === startMin
    ? startMin >= band[0] && startMin < band[1]
    : endMin > band[0] && startMin < band[1];
}

/**
 * The rows Grid draws for an event (`grid.ts` › `splitGridEventByDay`): one per day inside the
 * window, timed days staying timed, and a timed event a full day or longer drawn as a banner
 * where the entry's or the card's `multiday_banners` is on. A timed day that is no banner is
 * drawn only where it reaches into the hours Grid shows.
 *
 * @param event - A well-formed event
 * @param window - The window
 * @param banners - The entry's `multiday_banners`, else the card's
 * @returns The rows
 */
function gridRows(event: Types.CalendarEventData, window: ReviewWindow, banners: unknown): Row[] {
  const source = { start: event.start, end: event.end };
  const rows: Row[] = [];
  if (event.start.dateTime) {
    const banner = banners === true && Days.spansFullDays(event.start, event.end);
    const band = gridBand(window.config);
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime!);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];
    if (end.getTime() === start.getTime()) {
      return start >= window.start &&
        start < window.end &&
        (banner || inBand(start, end, true, band))
        ? [
            {
              start: { dateTime: start.toISOString() },
              end: { dateTime: end.toISOString() },
              source,
              banner,
            },
          ]
        : [];
    }
    const last = end > window.end ? window.end : end;
    for (
      let date = day(start < window.start ? window.start : start);
      date < last && date < window.end;
      date = addDays(date, 1)
    ) {
      const next = addDays(date, 1);
      const from = start > date ? start : date;
      const to = end < next ? end : next;
      if (to <= from || (!banner && !inBand(from, to, from.getTime() === start.getTime(), band))) {
        continue;
      }
      rows.push({
        start: { dateTime: from.toISOString() },
        end: { dateTime: to.toISOString() },
        source,
        banner,
      });
    }
    return rows;
  }
  const first = Days.parseDate(event.start.date!);
  const end = Days.parseDate(event.end.date!);
  for (
    let date = first < window.start ? day(window.start) : first;
    date < end && date < window.end;
    date = addDays(date, 1)
  ) {
    rows.push({
      start: { date: Days.dateKey(date) },
      end: { date: Days.dateKey(addDays(date, 1)) },
      source,
    });
  }
  return rows;
}

/**
 * The instant an all-day row stops being upcoming (`events.ts` › `allDayExpiryInstant`): the
 * entry's `allday_expires_at` on its last day, else midnight after it.
 *
 * @param last - Its last day, at local midnight
 * @param configured - The entry's `allday_expires_at`
 * @returns The instant
 */
function expiry(last: Date, configured: unknown): Date {
  const match =
    typeof configured === 'string'
      ? /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(configured.trim())
      : null;
  const at = new Date(last);
  if (match && Number(match[1]) <= 23) {
    at.setHours(Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : 0, 0);
  } else {
    at.setDate(at.getDate() + 1);
    at.setHours(0, 0, 0, 0);
  }
  return at;
}

/**
 * The first row the card draws for an event under one entry, and the day it lands on.
 *
 * @param event - The event as Home Assistant sent it
 * @param entry - The entry
 * @param window - The window
 * @param view - The layout displayed
 * @param hass - Home Assistant, whose country or language says which days are the weekend
 * @param now - The moment past events are judged at
 * @returns The day and the row, or undefined where the card draws none
 */
function firstShown(
  event: Types.CalendarEventData,
  entry: Entry,
  window: ReviewWindow,
  view: Types.EffectiveView,
  hass: Days.Home | null | undefined,
  now: Date,
): { readonly day: Date; readonly row: Row } | undefined {
  const config = window.config;
  const own = asEntityConfig(entry);
  const kept = wellFormed(event);
  if (kept === null || !entryKeeps(kept, entry, config)) return undefined;
  const rows =
    multidaySplitPolicy(view) === 'never'
      ? gridRows(kept, window, own.multiday_banners ?? config.multiday_banners)
      : listRows(
          kept,
          Boolean(
            own.split_multiday_events !== undefined
              ? own.split_multiday_events
              : config.split_multiday_events,
          ),
        );
  const referenceEnd = new Date(window.start);
  referenceEnd.setHours(23, 59, 59, 999);
  const weekdays =
    own.days_of_week === 'weekdays' || own.days_of_week === 'weekends'
      ? own.days_of_week
      : undefined;
  for (const row of rows) {
    const allDay = !row.start.dateTime;
    let start: Date;
    let end: Date;
    if (allDay) {
      start = Days.parseDate(row.start.date!);
      end = addDaysKeepingHour(Days.parseDate(row.end.date!), -1);
    } else {
      start = new Date(row.start.dateTime!);
      end = new Date(row.end.dateTime!);
    }
    if (start >= window.end) continue;
    const onTheDay = start >= window.start && start <= referenceEnd;
    if (!(onTheDay || start > referenceEnd || end >= window.start)) continue;
    if (!config.show_past_events) {
      const pastAt =
        row.banner && row.source?.end.dateTime ? new Date(row.source.end.dateTime) : end;
      if (!allDay && pastAt < now) continue;
      const last = row.source?.end.date ? addDays(Days.parseDate(row.source.end.date), -1) : end;
      if (allDay && now >= expiry(last, row.fromTimed ? undefined : own.allday_expires_at))
        continue;
    }
    // `resolveDisplayDate`: an event under way when the window opens lands on its first day.
    const shown =
      start >= window.start
        ? start
        : end.toDateString() === window.start.toDateString() || end > window.start
          ? window.start
          : start;
    if (weekdays && Days.isWeekend(shown, hass) !== (weekdays === 'weekends')) continue;
    return { day: day(shown), row };
  }
  return undefined;
}

/**
 * A date a number of days away, keeping its hour as `setDate` does.
 *
 * @param date - The date
 * @param days - How many days on
 * @returns The date
 */
function addDaysKeepingHour(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * The first day the card draws an event for one entry in the layout displayed, before a split:
 * the events `keepWellFormedEvents` keeps; the entry's event type and word lists; then, row by
 * row as that layout draws them, the window's bounds, the past rule while `show_past_events` is
 * off, and the entry's `days_of_week` over the row's day.
 *
 * @param event - The event as Home Assistant sent it
 * @param entry - The entry
 * @param window - The window (`reviewWindow`)
 * @param view - The layout displayed
 * @param hass - Home Assistant, whose country or language says which days are the weekend
 * @param now - The moment past events are judged at
 * @returns The day, at local midnight, or null where the card draws the event on none
 */
export function shownOn(
  event: Types.CalendarEventData,
  entry: Entry,
  window: ReviewWindow,
  view: Types.EffectiveView,
  hass: Days.Home | null | undefined,
  now: Date = new Date(),
): Date | null {
  return firstShown(event, entry, window, view, hass, now)?.day ?? null;
}

/**
 * Reads one calendar's events for the window through the REST path the card itself uses
 * (`events.ts` › `fetchEvents`), giving up after `READ_TIMEOUT`.
 *
 * @param hass - Home Assistant
 * @param entityId - The calendar
 * @param window - The window
 * @returns Its events, tagged with the calendar; null where the read failed or timed out
 */
export async function readUpcoming(
  hass: Pick<Types.Hass, 'callApi'>,
  entityId: string,
  window: Pick<ReviewWindow, 'start' | 'end'>,
): Promise<Types.CalendarEventData[] | null> {
  const path = `calendars/${entityId}?start=${window.start.toISOString()}&end=${window.end.toISOString()}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const events = await Promise.race([
      hass.callApi('GET', path),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), READ_TIMEOUT);
      }),
    ]);
    return Array.isArray(events)
      ? (events as Types.CalendarEventData[]).map((event) => ({ ...event, _entityId: entityId }))
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Where the entry's shown events land: each in the first part that keeps it. Both parts keep
 * every other option of the entry, so an event the entry shows lands in exactly one of them.
 *
 * @param events - The calendar's events (`readUpcoming`)
 * @param original - The entry before the split
 * @param pair - The two parts (`split.ts` › `splitEntry`)
 * @param window - The window
 * @param view - The layout displayed
 * @param hass - Home Assistant: its weekend, and its 12- or 24-hour clock
 * @param language - The editor's language
 * @param now - The moment past events are judged at
 * @returns Each part's count and lines
 */
export function reviewParts(
  events: ReadonlyArray<Types.CalendarEventData>,
  original: Entry,
  pair: readonly [Types.EntityConfig, Types.EntityConfig],
  window: ReviewWindow,
  view: Types.EffectiveView,
  hass: Days.Home | null | undefined,
  language: string,
  now: Date = new Date(),
): readonly [ReviewPart, ReviewPart] {
  const config = window.config;
  const weekday = new Intl.DateTimeFormat(intlLocales(language), { weekday: 'short' });
  const shown = events
    .flatMap((event) => {
      const first = firstShown(event, original, window, view, hass, now);
      return first === undefined ? [] : [{ event, ...first }];
    })
    .sort(
      (a, b) =>
        a.day.getTime() - b.day.getTime() ||
        Number(Boolean(a.row.start.dateTime)) - Number(Boolean(b.row.start.dateTime)) ||
        Date.parse(a.row.start.dateTime ?? '') - Date.parse(b.row.start.dateTime ?? '') ||
        0,
    );
  const parts = pair.map((part) => shown.filter(({ event }) => entryKeeps(event, part, config)));
  // An event the first part keeps is the first part's, whatever the second would do.
  const second = parts[1].filter((each) => !parts[0].includes(each));
  return [parts[0], second].map((landed) => {
    const lines = landed.slice(0, LISTED).map(({ event, day: on, row }) => {
      const date = interpolate(lookup(language, 'split.review.day') ?? '{weekday} {day}', {
        weekday: weekday.format(on),
        day: String(on.getDate()),
      });
      const title = event.summary ?? '';
      return row.start.dateTime
        ? interpolate(lookup(language, 'split.review.event_time') ?? '{day} · {time} · {title}', {
            day: date,
            time: Days.formatTime(new Date(row.start.dateTime), config, hass),
            title,
          })
        : interpolate(lookup(language, 'split.review.event') ?? '{day} · {title}', {
            day: date,
            title,
          });
    });
    if (landed.length > LISTED) {
      lines.push(
        interpolate(lookup(language, 'split.review.more') ?? '+{count}', {
          count: String(landed.length - LISTED),
        }),
      );
    }
    return { count: landed.length, lines };
  }) as unknown as readonly [ReviewPart, ReviewPart];
}

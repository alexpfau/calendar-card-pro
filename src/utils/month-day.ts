/**
 * A month day as a list, and the state a narrow month keeps around it.
 *
 * One model of "this day's events" serves every place a month lists a day: the panel "+N more"
 * opens on a wide card, and the list under a narrow card's grid, whose capsules count from it
 * too. It groups the card's filtered source events, never the month grid's display copies, the
 * way List groups them, so its rows are List's rows: all-day events first, then timed ones by
 * start, a multi-day event as the part of it that day holds. It keeps List's per-event rules
 * (the calendar filter is applied before it, then each calendar's `days_of_week`, past events
 * as Month resolves `show_past_events`, an event drawn as a bar past only once all of it is, as
 * the bar is, duplicates) and drops the rules that shape a list as a
 * whole: skipped events, compact limits, latest first and empty days. Every multi-day event is
 * split, whatever `split_multiday_events` says on the card or a calendar, so the list of a day
 * holds exactly the events the grid draws across it.
 *
 * The narrow form and the selected day are decided here too, from numbers alone, so both are
 * tested without a layout engine.
 */

import * as EventUtils from './events';
import * as FormatUtils from './format';
import * as Paging from './paging';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';

//-----------------------------------------------------------------------------
// THE ROWS
//-----------------------------------------------------------------------------

/** The rows' configurations, made once per card configuration: the panel's, and the list's. */
const rowsConfigs = [
  new WeakMap<Types.Config, Types.Config>(),
  new WeakMap<Types.Config, Types.Config>(),
];

/**
 * The configuration a month's day rows are drawn with, in the panel "+N more" opens and under a
 * narrow month's weeks: Month's own, with each row's time beside its title whatever
 * `time_position` says, as a phone's day list sets it. A row is then a line shorter, so more of a
 * day fits where the list is short of room, and the times line up at the row's end.
 *
 * The list under a narrow month's weeks keeps every part of a row to one line besides: the title
 * beside its time, ending in "…" where it is too long, the time, the location, the description and
 * the forecast. So a row is as tall wherever it is drawn, and the card can fit the day's rows to the
 * list's room by measuring them once (`MonthListFit.fitMonthList`).
 *
 * The same object for the same configuration, so what compares a configuration by identity sees
 * one.
 *
 * @param config - Card configuration, resolved for month
 * @param oneLine - Whether every part of a row keeps to one line, as under a narrow month's weeks
 * @returns The configuration the rows are drawn with
 */
export function monthRowsConfig(config: Types.Config, oneLine = false): Types.Config {
  const cache = rowsConfigs[oneLine ? 1 : 0];
  const known = cache.get(config);
  if (known) return known;
  const rows: Types.Config = oneLine
    ? {
        ...config,
        time_position: 'title',
        // Scrolling keeps a title to one line already, and wins over the limit.
        title_max_lines: config.scroll_long_titles ? config.title_max_lines : 1,
        time_max_lines: 1,
        location_max_lines: 1,
        description_max_lines: 1,
        weather: {
          ...config.weather,
          event: { ...config.weather?.event, max_lines: 1 },
        } as Types.Config['weather'],
      }
    : { ...config, time_position: 'title' };
  cache.set(config, rows);
  cache.set(rows, rows);
  return rows;
}

//-----------------------------------------------------------------------------
// THE DAY MODEL
//-----------------------------------------------------------------------------

/**
 * The configuration a month's days are listed with: Month's own, with List's whole-list
 * policies off and a window of the days asked for.
 *
 * Resolved for month already, so the `list:` block, which grouping as List would otherwise
 * apply over it, is dropped.
 *
 * @param config - Card configuration, resolved for month
 * @param start - The first day listed, at local midnight
 * @param days - How many days from there
 * @returns The configuration to group with
 */
export function dayListConfig(config: Types.Config, start: Date, days: number): Types.Config {
  return {
    ...config,
    start_date: FormatUtils.getLocalDateKey(start),
    days_to_show: days,
    compact_days_to_show: undefined,
    compact_events_to_show: undefined,
    compact_events_complete_days: false,
    event_order: 'earliest_first',
    skip_first_events: undefined,
    show_empty_days: false,
    show_empty_today: false,
    split_multiday_events: true,
    list: undefined,
  };
}

/**
 * An event as the day list groups it: split across its days whatever its calendar says
 * (`split_multiday_events` on an entry wins over the card's in List's splitter), and without its
 * description whatever its calendar says, since a month leaves descriptions to the event's details
 * (`ViewConfig.MONTH_PINNED`). The list groups as List does, which pins nothing, so the month's
 * rule is applied here, as `groupEventsByDay` applies it for Month's own grouping
 * (`ViewConfig.isPinned`). A calendar's own `show_description: false` stays as it is, since it
 * draws nothing either way; the details show every description whatever it says.
 *
 * An event the month draws as a bar is marked to be past only as a whole (`_pastAsWhole`), as
 * the bar is, rather than a day at a time, as List's split days are.
 *
 * Only an event whose entry says otherwise, or that is a bar, is copied.
 *
 * @param event - A source event, matched to its entry
 * @param bar - Whether the month draws it as a bar across its days
 * @returns The event, or a copy whose entry splits it and draws no description
 */
function asMonthListsIt(event: Types.CalendarEventData, bar: boolean): Types.CalendarEventData {
  const marked = bar ? { ...event, _pastAsWhole: true } : event;
  const entry = event._matchedConfig;
  if (!entry || (entry.split_multiday_events !== false && entry.show_description !== true)) {
    return marked;
  }
  const { show_description: description, ...rest } = entry;
  return {
    ...marked,
    _matchedConfig: {
      ...rest,
      split_multiday_events: true,
      ...(description === false ? { show_description: false } : {}),
    },
  };
}

/**
 * The events of each of a run of days, as a month lists them.
 *
 * One grouping for the whole run. Since every multi-day event is split, no event is moved to
 * the run's first day, so each day holds the same events whether it is listed alone or among
 * others (`monthDayEvents`).
 *
 * @param events - The card's source events, without the calendars it does not show
 * @param config - Card configuration, resolved for month
 * @param start - The first day, at local midnight
 * @param days - How many days
 * @param language - Card language
 * @param hass - Home Assistant, whose locale and country decide the week and the weekend
 * @returns Each day's events, first day first: all-day ones, then timed ones by start
 */
export function monthDayLists(
  events: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
  start: Date,
  days: number,
  language: string,
  hass?: Pick<Types.Hass, 'config' | 'locale'> | null,
): Types.CalendarEventData[][] {
  if (days <= 0) return [];
  // Bars, as the month draws them: every all-day event, and the timed ones it draws as banners.
  const banners = EventUtils.resolveGridBanners(events, config);
  const grouped = EventUtils.groupEventsByDay(
    events.map((event) => asMonthListsIt(event, !event.start.dateTime || banners.has(event))),
    dayListConfig(config, start, days),
    // Expanded, so no compact limit applies whatever a calendar entry sets.
    true,
    language,
    'list',
    hass,
  );
  const byDay = new Map(
    grouped.map((day) => [
      FormatUtils.getLocalDateKey(new Date(day.timestamp)),
      day.events.filter((event) => !event._isEmptyDay),
    ]),
  );
  return Array.from(
    { length: days },
    (_, index) => byDay.get(FormatUtils.getLocalDateKey(Paging.addDays(start, index))) ?? [],
  );
}

/**
 * One day's events, as a month lists them: the day panel's and the narrow day list's rows.
 *
 * @param events - The card's source events, without the calendars it does not show
 * @param config - Card configuration, resolved for month
 * @param day - The day, at local midnight
 * @param language - Card language
 * @param hass - Home Assistant, whose locale and country decide the week and the weekend
 * @returns Its events: all-day ones, then timed ones by start
 */
export function monthDayEvents(
  events: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
  day: Date,
  language: string,
  hass?: Pick<Types.Hass, 'config' | 'locale'> | null,
): Types.CalendarEventData[] {
  return monthDayLists(events, config, Paging.startOfDay(day), 1, language, hass)[0];
}

//-----------------------------------------------------------------------------
// THE NARROW FORM
//-----------------------------------------------------------------------------

/**
 * How wide a month's day is on a card this wide: what the card's border and padding leave, less
 * the week numbers' gutter where they are drawn, in seven. The gutter is the narrow form's in
 * either form, so the answer depends on the card and its configuration alone.
 *
 * @param cardWidth - The card's width, in CSS pixels
 * @param weekNumbers - Whether week numbers are drawn
 * @returns A day's width, in CSS pixels
 */
export function monthDayWidth(cardWidth: number, weekNumbers: boolean): number {
  const gutter = weekNumbers ? Constants.UI.MONTH_WEEK_GUTTER : 0;
  return (cardWidth - Constants.UI.TOOLBAR_ROW_INSET.month - gutter) / 7;
}

/**
 * Whether a month draws its narrow form: below `min_day_width` a day, and once narrow, until
 * a day is `MONTH_NARROW_HYSTERESIS` wider than that, so a card resting at the threshold keeps
 * one form.
 *
 * @param dayWidth - A day's width (`monthDayWidth`)
 * @param minDayWidth - `month → min_day_width`
 * @param wasNarrow - Whether the month is narrow now
 * @returns True for the narrow form
 */
export function monthNarrowAt(dayWidth: number, minDayWidth: number, wasNarrow: boolean): boolean {
  const band = wasNarrow ? Constants.UI.MONTH_NARROW_HYSTERESIS : 0;
  return dayWidth < minDayWidth + band;
}

//-----------------------------------------------------------------------------
// THE SELECTED DAY
//-----------------------------------------------------------------------------

/** A selection that stands for today, whichever day that is when it is read. */
export const SELECTED_TODAY = 'today';

/**
 * A day someone selected on a narrow month: the page it was selected on, and the day, or
 * `SELECTED_TODAY` where it was today, so it follows today past midnight.
 */
export interface MonthSelection {
  readonly page: string | null;
  readonly day: string;
}

/**
 * The day a month page selects by itself: today where it falls in the month the header names,
 * else that month's first day. Under `month → start: week`, whose page is no calendar month, today
 * where the page holds it, else the page's first day.
 *
 * @param rowsStart - The page's first row's first day
 * @param now - The current moment
 * @param rollingDays - The page's days under `start: week`, or undefined for a calendar month
 * @returns The day, at local midnight
 */
export function defaultMonthDay(
  rowsStart: Date,
  now: Date = new Date(),
  rollingDays?: number,
): Date {
  const today = Paging.startOfDay(now);
  if (rollingDays !== undefined) {
    return Paging.rangeContains({ start: rowsStart, days: rollingDays }, today)
      ? today
      : Paging.startOfDay(rowsStart);
  }
  const month = Paging.majorityMonth({ start: rowsStart, days: ViewConfig.MONTH_DAYS });
  return today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()
    ? today
    : month;
}

/**
 * The day selected on a page, while the selection is that page's and one of its days.
 *
 * @param selection - The day selected, if any
 * @param page - The page shown, or null for home
 * @param rowsStart - Its first row's first day
 * @param now - The current moment
 * @param days - The days the page draws (`ViewConfig.monthPageDays`)
 * @returns The day, at local midnight, or null where nothing on the page is selected
 */
export function selectionOnPage(
  selection: MonthSelection | null,
  page: string | null,
  rowsStart: Date,
  now: Date = new Date(),
  days: number = ViewConfig.MONTH_DAYS,
): Date | null {
  if (!selection || selection.page !== page) return null;
  const day =
    selection.day === SELECTED_TODAY ? Paging.startOfDay(now) : Paging.pageStart(selection.day);
  const index = FormatUtils.getCalendarDayDiff(rowsStart, day);
  return index >= 0 && index < days ? day : null;
}

/**
 * The day a narrow month shows the list of: the one selected on this page while it is one of
 * the page's days, else the page's own, `defaultMonthDay` unless the card names another.
 *
 * @param selection - The day selected, if any
 * @param page - The page shown, or null for home
 * @param rowsStart - Its first row's first day
 * @param now - The current moment
 * @param own - The page's own day, as the card has it: home's under a fixed start date is that date
 * @param days - The days the page draws (`ViewConfig.monthPageDays`)
 * @returns The day, at local midnight
 */
export function selectedMonthDay(
  selection: MonthSelection | null,
  page: string | null,
  rowsStart: Date,
  now: Date = new Date(),
  own: Date = defaultMonthDay(rowsStart, now),
  days: number = ViewConfig.MONTH_DAYS,
): Date {
  return selectionOnPage(selection, page, rowsStart, now, days) ?? own;
}

/**
 * The selection a tap on a day makes: today as `SELECTED_TODAY`, which follows today past
 * midnight, any other day by its date.
 *
 * @param day - The day tapped, any moment of it
 * @param page - The page it was tapped on, or null for home
 * @param now - The current moment
 * @returns The selection
 */
export function monthSelectionOf(
  day: Date,
  page: string | null,
  now: Date = new Date(),
): MonthSelection {
  const key = FormatUtils.getLocalDateKey(day);
  return { page, day: key === FormatUtils.getLocalDateKey(now) ? SELECTED_TODAY : key };
}

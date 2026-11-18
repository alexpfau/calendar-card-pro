/**
 * Month view rendering for Calendar Card Pro: six week rows of seven days, the reference being
 * macOS Calendar's month.
 *
 * The other views share leaves and event presentation, and so does this one. A day's all-day
 * and multi-day events are Grid's banners, drawn across their days as bars (`renderBanner`),
 * and its timed events are one line each, a column row trimmed to its accent bar, its title and
 * its start time. Which line each takes, and which a day has no room for, is decided in
 * `utils/month-layout.ts`, from the number of lines that fit under a date: the card measures
 * that after a render (`MONTH_LINE_CAPACITY_DEFAULT` until it has) and hands it in, and a day
 * past it shows "+N more" on its last line.
 *
 * A row's height never depends on what is in it: `row_height`, which is folded to its default
 * where it is a percentage or a keyword, or under a fixed card `height` a sixth of what the
 * weekday names leave, and six `row_height`s where that height cannot be worked out. So the
 * capacity cannot feed back into the size it is measured from, and the card's height does not
 * change from page to page.
 *
 * Below `month → min_day_width` a day the card draws the compact form instead, as a phone's
 * calendar draws its month: each day its number and one capsule, a segment per event in its
 * calendar's color, and under the six weeks the selected day's events as List's rows, in as much
 * room on every day (`renderMonthDayList`). The same rows are what "+N more" opens, in a panel of
 * its own (`day-panel.ts`), so a day reads the same wherever it is listed.
 *
 * @see renderGridGroupedEvents in `grid.ts`, whose banner the bars are
 * @see renderColumnGroupedEvents in `column.ts`, whose row the lines trim
 * @see utils/month-day.ts, which lists a day and decides the compact form and the selected day
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Activation from './activation';
import { renderBanner } from './grid';
import * as Leaves from './leaves';
import * as Presentation from './presentation';
import { generateCustomPropertiesObject } from './styles';
import * as TextScale from './text-scale';
import { stopCardGesture } from './toolbar';
import { DEFAULT_CONFIG } from '../config/config';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import { intlCache, intlLocales, intlSpeaks } from '../translations/intl-locales';
import * as Localize from '../translations/localize';
import * as EntityColors from '../utils/entity-colors';
import * as EventUtils from '../utils/events';
import * as FormatUtils from '../utils/format';
import * as Grid from '../utils/grid';
import * as Helpers from '../utils/helpers';
import * as MonthDay from '../utils/month-day';
import * as MonthLayout from '../utils/month-layout';
import * as Paging from '../utils/paging';
import * as TextDirection from '../utils/text-direction';

/**
 * Lines a month day is laid out for before the card has measured how many fit under its date:
 * as many as the shipped `row_height` holds at the shipped text size.
 */
export const MONTH_LINE_CAPACITY_DEFAULT = 4;

/**
 * The class of the element the card reads the line pitch and the date line from: an empty box,
 * as wide as a line is tall and as tall as the date line, in the event font. See
 * `measureMonthCapacity`.
 */
export const MONTH_PROBE_CLASS = 'month-probe';

/** What the card hands a month beyond its days, for what it opens and how narrow it is. */
export interface MonthOptions {
  /**
   * Opens a day's panel from its "+N more", given the day and the button it opens beside.
   */
  readonly more?: (day: Date, button: HTMLElement) => void;
  /** Draws the compact form, with the selected day's list under the weeks. */
  readonly compact?: MonthCompact;
  /**
   * The day whose cell is the month's one tab stop (`tabindex="0"`), every other cell `-1`: the
   * keyboard's day, else the day selected, else today or the header month's 1st, as the card
   * decides (`_monthTabStop`). The header month's 1st where none is handed.
   */
  readonly focusDay?: Date;
  /**
   * The wheel's listener while `week_scroll` applies, bound to the weeks, which are then marked
   * `week-scroll` so they claim a vertical pan as well. Not passive, as it takes the wheel from
   * the page; bound only then, so a month without it costs a scroll nothing.
   */
  readonly weekScroll?: EventListenerObject & AddEventListenerOptions;
}

/** What a compact month draws besides its weeks. */
export interface MonthCompact {
  /** The day selected, at local midnight, whose list is drawn under the weeks. */
  readonly selected: Date;
  /** Each of the six weeks' 42 days' events, as the day model lists them (`monthDayLists`). */
  readonly dayLists: ReadonlyArray<ReadonlyArray<Types.CalendarEventData>>;
  /** Forecasts for the list's rows, as a list row shows them. */
  readonly weatherForecasts?: Types.WeatherForecasts;
  /** The list's header as a button that adds on its day, while a tap on a day adds. */
  readonly dayAdd?: Activation.DayAddButtons;
  /**
   * The events the list keeps room for on every day (`month → day_list_events`), past which it
   * lists one fewer and "+N more"; none kept, and every event listed, where 0 or absent.
   */
  readonly reserve?: number;
  /** Opens the day's panel from the list's "+N more", given the day and the button. */
  readonly more?: (day: Date, button: HTMLElement) => void;
}

/**
 * The class of the hidden row a reserved day list is measured from (`MonthDay.monthListProbe`),
 * drawn beside the list and outside it, so nothing that reads the list's rows finds it.
 */
export const MONTH_LIST_PROBE_CLASS = 'month-day-list-probe';

/** The custom property the card writes the measured row's height to, on the list. */
export const MONTH_LIST_ROW_PROPERTY = '--calendar-card-month-day-list-row';

//-----------------------------------------------------------------------------
// ROWS
//-----------------------------------------------------------------------------

/** One week row: its days and where its events go. */
interface MonthWeek {
  /** Local midnights of its seven days. */
  readonly starts: readonly Date[];
  /** Each day's grouped events, or none. */
  readonly days: ReadonlyArray<Types.EventsByDay | undefined>;
  readonly layout: MonthLayout.MonthWeekLayout;
}

/**
 * The six week rows of a month page, each laid out at a capacity.
 *
 * @param days - Grouped days, which hold only days with events
 * @param rowsStart - The first row's first day
 * @param capacity - Lines that fit under a date
 * @returns The rows, first first
 */
export function monthWeeks(
  days: ReadonlyArray<Types.EventsByDay>,
  rowsStart: Date,
  capacity: number,
): MonthWeek[] {
  const byDate = new Map(
    days.map((day) => [FormatUtils.getLocalDateKey(new Date(day.timestamp)), day]),
  );
  return Array.from({ length: ViewConfig.MONTH_ROWS }, (_, row) => {
    const starts = Array.from({ length: 7 }, (_, column) =>
      Paging.addDays(rowsStart, row * 7 + column),
    );
    const grouped = starts.map((start) => byDate.get(FormatUtils.getLocalDateKey(start)));
    return {
      starts,
      days: grouped,
      layout: MonthLayout.layoutMonthWeek(
        grouped.map((day) => day?.events ?? []),
        starts,
        capacity,
      ),
    };
  });
}

/**
 * Whether a wide month page draws an event a search rang (`_searchRing`) as a bar or a line of
 * its own, rather than only counting it in a "+N more": what decides whether the ring is drawn
 * in the weeks or in the day's panel.
 *
 * @param days - Grouped days, the rung event's copies marked
 * @param rowsStart - The first row's first day
 * @param capacity - Lines that fit under a date
 * @returns True where a rung event is drawn
 */
export function monthDrawsRing(
  days: ReadonlyArray<Types.EventsByDay>,
  rowsStart: Date,
  capacity: number,
): boolean {
  return monthWeeks(days, rowsStart, capacity).some((week) =>
    week.layout.placements.some(
      (placement) => placement.visible && placement.item.event._searchRing === true,
    ),
  );
}

//-----------------------------------------------------------------------------
// WORDS
//-----------------------------------------------------------------------------

const firstOfMonthFormats = intlCache<string, Intl.DateTimeFormat | null>();
const dayNameFormats = intlCache<string, Intl.DateTimeFormat>();
const fullDateFormats = intlCache<string, Intl.DateTimeFormat>();
const shorterTitleFormats = intlCache<string, ReadonlyArray<Intl.DateTimeFormat>>();
const pluralRules = intlCache<string, Intl.PluralRules | null>();
const weekdayFormats = intlCache<string, Intl.DateTimeFormat | null>();

/**
 * A weekday named in full, as a column's header is named for assistive technology: "Tuesday".
 * From `Intl`, since the card's own full names are written for the middle of a sentence; its
 * short name where the browser has no data for the language.
 *
 * @param date - A day of the column
 * @param language - Card language
 * @returns The name
 */
function weekdayName(date: Date, language: string): string {
  let format = weekdayFormats.get(language);
  if (format === undefined) {
    try {
      format = intlSpeaks(Intl.DateTimeFormat, language)
        ? new Intl.DateTimeFormat(intlLocales(language), { weekday: 'long' })
        : null;
    } catch {
      format = null;
    }
    weekdayFormats.set(language, format);
  }
  return format
    ? format.format(date)
    : Localize.getTranslations(language).daysOfWeek[date.getDay()];
}

/**
 * The parts of a month's first day as a cell names it, in the language's order: its number and
 * its short month, "Dec 1", "1 Dec", "1. Dez.". The number is marked, so today's tile can sit
 * behind it alone. From the card's own month names where the browser has no data for the
 * language.
 *
 * @param date - The 1st of a month
 * @param language - Card language
 * @param translations - Its strings
 * @returns The parts, in order
 */
function firstOfMonthParts(
  date: Date,
  language: string,
  translations: Types.Translations,
): Array<{ day: boolean; text: string }> {
  let format = firstOfMonthFormats.get(language);
  if (format === undefined) {
    try {
      format = intlSpeaks(Intl.DateTimeFormat, language)
        ? new Intl.DateTimeFormat(intlLocales(language), { day: 'numeric', month: 'short' })
        : null;
    } catch {
      format = null;
    }
    firstOfMonthFormats.set(language, format);
  }
  if (!format) {
    return [
      { day: true, text: String(date.getDate()) },
      { day: false, text: ` ${translations.months[date.getMonth()]}` },
    ];
  }
  // The month and the literals around it are one part, so a space or a dot stays with its word.
  const parts: Array<{ day: boolean; text: string }> = [];
  for (const part of format.formatToParts(date)) {
    const day = part.type === 'day';
    const previous = parts[parts.length - 1];
    if (!day && previous && !previous.day) previous.text += part.value;
    else parts.push({ day, text: part.value });
  }
  return parts.filter((part) => part.text !== '');
}

/**
 * A day named in full, for what "+N more" is spoken as: "Wednesday, November 18".
 *
 * @param date - The day
 * @param language - Card language
 * @returns Its name
 */
function dayName(date: Date, language: string): string {
  let format = dayNameFormats.get(language);
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocales(language), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    dayNameFormats.set(language, format);
  }
  return format.format(date);
}

/**
 * How many events a day holds, in words: "5 events", "1 event", or the card's "No events".
 *
 * The language's own plural rules choose between the two forms, `eventCountOne` for the numbers
 * its "one" covers (1 in English, also 21 in Russian) and `eventCount` for the rest, so a
 * language whose other numbers need more forms than one writes a form that reads for all of
 * them. Where the browser has no rules for the language, "one" is 1 alone.
 *
 * @param count - Events the day holds
 * @param language - Card language
 * @returns The words
 */
export function eventCountText(count: number, language: string): string {
  const translations = Localize.getTranslations(language);
  if (count === 0) return translations.noEvents;
  let rules = pluralRules.get(language);
  if (rules === undefined) {
    try {
      rules = intlSpeaks(Intl.PluralRules, language)
        ? new Intl.PluralRules(intlLocales(language))
        : null;
    } catch {
      rules = null;
    }
    pluralRules.set(language, rules);
  }
  const one = rules ? rules.select(count) === 'one' : count === 1;
  return (one ? translations.eventCountOne : translations.eventCount).replace('{count}', () =>
    String(count),
  );
}

/**
 * A month day's cell as assistive technology names it: the day in full and what it holds,
 * "Tuesday, November 10, 2026, 5 events". Today is said by `aria-current`, and a compact form's
 * selection by `aria-selected`, so neither is in the name.
 *
 * @param date - The day
 * @param count - Events it holds
 * @param language - Card language
 * @returns The name
 */
export function monthCellName(date: Date, count: number, language: string): string {
  return `${monthDayTitle(date, language)}${Localize.getTranslations(language).separator}${eventCountText(count, language)}`;
}

/**
 * The id a wide month gives a bar, a line or a "+N more" drawn on a day, so the day's cell can
 * own it (`aria-owns`): by the day it starts on and its line, which no two items of a row share,
 * or `more` for the day's "+N more". Unique within the card's shadow root, where an `aria-owns`
 * reference resolves.
 *
 * @param date - The day it starts on
 * @param line - Its line under the date, from 0, or `more`
 * @returns The id
 */
export function monthItemId(date: Date, line: number | 'more'): string {
  return `month-item-${FormatUtils.getLocalDateKey(date)}-${line}`;
}

/**
 * A day named in full with its year, as a day's list is titled: "Wednesday, November 18, 2026".
 *
 * @param date - The day
 * @param language - Card language
 * @returns Its name
 */
export function monthDayTitle(date: Date, language: string): string {
  let format = fullDateFormats.get(language);
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocales(language), {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    fullDateFormats.set(language, format);
  }
  return format.format(date);
}

/**
 * The shorter forms of a day's list title, longest first: the weekday shortened, then the month,
 * then the year left out, which the month above names, then the weekday as well, and last the
 * day's number alone. Every form keeps the number, and all but the last its month, so a day of a
 * month beside the one shown is not mistaken for a day of it while there is room to say so.
 */
const SHORTER_DAY_TITLES: ReadonlyArray<Intl.DateTimeFormatOptions> = [
  { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' },
  { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' },
  { weekday: 'short', month: 'short', day: 'numeric' },
  { month: 'short', day: 'numeric' },
  { day: 'numeric' },
];

/**
 * A day's list title in every form it can take on its line, longest first: in full
 * (`monthDayTitle`), then each of `SHORTER_DAY_TITLES`, leaving out a form that reads as the one
 * before it in the language.
 *
 * @param date - The day
 * @param language - Card language
 * @returns Its titles
 */
export function monthDayTitles(date: Date, language: string): string[] {
  let formats = shorterTitleFormats.get(language);
  if (!formats) {
    formats = SHORTER_DAY_TITLES.map(
      (options) => new Intl.DateTimeFormat(intlLocales(language), options),
    );
    shorterTitleFormats.set(language, formats);
  }
  const titles = [monthDayTitle(date, language)];
  for (const format of formats) {
    const title = format.format(date);
    if (title !== titles[titles.length - 1]) titles.push(title);
  }
  return titles;
}

//-----------------------------------------------------------------------------
// DAYS
//-----------------------------------------------------------------------------

/**
 * One day's cell, the box behind its events, and its date at the top inline end.
 *
 * Two items of the row's grid rather than one inside the other: the cell spans every line of
 * its column, and the date sits on the row's first line, which it is the one thing to size. The
 * cell is the day's own target (`DaySlot`), so a press on its empty space adds an event there or
 * runs `day_tap_action`; the date lets a press through to it, and the bars, lines and "+N" drawn
 * over it cover it.
 *
 * The cell is also the month's grid cell for the keyboard and assistive technology: named for its
 * day and how many events it holds, the month's tab stop where it is `focused`, and the owner of
 * the bars, lines and "+N more" starting on it (`aria-owns`), which are drawn beside it rather
 * than in it. The date it names is hidden, so the row holds cells alone.
 *
 * @param date - The day's local midnight
 * @param column - Its column, from 0
 * @param headerMonth - The 1st of the month the header names; other months' days are dimmed
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param cell - Its events counted, whether it is the tab stop, and the ids of what it owns
 * @param hass - Home Assistant, whose country or language decides the weekend
 * @param dayLabelId - The date's id, given while the day's events are tap targets
 * @returns The cell and the date
 */
function renderDay(
  date: Date,
  column: number,
  headerMonth: Date,
  config: Types.Config,
  language: string,
  cell: { count: number; focused: boolean; owns: readonly string[] },
  hass?: Types.Hass | null,
  dayLabelId?: string,
): TemplateResult {
  const { isToday, isTomorrow, isPast } = Leaves.classifyDay(date.getTime());
  const isWeekendDay = FormatUtils.isWeekendDate(date, hass);
  const todayTile = isToday && Leaves.isTileIndicator(config);
  const colors = Leaves.dateColors(config, isWeekendDay, isToday, todayTile);
  const { weight, opacity } = Leaves.dateEmphasis(config, isToday, isPast);
  const otherMonth =
    date.getMonth() !== headerMonth.getMonth() || date.getFullYear() !== headerMonth.getFullYear();
  const translations = Localize.getTranslations(language);
  const mark = TextDirection.languageMark(language, hass);
  const gridColumn = String(column + 1);

  // The date is a flex row, so the whitespace between its parts draws nothing; a literal space
  // in a part, as between "Dec" and "1", is part of the text and stays.
  // A past day's fade goes on the parts rather than the date, so it composes with the fade of a
  // day outside the header's month instead of replacing it.
  const ink = (color: string) => styleMap({ color, 'font-weight': weight, opacity });
  const number = html`<span class=${todayTile ? 'day today-tile' : 'day'} style=${ink(colors.day)}
    >${date.getDate()}</span
  >`;
  const parts =
    date.getDate() === 1 && config.show_month
      ? firstOfMonthParts(date, language, translations).map((part) =>
          part.day
            ? number
            : html`<span class="month-date-month" style=${ink(colors.month)}
                >${TextDirection.inLanguageDirection(part.text, mark)}</span
              >`,
        )
      : [number];

  return html`
    <div
      class=${classMap({
        'month-day': true,
        today: isToday,
        tomorrow: isTomorrow,
        'past-day': isPast,
        'other-month': otherMonth,
        weekend: isWeekendDay,
      })}
      style=${styleMap({ gridColumn })}
      role="gridcell"
      tabindex=${cell.focused ? '0' : '-1'}
      aria-label=${monthCellName(date, cell.count, language)}
      aria-owns=${cell.owns.length > 0 ? cell.owns.join(' ') : nothing}
      aria-current=${isToday ? 'date' : nothing}
      .calendarCardDaySlot=${Activation.daySlot(date.getTime())}
      .calendarCardMonthCell=${date.getTime()}
    ></div>
    <div
      class="month-date"
      id=${dayLabelId ?? nothing}
      style=${styleMap({ gridColumn })}
      aria-hidden="true"
    >
      ${parts}
    </div>
  `;
}

//-----------------------------------------------------------------------------
// EVENTS
//-----------------------------------------------------------------------------

/**
 * The configuration a bar is drawn with: Grid's banner, filled with its calendar's color and
 * written in its ink.
 *
 * A bar is a filled shape, so where the card leaves `event_background_opacity` at its shipped 0
 * it takes Grid's tint, and where it leaves the title's and the times' colors at theirs, they
 * take the calendar's ink, as Grid's banner does. A value the card or the `month:` block sets
 * reaches the bars as it reaches the lines.
 *
 * @param config - Card configuration, resolved for month
 * @returns The configuration for its bars
 */
function barConfig(config: Types.Config): Types.Config {
  const ink = (value: string | undefined, shipped: string | undefined) =>
    value === shipped ? EntityColors.ACCENT_TEXT_SENTINEL : value;
  return {
    ...config,
    event_background_opacity:
      config.event_background_opacity > 0
        ? config.event_background_opacity
        : (ViewConfig.TIME_GRID_DEFAULT_OVERRIDES.event_background_opacity ??
          config.event_background_opacity),
    event_color: ink(config.event_color, DEFAULT_CONFIG.event_color) ?? config.event_color,
    time_color: ink(config.time_color, DEFAULT_CONFIG.time_color) ?? config.time_color,
  };
}

/**
 * What a line says at its inline end: its start time, or on a later day of an overnight event
 * "until" its end, or nothing on a day the event fills whole. A time at a day's first moment is
 * the day's edge, as on Grid's banner, and draws none.
 *
 * @param item - The line
 * @param config - Card configuration, resolved for month
 * @param translations - Card strings
 * @param hass - Home Assistant, for the time format
 * @returns The text, or null
 */
function lineTime(
  item: MonthLayout.MonthItem,
  config: Types.Config,
  translations: Types.Translations,
  hass?: Types.Hass | null,
): string | null {
  const { event, placement } = item;
  if (!event.start.dateTime || !event.end.dateTime) return null;
  const use24h = FormatUtils.resolveTimeFormat24h(config, hass);
  const reading = (date: Date) =>
    FormatUtils.isolateClockReadings(
      FormatUtils.formatTime(date, use24h, config.time_two_digit_hours),
    );
  if (!placement.continuesBefore) return reading(new Date(event.start.dateTime));
  const end = new Date(event.end.dateTime);
  return end.getTime() === Grid.startOfDay(end).getTime()
    ? null
    : `${translations.multiDay} ${reading(end)}`;
}

/**
 * One timed event on one day: Column's row trimmed to a line, its accent bar, its title cut to
 * the line, and its start time at the line's end in the time's size and color.
 *
 * A tappable line is a button for a pointer and for assistive technology, which finds it in its
 * day's cell, but no tab stop: the day's panel is the keyboard's way to it, so a busy month adds
 * no stops of its own.
 *
 * @param item - The line
 * @param line - The line it takes under the date, from 0
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param id - Its id, which its day's cell owns it by
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether the line is a tap target of its own
 * @param dayLabelId - The id of its day's date, which describes a tappable line
 * @returns The line
 */
function renderLine(
  item: MonthLayout.MonthItem,
  line: number,
  config: Types.Config,
  language: string,
  id: string,
  hass?: Types.Hass | null,
  eventsTappable = false,
  dayLabelId?: string,
): TemplateResult {
  const { event, placement } = item;
  const presentation = Presentation.buildEventPresentation(event, config, language, hass);
  const tap = Activation.eventTapTarget(event, presentation.entityAccentColor, eventsTappable);
  const parts = presentation.contentParts;
  const time = parts.shouldShowTime
    ? lineTime(item, config, Localize.getTranslations(language), hass)
    : null;
  const label = Leaves.renderLabel(
    parts.entityLabel,
    event._matchedConfig?.label_icon_color,
    event._matchedConfig?.label_type,
    parts.entityLabelAlt,
  );

  return html`
    <div
      class=${classMap({
        event: true,
        'month-line': true,
        'past-event': presentation.isPastEvent,
        'event-now': presentation.isNow,
        'event-interactive': tap !== undefined,
        'search-ring': event._searchRing === true,
        [TextScale.TEXT_SCALED_CLASS]: presentation.textScaled,
      })}
      style=${styleMap({
        gridColumn: String(placement.columnIndex + 1),
        gridRow: String(line + 2),
        '--calendar-card-event-accent-bar-color': presentation.entityAccentColor,
        ...(presentation.entityAccentBackgroundColor
          ? { backgroundColor: presentation.entityAccentBackgroundColor }
          : {}),
        ...presentation.accentTextProperties,
        ...presentation.textScaleProperties,
      })}
      id=${id}
      role=${tap ? 'button' : nothing}
      tabindex=${tap ? '-1' : nothing}
      aria-describedby=${tap && dayLabelId ? dayLabelId : nothing}
      .calendarCardEventTap=${tap}
      .calendarCardDaySlot=${Activation.COVERED}
    >
      ${Leaves.renderAccentBar()}
      ${label === nothing ? nothing : html`<span class="month-line-label">${label}</span>`}
      <span class="month-line-title">${event.summary ?? ''}</span>
      ${time === null ? nothing : html`<span class="month-line-time">${time}</span>`}
    </div>
  `;
}

/**
 * A day's "+N more", on its last line: the events it has no room for, counted.
 *
 * A button named for its day and its count, which keeps its press from becoming a press on the
 * card or on the day beneath it, and opens the day's panel. Out of the Tab order, as the lines
 * are: Enter on its day's cell opens the same panel.
 *
 * @param column - The day's column, from 0
 * @param date - The day
 * @param count - Events it hides
 * @param capacity - Lines under the date; this takes the last
 * @param language - Card language
 * @param hass - Home Assistant, which says which way the dashboard runs
 * @param more - Opens the day's panel, if the card opens one
 * @returns The button
 */
function renderMore(
  column: number,
  date: Date,
  count: number,
  capacity: number,
  language: string,
  hass?: Types.Hass | null,
  more?: MonthOptions['more'],
): TemplateResult {
  const text = TextDirection.inLanguageDirection(
    Localize.getTranslations(language).moreEvents.replace('{count}', () => String(count)),
    TextDirection.languageMark(language, hass),
  );
  return html`<button
    class="month-more"
    type="button"
    id=${monthItemId(date, 'more')}
    tabindex="-1"
    style=${styleMap({ gridColumn: String(column + 1), gridRow: String(capacity + 1) })}
    aria-label=${`${text}, ${dayName(date, language)}`}
    @pointerdown=${stopCardGesture}
    @click=${(ev: MouseEvent) => {
      stopCardGesture(ev);
      more?.(date, ev.currentTarget as HTMLElement);
    }}
    .calendarCardDaySlot=${Activation.COVERED}
  >
    ${text}
  </button>`;
}

//-----------------------------------------------------------------------------
// MONTH
//-----------------------------------------------------------------------------

/**
 * One week row: its seven cells, its week number in the first cell's corner, then its bars,
 * lines and "+N", each placed on its line.
 *
 * @param week - The row
 * @param index - Its place among the six, from 0
 * @param headerMonth - The 1st of the month the header names
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param capacity - Lines under a date
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether events are tap targets of their own
 * @param focusKey - The date of the month's tab stop, `YYYY-MM-DD`
 * @param more - Opens a day's panel from its "+N more"
 * @returns The row
 */
function renderWeek(
  week: MonthWeek,
  index: number,
  headerMonth: Date,
  config: Types.Config,
  language: string,
  capacity: number,
  hass?: Types.Hass | null,
  eventsTappable = false,
  focusKey = '',
  more?: MonthOptions['more'],
): TemplateResult {
  const lines = Math.max(0, capacity);
  const dayLabelIds = week.starts.map((start) =>
    eventsTappable ? Activation.dayLabelId(start.getTime()) : undefined,
  );
  const bars = barConfig(config);
  const weekNumber = monthWeekNumber(week.starts[0], index, config);
  const visible = week.layout.placements.filter((placement) => placement.visible);
  // What each day's cell owns: the bars and lines starting on it, then its "+N more".
  const owns = week.starts.map((start, column) => [
    ...visible
      .filter(({ item }) => item.placement.columnIndex === column)
      .map(({ line }) => monthItemId(start, line)),
    ...(week.layout.days[column].more ? [monthItemId(start, 'more')] : []),
  ]);

  return html`
    <div
      class="month-week"
      role="row"
      style=${styleMap({
        gridTemplateRows: `auto${lines > 0 ? ` repeat(${lines}, auto)` : ''} minmax(0, 1fr)`,
      })}
    >
      ${week.starts.map((start, column) =>
        renderDay(
          start,
          column,
          headerMonth,
          config,
          language,
          {
            count: (week.days[column]?.events ?? []).filter((event) => !event._isEmptyDay).length,
            focused: FormatUtils.getLocalDateKey(start) === focusKey,
            owns: owns[column],
          },
          hass,
          dayLabelIds[column],
        ),
      )}
      ${
        weekNumber === null
          ? nothing
          : html`<div class="month-week-number" aria-hidden="true">${weekNumber}</div>`
      }
      ${visible.map(({ item, line }) => {
        const id = monthItemId(week.starts[item.placement.columnIndex], line);
        return item.kind === 'bar'
          ? renderBanner(
              item.event,
              item.placement,
              line + 2,
              bars,
              language,
              hass,
              eventsTappable,
              dayLabelIds[item.placement.columnIndex],
              { firstColumn: 1, className: 'month-bar', id, tabIndex: '-1' },
            )
          : renderLine(
              item,
              line,
              config,
              language,
              id,
              hass,
              eventsTappable,
              dayLabelIds[item.placement.columnIndex],
            );
      })}
      ${week.layout.days.map((day, column) =>
        day.more
          ? renderMore(column, week.starts[column], day.hidden.length, lines, language, hass, more)
          : nothing,
      )}
    </div>
  `;
}

/**
 * The number a week row is marked with, or null where none is drawn: the first row's only while
 * `show_current_week_number` asks for it, as List marks the week it starts in.
 *
 * @param weekStart - The row's first day
 * @param index - Its place among the six, from 0
 * @param config - Card configuration, resolved for month
 * @returns The number, or null
 */
function monthWeekNumber(weekStart: Date, index: number, config: Types.Config): number | null {
  return config.show_week_numbers !== null && (index > 0 || config.show_current_week_number)
    ? EventUtils.calculateWeekNumberWithMajorityRule(weekStart, config, weekStart.getDay())
    : null;
}

/**
 * A weekday name's own color: a weekend's in the weekend's weekday color where the card sets
 * one, else none, which the stylesheet's applies.
 *
 * @param day - A day of its column
 * @param config - Card configuration, resolved for month
 * @param hass - Home Assistant, whose country or language decides the weekend
 * @returns An inline style, or nothing
 */
function weekdayStyle(day: Date, config: Types.Config, hass?: Types.Hass | null) {
  const color = FormatUtils.isWeekendDate(day, hass) ? config.weekend_weekday_color : undefined;
  return color ? styleMap({ color }) : nothing;
}

/**
 * The weekday names, the month grid's header row: each a column header named in full for
 * assistive technology. In the compact form over a gutter where week numbers are drawn, which,
 * as the numbers, is hidden from it, so every row holds seven cells.
 *
 * @param starts - The first row's days
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param hass - Home Assistant, whose country or language decides the weekend
 * @param gutter - Whether a gutter for week numbers comes first
 * @returns The names
 */
function renderWeekdays(
  starts: readonly Date[],
  config: Types.Config,
  language: string,
  hass?: Types.Hass | null,
  gutter = false,
): TemplateResult {
  const translations = Localize.getTranslations(language);
  const mark = TextDirection.languageMark(language, hass);
  return html`<div class="month-weekdays" role="row">
    ${gutter ? html`<div class="month-weekday-gutter" aria-hidden="true"></div>` : nothing}
    ${starts.map(
      (start) =>
        html`<div
          class=${classMap({
            'month-weekday': true,
            weekend: FormatUtils.isWeekendDate(start, hass),
          })}
          style=${weekdayStyle(start, config, hass)}
          role="columnheader"
          aria-label=${weekdayName(start, language)}
        >
          ${TextDirection.inLanguageDirection(translations.daysOfWeek[start.getDay()], mark)}
        </div>`,
    )}
  </div>`;
}

/**
 * Render a month page: the weekday names, then six week rows of seven days, or the compact form
 * where the card hands one (`MonthOptions.compact`).
 *
 * @param days - Grouped days of the page, which hold only days with events
 * @param rowsStart - The first row's first day, which is the first weekday
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param capacity - Lines that fit under a date, as the card last measured them
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether each bar, line and row is a tap target of its own
 * @param options - What "+N more" opens, the compact form's selected day and lists, the day the
 *   keyboard's tab stop is on, and the wheel's listener while weeks scroll
 * @returns The month
 */
export function renderMonthGroupedEvents(
  days: ReadonlyArray<Types.EventsByDay>,
  rowsStart: Date,
  config: Types.Config,
  language: string,
  capacity: number = MONTH_LINE_CAPACITY_DEFAULT,
  hass?: Types.Hass | null,
  eventsTappable = false,
  options: MonthOptions = {},
): TemplateResult {
  const headerMonth = Paging.majorityMonth({ start: rowsStart, days: ViewConfig.MONTH_DAYS });
  const focusKey = FormatUtils.getLocalDateKey(options.focusDay ?? headerMonth);
  if (options.compact) {
    return renderCompactMonth(
      rowsStart,
      config,
      language,
      options.compact,
      focusKey,
      hass,
      eventsTappable,
    );
  }
  const weeks = monthWeeks(days, rowsStart, capacity);
  // A fixed card height is a real length; `height` defaults to the string `'auto'`.
  const fixedHeight = config.height != null && config.height !== '' && config.height !== 'auto';
  const rowHeight = ViewConfig.resolveMonthOption(config, 'row_height');

  return html`
    <div
      class=${classMap({ 'month-container': true, 'week-scroll': options.weekScroll !== undefined })}
      role="grid"
      aria-label=${Paging.monthHeading(headerMonth, language)}
      @wheel=${options.weekScroll ?? nothing}
      style=${styleMap({
        // Handed to CSS as written, so `8em` and `calc()` survive. Under a fixed card height
        // the rows share it instead: the month is as tall as the height it fills, through its
        // bounds. Where that height cannot be worked out, a percentage of a box with no height of
        // its own, both bounds resolve to nothing, and the month is six weeks of `row_height`
        // rather than as tall as its weeks' events, which would let them size the rows.
        '--calendar-card-month-row-height': fixedHeight ? 'minmax(0, 1fr)' : rowHeight,
        ...(fixedHeight
          ? {
              height: `calc(${ViewConfig.MONTH_ROWS} * ${rowHeight})`,
              'min-height': '100%',
              'max-height': '100%',
            }
          : {}),
      })}
    >
      ${renderWeekdays(weeks[0].starts, config, language, hass)}
      ${weeks.map((week, index) =>
        renderWeek(
          week,
          index,
          headerMonth,
          config,
          language,
          capacity,
          hass,
          eventsTappable,
          focusKey,
          options.more,
        ),
      )}
      <div class=${MONTH_PROBE_CLASS} aria-hidden="true"></div>
    </div>
  `;
}

//-----------------------------------------------------------------------------
// THE COMPACT FORM
//-----------------------------------------------------------------------------

/**
 * The color an event's segment of a capsule takes: its calendar's accent, or the duplicate
 * accent on a row two calendars share, as its row's accent bar is drawn.
 *
 * @param event - The event, as the day model lists it
 * @param config - Card configuration, resolved for month
 * @returns A CSS color
 */
function markColor(event: Types.CalendarEventData, config: Types.Config): string {
  const merged =
    event._mergedFrom && event._mergedFrom.length > 1 ? config.duplicate_accent_color : undefined;
  return (
    merged ||
    EventUtils.getEntityAccentColorWithOpacity(
      event._entityId,
      config,
      undefined,
      event,
      EntityColors.entityColors(),
    )
  );
}

/**
 * A compact day's capsule: one segment per event, in its calendar's color, up to
 * `MONTH_COMPACT_MARKS`. A single event is a dot. A day without events keeps an empty capsule,
 * so every day is as tall as one with events.
 *
 * @param events - The day's events, as the day model lists them
 * @param config - Card configuration, resolved for month
 * @returns The capsule
 */
function renderMarks(
  events: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
): TemplateResult {
  const shown = events.slice(0, Constants.UI.MONTH_COMPACT_MARKS);
  return html`<span class="month-compact-marks" aria-hidden="true"
    >${shown.map(
      (event) =>
        html`<span
          class="month-compact-mark"
          style=${styleMap({ backgroundColor: markColor(event, config) })}
        ></span>`,
    )}</span
  >`;
}

/**
 * One compact day: its number and its capsule. The selected day's number sits on a neutral
 * mark, today's on the today tile, and both at once on the tile filled. A tap selects the day
 * (`calendarCardMonthPick`), and never adds on it or runs `day_tap_action`: adding is the
 * toolbar's add, dated on the selected day, and `day_tap_action` the list's.
 *
 * The day is the month's grid cell for the keyboard and assistive technology too, named for its
 * day and its events' count, the month's tab stop where it is `focused`, and selected or not
 * (`aria-selected`), which Enter and Space change as a tap does.
 *
 * @param date - The day's local midnight
 * @param headerMonth - The 1st of the month the header names; other months' days are dimmed
 * @param selected - Whether it is the day selected
 * @param focused - Whether it is the month's tab stop
 * @param events - Its events, as the day model lists them
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param hass - Home Assistant, whose country or language decides the weekend
 * @returns The day
 */
function renderCompactDay(
  date: Date,
  headerMonth: Date,
  selected: boolean,
  focused: boolean,
  events: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
  language: string,
  hass?: Types.Hass | null,
): TemplateResult {
  const { isToday, isTomorrow, isPast } = Leaves.classifyDay(date.getTime());
  const isWeekendDay = FormatUtils.isWeekendDate(date, hass);
  const todayTile = isToday && Leaves.isTileIndicator(config);
  const colors = Leaves.dateColors(config, isWeekendDay, isToday, todayTile);
  const { weight, opacity } = Leaves.dateEmphasis(config, isToday, isPast);
  const otherMonth =
    date.getMonth() !== headerMonth.getMonth() || date.getFullYear() !== headerMonth.getFullYear();
  // The selected day's mark sets its own ink. Today off the tile is written in the indicator's
  // color, so it still reads as today. A weekend's number steps back to the secondary text, as a
  // phone's month does, unless the card names a weekend color for it.
  const ink = selected
    ? undefined
    : isToday
      ? todayTile
        ? colors.day
        : config.today_day_color || 'var(--calendar-card-today-indicator-color)'
      : isWeekendDay
        ? config.weekend_day_color || 'var(--secondary-text-color)'
        : colors.day;

  return html`<div
    class=${classMap({
      'month-day': true,
      today: isToday,
      tomorrow: isTomorrow,
      'past-day': isPast,
      'other-month': otherMonth,
      weekend: isWeekendDay,
      'month-selected': selected,
    })}
    role="gridcell"
    tabindex=${focused ? '0' : '-1'}
    aria-label=${monthCellName(date, events.length, language)}
    aria-selected=${selected ? 'true' : 'false'}
    aria-current=${isToday ? 'date' : nothing}
    .calendarCardMonthPick=${date.getTime()}
    .calendarCardMonthCell=${date.getTime()}
  >
    <span class="month-date"
      ><span
        class=${todayTile ? 'day today-tile' : 'day'}
        style=${styleMap({ color: ink, 'font-weight': weight, opacity })}
        >${date.getDate()}</span
      ></span
    >
    ${renderMarks(events, config)}
  </div>`;
}

/**
 * The compact form: the weekday names, six weeks of days drawn as a number and a capsule, the
 * week numbers in a narrow gutter with the current week's emphasized, and under them the
 * selected day's list. The rows take their content's height; `row_height` is the wide form's.
 *
 * @param rowsStart - The first row's first day
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param compact - The selected day, every day's events and what the list draws with
 * @param focusKey - The date of the month's tab stop, `YYYY-MM-DD`
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether each of the list's rows is a tap target of its own
 * @returns The month and its list
 */
function renderCompactMonth(
  rowsStart: Date,
  config: Types.Config,
  language: string,
  compact: MonthCompact,
  focusKey: string,
  hass?: Types.Hass | null,
  eventsTappable = false,
): TemplateResult {
  const headerMonth = Paging.majorityMonth({ start: rowsStart, days: ViewConfig.MONTH_DAYS });
  const weekNumbers = config.show_week_numbers !== null;
  const selectedKey = FormatUtils.getLocalDateKey(compact.selected);
  const today = Paging.startOfDay(new Date());
  const weeks = Array.from({ length: ViewConfig.MONTH_ROWS }, (_, row) =>
    Array.from({ length: 7 }, (_, column) => Paging.addDays(rowsStart, row * 7 + column)),
  );
  const selectedIndex = FormatUtils.getCalendarDayDiff(rowsStart, compact.selected);

  return html`
    <div
      class=${classMap({
        'month-container': true,
        'month-compact': true,
        'with-week-numbers': weekNumbers,
      })}
      role="grid"
      aria-label=${Paging.monthHeading(headerMonth, language)}
    >
      ${renderWeekdays(weeks[0], config, language, hass, weekNumbers)}
      ${weeks.map((starts, row) => {
        const number = weekNumbers ? monthWeekNumber(starts[0], row, config) : null;
        const current = starts[0] <= today && today < Paging.addDays(starts[0], 7);
        return html`<div class="month-week" role="row">
          ${
            weekNumbers
              ? html`<div
                  class=${classMap({ 'month-week-number': true, current })}
                  aria-hidden="true"
                >
                  ${number ?? ''}
                </div>`
              : nothing
          }
          ${starts.map((start, column) =>
            renderCompactDay(
              start,
              headerMonth,
              FormatUtils.getLocalDateKey(start) === selectedKey,
              FormatUtils.getLocalDateKey(start) === focusKey,
              compact.dayLists[row * 7 + column] ?? [],
              config,
              language,
              hass,
            ),
          )}
        </div>`;
      })}
    </div>
    ${renderMonthDayList(
      compact.selected,
      compact.dayLists[selectedIndex] ?? [],
      config,
      language,
      hass,
      eventsTappable,
      compact.weatherForecasts,
      compact.dayAdd,
      compact.reserve,
      compact.more,
    )}
    ${(compact.reserve ?? 0) > 0 ? renderListProbe(config, language, hass) : nothing}
  `;
}

//-----------------------------------------------------------------------------
// THE DAY LIST
//-----------------------------------------------------------------------------

/**
 * One event of a day's list: List's row, its accent bar and its content, without the date
 * column, drawn with Month's presentation options and its time beside its title. Inside the
 * button that makes it a tap target where it is one, as List draws it.
 *
 * @param event - The event, as the day model lists it
 * @param index - Its place in the day
 * @param count - How many the day lists
 * @param config - The rows' configuration (`MonthDay.monthRowsConfig`)
 * @param language - Card language
 * @param weatherForecasts - Forecasts for its weather, as a list row shows them
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether it is a tap target of its own
 * @param dayLabelId - The id of what names its day, which describes it as a tap target
 * @param countdownRepeated - Whether its countdown repeats the one above it and is left out
 * @returns The row
 */
function renderDayRow(
  event: Types.CalendarEventData,
  index: number,
  count: number,
  config: Types.Config,
  language: string,
  weatherForecasts: Types.WeatherForecasts | undefined,
  hass: Types.Hass | null | undefined,
  eventsTappable: boolean,
  dayLabelId: string | undefined,
  countdownRepeated: boolean,
): TemplateResult {
  const presented = Presentation.buildEventPresentation(event, config, language, hass);
  const presentation = countdownRepeated ? Presentation.withoutCountdown(presented) : presented;
  const tap = Activation.eventTapTarget(event, presentation.entityAccentColor, eventsTappable);
  const first = index === 0;
  const last = index === count - 1;
  const content = Leaves.renderEventContent(event, config, presentation.contentParts, {
    weatherForecasts,
    links: Presentation.rowLinksOn(config),
    timePosition: Helpers.resolveTimePosition(config.time_position),
  });

  return html`<tr>
    <td
      class=${classMap({
        event: true,
        'event-first': first,
        'event-middle': !first && !last,
        'event-last': last,
        'past-event': presentation.isPastEvent,
        'event-tappable': tap !== undefined,
        'event-now': presentation.isNow,
        'search-ring': event._searchRing === true,
        [TextScale.TEXT_SCALED_CLASS]: presentation.textScaled,
      })}
      .calendarCardDaySlot=${Activation.COVERED}
      style=${styleMap({
        '--calendar-card-event-accent-bar-color': presentation.entityAccentColor,
        ...(presentation.entityAccentBackgroundColor
          ? { backgroundColor: presentation.entityAccentBackgroundColor }
          : {}),
        ...presentation.accentTextProperties,
        ...presentation.textScaleProperties,
      })}
    >
      ${Leaves.renderAccentBar()}
      ${
        tap
          ? html`<div
              class="event-button event-interactive"
              role="button"
              tabindex="0"
              aria-describedby=${dayLabelId ?? nothing}
              .calendarCardEventTap=${tap}
            >
              ${content}
            </div>`
          : content
      }
    </td>
  </tr>`;
}

/**
 * A day's events as List's rows, in Month's presentation and without a date column: what the
 * day panel lists and what a compact month lists under its weeks. Each row's time is beside its
 * title, whatever `time_position` says (`MonthDay.monthRowsConfig`), and `event_gap` sets each
 * event apart as List's does, with the same row between two. Nothing for a day without events.
 *
 * @param events - The day's events, as the day model lists them
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether each row is a tap target of its own
 * @param weatherForecasts - Forecasts for the rows' weather, as a list row shows them
 * @param dayLabelId - The id of what names the day, which describes each row as a tap target
 * @param reserved - Whether the list keeps room for its events, so each part keeps to a line
 * @returns The rows, or nothing
 */
export function renderMonthDayRows(
  events: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
  language: string,
  hass?: Types.Hass | null,
  eventsTappable = false,
  weatherForecasts?: Types.WeatherForecasts,
  dayLabelId?: string,
  reserved = false,
): TemplateResult | typeof nothing {
  if (events.length === 0) return nothing;
  const rows = MonthDay.monthRowsConfig(config, reserved);
  const repeated = Presentation.repeatedCountdowns([...events], rows, language);
  const gap = ViewConfig.hasEventGap(rows);
  return html`<table class=${gap ? 'month-day-table with-event-gap' : 'month-day-table'}>
    ${events.map((event, index) => {
      const row = renderDayRow(
        event,
        index,
        events.length,
        rows,
        language,
        weatherForecasts,
        hass,
        eventsTappable,
        dayLabelId,
        repeated.has(index),
      );
      return gap && index > 0 ? html`${Leaves.renderEventGapRow()}${row}` : row;
    })}
  </table>`;
}

/** What a reserved list's rows write on the list: the room and each part's one line. */
const reservedStyles = new WeakMap<Types.Config, Readonly<Record<string, string>>>();

/**
 * The custom properties a reserved list writes on itself, over the card's: each the card writes
 * differently for the reserved rows' configuration (`MonthDay.monthRowsConfig`), so every line
 * limit the stylesheet reads takes one line there and nowhere else, as `text_scale` scales one
 * event's sizes.
 *
 * @param config - Card configuration, resolved for month
 * @returns The properties, by name
 */
function reservedListStyle(config: Types.Config): Readonly<Record<string, string>> {
  const known = reservedStyles.get(config);
  if (known) return known;
  const card = generateCustomPropertiesObject(config);
  const rows = generateCustomPropertiesObject(MonthDay.monthRowsConfig(config, true));
  const style = Object.fromEntries(
    Object.entries(rows).filter(([property, value]) => card[property] !== value),
  );
  reservedStyles.set(config, style);
  return style;
}

/**
 * The list's "+N more", in the last row its room keeps: the events past the ones it lists,
 * counted, as a button in the Tab order named for its count and its day. It opens the day's
 * panel beside itself, and focus comes back to it when the panel closes. Its press is its own,
 * never the card's nor the day's beneath it.
 *
 * @param day - The day, at local midnight
 * @param count - The events it stands for
 * @param language - Card language
 * @param hass - Home Assistant, which says which way the dashboard runs
 * @param more - Opens the day's panel, if the card opens one
 * @returns The button
 */
function renderListMore(
  day: Date,
  count: number,
  language: string,
  hass?: Types.Hass | null,
  more?: MonthCompact['more'],
): TemplateResult {
  const text = TextDirection.inLanguageDirection(
    Localize.getTranslations(language).moreEvents.replace('{count}', () => String(count)),
    TextDirection.languageMark(language, hass),
  );
  return html`<button
    class="month-day-list-more"
    type="button"
    aria-label=${`${text}, ${dayName(day, language)}`}
    @pointerdown=${stopCardGesture}
    @click=${(ev: MouseEvent) => {
      stopCardGesture(ev);
      more?.(day, ev.currentTarget as HTMLElement);
    }}
    .calendarCardDaySlot=${Activation.COVERED}
  >
    ${text}
  </button>`;
}

/**
 * The hidden row a reserved list is measured from (`MonthDay.monthListProbe`), beside the list,
 * drawn as the list's rows are and out of sight, the tab order and assistive technology. It takes
 * no room: the card reads its height and writes it on the list (`MONTH_LIST_ROW_PROPERTY`).
 *
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param hass - Home Assistant instance
 * @returns The probe
 */
function renderListProbe(
  config: Types.Config,
  language: string,
  hass?: Types.Hass | null,
): TemplateResult {
  return html`<div
    class=${MONTH_LIST_PROBE_CLASS}
    style=${styleMap(reservedListStyle(config))}
    aria-hidden="true"
    inert
  >
    ${renderMonthDayRows(
      [MonthDay.monthListProbe(config)],
      config,
      language,
      hass,
      false,
      undefined,
      undefined,
      true,
    )}
  </div>`;
}

/**
 * What a box of a day's list title holds, the box being one line tall and wrapping: a box for
 * the shorter forms, then the form. The form shows where it fits on the line beside that box, and
 * wraps out of sight where it does not, which leaves the box the line to itself. Of two on a line,
 * the form takes all the room the line has to spare (see the stylesheet), so the shorter forms
 * show only where it has wrapped. The last form's box is empty, so no form is ever drawn wider
 * than its box: where not even the last fits, the line is empty.
 *
 * @param titles - The title's forms, longest first, at least one
 * @param mark - The card language's direction mark, if the page reads the other way
 * @returns The box's contents
 */
function renderDayTitleFit(
  titles: ReadonlyArray<string>,
  mark: TextDirection.LanguageMark,
): TemplateResult {
  const [title, ...shorter] = titles;
  return html`<span class="month-day-list-rest"
      >${
        shorter.length > 0
          ? html`<span class="month-day-list-fit">${renderDayTitleFit(shorter, mark)}</span>`
          : nothing
      }</span
    ><span class="month-day-list-form">${TextDirection.inLanguageDirection(title, mark)}</span>`;
}

/**
 * The selected day's list, under a compact month's weeks: the day named on one line, in full
 * where that fits and in a shorter form where it does not, then its rows, or the card's "no
 * events" where it has none. Its own space is the day's: a press there, on its name or under its
 * rows, runs `day_tap_action`, and where that adds an event its name is a button that adds on the
 * day, as List's dates are.
 *
 * With `reserve` events, the rows take as much room on every day, whatever the day holds, so the
 * card is one height as a tap moves from day to day and month to month: `reserve` rows of the
 * height the card measures off the hidden probe beside the list, and the gaps between them. A
 * day with more lists one fewer and "+N more" in the last row, which opens the day's panel. Each
 * part of a row keeps to one line (`MonthDay.monthRowsConfig`), and a row is cut at the room's
 * height besides, so nothing a row holds can make it taller. Nothing scrolls: under a fixed card
 * `height` the list scrolls with the month in the card's content.
 *
 * @param day - The day, at local midnight
 * @param events - Its events, as the day model lists them
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether each row is a tap target of its own
 * @param weatherForecasts - Forecasts for the rows' weather
 * @param dayAdd - The name as a button that adds on the day, while a tap on a day adds
 * @param reserve - The events it keeps room for, or 0 for none
 * @param more - Opens the day's panel from "+N more"
 * @returns The list
 */
export function renderMonthDayList(
  day: Date,
  events: ReadonlyArray<Types.CalendarEventData>,
  config: Types.Config,
  language: string,
  hass?: Types.Hass | null,
  eventsTappable = false,
  weatherForecasts?: Types.WeatherForecasts,
  dayAdd?: Activation.DayAddButtons,
  reserve = 0,
  more?: MonthCompact['more'],
): TemplateResult {
  const timestamp = day.getTime();
  const labelId = eventsTappable || dayAdd ? Activation.dayLabelId(timestamp) : undefined;
  const mark = TextDirection.languageMark(language, hass);
  const titles = monthDayTitles(day, language);
  const name = html`<span class="month-day-list-date" id=${labelId ?? nothing}
    ><span class="month-day-list-name">${TextDirection.inLanguageDirection(titles[0], mark)}</span
    ><span class="month-day-list-fit" aria-hidden="true"
      >${renderDayTitleFit(titles, mark)}</span
    ></span
  >`;
  const reserved = reserve > 0;
  const shown = reserved && events.length > reserve ? reserve - 1 : events.length;
  const rows =
    events.length > 0
      ? html`${
          shown > 0
            ? renderMonthDayRows(
                events.slice(0, shown),
                config,
                language,
                hass,
                eventsTappable,
                weatherForecasts,
                labelId,
                reserved,
              )
            : nothing
        }${
          shown < events.length
            ? renderListMore(day, events.length - shown, language, hass, more)
            : nothing
        }`
      : html`<div class="month-day-list-empty">
          ${TextDirection.inLanguageDirection(Localize.getTranslations(language).noEvents, mark)}
        </div>`;

  return html`<div
    class=${reserved ? 'month-day-list month-day-list-reserved' : 'month-day-list'}
    style=${
      reserved
        ? styleMap({
            ...reservedListStyle(config),
            '--calendar-card-month-day-list-events': String(reserve),
          })
        : nothing
    }
    .calendarCardDaySlot=${Activation.daySlot(timestamp)}
  >
    ${
      dayAdd
        ? html`<div
            class="month-day-list-header day-add-button"
            role="button"
            tabindex="0"
            aria-label=${dayAdd.label}
            aria-describedby=${labelId ?? nothing}
            .calendarCardDayAdd=${timestamp}
          >
            ${name}
          </div>`
        : html`<div class="month-day-list-header">${name}</div>`
    }
    ${reserved ? html`<div class="month-day-list-rows">${rows}</div>` : rows}
  </div>`;
}

/**
 * How many lines fit under a date in a rendered month, or null where it is not laid out.
 *
 * Read from the first week row's height, less its date line, in line pitches. The probe
 * (`MONTH_PROBE_CLASS`) carries both: its width is a line's height and its height the date
 * line's, set in the stylesheet in the event font the lines and dates are set in. A row's height
 * depends on `row_height` or the card's, never on what is in it (`renderMonthGroupedEvents`), so
 * a capacity read here holds for the render it causes, and an empty week reads the same as a
 * full one.
 *
 * @param root - The card's render root
 * @returns The lines, from 0, or null
 */
export function measureMonthCapacity(root: ParentNode): number | null {
  const week = root.querySelector<HTMLElement>('.month-week');
  const probe = root.querySelector<HTMLElement>(`.${MONTH_PROBE_CLASS}`);
  if (!week || !probe) return null;
  const { width: pitch, height: dateLine } = probe.getBoundingClientRect();
  const height = week.clientHeight;
  if (!(pitch > 0) || !(height > 0)) return null;
  // A hundredth of a line of give, so a row sized for exactly four lines holds four whatever
  // the rounding of fractional pixels.
  return Math.max(0, Math.floor((height - dateLine) / pitch + 0.01));
}

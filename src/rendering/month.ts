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
 * A row's height never depends on what is in it: `row_height`, or under a fixed card `height`
 * a sixth of what the weekday names leave. So the capacity cannot feed back into the size it
 * is measured from, and the card's height does not change from page to page.
 *
 * @see renderGridGroupedEvents in `grid.ts`, whose banner the bars are
 * @see renderColumnGroupedEvents in `column.ts`, whose row the lines trim
 */

import { TemplateResult, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import * as Activation from './activation';
import { renderBanner } from './grid';
import * as Leaves from './leaves';
import * as Presentation from './presentation';
import * as TextScale from './text-scale';
import { stopCardGesture } from './toolbar';
import { DEFAULT_CONFIG } from '../config/config';
import * as Types from '../config/types';
import * as ViewConfig from '../config/view';
import { intlCache, intlLocales, intlSpeaks } from '../translations/intl-locales';
import * as Localize from '../translations/localize';
import * as EntityColors from '../utils/entity-colors';
import * as EventUtils from '../utils/events';
import * as FormatUtils from '../utils/format';
import * as Grid from '../utils/grid';
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
 * Whether a month page draws at least one "+N more": a control of its own, which the card
 * counts among those it hosts.
 *
 * @param days - Grouped days
 * @param rowsStart - The first row's first day
 * @param capacity - Lines that fit under a date
 * @returns True where a day has more events than room
 */
export function monthDrawsMore(
  days: ReadonlyArray<Types.EventsByDay>,
  rowsStart: Date,
  capacity: number,
): boolean {
  return monthWeeks(days, rowsStart, capacity).some((week) =>
    week.layout.days.some((day) => day.more),
  );
}

//-----------------------------------------------------------------------------
// WORDS
//-----------------------------------------------------------------------------

const firstOfMonthFormats = intlCache<string, Intl.DateTimeFormat | null>();
const dayNameFormats = intlCache<string, Intl.DateTimeFormat>();

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
 * @param date - The day's local midnight
 * @param column - Its column, from 0
 * @param headerMonth - The 1st of the month the header names; other months' days are dimmed
 * @param config - Card configuration, resolved for month
 * @param language - Card language
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
      aria-current=${isToday ? 'date' : nothing}
      .calendarCardDaySlot=${Activation.daySlot(date.getTime())}
    ></div>
    <div class="month-date" id=${dayLabelId ?? nothing} style=${styleMap({ gridColumn })}>
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
 * @param item - The line
 * @param line - The line it takes under the date, from 0
 * @param config - Card configuration, resolved for month
 * @param language - Card language
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
      role=${tap ? 'button' : nothing}
      tabindex=${tap ? '0' : nothing}
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
 * card or on the day beneath it.
 *
 * @param column - The day's column, from 0
 * @param date - The day
 * @param count - Events it hides
 * @param capacity - Lines under the date; this takes the last
 * @param language - Card language
 * @param hass - Home Assistant, which says which way the dashboard runs
 * @returns The button
 */
function renderMore(
  column: number,
  date: Date,
  count: number,
  capacity: number,
  language: string,
  hass?: Types.Hass | null,
): TemplateResult {
  const text = TextDirection.inLanguageDirection(
    Localize.getTranslations(language).moreEvents.replace('{count}', () => String(count)),
    TextDirection.languageMark(language, hass),
  );
  // The day panel it opens is wired in the next step; until then a press does nothing but stay
  // its own.
  return html`<button
    class="month-more"
    type="button"
    style=${styleMap({ gridColumn: String(column + 1), gridRow: String(capacity + 1) })}
    aria-label=${`${text}, ${dayName(date, language)}`}
    @pointerdown=${stopCardGesture}
    @click=${stopCardGesture}
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
): TemplateResult {
  const lines = Math.max(0, capacity);
  const dayLabelIds = week.starts.map((start) =>
    eventsTappable ? Activation.dayLabelId(start.getTime()) : undefined,
  );
  const bars = barConfig(config);
  const weekNumber =
    config.show_week_numbers !== null && (index > 0 || config.show_current_week_number)
      ? EventUtils.calculateWeekNumberWithMajorityRule(
          week.starts[0],
          config,
          week.starts[0].getDay(),
        )
      : null;

  return html`
    <div
      class="month-week"
      style=${styleMap({
        gridTemplateRows: `auto${lines > 0 ? ` repeat(${lines}, auto)` : ''} minmax(0, 1fr)`,
      })}
    >
      ${week.starts.map((start, column) =>
        renderDay(start, column, headerMonth, config, language, hass, dayLabelIds[column]),
      )}
      ${weekNumber === null ? nothing : html`<div class="month-week-number">${weekNumber}</div>`}
      ${week.layout.placements
        .filter((placement) => placement.visible)
        .map(({ item, line }) =>
          item.kind === 'bar'
            ? renderBanner(
                item.event,
                item.placement,
                line + 2,
                bars,
                language,
                hass,
                eventsTappable,
                dayLabelIds[item.placement.columnIndex],
                { firstColumn: 1, className: 'month-bar' },
              )
            : renderLine(
                item,
                line,
                config,
                language,
                hass,
                eventsTappable,
                dayLabelIds[item.placement.columnIndex],
              ),
        )}
      ${week.layout.days.map((day, column) =>
        day.more
          ? renderMore(column, week.starts[column], day.hidden.length, lines, language, hass)
          : nothing,
      )}
    </div>
  `;
}

/**
 * Render a month page: the weekday names, then six week rows of seven days.
 *
 * @param days - Grouped days of the page, which hold only days with events
 * @param rowsStart - The first row's first day, which is the first weekday
 * @param config - Card configuration, resolved for month
 * @param language - Card language
 * @param capacity - Lines that fit under a date, as the card last measured them
 * @param hass - Home Assistant instance
 * @param eventsTappable - Whether each bar and line is a tap target of its own
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
): TemplateResult {
  const weeks = monthWeeks(days, rowsStart, capacity);
  const headerMonth = Paging.majorityMonth({ start: rowsStart, days: ViewConfig.MONTH_DAYS });
  const translations = Localize.getTranslations(language);
  const mark = TextDirection.languageMark(language, hass);
  // A fixed card height is a real length; `height` defaults to the string `'auto'`.
  const fixedHeight = config.height != null && config.height !== '' && config.height !== 'auto';

  return html`
    <div
      class="month-container"
      style=${styleMap({
        // Handed to CSS as written, so `8em` and `calc()` survive. Under a fixed card height
        // the rows share it instead, and `row_height` is not read.
        '--calendar-card-month-row-height': fixedHeight
          ? 'minmax(0, 1fr)'
          : ViewConfig.resolveMonthOption(config, 'row_height'),
        ...(fixedHeight ? { height: '100%' } : {}),
      })}
    >
      <div class="month-weekdays">
        ${weeks[0].starts.map(
          (start) =>
            html`<div
              class=${classMap({
                'month-weekday': true,
                weekend: FormatUtils.isWeekendDate(start, hass),
              })}
            >
              ${TextDirection.inLanguageDirection(translations.daysOfWeek[start.getDay()], mark)}
            </div>`,
        )}
      </div>
      ${weeks.map((week, index) =>
        renderWeek(week, index, headerMonth, config, language, capacity, hass, eventsTappable),
      )}
      <div class=${MONTH_PROBE_CLASS} aria-hidden="true"></div>
    </div>
  `;
}

/**
 * How many lines fit under a date in a rendered month, or null where it is not laid out.
 *
 * Read from the first week row's height, less its date line, in line pitches. The probe
 * (`MONTH_PROBE_CLASS`) carries both: its width is a line's height and its height the date
 * line's, set in the stylesheet in the event font the lines and dates are set in. A row's height
 * depends on `row_height` or the card's, never on what is in it, so a capacity read here holds
 * for the render it causes.
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

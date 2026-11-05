/**
 * Searching the card's events: the span searched, the words each event is found by, the
 * results in the order and the groups the search panel draws them, and how a picked result is
 * found again on the card.
 *
 * Pure: no Lit, no DOM and no card, so every rule can be tested against a fixed `now`. The card
 * describes each event as its own rows draw it (`interaction/search-session.ts`), and the
 * panel draws what `findRows` answers (`rendering/search-panel.ts`).
 */

import { getCalendarDayDiff, getLocalDateKey, parseAllDayDate } from './format';
import * as Grid from './grid';
import { addDays, startOfDay } from './paging';
import type * as Types from '../config/types';
import * as ViewConfig from '../config/view';

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * The most results the panel draws, however many match. The count announced is the true one.
 *
 * Google Calendar's own search stops at 200 events, and so does this: past that nobody scrolls,
 * they type a letter more, and every row drawn is DOM the browser lays out again on each key.
 * Upcoming results come first, so the cap only ever cuts the past's oldest.
 */
export const SEARCH_RESULT_LIMIT = 200;

/**
 * The accents dropped before matching: the combining diacritical marks Latin, Greek and Cyrillic
 * letters decompose into. Not every combining mark: in Devanagari, Thai or Japanese kana a mark
 * is part of the letter, and dropping it would let が find か. A term without the mark still finds
 * the letter with it, as "e" finds "é": か finds が, whose mark Unicode's collation ranks with
 * the accents. Korean syllables decompose into their letters too, so 하 finds 한 as it is typed.
 */
const ACCENTS = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** The days searched: whole local calendar days, the last one's end excluded. */
export interface SearchWindow {
  /** Local midnight on this day a year ago. */
  start: Date;
  /** Local midnight after this day a year ahead. */
  end: Date;
  /** Calendar days from `start` to `end`. */
  days: number;
  /** The first day, `YYYY-MM-DD`, which tells one day's window from the next. */
  key: string;
}

/** Text folded for matching, and where each of its UTF-16 units came from in the original. */
export interface FoldedText {
  /** The text with its accents dropped, lower-cased in the card's language. */
  text: string;
  /**
   * For each unit of `text`, where the character it came from starts and ends in the original,
   * any accent written apart after it included. Absent where the two are the same text unit for
   * unit, as for plain ASCII.
   */
  map?: { from: number[]; to: number[] };
}

/** A part of a row's words, from one UTF-16 offset to another, the end excluded. */
export type TextRange = readonly [number, number];

/** What finds a picked event again on the card, whichever page shows it. */
export interface RingTarget {
  /** Its calendar. */
  entityId: string;
  /** Its identity, where Home Assistant gives it one. */
  uid?: string;
  recurrenceId?: string;
  /** Where it has none: when it starts, as Home Assistant wrote it, and its title. */
  start: string;
  summary: string;
}

/** One event the search can find, described as the card's own rows draw it. */
export interface SearchRow {
  /** Tells the row from every other one, and is what a pick names. */
  id: string;
  /** Its calendar. */
  entityId: string;
  /** Its title and location as the card draws them. */
  title: string;
  location: string;
  /** Its words folded for matching: the title, the location, and the description as drawn. */
  folded: { title: FoldedText; location: FoldedText; description: string };
  /** When it starts and ends, in epoch milliseconds; an all-day event at local midnights. */
  start: number;
  end: number;
  /** Its own local start day, `YYYY-MM-DD`: the day a pick pages to. */
  day: string;
  /** The month it starts in, `YYYY-MM`, and that month's heading as the card writes it. */
  monthKey: string;
  month: string;
  /** What the row draws after its title: the day, and the time as the card writes it. */
  dayText: string;
  timeText: string;
  /** Its calendar's color, and its calendar's name for assistive technology. */
  color: string;
  calendar: string;
  /** How a pick finds it on the card. */
  target: RingTarget;
}

/** A row the term was found in, and where in its words, to be marked. */
export interface SearchHit {
  row: SearchRow;
  title?: TextRange;
  location?: TextRange;
}

/** Results in one month, upcoming or past. */
export interface SearchGroup {
  /** The month, `YYYY-MM`, and whether it holds events that have ended. */
  key: string;
  past: boolean;
  /** Its heading, the month and year as the card writes them. */
  label: string;
  hits: SearchHit[];
}

/** What a term finds. */
export interface SearchResults {
  /** The term as typed. */
  term: string;
  /** Every match, however many are drawn. */
  total: number;
  /** The matches drawn, at most `SEARCH_RESULT_LIMIT`: upcoming by month, then past by month. */
  groups: SearchGroup[];
}

//-----------------------------------------------------------------------------
// THE WINDOW
//-----------------------------------------------------------------------------

/**
 * The same month and day a number of years away, the last day of the month where that month is
 * shorter, as February is a year after a February 29.
 *
 * @param day - A day at local midnight
 * @param years - Years to move, negative for earlier
 * @returns That day at local midnight
 */
function sameDayIn(day: Date, years: number): Date {
  const year = day.getFullYear() + years;
  const month = day.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day.getDate(), last));
}

/**
 * The days a search covers: from local midnight today a year ago to local midnight after today a
 * year ahead, half-open, as the card's own windows are. Built from local fields, so both ends are
 * midnights whatever daylight saving time does in between.
 *
 * @param now - The current moment
 * @returns The window
 */
export function searchWindow(now: Date): SearchWindow {
  const today = startOfDay(now);
  const start = sameDayIn(today, -1);
  const end = addDays(sameDayIn(today, 1), 1);
  return { start, end, days: getCalendarDayDiff(start, end), key: getLocalDateKey(start) };
}

/**
 * The configuration the card's own grouping (`groupEventsByDay`) describes a search's events
 * with, in the view on screen, since a pick pages the card in that view: the view's own, so
 * duplicates, splitting and the words drawn are the ones the card draws, opening on the
 * window's first day and spanning all of it, with every past event kept and no empty day made
 * up. A view's block outranks the shared value, and so does a view's own default (the grid's
 * `show_empty_days`, say), so those values are written into the view's block as well; the rest
 * of the block, the grid's hours among it, stays as configured.
 *
 * @param viewConfig - The configuration as it applies to the view on screen
 * @param window - The days searched
 * @param view - The view on screen
 * @returns The configuration to group with, in that view
 */
export function searchGroupingConfig(
  viewConfig: Types.Config,
  window: SearchWindow,
  view: Types.EffectiveView,
): Types.Config {
  const forced = {
    start_date: window.key,
    days_to_show: window.days,
    show_past_events: true,
    show_empty_days: false,
    show_empty_today: false,
  };
  const config: Record<string, unknown> = { ...viewConfig, ...forced };
  const blockKey = ViewConfig.VIEW_BLOCKS[view]?.blockKey;
  if (blockKey) {
    const block = viewConfig[blockKey];
    config[blockKey] = { ...(block && typeof block === 'object' ? block : {}), ...forced };
  }
  return config as unknown as Types.Config;
}

/**
 * The grouping as the view on screen draws it. Grid view draws a timed event's day only where it
 * reaches into the hours it shows (`renderDayBody`), so a day outside them is left out, by the
 * grid's own measure and test of it (`segmentMinutes`, `intersectsBand`), and an event none of
 * whose days reach in is not found. Every other view draws each day its grouping holds.
 *
 * @param days - The grouping, as `groupEventsByDay` returns it for the view
 * @param config - The configuration it was grouped with, which holds the grid's hours
 * @param view - The view on screen
 * @returns The days, as the view draws them
 */
export function drawnIn(
  days: Types.EventsByDay[],
  config: Types.Config,
  view: Types.EffectiveView,
): Types.EventsByDay[] {
  if (view !== 'grid') return days;
  const band = Grid.resolveBand(
    ViewConfig.resolveTimeGridOption(config, 'start_time'),
    ViewConfig.resolveTimeGridOption(config, 'end_time'),
  );
  return days.map((day) => ({
    ...day,
    events: day.events.filter((event) => {
      if (!event.start.dateTime) return true;
      const extent = Grid.segmentMinutes(event);
      return extent !== null && Grid.intersectsBand(extent.startMin, extent.endMin, band);
    }),
  }));
}

//-----------------------------------------------------------------------------
// OCCURRENCES
//-----------------------------------------------------------------------------

/** One event of a grouping, once, with when it really starts and ends. */
export interface Occurrence {
  /** Its row's display copy: the first day's, where it is split into days. */
  event: Types.CalendarEventData;
  /** When it starts and ends, as Home Assistant wrote them, and as instants. */
  startPoint: Types.CalendarEventData['start'];
  endPoint: Types.CalendarEventData['end'];
  start: Date;
  end: Date;
}

/**
 * Reads an event's start or end as an instant: its time, or local midnight on its date.
 *
 * @param point - The event's start or end
 * @returns The instant, or null where it has neither
 */
function instantOf(point: Types.CalendarEventData['start'] | undefined): Date | null {
  if (point?.dateTime) {
    const date = new Date(point.dateTime);
    return isNaN(date.getTime()) ? null : date;
  }
  return point?.date ? parseAllDayDate(point.date) : null;
}

/**
 * Every event a grouping draws, once each: a multi-day event the view splits into a row a day
 * is one event, found at its first day's row, with the start and end it really has.
 *
 * @param days - The grouping, as `groupEventsByDay` returns it
 * @returns The events, in the grouping's order
 */
export function occurrencesIn(days: ReadonlyArray<Types.EventsByDay>): Occurrence[] {
  const seen = new Set<string>();
  const blocks = new Map<Types.EntityConfig | undefined, number>();
  const occurrences: Occurrence[] = [];
  for (const day of days) {
    for (const event of day.events) {
      if (event._isEmptyDay) continue;
      const startPoint = event._gridSource?.start ?? event._sourceStart ?? event.start;
      const endPoint = event._gridSource?.end ?? event._sourceEnd ?? event.end;
      const start = instantOf(startPoint);
      const end = instantOf(endPoint);
      if (!start || !end) continue;
      if (event._isMultiDaySegment || event._gridSource) {
        if (!blocks.has(event._matchedConfig)) blocks.set(event._matchedConfig, blocks.size);
        const key = JSON.stringify([
          event._entityId,
          blocks.get(event._matchedConfig),
          start.getTime(),
          end.getTime(),
          event.summary,
        ]);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      occurrences.push({ event, startPoint, endPoint, start, end });
    }
  }
  return occurrences;
}

//-----------------------------------------------------------------------------
// FINDING
//-----------------------------------------------------------------------------

const lowerCaseLocales = new Map<string, string | undefined>();

/**
 * The locale to lower-case in, or undefined for the default where the language is not one `Intl`
 * accepts.
 *
 * @param language - The card's language
 * @returns A locale for `toLocaleLowerCase`
 */
function lowerCaseLocale(language: string): string | undefined {
  if (!lowerCaseLocales.has(language)) {
    let locale: string | undefined;
    try {
      locale = Intl.getCanonicalLocales(language)[0];
    } catch {
      locale = undefined;
    }
    lowerCaseLocales.set(language, locale);
  }
  return lowerCaseLocales.get(language);
}

/**
 * One character folded: lower-cased in the card's language, then decomposed and its accents
 * dropped, those Lithuanian's lower case adds among them. Lower case comes first because the
 * accent can be the letter's case: Turkish lower-cases İ to i and a bare I to dotless ı, so
 * dropping İ's dot first would leave İstanbul out of a search for "istanbul". A Greek final
 * sigma reads as any other sigma.
 *
 * @param char - One code point
 * @param locale - The locale to lower-case in
 * @returns What it folds to, possibly nothing, possibly more than one unit
 */
function foldChar(char: string, locale: string | undefined): string {
  return char.toLocaleLowerCase(locale).normalize('NFD').replace(ACCENTS, '').replace(/ς/g, 'σ');
}

/**
 * Folds text for matching, ignoring case and accents: lower-cased in the card's language, then
 * decomposed with NFD and its combining accents dropped. Kept with where each folded unit came
 * from, so a match can be marked in the words as drawn.
 *
 * @param text - The words
 * @param language - The card's language
 * @returns The folded text
 */
export function foldText(text: string, language: string): FoldedText {
  const locale = lowerCaseLocale(language);
  // Plain ASCII folds unit for unit: lower case alone, in the card's language for a Turkish I.
  if (/^[\t\n\r\x20-\x7e]*$/.test(text)) return { text: text.toLocaleLowerCase(locale) };

  let folded = '';
  const from: number[] = [];
  const to: number[] = [];
  for (let at = 0; at < text.length;) {
    const width = (text.codePointAt(at) ?? 0) > 0xffff ? 2 : 1;
    const piece = foldChar(text.slice(at, at + width), locale);
    for (let unit = 0; unit < piece.length; unit += 1) {
      from.push(at);
      to.push(at + width);
    }
    // An accent written apart from its letter folds to nothing and belongs to the letter before
    // it, so a match ending on that letter is marked with its accent and does not strand it.
    for (let unit = to.length - 1; piece === '' && unit >= 0 && to[unit] === at; unit -= 1) {
      to[unit] = at + width;
    }
    folded += piece;
    at += width;
  }
  return { text: folded, map: { from, to } };
}

/**
 * Where a folded term first stands in folded words, as a range of the words as drawn. A term
 * folded to nothing is found nowhere.
 *
 * @param words - The words, folded
 * @param term - The term, folded
 * @returns The range in the original words, or undefined
 */
export function matchIn(words: FoldedText, term: string): TextRange | undefined {
  if (!term) return undefined;
  const at = words.text.indexOf(term);
  if (at < 0) return undefined;
  const last = at + term.length - 1;
  return words.map ? [words.map.from[at], words.map.to[last]] : [at, last + 1];
}

/**
 * What a term finds among the rows: every row whose title, location or description holds it from
 * its first letter on, ignoring case and accents. Upcoming first, every event that has not ended
 * yet by when it starts, then the past, the most recent first; each grouped by the month it
 * starts in. At most `limit` are drawn, and `total` counts them all. No term finds nothing.
 *
 * @param rows - Every row the search can find
 * @param term - The term as typed
 * @param language - The card's language
 * @param now - The current moment, in epoch milliseconds
 * @param limit - The most rows drawn
 * @returns The results
 */
export function findRows(
  rows: ReadonlyArray<SearchRow>,
  term: string,
  language: string,
  now: number,
  limit: number = SEARCH_RESULT_LIMIT,
): SearchResults {
  const query = foldText(term.trim(), language).text;
  if (!query) return { term, total: 0, groups: [] };

  const upcoming: SearchHit[] = [];
  const past: SearchHit[] = [];
  for (const row of rows) {
    const title = matchIn(row.folded.title, query);
    const location = matchIn(row.folded.location, query);
    if (!title && !location && !row.folded.description.includes(query)) continue;
    (row.end > now ? upcoming : past).push({ row, title, location });
  }
  upcoming.sort((a, b) => a.row.start - b.row.start || a.row.end - b.row.end);
  past.sort((a, b) => b.row.start - a.row.start || b.row.end - a.row.end);

  const groups: SearchGroup[] = [];
  const drawn = [...upcoming, ...past].slice(0, Math.max(0, limit));
  drawn.forEach((hit, index) => {
    const isPast = index >= upcoming.length;
    const last = groups[groups.length - 1];
    if (last && last.key === hit.row.monthKey && last.past === isPast) {
      last.hits.push(hit);
    } else {
      groups.push({ key: hit.row.monthKey, past: isPast, label: hit.row.month, hits: [hit] });
    }
  });

  return { term, total: upcoming.length + past.length, groups };
}

//-----------------------------------------------------------------------------
// FINDING A PICK AGAIN
//-----------------------------------------------------------------------------

/**
 * How an event's start is written, as Home Assistant returned it: its time, or its date.
 *
 * @param event - Any copy of the event
 * @returns The start, or an empty string where it has none
 */
function sourceStart(event: Types.CalendarEventData): string {
  const start =
    event._source?.start ?? event._gridSource?.start ?? event._sourceStart ?? event.start;
  return start?.dateTime ?? start?.date ?? '';
}

/**
 * What finds an event again on the card: its calendar, and its uid and recurrence id where Home
 * Assistant gives them, else when it starts and its title as Home Assistant returned them.
 *
 * @param event - The event's display copy
 * @returns The target
 */
export function ringTargetOf(event: Types.CalendarEventData): RingTarget {
  const source = event._source;
  return {
    entityId: event._entityId ?? '',
    uid: source?.uid || undefined,
    recurrenceId: source?.recurrence_id || undefined,
    start: sourceStart(event),
    summary: source?.summary ?? event.summary ?? '',
  };
}

/**
 * Whether one of the card's events is the one a pick names: the same calendar, and the same uid
 * and recurrence id where the pick has a uid, else the same start and title. Every day of a
 * multi-day event the card splits is the event.
 *
 * @param event - One of the card's display copies
 * @param target - The pick
 * @returns True for the event picked
 */
export function isRingTarget(event: Types.CalendarEventData, target: RingTarget): boolean {
  if (event._isEmptyDay || event._entityId !== target.entityId) return false;
  const source = event._source;
  if (target.uid) {
    return (
      source?.uid === target.uid && (source?.recurrence_id || undefined) === target.recurrenceId
    );
  }
  return (
    !source?.uid &&
    sourceStart(event) === target.start &&
    (source?.summary ?? event.summary ?? '') === target.summary
  );
}

/**
 * A grouping with the picked event marked to be rung (`_searchRing`), on a copy of each of its
 * rows, and whether any was. The grouping itself where nothing is picked, so nothing about a
 * card no search touched changes.
 *
 * @param days - The days the card draws
 * @param target - The pick, or null
 * @returns The days to draw, and whether the pick is among them
 */
export function ringIn(
  days: Types.EventsByDay[],
  target: RingTarget | null,
): { days: Types.EventsByDay[]; found: boolean } {
  if (!target) return { days, found: false };
  let found = false;
  const marked = days.map((day) => {
    if (!day.events.some((event) => isRingTarget(event, target))) return day;
    found = true;
    return {
      ...day,
      events: day.events.map((event) =>
        isRingTarget(event, target) ? { ...event, _searchRing: true } : event,
      ),
    };
  });
  return { days: found ? marked : days, found };
}

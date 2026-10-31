/**
 * Paging through dates: which days a page covers, where the arrows lead, and what the
 * toolbar calls a page: the month it starts in, and the dates it covers.
 *
 * Pure and free of Lit, the DOM and the card, so every rule can be tested against a fixed
 * `now`. Every date here is a local calendar day at midnight, built from local fields, so a
 * page that crosses a daylight-saving change is still a whole number of calendar days long.
 *
 * A page is a start day and a length. Home is the page the card opens with: its configured
 * window, or, while column or grid view drops columns to fit the card, the slice of that
 * window the card draws, which starts at today when it can. The arrows move by exactly the
 * days on screen, so pages join up with no gap and no overlap.
 */

import { getCalendarDayDiff, getLocalDateKey, parseAllDayDate } from './format';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** A run of whole calendar days. */
export interface PageRange {
  /** The first day, at local midnight. */
  start: Date;
  /** How many days the page covers, at least one. */
  days: number;
}

//-----------------------------------------------------------------------------
// DATE ARITHMETIC
//-----------------------------------------------------------------------------

/**
 * Local midnight of the day a moment falls on.
 *
 * @param date - Any moment
 * @returns Midnight that day
 */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The day a number of calendar days away, at local midnight.
 *
 * From local fields rather than by adding milliseconds, so a day either side of a
 * daylight-saving change still lands on the right date.
 *
 * @param date - Starting day
 * @param days - Days to move, negative for earlier
 * @returns Midnight of the day reached
 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * A page start as the card keeps it: the day's local date key.
 *
 * @param date - Page start
 * @returns `YYYY-MM-DD`
 */
export function pageKey(date: Date): string {
  return getLocalDateKey(date);
}

/**
 * The page start a key names.
 *
 * @param key - `YYYY-MM-DD`
 * @returns Local midnight of that day
 */
export function pageStart(key: string): Date {
  return parseAllDayDate(key);
}

//-----------------------------------------------------------------------------
// PAGES
//-----------------------------------------------------------------------------

/**
 * How many days one page covers: every configured day, or the day columns drawn while
 * column or grid view drops some to fit the card's width.
 *
 * @param daysToShow - `days_to_show`
 * @param shownColumns - Day columns drawn, `0` for as many as there are days (and in list view)
 * @returns Days per page, at least one
 */
export function pageSpan(daysToShow: number, shownColumns: number): number {
  const configured = Math.max(1, Math.floor(daysToShow) || 1);
  return shownColumns > 0 && shownColumns < configured ? shownColumns : configured;
}

/**
 * The page the card opens with.
 *
 * With every configured day drawn it is the configured window. With fewer columns drawn it
 * is the slice the card draws there: from today when today is in the window, held inside
 * the window at either end. That is the rule `visibleDayWindowStart` applies to the drawn
 * days, written here over dates so a page can be named before anything is drawn.
 *
 * @param windowStart - First day of the configured window
 * @param daysToShow - `days_to_show`
 * @param shownColumns - Day columns drawn, `0` for as many as there are days
 * @param now - The current moment
 * @returns Home
 */
export function homeRange(
  windowStart: Date,
  daysToShow: number,
  shownColumns: number,
  now: Date,
): PageRange {
  const start = startOfDay(windowStart);
  const configured = Math.max(1, Math.floor(daysToShow) || 1);
  const days = pageSpan(configured, shownColumns);
  if (days === configured) return { start, days };

  const fromStart = getCalendarDayDiff(start, startOfDay(now));
  const offset = Math.min(Math.max(fromStart, 0), configured - days);
  return { start: addDays(start, offset), days };
}

/**
 * The page before or after one, as long as it is.
 *
 * @param start - First day of the current page
 * @param days - Days per page
 * @param direction - `-1` for the previous page, `1` for the next
 * @returns First day of the page reached
 */
export function stepPage(start: Date, days: number, direction: -1 | 1): Date {
  return addDays(start, direction * days);
}

/**
 * The page that holds a day, lined up with home, so a card that pages by weeks lands on the
 * week the day falls in rather than on a week starting that day.
 *
 * @param date - Any moment on the day wanted
 * @param home - The page the card opens with
 * @param days - Days per page
 * @returns First day of the page holding `date`
 */
export function pageContaining(date: Date, home: PageRange, days: number): Date {
  const span = Math.max(1, days);
  const offset = getCalendarDayDiff(home.start, startOfDay(date));
  return addDays(home.start, Math.floor(offset / span) * span);
}

/**
 * Whether a page covers a day.
 *
 * @param range - The page
 * @param date - Any moment on the day
 * @returns True when the day is one of the page's
 */
export function rangeContains(range: PageRange, date: Date): boolean {
  const offset = getCalendarDayDiff(range.start, startOfDay(date));
  return offset >= 0 && offset < range.days;
}

//-----------------------------------------------------------------------------
// WORDS
//-----------------------------------------------------------------------------

/**
 * A locale `Intl` accepts for a card language.
 *
 * The card's language codes are BCP 47 already (`de`, `en-GB`, `zh-CN`), so this only
 * guards against a value `Intl` rejects, which would otherwise throw out of a render.
 *
 * @param language - Card language
 * @returns The language, or `en`
 */
function intlLocale(language: string): string {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([language]).length > 0 ? language : 'en';
  } catch {
    return 'en';
  }
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * A cached date format for a language and a set of fields.
 *
 * @param language - Card language
 * @param withYear - Whether the year is part of it
 * @param withWeekday - Whether the weekday is part of it
 * @returns The format
 */
function dateFormat(
  language: string,
  withYear: boolean,
  withWeekday: boolean,
): Intl.DateTimeFormat {
  const key = `${language}|${withYear ? 'y' : ''}|${withWeekday ? 'w' : ''}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(language), {
      ...(withWeekday ? { weekday: 'short' as const } : {}),
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' as const } : {}),
    });
    dateFormats.set(key, format);
  }
  return format;
}

/**
 * The year whose New Year's Day is nearest to a moment: this one until the start of July, the
 * next one from then on.
 *
 * @param now - The current moment
 * @returns That year
 */
function nearestNewYear(now: Date): number {
  const year = now.getFullYear();
  const sinceThis = now.getTime() - new Date(year, 0, 1).getTime();
  const untilNext = new Date(year + 1, 0, 1).getTime() - now.getTime();
  return sinceThis <= untilNext ? year : year + 1;
}

/**
 * Name a page in the card's language: "Oct 27 – Nov 2", or "Tue, Oct 27" for a single day.
 *
 * The year is named only where it is not the one the reader assumes. A page in the current
 * year goes without it. So does a page across the turn of the year nearest today, which
 * reads as that turn: the last week of December in late autumn, the first week of January
 * all spring. Any other page names its year, once, at its end ("Mar 1 – 7, 2027", "Dec 28 –
 * Jan 3, 2027"). The toolbar's month heading names a page by its first month; this is its
 * tooltip, and what assistive technology hears.
 *
 * `Intl` rather than the card's own month names, because it knows each language's order and
 * range punctuation ("27. Okt. – 2. Nov.", "27 באוק׳–2 בנוב׳"), and it costs the card's 36
 * translation files nothing. A page across a turn of the year is joined by hand, from each day
 * and the language's own separator, because `formatRange` names both years of such a range
 * whatever its options say.
 *
 * @param range - The page
 * @param language - Card language
 * @param now - The current moment, which decides whether the year is named
 * @returns The page's name
 */
export function rangeLabel(range: PageRange, language: string, now: Date): string {
  const start = startOfDay(range.start);
  const end = addDays(start, Math.max(1, range.days) - 1);
  const year = now.getFullYear();

  if (range.days <= 1) {
    return dateFormat(language, start.getFullYear() !== year, true).format(start);
  }

  if (start.getFullYear() === end.getFullYear()) {
    const format = dateFormat(language, start.getFullYear() !== year, false) as RangeFormat;
    const separator = rangeSeparator(dateFormat(language, false, false) as RangeFormat);
    return typeof format.formatRange === 'function'
      ? format.formatRange(start, end)
      : `${format.format(start)}${separator}${format.format(end)}`;
  }

  const withYear = end.getFullYear() !== nearestNewYear(now);
  const startFormat = dateFormat(language, false, false) as RangeFormat;
  const endFormat = dateFormat(language, withYear, false);
  return `${startFormat.format(start)}${rangeSeparator(startFormat)}${endFormat.format(end)}`;
}

/**
 * `Intl.DateTimeFormat` with its range methods, which are ES2021: beyond the library this
 * project types against, and older than the browsers the bundle already requires.
 */
type RangeFormat = Intl.DateTimeFormat & {
  formatRange?: (from: Date, to: Date) => string;
  formatRangeToParts?: (from: Date, to: Date) => Array<{ value: string; source?: string }>;
};

const separators = new WeakMap<Intl.DateTimeFormat, string>();

/**
 * The text a language puts between the two ends of a range: " – " in English, "–" in Hebrew,
 * "~" in Korean.
 *
 * Read off a range across two months of one year: the text between the last part of its start
 * and the first of its end. Some languages end every date with a suffix that `formatRange`
 * writes once for both ends — Korean's "일", Hungarian's "." — so it opens that text and
 * closes the range; it belongs to the date, which `format` writes in full, and is taken off.
 *
 * @param format - The format the range is written in
 * @returns The separator, or " – " where the browser cannot say
 */
function rangeSeparator(format: RangeFormat): string {
  let separator = separators.get(format);
  if (separator === undefined) {
    const parts =
      typeof format.formatRangeToParts === 'function'
        ? format.formatRangeToParts(new Date(2000, 0, 31), new Date(2000, 1, 1))
        : [];
    const lastStart = parts.map((part) => part.source).lastIndexOf('startRange');
    const firstEnd = parts.findIndex((part) => part.source === 'endRange');
    const lastEnd = parts.map((part) => part.source).lastIndexOf('endRange');
    const join = (from: number, to: number) =>
      parts
        .slice(from, to)
        .map((part) => part.value)
        .join('');
    const between = lastStart >= 0 && firstEnd > lastStart ? join(lastStart + 1, firstEnd) : '';
    const suffix = lastEnd >= 0 ? join(lastEnd + 1, parts.length) : '';
    const trimmed = suffix && between.startsWith(suffix) ? between.slice(suffix.length) : between;
    separator = trimmed || ' – ';
    separators.set(format, separator);
  }
  return separator;
}

/** How the month heading names a month: in full, or in the language's short form. */
export type MonthForm = 'long' | 'short';

/**
 * The format `monthHeading` writes, `Intl`'s month and year in the card's language.
 *
 * @param language - Card language
 * @param form - The month in full or short
 * @returns The format
 */
function monthFormat(language: string, form: MonthForm): Intl.DateTimeFormat {
  const key = `${language}|month|${form}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(language), { month: form, year: 'numeric' });
    dateFormats.set(key, format);
  }
  return format;
}

/** The letters that open a literal, which after a month written as a number are its unit: 月. */
const MONTH_UNIT = /^\p{L}+/u;

/** One run of a month heading's words: the month's own name, or what stands around it. */
export interface MonthHeadingPart {
  text: string;
  /** True for the month's name, which the toolbar sets bold; the year and the rest stay regular. */
  month: boolean;
}

/** A month heading as runs, in reading order, which joined give its words. */
export type MonthHeadingText = ReadonlyArray<MonthHeadingPart>;

/**
 * Name the month a page starts in, with its year, as the toolbar's heading, in runs that tell
 * the month's name from the rest: "November" and " 2026", or in the short form "Nov" and " 2026".
 *
 * Always the month of the first day, never two: the week of Nov 30 – Dec 6 reads "November
 * 2026", as a desktop calendar's week view does. `Intl` writes it in the card's language, in the
 * form a language uses for a month standing on its own ("listopad 2026", not the genitive a
 * date takes), so the card needs no month names of its own. Where the label starts with the
 * month it is capitalized in that language's own casing, as a heading is; a label that starts
 * with the year ("2026 m. lapkritis") is left as `Intl` writes it, since its month is mid-phrase.
 *
 * Which run is the month comes from `Intl`'s own parts, never from where a word stands, since
 * the order is the language's: "2026년 11월" ends with it, and "2026年11月" holds it between two
 * literals. Where the month is a bare number, the letters written straight after it are its unit
 * and count as the month: Chinese writes 月 as a literal of its own, where Korean's 월 is already
 * part of the month, and "2026年11月" has its month in "11月" all the same. A space or punctuation
 * after the number ("11.2026 г.", "11/2026") is no unit and stays apart. The parts only mark
 * the boundaries. Their literals are not always `format`'s, which
 * writes a plain space where they write a no-break one in Russian, Ukrainian and Bulgarian, so
 * the words are `format`'s, cut at the parts' lengths, and read exactly as they always have. An
 * engine whose parts do not add up to its own text gets the words in one plain run.
 *
 * @param date - Any day of the month, usually the first day on screen
 * @param language - Card language
 * @param form - The month in full or short
 * @returns The heading, in runs
 */
export function monthHeadingParts(
  date: Date,
  language: string,
  form: MonthForm = 'long',
): MonthHeadingText {
  const format = monthFormat(language, form);
  const parts = format.formatToParts(date);
  let text = format.format(date);
  if (parts[0]?.type === 'month') {
    const locale = format.resolvedOptions().locale;
    text = text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
  }
  if (parts.reduce((length, part) => length + part.value.length, 0) !== text.length) {
    return [{ text, month: false }];
  }

  const runs: MonthHeadingPart[] = [];
  const push = (run: string, month: boolean) => {
    if (!run) return;
    const last = runs[runs.length - 1];
    if (last && last.month === month) last.text += run;
    else runs.push({ text: run, month });
  };
  let offset = 0;
  parts.forEach((part, i) => {
    let run = text.slice(offset, offset + part.value.length);
    offset += part.value.length;
    const previous = parts[i - 1];
    if (part.type === 'literal' && previous?.type === 'month' && /^\d+$/.test(previous.value)) {
      const unit = MONTH_UNIT.exec(run)?.[0] ?? '';
      push(unit, true);
      run = run.slice(unit.length);
    }
    push(run, part.type === 'month');
  });
  return runs;
}

/**
 * The month heading's words, as one string: `monthHeadingParts` joined.
 *
 * @param date - Any day of the month, usually the first day on screen
 * @param language - Card language
 * @param form - The month in full or short
 * @returns The heading
 */
export function monthHeading(date: Date, language: string, form: MonthForm = 'long'): string {
  return monthHeadingText(monthHeadingParts(date, language, form));
}

/**
 * Join a month heading's runs into its words.
 *
 * @param heading - The heading, in runs
 * @returns Its words
 */
export function monthHeadingText(heading: MonthHeadingText): string {
  return heading.map((part) => part.text).join('');
}

const monthHeadingSets = new Map<string, ReadonlyArray<MonthHeadingText>>();

/**
 * Every month's heading in one year, in one form and language, so the toolbar can keep the room
 * of the widest and paging never moves the controls beside it.
 *
 * The browser picks the widest, from the twelve laid over one another in the card's own font,
 * so no character count stands in for a width. The year is fixed: the heading's figures are
 * tabular, so every four-digit year is as wide as any other.
 *
 * @param language - Card language
 * @param form - The month in full or short
 * @returns Twelve headings, in runs, January first
 */
export function monthHeadings(
  language: string,
  form: MonthForm = 'long',
): ReadonlyArray<MonthHeadingText> {
  const key = `${language}|${form}`;
  let headings = monthHeadingSets.get(key);
  if (!headings) {
    headings = Array.from({ length: 12 }, (_, month) =>
      monthHeadingParts(new Date(2000, month, 1), language, form),
    );
    monthHeadingSets.set(key, headings);
  }
  return headings;
}

const todayWords = new Map<string, string>();

/**
 * The language's own word for "today", capitalized, from `Intl.RelativeTimeFormat`, which
 * knows it in every card language; a browser without data for one answers in English.
 *
 * @param language - Card language
 * @returns "Today", "Heute", "Aujourd’hui", …
 */
export function todayWord(language: string): string {
  let word = todayWords.get(language);
  if (word === undefined) {
    const locale = intlLocale(language);
    const raw = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'day');
    word = raw.charAt(0).toLocaleUpperCase(locale) + raw.slice(1);
    todayWords.set(language, word);
  }
  return word;
}

/**
 * What the home button is called: "Today" while home holds today, which is every card whose
 * window starts today or before it, and otherwise the day home starts on, so the name says
 * where the button goes. Its tooltip and its accessible name; the button itself is an icon.
 *
 * @param home - The page the card opens with
 * @param language - Card language
 * @param now - The current moment
 * @returns The button's name
 */
export function homeButtonName(home: PageRange, language: string, now: Date): string {
  if (rangeContains(home, now)) return todayWord(language);
  return rangeLabel({ start: home.start, days: 1 }, language, now);
}

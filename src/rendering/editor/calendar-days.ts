/**
 * The card's day arithmetic, as Split's review needs it: local dates, the first day of the week,
 * the weekend, a full day's span and the time a row shows. Mirrored from `utils/format.ts` rather
 * than imported, because that module brings every card translation and Day.js locale with it,
 * which would more than double what Split costs the editor.
 *
 * DOM-free. `tests/editor-split-review.test.ts` pins each helper against the card's own, over
 * every country and language code they are asked about, and the tables by value, so a change
 * to the card's that is not made here fails there.
 */

import { getTimeFormat24h } from '../../utils/helpers';

/** `format.ts` › `WEEKEND_BY_COUNTRY`: where the weekend is not Saturday and Sunday. */
export const WEEKEND_BY_COUNTRY: Readonly<Record<string, readonly number[]>> = {
  AF: [4, 5],
  BH: [5, 6],
  DZ: [5, 6],
  EG: [5, 6],
  IL: [5, 6],
  IN: [0],
  IQ: [5, 6],
  IR: [5],
  JO: [5, 6],
  KW: [5, 6],
  LY: [5, 6],
  OM: [5, 6],
  QA: [5, 6],
  SA: [5, 6],
  SD: [5, 6],
  SY: [5, 6],
  UG: [0],
  YE: [5, 6],
};

/** `format.ts` › `WEEKEND_BY_LOCALE`, for a home with no country set. */
const WEEKEND_BY_LOCALE: Readonly<Record<string, readonly number[]>> = {
  ar: [5, 6],
  fa: [5],
  he: [5, 6],
  hi: [0],
  ml: [0],
  ta: [0],
  te: [0],
};

/** `format.ts` › `FIRST_DAY_BY_LOCALE`: where the week does not start on Monday. */
const FIRST_DAY_BY_LOCALE: Readonly<Record<string, number>> = {
  af: 0,
  ar: 6,
  bn: 0,
  en: 0,
  'en-gb': 1,
  fa: 6,
  he: 0,
  hi: 0,
  id: 0,
  is: 0,
  ja: 0,
  ko: 0,
  ml: 0,
  pt: 0,
  'pt-br': 0,
  ta: 0,
  te: 0,
  th: 0,
  ur: 0,
  'zh-hans': 1,
  'zh-hant': 0,
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The parts of Home Assistant the weekend and the week's first day are read from. */
export interface Home {
  readonly config?: { readonly country?: string | null };
  readonly locale?: {
    readonly language?: string;
    readonly first_weekday?: string;
    readonly time_format?: string;
  };
}

/**
 * A tag's entry in a table: the full tag, then its base language.
 *
 * @param table - The table
 * @param tag - A language tag
 * @returns The entry, if any
 */
function byTag<T>(table: Readonly<Record<string, T>>, tag: string): T | undefined {
  const key = tag.toLowerCase();
  return table[key] ?? table[key.split('-')[0]];
}

/**
 * `format.ts` › `getFirstDayOfWeek`.
 *
 * @param configured - `first_day_of_week`
 * @param locale - Home Assistant's locale
 * @returns 0 for Sunday to 6 for Saturday
 */
export function firstDayOfWeek(configured: unknown, locale?: Home['locale']): number {
  if (configured === 'sunday') return 0;
  if (configured === 'monday') return 1;
  const explicit = WEEKDAYS.indexOf(locale?.first_weekday ?? '');
  if (explicit !== -1) return explicit;
  return locale?.language ? (byTag(FIRST_DAY_BY_LOCALE, locale.language) ?? 1) : 1;
}

/**
 * `format.ts` › `isWeekendDate`: the home's country, else its language, else Saturday and Sunday.
 *
 * @param date - A date
 * @param home - Home Assistant
 * @returns True on a weekend day
 */
export function isWeekend(date: Date, home?: Home | null): boolean {
  const country = home?.config?.country;
  const language = home?.locale?.language;
  const days = country
    ? (WEEKEND_BY_COUNTRY[country.toUpperCase()] ?? [0, 6])
    : language
      ? (byTag(WEEKEND_BY_LOCALE, language) ?? [0, 6])
      : [0, 6];
  return days.includes(date.getDay());
}

/**
 * `format.ts` › `parseAllDayDate`: local midnight of a `YYYY-MM-DD` date.
 *
 * @param text - The date
 * @returns The date
 */
export function parseDate(text: string): Date {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * `format.ts` › `getLocalDateKey`.
 *
 * @param date - A date
 * @returns `YYYY-MM-DD` in local time
 */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Whole local days from one date to another, as `format.ts` › `getCalendarDayDiff` counts them.
 *
 * @param from - A date
 * @param to - Another
 * @returns The days between their dates
 */
function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
      Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
      86400000,
  );
}

/**
 * A wall-clock reading in milliseconds since its date's 00:00.
 *
 * @param date - An instant
 * @returns Its time of day
 */
function timeOfDay(date: Date): number {
  return (
    ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 +
    date.getMilliseconds()
  );
}

/**
 * `format.ts` › `fullDaySpan`, reduced to its question: whether an event is a full day or longer
 * on the wall clock, over two or more dates.
 *
 * @param start - Its start, as Home Assistant sent it
 * @param end - Its end
 * @returns True where it is
 */
export function spansFullDays(
  start: { readonly date?: string; readonly dateTime?: string } | undefined,
  end: { readonly date?: string; readonly dateTime?: string } | undefined,
): boolean {
  let first: Date;
  let last: Date;
  if (start?.date && end?.date) {
    first = parseDate(start.date);
    last = parseDate(end.date);
    last.setDate(last.getDate() - 1);
  } else if (start?.dateTime && end?.dateTime) {
    first = new Date(start.dateTime);
    const until = new Date(end.dateTime);
    const later = daysBetween(first, until);
    if (!(later >= 2 || (later === 1 && timeOfDay(until) >= timeOfDay(first)))) return false;
    last = new Date(until.getTime() - 1);
  } else {
    return false;
  }
  return daysBetween(first, last) + 1 >= 2;
}

/**
 * A time as the card writes one (`format.ts` › `formatTime`), on the clock it resolves
 * (`resolveTimeFormat24h`): `time_24h` where set, else Home Assistant's, else 12 hours.
 *
 * @param date - The time
 * @param config - `time_24h` and `time_two_digit_hours`
 * @param home - Home Assistant
 * @returns "16:00", "4:00 PM"
 */
export function formatTime(
  date: Date,
  config: { readonly time_24h?: unknown; readonly time_two_digit_hours?: unknown },
  home?: Home | null,
): string {
  const use24h =
    config.time_24h === true ||
    (config.time_24h !== false && getTimeFormat24h(home?.locale, false));
  const pad = (n: number): string => String(n).padStart(2, '0');
  let hours = date.getHours();
  const minutes = pad(date.getMinutes());
  const meridiem = use24h ? '' : hours >= 12 ? ' PM' : ' AM';
  if (!use24h) hours = hours % 12 || 12;
  return `${config.time_two_digit_hours ? pad(hours) : hours}:${minutes}${meridiem}`;
}

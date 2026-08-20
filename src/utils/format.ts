/**
 * Formatting utilities for Calendar Card Pro
 * Handles formatting of dates, times, and locations for display.
 */

import * as Helpers from './helpers';
import * as Logger from './logger';
import * as Constants from '../config/constants';
import * as Types from '../config/types';
import { getRelativeTimeString } from '../translations/dayjs';
import * as Localize from '../translations/localize';

//-----------------------------------------------------------------------------
// HIGH-LEVEL PUBLIC APIs
//-----------------------------------------------------------------------------

/**
 * Does this event span more than one day *as an all-day event*?
 * iCal all-day end dates are exclusive, so the visible end is one day earlier.
 *
 * @param event Calendar event
 * @returns True for an all-day event whose start and (inclusive) end fall on different days
 */
export function isMultiDayAllDayEvent(event: Types.CalendarEventData): boolean {
  if (event.start.dateTime) return false;

  const startDate = parseAllDayDate(event.start.date || '');
  const inclusiveEndDate = parseAllDayDate(event.end.date || '');
  inclusiveEndDate.setDate(inclusiveEndDate.getDate() - 1);

  return startDate.toDateString() !== inclusiveEndDate.toDateString();
}

/**
 * Generates a human-readable time string for calendar events
 *
 * @param event Calendar event
 * @param config Card configuration
 * @param language Language code
 * @param hass Home Assistant object for system time format detection
 * @returns Formatted time string
 */
export function formatEventTime(
  event: Types.CalendarEventData,
  config: Types.Config,
  language: string,
  hass?: Types.Hass | null,
): string {
  const isAllDayEvent = !event.start.dateTime;

  let startDate;
  let endDate;

  if (isAllDayEvent) {
    startDate = parseAllDayDate(event.start.date || '');
    endDate = parseAllDayDate(event.end.date || '');
  } else {
    startDate = new Date(event.start.dateTime || '');
    endDate = new Date(event.end.dateTime || '');
  }

  const translations = Localize.getTranslations(language);

  if (isAllDayEvent) {
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);

    if (startDate.toDateString() !== adjustedEndDate.toDateString()) {
      return capitalizeFirstLetter(
        formatMultiDayAllDayTime(adjustedEndDate, language, translations),
      );
    }

    return capitalizeFirstLetter(translations.allDay);
  }

  const useNativeFormatting = !!(config.time_24h === 'system' && hass?.locale);
  const use24h = config.time_24h === true;

  if (startDate.toDateString() !== endDate.toDateString()) {
    return capitalizeFirstLetter(
      formatMultiDayTime(
        startDate,
        endDate,
        language,
        translations,
        useNativeFormatting,
        use24h,
        config.time_two_digit_hours,
        hass,
      ),
    );
  }

  return capitalizeFirstLetter(
    formatSingleDayTime(
      startDate,
      endDate,
      config.show_end_time,
      useNativeFormatting,
      use24h,
      config.time_two_digit_hours,
      hass,
    ),
  );
}

/**
 * Generates a localized countdown string for an event
 * All-day and split multi-day rows count calendar days rather than remaining hours.
 *
 * @param event Calendar event to generate countdown for
 * @param language Language to use
 * @returns Countdown string or null if event is past or empty day
 */
export function getCountdownString(
  event: Types.CalendarEventData,
  language: string = 'en',
): string | null {
  if (event._isEmptyDay || !event.start) return null;

  const now = new Date();
  const isAllDayEvent = !event.start.dateTime;
  const startDate = event.start.dateTime
    ? new Date(event.start.dateTime)
    : event.start.date
      ? parseAllDayDate(event.start.date)
      : null;

  if (!startDate || startDate <= now) return null;

  const countsCalendarDays = isAllDayEvent || Boolean(event._isMultiDaySegment);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEventDay = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );

  if (countsCalendarDays && startOfEventDay > startOfToday) {
    return getRelativeTimeString(startOfEventDay, language, startOfToday);
  }

  return getRelativeTimeString(startDate, language);
}

/**
 * Compiled `remove_location_country` patterns, including the ones that failed to compile.
 *
 * The option is free text in the editor and unvalidated in YAML, so the expression it
 * holds may not be a valid regular expression at all. Compiling is therefore attempted
 * once per distinct pattern and the outcome remembered — a `null` entry marks a pattern
 * known to be broken. Without the cache a malformed pattern would warn once per event per
 * render; with it, the warning is emitted once and the failed compile is not retried.
 */
const countryPatternCache = new Map<string, RegExp | null>();

/**
 * Compiles a country-removal pattern, tolerating an invalid one.
 *
 * @param removeCountry - User-supplied pattern
 * @returns The compiled expression, or `null` when it is not a valid regular expression
 */
function compileCountryPattern(removeCountry: string): RegExp | null {
  if (countryPatternCache.has(removeCountry)) return countryPatternCache.get(removeCountry) ?? null;

  let compiled: RegExp | null = null;

  try {
    compiled = new RegExp(`(${removeCountry})\\s*$`, 'i');
  } catch {
    Logger.warn(
      `Ignoring "remove_location_country": ${JSON.stringify(removeCountry)} is not a valid ` +
        `regular expression. Locations are shown unchanged.`,
    );
  }

  countryPatternCache.set(removeCountry, compiled);

  return compiled;
}

/**
 * Format location string, optionally removing country code
 *
 * @param location - Location string to format
 * @param removeCountry - Boolean (true/false) or string pattern of countries to remove
 * @returns Formatted location string
 */
export function formatLocation(location: string, removeCountry: boolean | string = true): string {
  if (!location) return '';
  if (removeCountry === false) return location;

  const locationText = location.trim();

  if (typeof removeCountry === 'string' && removeCountry !== 'true') {
    const pattern = compileCountryPattern(removeCountry);

    // A pattern that does not compile leaves the location alone. Falling through to the
    // built-in country list instead would strip a country the user never asked about.
    if (pattern === null) return locationText;

    return locationText.replace(pattern, '').replace(/,?\s*$/, '');
  }

  for (const country of Constants.COUNTRY_NAMES) {
    if (locationText.endsWith(country)) {
      return locationText.slice(0, locationText.length - country.length).replace(/,?\s*$/, '');
    }
  }

  return locationText;
}

/** The location row's icon when nothing else applies. */
export const LOCATION_ICON = 'mdi:map-marker-outline';

/** The location row's icon for a recognised Microsoft Teams meeting. */
export const TEAMS_LOCATION_ICON = 'mdi:microsoft-teams';

/**
 * The shapes a Teams meeting's location text takes.
 *
 * Two alternatives, because calendars store one of two things. Most write a phrase, and
 * Teams **localizes** it — `Microsoft Teams-Besprechung` in German, `Réunion Microsoft
 * Teams` in French, `Reunión de Microsoft Teams` in Spanish, `Microsoft Teams-vergadering`
 * in Dutch, `Riunione di Microsoft Teams` in Italian. The words around it are translated
 * and reordered; the brand name is not. Matching `Microsoft Teams` alone therefore covers
 * every one of them, where matching the full English phrase covers only English. `\s+`
 * rather than a literal space because some clients emit a non-breaking one, which `\s`
 * includes. Substring rather than anchored, which also handles the hybrid form Outlook
 * writes for a room booked alongside a call: `Conference Room A; Microsoft Teams Meeting`.
 *
 * Others store the join URL instead — Google Calendar mirrors of a Teams event, CalDAV
 * bridges, some sync tools. `teams.microsoft.com` is the commercial host; `.us` is the US
 * government clouds and `teams.live.com` is the consumer product, added because they are
 * the same product's other front doors and cannot appear in a location that is not a Teams
 * call.
 *
 * 🚨 Known gap, stated rather than papered over: a CJK tenant may render the vendor name
 * in local script — Microsoft is commonly `微软` in Chinese — and no primary source was
 * found either way. Such a calendar falls back to the plain marker, which is the pre-4.1
 * behavior rather than a wrong icon, and its URL form still matches. `location_icon` sets
 * it right on any calendar this misses.
 */
const TEAMS_LOCATION = /microsoft\s+teams|teams\.microsoft\.(?:com|us)|teams\.live\.com/i;

/**
 * Is this location text a Microsoft Teams meeting?
 *
 * @param location - Location text as the card displays it
 * @returns True when the text names a Teams meeting or carries a Teams join URL
 */
export function isTeamsLocation(location: string): boolean {
  return Boolean(location) && TEAMS_LOCATION.test(location);
}

/**
 * The icon the location row draws.
 *
 * Only Teams is detected, and the reason is checkable rather than a matter of taste:
 * **Material Design Icons ships a brand icon for it and for no competitor.** Of
 * `microsoft-teams`, `zoom`, `google-meet` and `webex`, only the first exists in MDI's
 * 7,447 icons — so Zoom and Meet could not be given a logo here even if they were
 * detected. `location_icon` is the answer for everyone else, including anyone who has
 * installed an icon pack of their own.
 *
 * (`mdi:microsoft-teams` carries MDI's `deprecated` flag, along with every one of its 259
 * brand icons. It still ships and still renders; should a future MDI drop it, this
 * constant is the single place to change and `location_icon` already overrides it.)
 *
 * @param location - Location text as the card displays it
 * @param configured - This calendar's `location_icon`, where it names one
 * @returns The icon to render beside the location
 */
export function resolveLocationIcon(location: string, configured?: string): string {
  // An explicit choice wins over the detection, which is also how the detection is turned
  // off: `location_icon: mdi:map-marker-outline` restores the plain marker, so opting out
  // needs no second key.
  if (configured) return configured;

  return isTeamsLocation(location) ? TEAMS_LOCATION_ICON : LOCATION_ICON;
}

/**
 * Strip HTML tags and decode HTML entities from a string, returning plain text
 */
export function stripHtmlTags(text: string): string {
  if (!text) return '';
  const stripped = text.replace(/<[^>]*>/g, '');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = stripped;
  return textarea.value.trim();
}

/**
 * Capitalize the first letter of a string
 *
 * @param text String to capitalize
 * @returns String with first letter capitalized
 */
export function capitalizeFirstLetter(text: string): string {
  if (!text || text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

//-----------------------------------------------------------------------------
// CORE FORMATTING UTILITY
//-----------------------------------------------------------------------------

/**
 * Parse all-day event date string to local date object
 * Avoid `new Date('YYYY-MM-DD')`, which treats the date as UTC and can shift the day.
 *
 * @param dateString - ISO format date string (YYYY-MM-DD)
 * @returns Date object at local midnight on the specified date
 */
export function parseAllDayDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);

  return new Date(year, month - 1, day);
}

/**
 * Generate a date key string in YYYY-MM-DD format from a Date object
 *
 * @param date - Date object to format
 * @returns Date key string in YYYY-MM-DD format
 */
export function getLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Check whether a date falls on a weekend.
 *
 * Saturday and Sunday, deliberately fixed rather than derived from the locale or from
 * `first_day_of_week`. This is the card's **one** answer to the question, and it is read
 * by two features that have to agree: the weekend day-header colors, and the per-calendar
 * `days_of_week` filter. Were the filter locale-aware while the colors were not, a Friday
 * in a Friday–Saturday weekend would be filtered as a weekend day and colored as a
 * weekday — two visible answers to one question on the same row.
 *
 * Lives here rather than beside its first caller in `rendering/leaves.ts` for that reason:
 * `leaves.ts` imports `utils/events.ts`, so the filter could not have reached it without
 * a cycle, and a second copy is what this comment exists to prevent.
 *
 * @param date Date to check
 * @returns True when the date is a Saturday or Sunday
 */
export function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Count whole calendar days from one date to another.
 *
 * Both arguments are reduced to their local calendar date and differenced in
 * UTC, for the reason given on {@link getISOWeekNumber}: subtracting two locally
 * built dates in absolute milliseconds loses an hour across a spring-forward, so
 * a plain `Math.floor` returns one day short for any window that spans one.
 * Unlike the two week-number functions this was wrong in both hemispheres, since
 * every zone that observes DST springs forward regardless of which month it
 * picks — only the month of the affected window differs.
 *
 * Reducing to the calendar date also preserves the truncation callers rely on
 * when `end` carries a time of day: 09:30 on the fifth day is still five days.
 *
 * @param start Start date, compared by its local calendar date
 * @param end End date, compared by its local calendar date
 * @returns Whole days from `start` to `end`, negative when `end` precedes `start`
 */
export function getCalendarDayDiff(start: Date, end: Date): number {
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

  return Math.round((endDay - startDay) / 86400000);
}

/**
 * Format a time with the configured hour style.
 *
 * @param date Date to format
 * @param use24h Whether to use 24-hour time
 * @param twoDigitHours Whether to pad hours to two digits
 * @returns Formatted time string
 */
export function formatTime(date: Date, use24h = true, twoDigitHours = false): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();

  if (!use24h) {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${twoDigitHours ? pad(hours) : hours}:${pad(minutes)} ${ampm}`;
  }

  return `${twoDigitHours ? pad(hours) : hours}:${pad(minutes)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Calculate ISO week number for a date
 *
 * Reads the local calendar date, then performs every step in UTC. Taking a
 * difference in absolute milliseconds between two dates built with local methods
 * drifts by the DST offset whenever a transition falls between them, which tips
 * the final `Math.ceil` by a whole week for roughly one date in seven. The drift
 * is negative north of the equator and positive south of it, so this rounded up
 * only where Jan 1 falls inside DST — correct in Europe and the Americas while
 * wrong in Australia, New Zealand and Chile. UTC has no transitions, so building
 * the dates there removes the failure mode rather than compensating for it.
 *
 * @param date Date to calculate week number for
 * @returns ISO week number (1-53)
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));

  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);

  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

/**
 * Calculate a simple week number using the configured first day of week.
 *
 * Built in UTC for the reason given on {@link getISOWeekNumber}, with the
 * hemispheres reversed: this one floors rather than ceils, so it undercounted
 * where the DST drift is negative — wrong in Europe and the Americas, correct in
 * Australia and New Zealand. Between them the two functions were wrong almost
 * everywhere that observes DST.
 *
 * @param date Date to calculate from
 * @param firstDayOfWeek First day of the week, where 0 is Sunday
 * @returns Week number
 */
export function getSimpleWeekNumber(date: Date, firstDayOfWeek: number = 0): number {
  const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  const startOfYear = Date.UTC(date.getFullYear(), 0, 1);

  const days = Math.round((d - startOfYear) / (24 * 60 * 60 * 1000));

  const dayOfWeekOffset = (new Date(startOfYear).getUTCDay() - firstDayOfWeek + 7) % 7;

  return Math.ceil((days + dayOfWeekOffset + 1) / 7);
}

/**
 * Weekday names as Home Assistant stores them in `locale.first_weekday`, ordered so the
 * array index is already the day number this module uses (0 = Sunday).
 */
const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * CLDR first day of week for every Home Assistant frontend language whose week does not
 * start on Monday, plus the regional variants that must not inherit their base language.
 *
 * Monday is the CLDR default, so only exceptions are listed. Lookup is full tag first,
 * then base language, then Monday — which is why `en-gb` and `zh-hans` need explicit
 * Monday entries: their base languages (`en`, `zh-Hant`) start on Sunday.
 *
 * This is a table rather than a call into `Intl.Locale.prototype.getWeekInfo` for three
 * reasons: that API is ES2020+ and the project targets ES2017, its availability varies by
 * engine — Node 22, the version this project pins, exposes only the older `weekInfo`
 * getter while Node 25 also has the `getWeekInfo()` method, and browsers differ the same
 * way — and the input domain here is closed, because `hass.locale.language` is always one
 * of the languages Home Assistant ships. Home Assistant itself hits this and falls back to
 * a third-party package. `tests/first-day-of-week-locale.test.ts` pins every entry
 * below against CLDR, so the table cannot silently drift.
 */
const FIRST_DAY_BY_LOCALE: Record<string, number> = {
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

/**
 * Resolve the first day of the week implied by a language tag.
 *
 * @param tag BCP 47 language tag, in any casing
 * @returns Day number (0 = Sunday), defaulting to Monday for unlisted languages
 */
function getFirstDayForLocale(tag: string): number {
  const key = tag.toLowerCase();
  return FIRST_DAY_BY_LOCALE[key] ?? FIRST_DAY_BY_LOCALE[key.split('-')[0]] ?? 1;
}

/**
 * Get first day of week based on config and the user's Home Assistant locale.
 *
 * `'system'` mirrors Home Assistant's own `firstWeekdayIndex()`: an explicit weekday in the
 * user's Home Assistant profile wins, and only when that is left at its `language` default
 * does the language itself decide.
 *
 * The card's own `language` option is deliberately *not* consulted. That option picks which
 * translation to display, and it doubles as the fallback for the 30-odd Home Assistant
 * languages the card has no translation for, so it says nothing reliable about which day the
 * user's week starts on.
 *
 * @param firstDayConfig Configuration setting for first day of week
 * @param hassLocale Home Assistant locale, the authoritative source for `'system'`
 * @returns Day number (0 = Sunday, 1 = Monday, ... 6 = Saturday)
 */
export function getFirstDayOfWeek(
  firstDayConfig: 'sunday' | 'monday' | 'system',
  hassLocale?: { language?: string; first_weekday?: string },
): number {
  if (firstDayConfig === 'sunday') return 0;
  if (firstDayConfig === 'monday') return 1;

  const explicit = WEEKDAY_NAMES.indexOf(hassLocale?.first_weekday ?? '');
  if (explicit !== -1) return explicit;

  return hassLocale?.language ? getFirstDayForLocale(hassLocale.language) : 1;
}

/**
 * Get week number based on config settings
 *
 * @param date Date to get week number for
 * @param method Week numbering method (iso or simple)
 * @param firstDayOfWeek First day of week (0 = Sunday, 1 = Monday)
 * @returns Calculated week number
 */
export function getWeekNumber(
  date: Date,
  method: 'iso' | 'simple' | null,
  firstDayOfWeek: number,
): number | null {
  const effectiveMethod = method || 'iso';

  if (effectiveMethod === 'iso') {
    return getISOWeekNumber(date);
  }

  if (effectiveMethod === 'simple') {
    return getSimpleWeekNumber(date, firstDayOfWeek);
  }

  return null;
}

//-----------------------------------------------------------------------------
// SPECIALIZED EVENT FORMATTING HELPERS
//-----------------------------------------------------------------------------

function formatSingleDayTime(
  startDate: Date,
  endDate: Date,
  showEndTime: boolean,
  useNativeFormatting: boolean,
  use24h: boolean = true,
  twoDigitHours: boolean = false,
  hass?: Types.Hass | null,
): string {
  if (useNativeFormatting && hass?.locale) {
    const use24hFormat = Helpers.getTimeFormat24h(hass.locale, use24h);

    return showEndTime
      ? `${formatTime(startDate, use24hFormat, twoDigitHours)} - ${formatTime(endDate, use24hFormat, twoDigitHours)}`
      : formatTime(startDate, use24hFormat, twoDigitHours);
  }

  return showEndTime
    ? `${formatTime(startDate, use24h, twoDigitHours)} - ${formatTime(endDate, use24h, twoDigitHours)}`
    : formatTime(startDate, use24h, twoDigitHours);
}

function formatMultiDayTime(
  startDate: Date,
  endDate: Date,
  language: string,
  translations: Types.Translations,
  useNativeFormatting: boolean,
  use24h: boolean = true,
  twoDigitHours: boolean = false,
  hass?: Types.Hass | null,
): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const formatTimeStr = (date: Date) => {
    if (useNativeFormatting && hass?.locale) {
      const use24hFormat = Helpers.getTimeFormat24h(hass.locale, use24h);
      return formatTime(date, use24hFormat, twoDigitHours);
    }
    return formatTime(date, use24h, twoDigitHours);
  };

  let endPart: string;

  if (endDate.toDateString() === today.toDateString()) {
    endPart = `${translations.endsToday} ${translations.at} ${formatTimeStr(endDate)}`;
  } else if (endDate.toDateString() === tomorrow.toDateString()) {
    endPart = `${translations.endsTomorrow} ${translations.at} ${formatTimeStr(endDate)}`;
  } else {
    const endDay = endDate.getDate();
    const endMonthName = translations.months[endDate.getMonth()];
    const endWeekday = translations.fullDaysOfWeek[endDate.getDay()];
    const endTimeStr = formatTimeStr(endDate);
    const formatStyle = Localize.getDateFormatStyle(language);

    switch (formatStyle) {
      case 'day-dot-month':
        endPart = `${endWeekday}, ${endDay}. ${endMonthName} ${translations.at} ${endTimeStr}`;
        break;
      case 'month-day':
        endPart = `${endWeekday}, ${endMonthName} ${endDay} ${translations.at} ${endTimeStr}`;
        break;
      case 'day-month':
      default:
        endPart = `${endWeekday}, ${endDay} ${endMonthName} ${translations.at} ${endTimeStr}`;
        break;
    }
  }

  if (today.getTime() <= startDate.getTime()) {
    const startTimeStr = formatTimeStr(startDate);
    return `${startTimeStr} ${translations.multiDay} ${endPart}`;
  } else {
    if (
      endDate.toDateString() === today.toDateString() ||
      endDate.toDateString() === tomorrow.toDateString()
    ) {
      return endPart;
    } else {
      return `${translations.multiDay} ${endPart}`;
    }
  }
}

function formatMultiDayAllDayTime(
  endDate: Date,
  language: string,
  translations: Types.Translations,
): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (endDate.toDateString() === today.toDateString()) {
    return `${translations.allDay}, ${translations.endsToday}`;
  }

  if (endDate.toDateString() === tomorrow.toDateString()) {
    return `${translations.allDay}, ${translations.endsTomorrow}`;
  }

  const endDay = endDate.getDate();
  const endMonthName = translations.months[endDate.getMonth()];
  const endWeekday = translations.fullDaysOfWeek[endDate.getDay()];
  const formatStyle = Localize.getDateFormatStyle(language);

  switch (formatStyle) {
    case 'day-dot-month':
      return `${translations.allDay}, ${translations.multiDay} ${endWeekday}, ${endDay}. ${endMonthName}`;
    case 'month-day':
      return `${translations.allDay}, ${translations.multiDay} ${endWeekday}, ${endMonthName} ${endDay}`;
    case 'day-month':
    default:
      return `${translations.allDay}, ${translations.multiDay} ${endWeekday}, ${endDay} ${endMonthName}`;
  }
}

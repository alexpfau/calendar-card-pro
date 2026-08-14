/**
 * Formatting utilities for Calendar Card Pro
 * Handles formatting of dates, times, and locations for display.
 */

import * as Helpers from './helpers';
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
    const pattern = new RegExp(`(${removeCountry})\\s*$`, 'i');
    return locationText.replace(pattern, '').replace(/,?\s*$/, '');
  }

  for (const country of Constants.COUNTRY_NAMES) {
    if (locationText.endsWith(country)) {
      return locationText.slice(0, locationText.length - country.length).replace(/,?\s*$/, '');
    }
  }

  return locationText;
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
 * @param date Date to calculate week number for
 * @returns ISO week number (1-53)
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(date);

  d.setDate(d.getDate() + 4 - (d.getDay() || 7));

  const yearStart = new Date(d.getFullYear(), 0, 1);

  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Calculate a simple week number using the configured first day of week.
 *
 * @param date Date to calculate from
 * @param firstDayOfWeek First day of the week, where 0 is Sunday
 * @returns Week number
 */
export function getSimpleWeekNumber(date: Date, firstDayOfWeek: number = 0): number {
  const d = new Date(date);

  const startOfYear = new Date(d.getFullYear(), 0, 1);

  const days = Math.floor((d.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));

  const dayOfWeekOffset = (startOfYear.getDay() - firstDayOfWeek + 7) % 7;

  return Math.ceil((days + dayOfWeekOffset + 1) / 7);
}

/**
 * Get first day of week based on config and locale
 *
 * @param firstDayConfig Configuration setting for first day of week
 * @param locale Current locale
 * @returns Day number (0 = Sunday, 1 = Monday)
 */
export function getFirstDayOfWeek(
  firstDayConfig: 'sunday' | 'monday' | 'system',
  locale: string = 'en',
): number {
  if (firstDayConfig === 'sunday') return 0;
  if (firstDayConfig === 'monday') return 1;

  try {
    if (/^en-(US|CA)|es-US/.test(locale)) {
      return 0; // Sunday
    }

    return 1;
  } catch {
    return 1;
  }
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

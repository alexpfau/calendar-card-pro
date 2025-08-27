/* eslint-disable import/order */
/**
 * Formatting utilities for Calendar Card Pro
 *
 * Handles formatting of dates, times, and locations for display.
 */

import * as Types from '../config/types';
import * as Localize from '../translations/localize';
import * as Constants from '../config/constants';
import * as Helpers from './helpers';
import { getRelativeTimeString } from '../translations/dayjs';

//-----------------------------------------------------------------------------
// HIGH-LEVEL PUBLIC APIs
//-----------------------------------------------------------------------------

/**
 * Format an event's time string based on its start and end times
 *
 * Generates a human-readable time string for calendar events
 * handling all-day events, multi-day events, and regular events
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
    // Parse all-day dates using the specialized function to handle timezone issues
    startDate = parseAllDayDate(event.start.date || '');
    endDate = parseAllDayDate(event.end.date || '');
  } else {
    // Regular events with time use standard parsing
    startDate = new Date(event.start.dateTime || '');
    endDate = new Date(event.end.dateTime || '');
  }

  const translations = Localize.getTranslations(language);

  if (isAllDayEvent) {
    const adjustedEndDate = new Date(endDate);
    // For all-day events, the end date is exclusive in iCal format
    adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);

    // Check if it's a multi-day event
    if (startDate.toDateString() !== adjustedEndDate.toDateString()) {
      return capitalizeFirstLetter(
        formatMultiDayAllDayTime(adjustedEndDate, language, translations),
      );
    }

    // Single day all-day event
    return capitalizeFirstLetter(translations.allDay);
  }

  // Determine whether to use native HA formatting
  const useNativeFormatting = !!(config.time_24h === 'system' && hass?.locale);
  const use24h = config.time_24h === true;

  // Handle multi-day events with start/end times
  if (startDate.toDateString() !== endDate.toDateString()) {
    return capitalizeFirstLetter(
      formatMultiDayTime(
        startDate,
        endDate,
        language,
        translations,
        useNativeFormatting,
        use24h,
        hass,
      ),
    );
  }

  // Single day event with start/end times
  return capitalizeFirstLetter(
    formatSingleDayTime(
      startDate,
      endDate,
      config.show_end_time,
      useNativeFormatting,
      use24h,
      hass,
    ),
  );
}

/**
 * Generates a localized countdown string for an event
 * Uses dayjs for consistent, localized relative time formatting
 *
 * @param event Calendar event to generate countdown for
 * @param hass Home Assistant instance (used to extract language)
 * @param config Card configuration options
 * @returns Countdown string or null if event is past or empty day
 */
export function getCountdownString(
  event: Types.CalendarEventData,
  language: string = 'en',
): string | null {
  // Skip for empty days or events without start times
  if (event._isEmptyDay || !event.start) return null;

  const now = new Date();
  const startDate = event.start.dateTime
    ? new Date(event.start.dateTime)
    : event.start.date
      ? parseAllDayDate(event.start.date)
      : null;

  if (!startDate || startDate <= now) return null;

  // Use dayjs for relative time formatting
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

  // User-defined custom pattern (string)
  if (typeof removeCountry === 'string' && removeCountry !== 'true') {
    const pattern = new RegExp(`(${removeCountry})\\s*$`, 'i');
    return locationText.replace(pattern, '').replace(/,?\s*$/, '');
  }

  // Default behavior (true) - Use built-in country list
  for (const country of Constants.COUNTRY_NAMES) {
    if (locationText.endsWith(country)) {
      return locationText.slice(0, locationText.length - country.length).replace(/,?\s*$/, '');
    }
  }

  return locationText;
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
 *
 * Creates a date object at local midnight for the specified date
 * which preserves the intended day regardless of timezone
 *
 * @param dateString - ISO format date string (YYYY-MM-DD)
 * @returns Date object at local midnight on the specified date
 */
export function parseAllDayDate(dateString: string): Date {
  // Extract year, month, day from date string
  const [year, month, day] = dateString.split('-').map(Number);

  // Create date at local midnight (months are 0-indexed in JS)
  return new Date(year, month - 1, day);
}

/**
 * Generate a date key string in YYYY-MM-DD format from a Date object
 * Uses local date components instead of UTC
 *
 * @param date - Date object to format
 * @returns Date key string in YYYY-MM-DD format
 */
export function getLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Format time according to 12/24 hour setting
 *
 * @param date Date object to format
 * @param use24h Whether to use 24-hour format
 * @returns Formatted time string
 */
export function formatTime(date: Date, use24h = true): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();

  if (!use24h) {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Calculate ISO week number for a date
 * Week 1 is the week with the first Thursday of the year
 *
 * @param date Date to calculate week number for
 * @returns ISO week number (1-53)
 */
export function getISOWeekNumber(date: Date): number {
  // Create a copy of the date
  const d = new Date(date);

  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));

  // Get first day of year
  const yearStart = new Date(d.getFullYear(), 0, 1);

  // Calculate full weeks to nearest Thursday
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return weekNumber;
}

/**
 * Calculate simple week number (1st January = week 1)
 *
 * @param date Date to calculate week number for
 * @param firstDayOfWeek First day of week (0 = Sunday, 1 = Monday)
 * @returns Simple week number (1-53)
 */
export function getSimpleWeekNumber(date: Date, firstDayOfWeek: number = 0): number {
  // Create a copy of the date
  const d = new Date(date);

  // Get the first day of the year
  const startOfYear = new Date(d.getFullYear(), 0, 1);

  // Calculate days since start of the year
  const days = Math.floor((d.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));

  // Calculate offset based on first day of the year and configured first day of week
  // This adjustment aligns the week boundaries with the configured first day of week
  const dayOfWeekOffset = (startOfYear.getDay() - firstDayOfWeek + 7) % 7;

  // Calculate week number (adding 1 because we want weeks to start from 1)
  const weekNumber = Math.ceil((days + dayOfWeekOffset + 1) / 7);

  return weekNumber;
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
  // Explicit setting takes precedence
  if (firstDayConfig === 'sunday') return 0;
  if (firstDayConfig === 'monday') return 1;

  // For system setting, try to detect from locale
  try {
    // Northern American locales typically use Sunday as first day
    if (/^en-(US|CA)|es-US/.test(locale)) {
      return 0; // Sunday
    }

    // Most other locales use Monday
    return 1;
  } catch {
    // Default to Monday on error
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
  // Use provided method or default to "iso" when null
  const effectiveMethod = method || 'iso';

  if (effectiveMethod === 'iso') {
    // ISO week numbers are defined by ISO 8601 standard and always use Monday as first day
    // for calculation purposes, but we still display separator on the configured first day
    return getISOWeekNumber(date);
  }

  if (effectiveMethod === 'simple') {
    // Simple week numbers should respect the configured first day of week
    return getSimpleWeekNumber(date, firstDayOfWeek);
  }

  return null;
}

//-----------------------------------------------------------------------------
// SPECIALIZED EVENT FORMATTING HELPERS
//-----------------------------------------------------------------------------

/**
 * Format single day event time with start/end times
 *
 * @param startDate Start date of the event
 * @param endDate End date of the event
 * @param showEndTime Whether to show end time
 * @param time24h Whether to use 24-hour format
 * @returns Formatted time string
 */
function formatSingleDayTime(
  startDate: Date,
  endDate: Date,
  showEndTime: boolean,
  useNativeFormatting: boolean,
  use24h: boolean = true,
  hass?: Types.Hass | null,
): string {
  if (useNativeFormatting && hass?.locale) {
    // Use the helper to determine time format preference
    const use24hFormat = Helpers.getTimeFormat24h(hass.locale, use24h);

    // Use our formatter with the detected format preference
    return showEndTime
      ? `${formatTime(startDate, use24hFormat)} - ${formatTime(endDate, use24hFormat)}`
      : formatTime(startDate, use24hFormat);
  }

  // For explicit settings, use our formatter with the specified format
  return showEndTime
    ? `${formatTime(startDate, use24h)} - ${formatTime(endDate, use24h)}`
    : formatTime(startDate, use24h);
}

/**
 * Format multi-day event time with start/end times
 *
 * @param startDate Start date of the event
 * @param endDate End date of the event
 * @param language Language code for translations
 * @param translations Translations object
 * @param time24h Whether to use 24-hour format
 * @returns Formatted time string
 */
function formatMultiDayTime(
  startDate: Date,
  endDate: Date,
  language: string,
  translations: Types.Translations,
  useNativeFormatting: boolean,
  use24h: boolean = true,
  hass?: Types.Hass | null,
): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Helper function for time formatting
  const formatTimeStr = (date: Date) => {
    if (useNativeFormatting && hass?.locale) {
      // Use the helper to determine time format preference
      const use24hFormat = Helpers.getTimeFormat24h(hass.locale, use24h);
      return formatTime(date, use24hFormat);
    }
    return formatTime(date, use24h);
  };

  // Format the end time part based on when the event ends
  let endPart: string;

  if (endDate.toDateString() === today.toDateString()) {
    // Event ends today
    endPart = `${translations.endsToday} ${translations.at} ${formatTimeStr(endDate)}`;
  } else if (endDate.toDateString() === tomorrow.toDateString()) {
    // Event ends tomorrow
    endPart = `${translations.endsTomorrow} ${translations.at} ${formatTimeStr(endDate)}`;
  } else {
    // Event ends beyond tomorrow
    const endDay = endDate.getDate();
    const endMonthName = translations.months[endDate.getMonth()];
    const endWeekday = translations.fullDaysOfWeek[endDate.getDay()];
    const endTimeStr = formatTimeStr(endDate);
    const formatStyle = Localize.getDateFormatStyle(language);

    // Format based on language style
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

  // Check if today is on or before the start date
  // If so, include the start time in the output
  if (today.getTime() <= startDate.getTime()) {
    const startTimeStr = formatTimeStr(startDate);
    return `${startTimeStr} ${translations.multiDay} ${endPart}`;
  } else {
    // Event has already started - check if it ends today or tomorrow
    if (
      endDate.toDateString() === today.toDateString() ||
      endDate.toDateString() === tomorrow.toDateString()
    ) {
      // For "ends today" or "ends tomorrow", don't add "until" prefix
      return endPart;
    } else {
      // For events ending beyond tomorrow, keep "until" prefix
      return `${translations.multiDay} ${endPart}`;
    }
  }
}

/**
 * Format multi-day all-day event time
 *
 * @param endDate End date of the event
 * @param language Language code for translations
 * @param translations Translations object
 * @returns Formatted time string
 */
function formatMultiDayAllDayTime(
  endDate: Date,
  language: string,
  translations: Types.Translations,
): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // On the end date, show "ends today"
  if (endDate.toDateString() === today.toDateString()) {
    return `${translations.allDay}, ${translations.endsToday}`;
  }

  // NEW: Day before end date shows "ends tomorrow"
  if (endDate.toDateString() === tomorrow.toDateString()) {
    return `${translations.allDay}, ${translations.endsTomorrow}`;
  }

  const endDay = endDate.getDate();
  const endMonthName = translations.months[endDate.getMonth()];
  const formatStyle = Localize.getDateFormatStyle(language);

  // Different date formats based on language style
  switch (formatStyle) {
    case 'day-dot-month':
      return `${translations.allDay}, ${translations.multiDay} ${endDay}. ${endMonthName}`;
    case 'month-day':
      return `${translations.allDay}, ${translations.multiDay} ${endMonthName} ${endDay}`;
    case 'day-month':
    default:
      return `${translations.allDay}, ${translations.multiDay} ${endDay} ${endMonthName}`;
  }
}

/* eslint-disable import/order */
/**
 * Formatting utilities for Calendar Card Pro
 *
 * Handles formatting of dates, times, and locations for display.
 */

import * as Types from '../config/types';
import * as Localize from '../translations/localize';

//-----------------------------------------------------------------------------
// HIGH-LEVEL PUBLIC APIs
//-----------------------------------------------------------------------------

/**
 * Format an event's time string based on its start and end times
 *
 * Generates a human-readable time string for calendar events
 * handling all-day events, multi-day events, and regular events
 *
 * @param event - The calendar event to format
 * @param config - Card configuration options
 * @param language - Language code for translations
 * @returns Formatted time string
 */
export function formatEventTime(
  event: Types.CalendarEventData,
  config: Types.Config,
  language: string = 'en',
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
      return formatMultiDayAllDayTime(adjustedEndDate, language, translations);
    }

    // Single day all-day event
    return translations.allDay;
  }

  // Handle multi-day events with start/end times
  if (startDate.toDateString() !== endDate.toDateString()) {
    return formatMultiDayTime(startDate, endDate, language, translations);
  }

  // Single day event with start/end times
  return formatSingleDayTime(startDate, endDate, config.show_end_time, config.time_24h);
}

/**
 * Format location string, optionally removing country code
 *
 * @param location - Location string to format
 * @param removeCountry - Whether to remove country code from location
 * @returns Formatted location string
 */
export function formatLocation(location: string, removeCountry = true): string {
  if (!location || !removeCountry) return location || '';

  const locationText = location.trim();

  // Get country names (this would be better from a proper static source)
  // For now using a simplified approach
  const countryNames = new Set([
    'Germany',
    'Deutschland',
    'United States',
    'USA',
    'United States of America',
    'United Kingdom',
    'Great Britain',
    'France',
    'Italy',
    'Italia',
    'Spain',
    'España',
    'Netherlands',
    'Nederland',
    'Austria',
    'Österreich',
    'Switzerland',
    'Schweiz',
  ]);

  // Handle comma-separated format (e.g., "City, Country")
  const parts = locationText.split(',').map((part) => part.trim());
  if (parts.length > 0 && countryNames.has(parts[parts.length - 1])) {
    parts.pop();
    return parts.join(', ');
  }

  // Handle space-separated format (e.g., "City Country")
  const words = locationText.split(/\s+/);
  if (words.length > 0 && countryNames.has(words[words.length - 1])) {
    words.pop();
    return words.join(' ');
  }

  return locationText;
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
  time24h: boolean,
): string {
  return showEndTime
    ? `${formatTime(startDate, time24h)} - ${formatTime(endDate, time24h)}`
    : formatTime(startDate, time24h);
}

/**
 * Format multi-day event time with start/end times
 *
 * @param startDate Start date of the event
 * @param endDate End date of the event
 * @param language Language code for translations
 * @param translations Translations object
 * @returns Formatted time string
 */
function formatMultiDayTime(
  startDate: Date,
  endDate: Date,
  language: string,
  translations: Types.Translations,
): string {
  const endDay = endDate.getDate();
  const endMonthName = translations.months[endDate.getMonth()];
  const endWeekday = translations.fullDaysOfWeek[endDate.getDay()];

  const startTimeStr = formatTime(startDate, true);
  const endTimeStr = formatTime(endDate, true);

  // Different date formats based on language
  if (language === 'de') {
    // German: "7:00 bis Freitag, 21. Mär um 20:00"
    return [
      startTimeStr,
      translations.multiDay,
      endWeekday + ',',
      `${endDay}.`,
      endMonthName,
      translations.at,
      endTimeStr,
    ].join(' ');
  } else {
    // English: "7:00 until Friday, Mar 21 at 20:00"
    return [
      startTimeStr,
      translations.multiDay,
      endWeekday + ',',
      endMonthName,
      endDay,
      translations.at,
      endTimeStr,
    ].join(' ');
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
  const endDay = endDate.getDate();
  const endMonthName = translations.months[endDate.getMonth()];

  // Different date formats based on language
  if (language === 'de') {
    // German: All-Day, until 21. März
    return `${translations.allDay}, ${translations.multiDay} ${endDay}. ${endMonthName}`;
  } else {
    // English: All-Day, until Mar 21
    return `${translations.allDay}, ${translations.multiDay} ${endMonthName} ${endDay}`;
  }
}

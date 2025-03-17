/* eslint-disable import/order */
/**
 * Localization module for Calendar Card Pro
 *
 * This module handles loading and accessing translations
 * for different languages in the Calendar Card Pro.
 */

import * as Types from '../config/types';
import * as Logger from '../utils/logger';

// Import language files
import enTranslations from './languages/en.json';
import deTranslations from './languages/de.json';
import plTranslations from './languages/pl.json';

/**
 * Available translations keyed by language code
 */
export const TRANSLATIONS: Record<string, Types.Translations> = {
  en: enTranslations,
  de: deTranslations,
  pl: plTranslations,
};

/**
 * Default language to use if requested language is not available
 */
export const DEFAULT_LANGUAGE = 'en';

//-----------------------------------------------------------------------------
// HIGH-LEVEL API FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Get translations for the specified language
 * Falls back to English if the language is not available
 *
 * @param language - Language code to get translations for
 * @returns Translations object for the requested language
 */
export function getTranslations(language: string): Types.Translations {
  const lang = language?.toLowerCase() || DEFAULT_LANGUAGE;
  return TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANGUAGE];
}

/**
 * Get a specific translation string from the provided language
 *
 * @param language - Language code
 * @param key - Translation key
 * @param fallback - Optional fallback value if translation is missing
 * @returns Translated string or array
 */
export function translate(
  language: string,
  key: keyof Types.Translations,
  fallback?: string | string[],
): string | string[] {
  const translations = getTranslations(language);
  // Check if the key exists in translations
  if (key in translations) {
    return translations[key];
  }

  // Use fallback or key name if translation is missing
  return fallback !== undefined ? fallback : key;
}

/**
 * Get a specific string translation from the provided language
 * Use this for string-only translation keys
 *
 * @param language - Language code
 * @param key - Translation key that returns a string
 * @param fallback - Optional fallback string if translation is missing
 * @returns Translated string
 */
export function translateString(
  language: string,
  key: Exclude<keyof Types.Translations, 'daysOfWeek' | 'fullDaysOfWeek' | 'months'>,
  fallback?: string,
): string {
  return translate(language, key, fallback) as string;
}

//-----------------------------------------------------------------------------
// TEXT FORMATTING FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Get day name from translations based on day index
 *
 * @param language - Language code
 * @param dayIndex - Day index (0 = Sunday, 6 = Saturday)
 * @param full - Whether to use full day names
 * @returns Translated day name
 */
export function getDayName(language: string, dayIndex: number, full = false): string {
  const translations = getTranslations(language);
  const key = full ? 'fullDaysOfWeek' : 'daysOfWeek';

  if (dayIndex < 0 || dayIndex > 6) {
    Logger.warn(`Invalid day index ${dayIndex}. Using default.`);
    dayIndex = 0; // Default to Sunday if invalid
  }

  return translations[key][dayIndex];
}

/**
 * Get month name from translations based on month index
 *
 * @param language - Language code
 * @param monthIndex - Month index (0 = January, 11 = December)
 * @returns Translated month name
 */
export function getMonthName(language: string, monthIndex: number): string {
  const translations = getTranslations(language);

  if (monthIndex < 0 || monthIndex > 11) {
    Logger.warn(`Invalid month index ${monthIndex}. Using default.`);
    monthIndex = 0; // Default to January if invalid
  }

  return translations.months[monthIndex];
}

/**
 * Format a date according to the locale
 * Shows just the day and month name in the selected language
 *
 * @param language - Language code
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatDateShort(language: string, date: Date): string {
  const day = date.getDate();
  const month = getMonthName(language, date.getMonth());

  // Different formats based on language conventions
  if (language.toLowerCase() === 'de') {
    return `${day}. ${month}`;
  }

  return `${month} ${day}`;
}

//-----------------------------------------------------------------------------
// LANGUAGE MANAGEMENT UTILITIES
//-----------------------------------------------------------------------------

/**
 * Get all supported languages
 *
 * @returns Array of supported language codes
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(TRANSLATIONS);
}

/**
 * Check if a language is supported
 *
 * @param language - Language code to check
 * @returns True if language is supported, false otherwise
 */
export function isLanguageSupported(language: string): boolean {
  return language?.toLowerCase() in TRANSLATIONS;
}

/**
 * Add a new translation set for a language
 * This can be used for dynamic registration of new languages
 *
 * @param language - Language code
 * @param translations - Translations object
 */
export function addTranslations(language: string, translations: Types.Translations): void {
  if (!language) {
    Logger.error('Cannot add translations without a language code');
    return;
  }

  TRANSLATIONS[language.toLowerCase()] = translations;
}

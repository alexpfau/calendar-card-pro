/* eslint-disable import/order -- the annotated language list below is separated by a blank line on purpose; see the comment above it. */
/**
 * Localization module for Calendar Card Pro
 *
 * This module handles loading and accessing translations
 * for different languages in the Calendar Card Pro.
 */

import * as Types from '../config/types';
import * as Logger from '../utils/logger';

// Import language files (sorted alphabetically by language code)
import bgTranslations from './languages/bg.json';
import caTranslations from './languages/ca.json';
import csTranslations from './languages/cs.json';
import daTranslations from './languages/da.json';
import deTranslations from './languages/de.json';
import elTranslations from './languages/el.json';
import enGBTranslations from './languages/en-GB.json';
import enTranslations from './languages/en.json';
import esTranslations from './languages/es.json';
import etTranslations from './languages/et.json';
import fiTranslations from './languages/fi.json';
import frTranslations from './languages/fr.json';
import heTranslations from './languages/he.json';
import hrTranslations from './languages/hr.json';
import huTranslations from './languages/hu.json';
import isTranslations from './languages/is.json';
import itTranslations from './languages/it.json';
import ltTranslations from './languages/lt.json';
import lvTranslations from './languages/lv.json';
import nbTranslations from './languages/nb.json';
import nlTranslations from './languages/nl.json';
import nnTranslations from './languages/nn.json';
import plTranslations from './languages/pl.json';
import ptTranslations from './languages/pt.json';
import roTranslations from './languages/ro.json';
import ruTranslations from './languages/ru.json';
import skTranslations from './languages/sk.json';
import slTranslations from './languages/sl.json';
import svTranslations from './languages/sv.json';
import thTranslations from './languages/th.json';
import trTranslations from './languages/tr.json';
import ukTranslations from './languages/uk.json';
import viTranslations from './languages/vi.json';
import zhCNTranslations from './languages/zh-CN.json';
import zhTWTranslations from './languages/zh-TW.json';

/**
 * Available translations keyed by language code
 */
export const TRANSLATIONS: Record<string, Types.Translations> = {
  // Sorted alphabetically by language code
  bg: bgTranslations,
  cs: csTranslations,
  ca: caTranslations,
  da: daTranslations,
  de: deTranslations,
  el: elTranslations,
  en: enTranslations,
  'en-gb': enGBTranslations,
  es: esTranslations,
  et: etTranslations,
  fi: fiTranslations,
  fr: frTranslations,
  he: heTranslations,
  hr: hrTranslations,
  hu: huTranslations,
  is: isTranslations,
  it: itTranslations,
  lt: ltTranslations,
  lv: lvTranslations,
  nb: nbTranslations,
  nl: nlTranslations,
  nn: nnTranslations,
  pl: plTranslations,
  pt: ptTranslations,
  ro: roTranslations,
  ru: ruTranslations,
  sl: slTranslations,
  sk: skTranslations,
  sv: svTranslations,
  uk: ukTranslations,
  vi: viTranslations,
  th: thTranslations,
  tr: trTranslations,
  'zh-cn': zhCNTranslations,
  'zh-tw': zhTWTranslations,
};

/**
 * Default language to use if requested language is not available
 */
export const DEFAULT_LANGUAGE = 'en';

//-----------------------------------------------------------------------------
// HIGH-LEVEL API FUNCTIONS
//-----------------------------------------------------------------------------

// Cache for already determined languages to prevent repeated calculations
const languageCache = new Map<string, string>();

/**
 * Determine the effective language based on priority order:
 * 1. User config language (if specified and supported)
 * 2. HA system language (if available and supported)
 * 3. Default language fallback
 *
 * @param configLanguage - Language from user configuration
 * @param hassLocale - Home Assistant locale information
 * @returns The effective language code to use
 */
export function getEffectiveLanguage(
  configLanguage?: string,
  hassLocale?: { language: string },
): string {
  // Create cache key from inputs
  const cacheKey = `${configLanguage || ''}:${hassLocale?.language || ''}`;

  // Return cached result if available
  if (languageCache.has(cacheKey)) {
    return languageCache.get(cacheKey)!;
  }

  let effectiveLanguage: string;

  // Priority 1: Use config language if specified and supported
  if (configLanguage && configLanguage.trim() !== '') {
    const configLang = configLanguage.toLowerCase();
    if (TRANSLATIONS[configLang]) {
      effectiveLanguage = configLang;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }
  }

  // Priority 2: Use HA system language if available and supported
  if (hassLocale?.language) {
    const sysLang = hassLocale.language.toLowerCase();
    if (TRANSLATIONS[sysLang]) {
      effectiveLanguage = sysLang;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }

    // Check for language part only (e.g., "de" from "de-DE")
    const langPart = sysLang.split(/[-_]/)[0];
    if (langPart !== sysLang && TRANSLATIONS[langPart]) {
      effectiveLanguage = langPart;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }
  }

  // Priority 3: Use default language as fallback
  effectiveLanguage = DEFAULT_LANGUAGE;
  languageCache.set(cacheKey, effectiveLanguage);
  return effectiveLanguage;
}

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
 * @param key - Translation key or path (supports 'editor.key' format)
 * @param fallback - Optional fallback value if translation is missing
 * @returns Translated string or array
 */
export function translate(
  language: string,
  key: keyof Types.Translations | string,
  fallback?: string | string[],
): string | string[] {
  const translations = getTranslations(language);

  // Dotted keys never name anything in this file.
  //
  // The card's strings are flat, so a key with a dot in it belongs to the editor's own
  // namespace — `editor.time.show_end_time` — which lives in
  // `src/rendering/editor/translations/` and is resolved by that chunk's `lookup()`.
  // Nothing here can answer for it, so the caller's fallback is the correct answer.
  //
  // Returning one used to be conditional on a two-segment prefix match against an
  // `editor` section this file no longer holds, and that match was a wrong answer which
  // looked right: `editor.time` is the string "Time", so every field inside the `time`
  // group resolved to its group's own label, and so did its helper text. The same
  // collapse hit `location`, `description`, `event` and `date`. The caller's "no string
  // here" fallback never ran, because a string was returned.
  if (typeof key === 'string' && key.includes('.')) {
    const [, ...rest] = key.split('.');
    const subKey = rest.join('.');

    return fallback !== undefined ? fallback : subKey;
  }

  // Handle direct keys in the translations object
  if (key in translations) {
    const value = translations[key as keyof Types.Translations];
    // Handle the value safely to ensure return type matches
    if (typeof value === 'string' || Array.isArray(value)) {
      return value;
    }
  }

  // Use fallback or key name if translation is missing
  return fallback !== undefined ? fallback : (key as string);
}

//-----------------------------------------------------------------------------
// TEXT FORMATTING FUNCTIONS
//-----------------------------------------------------------------------------

/**
 * Determine the date format style for a given language
 *
 * @param language - Language code
 * @returns Date format style identifier ('day-dot-month', 'month-day', or 'day-month')
 */
export function getDateFormatStyle(language: string): 'day-dot-month' | 'month-day' | 'day-month' {
  const lang = language?.toLowerCase() || '';

  // German and Croatian use day with dot, then month (e.g., "17. Mar")
  if (lang === 'de' || lang === 'hr') {
    return 'day-dot-month';
  }

  // English and Hungarian use month then day (e.g., "Mar 17")
  if (lang === 'en' || lang === 'hu') {
    return 'month-day';
  }

  // Default for most other languages: day then month without dot (e.g., "17 Mar")
  return 'day-month';
}

// `getDayName` used to live here: an accessor that returned either `daysOfWeek` or
// `fullDaysOfWeek` depending on a `full` flag. It had no callers, and the flag asserted
// that the two arrays are long and short spellings of one thing. They are not — they
// occupy different grammatical positions. `daysOfWeek` is a standalone day-header label
// and is capitalised; `fullDaysOfWeek` is only ever emitted mid-sentence after
// `multiDay`, so it holds the running-text form. One accessor cannot honour both
// contracts, and its first caller would have silently picked the wrong one.

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
  const formatStyle = getDateFormatStyle(language);

  switch (formatStyle) {
    case 'day-dot-month':
      return `${day}. ${month}`;
    case 'month-day':
      return `${month} ${day}`;
    case 'day-month':
    default:
      return `${day} ${month}`;
  }
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
 * **Replaces** the whole entry rather than merging into it, so the object passed must
 * be a complete `Translations`. Registering a partial one leaves the card resolving
 * `undefined` for whatever it omits — month and day names among them.
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

/* eslint-disable import/order -- the annotated language list below is separated by a blank line on purpose; see the comment above it. */
/**
 * Localization module for Calendar Card Pro.
 */

import * as Types from '../config/types';

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
 * Available translations keyed by language code.
 */
export const TRANSLATIONS: Record<string, Types.Translations> = {
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

export const DEFAULT_LANGUAGE = 'en';

//-----------------------------------------------------------------------------
// HIGH-LEVEL API FUNCTIONS
//-----------------------------------------------------------------------------

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
  const cacheKey = `${configLanguage || ''}:${hassLocale?.language || ''}`;

  if (languageCache.has(cacheKey)) {
    return languageCache.get(cacheKey)!;
  }

  let effectiveLanguage: string;

  if (configLanguage && configLanguage.trim() !== '') {
    const configLang = configLanguage.toLowerCase();
    if (TRANSLATIONS[configLang]) {
      effectiveLanguage = configLang;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }
  }

  if (hassLocale?.language) {
    const sysLang = hassLocale.language.toLowerCase();
    if (TRANSLATIONS[sysLang]) {
      effectiveLanguage = sysLang;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }

    const langPart = sysLang.split(/[-_]/)[0];
    if (langPart !== sysLang && TRANSLATIONS[langPart]) {
      effectiveLanguage = langPart;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }
  }

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

  // Dotted keys belong to the editor chunk; this eager translation table is flat.
  if (typeof key === 'string' && key.includes('.')) {
    const [, ...rest] = key.split('.');
    const subKey = rest.join('.');

    return fallback !== undefined ? fallback : subKey;
  }

  if (key in translations) {
    const value = translations[key as keyof Types.Translations];
    if (typeof value === 'string' || Array.isArray(value)) {
      return value;
    }
  }

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

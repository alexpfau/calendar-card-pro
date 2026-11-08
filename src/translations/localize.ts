/* eslint-disable import-x/order -- the annotated language list below is separated by a blank line on purpose; see the comment above it. */
/**
 * Localization module for Calendar Card Pro.
 */

import * as Types from '../config/types';
import { type CardLanguage, DEFAULT_LANGUAGE } from './language-codes';

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
import koTranslations from './languages/ko.json';
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
import srTranslations from './languages/sr.json';
import srLatnTranslations from './languages/sr-Latn.json';
import svTranslations from './languages/sv.json';
import thTranslations from './languages/th.json';
import trTranslations from './languages/tr.json';
import ukTranslations from './languages/uk.json';
import viTranslations from './languages/vi.json';
import zhCNTranslations from './languages/zh-CN.json';
import zhTWTranslations from './languages/zh-TW.json';

/**
 * Available translations keyed by language code.
 *
 * `satisfies` holds the keys to `CARD_LANGUAGES`, the list the editor resolves languages
 * against without importing these tables: a key missing here, or one not in the list, fails
 * `tsc`.
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
  ko: koTranslations,
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
  sr: srTranslations,
  'sr-latn': srLatnTranslations,
  sv: svTranslations,
  uk: ukTranslations,
  vi: viTranslations,
  th: thTranslations,
  tr: trTranslations,
  'zh-cn': zhCNTranslations,
  'zh-tw': zhTWTranslations,
} satisfies Record<CardLanguage, Types.Translations>;

export { DEFAULT_LANGUAGE, getEffectiveLanguage } from './language-codes';

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

  // German, Croatian, and Serbian use day with dot, then month (e.g., "17. Mar")
  if (lang === 'de' || lang === 'hr' || lang === 'sr' || lang === 'sr-latn') {
    return 'day-dot-month';
  }

  // English and Hungarian use month then day (e.g., "Mar 17")
  if (lang === 'en' || lang === 'hu') {
    return 'month-day';
  }

  // Default for most other languages: day then month without dot (e.g., "17 Mar")
  return 'day-month';
}

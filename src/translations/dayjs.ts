/* eslint-disable import/order */
/**
 * dayjs configuration and utilities for Calendar Card Pro
 *
 * Handles loading language-specific configurations for relative time formatting.
 */

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// Configure dayjs with the relativeTime plugin before importing locales
dayjs.extend(relativeTime);

// Explicitly import all locales supported by our card
import 'dayjs/locale/bg';
import 'dayjs/locale/ca';
import 'dayjs/locale/cs';
import 'dayjs/locale/da';
import 'dayjs/locale/de';
import 'dayjs/locale/el';
import 'dayjs/locale/en';
import 'dayjs/locale/es';
import 'dayjs/locale/fi';
import 'dayjs/locale/fr';
import 'dayjs/locale/he';
import 'dayjs/locale/hr';
import 'dayjs/locale/hu';
import 'dayjs/locale/is';
import 'dayjs/locale/it';
import 'dayjs/locale/nb';
import 'dayjs/locale/nl';
import 'dayjs/locale/nn';
import 'dayjs/locale/pl';
import 'dayjs/locale/pt';
import 'dayjs/locale/ro';
import 'dayjs/locale/ru';
import 'dayjs/locale/sk';
import 'dayjs/locale/sl';
import 'dayjs/locale/sv';
import 'dayjs/locale/th';
import 'dayjs/locale/uk';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';

/**
 * Get relative time string (e.g., "in 2 days")
 *
 * @param date Target date
 * @param locale Language code
 * @returns Formatted relative time string
 */
export function getRelativeTimeString(date: Date, locale: string): string {
  const mappedLocale = mapLocale(locale);
  return dayjs(date).locale(mappedLocale).fromNow();
}

/**
 * Map Home Assistant/Card locale to dayjs locale if needed
 */
function mapLocale(locale: string): string {
  // Handle special cases first (like zh-CN, zh-TW)
  const lowerLocale = locale.toLowerCase();
  if (lowerLocale === 'zh-cn' || lowerLocale === 'zh-tw') {
    return lowerLocale;
  }

  // For other locales, extract the base language code
  const baseLocale = lowerLocale.split('-')[0];

  // Complete list of supported locales matching our translations
  const supportedLocales = [
    'bg',
    'cs',
    'da',
    'de',
    'el',
    'en',
    'es',
    'fi',
    'fr',
    'he',
    'hr',
    'hu',
    'is',
    'it',
    'nb',
    'nl',
    'nn',
    'pl',
    'pt',
    'ru',
    'sk',
    'sl',
    'sv',
    'th',
    'uk',
    'vi',
    'zh-cn',
    'zh-tw',
  ];

  // Default to English if locale isn't supported
  return supportedLocales.includes(baseLocale) ? baseLocale : 'en';
}

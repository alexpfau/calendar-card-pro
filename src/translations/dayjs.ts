/**
 * dayjs configuration and utilities for relative time formatting.
 */

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

import 'dayjs/locale/bg';
import 'dayjs/locale/ca';
import 'dayjs/locale/cs';
import 'dayjs/locale/da';
import 'dayjs/locale/de';
import 'dayjs/locale/el';
import 'dayjs/locale/en';
import 'dayjs/locale/es';
import 'dayjs/locale/et';
import 'dayjs/locale/fi';
import 'dayjs/locale/fr';
import 'dayjs/locale/he';
import 'dayjs/locale/hr';
import 'dayjs/locale/hu';
import 'dayjs/locale/is';
import 'dayjs/locale/it';
import 'dayjs/locale/lt';
import 'dayjs/locale/lv';
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
import 'dayjs/locale/tr';
import 'dayjs/locale/uk';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';

/**
 * Get relative time string (e.g., "in 2 days")
 *
 * @param date Target date
 * @param locale Language code
 * @param reference Instant to measure from; defaults to now
 * @returns Formatted relative time string
 */
export function getRelativeTimeString(date: Date, locale: string, reference?: Date): string {
  const mappedLocale = mapLocale(locale);
  const target = dayjs(date).locale(mappedLocale);
  return reference ? target.from(dayjs(reference)) : target.fromNow();
}

/**
 * Map Home Assistant/Card locale to dayjs locale if needed
 */
function mapLocale(locale: string): string {
  const lowerLocale = locale.toLowerCase();
  if (lowerLocale === 'zh-cn' || lowerLocale === 'zh-tw') {
    return lowerLocale;
  }

  const baseLocale = lowerLocale.split('-')[0];

  // Must match the imported locales, or dayjs falls back to English relative times.
  const supportedLocales = [
    'bg',
    'ca',
    'cs',
    'da',
    'de',
    'el',
    'en',
    'es',
    'et',
    'fi',
    'fr',
    'he',
    'hr',
    'hu',
    'is',
    'it',
    'lt',
    'lv',
    'nb',
    'nl',
    'nn',
    'pl',
    'pt',
    'ro',
    'ru',
    'sk',
    'sl',
    'sv',
    'th',
    'tr',
    'uk',
    'vi',
    'zh-cn',
    'zh-tw',
  ];

  return supportedLocales.includes(baseLocale) ? baseLocale : 'en';
}

/**
 * Relative-time formatting and Day.js locale configuration.
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
import 'dayjs/locale/ko';
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

const relativeUnitFormatters = new Map<string, Intl.RelativeTimeFormat>();

/**
 * Format a whole number of days or hours, using the date word for tomorrow.
 *
 * @param value Number of whole units until the event
 * @param unit Calendar days or elapsed hours
 * @param locale Language code
 * @returns Localized relative-unit string
 */
export function getRelativeUnitString(value: number, unit: 'day' | 'hour', locale: string): string {
  const mappedLocale = mapLocale(locale);
  const numeric = unit === 'day' && value === 1 ? 'auto' : 'always';
  const cacheKey = `${mappedLocale}:${numeric}`;
  let formatter = relativeUnitFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(mappedLocale, { numeric });
    relativeUnitFormatters.set(cacheKey, formatter);
  }
  return formatter.format(value, unit);
}

const nowLabels = new Map<string, string>();

/**
 * The language's own word for "now", capitalized to stand at the start of a label.
 *
 * `Intl.RelativeTimeFormat` with `numeric: 'auto'` formats zero seconds as that word —
 * "now", "jetzt", "maintenant", "現在" — so the label costs no entry in the card's 36
 * translation files. Where a browser ships no relative-time data for a language it answers
 * in English rather than failing. Measured in Playwright's Chromium, whose reduced ICU
 * answers in English for Icelandic and Nynorsk; Node's full ICU carries both.
 *
 * @param locale Language code
 * @returns The capitalized word for "now"
 */
export function getNowString(locale: string): string {
  const mappedLocale = mapLocale(locale);
  let label = nowLabels.get(mappedLocale);
  if (label === undefined) {
    const word = new Intl.RelativeTimeFormat(mappedLocale, { numeric: 'auto' }).format(0, 'second');
    label = word.charAt(0).toLocaleUpperCase(mappedLocale) + word.slice(1);
    nowLabels.set(mappedLocale, label);
  }
  return label;
}

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
    'ko',
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

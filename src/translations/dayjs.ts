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
import 'dayjs/locale/sr';
import 'dayjs/locale/sr-cyrl';
import 'dayjs/locale/sv';
import 'dayjs/locale/th';
import 'dayjs/locale/tr';
import 'dayjs/locale/uk';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';

import { intlCache, intlLocales } from './intl-locales';
import { DEFAULT_LANGUAGE } from './language-codes';

const relativeUnitFormatters = intlCache<string, Intl.RelativeTimeFormat>();

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
    formatter = new Intl.RelativeTimeFormat(intlLocales(mappedLocale), { numeric });
    relativeUnitFormatters.set(cacheKey, formatter);
  }
  return formatter.format(value, unit);
}

const nowLabels = intlCache<string, string>();

/**
 * The language's own word for "now", capitalized to stand at the start of a label.
 *
 * `Intl.RelativeTimeFormat` with `numeric: 'auto'` formats zero seconds as that word —
 * "now", "jetzt", "maintenant", "現在" — so the label costs no entry in the card's
 * translation files. Where a browser ships no relative-time data for a language the word reads
 * in English, as every `Intl` word the card writes does ({@link intlLocales}). Chromium
 * carries none for Icelandic or Nynorsk; Nynorsk then reads in Bokmål instead, and Icelandic in
 * English.
 *
 * @param locale Language code
 * @returns The capitalized word for "now"
 */
export function getNowString(locale: string): string {
  const mappedLocale = mapLocale(locale);
  let label = nowLabels.get(mappedLocale);
  if (label === undefined) {
    const format = new Intl.RelativeTimeFormat(intlLocales(mappedLocale), { numeric: 'auto' });
    const word = format.format(0, 'second');
    label = word.charAt(0).toLocaleUpperCase(format.resolvedOptions().locale) + word.slice(1);
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
  // A plain identifier, because the Day.js source guard in scripts/compact-payloads.mjs admits
  // nothing else as the argument to locale().
  const dayjsLocale = DAYJS_LOCALE_NAMES[mappedLocale] ?? mappedLocale;
  const target = dayjs(date).locale(dayjsLocale);
  return reference ? target.from(dayjs(reference)) : target.fromNow();
}

/**
 * Languages whose Day.js locale goes by a different name than their language tag.
 *
 * Day.js names the Serbian scripts the opposite way round from BCP 47: its `sr` locale is
 * Latin and its Cyrillic one is `sr-cyrl`, where `Intl` and Home Assistant read a bare `sr`
 * as Cyrillic and write Latin as `sr-Latn`. {@link mapLocale} returns the language tag,
 * which `Intl` gets as it is; only the Day.js call is told the other name. Passing `sr`
 * straight to Day.js would give Cyrillic users Latin relative times, with every other
 * string on the card still in Cyrillic.
 */
const DAYJS_LOCALE_NAMES: Record<string, string> = {
  sr: 'sr-cyrl',
  'sr-latn': 'sr',
};

/**
 * Map a Home Assistant or card language to the language tag relative times are formatted in.
 *
 * @param locale Language code, in any casing
 * @returns A tag in `supportedLocales`, or English; Day.js may know it by another name
 *   ({@link DAYJS_LOCALE_NAMES})
 */
function mapLocale(locale: string): string {
  const lowerLocale = locale.toLowerCase();

  // These keep their second subtag, because it changes the script rather than only the region.
  if (lowerLocale === 'zh-cn' || lowerLocale === 'zh-tw' || lowerLocale === 'sr-latn') {
    return lowerLocale;
  }

  const baseLocale = lowerLocale.split('-')[0];

  // Once renamed through DAYJS_LOCALE_NAMES, must match the imported locales, or dayjs falls
  // back to English relative times.
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
    'sr',
    'sr-latn',
    'sv',
    'th',
    'tr',
    'uk',
    'vi',
    'zh-cn',
    'zh-tw',
  ];

  return supportedLocales.includes(baseLocale) ? baseLocale : DEFAULT_LANGUAGE;
}

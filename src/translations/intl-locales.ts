/**
 * The locales the card hands `Intl` for a language, and the one place that decides whether the
 * browser has a language at all.
 *
 * Imports only `language-codes.ts`, which imports nothing, so the card, the editor and the
 * popover can all use it without pulling in a string table.
 */
import { DEFAULT_LANGUAGE } from './language-codes';

/**
 * Languages whose readers read another language as well, where a browser can carry `Intl` data
 * for the second and not for the first.
 *
 * Chromium carries no Norwegian Nynorsk for `Intl.DateTimeFormat` or `Intl.RelativeTimeFormat`,
 * the two services the card writes with, so without this a Nynorsk card's "Now", its countdowns
 * and its toolbar dates come out in English; Bokmål is what a Nynorsk reader would choose
 * instead. Measured in Chromium 151 against every card language, Nynorsk and Icelandic are the
 * only two it lacks there, and WebKit and Node carry every one. Icelandic has no neighbor its
 * readers read as their own, so it is not listed and reads in English.
 *
 * Home Assistant set to Nynorsk or Icelandic replaces `Intl` with a polyfill holding that
 * language, and the card then loads its own language into it (`intl-locale-data.ts`), so this
 * list only matters where neither the browser nor the polyfill has the language.
 */
const INTL_FALLBACKS: Readonly<Record<string, string>> = {
  nn: 'nb',
};

/**
 * The language, then the language its readers read as well, if it has one, with the same region
 * and script.
 *
 * @param language - A language tag
 * @returns One locale, or two
 */
function readerLocales(language: string): string[] {
  const [primary, ...rest] = language.split('-');
  const fallback = INTL_FALLBACKS[primary.toLowerCase()];
  return fallback ? [language, [fallback, ...rest].join('-')] : [language];
}

/**
 * The locales to ask `Intl` for, which is the card's whole rule for a language the browser
 * cannot write: the language itself, then the language its readers read as well
 * (`INTL_FALLBACKS`), with the same region and script, then the card's default language,
 * English. Every place the card hands `Intl` a language goes through here, so all of them fall
 * back the same way; `tests/intl-fallback.test.ts` fails on one that does not.
 *
 * `Intl` resolves a list against the data the browser carries, per service, and takes the first
 * entry it has. A browser with Nynorsk data therefore keeps Nynorsk, one without it writes
 * Bokmål, and one without Icelandic writes English rather than its own language, as the card's
 * own strings fall back to English for a language the card does not speak. The choice is made
 * at run time, by each service, so a browser that carries one service for a language and not
 * another still gets the language wherever it can.
 *
 * A malformed tag is not a language the browser lacks: `Intl` rejects it as it would without
 * this, and each caller keeps its own answer to that.
 *
 * @param language - A language tag, as the card or Home Assistant writes it: `nn`, `de`,
 *   `zh-cn`, `nn-NO`
 * @returns The language, its fallback where it has one, and English
 */
export function intlLocales(language: string): string[] {
  const locales = readerLocales(language);
  return locales.some((locale) => locale.toLowerCase() === DEFAULT_LANGUAGE)
    ? locales
    : [...locales, DEFAULT_LANGUAGE];
}

/** An `Intl` service, as far as asking it which languages it has. */
export interface IntlService {
  supportedLocalesOf(locales: string[]): string[];
}

/**
 * Whether an `Intl` service can write a language, in the language itself or in the one its
 * readers read as well, without falling back to English. The only question the card asks about
 * a browser's data, so it is asked one way.
 *
 * @param service - `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, …
 * @param language - A language tag
 * @returns False where the service would write the language in English, or rejects its tag
 */
export function intlSpeaks(service: IntlService, language: string): boolean {
  try {
    return service.supportedLocalesOf(readerLocales(language)).length > 0;
  } catch {
    return false;
  }
}

const intlCaches: Array<Map<unknown, unknown>> = [];

/**
 * A cache for what `Intl` writes: formats, or words taken from them.
 *
 * A format keeps the language it resolved to when it was made, so one made before Home
 * Assistant's polyfill had the card's language would keep writing another one for as long as
 * the page is open. Every such cache is made here, so `forgetIntlFormats` can empty them all
 * once the language has arrived.
 *
 * @returns An empty map
 */
export function intlCache<K, V>(): Map<K, V> {
  const cache = new Map<K, V>();
  intlCaches.push(cache as Map<unknown, unknown>);
  return cache;
}

/** Empties every `intlCache`, so the next format is made with the data `Intl` has now. */
export function forgetIntlFormats(): void {
  for (const cache of intlCaches) cache.clear();
}

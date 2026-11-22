/**
 * Which languages the card speaks, without the strings it speaks them in.
 *
 * Kept apart from `localize.ts` so the editor can resolve a language without importing every
 * card-language table: those are eager in the card, and the editor never reads one. Importing
 * `localize.ts` for this one check put all of them into `editor.js` as well.
 */

/**
 * Every card language, by the lowercase key `TRANSLATIONS` in `localize.ts` registers it under.
 *
 * The map is checked against this list by type (`satisfies Record<CardLanguage, …>`), so a code
 * missing from either side, or present in only one, fails `tsc`. `npm run check:i18n` reconciles
 * the list with the files in `languages/` too.
 */
export const CARD_LANGUAGES = [
  'bg',
  'ca',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'en-gb',
  'es',
  'et',
  'fi',
  'fr',
  'he',
  'hr',
  'hu',
  'is',
  'it',
  'ja',
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
] as const;

/** A card language code. */
export type CardLanguage = (typeof CARD_LANGUAGES)[number];

export const DEFAULT_LANGUAGE = 'en';

const SUPPORTED: ReadonlySet<string> = new Set(CARD_LANGUAGES);

/**
 * The card languages written right to left. A list rather than `Intl.Locale`'s text info,
 * which not every browser the card runs in has; `tests/clock-reading-bidi.test.ts` reconciles
 * it with CLDR for every language in `CARD_LANGUAGES`, so a new one cannot be left out.
 */
export const RIGHT_TO_LEFT_LANGUAGES: ReadonlySet<CardLanguage> = new Set<CardLanguage>(['he']);

/**
 * Which way a card language is written.
 *
 * @param language - An effective card language, as `getEffectiveLanguage` returns it
 * @returns Its direction
 */
export function languageDirection(language: string): 'ltr' | 'rtl' {
  return (RIGHT_TO_LEFT_LANGUAGES as ReadonlySet<string>).has(language) ? 'rtl' : 'ltr';
}

const languageCache = new Map<string, string>();

/**
 * Chinese tags that name no card language of their own, mapped to the one written in the same
 * script. The card's two Chinese languages are keyed by region (`zh-cn`, `zh-tw`) while Home
 * Assistant names its own by script (`zh-Hans`, `zh-Hant`), so without this a Home Assistant in
 * Chinese drew the card in English. Hong Kong and Macao write Traditional, Singapore Simplified,
 * and a bare `zh` is Simplified, as `Intl` reads it.
 */
const LANGUAGE_ALIASES: Readonly<Record<string, CardLanguage>> = {
  zh: 'zh-cn',
  'zh-hans': 'zh-cn',
  'zh-sg': 'zh-cn',
  'zh-hant': 'zh-tw',
  'zh-hk': 'zh-tw',
  'zh-mo': 'zh-tw',
};

/**
 * The card language a tag names, directly or through `LANGUAGE_ALIASES`.
 *
 * A configured language must name one whole, so a code the card does not speak, `pt-br` among
 * them, still defers to Home Assistant's. Home Assistant's is tried whole and then without its
 * last subtag in turn, so its regions read in their language: `sr-Latn-RS` is `sr-latn`,
 * `zh-Hant-HK` is `zh-tw`, `pt_BR` is `pt`.
 *
 * @param tag - A language tag, in any casing, with `-` or `_` between subtags
 * @param shorten - Whether to try the tag without its trailing subtags as well
 * @returns A card language, or undefined where the tag names none
 */
function resolveLanguage(tag: string, shorten: boolean): string | undefined {
  const subtags = tag.trim().toLowerCase().split(/[-_]/);
  const shortest = shorten ? 1 : subtags.length;
  for (let length = subtags.length; length >= shortest; length -= 1) {
    const candidate = subtags.slice(0, length).join('-');
    if (SUPPORTED.has(candidate)) return candidate;
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_ALIASES, candidate)) {
      return LANGUAGE_ALIASES[candidate];
    }
  }
  return undefined;
}

/**
 * Determine the effective language based on priority order:
 * 1. User config language (if it names a card language)
 * 2. HA system language (if it names a card language)
 * 3. Default language fallback
 *
 * Both read Home Assistant's `zh-Hans` and `zh-Hant` as the card's own Chinese
 * (`resolveLanguage`).
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

  const cached = languageCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const effectiveLanguage =
    (configLanguage ? resolveLanguage(configLanguage, false) : undefined) ??
    (hassLocale?.language ? resolveLanguage(hassLocale.language, true) : undefined) ??
    DEFAULT_LANGUAGE;
  languageCache.set(cacheKey, effectiveLanguage);
  return effectiveLanguage;
}

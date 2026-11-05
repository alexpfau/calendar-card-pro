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
] as const;

/** A card language code. */
export type CardLanguage = (typeof CARD_LANGUAGES)[number];

export const DEFAULT_LANGUAGE = 'en';

const SUPPORTED: ReadonlySet<string> = new Set(CARD_LANGUAGES);

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
    if (SUPPORTED.has(configLang)) {
      effectiveLanguage = configLang;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }
  }

  if (hassLocale?.language) {
    const sysLang = hassLocale.language.toLowerCase();
    if (SUPPORTED.has(sysLang)) {
      effectiveLanguage = sysLang;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }

    const langPart = sysLang.split(/[-_]/)[0];
    if (langPart !== sysLang && SUPPORTED.has(langPart)) {
      effectiveLanguage = langPart;
      languageCache.set(cacheKey, effectiveLanguage);
      return effectiveLanguage;
    }
  }

  effectiveLanguage = DEFAULT_LANGUAGE;
  languageCache.set(cacheKey, effectiveLanguage);
  return effectiveLanguage;
}

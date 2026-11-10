/**
 * The locales the card hands `Intl` for a language.
 *
 * Imports nothing, so the card, the editor and the popover can all use it without pulling in a
 * string table.
 */

/**
 * Languages whose readers read another language as well, where a browser can carry `Intl` data
 * for the second and not for the first.
 *
 * Chromium carries no Norwegian Nynorsk for `Intl.DateTimeFormat` or `Intl.RelativeTimeFormat`,
 * the two services the card writes with, so without this a Nynorsk card's "Now", its countdowns
 * and its toolbar dates come out in the browser's own language, usually English; Bokmål is what
 * a Nynorsk reader would choose instead. Measured in Chromium 151 against every card language,
 * Nynorsk and Icelandic are the only two it lacks there, and WebKit and Node carry every one.
 * Icelandic has no neighbor its readers read as their own, so it is not listed and stays as the
 * browser writes it.
 *
 * Home Assistant set to Nynorsk or Icelandic replaces `Intl` with a polyfill holding that
 * language, so the gap shows where the card's language is not Home Assistant's. The words that
 * follow Home Assistant's language (the popover's dates, the hour cycle) go through here too,
 * which costs nothing where the polyfill already answers.
 */
const INTL_FALLBACKS: Readonly<Record<string, string>> = {
  nn: 'nb',
};

/**
 * The locales to ask `Intl` for: the language itself, then the language its readers read as
 * well, if it has one (`INTL_FALLBACKS`), with the same region and script.
 *
 * `Intl` resolves a list against the data the browser carries, per service, and takes the first
 * entry it has. A browser with Nynorsk data therefore keeps Nynorsk and one without it writes
 * Bokmål; the choice is made at run time, by each service, so a browser that carries one service
 * for a language and not another still gets the language wherever it can.
 *
 * @param language - A language tag, as the card or Home Assistant writes it: `nn`, `de`,
 *   `zh-cn`, `nn-NO`
 * @returns The language, followed by its fallback where it has one
 */
export function intlLocales(language: string): string[] {
  const [primary, ...rest] = language.split('-');
  const fallback = INTL_FALLBACKS[primary.toLowerCase()];
  return fallback ? [language, [fallback, ...rest].join('-')] : [language];
}

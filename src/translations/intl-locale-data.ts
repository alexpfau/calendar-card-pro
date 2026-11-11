/**
 * Home Assistant's `Intl` polyfill, taught the card's language.
 *
 * Where a browser has no `Intl` data for the language Home Assistant's frontend starts in, as
 * Chromium has none for Icelandic or Nynorsk, the frontend replaces `Intl.DateTimeFormat`,
 * `Intl.RelativeTimeFormat` and `Intl.ListFormat`, among others, with formatjs polyfills, and
 * loads data into them for its own language alone, from its own `/static/locale-data/`. A page
 * has one `Intl`, so every card on it then shares the polyfill, and one in another language
 * writes its dates and relative times in whatever the polyfill holds: "Núna" on a German card
 * under an Icelandic Home Assistant. Here the card loads its own language into the polyfill,
 * from the same files and in the same way Home Assistant loads its own.
 *
 * Nothing happens without the polyfill, or where it already has the language: the card writes
 * exactly what it wrote before, and fetches nothing.
 */
import { forgetIntlFormats, intlLocales } from './intl-locales';

/** The services the card or the editor may need a language in. */
export type IntlServiceName = 'DateTimeFormat' | 'RelativeTimeFormat' | 'ListFormat';

/** A service as Home Assistant's polyfill has it; a native one has no `__addLocaleData`. */
interface PolyfilledService {
  new (locales: string[]): { resolvedOptions(): { locale: string } };
  __addLocaleData?: (data: unknown) => void;
}

/** Where Home Assistant's frontend serves the polyfills' data, as it fetches it itself. */
const LOCALE_DATA = '/static/locale-data';

/**
 * Home Assistant's names for the card languages it names otherwise. Its files follow its own
 * translations, so Chinese is written by script rather than by region, and every other card
 * language is the same tag in either casing.
 */
const HOME_ASSISTANT_NAMES: Readonly<Record<string, string>> = {
  'en-gb': 'en-GB',
  'sr-latn': 'sr-Latn',
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
};

const loads = new Map<string, Promise<boolean>>();

/**
 * The polyfilled service of a name, or `undefined` where the browser's own is in place.
 *
 * @param name - The service
 * @returns It, where Home Assistant has polyfilled it
 */
function polyfilled(name: IntlServiceName): PolyfilledService | undefined {
  const service = (Intl as unknown as Record<string, PolyfilledService | undefined>)[name];
  return typeof service?.__addLocaleData === 'function' ? service : undefined;
}

/**
 * Whether the polyfill holds a language's own data, rather than a shorter tag's.
 *
 * Not `intlSpeaks`, which asks `supportedLocalesOf`: the polyfill answers that by truncation, so
 * a British card under a polyfill holding English is told `en-GB` is there and then writes `en`,
 * American dates and all. What the polyfill resolves the tag to is what it would write in, and
 * once a language's file is in, it resolves the card's own tag to itself: `zh-CN` to `zh-CN`
 * from Home Assistant's `zh-Hans`, `sr-Latn` to `sr-Latn`.
 *
 * @param service - The polyfill
 * @param locale - A language tag
 * @returns True where it would write the language itself
 */
function holds(service: PolyfilledService, locale: string): boolean {
  try {
    const [tag] = Intl.getCanonicalLocales(locale);
    return new service([tag]).resolvedOptions().locale.toLowerCase() === tag.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Load one service's data for a language: the first of `intlLocales` the polyfill does not
 * already hold and Home Assistant serves, so a language it has no file for falls back as
 * `Intl` itself would. Never rejects.
 *
 * @param name - The service
 * @param service - Its polyfill
 * @param language - Card language
 * @returns True once data was added, false where none was
 */
async function load(
  name: IntlServiceName,
  service: PolyfilledService,
  language: string,
): Promise<boolean> {
  for (const locale of intlLocales(language)) {
    if (holds(service, locale)) return false;
    const file = HOME_ASSISTANT_NAMES[locale.toLowerCase()] ?? locale;
    try {
      const response = await fetch(`${LOCALE_DATA}/intl-${name.toLowerCase()}/${file}.json`);
      if (response.ok) {
        service.__addLocaleData!(await response.json());
        return true;
      }
    } catch {
      // Unreachable or unreadable: the next locale, and failing that the polyfill as it was.
    }
  }
  return false;
}

/**
 * Make sure Home Assistant's `Intl` polyfill, where it has installed one, can write a card
 * language, by loading the language's data from Home Assistant where the polyfill lacks it.
 *
 * Formats made before the data arrived would keep writing another language, so once any is
 * added every `intlCache` is emptied, and the caller re-renders when the promise answers true.
 * A failure leaves the polyfill as it was, writing what it wrote before.
 *
 * @param language - Card language
 * @param services - The services the caller writes with
 * @returns `undefined` where there is nothing to load, which is everywhere the browser's own
 *   `Intl` is in place; otherwise whether data was added
 */
export function loadIntlLocaleData(
  language: string,
  services: ReadonlyArray<IntlServiceName>,
): Promise<boolean> | undefined {
  const pending: Array<Promise<boolean>> = [];
  for (const name of services) {
    const service = polyfilled(name);
    if (!service || holds(service, language)) continue;
    const key = `${name}:${language.toLowerCase()}`;
    let loading = loads.get(key);
    if (!loading) {
      loading = load(name, service, language);
      loads.set(key, loading);
    }
    pending.push(loading);
  }
  if (pending.length === 0) return undefined;

  return Promise.all(pending).then((added) => {
    if (!added.includes(true)) return false;
    forgetIntlFormats();
    return true;
  });
}

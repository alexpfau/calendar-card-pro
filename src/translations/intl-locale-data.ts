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

/** How one service's load ended: data added, already held, absent, or unreachable. */
type Outcome = 'added' | 'held' | 'absent' | 'unreachable';

const loads = new Map<string, Promise<Outcome>>();

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
 * already hold and Home Assistant serves, so a language it has no file for falls back as `Intl`
 * itself would. Every `intlCache` is emptied the moment the data is in, before anyone draws.
 * Never rejects.
 *
 * @param name - The service
 * @param service - Its polyfill
 * @param language - Card language
 * @returns How it ended; `unreachable` where a request failed and none succeeded
 */
async function load(
  name: IntlServiceName,
  service: PolyfilledService,
  language: string,
): Promise<Outcome> {
  let unreachable = false;
  for (const locale of intlLocales(language)) {
    if (holds(service, locale)) return 'held';
    const file = HOME_ASSISTANT_NAMES[locale.toLowerCase()] ?? locale;
    try {
      const response = await fetch(`${LOCALE_DATA}/intl-${name.toLowerCase()}/${file}.json`);
      if (response.ok) {
        service.__addLocaleData!(await response.json());
        forgetIntlFormats();
        return 'added';
      }
    } catch {
      // Unreachable or unreadable: the next locale, and failing that the polyfill as it was.
      unreachable = true;
    }
  }
  return unreachable ? 'unreachable' : 'absent';
}

/**
 * Make sure Home Assistant's `Intl` polyfill, where it has installed one, can write a card
 * language, by loading the language's data from Home Assistant where the polyfill lacks it.
 *
 * Formats made before the data arrived would keep writing another language, so every
 * `intlCache` is emptied as each service's data lands, and `added` is called then, for the
 * caller to draw again; one service is never held up by another. Each service is fetched once
 * per language for the whole page, except where the request failed outright, which the next
 * call tries again. A failure leaves the polyfill as it was, writing what it wrote before.
 *
 * @param language - Card language
 * @param services - The services the caller writes with
 * @param added - Called each time a service has the language's data, after the caches are emptied
 * @returns `undefined` where there is nothing to load, which is everywhere the browser's own
 *   `Intl` is in place; otherwise whether any data was added, once every service has settled
 */
export function loadIntlLocaleData(
  language: string,
  services: ReadonlyArray<IntlServiceName>,
  added?: () => void,
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
      void loading.then((outcome) => {
        if (outcome === 'unreachable') loads.delete(key);
      });
    }
    pending.push(
      loading.then((outcome) => {
        if (outcome !== 'added') return false;
        added?.();
        return true;
      }),
    );
  }
  if (pending.length === 0) return undefined;

  return Promise.all(pending).then((results) => results.includes(true));
}

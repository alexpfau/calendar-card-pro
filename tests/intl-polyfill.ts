/**
 * Home Assistant's `Intl` polyfill, as far as the card meets it: a formatjs service holding the
 * data of the languages loaded into it and no other.
 *
 * Home Assistant's frontend installs formatjs's `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`
 * and `Intl.ListFormat` where the browser has no data for the language it starts in, then loads
 * that language from `/static/locale-data/intl-<service>/<language>.json` through
 * `__addLocaleData`, which takes the file's `{ locale, data }` as it is. The fake keeps what
 * formatjs does with that (`registerLocaleData`): it registers the tag, every shorter tag down to
 * the language, and, for a tag naming a script, the tag with the script's usual region in its
 * place, so `zh-Hans` answers for `zh-CN` and `zh`. `supportedLocalesOf` and the constructor then
 * look a request up by truncation, as formatjs's lookup does, and a request it has nothing for
 * resolves to the first language loaded, formatjs's `__defaultLocale`. The text itself comes from
 * Node's own `Intl` in the resolved language.
 *
 * The real polyfill was checked against this on Home Assistant's own page in Chromium 151, with
 * Home Assistant's own files, for every card language: S114's harness, in the PR.
 */

/** An `Intl` service, as far as the card uses one. */
export type Service = (new (locales?: Intl.LocalesArgument, options?: object) => object) & {
  supportedLocalesOf(locales: Intl.LocalesArgument, options?: object): string[];
};

/** The services Home Assistant polyfills that the card or the editor writes with. */
export const POLYFILLED = ['DateTimeFormat', 'RelativeTimeFormat', 'ListFormat'] as const;
export type PolyfilledName = (typeof POLYFILLED)[number];

const IntlServices = Intl as unknown as Record<string, Service>;
const NATIVE = Object.fromEntries(POLYFILLED.map((name) => [name, IntlServices[name]])) as Record<
  PolyfilledName,
  Service
>;

/** The region formatjs gives a script tag (`defaultContent`), for the tags the card meets. */
const SCRIPT_REGIONS: Readonly<Record<string, string>> = {
  'zh-Hans': 'CN',
  'zh-Hant': 'TW',
  'sr-Latn': 'RS',
  'sr-Cyrl': 'RS',
};

/** A polyfilled service, with what it holds. */
export type FakeService = Service & {
  polyfilled: true;
  __addLocaleData(entry: { locale: string; data: unknown }): void;
  /** Every tag `__addLocaleData` was given, in order. */
  added: string[];
};

/**
 * A formatjs-like polyfill of one service, holding the given languages.
 *
 * @param name - The service
 * @param languages - What Home Assistant loaded into it, in order: the first is its default
 * @returns The service
 */
export function polyfill(name: PolyfilledName, languages: string[]): FakeService {
  const Native = NATIVE[name];
  const available = new Set<string>();
  const added: string[] = [];
  let fallback = '';

  const register = (locale: string) => {
    const [canonical] = Intl.getCanonicalLocales(locale);
    added.push(locale);
    fallback ||= canonical;
    const parts = canonical.split('-');
    while (parts.length > 0) {
      available.add(parts.join('-'));
      parts.pop();
    }
    const [language, script] = canonical.split('-');
    const region = SCRIPT_REGIONS[`${language}-${script}`];
    if (region) available.add(`${language}-${region}`);
  };
  const best = (tag: string): string | undefined => {
    const parts = Intl.getCanonicalLocales(tag)[0].split('-');
    while (parts.length > 0) {
      const candidate = parts.join('-');
      if (available.has(candidate)) return candidate;
      parts.pop();
    }
    return undefined;
  };
  const list = (locales: Intl.LocalesArgument): string[] =>
    locales === undefined ? [] : (Array.isArray(locales) ? locales : [locales]).map(String);

  class Polyfill extends Native {
    static polyfilled = true as const;
    static added = added;

    constructor(locales?: Intl.LocalesArgument, options?: object) {
      const resolved = list(locales)
        .map(best)
        .find((tag) => tag !== undefined);
      super(resolved ?? fallback, options);
    }

    static supportedLocalesOf(locales: Intl.LocalesArgument): string[] {
      return Intl.getCanonicalLocales(list(locales)).filter((tag) => best(tag) !== undefined);
    }

    static __addLocaleData(entry: { locale: string; data: unknown }): void {
      if (typeof entry?.locale !== 'string' || entry.data === undefined) {
        throw new TypeError('not locale data');
      }
      register(entry.locale);
    }
  }
  for (const language of languages) register(language);
  added.length = 0;
  return Polyfill as unknown as FakeService;
}

/**
 * Installs Home Assistant's polyfill for every service, holding the given languages.
 *
 * @param languages - What Home Assistant loaded, its own language first
 * @returns The installed services
 */
export function installPolyfill(languages: string[]): Record<PolyfilledName, FakeService> {
  const installed = {} as Record<PolyfilledName, FakeService>;
  for (const name of POLYFILLED) {
    installed[name] = polyfill(name, languages);
    Object.defineProperty(Intl, name, {
      value: installed[name],
      configurable: true,
      writable: true,
    });
  }
  return installed;
}

/** Puts the browser's own services back. */
export function removePolyfill(): void {
  for (const name of POLYFILLED) {
    Object.defineProperty(Intl, name, { value: NATIVE[name], configurable: true, writable: true });
  }
}

/** A file Home Assistant serves, by the path the card asks for it at. */
const SERVED =
  /^\/static\/locale-data\/intl-(datetimeformat|relativetimeformat|listformat)\/(.+)\.json$/;

/**
 * Home Assistant's `/static/locale-data/`, as a `fetch` that records what it was asked for and
 * serves `{ locale, data }` for any language but the ones it is told to lack.
 *
 * @param lacking - Language files to answer 404 for, by Home Assistant's name
 * @returns The fetch, and the paths it was asked for
 */
export function homeAssistantFiles(lacking: string[] = []): {
  fetch: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  asked: string[];
} {
  const asked: string[] = [];
  return {
    asked,
    fetch: async (url: string) => {
      asked.push(url);
      const match = SERVED.exec(url);
      if (!match || lacking.includes(match[2])) {
        return { ok: false, json: async () => Promise.reject(new SyntaxError('404')) };
      }
      return { ok: true, json: async () => ({ locale: match[2], data: { fake: true } }) };
    },
  };
}

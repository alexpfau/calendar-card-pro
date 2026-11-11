/**
 * Home Assistant's `Intl` polyfill and the card's language (`src/translations/intl-locale-data.ts`).
 *
 * Where the browser lacks the language Home Assistant's frontend starts in, as Chromium lacks
 * Icelandic and Nynorsk, the frontend installs formatjs's `Intl` services holding that language
 * alone, and every card on the page writes through them. Measured on Home Assistant's own page in
 * Chromium 151: a German card under an Icelandic Home Assistant read "Núna", a Chinese one
 * "á morgun". The card now loads its own language into the polyfill from Home Assistant's
 * `/static/locale-data/`, and these tests hold both paths with `tests/intl-polyfill.ts`, which
 * keeps what formatjs does with that data:
 *
 * - without the polyfill nothing is fetched and nothing changes, for every card language;
 * - with it, the card asks for its language under Home Assistant's own file name, and once the
 *   data is in, writes every `Intl` string exactly as it does without the polyfill, through the
 *   same modules, so formats cached before the data arrived must have been dropped;
 * - a file Home Assistant lacks falls back by the card's one rule (Nynorsk to Bokmål, anything to
 *   English), and a failure leaves the polyfill writing what it wrote before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW } from './fixtures';
import { homeAssistantFiles, installPolyfill, removePolyfill } from './intl-polyfill';
import { intlStrings } from './intl-strings';

/** Every service the card or the editor writes with. */
const ALL = ['DateTimeFormat', 'RelativeTimeFormat', 'ListFormat'] as const;

/** The path the card asks Home Assistant for one service's data at. */
const path = (service: string, file: string) =>
  `/static/locale-data/intl-${service.toLowerCase()}/${file}.json`;

/**
 * Home Assistant's file names for the card languages, where they are not the card's own key:
 * its translations name Chinese by script and write the region and script in their casing. Read
 * from Home Assistant's `/static/locale-data/` itself, which served all 38 card languages under
 * these names and the rest under the card's own.
 */
const HOME_ASSISTANT_NAMES: Record<string, string> = {
  'en-gb': 'en-GB',
  'sr-latn': 'sr-Latn',
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
};

/** What a language reads as without the polyfill, through modules no other case has touched. */
async function nativeStrings(language: string) {
  removePolyfill();
  vi.resetModules();
  const strings = await intlStrings(language);
  vi.resetModules();
  return strings;
}

const loader = () => import('../src/translations/intl-locale-data');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  removePolyfill();
});

describe('without the polyfill', () => {
  it('fetches nothing and has nothing to load, for every card language', async () => {
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);
    const { CARD_LANGUAGES } = await import('../src/translations/language-codes');
    const { loadIntlLocaleData } = await loader();

    for (const language of CARD_LANGUAGES) {
      expect(loadIntlLocaleData(language, ALL), language).toBeUndefined();
    }
    expect(files.asked).toEqual([]);
  });

  it('fetches nothing for a language the browser lacks, since only the polyfill takes data', async () => {
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);
    // As Chromium 151 has it: no Icelandic, so a request for it resolves to the browser's own.
    const icelandic = (tag: string) => /^is(?:-|$)/i.test(tag);
    for (const name of ALL) {
      const Native = (Intl as unknown as Record<string, typeof Intl.DateTimeFormat>)[name];
      const lacking = class extends Native {
        constructor(locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
          const left = [locales ?? []].flat().filter((tag) => !icelandic(tag));
          super(left.length > 0 ? left : 'en-US', options);
        }

        static supportedLocalesOf(locales: string | string[]) {
          return Native.supportedLocalesOf(locales).filter((tag) => !icelandic(tag));
        }
      };
      Object.defineProperty(Intl, name, { value: lacking, configurable: true, writable: true });
    }
    const { loadIntlLocaleData } = await loader();

    expect(loadIntlLocaleData('is', ALL)).toBeUndefined();
    expect(files.asked).toEqual([]);
  });
});

describe('under an Icelandic Home Assistant', () => {
  it('a German card reads Icelandic until it loads German, then exactly as without the polyfill', async () => {
    const german = await nativeStrings('de');
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);
    installPolyfill(['is']);

    const before = await intlStrings('de');
    expect(before.now, 'the bleed the polyfill causes').toBe('Núna');

    const { loadIntlLocaleData } = await loader();
    await expect(loadIntlLocaleData('de', ALL)).resolves.toBe(true);
    expect(files.asked).toEqual(ALL.map((name) => path(name, 'de')));

    // The same modules, whose caches held Icelandic formats.
    expect(await intlStrings('de')).toEqual(german);
  });

  it("asks for every card language under Home Assistant's own name, and writes it as without the polyfill", async () => {
    const { CARD_LANGUAGES } = await import('../src/translations/language-codes');
    const expected = new Map<string, Awaited<ReturnType<typeof intlStrings>>>();
    for (const language of CARD_LANGUAGES) expected.set(language, await nativeStrings(language));

    for (const language of CARD_LANGUAGES) {
      if (language === 'is') continue;
      vi.resetModules();
      const files = homeAssistantFiles();
      vi.stubGlobal('fetch', files.fetch);
      installPolyfill(['is']);
      const { loadIntlLocaleData } = await loader();

      await expect(loadIntlLocaleData(language, ALL), language).resolves.toBe(true);
      const file = HOME_ASSISTANT_NAMES[language] ?? language;
      expect(files.asked, language).toEqual(ALL.map((name) => path(name, file)));
      expect(await intlStrings(language), language).toEqual(expected.get(language));
    }
  });

  it('a Nynorsk card loads Nynorsk, and Bokmål where Home Assistant has no Nynorsk', async () => {
    const nynorsk = await nativeStrings('nn');
    const bokmal = await nativeStrings('nb');

    installPolyfill(['is']);
    const all = homeAssistantFiles();
    vi.stubGlobal('fetch', all.fetch);
    await (await loader()).loadIntlLocaleData('nn', ALL);
    expect(await intlStrings('nn')).toEqual(nynorsk);

    vi.resetModules();
    installPolyfill(['is']);
    const withoutNynorsk = homeAssistantFiles(['nn']);
    vi.stubGlobal('fetch', withoutNynorsk.fetch);
    await expect((await loader()).loadIntlLocaleData('nn', ALL)).resolves.toBe(true);
    expect([...withoutNynorsk.asked].sort()).toEqual(
      ALL.flatMap((name) => [path(name, 'nn'), path(name, 'nb')]).sort(),
    );
    expect(await intlStrings('nn')).toEqual(bokmal);
  });

  it("loads English, the rule's last resort, where Home Assistant has nothing for the language", async () => {
    const english = await nativeStrings('en');
    installPolyfill(['is']);
    const files = homeAssistantFiles(['de']);
    vi.stubGlobal('fetch', files.fetch);

    await expect((await loader()).loadIntlLocaleData('de', ALL)).resolves.toBe(true);
    expect(files.asked.filter((asked) => asked.endsWith('/en.json'))).toHaveLength(ALL.length);
    const { endDate, ...rest } = await intlStrings('de');
    const { endDate: englishEnd, ...englishRest } = english;
    expect(rest).toEqual(englishRest);
    expect(endDate, 'German weekdays, from the card').not.toBe(englishEnd);
  });

  it('loads a regional language where the polyfill holds only its base, such as English', async () => {
    const british = await nativeStrings('en-gb');
    installPolyfill(['is', 'en']);
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);

    const before = await intlStrings('en-gb');
    expect(before.clock24h, 'American, as the polyfill resolves en-GB to en').toBe(false);
    await expect((await loader()).loadIntlLocaleData('en-gb', ALL)).resolves.toBe(true);
    expect(files.asked).toEqual(ALL.map((name) => path(name, 'en-GB')));
    expect(await intlStrings('en-gb')).toEqual(british);
  });

  it("loads nothing for a card in Home Assistant's own language", async () => {
    installPolyfill(['is']);
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);

    expect((await loader()).loadIntlLocaleData('is', ALL)).toBeUndefined();
    expect(files.asked).toEqual([]);
  });

  it('loads nothing more where the polyfill already has English to fall back on', async () => {
    installPolyfill(['is', 'en']);
    const files = homeAssistantFiles(['de']);
    vi.stubGlobal('fetch', files.fetch);

    await expect((await loader()).loadIntlLocaleData('de', ALL)).resolves.toBe(false);
    expect(files.asked).toEqual(ALL.map((name) => path(name, 'de')));
  });

  it('writes what it wrote before where every file fails', async () => {
    installPolyfill(['is']);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    const before = await intlStrings('de');

    await expect((await loader()).loadIntlLocaleData('de', ALL)).resolves.toBe(false);
    expect(await intlStrings('de')).toEqual(before);
    expect(before.now).toBe('Núna');
  });

  it('fetches each file once for any number of cards in one language', async () => {
    installPolyfill(['is']);
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);
    const { loadIntlLocaleData } = await loader();

    const loads = [1, 2, 3].map(() => loadIntlLocaleData('de', ALL));
    expect(await Promise.all(loads)).toEqual([true, true, true]);
    expect(loadIntlLocaleData('de', ALL), 'once it has German').toBeUndefined();
    expect(files.asked).toEqual(ALL.map((name) => path(name, 'de')));
  });

  it('loads only the services asked for', async () => {
    installPolyfill(['is']);
    const files = homeAssistantFiles();
    vi.stubGlobal('fetch', files.fetch);

    await (await loader()).loadIntlLocaleData('de', ['DateTimeFormat', 'RelativeTimeFormat']);
    expect(files.asked).toEqual([path('DateTimeFormat', 'de'), path('RelativeTimeFormat', 'de')]);
  });
});

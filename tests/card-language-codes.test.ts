import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as LanguageCodes from '../src/translations/language-codes';
import * as Localize from '../src/translations/localize';

/**
 * The card's language list, which exists so the editor can resolve a language without
 * importing `localize.ts` and every card-language table with it.
 *
 * A second list of the same codes is exactly the kind of table that drifts, so it is pinned
 * three ways here: to the `TRANSLATIONS` keys, to the language files on disk, and, through the
 * one function both bundles call, to what a configured language resolves to. `tsc` holds the
 * map to the list as well (`satisfies` in `localize.ts`) and `check:i18n` the list to the
 * files; this file is the runtime half.
 */

const LANGUAGES_DIR = join(process.cwd(), 'src/translations/languages');

const sorted = (codes: Iterable<string>): string[] => [...codes].sort();

describe('CARD_LANGUAGES', () => {
  it('names exactly the TRANSLATIONS keys', () => {
    expect(sorted(LanguageCodes.CARD_LANGUAGES)).toEqual(
      sorted(Object.keys(Localize.TRANSLATIONS)),
    );
  });

  it('names exactly the language files, lowercased', () => {
    const files = readdirSync(LANGUAGES_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length).toLowerCase());

    expect(files.length).toBeGreaterThanOrEqual(30);
    expect(sorted(LanguageCodes.CARD_LANGUAGES)).toEqual(sorted(files));
  });

  it('lists each code once', () => {
    expect(new Set(LanguageCodes.CARD_LANGUAGES).size).toBe(LanguageCodes.CARD_LANGUAGES.length);
  });
});

describe('getEffectiveLanguage', () => {
  it('is one function, whichever module the caller imports it from', () => {
    // The editor imports `language-codes.ts`; the card imports `localize.ts`. Two
    // implementations would be free to disagree about which language a card is in.
    expect(Localize.getEffectiveLanguage).toBe(LanguageCodes.getEffectiveLanguage);
    expect(Localize.DEFAULT_LANGUAGE).toBe(LanguageCodes.DEFAULT_LANGUAGE);
  });

  it('lives in a module that imports nothing, so the editor carries no card-language table', () => {
    // Any import here is bundled into `editor.js`. Importing `localize.ts` put all 36
    // tables there, for one membership check.
    const source = readFileSync(join(process.cwd(), 'src/translations/language-codes.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\b/m);
  });

  it.each([
    ['de', undefined, 'de'],
    ['EN-GB', undefined, 'en-gb'],
    ['zh-CN', undefined, 'zh-cn'],
    [undefined, 'de-DE', 'de'],
    [undefined, 'pt_BR', 'pt'],
    [undefined, 'zh-Hant', 'en'],
    ['klingon', 'fr', 'fr'],
    ['  ', 'nl', 'nl'],
  ])('resolves config %j with Home Assistant in %j to %j', (config, hass, expected) => {
    expect(LanguageCodes.getEffectiveLanguage(config, hass ? { language: hass } : undefined)).toBe(
      expected,
    );
  });

  it.each(['constructor', '__proto__'])(
    'does not take the object key %j for a language',
    (name) => {
      // The lookup used to index the TRANSLATIONS object, where these are inherited
      // properties: `language: constructor` resolved to 'constructor', and
      // `getTranslations` then returned `Object`.
      expect(LanguageCodes.getEffectiveLanguage(name)).toBe('en');
      expect(LanguageCodes.getEffectiveLanguage(undefined, { language: name })).toBe('en');
    },
  );
});

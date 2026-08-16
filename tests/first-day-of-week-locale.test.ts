/**
 * Regression tests for `first_day_of_week: 'system'`.
 *
 * `'system'` is the default, and it used to resolve through a regex that tested the card's
 * own translation language for an uppercase `en-US` / `en-CA` / `es-US`. That language is
 * lowercased before it ever reaches the function and is only ever one of the card's own
 * translation codes, so the regex could not match anything: every user on earth got Monday,
 * and the "Follow Home Assistant" option never read Home Assistant's setting at all.
 *
 * These tests pin both halves of the fix — the weekday Home Assistant stores explicitly,
 * and the CLDR table that decides when Home Assistant leaves it at `language`.
 */

import { describe, expect, it } from 'vitest';

import * as FormatUtils from '../src/utils/format';

/**
 * Every language Home Assistant's frontend ships, from its own `translationMetadata.json`.
 * This is the real input domain of the `'system'` branch, because the value that reaches it
 * is `hass.locale.language`.
 */
const HA_LANGUAGES = [
  'af',
  'ar',
  'bg',
  'bn',
  'bs',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'en',
  'en-GB',
  'eo',
  'es',
  'es-419',
  'et',
  'eu',
  'fa',
  'fi',
  'fy',
  'fr',
  'ga',
  'gl',
  'gsw',
  'he',
  'hi',
  'hr',
  'hu',
  'hy',
  'id',
  'it',
  'is',
  'ja',
  'ka',
  'ko',
  'lb',
  'lt',
  'lv',
  'mk',
  'ml',
  'nl',
  'nb',
  'nn',
  'pl',
  'pt',
  'pt-BR',
  'ro',
  'ru',
  'sk',
  'sl',
  'sr',
  'sr-Latn',
  'sv',
  'sq',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'ur',
  'vi',
  'zh-Hans',
  'zh-Hant',
];

/**
 * Read CLDR's first day of week straight from the runtime, as the day number this card
 * uses (0 = Sunday). CLDR numbers days 1 = Monday .. 7 = Sunday, so `% 7` maps Sunday to 0.
 *
 * Two spellings exist and the project's own runtimes disagree about which: Node 22 — the
 * version CI and the docs deploy are pinned to — exposes only the `weekInfo` getter, while
 * Node 25 also has the `getWeekInfo()` method. That split is exactly why the card ships a
 * table instead of calling this at runtime.
 */
function cldrFirstDay(tag: string): number | undefined {
  const locale = new Intl.Locale(tag) as unknown as {
    getWeekInfo?: () => { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo;
  return typeof info?.firstDay === 'number' ? info.firstDay % 7 : undefined;
}

describe('CLDR oracle', () => {
  it('is available and correct, so the table comparison below means something', () => {
    // Without this the whole suite below could pass by comparing undefined to undefined.
    expect(cldrFirstDay('en-US')).toBe(0);
    expect(cldrFirstDay('de')).toBe(1);
    expect(cldrFirstDay('ar')).toBe(6);
  });
});

describe('first_day_of_week: system, resolved from the Home Assistant language', () => {
  it("matches CLDR for every language Home Assistant ships, and isn't Monday for all of them", () => {
    const mismatches: string[] = [];
    const resolved = new Set<number>();

    for (const language of HA_LANGUAGES) {
      const expected = cldrFirstDay(language);
      const actual = FormatUtils.getFirstDayOfWeek('system', { language });
      resolved.add(actual);
      if (actual !== expected) {
        mismatches.push(`${language}: expected ${expected}, got ${actual}`);
      }
    }

    expect(mismatches).toEqual([]);
    // The original bug was a uniform answer, so a table that returned 1 everywhere would
    // still satisfy the loop above for the 45 Monday languages. Require real variety.
    expect([...resolved].sort()).toEqual([0, 1, 6]);
  });

  it.each([
    { name: 'en (US English, the most common Sunday case)', language: 'en', expected: 0 },
    { name: 'ja', language: 'ja', expected: 0 },
    { name: 'he', language: 'he', expected: 0 },
    { name: 'pt-BR', language: 'pt-BR', expected: 0 },
    { name: 'th', language: 'th', expected: 0 },
    { name: 'ar (Saturday, which the old code could not express)', language: 'ar', expected: 6 },
    { name: 'fa (Saturday)', language: 'fa', expected: 6 },
  ])('returns a non-Monday week start for $name', ({ language, expected }) => {
    expect(FormatUtils.getFirstDayOfWeek('system', { language })).toBe(expected);
  });

  it.each([
    { name: 'en-GB does not inherit Sunday from en', language: 'en-GB', expected: 1 },
    { name: 'zh-Hans does not inherit Sunday from zh-Hant', language: 'zh-Hans', expected: 1 },
    { name: 'zh-Hant is Sunday', language: 'zh-Hant', expected: 0 },
    { name: 'es-419 falls back to its base language', language: 'es-419', expected: 1 },
    { name: 'sr-Latn falls back to its base language', language: 'sr-Latn', expected: 1 },
  ])('resolves regional variants correctly: $name', ({ language, expected }) => {
    expect(FormatUtils.getFirstDayOfWeek('system', { language })).toBe(expected);
  });

  it('is case-insensitive, because locale tags reach the card in mixed casing', () => {
    expect(FormatUtils.getFirstDayOfWeek('system', { language: 'EN-gb' })).toBe(1);
    expect(FormatUtils.getFirstDayOfWeek('system', { language: 'ZH-HANT' })).toBe(0);
  });

  it('falls back to Monday for a language CLDR has no opinion about', () => {
    expect(FormatUtils.getFirstDayOfWeek('system', { language: 'xx-YY' })).toBe(1);
  });
});

describe('first_day_of_week: system, when Home Assistant has an explicit weekday', () => {
  it.each([
    { name: 'sunday', first_weekday: 'sunday', expected: 0 },
    { name: 'monday', first_weekday: 'monday', expected: 1 },
    { name: 'tuesday', first_weekday: 'tuesday', expected: 2 },
    { name: 'wednesday', first_weekday: 'wednesday', expected: 3 },
    { name: 'thursday', first_weekday: 'thursday', expected: 4 },
    { name: 'friday', first_weekday: 'friday', expected: 5 },
    { name: 'saturday', first_weekday: 'saturday', expected: 6 },
  ])('follows the profile setting $name', ({ first_weekday, expected }) => {
    // German would otherwise resolve to Monday, so anything but Monday proves the
    // explicit setting won rather than the language table.
    expect(FormatUtils.getFirstDayOfWeek('system', { language: 'de', first_weekday })).toBe(
      expected,
    );
  });

  it("ignores Home Assistant's 'language' sentinel and asks the language instead", () => {
    expect(
      FormatUtils.getFirstDayOfWeek('system', { language: 'ja', first_weekday: 'language' }),
    ).toBe(0);
    expect(
      FormatUtils.getFirstDayOfWeek('system', { language: 'de', first_weekday: 'language' }),
    ).toBe(1);
  });
});

describe('first_day_of_week precedence and fallbacks', () => {
  it('lets an explicit card setting override Home Assistant', () => {
    const locale = { language: 'de', first_weekday: 'wednesday' };
    expect(FormatUtils.getFirstDayOfWeek('sunday', locale)).toBe(0);
    expect(FormatUtils.getFirstDayOfWeek('monday', locale)).toBe(1);
  });

  it("ignores the card's own language option, which only picks a translation", () => {
    // A German household running the card in English still starts its week on Monday.
    expect(FormatUtils.getFirstDayOfWeek('system', { language: 'de' })).toBe(1);
    // ...and an American household running the card in German still starts it on Sunday.
    expect(FormatUtils.getFirstDayOfWeek('system', { language: 'en' })).toBe(0);
  });

  it('falls back to Monday when Home Assistant offers no locale', () => {
    expect(FormatUtils.getFirstDayOfWeek('system')).toBe(1);
    expect(FormatUtils.getFirstDayOfWeek('system', {})).toBe(1);
    expect(FormatUtils.getFirstDayOfWeek('system', { language: '' })).toBe(1);
  });
});

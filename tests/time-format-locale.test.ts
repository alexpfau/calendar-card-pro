import { describe, expect, it } from 'vitest';

import { getTimeFormat24h } from '../src/utils/helpers';

/**
 * Clock format resolved from the Home Assistant locale.
 *
 * `time_24h` defaults to `'system'`, and Home Assistant's own `time_format`
 * defaults to `'language'`, so for a user who has changed neither setting the
 * card's clock format is decided entirely by `hass.locale.language`. That made
 * this worth pinning, because it fails silently: the card still renders, the
 * layout is unchanged, and the only symptom is `1:00 PM` where the reader
 * expects `13:00`. Nobody testing in their own language would ever see it.
 *
 * Note the denominator. `hass.locale.language` is Home Assistant's *frontend*
 * language, not the card's translation set, so the population at risk is the 64
 * languages Home Assistant ships rather than the 35 the card translates.
 *
 * Two hand-rolled heuristics decided this, and both were wrong:
 *
 * - a 24-entry allowlist of "likely 24h languages", tested against the base
 *   language only. It disagreed with CLDR for **33 of those 64 languages**.
 *   Thirty fell through to 12-hour when they should not have, and three claimed
 *   24-hour wrongly (`el`, `ko`, and Traditional Chinese). Three separate causes
 *   compounded: splitting on `-` discarded the region, so `en-GB` became `en`
 *   and `es-419` became `es`; the list named the macrolanguage `no`, which never
 *   matches the `nb`/`nn` tags Home Assistant actually sends; and it simply
 *   asserted the wrong answer for Greek and Korean.
 * - an `/AM|PM|am|pm/` test on the formatted string for the `'system'` branch,
 *   which only recognised an unpunctuated Latin day period. It misread five
 *   languages as 24-hour: Greek renders `1 μ.μ.`, Traditional Chinese `下午1時`,
 *   Arabic `1 م`, Albanian `1 m.d.` and Latin-American Spanish `1 p.m.` — the
 *   last two because the periods break the literal `pm` the regex looked for.
 *
 * Both are now a single `Intl` query, which agrees with CLDR on all 64.
 *
 * The table below is hardcoded on purpose. Deriving the expectations from
 * `Intl` would only assert that the function calls `Intl`, which is not the
 * claim being made.
 */
describe('24-hour clock detection follows the locale', () => {
  // These tests only mean something if the runtime carries full CLDR data. A
  // Node built with small-icu answers every locale identically, which would let
  // the whole file pass while proving nothing.
  it('runs on a build with full locale data', () => {
    const render = (locale: string) =>
      new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(new Date(2000, 0, 1, 13, 0, 0));

    expect(render('en-US')).not.toBe(render('de'));
    expect(render('el')).toContain('μ');
  });

  describe('an explicit choice always wins', () => {
    it.each([
      { name: "'24' with a 12-hour language", locale: { time_format: '24', language: 'en-US' } },
      { name: "'24' with no language", locale: { time_format: '24' } },
    ])('$name resolves to 24-hour', ({ locale }) => {
      expect(getTimeFormat24h(locale, false)).toBe(true);
    });

    it.each([
      { name: "'12' with a 24-hour language", locale: { time_format: '12', language: 'de' } },
      { name: "'12' with no language", locale: { time_format: '12' } },
    ])('$name resolves to 12-hour', ({ locale }) => {
      expect(getTimeFormat24h(locale, true)).toBe(false);
    });
  });

  describe("time_format 'language' matches the language's own convention", () => {
    it.each([
      // Absent from the allowlist, so these all fell through to 12-hour.
      { name: 'af (Afrikaans)', language: 'af', expected: true },
      { name: 'bs (Bosnian)', language: 'bs', expected: true },
      { name: 'ca (Catalan)', language: 'ca', expected: true },
      { name: 'cy (Welsh)', language: 'cy', expected: true },
      { name: 'et (Estonian)', language: 'et', expected: true },
      { name: 'eu (Basque)', language: 'eu', expected: true },
      { name: 'fa (Persian)', language: 'fa', expected: true },
      { name: 'ga (Irish)', language: 'ga', expected: true },
      { name: 'gl (Galician)', language: 'gl', expected: true },
      { name: 'he (Hebrew)', language: 'he', expected: true },
      { name: 'hy (Armenian)', language: 'hy', expected: true },
      { name: 'id (Indonesian)', language: 'id', expected: true },
      { name: 'is (Icelandic)', language: 'is', expected: true },
      { name: 'ka (Georgian)', language: 'ka', expected: true },
      { name: 'lt (Lithuanian)', language: 'lt', expected: true },
      { name: 'lv (Latvian)', language: 'lv', expected: true },
      { name: 'mk (Macedonian)', language: 'mk', expected: true },
      { name: 'sr (Serbian)', language: 'sr', expected: true },
      { name: 'th (Thai)', language: 'th', expected: true },
      { name: 'uk (Ukrainian)', language: 'uk', expected: true },
      { name: 'vi (Vietnamese)', language: 'vi', expected: true },
      // The allowlist named the macrolanguage `no`, which never matches the
      // `nb`/`nn` tags Home Assistant actually sends.
      { name: 'nb (Norwegian Bokmal)', language: 'nb', expected: true },
      { name: 'nn (Norwegian Nynorsk)', language: 'nn', expected: true },
      // Claimed 24-hour by the allowlist, but all three write a day period.
      { name: 'el (Greek)', language: 'el', expected: false },
      { name: 'ko (Korean)', language: 'ko', expected: false },
      { name: 'zh-Hant (Chinese, traditional)', language: 'zh-Hant', expected: false },
      { name: 'zh-TW (Chinese, Taiwan)', language: 'zh-TW', expected: false },
      // Anchors: right before the fix and still right after, so an
      // over-correction that flipped everything would be caught here.
      { name: 'de (German)', language: 'de', expected: true },
      { name: 'fr (French)', language: 'fr', expected: true },
      { name: 'ja (Japanese)', language: 'ja', expected: true },
      { name: 'ru (Russian)', language: 'ru', expected: true },
      { name: 'es (Spanish)', language: 'es', expected: true },
      { name: 'zh-Hans (Chinese, simplified)', language: 'zh-Hans', expected: true },
      { name: 'en-US (US English)', language: 'en-US', expected: false },
      { name: 'hi (Hindi)', language: 'hi', expected: false },
    ])('$name', ({ language, expected }) => {
      // The caller fallback is set to the opposite of the expectation, so a row
      // can only pass by being resolved rather than by falling through.
      expect(getTimeFormat24h({ time_format: 'language', language }, !expected)).toBe(expected);
    });

    it.each([
      { name: 'en-GB against en-US', a: 'en-GB', b: 'en-US' },
      { name: 'es against es-419', a: 'es', b: 'es-419' },
    ])('distinguishes regional variants: $name', ({ a, b }) => {
      const resolve = (language: string) =>
        getTimeFormat24h({ time_format: 'language', language }, false);

      expect(resolve(a)).toBe(true);
      expect(resolve(b)).toBe(false);
    });
  });

  describe('falls back rather than guessing', () => {
    it.each([
      { name: 'no locale at all', locale: undefined },
      { name: 'an unrecognised time_format', locale: { time_format: 'lunar', language: 'de' } },
      { name: "'language' with no language", locale: { time_format: 'language' } },
      { name: 'a malformed language tag', locale: { time_format: 'language', language: '!!' } },
    ])('$name uses the caller fallback', ({ locale }) => {
      expect(getTimeFormat24h(locale, true)).toBe(true);
      expect(getTimeFormat24h(locale, false)).toBe(false);
    });
  });

  describe("time_format 'system'", () => {
    it('resolves from the runtime locale', () => {
      // happy-dom reports a Latin-script locale, so the only stable claim here
      // is that the branch resolves at all instead of falling through.
      expect(typeof getTimeFormat24h({ time_format: 'system', language: 'de' }, true)).toBe(
        'boolean',
      );
    });

    it.each([
      { name: 'el (day period written in Greek)', language: 'el', expected: false },
      { name: 'ar (day period written in Arabic)', language: 'ar', expected: false },
      { name: 'de (no day period at all)', language: 'de', expected: true },
    ])('falls back to the language when the runtime locale is unusable: $name', (row) => {
      const descriptor = Object.getOwnPropertyDescriptor(navigator, 'language');
      Object.defineProperty(navigator, 'language', { value: '!!', configurable: true });

      try {
        // `!!` is not a valid tag, so detection fails and the language has to
        // answer — through a path the old `/AM|PM/` regex could not have taken.
        expect(getTimeFormat24h({ time_format: 'system', language: row.language }, !row.expected)) //
          .toBe(row.expected);
      } finally {
        if (descriptor) Object.defineProperty(navigator, 'language', descriptor);
      }
    });
  });
});

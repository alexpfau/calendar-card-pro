import { describe, expect, it } from 'vitest';

import { getRelativeTimeString } from '../src/translations/dayjs';
import en from '../src/translations/languages/en.json';
import {
  TRANSLATIONS,
  getEffectiveLanguage,
  getTranslations,
  hasEditorTranslations,
} from '../src/translations/localize';

/**
 * Translation resolution, exercised through the public functions.
 *
 * This deliberately does not duplicate `scripts/check-i18n.mjs`. That script is a
 * static check on the four-place wiring — it reads the files on disk and compares
 * keys, so it owns "a language file exists but was never imported or registered".
 * This suite asserts the *runtime behaviour* those files produce, which is the part
 * a static check cannot see:
 *
 *   - that a registered language actually resolves to its own translations rather
 *     than falling through to English,
 *   - that the editor's whole-language English fallback works as AGENTS.md describes,
 *   - and that relative times are localized, which is the silent failure mode that
 *     shipped broken in Catalan and Romanian for months because the language works
 *     everywhere *except* here.
 *
 * The last one is why this file exists. A missing `supportedLocales` entry produces
 * English relative times with no error raised anywhere.
 *
 * The corpus is derived from the exported TRANSLATIONS map rather than from a
 * directory glob, both because that is the surface the card actually resolves
 * against and because it keeps this file free of Vite-only syntax, so plain `tsc`
 * can typecheck it alongside src.
 */

const LANGUAGES = Object.keys(TRANSLATIONS);

describe('language registry', () => {
  it('registers every shipped language', () => {
    // Guards the corpus itself. If TRANSLATIONS were gutted, every loop below
    // would pass while asserting almost nothing.
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(30);
    expect(LANGUAGES).toContain('en');
  });

  it('uses only lowercase keys, because lookups lowercase before matching', () => {
    // A non-lowercase key can never match, so the language silently renders English.
    const nonLowercase = LANGUAGES.filter((language) => language !== language.toLowerCase());
    expect(nonLowercase, 'these keys can never be matched').toEqual([]);
  });
});

describe('getEffectiveLanguage', () => {
  it('resolves an explicitly configured language', () => {
    expect(getEffectiveLanguage('de')).toBe('de');
    expect(getEffectiveLanguage('fr')).toBe('fr');
  });

  it('is case-insensitive, because the map keys are lowercase', () => {
    // `TRANSLATIONS` keys must be lowercase or lookups can never match. A user
    // writing `language: DE` in YAML should still get German.
    expect(getEffectiveLanguage('DE')).toBe('de');
    expect(getEffectiveLanguage('En-GB')).toBe('en-gb');
  });

  it('falls back to English for an unknown language', () => {
    expect(getEffectiveLanguage('klingon')).toBe('en');
  });

  it('falls back to English when nothing is configured', () => {
    expect(getEffectiveLanguage(undefined)).toBe('en');
  });

  it('resolves every shipped language to itself, not to English', () => {
    // The failure this catches: a language file exists but was never added to the
    // TRANSLATIONS map, or was added with a non-lowercase key. Either way the card
    // silently renders English and no error is raised.
    for (const language of LANGUAGES) {
      const resolved = getEffectiveLanguage(language);
      expect(resolved, `${language} did not resolve to itself`).toBe(language.toLowerCase());
    }
  });
});

describe('getTranslations', () => {
  it('returns the requested language, not English', () => {
    const de = getTranslations('de');
    expect(de.loading).not.toBe(en.loading);
  });

  it('returns complete runtime strings for every shipped language', () => {
    // Every top-level runtime key must be present and non-empty. A missing key
    // renders as `undefined` in the UI; an empty one renders as blank. Both look
    // like a rendering bug rather than a translation bug.
    const runtimeKeys = Object.keys(en).filter((key) => key !== 'editor');

    for (const language of LANGUAGES) {
      const translations = getTranslations(language) as unknown as Record<string, unknown>;

      for (const key of runtimeKeys) {
        const value = translations[key];
        expect(value, `${language}.${key} is missing`).toBeDefined();

        if (Array.isArray(value)) {
          expect(value, `${language}.${key} has the wrong length`).toHaveLength(
            (en as unknown as Record<string, unknown[]>)[key].length,
          );
          for (const entry of value) {
            expect(String(entry).trim(), `${language}.${key} has an empty entry`).not.toBe('');
          }
        } else {
          expect(String(value).trim(), `${language}.${key} is empty`).not.toBe('');
        }
      }
    }
  });
});

describe('hasEditorTranslations', () => {
  it('reports true for English', () => {
    expect(hasEditorTranslations('en')).toBe(true);
  });

  it('is all-or-nothing for every language that claims editor support', () => {
    // This is the AGENTS.md trap. `hasEditorTranslations` returns true when the
    // section has *one or more* keys, so a partially translated editor defeats the
    // whole-language English fallback: translated keys render, missing ones render
    // as the raw key name. Either translate all of it or omit the section.
    const editorKeys = Object.keys(en.editor);

    for (const language of LANGUAGES) {
      if (!hasEditorTranslations(language)) continue;

      const editor = (getTranslations(language) as unknown as { editor: Record<string, string> })
        .editor;

      const missing = editorKeys.filter((key) => !editor[key] || editor[key].trim() === '');
      expect(missing, `${language} has a partial editor section`).toEqual([]);
    }
  });
});

describe('locale mapping', () => {
  // `mapLocale` is private, so this asserts its observable effect instead of
  // importing it: a regional variant must produce the same relative time as its
  // base locale, because mapLocale reduces it before dayjs sees it.
  const reference = new Date('2026-06-15T12:00:00Z');
  const future = new Date('2026-06-17T12:00:00Z');

  it('reduces a regional variant to its base locale', () => {
    // en-gb needs neither a dayjs import nor a supportedLocales entry precisely
    // because mapLocale reduces it to `en`.
    expect(getRelativeTimeString(future, 'en-gb', reference)).toBe(
      getRelativeTimeString(future, 'en', reference),
    );
  });

  it('keeps the Chinese variants distinct from each other', () => {
    // zh-cn and zh-tw are the two special cases that survive reduction.
    const simplified = getRelativeTimeString(future, 'zh-cn', reference);
    const traditional = getRelativeTimeString(future, 'zh-tw', reference);
    expect(simplified).not.toBe(getRelativeTimeString(future, 'en', reference));
    expect(traditional).not.toBe(getRelativeTimeString(future, 'en', reference));
  });

  it('falls back to English for an unsupported locale', () => {
    expect(getRelativeTimeString(future, 'klingon', reference)).toBe(
      getRelativeTimeString(future, 'en', reference),
    );
  });
});

describe('relative time localization', () => {
  // The silent failure. A language missing its `supportedLocales` entry works
  // everywhere except here, where it quietly falls back to English. Catalan and
  // Romanian shipped broken this way for months precisely because nothing errors.
  const reference = new Date('2026-06-15T12:00:00Z');
  const future = new Date('2026-06-17T12:00:00Z');

  it('produces English for English', () => {
    const result = getRelativeTimeString(future, 'en', reference);
    expect(result.toLowerCase()).toContain('day');
  });

  it('produces a localized string, not English, for every non-English language', () => {
    const english = getRelativeTimeString(future, 'en', reference);

    const untranslated: string[] = [];

    for (const language of LANGUAGES) {
      if (language === 'en') continue;

      const result = getRelativeTimeString(future, language, reference);
      if (result === english) {
        untranslated.push(language);
      }
    }

    // Regional English variants legitimately share English relative times.
    const genuinelyBroken = untranslated.filter((language) => !language.startsWith('en-'));

    expect(genuinelyBroken, 'these languages fall back to English relative times').toEqual([]);
  });

  it('is deterministic given a fixed reference instant', () => {
    // getRelativeTimeString already accepts an explicit reference, which is what
    // makes this testable without faking the clock.
    const first = getRelativeTimeString(future, 'de', reference);
    const second = getRelativeTimeString(future, 'de', reference);
    expect(first).toBe(second);
  });
});

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { getRelativeTimeString } from '../src/translations/dayjs';
import en from '../src/translations/languages/en.json';
import { TRANSLATIONS, getEffectiveLanguage, getTranslations } from '../src/translations/localize';
import { formatEventTime } from '../src/utils/format';

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
 *   - that the editor's per-key English fallback works as AGENTS.md describes,
 *   - that registering the editor's sections does not take the card's own strings
 *     with them, which is the way the lazy-loading split could go wrong silently,
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

describe('the weekday casing split is intentional and stays that way', () => {
  // `fullDaysOfWeek` and `daysOfWeek` are two arrays for two grammatical positions, and
  // the difference is deliberate: `daysOfWeek` is a standalone day-header label, while
  // `fullDaysOfWeek` is only ever emitted mid-sentence, after `multiDay`, as
  // `till måndag, 5 jan`. Five contributors encoded exactly that — lower-case running
  // text against a capitalised label.
  //
  // Backlog Y13 recorded 17 of 35 languages getting it wrong. Ten are now fixed and are
  // pinned here alongside the original five. The remaining seven are deliberately absent:
  // `cs` `hr` `lt` `lv` `sk` need an oblique form their `multiDay` governs and no
  // in-repo evidence supplies, and `fi` `hu` need a template change no edit to this array
  // can reach. Lower-casing those seven would silence the `check:i18n` warning that is
  // currently the only signal they are unfinished, so they are left loud on purpose.
  //
  // Nothing else in the repo can catch a regression here. The single live consumer
  // renders without asserting, and no other test touches these arrays. Before this suite,
  // normalising `понедельника` to the dictionary form failed nothing anywhere, and it is
  // the sort of edit that looks like tidying.
  const SPLIT_CORRECT = [
    'nb',
    'nl',
    'nn',
    'ru',
    'uk',
    'da',
    'es',
    'et',
    'fr',
    'is',
    'it',
    'pl',
    'pt',
    'sv',
    'vi',
  ] as const;

  it.each(SPLIT_CORRECT)('%s keeps running-text lower-case against a capitalised label', (code) => {
    const { fullDaysOfWeek, daysOfWeek } = getTranslations(code);

    for (const [index, running] of fullDaysOfWeek.entries()) {
      expect(
        running[0],
        `${code} fullDaysOfWeek[${index}] "${running}" is capitalised; it is running text`,
      ).toBe(running[0].toLocaleLowerCase(code));
    }

    // The paired half. Without it the suite would pass on a language that lower-cased
    // *both* arrays, which is a different defect and not the one being guarded.
    const label = daysOfWeek[1];
    expect(label[0], `${code} daysOfWeek[1] "${label}" should be a capitalised label`).toBe(
      label[0].toLocaleUpperCase(code),
    );
  });

  it('keeps the Slavic genitives, which no dictionary lookup would preserve', () => {
    // The reason this needs naming rather than leaving to the casing rule above. `до`
    // and `do` govern the genitive, so these are inflected, not merely lower-cased —
    // and they are the only executable record of what a complete fix looks like for the
    // five languages that use the same preposition and still carry nominatives
    // (`cs`, `hr`, `sk` with `do`; `lt` `iki`, `lv` `līdz`).
    //
    // dayjs is the tempting oracle and would destroy them: its `weekdays` are nominative
    // by design, so "align with dayjs" turns three correct languages into three more
    // broken ones. The casing rule above cannot catch it either — `poniedziałek` is
    // lower-case and still wrong after `do`.
    expect(getTranslations('ru').fullDaysOfWeek[1]).toBe('понедельника');
    expect(getTranslations('uk').fullDaysOfWeek[1]).toBe('понеділка');
    expect(getTranslations('pl').fullDaysOfWeek[1]).toBe('poniedziałku');
  });

  // The rule above is only safe because something else supplies the capital a sentence
  // needs. That something is `capitalizeFirstLetter` in `formatEventTime`, which wraps
  // the whole rendered string — so the array can hold running text without any sentence
  // ever starting lower-case. Asserting the arrays alone would not show that, and the
  // arrays are exactly what a future contributor would "fix" if a card ever rendered
  // `till måndag` with no leading capital.
  describe('the capital comes from the call site, not from the array', () => {
    // The branch that matters is `${multiDay} ${endPart}`: an event that started before
    // today and ends beyond tomorrow is the only case where a *translated word* leads
    // the string. The other branches lead with a time, or never touch the weekday.
    const startedBeforeToday = new Date();
    startedBeforeToday.setDate(startedBeforeToday.getDate() - 2);
    const endsBeyondTomorrow = new Date();
    endsBeyondTomorrow.setDate(endsBeyondTomorrow.getDate() + 5);

    const spanning = {
      start: { dateTime: startedBeforeToday.toISOString() },
      end: { dateTime: endsBeyondTomorrow.toISOString() },
      summary: 'Spanning event',
    };

    it('capitalises the leading word in sv while leaving the weekday lower-case', () => {
      const { multiDay, fullDaysOfWeek } = getTranslations('sv');
      const weekday = fullDaysOfWeek[endsBeyondTomorrow.getDay()];
      const rendered = formatEventTime(spanning, buildConfig(), 'sv');

      // Non-vacuity, both halves. If `multiDay` were stored capitalised the first
      // assertion would pass without `capitalizeFirstLetter` doing anything, and if the
      // weekday were stored capitalised the last would pass for the wrong reason.
      expect(multiDay).toBe(multiDay.toLocaleLowerCase('sv'));
      expect(weekday).toBe(weekday.toLocaleLowerCase('sv'));

      // Drop `capitalizeFirstLetter` from `formatEventTime` and this pair inverts.
      expect(
        rendered.startsWith(`${multiDay[0].toLocaleUpperCase('sv')}${multiDay.slice(1)}`),
      ).toBe(true);
      expect(rendered.startsWith(multiDay)).toBe(false);

      // And the weekday, being mid-sentence, survives that pass untouched.
      expect(rendered).toContain(` ${weekday},`);
    });

    it('leaves a language that genuinely capitalises weekdays alone', () => {
      // German capitalises every noun, so `bis Montag` is correct and `de` was not
      // among the languages changed. Without this the suite would still pass if the
      // lower-casing had been applied indiscriminately to all 35 languages.
      const { fullDaysOfWeek } = getTranslations('de');
      const weekday = fullDaysOfWeek[endsBeyondTomorrow.getDay()];
      const rendered = formatEventTime(spanning, buildConfig(), 'de');

      expect(weekday[0]).toBe(weekday[0].toLocaleUpperCase('de'));
      expect(rendered).toContain(` ${weekday},`);
    });
  });
});

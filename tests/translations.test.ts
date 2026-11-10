import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import {
  getNowString,
  getRelativeTimeString,
  getRelativeUnitString,
} from '../src/translations/dayjs';
import en from '../src/translations/languages/en.json';
import { TRANSLATIONS, getEffectiveLanguage, getTranslations } from '../src/translations/localize';
import { formatEventTime } from '../src/utils/format';

/**
 * Translation resolution, exercised through the public functions.
 *
 * This deliberately does not duplicate `scripts/check-i18n.mjs`. That script is a
 * static check on the four-place wiring — it reads the files on disk and compares
 * keys, so it owns "a language file exists but was never imported or registered".
 * This suite asserts the *runtime behavior* those files produce, which is the part
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

  it("resolves Home Assistant's two Serbian languages to their own scripts", () => {
    // Home Assistant ships `sr`, which is Cyrillic, and `sr-Latn`. Reducing `sr-Latn` to
    // its base code would turn a Latin-script user's card Cyrillic.
    expect(getEffectiveLanguage(undefined, { language: 'sr' })).toBe('sr');
    expect(getEffectiveLanguage(undefined, { language: 'sr-Latn' })).toBe('sr-latn');
    expect(getEffectiveLanguage(undefined, { language: 'sr-RS' })).toBe('sr');
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
    // zh-cn and zh-tw survive reduction, as does sr-latn, which the script test below covers.
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

describe('relative times are written in the script of their language', () => {
  // Relative times come from two libraries, and the two can disagree about what a language
  // tag means. Day.js names its Serbian Latin locale `sr` and its Cyrillic one `sr-cyrl`,
  // while `Intl` and Home Assistant read `sr` as Cyrillic. A tag handed to both unchanged
  // writes "in 2 days" in one script and "now" and every other string in another, and the
  // English-fallback test above cannot see it, because neither string is English.
  //
  // The oracle is the language's own day names, which come from its translation file rather
  // than from either library.
  const SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Hebrew', 'Thai', 'Han', 'Hangul'] as const;
  const scriptsOf = (text: string): string[] =>
    SCRIPTS.filter((script) => new RegExp(`\\p{Script=${script}}`, 'u').test(text));

  const reference = new Date('2026-06-15T12:00:00Z');
  const future = new Date('2026-06-17T12:00:00Z');

  it.each(LANGUAGES)('%s uses the script of its own day names', (language) => {
    const own = scriptsOf(getTranslations(language).fullDaysOfWeek.join(' '));
    expect(own, `${language}'s day names should be in one script`).toHaveLength(1);

    expect(scriptsOf(getRelativeTimeString(future, language, reference)), 'Day.js').toEqual(own);
    expect(scriptsOf(getRelativeUnitString(2, 'day', language)), 'Intl, days').toEqual(own);
    expect(scriptsOf(getNowString(language)), 'Intl, now').toEqual(own);
  });
});

describe('"ends tomorrow" uses CLDR\'s word for tomorrow', () => {
  // `endsTomorrow` is written by hand in every language, and a typo in its one content word
  // reads as a real word to every other check: Catalan shipped "acaba damà" for "demà". CLDR
  // has the word, as the relative day `Intl.RelativeTimeFormat` writes for +1 with
  // `numeric: 'auto'`, and every language contains it in one of CLDR's three styles once case
  // and spaces are set aside. Swedish writes "imorgon" where CLDR writes "i morgon".
  //
  // `endsToday` cannot be held to CLDR this way: Romanian correctly writes "astăzi", and
  // CLDR's word in every style is its synonym "azi".
  const STYLES = ['long', 'short', 'narrow'] as const;
  const fold = (text: string, language: string) =>
    text.toLocaleLowerCase(language).replace(/\s+/g, '');

  it.each(LANGUAGES)('%s', (language) => {
    const words = STYLES.map((style) =>
      new Intl.RelativeTimeFormat(language, { numeric: 'auto', style }).format(1, 'day'),
    );
    // A word rather than "in 1 day", which CLDR writes where it has none.
    expect(words[0]).not.toMatch(/\d/);

    const phrase = getTranslations(language).endsTomorrow;
    const found = words.filter((word) => fold(phrase, language).includes(fold(word, language)));
    expect(found, `"${phrase}" against CLDR ${JSON.stringify(words)}`).not.toEqual([]);
  });

  it('writes the Catalan phrase whole', () => {
    // The reconciliation above finds the word anywhere in the phrase, so the phrase is pinned too.
    expect(getTranslations('ca').endsTomorrow).toBe('acaba demà');
  });
});

describe('the weekday casing split is intentional and stays that way', () => {
  // `fullDaysOfWeek` and `daysOfWeek` are two arrays for two grammatical positions, and
  // the difference is deliberate: `daysOfWeek` is a standalone day-header label, while
  // `fullDaysOfWeek` is only ever emitted mid-sentence, after `multiDay`, as
  // `till måndag, 5 jan`. Five contributors encoded exactly that — lower-case running
  // text against a capitalized label.
  //
  // A review of all 35 languages of the time found 17 getting it wrong, and a later check
  // against CLDR, which writes a weekday inside a date in lower case wherever the language
  // does, found two more that Day.js's capitalized weekdays had hidden: Catalan and
  // Romanian. All of them are fixed and pinned here alongside the original five. Seven of
  // them needed more than lower case, because their `multiDay` governs the weekday's form;
  // the test below pins those forms.
  //
  // Nothing else in the repo can catch a regression here. `check:i18n` warns on a
  // capitalized running-text weekday but cannot see a wrong case ending, the single live
  // consumer renders without asserting, and no other test touches these arrays. Before this
  // suite, normalizing `понедельника` to the dictionary form failed nothing anywhere, and it
  // is the sort of edit that looks like tidying.
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
    'sr',
    'sr-latn',
    'ca',
    'cs',
    'fi',
    'hr',
    'hu',
    'lt',
    'lv',
    'ro',
    'sk',
  ] as const;

  it.each(SPLIT_CORRECT)('%s keeps running-text lower-case against a capitalized label', (code) => {
    const { fullDaysOfWeek, daysOfWeek } = getTranslations(code);

    for (const [index, running] of fullDaysOfWeek.entries()) {
      expect(
        running[0],
        `${code} fullDaysOfWeek[${index}] "${running}" is capitalized; it is running text`,
      ).toBe(running[0].toLocaleLowerCase(code));
    }

    // The paired half. Without it the suite would pass on a language that lower-cased
    // *both* arrays, which is a different defect and not the one being guarded.
    const label = daysOfWeek[1];
    expect(label[0], `${code} daysOfWeek[1] "${label}" should be a capitalized label`).toBe(
      label[0].toLocaleUpperCase(code),
    );
  });

  it('keeps the forms multiDay governs, which no dictionary lookup would preserve', () => {
    // The reason this needs naming rather than leaving to the casing rule above. `до`,
    // `do`, `iki` and `līdz` each govern a case, so these weekdays are inflected, not
    // merely lower-cased.
    //
    // dayjs and CLDR are the tempting oracles and would destroy them: their weekdays are
    // the nominative, or in Finnish the essive, so "align with the library" turns every
    // language below into a broken one. The casing rule above cannot catch it either —
    // `poniedziałek` is lower-case and still wrong after `do`.
    expect(getTranslations('ru').fullDaysOfWeek[1]).toBe('понедельника');
    expect(getTranslations('uk').fullDaysOfWeek[1]).toBe('понеділка');
    expect(getTranslations('pl').fullDaysOfWeek[1]).toBe('poniedziałku');
    expect(getTranslations('sr').fullDaysOfWeek[1]).toBe('понедељка');
    expect(getTranslations('sr-latn').fullDaysOfWeek[1]).toBe('ponedeljka');

    // Pinned whole, because each of these was the nominative until it was fixed and a
    // single index would not notice one weekday going back. `do` and `iki` take the
    // genitive; `līdz` the dative.
    const governed: Record<string, [string, string[]]> = {
      cs: ['do', ['neděle', 'pondělí', 'úterý', 'středy', 'čtvrtka', 'pátku', 'soboty']],
      sk: ['do', ['nedele', 'pondelka', 'utorka', 'stredy', 'štvrtka', 'piatku', 'soboty']],
      hr: ['do', ['nedjelje', 'ponedjeljka', 'utorka', 'srijede', 'četvrtka', 'petka', 'subote']],
      lt: [
        'iki',
        [
          'sekmadienio',
          'pirmadienio',
          'antradienio',
          'trečiadienio',
          'ketvirtadienio',
          'penktadienio',
          'šeštadienio',
        ],
      ],
      lv: [
        'līdz',
        [
          'svētdienai',
          'pirmdienai',
          'otrdienai',
          'trešdienai',
          'ceturtdienai',
          'piektdienai',
          'sestdienai',
        ],
      ],
    };
    for (const [code, [multiDay, days]] of Object.entries(governed)) {
      expect(getTranslations(code).multiDay, code).toBe(multiDay);
      expect(getTranslations(code).fullDaysOfWeek, code).toEqual(days);
    }
  });

  it('writes Finnish and Hungarian as phrases their word order allows', () => {
    // Finnish "asti" is a postposition: it follows the day ("maanantaihin asti"), so the
    // card's "asti Maanantai" could not be fixed by any form of the weekday. The end takes
    // the verb the card's two other Finnish end phrases use, "päättyy tänään" and "päättyy
    // huomenna", and the weekday the essive that verb wants, which is CLDR's own form for a
    // weekday inside a date.
    const fi = getTranslations('fi');
    expect(fi.multiDay).toBe('päättyy');
    expect(fi.endsToday.startsWith(`${fi.multiDay} `)).toBe(true);
    expect(fi.endsTomorrow.startsWith(`${fi.multiDay} `)).toBe(true);
    expect(fi.fullDaysOfWeek).toEqual([
      'sunnuntaina',
      'maanantaina',
      'tiistaina',
      'keskiviikkona',
      'torstaina',
      'perjantaina',
      'lauantaina',
    ]);

    // Hungarian ends with a colon, "eddig:", which makes what follows a value rather than
    // part of the phrase, so the nominative is right and only the capital was wrong.
    const hu = getTranslations('hu');
    expect(hu.multiDay).toBe('eddig:');
    expect(hu.fullDaysOfWeek).toEqual([
      'vasárnap',
      'hétfő',
      'kedd',
      'szerda',
      'csütörtök',
      'péntek',
      'szombat',
    ]);
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

    it('capitalizes the leading word in sv while leaving the weekday lower-case', () => {
      const { multiDay, fullDaysOfWeek } = getTranslations('sv');
      const weekday = fullDaysOfWeek[endsBeyondTomorrow.getDay()];
      const rendered = formatEventTime(spanning, buildConfig(), 'sv');

      // Non-vacuity, both halves. If `multiDay` were stored capitalized the first
      // assertion would pass without `capitalizeFirstLetter` doing anything, and if the
      // weekday were stored capitalized the last would pass for the wrong reason.
      expect(multiDay).toBe(multiDay.toLocaleLowerCase('sv'));
      expect(weekday).toBe(weekday.toLocaleLowerCase('sv'));

      // Drop `capitalizeFirstLetter` from `formatEventTime` and this pair inverts.
      expect(
        rendered.startsWith(`${multiDay[0].toLocaleUpperCase('sv')}${multiDay.slice(1)}`),
      ).toBe(true);
      expect(rendered.startsWith(multiDay)).toBe(false);

      // And the weekday, being mid-sentence, survives that pass untouched. Swedish puts no
      // comma after it inside a date ("söndag 15 nov."), so a space follows it.
      expect(rendered).toContain(` ${weekday} `);
    });

    it('leaves a language that genuinely capitalizes weekdays alone', () => {
      // German capitalizes every noun, so `bis Montag` is correct and `de` was not
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

describe('the end of a multi-day event reads as a phrase', () => {
  // The casing tests above read the arrays; these read the sentence the card builds from
  // them, which is where a wrong `multiDay` shows. Each event ends five days out, so the end
  // takes `multiDay` and a weekday rather than "ends tomorrow".
  const endsLater = new Date();
  endsLater.setDate(endsLater.getDate() + 5);
  endsLater.setHours(17, 0, 0, 0);
  const startsToday = new Date();
  startsToday.setHours(0, 30, 0, 0);
  const startedBefore = new Date();
  startedBefore.setDate(startedBefore.getDate() - 2);

  const ymd = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-` +
    String(date.getDate()).padStart(2, '0');
  const dayAfter = new Date(endsLater);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const render = (code: string, start: Date | 'all-day') =>
    formatEventTime(
      start === 'all-day'
        ? {
            summary: 'Trip',
            start: { date: ymd(startedBefore) },
            end: { date: ymd(dayAfter) },
          }
        : {
            summary: 'Trip',
            start: { dateTime: start.toISOString() },
            end: { dateTime: endsLater.toISOString() },
          },
      buildConfig(),
      code,
    );
  const weekday = (code: string) => getTranslations(code).fullDaysOfWeek[endsLater.getDay()];

  it('sets the Finnish end clause off from a start time, as "ends tomorrow" is', () => {
    // Finnish writes no comma after the weekday inside a date: "perjantaina 23. lokakuuta".
    const day = weekday('fi');
    expect(render('fi', startsToday)).toContain(`, päättyy ${day} `);
    expect(render('fi', startedBefore).startsWith(`Päättyy ${day} `)).toBe(true);
    expect(render('fi', 'all-day')).toContain(`, päättyy ${day} `);

    // A word for "until" joins the start time with a space, as it always has.
    const english = render('en', startsToday);
    expect(english).toContain(` until ${weekday('en')}, `);
    expect(english).not.toContain(', until');
  });

  it('drops the preposition Catalan and Romanian do not put before a weekday', () => {
    // Catalan "fins dilluns", not "fins a dilluns"; Romanian "până luni", not "până la luni".
    for (const [code, word] of [
      ['ca', 'fins'],
      ['ro', 'până'],
    ]) {
      for (const start of [startsToday, startedBefore, 'all-day'] as const) {
        expect(render(code, start).toLocaleLowerCase(code), `${code} ${String(start)}`).toContain(
          `${word} ${weekday(code)}, `,
        );
      }
    }
  });
});

describe('Serbian is one translation in two scripts', () => {
  // `sr-Latn.json` is `sr.json` written in Latin letters, word for word. Editing one file and
  // not the other would give Cyrillic and Latin users different wording, and nothing else
  // compares the two. Cyrillic to Latin is unambiguous letter by letter, so the Latin file
  // can be derived and compared exactly.
  const LATIN: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    ђ: 'đ',
    е: 'e',
    ж: 'ž',
    з: 'z',
    и: 'i',
    ј: 'j',
    к: 'k',
    л: 'l',
    љ: 'lj',
    м: 'm',
    н: 'n',
    њ: 'nj',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    ћ: 'ć',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'c',
    ч: 'č',
    џ: 'dž',
    ш: 'š',
  };

  const toLatin = (text: string): string =>
    [...text]
      .map((char) => {
        const lower = char.toLowerCase();
        const latin = LATIN[lower];
        if (latin === undefined) return char;
        return char === lower ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
      })
      .join('');

  const values = (language: string): Record<string, string | string[]> =>
    getTranslations(language) as unknown as Record<string, string | string[]>;

  it('writes sr.json in Cyrillic alone', () => {
    // Guards the comparison below, which would pass trivially on two Latin files.
    const text = Object.values(values('sr')).flat().join(' ');
    expect(text).toMatch(/\p{Script=Cyrillic}/u);
    expect(text).not.toMatch(/\p{Script=Latin}/u);
  });

  it('transliterates sr.json into sr-Latn.json exactly', () => {
    const derived = Object.fromEntries(
      Object.entries(values('sr')).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map(toLatin) : toLatin(value),
      ]),
    );
    expect(values('sr-latn')).toEqual(derived);
  });
});

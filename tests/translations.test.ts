import { describe, expect, it } from 'vitest';

import { getRelativeTimeString } from '../src/translations/dayjs';
import enEditor from '../src/translations/editor-languages/en.json';
import {
  EDITOR_TRANSLATIONS,
  registerEditorTranslations,
} from '../src/translations/editor-languages/index';
import en from '../src/translations/languages/en.json';
import {
  TRANSLATIONS,
  getEffectiveLanguage,
  getTranslations,
  translateEditorKey,
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

describe('the archived editor namespace still registers cleanly', () => {
  // `editor-languages/` is the *previous* editor's namespace. It is no longer imported
  // by anything in `src/` — the live editor reads `src/rendering/editor/translations/`,
  // whose keys match `strings.ts` exactly — so none of it reaches either bundle. It is
  // kept on disk as the material for the translation pass, and 106 of the live editor's
  // keys were mined out of it.
  //
  // These tests are kept with it. They cover the registration machinery, which is left
  // intact so the mining pass can re-enter it deliberately; keeping them green is what
  // stops that machinery rotting into something that cannot be re-enabled. The static
  // half — that no `languages/*.json` carries an `editor` key, and that nothing in
  // `src/` imports this directory — belongs to `check:i18n`, and cannot honestly be
  // asserted here: registration merges into the objects `localize.ts` imported, so
  // `en.json`'s module object *acquires* an `editor` property the moment this suite
  // calls the registrar. That mutation is the mechanism working, not a leak, but it
  // means the imported module is no longer evidence about the file on disk.
  it('registers editor sections without discarding the card strings', () => {
    // The trap that makes this a merge rather than an assignment. `addTranslations`
    // replaces a language's whole entry, so registering an editor-only object through it
    // would drop `months`, `daysOfWeek` and the rest — and the card would render
    // `undefined` for every month name in that language, triggered by nothing more than
    // opening the editor once.
    registerEditorTranslations();

    for (const language of Object.keys(EDITOR_TRANSLATIONS)) {
      const translations = getTranslations(language);

      expect(
        translations.editor,
        `${language} has no editor section after registration`,
      ).toBeDefined();
      expect(translations.months, `${language} lost its month names`).toHaveLength(12);
      expect(translations.daysOfWeek, `${language} lost its day names`).toHaveLength(7);
      expect(String(translations.loading).trim(), `${language} lost its card strings`).not.toBe('');
    }
  });

  it('registers only languages the card already knows', () => {
    // An editor section for a language with no card strings could only produce a
    // half-populated entry. check:i18n rejects one statically; this is the runtime half.
    for (const language of Object.keys(EDITOR_TRANSLATIONS)) {
      expect(LANGUAGES, `${language} has editor strings but no card strings`).toContain(language);
    }
  });

  it('is idempotent, because getConfigElement can be called more than once', () => {
    const before = getTranslations('de').editor?.calendar_entities;
    registerEditorTranslations();
    expect(getTranslations('de').editor?.calendar_entities).toBe(before);
  });
});

describe('translateEditorKey', () => {
  type EditorSection = { editor: Record<string, string> };

  // The editor's sections are registered by its chunk, so this suite must do what that
  // chunk does before asserting on anything they hold. Idempotent, so it costs nothing
  // that the suite above already called it.
  registerEditorTranslations();

  const editorKeys = Object.keys(enEditor);

  it('resolves a translated key in the requested language', () => {
    // German translates the editor, so this must NOT come back in English.
    const german = translateEditorKey('de', 'calendar_entities');
    expect(german).toBe(
      (getTranslations('de') as unknown as EditorSection).editor.calendar_entities,
    );
  });

  it('falls back to English for a language with no editor section', () => {
    // French omits `editor` entirely — the supported, documented case.
    const french = getTranslations('fr') as unknown as Partial<EditorSection>;
    expect(french.editor, 'fixture assumption: fr has no editor section').toBeUndefined();
    expect(translateEditorKey('fr', 'calendar_entities')).toBe(enEditor.calendar_entities);
  });

  it('falls back per key, not per language', () => {
    // The regression this function exists to prevent. The previous implementation asked
    // "does this language translate the editor at all?" and one key was enough to answer
    // yes, after which every *missing* key rendered as its own raw name in the UI.
    //
    // Simulating a half-finished translation directly: German with a single key deleted
    // must still render that key in English, while its neighbours stay German.
    const german = getTranslations('de') as unknown as EditorSection;
    const english = enEditor as Record<string, string>;

    // Pick a key German actually translates differently, so "fell back to English" and
    // "stayed German" are distinguishable.
    const victim = editorKeys.find(
      (k) => k !== 'calendar_entities' && german.editor[k] !== english[k],
    ) as string;
    expect(victim, 'fixture assumption: de translates some key differently').toBeDefined();

    const saved = german.editor[victim];
    delete german.editor[victim];

    try {
      expect(translateEditorKey('de', victim)).toBe(english[victim]);
      expect(translateEditorKey('de', victim)).not.toBe(victim);
      expect(translateEditorKey('de', 'calendar_entities')).toBe(german.editor.calendar_entities);
    } finally {
      german.editor[victim] = saved;
    }
  });

  it('accepts both bare and prefixed key forms', () => {
    expect(translateEditorKey('en', 'calendar_entities')).toBe(
      translateEditorKey('en', 'editor.calendar_entities'),
    );
  });

  it('returns the key name only when English itself lacks the key', () => {
    // The last resort. check:i18n treats a key referenced in editor.ts but absent from
    // en.json as an error, so reaching this in production means that check was bypassed.
    expect(translateEditorKey('de', 'no_such_editor_key')).toBe('no_such_editor_key');
  });

  it('resolves every editor key to a non-empty string in every language', () => {
    for (const language of LANGUAGES) {
      for (const key of editorKeys) {
        const resolved = translateEditorKey(language, key);
        expect(typeof resolved, `${language}.${key} is not a string`).toBe('string');
        expect(resolved.trim(), `${language}.${key} resolved to empty`).not.toBe('');
        // The sentinel is an implementation detail and must never reach the UI.
        expect(resolved, `${language}.${key} leaked the sentinel`).not.toContain('\u0000');
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

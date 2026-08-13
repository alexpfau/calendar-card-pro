/**
 * The editor's strings resolve in the user's language.
 *
 * This suite exists because that was false in production and nothing said so. The
 * editor consulted its English table first and the translation files second; English
 * defines every key, so the second source was never reached and all eleven translated
 * languages rendered in English, in every panel, with nothing raised anywhere.
 *
 * Every assertion here is on a **real German string**, not on a fixture. A test that
 * mounted its own two-key table would have passed throughout the regression, because
 * the mechanism was sound in isolation — what was wrong was the order it ran the two
 * real sources in. So the oracle has to be the shipped data.
 */

import { describe, expect, it } from 'vitest';

import { computeHelper, computeLabel, lookup } from '../src/rendering/editor/localize';
import { PANELS } from '../src/rendering/editor/panels';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import deEditor from '../src/rendering/editor/translations/de.json';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations/index';
import { TRANSLATIONS } from '../src/translations/localize';

describe('editor strings resolve in the requested language', () => {
  it('returns German for a key German translates', () => {
    // The regression, stated as the thing a user would have seen. `days_to_show` is
    // labelled in every panel configuration, so this is not an obscure corner.
    expect(lookup('de', 'days_to_show')).toBe('Anzahl Tage anzeigen');
    expect(lookup('de', 'title')).toBe('Titel');
    expect(lookup('de', 'show_location')).toBe('Ort anzeigen');
  });

  it('returns German through the hooks ha-form actually calls', () => {
    // `lookup` is internal; `computeLabel` is what Home Assistant invokes. Asserting on
    // the private one alone would leave the public path untested, and it is the public
    // path that renders.
    expect(computeLabel('de', { name: 'days_to_show', selector: { number: {} } })).toBe(
      'Anzahl Tage anzeigen',
    );
    expect(computeHelper('de', 'list', { name: 'compact_mode', selector: { boolean: {} } })).toBe(
      deEditor['compact_mode.helper'],
    );
  });

  it('translates the first-screen German editor chrome', () => {
    const chromeKeys = [
      'search',
      'customized_only',
      'customized_only.helper',
      ...PANELS.flatMap((panel) => [panel.titleKey, `${panel.titleKey}.helper`]),
      'calendars',
      'calendars.helper',
      'entity.customised',
      'entity.unconfigured',
      'entity.copy',
      'entity.paste',
    ];

    for (const key of chromeKeys) {
      expect(deEditor, `German should translate ${key}`).toHaveProperty(key);
      expect(lookup('de', key), key).toBe(deEditor[key as keyof typeof deEditor]);
    }
  });

  it('falls back to English per key, not per language', () => {
    // The maintainer's ruling: show the language, and fall back to English only for the
    // strings it is missing. `column.min_day_width` is post-rebuild and has no German,
    // so it must render English *while* its neighbours render German — the two
    // behaviours have to hold at the same time or the fallback is per language.
    expect(deEditor).not.toHaveProperty('column.min_day_width');
    expect(lookup('de', 'column.min_day_width')).toBe(EDITOR_STRINGS['column.min_day_width']);
    expect(lookup('de', 'days_to_show')).toBe('Anzahl Tage anzeigen');
  });

  it('falls back to English for a language with no file at all', () => {
    // French is a registered card language with no editor translations. It must render
    // English rather than raw key names — the failure the per-key chain replaced.
    expect(EDITOR_LANGUAGE_STRINGS.fr).toBeUndefined();
    expect(TRANSLATIONS.fr).toBeDefined();
    expect(lookup('fr', 'days_to_show')).toBe('Days To Show');
  });

  it('matches the language case-insensitively', () => {
    // Home Assistant hands back locales like `de-DE`, and `getEffectiveLanguage`
    // lowercases before matching. A capital reaching this map is how a language
    // silently renders English.
    expect(lookup('DE', 'days_to_show')).toBe('Anzahl Tage anzeigen');
    expect(lookup('en-GB', 'title_color')).toBe('Title Colour');
  });

  it('keeps Title Case when en-GB overrides a spelling', () => {
    // en-GB is derived from strings.ts by substitution, so it changes the *spelling* and
    // nothing else. The hand-written file it replaced dropped Title Case on 17 of its 18
    // real entries — `Event Color` was overridden as `Event colour` — so switching an
    // editor to British English silently re-cased seventeen labels. Asserted here as well
    // as in check-i18n.mjs because this is the behaviour a user sees.
    for (const key of ['entity.color', 'title_color', 'weekday_color'] as const) {
      const british = lookup('en-GB', key);
      expect(british).toContain('Colour');
      expect(british).toBe(EDITOR_STRINGS[key].replace('Color', 'Colour'));
    }
  });

  it('keeps partial languages readable when a panel helper is untranslated', () => {
    expect(lookup('sv', 'panel.weather')).toBe('Väder');
    expect(EDITOR_LANGUAGE_STRINGS.sv).not.toHaveProperty('panel.weather.helper');
    expect(lookup('sv', 'panel.weather.helper')).toBe(EDITOR_STRINGS['panel.weather.helper']);
  });

  it('states compact-mode scope only when the active view needs it', () => {
    const compactGroup = {
      type: 'expandable' as const,
      name: 'compact_mode',
      titleKey: 'compact_mode',
      schema: [],
    };

    expect(computeHelper('en', 'list', compactGroup)).toBe(EDITOR_STRINGS['compact_mode.helper']);
    expect(computeHelper('en', 'column', compactGroup)).toBe(
      `${EDITOR_STRINGS['compact_mode.helper']} ${EDITOR_STRINGS['scope.list_only.compact_mode']}`,
    );
    expect(computeHelper('en', 'column', compactGroup)).not.toContain('⚠️');
  });

  it('returns undefined for a key nothing defines', () => {
    // `computeLabel` humanises on undefined, so this is what keeps a missing string a
    // cosmetic shortfall rather than a rendered `undefined`.
    expect(lookup('de', 'no_such_key_anywhere')).toBeUndefined();
  });
});

describe('the mined translations carry meaning, not just key names', () => {
  it('does not inherit the old namespace’s meaning for a renamed key', () => {
    // `entity` is the clearest false friend between the two namespaces: it labelled the
    // calendar entity picker in the editor that was replaced, and labels the *weather*
    // entity here. Mining by key name would have written "Entität"; mining by English
    // text wrote the right one. This is the assertion that would fail if anyone
    // re-mined on names.
    expect(EDITOR_STRINGS.entity).toBe('Weather Entity');
    expect(lookup('de', 'entity')).toBe('Wetter-Entität');
  });

  it('does not swap the two language options', () => {
    // The pair that proves name-matching is unsafe rather than merely imprecise. Across
    // the namespaces these two keys exchanged meanings: old `language` is new
    // `language_mode`, and old `language_code` is new `language`. Mined by name, both
    // labels would be wrong, and wrong in a way that reads as plausible.
    expect(lookup('de', 'language_mode')).toBe('Sprache');
    expect(lookup('de', 'language')).toBe('Sprachcode');
  });

  it('translates no key the editor cannot look up', () => {
    // The static half of this is a `check:i18n` error; this is the runtime half, and it
    // is cheap enough to be worth stating twice. A translated key outside the English
    // table is weight that labels nothing.
    for (const [language, strings] of Object.entries(EDITOR_LANGUAGE_STRINGS)) {
      for (const key of Object.keys(strings)) {
        expect(
          EDITOR_STRINGS,
          `${language} translates '${key}', which strings.ts lacks`,
        ).toHaveProperty([key]);
      }
    }
  });

  it('ships no language the card does not know', () => {
    for (const language of Object.keys(EDITOR_LANGUAGE_STRINGS)) {
      expect(TRANSLATIONS, `${language} has editor strings but no card strings`).toHaveProperty([
        language,
      ]);
    }
  });

  it('holds no English table of its own', () => {
    // English lives in `strings.ts` alone. The namespace this replaced kept an `en.json`
    // beside it and the two drifted apart on 41 of the 94 keys they shared.
    expect(EDITOR_LANGUAGE_STRINGS.en).toBeUndefined();
  });
});

/**
 * The schema-driven editor's translations.
 *
 * One file per language, keyed **exactly** as `../strings.ts` is keyed, holding the
 * subset of that table the language translates. Partial is the normal case and is
 * explicitly supported: `lookup` resolves each key on its own, so an untranslated key
 * falls back to the English in `strings.ts` rather than dragging the whole editor back
 * to English. A language is never gated on completeness.
 *
 * **There is deliberately no `en.json` here.** English lives in `../strings.ts` and
 * nowhere else, so the two can never disagree and there is no question about which one
 * wins. That is not a stylistic preference — it is the failure this directory exists to
 * prevent. The namespace this replaced kept an `en.json` beside the English table, and
 * they drifted: of the 94 keys the two spelled the same, only 53 still carried the same
 * English text. Two of them, `language` and `language_mode`, had swapped meanings
 * outright.
 *
 * `check:i18n` holds the line from both ends: every key in a file below must exist in
 * `EDITOR_STRINGS`, and no language file on the eager path may carry an `editor` section.
 *
 * Adding a language needs no `TRANSLATIONS` entry of its own — the language must
 * already be registered by `src/translations/localize.ts`, and `npm run check:i18n`
 * fails on a file that is not, or that exists but is never imported below.
 */

// Imports (sorted alphabetically by language code, mirroring localize.ts)
import deEditor from './de.json';
import enGBEditor from './en-GB.json';
import etEditor from './et.json';
import itEditor from './it.json';
import ltEditor from './lt.json';
import lvEditor from './lv.json';
import nbEditor from './nb.json';
import plEditor from './pl.json';
import skEditor from './sk.json';
import svEditor from './sv.json';

/**
 * Editor strings by language code.
 *
 * Lowercase keys, for the same reason `TRANSLATIONS` uses them: every lookup lowercases
 * before matching, so a key with a capital in it can never be found and the language
 * silently renders English — which is the failure mode this whole directory exists to
 * end, so it would be a poor way to reintroduce it.
 */
export const EDITOR_LANGUAGE_STRINGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  de: deEditor,
  'en-gb': enGBEditor,
  et: etEditor,
  it: itEditor,
  lt: ltEditor,
  lv: lvEditor,
  nb: nbEditor,
  pl: plEditor,
  sk: skEditor,
  sv: svEditor,
};

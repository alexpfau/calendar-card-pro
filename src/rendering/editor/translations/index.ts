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

// Imports in the order the bundle carries the vectors, which is not alphabetical: module
// order is emission order, and gzip compresses the editor better with British English first
// and the rest side by side by language family. Keep the map below in the same order, or
// terser stops inlining the vectors into it and the gain goes. The lint rule would re-sort
// them alphabetically, so it is off for this block.
/* eslint-disable import-x/order */
import enGBEditor from './en-GB.json';
import koEditor from './ko.json';
import jaEditor from './ja.json';
import skEditor from './sk.json';
import plEditor from './pl.json';
import ltEditor from './lt.json';
import lvEditor from './lv.json';
import etEditor from './et.json';
import deEditor from './de.json';
import svEditor from './sv.json';
import nbEditor from './nb.json';
import itEditor from './it.json';
/* eslint-enable import-x/order */

/**
 * Editor strings by language code.
 *
 * Lowercase keys, for the same reason `TRANSLATIONS` uses them: every lookup lowercases
 * before matching, so a key with a capital in it can never be found and the language
 * silently renders English — which is the failure mode this whole directory exists to
 * end, so it would be a poor way to reintroduce it.
 */
export const EDITOR_LANGUAGE_STRINGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'en-gb': enGBEditor,
  ko: koEditor,
  ja: jaEditor,
  sk: skEditor,
  pl: plEditor,
  lt: ltEditor,
  lv: lvEditor,
  et: etEditor,
  de: deEditor,
  sv: svEditor,
  nb: nbEditor,
  it: itEditor,
};

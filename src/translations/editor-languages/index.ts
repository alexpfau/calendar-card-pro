/* eslint-disable import/order */
/**
 * The editor's translations, off the eager path.
 *
 * These sections used to sit inside `../languages/<code>.json`, which `../localize.ts`
 * imports statically for all 35 languages. They are **88.4% of the translation
 * payload** — 131,302 B of minified JSON across eleven languages — and `translate()`
 * looks keys up dynamically, so Rollup cannot tree-shake them. Every user downloaded
 * and parsed all of it on every dashboard load to label an editor that ~99% of them
 * never open.
 *
 * Nothing here is reachable from the card. The only import of this module is in
 * `src/rendering/editor/index.ts`, which is the entry of a separate build — so these
 * files land in `editor.js`, which the card fetches by URL when someone opens the
 * editor. HACS still downloads that file to disk (it fetches every release asset), but
 * a browser only fetches and parses it when someone opens the editor.
 *
 * **These sections are dormant and are deliberately kept.** They belong to the editor
 * that was replaced; the schema-driven one resolves its own strings from
 * `src/rendering/editor/strings.ts` first and reaches these second. They are the
 * material to be mined during the translation pass (backlog E10), which is why the
 * move is a move and not a deletion.
 *
 * Adding a language here needs no `TRANSLATIONS` entry of its own — the language must
 * already be registered by `../localize.ts`, and `npm run check:i18n` fails on a file
 * that is not, or that exists but is never imported below.
 */

import * as Localize from '../localize';

// Import editor sections (sorted alphabetically by language code, mirroring localize.ts)
import deEditor from './de.json';
import enEditor from './en.json';
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
 * Editor sections keyed by language code.
 *
 * Lowercase keys, for the same reason `TRANSLATIONS` uses them: every lookup
 * lowercases before matching, so a key with a capital in it can never be found and the
 * language silently renders English.
 */
export const EDITOR_TRANSLATIONS: Record<string, Record<string, string | string[]>> = {
  de: deEditor,
  en: enEditor,
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

/** Whether `registerEditorTranslations` has already run. */
let registered = false;

/**
 * Merge every editor section into the language registry.
 *
 * Called at module scope from `src/rendering/editor/index.ts`, so it has run by the
 * time `getConfigElement()` resolves — the `await import()` completes only after that
 * file's modules have evaluated, and the editor element is created after that.
 *
 * Idempotent, because `getConfigElement()` can be called more than once and because
 * merging the same sections twice should cost nothing.
 */
export function registerEditorTranslations(): void {
  if (registered) {
    return;
  }
  registered = true;

  for (const [language, editor] of Object.entries(EDITOR_TRANSLATIONS)) {
    Localize.addEditorTranslations(language, editor);
  }
}

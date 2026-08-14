/* eslint-disable import/order */
/**
 * The previous editor's namespace. **An archive — nothing ships from here.**
 *
 * These sections labelled the hand-rolled editor that the schema-driven one replaced.
 * They are kept, rather than deleted, because they remain the only body of human
 * translation for this card's editor vocabulary. The mining pass that drew on them is
 * finished — backlog E10 is closed, 106 of the live editor's keys came out of here — and
 * what is left for the live namespace is real translation work rather than more mining.
 * These files stay as reference for that work: they hold English-to-target pairs in nine
 * languages, which is worth consulting for terminology even though nothing can be lifted
 * from them mechanically any more.
 *
 * **Consult them by English text, never by key name.** That is E10's rule and the reason
 * it exists is below: the key spellings overlap the live table while the meanings do not.
 *
 * **They are no longer reachable at runtime, and that is deliberate.** The live editor
 * reads `src/rendering/editor/translations/`, whose files are keyed exactly as
 * `strings.ts` is. This namespace is keyed differently and, worse, *overlappingly*:
 * measured against the live table, 94 keys are spelled the same and only 53 still carry
 * the same English, with `language` and `language_mode` having swapped meanings
 * outright. Consulting both by key name is therefore not a fallback, it is a coin toss,
 * which is why the live editor consults exactly one of them.
 *
 * Until this was found, `src/rendering/editor/index.ts` imported the registration below
 * and called it at module scope. It cost 145 KB of `editor.js` — roughly 60% of that
 * chunk — and resolved nothing, because the English table was consulted first and
 * defines every key. `check:i18n` now fails if the editor's build graph imports this
 * module again.
 *
 * The registration machinery is left intact and tested rather than deleted, so the
 * mining pass can re-enter it deliberately if that turns out to be useful. Nothing in
 * `src/` calls it, so Rollup includes none of it in either bundle.
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

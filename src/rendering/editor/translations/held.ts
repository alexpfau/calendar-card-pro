/**
 * The translated editor strings the editor holds right now, by lowercase language code.
 *
 * British English is built in: it is a generated delta of a few dozen spellings, under a
 * kilobyte compressed, so a file and a request of its own would cost more than they save. Every
 * other language arrives from its own file when the editor is drawn in it (`./loader.ts`), and
 * is added here. `lookup` reads only this table, so a language whose file never arrives simply
 * falls back to English key by key, as an untranslated key always has.
 *
 * The full registry of every language stays in `./index.ts`, for the tests and the gates; the
 * editor bundle does not import it.
 */

import enGBEditor from './en-GB.json';

export const EDITOR_HELD_STRINGS: Record<string, Readonly<Record<string, string>>> = {
  'en-gb': enGBEditor,
};

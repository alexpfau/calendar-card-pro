/**
 * The editor languages shipped as files of their own, and how the editor finds one.
 *
 * Each language below is built into `editor-<code>.js` beside `editor.js` (`editor-dev-<code>.js`
 * in a dev build), and the editor imports only the one it is drawn in. US English lives in
 * `../strings.ts` and British English is a small delta built into the editor itself
 * (`./held.ts`), so neither has a file. A card language with no editor translation never asks
 * for one either, which is why this is a list rather than a guess: a request for a file that
 * does not exist costs every such user a 404 on every editor open.
 *
 * Imports nothing, so the build plugin that writes the files and the editor that reads them
 * cannot disagree about anything but this list, which `check:i18n` reconciles against the JSON
 * files on disk and `check:bundle` against what the build emitted.
 */

/** Lowercase codes of the languages the editor loads on demand. */
export const EDITOR_LANGUAGE_FILES: ReadonlyArray<string> = [
  'de',
  'et',
  'it',
  'ja',
  'ko',
  'lt',
  'lv',
  'nb',
  'pl',
  'sk',
  'sv',
];

/**
 * The URL of a language's file, beside the editor and busted with it.
 *
 * The editor's own URL carries the card's query (`editor-url.ts`), so copying it here makes a
 * language file reload exactly when the card and the editor do. `/hacsfiles/**` is cached for a
 * month, and HACS appends `?hacstag=` to the registered resource only. Computed at runtime and
 * imported dynamically, so no emitted file names another statically: the `?hacstag=`
 * duplicate-module trap has nothing to act on. The build rewrites `./editor-dev-` to the
 * production prefix, as it rewrites the card's `./editor-dev.js`.
 *
 * @param code - Lowercase language code
 * @param editorUrl - The editor module's own URL (`import.meta.url`)
 * @returns The language file's URL
 */
export function languageFileUrl(code: string, editorUrl: string): string {
  const url = new URL(`./editor-dev-${code}.js`, editorUrl);

  url.search = new URL(editorUrl).search;

  return url.href;
}

/**
 * A short hash of the editor's string keys, in the order a language file's values follow.
 *
 * A language file is a bare list of values, one per English key, so a file built against
 * another key list would put every string on the wrong setting. The build stamps this hash into
 * each file and the editor refuses a file whose hash is not its own. `scripts/compact-payloads.mjs`
 * computes the same FNV-1a hash; `tests/editor-language-files.test.ts` holds the two together.
 *
 * @param keys - String keys, in order
 * @returns Eight hex digits
 */
export function keyFingerprint(keys: ReadonlyArray<string>): string {
  const text = keys.join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

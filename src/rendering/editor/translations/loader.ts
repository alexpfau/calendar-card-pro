/**
 * Loads an editor language from its own file, once per page.
 *
 * The editor asks `editorLanguageReady` whether it can draw in a language. US English, British
 * English, a language already loaded and a card language with no editor translation all answer
 * yes at once. A language with a file answers no until `loadEditorLanguage` has settled it, which
 * happens once and for good: either its strings are in `EDITOR_HELD_STRINGS`, or the file could
 * not be used and the editor draws that language in English, key by key, through `lookup`.
 *
 * A file is used only when it was built with this editor: the same version and the same string
 * keys in the same order (`keyFingerprint`). A file left behind by an earlier version, a 404, a
 * network failure or a file that never answers all end the same way, in an editor that works in
 * English and one console line saying why.
 */

import { EDITOR_LANGUAGE_FILES, keyFingerprint, languageFileUrl } from './files';
import { EDITOR_HELD_STRINGS } from './held';
import * as Logger from '../../../utils/logger';
import { EDITOR_STRINGS } from '../strings';
import { EDITOR_VERSION } from '../version';

/** How long a language file may take before the editor carries on in English. */
export const LANGUAGE_FILE_TIMEOUT = 10_000;

/** What a language file holds: its version, its key fingerprint and one value per key. */
interface LanguageFile {
  readonly v: string;
  readonly k: string;
  readonly s: ReadonlyArray<string | null>;
}

type Importer = (url: string) => Promise<unknown>;

/** A stand-in for `import()`, set only by tests (`setLanguageImporter`). */
let importer: Importer | undefined;

/** Languages whose file has been dealt with, loaded or not. */
const settled = new Set<string>();

/** Loads under way, by language. */
const pending = new Map<string, Promise<void>>();

/** Languages whose file could not be used, which the editor shows in English. */
const failed = new Set<string>();

/**
 * Whether a language's file could not be used, so the editor shows English in its place.
 *
 * @param language - Effective language code
 * @returns True once its file has failed
 */
export function editorLanguageFailed(language: string): boolean {
  return failed.has(language.toLowerCase());
}

/**
 * Whether the editor can draw in a language now.
 *
 * @param language - Effective language code
 * @returns False only while the language's file is still to be settled
 */
export function editorLanguageReady(language: string): boolean {
  const code = language.toLowerCase();
  return (
    !EDITOR_LANGUAGE_FILES.includes(code) ||
    Object.prototype.hasOwnProperty.call(EDITOR_HELD_STRINGS, code) ||
    settled.has(code)
  );
}

/**
 * Loads a language's file, unless it is ready already.
 *
 * Never rejects: a file that cannot be used is reported once and the language settles anyway.
 *
 * @param language - Effective language code
 * @param editorUrl - The editor module's own URL
 * @returns Settles once the language is ready
 */
export function loadEditorLanguage(
  language: string,
  editorUrl: string = import.meta.url,
): Promise<void> {
  const code = language.toLowerCase();
  if (editorLanguageReady(code)) return Promise.resolve();

  let load = pending.get(code);
  if (load === undefined) {
    load = fetchLanguage(code, editorUrl).finally(() => {
      settled.add(code);
      pending.delete(code);
    });
    pending.set(code, load);
  }
  return load;
}

/**
 * Imports a language's file and holds its strings, or reports why it could not.
 *
 * Imported by a URL computed here and nowhere else, which is the one dynamic import outside the
 * card that the build's Day.js source guard admits (`validateDayjsUsage`).
 *
 * @param code - Lowercase language code
 * @param editorUrl - The editor module's own URL
 * @returns Settles when done, never rejecting
 */
async function fetchLanguage(code: string, editorUrl: string): Promise<void> {
  const url = languageFileUrl(code, editorUrl);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer within ${LANGUAGE_FILE_TIMEOUT / 1000} s`)),
        LANGUAGE_FILE_TIMEOUT,
      );
    });
    const loaded = await Promise.race([
      importer ? importer(url) : import(/* @vite-ignore */ languageFileUrl(code, editorUrl)),
      timeout,
    ]);
    EDITOR_HELD_STRINGS[code] = decodeLanguageFile(loaded, Object.keys(EDITOR_STRINGS));
  } catch (error) {
    failed.add(code);
    const detail = error instanceof Error ? error.message : String(error);
    Logger.error(
      `The editor's '${code}' strings could not be used (${detail}), so it ` +
        `shows English. Reinstalling the card in HACS restores ${url.split('?')[0]}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads a language file's module, refusing one built for another editor.
 *
 * @param loaded - The imported module
 * @param keys - The editor's string keys, in their order
 * @param version - The editor's version
 * @returns The language's strings, keyed
 */
export function decodeLanguageFile(
  loaded: unknown,
  keys: ReadonlyArray<string>,
  version: string = EDITOR_VERSION,
): Record<string, string> {
  const file = (loaded as { default?: Partial<LanguageFile> } | null)?.default;
  if (file === null || typeof file !== 'object') {
    throw new Error('the file holds no strings');
  }
  if (file.v !== version) {
    throw new Error(`the file is from version ${String(file.v)}, the editor from ${version}`);
  }
  if (file.k !== keyFingerprint(keys)) {
    throw new Error('the file was built for a different set of editor strings');
  }
  if (!Array.isArray(file.s) || file.s.length !== keys.length) {
    throw new Error('the file holds the wrong number of strings');
  }

  const strings: Record<string, string> = {};
  file.s.forEach((value, i) => {
    if (typeof value === 'string') strings[keys[i]] = value;
    else if (value !== null) throw new Error('the file holds a value that is not a string');
  });
  return strings;
}

/**
 * Swaps how language files are imported. For tests: a test environment cannot import a URL.
 *
 * @param next - The importer to use, or `undefined` for `import()` itself
 * @returns The importer it replaced
 */
export function setLanguageImporter(next: Importer | undefined): Importer | undefined {
  const previous = importer;
  importer = next;
  return previous;
}

/**
 * Forgets a language, as though its file had never been asked for. For tests.
 *
 * @param language - Language code
 */
export function forgetEditorLanguage(language: string): void {
  const code = language.toLowerCase();
  settled.delete(code);
  pending.delete(code);
  failed.delete(code);
  delete EDITOR_HELD_STRINGS[code];
}

/**
 * The editor's languages, shipped as files of their own (backlog item 323).
 *
 * The built editor holds US and British English and loads any other language from
 * `editor-<code>.js` beside it, the first time it is drawn in that language. These tests take
 * away the setup that holds every language from the start (`tests/setup/editor-languages.ts`)
 * and load German the way the editor does: by a URL beside the editor carrying its query, from a
 * file stamped with the editor's version and key fingerprint, read by position. Every way a file
 * can fail leaves an editor that works, in English.
 */

import { type OutputAsset, type OutputChunk, type Plugin, rollup } from 'rollup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBuildPlugins } from '../rollup.config.mjs';
import {
  BUILT_IN_EDITOR_LANGUAGES,
  editorKeyFingerprint,
  emitEditorLanguages,
} from '../scripts/compact-payloads.mjs';
import { fakeHass, formsOf, labelOf, mountEditor, openPageOf } from './helpers/editor-host';
import { lookup } from '../src/rendering/editor/localize';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import {
  EDITOR_LANGUAGE_FILES,
  keyFingerprint,
  languageFileUrl,
} from '../src/rendering/editor/translations/files';
import { EDITOR_HELD_STRINGS } from '../src/rendering/editor/translations/held';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations/index';
import {
  LANGUAGE_FILE_TIMEOUT,
  decodeLanguageFile,
  editorLanguageReady,
  forgetEditorLanguage,
  loadEditorLanguage,
  setLanguageImporter,
} from '../src/rendering/editor/translations/loader';
import { EDITOR_VERSION } from '../src/rendering/editor/version';

const EDITOR_URL = 'http://ha.local:8123/hacsfiles/calendar-card-pro/editor.js?hacstag=60001';
const KEYS = Object.keys(EDITOR_STRINGS);
const GERMAN = EDITOR_LANGUAGE_STRINGS.de;
/** A key German translates differently from English, to tell the two apart by. */
const KEY = 'show_time';

/** A language file's module, as the build writes it for this editor. */
function fileFor(
  strings: Readonly<Record<string, string>>,
  overrides: Partial<{ v: unknown; k: unknown; s: unknown }> = {},
): { default: unknown } {
  return {
    default: {
      v: EDITOR_VERSION,
      k: keyFingerprint(KEYS),
      s: KEYS.map((key) => strings[key] ?? null),
      ...overrides,
    },
  };
}

let restoreImporter: ReturnType<typeof setLanguageImporter>;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  forgetEditorLanguage('de');
  restoreImporter = setLanguageImporter(undefined);
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  setLanguageImporter(restoreImporter);
  forgetEditorLanguage('de');
  // German held again, as the setup file holds it for every other test.
  EDITOR_HELD_STRINGS.de = GERMAN;
  errors.mockRestore();
  vi.useRealTimers();
});

describe('a language file URL', () => {
  it('sits beside the editor and carries its query, so it busts when the card does', () => {
    expect(languageFileUrl('de', EDITOR_URL)).toBe(
      'http://ha.local:8123/hacsfiles/calendar-card-pro/editor-dev-de.js?hacstag=60001',
    );
    expect(languageFileUrl('sv', 'http://x/local/ccp/editor-dev.js?v=7')).toBe(
      'http://x/local/ccp/editor-dev-sv.js?v=7',
    );
  });

  it('is fingerprinted the same way by the editor and by the build', () => {
    for (const keys of [KEYS, [], ['a'], ['a.b', 'a.c', 'ü'], KEYS.slice().reverse()]) {
      expect(keyFingerprint(keys)).toBe(editorKeyFingerprint(keys));
    }
    expect(keyFingerprint(KEYS)).not.toBe(keyFingerprint(KEYS.slice().reverse()));
  });

  it('is listed for exactly the translations on disk that are not built in', () => {
    const shipped = Object.keys(EDITOR_LANGUAGE_STRINGS).filter(
      (code) => !BUILT_IN_EDITOR_LANGUAGES.map((c) => c.toLowerCase()).includes(code),
    );
    expect([...EDITOR_LANGUAGE_FILES].sort()).toEqual(shipped.sort());
  });
});

describe('loading a language', () => {
  it('asks for nothing in English, British English or a language with no editor file', async () => {
    const importer = vi.fn(async () => fileFor({}));
    setLanguageImporter(importer);
    for (const language of ['en', 'en-GB', 'en-gb', 'fr', 'es', 'zh-cn']) {
      expect(editorLanguageReady(language), language).toBe(true);
      await loadEditorLanguage(language, EDITOR_URL);
    }
    expect(importer).not.toHaveBeenCalled();
  });

  it("holds the language's strings once its file loads, asking for it once", async () => {
    vi.useFakeTimers();
    const importer = vi.fn(async () => fileFor(GERMAN));
    setLanguageImporter(importer);

    expect(editorLanguageReady('de')).toBe(false);
    expect(lookup('de', KEY)).toBe(EDITOR_STRINGS[KEY]);
    await Promise.all([loadEditorLanguage('DE', EDITOR_URL), loadEditorLanguage('de', EDITOR_URL)]);
    await loadEditorLanguage('de', EDITOR_URL);

    expect(editorLanguageReady('de')).toBe(true);
    expect(lookup('de', KEY)).toBe(GERMAN[KEY]);
    expect(GERMAN[KEY]).not.toBe(EDITOR_STRINGS[KEY]);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith(languageFileUrl('de', EDITOR_URL));
    expect(errors).not.toHaveBeenCalled();
    // The wait for a file that never answers ends with the file that did.
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['a missing file', () => Promise.reject(new TypeError('Failed to fetch module'))],
    ['a file from another version', async () => fileFor(GERMAN, { v: '0.0.1' })],
    ['a file for other strings', async () => fileFor(GERMAN, { k: '00000000' })],
    ['a file one string short', async () => fileFor(GERMAN, { s: KEYS.slice(1).map(() => 'x') })],
    ['a file holding a number', async () => fileFor(GERMAN, { s: KEYS.map(() => 1) })],
    ['a file with no default export', async () => ({})],
  ])('settles %s in English, reporting it once', async (_name, importer) => {
    setLanguageImporter(importer);
    await loadEditorLanguage('de', EDITOR_URL);

    expect(editorLanguageReady('de')).toBe(true);
    expect(lookup('de', KEY)).toBe(EDITOR_STRINGS[KEY]);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain(
      'http://ha.local:8123/hacsfiles/calendar-card-pro/editor-dev-de.js',
    );

    await loadEditorLanguage('de', EDITOR_URL);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('settles a file that never answers in English, once the wait is up', async () => {
    vi.useFakeTimers();
    setLanguageImporter(() => new Promise(() => undefined));
    let done = false;
    void loadEditorLanguage('de', EDITOR_URL).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(LANGUAGE_FILE_TIMEOUT - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(lookup('de', KEY)).toBe(EDITOR_STRINGS[KEY]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads a file by position, keeping a key it leaves untranslated in English', () => {
    const partial = { [KEY]: 'Uhrzeit' };
    expect(decodeLanguageFile(fileFor(partial), KEYS)).toEqual(partial);
  });
});

/**
 * A promise the test settles.
 *
 * @returns It, and its resolve
 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
}

describe('the editor drawn in a language that loads', () => {
  const CONFIG = { type: 'custom:calendar-card-pro-dev', entities: ['calendar.anna'] };

  it('draws only a loading line until German arrives, then draws in German', async () => {
    const file = deferred<unknown>();
    setLanguageImporter(() => file.promise);
    const editor = await mountEditor(CONFIG, { hass: fakeHass({ language: 'de' }) });

    // Not blank, which on a slow connection reads as broken: one line, read out as a status.
    const status = [...editor.shadowRoot!.children];
    expect(status.map((each) => [each.getAttribute('role'), each.textContent])).toEqual([
      ['status', 'Loading…'],
    ]);
    expect(formsOf(editor)).toHaveLength(0);

    file.resolve(fileFor(GERMAN));
    await vi.waitFor(() => expect(formsOf(editor).length).toBeGreaterThan(0));
    await openPageOf(editor, 'events:show_time');
    expect(labelOf(editor, 'events:show_time')).toBe(GERMAN[KEY]);
    editor.remove();
  });

  it('says in English that German could not load, and that a reload fetches it again', async () => {
    setLanguageImporter(() => Promise.reject(new Error('offline')));
    const editor = await mountEditor(CONFIG, { hass: fakeHass({ language: 'de' }) });
    await vi.waitFor(() => expect(formsOf(editor).length).toBeGreaterThan(0));
    await editor.updateComplete;
    expect(editor.shadowRoot!.querySelector('.language-failed')?.textContent?.trim()).toBe(
      'The editor could not load Deutsch (de), so it shows English. Reload the page once the ' +
        'connection is back.',
    );
    editor.remove();
  });

  it('draws exactly what an editor that held German from the start draws', async () => {
    EDITOR_HELD_STRINGS.de = GERMAN;
    const held = await mountEditor(CONFIG, { hass: fakeHass({ language: 'de' }) });
    const expected = held.shadowRoot!.innerHTML;
    held.remove();
    expect(expected).toContain(GERMAN['panel.calendars'] ?? GERMAN[KEY]);

    forgetEditorLanguage('de');
    const file = deferred<unknown>();
    setLanguageImporter(() => file.promise);
    const editor = await mountEditor(CONFIG, { hass: fakeHass({ language: 'de' }) });
    file.resolve(fileFor(GERMAN));
    await vi.waitFor(() => expect(formsOf(editor).length).toBeGreaterThan(0));
    await editor.updateComplete;

    expect(editor.shadowRoot!.innerHTML).toBe(expected);
    editor.remove();
  });

  it('starts a fresh card on Start From an Example once German arrives', async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const file = deferred<unknown>();
    setLanguageImporter(() => file.promise);
    const editor = await mountEditor(
      { type: 'custom:calendar-card-pro' },
      { hass: fakeHass({ language: 'de' }) },
    );
    file.resolve(fileFor(GERMAN));

    await vi.waitFor(() =>
      expect((editor.shadowRoot!.activeElement as HTMLElement | null)?.dataset.focus).toBe(
        'quick-setup',
      ),
    );
    editor.remove();
  });

  it('works in English when the German file is missing', async () => {
    setLanguageImporter(() => Promise.reject(new TypeError('404')));
    const editor = await mountEditor(CONFIG, { hass: fakeHass({ language: 'de' }) });

    await vi.waitFor(() => expect(formsOf(editor).length).toBeGreaterThan(0));
    await openPageOf(editor, 'events:show_time');
    expect(labelOf(editor, 'events:show_time')).toBe(EDITOR_STRINGS[KEY]);
    expect(errors).toHaveBeenCalledTimes(1);
    editor.remove();
  });

  it('keeps drawing in English while a language chosen later loads', async () => {
    const file = deferred<unknown>();
    setLanguageImporter(() => file.promise);
    const editor = await mountEditor(CONFIG);
    await openPageOf(editor, 'events:show_time');
    expect(labelOf(editor, 'events:show_time')).toBe(EDITOR_STRINGS[KEY]);

    editor.setConfig({ ...CONFIG, language: 'de' });
    await editor.updateComplete;
    expect(labelOf(editor, 'events:show_time')).toBe(EDITOR_STRINGS[KEY]);

    file.resolve(fileFor(GERMAN));
    await vi.waitFor(() => expect(labelOf(editor, 'events:show_time')).toBe(GERMAN[KEY]));
    editor.remove();
  });
});

describe('the language files the build emits', () => {
  it('decode through the editor’s own key order to exactly each translation', async () => {
    const ENTRY_ID = '\0editor-language-files-entry';
    const entry: Plugin = {
      name: 'entry',
      resolveId: (id) => (id === ENTRY_ID ? ENTRY_ID : null),
      load: (id) =>
        id === ENTRY_ID
          ? `export { EDITOR_STRINGS } from ${JSON.stringify(`${process.cwd()}/src/rendering/editor/strings.ts`)};`
          : null,
    };
    const bundle = await rollup({
      input: ENTRY_ID,
      plugins: [
        entry,
        ...(createBuildPlugins() as Plugin[]),
        emitEditorLanguages({ version: 'test-version', prefix: 'editor-test-' }) as Plugin,
      ],
    });
    try {
      const { output } = await bundle.generate({ format: 'es' });
      const chunk = output.find((file): file is OutputChunk => file.type === 'chunk')!;
      const emitted = (await import(
        /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`
      )) as { EDITOR_STRINGS: Record<string, string> };
      // The order the built editor reads a file in: its own decoded keys, not the source's.
      const keys = Object.keys(emitted.EDITOR_STRINGS);
      expect(keys).toEqual([...KEYS].sort());

      const assets = output.filter((file): file is OutputAsset => file.type === 'asset');
      expect(assets.map((asset) => asset.fileName).sort()).toEqual(
        EDITOR_LANGUAGE_FILES.map((code) => `editor-test-${code}.js`).sort(),
      );

      let compared = 0;
      for (const asset of assets) {
        const code = asset.fileName.slice('editor-test-'.length, -'.js'.length);
        const source = String(asset.source);
        const module = await import(
          /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
        );
        expect(decodeLanguageFile(module, keys, 'test-version'), code).toEqual(
          EDITOR_LANGUAGE_STRINGS[code],
        );
        expect(() => decodeLanguageFile(module, keys, 'other-version')).toThrow('version');
        expect(() => decodeLanguageFile(module, KEYS, 'test-version')).toThrow('different set');
        compared++;
      }
      expect(compared).toBe(EDITOR_LANGUAGE_FILES.length);
    } finally {
      await bundle.close();
    }
    // A real Rollup build: about a second alone on a laptop, 4.6 s and a 5 s timeout on CI runners
    // under the full suite. The budget `compact-payloads.test.ts` gives its own builds.
  }, 30_000);
});

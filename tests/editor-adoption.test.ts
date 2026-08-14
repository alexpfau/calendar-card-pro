/**
 * What the card does when the editor file is present but is not the editor.
 *
 * The two-file split introduces exactly one new failure mode: the card asks for a
 * sibling file by URL and does not get its editor back. `getConfigElement` already
 * handles the obvious half — the file did not arrive, the fetch rejects, and the user
 * gets a written explanation instead of the platform's bare "failed to fetch".
 *
 * The other half is a file that *does* arrive and is the wrong one. That is not
 * hypothetical for a manual install: the documented layout puts `editor.js` directly in
 * `/config/www/`, a flat directory shared by every hand-installed card, theme and
 * script, and `editor.js` is about as generic as a filename gets. Whichever file wins
 * that name, the import resolves, `CalendarCardProEditor` is `undefined`, and
 * `customElements.define(name, undefined)` throws a raw
 * `TypeError: parameter 2 is not of type 'Function'` — from outside the try/catch that
 * holds the message written for exactly this person.
 *
 * So the guard is about the message, not about preventing the failure: either way the
 * editor cannot open, but only one of the two says why.
 */

import { describe, expect, it } from 'vitest';

import { adoptEditorComponent } from '../src/calendar-card-pro';

/**
 * A fresh stand-in per test. One class cannot be registered under two names — the
 * registry rejects reusing a constructor — so a shared stub would fail for a reason
 * that has nothing to do with what is under test.
 */
function stubEditor(): CustomElementConstructor {
  return class extends HTMLElement {};
}

describe('adopting the lazily-loaded editor component', () => {
  it('registers the component a well-formed editor file exports', () => {
    const tag = 'ccp-adopt-test-good';
    const StubEditor = stubEditor();

    adoptEditorComponent({ CalendarCardProEditor: StubEditor }, tag);

    expect(customElements.get(tag)).toBe(StubEditor);
  });

  it('is idempotent, so two concurrent openings do not collide', () => {
    // `customElements.define` throws NotSupportedError on a duplicate name, and two
    // dashboards opening the editor at once both see an unregistered name before
    // either finishes awaiting.
    const tag = 'ccp-adopt-test-twice';
    const StubEditor = stubEditor();

    adoptEditorComponent({ CalendarCardProEditor: StubEditor }, tag);
    expect(() => adoptEditorComponent({ CalendarCardProEditor: StubEditor }, tag)).not.toThrow();

    expect(customElements.get(tag)).toBe(StubEditor);
  });

  /**
   * Each of these is a real shape a wrong-but-present `editor.js` can produce: another
   * card's module (no such export), a partially written file, or something that is not
   * a module object at all.
   */
  const WRONG: Array<[string, unknown]> = [
    ['a module with no such export', { somethingElse: stubEditor() }],
    ['an empty module', {}],
    ['an export that is not a constructor', { CalendarCardProEditor: 'nope' }],
    ['an undefined export', { CalendarCardProEditor: undefined }],
    ['no module at all', undefined],
    ['null', null],
  ];

  for (const [name, module] of WRONG) {
    it(`explains itself for ${name}`, () => {
      const tag = `ccp-adopt-test-${name.replace(/[^a-z]/g, '')}`;

      // The message, not the throw, is the point: without this guard the same input
      // produces a raw TypeError naming `parameter 2`, which tells the reader nothing
      // about which file is wrong or what to do about it.
      expect(() => adoptEditorComponent(module, tag)).toThrow(/Calendar Card Pro/);
      expect(() => adoptEditorComponent(module, tag)).toThrow(/editor/i);
      expect(customElements.get(tag)).toBeUndefined();
    });
  }
});

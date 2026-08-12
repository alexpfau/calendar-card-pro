import { describe, expect, it } from 'vitest';

import { editorModuleUrl } from '../src/utils/editor-url';

/**
 * Guards how the card finds its editor.
 *
 * The card and the editor are two separate files in one flat directory, and the card
 * reaches the second through a dynamic `import()` of a URL it builds at runtime rather
 * than through a relative specifier. That is not a stylistic choice, and both halves of it
 * are load-bearing:
 *
 * - **Relative resolution**, so the pair works wherever HACS or a manual install puts
 *   them — `/hacsfiles/…`, `/local/…`, or behind a reverse proxy on a non-root base path.
 *   Nothing here may construct an absolute path.
 * - **Query propagation**, because `/hacsfiles/**` is served `max-age=2678400` — one month
 *   — and HACS appends its `?hacstag=` cache-buster to the *registered resource only*. A
 *   plain `import('./editor.js')` would drop the query and request a URL that never
 *   changes, so a browser could serve last month's editor against this month's card for up
 *   to 31 days after an upgrade.
 *
 * Neither failure is visible from a build: the URL is well-formed either way, and the
 * wrong one only shows up as an editor that does not match the card, weeks later, on
 * someone else's machine.
 *
 * These assertions name `editor-dev.js` because that is what the source says. Production
 * builds rewrite it to `editor.js` through the same `replace()` entry that strips `-dev`
 * from the custom element names, and `check:bundle` asserts the emitted card names the one
 * belonging to its own build — a thing only observable in built output, and so not
 * testable here.
 */
describe('editorModuleUrl', () => {
  it('resolves the editor beside the card, under the HACS plugin path', () => {
    expect(
      editorModuleUrl(
        'http://homeassistant.local:8123/hacsfiles/calendar-card-pro/calendar-card-pro-dev.js',
      ),
    ).toBe('http://homeassistant.local:8123/hacsfiles/calendar-card-pro/editor-dev.js');
  });

  it("carries the card's ?hacstag= across, so the editor busts when the card busts", () => {
    // The whole point. HACS rewrites this value on every upgrade, which is what makes the
    // editor's URL change at all — sibling files receive no query of their own.
    expect(
      editorModuleUrl(
        'http://homeassistant.local:8123/hacsfiles/calendar-card-pro/calendar-card-pro-dev.js?hacstag=1234563500',
      ),
    ).toBe(
      'http://homeassistant.local:8123/hacsfiles/calendar-card-pro/editor-dev.js?hacstag=1234563500',
    );
  });

  it('leaves no stray ? when the card was loaded without a query', () => {
    // Assigning the empty string sets the URL's query to null rather than to an empty one.
    // `…/editor-dev.js?` and `…/editor-dev.js` are different cache keys, and the trailing
    // form is the kind of thing that works everywhere until it does not.
    const url = editorModuleUrl('http://homeassistant.local:8123/local/calendar-card-pro-dev.js');

    expect(url).toBe('http://homeassistant.local:8123/local/editor-dev.js');
    expect(url).not.toContain('?');
  });

  it("propagates the dev deploy's ?v= too, which the previous shape never did", () => {
    // Content-hashed filenames only changed when the *editor* changed, so bumping the
    // Lovelace resource version reloaded the card and left the editor cached. One query,
    // copied, busts both.
    expect(
      editorModuleUrl('http://homeassistant.local:8123/local/calendar-card-pro-dev.js?v=286'),
    ).toBe('http://homeassistant.local:8123/local/editor-dev.js?v=286');
  });

  it('keeps a multi-parameter query intact', () => {
    expect(
      editorModuleUrl(
        'http://homeassistant.local:8123/local/calendar-card-pro-dev.js?hacstag=42&x=1',
      ),
    ).toBe('http://homeassistant.local:8123/local/editor-dev.js?hacstag=42&x=1');
  });

  it('follows the card onto a non-root base path, as behind a reverse proxy', () => {
    // Resolution is relative to the card's own URL, so a deployment served under a prefix
    // needs no configuration and no knowledge of its own mount point.
    expect(
      editorModuleUrl(
        'https://home.example.com/ha/hacsfiles/calendar-card-pro/calendar-card-pro-dev.js?hacstag=7',
      ),
    ).toBe('https://home.example.com/ha/hacsfiles/calendar-card-pro/editor-dev.js?hacstag=7');
  });

  it('drops a fragment rather than carrying it onto the editor', () => {
    // Not a real scenario, but it pins that only the *query* is propagated deliberately:
    // a fragment is meaningless to a module fetch and would be noise in the network log.
    expect(
      editorModuleUrl('http://homeassistant.local:8123/local/calendar-card-pro-dev.js?v=9#frag'),
    ).toBe('http://homeassistant.local:8123/local/editor-dev.js?v=9');
  });
});

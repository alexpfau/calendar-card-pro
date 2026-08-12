import { describe, expect, it } from 'vitest';

import { stripComments } from '../rollup.config.mjs';

/**
 * The build strips comments out of `css` tagged templates, because their contents are a
 * string literal that no minifier touches — 29,259 bytes raw and 10,879 gzip on the
 * eagerly-loaded card, which is 65% of the stylesheet.
 *
 * That makes this function the one place in the build that edits CSS, and a bug in it
 * ships a broken stylesheet to every user with every gate still green: `stylesheet.test.ts`
 * reads `cardStyles.cssText` from *source*, so it cannot see this at all.
 *
 * These tests are about the one thing a regex gets wrong — comment markers inside strings.
 * The stylesheet really does set `content` (the weather row's middot separator), so this is
 * not hypothetical.
 */
describe('stripComments', () => {
  it('removes a comment block', () => {
    expect(stripComments('a{color:red}/* gone */b{color:blue}')).toBe('a{color:red} b{color:blue}');
  });

  it('leaves a space behind, so two tokens cannot fuse', () => {
    // `red/* x */solid` must not become `redsolid`.
    expect(stripComments('a{border:1px/* x */solid}')).toBe('a{border:1px solid}');
  });

  it.each([
    ["content: '/*'", "a{content:'/*'}"],
    ['content: "/*"', 'a{content:"/*"}'],
    ["content: '*/'", "a{content:'*/'}"],
    ['a comment marker in a url()', 'a{background:url("http://x/*y")}'],
  ])('does not treat %s as a comment', (_label, css) => {
    expect(stripComments(css)).toBe(css);
  });

  it('keeps the real middot the stylesheet ships', () => {
    const css = "span+span::before{content:'·';margin-inline:4px}";
    expect(stripComments(css)).toBe(css);
  });

  it('still strips a comment that follows a string containing a marker', () => {
    // The scanner must leave the string *and* resume comment handling after it.
    expect(stripComments("a{content:'/*'}/* real */b{}")).toBe("a{content:'/*'} b{}");
  });

  it('does not treat // as a comment, because CSS has no such thing', () => {
    const css = 'a{background:url(//cdn.example.com/x.png)}';
    expect(stripComments(css)).toBe(css);
  });

  it('handles an escaped quote inside a string', () => {
    const css = "a{content:'it\\'s'}/* x */";
    expect(stripComments(css)).toBe("a{content:'it\\'s'} ");
  });

  it('leaves an unterminated comment alone rather than eating the rest of the sheet', () => {
    // Silently deleting every rule after a typo is the worst available failure; a visibly
    // broken stylesheet is better than a quietly truncated one.
    const css = 'a{color:red}/* oops';
    expect(stripComments(css)).toBe(css);
  });

  it('collapses the blank lines removal leaves behind', () => {
    // The inserted space is dropped here only because a newline already separates the
    // two rules. Token fusion is still impossible: the space survives whenever it is the
    // only thing between two tokens on one line, which the `1px solid` case above pins.
    expect(stripComments('a{}\n\n/* x */\n\nb{}')).toBe('a{}\nb{}');
  });

  it('is idempotent', () => {
    const once = stripComments('a{color:red}/* x */\nb{color:blue}');
    expect(stripComments(once)).toBe(once);
  });
});

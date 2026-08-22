/**
 * `stripHtmlTags` — what it removes from a description and what it must leave alone (#576).
 *
 * 🚨 **This file does not trust the test environment, and the reason is the whole point of
 * the bug.** `stripHtmlTags` removes markup with a regex and then decodes character
 * references by writing the result into a detached `<textarea>`. In a real browser those
 * are two different jobs: `textarea` content is RCDATA, so the round-trip decodes entities
 * and treats `<p>x</p>` as literal text. happy-dom parses the same assignment as HTML and
 * strips the tags itself — so under vitest the second half quietly does the first half's
 * work, and **deleting the regex outright leaves the whole suite green**. A test written
 * the obvious way here pins happy-dom, not the card.
 *
 * Both halves were measured rather than read off the spec, in headless Chromium
 * (`chrome-headless-shell` 1234), by writing each input straight into a `textarea` with no
 * regex in front of it:
 *
 * | written into `textarea.innerHTML`    | `.value` in Chromium               |
 * | ------------------------------------ | ---------------------------------- |
 * | `<p>Paragraph</p>`                   | `<p>Paragraph</p>` — tags survive  |
 * | `Before <!-- a comment --> After`    | unchanged — comments survive       |
 * | `Geboren&nbsp;YEAR=1996`             | `Geboren YEAR=1996` — entity decodes |
 *
 * So `renderedInBrowser` below runs the real `stripHtmlTags` against a `textarea` that
 * behaves the way Chromium's does, and that is the oracle for every case the issue names.
 * The `stripHtmlTags` in the environment vitest actually provides is exercised separately
 * at the bottom, and labeled with what it can and cannot see.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as FormatUtils from '../src/utils/format';

const nativeCreateElement = document.createElement.bind(document);

/**
 * Decode character references the way a browser's `<textarea>` does, and nothing else.
 *
 * Escaping `<` and `>` before handing the string over is what turns happy-dom's HTML parse
 * into an RCDATA one: the parser never sees a delimiter that could open anything, every
 * `&…;` still decodes, and the escaped pair decodes straight back. `&lt;b&gt;` in the input
 * is untouched by the escape and still arrives as `<b>`, which is the behavior that would
 * break if this were done with a blunter substitution.
 *
 * Escaping `>` as well as `<` is not belt-and-braces. happy-dom's textarea mangles a `-->`
 * that reaches it — `Before <!-- a comment --> After` reads back with the first half
 * repeated — so a model that escaped only `<` would report a duplicated string for exactly
 * the comment case this file exists to pin.
 */
function rcdataDecode(html: string): string {
  const textarea = nativeCreateElement('textarea') as HTMLTextAreaElement;
  textarea.innerHTML = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return textarea.value;
}

/** A `<textarea>` stand-in exposing only the two members `stripHtmlTags` touches. */
class RcdataTextarea {
  private decoded = '';

  set innerHTML(html: string) {
    this.decoded = rcdataDecode(html);
  }

  get value(): string {
    return this.decoded;
  }
}

/** Run the real `stripHtmlTags` with the DOM answering as a browser would. */
function renderedInBrowser(text: string): string {
  const spy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tag: string) =>
      tag === 'textarea'
        ? (new RcdataTextarea() as unknown as HTMLElement)
        : nativeCreateElement(tag)) as typeof document.createElement);

  try {
    return FormatUtils.stripHtmlTags(text);
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the browser model this file is built on', () => {
  // Each of these is one row of the Chromium table in the header. They are guards on the
  // oracle rather than tests of the card: if the model stops being RCDATA, every
  // expectation below it is measuring something else and should fail loudly here first.
  it('leaves markup alone, the way RCDATA does', () => {
    expect(rcdataDecode('<p>Paragraph</p>')).toBe('<p>Paragraph</p>');
    expect(rcdataDecode('Before <!-- a comment --> After')).toBe('Before <!-- a comment --> After');
  });

  it('still decodes character references', () => {
    expect(rcdataDecode('Geboren&nbsp;YEAR=1996')).toBe('Geboren\u00a0YEAR=1996');
    expect(rcdataDecode('5 &lt; 10 and 20 &gt; 3')).toBe('5 < 10 and 20 > 3');
  });

  it('differs from the textarea vitest would otherwise hand the card', () => {
    // The masking itself, pinned. A plain happy-dom textarea parses what a browser keeps,
    // which is why the regex looks dead under vitest and is load-bearing in production.
    // Should happy-dom ever become spec-correct here this fails, and the stub above can be
    // retired rather than repaired.
    const parsed = nativeCreateElement('textarea') as HTMLTextAreaElement;
    parsed.innerHTML = '<p>Paragraph</p>';

    expect(parsed.value).not.toBe('<p>Paragraph</p>');
  });
});

describe('prose that pairs a < with a later >', () => {
  // The defect. Every one of these rendered with the middle eaten before the fix — the
  // first is the row the maintainer reproduced on a live Home Assistant, where
  // `alert if temp < 5 and pressure > 3 END` drew as `alert if temp 3 END`.
  it.each([
    ['alert if temp < 5 and pressure > 3 END'],
    ['5 < 10 and 20 > 3'],
    ['a < b and c > d'],
    ['step 1 <-> step 2'],
    ['x <10 and y> z'],
    ['a </ b > c'],
  ])('survives intact: %s', (text) => {
    expect(renderedInBrowser(text)).toBe(text);
  });

  it('flattens prose that genuinely looks like a tag, as a browser would', () => {
    // Stated so nobody reads it as an oversight: `<b ` opens a tag by the tokenizer's own
    // rule, so this is the residue of #576 that option 2 knowingly keeps. Anything wider
    // would have to stop being a regex.
    expect(renderedInBrowser('if a<b and c>d')).toBe('if ad');
  });

  it('leaves an unterminated tag alone, because a browser does', () => {
    expect(renderedInBrowser('Before <b bold After')).toBe('Before <b bold After');
  });
});

describe('markup, which must strip exactly as it did before #576', () => {
  // Every value here was measured on the released behavior first, in the same headless
  // Chromium, so this table is a *no-change* assertion: the fix narrows what counts as a
  // tag and must not narrow what gets removed.
  it.each([
    ['paragraph', '<p>Paragraph</p>', 'Paragraph'],
    [
      'inline emphasis',
      'Before <b>bold</b> and <i>italic</i> After',
      'Before bold and italic After',
    ],
    ['anchor with attributes', 'See <a href="https://example.com">link</a> now', 'See link now'],
    ['line break', 'Line one<br>Line two', 'Line oneLine two'],
    ['comment', 'Before <!-- a comment --> After', 'Before  After'],
    ['doctype and document', '<!DOCTYPE html><html><body>Hi</body></html>', 'Hi'],
    ['processing instruction', '<?xml version="1.0"?>Body', 'Body'],
  ])('%s', (_name, input, expected) => {
    expect(renderedInBrowser(input)).toBe(expected);
  });

  it('keeps the text inside <style> and <script>, which is deliberate', () => {
    // Surprising enough that a future reader will file it as a bug, so it is pinned rather
    // than left to be discovered: the card removes *tags*, and a tag is all `<style>` is.
    // Nothing here parses, so there is no element to ask for its content, and dropping the
    // text would need the "parse properly" option #576 weighed and did not take.
    expect(renderedInBrowser('<style>p{color:red}</style>Body')).toBe('p{color:red}Body');
    expect(renderedInBrowser('<script>alert(1)</script>Body')).toBe('alert(1)Body');
  });

  it('decodes character references after stripping', () => {
    expect(renderedInBrowser('Geboren&nbsp;YEAR=1996')).toBe('Geboren\u00a0YEAR=1996');
    expect(renderedInBrowser('5 &lt; 10 and 20 &gt; 3')).toBe('5 < 10 and 20 > 3');
  });

  it('strips a comment whole even when one sits inside it', () => {
    // The one place the fix deliberately reads better than the code it replaced. The old
    // regex stopped at the first `>` and left `Before  b --> After` on the card; a browser
    // reads the whole thing as one comment, and now so does this.
    expect(renderedInBrowser('Before <!-- a > b --> After')).toBe('Before  After');
  });

  it('strips two comments as two, not as everything between them', () => {
    // The comment branch has to stop at the first `-->`. A greedy one passes every other
    // assertion in this file and eats the prose between any two comments, which is the
    // shape Google Calendar produces when a description is edited twice.
    expect(renderedInBrowser('A <!-- one --> B <!-- two --> C')).toBe('A  B  C');
  });
});

describe('under the DOM vitest actually provides', () => {
  // 🚨 These pass with the regex deleted, and are kept anyway rather than mistaken for
  // coverage. happy-dom's textarea parses the markup, so it removes tags the regex would
  // have removed and the two are indistinguishable here — which is precisely the trap #576
  // warned about. What they are good for is stating the card's contract in the environment
  // everything else in the suite runs in, so a change that broke it *both* ways is caught.
  it.each([
    ['5 < 10 and 20 > 3'],
    ['a < b and c > d'],
    ['alert if temp < 5 and pressure > 3 END'],
    ['a </ b > c'],
  ])('keeps comparison prose: %s', (text) => {
    expect(FormatUtils.stripHtmlTags(text)).toBe(text);
  });

  it('cannot see three of the rows the fix repairs', () => {
    // happy-dom is not merely lenient here, it is stricter than any browser: it treats
    // `<-`, `<1` and an unfinished `<b` as markup, where the tokenizer's rule makes all
    // three ordinary text and Chromium leaves all three alone. So these read correctly on
    // a real card and still read wrong under vitest, and only the RCDATA oracle above can
    // say so. Asserted as a difference rather than a value: if happy-dom is ever fixed,
    // this fails and the rows simply move up into the list above.
    for (const text of ['step 1 <-> step 2', 'x <10 and y> z', 'Before <b bold After']) {
      expect(FormatUtils.stripHtmlTags(text)).not.toBe(text);
      expect(renderedInBrowser(text)).toBe(text);
    }
  });

  it.each([
    ['Before <b>bold</b> and <i>italic</i> After', 'Before bold and italic After'],
    ['<p>Paragraph</p>', 'Paragraph'],
  ])('still flattens %s', (input, expected) => {
    expect(FormatUtils.stripHtmlTags(input)).toBe(expected);
  });

  it('is unchanged for the empty and whitespace cases', () => {
    expect(FormatUtils.stripHtmlTags('')).toBe('');
    expect(FormatUtils.stripHtmlTags('   <p>  padded  </p>   ')).toBe('padded');
  });
});

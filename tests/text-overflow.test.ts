import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';

/**
 * Regression cover for text that overflowed its box instead of wrapping.
 *
 * Two distinct defects, one family: an `overflow: hidden` box whose content was allowed
 * to grow wider than its own minimum, so text was lost or falsely marked as lost.
 *
 * 1. `.summary` is an `overflow: hidden` box, so anything that inflates its scrollable
 *    content without inflating its box makes `scrollWidth > clientWidth` and trips
 *    `text-overflow`. A horizontal margin on the inline `.event-title` did exactly that:
 *    `.summary`'s min-content became `longestWord + 12px`, and every width inside that
 *    12px window rendered a full, untruncated title with a trailing ellipsis anyway.
 *
 * 2. `.description span` carries `overflow: hidden` unconditionally, for a
 *    `-webkit-line-clamp` that is `none` at the default. As a flex item that collapses
 *    `min-width: auto` to 0 (Flexbox 4.5), so it shrank below its longest word and
 *    clipped it mid-glyph -- with no ellipsis at all.
 *
 * These assertions read the stylesheet rather than the DOM on purpose -- happy-dom does
 * no layout, so the overflow itself is not observable here. What is observable, and what
 * actually regressed, is the declaration set.
 */

/** Extract a single top-level rule body from the stylesheet by exact selector. */
function ruleBody(selector: string): string {
  const css = cardStyles.cssText;
  const start = css.indexOf(`\n  ${selector} {`);
  expect(start, `selector "${selector}" not found in cardStyles`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('title overflow', () => {
  it('gives .summary the 12px trailing gutter', () => {
    // Moved off .event-title, where it counted as clipped content. .summary is a block
    // box, so here the margin narrows the box instead of overflowing it -- which is how
    // the .time/.location/.description gutter has always behaved.
    expect(ruleBody('.summary')).toMatch(/margin-right:\s*12px/);
  });

  it('leaves no horizontal margin on .event-title', () => {
    // The invariant, not just the old declaration: any horizontal margin on a descendant
    // of .summary re-creates the phantom overflow.
    const body = ruleBody('.event-title');
    expect(body).not.toMatch(/margin-(right|left|inline)/);
    expect(body).not.toMatch(/margin:\s/);
  });

  it('does not ellipsise .summary', () => {
    // Titles are unbounded, so there is no limit for an ellipsis to signal. The card's
    // one real truncation, description_max_lines, clamps instead -- see below.
    expect(ruleBody('.summary')).not.toMatch(/text-overflow/);
  });

  it('breaks an over-long word rather than clipping it', () => {
    // What makes dropping text-overflow safe: a word wider than the column wraps instead
    // of losing characters behind overflow: hidden.
    expect(ruleBody('.summary')).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('keeps overflow: hidden as the backstop', () => {
    expect(ruleBody('.summary')).toMatch(/overflow:\s*hidden/);
  });

  it('leaves the description clamp -- the one real truncation -- intact', () => {
    // Not rule-scoped: .description span is declared twice, and all this needs to know
    // is that the clamp survives somewhere.
    expect(cardStyles.cssText).toMatch(
      /-webkit-line-clamp:\s*var\(--calendar-card-description-max-lines\)/,
    );
  });
});

describe('metadata row overflow', () => {
  const SHARED = '.time span,\n  .location span,\n  .description span';

  it('breaks an over-long word in time, location and description', () => {
    // .description span is a flex item carrying overflow: hidden, which per Flexbox 4.5
    // collapses min-width: auto to 0. Without break-word it shrinks below its longest
    // word and clips it mid-glyph, with no ellipsis to signal the loss. .time and
    // .location share the declaration so the three rows wrap alike.
    expect(ruleBody(SHARED)).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('keeps the gutter on the flex row, not on the span', () => {
    // .time/.location/.description are flex boxes, so their margin sits outside the box
    // and cannot inflate min-content -- the mirror image of the .summary case above, and
    // the reason this defect needed a different fix from the title one.
    expect(ruleBody('.time,\n  .location,\n  .description')).toMatch(/margin-right:\s*12px/);
    expect(ruleBody(SHARED)).not.toMatch(/margin-(right|left|inline)/);
  });
});

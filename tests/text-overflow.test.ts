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
 * 2. `.time span` / `.location span` / `.description span` carry `overflow: hidden`
 *    unconditionally, for a `-webkit-line-clamp` that is `none` at the default. As flex
 *    items that collapses `min-width: auto` to 0 (Flexbox 4.5), so they shrank below
 *    their longest word and clipped it mid-glyph -- with no ellipsis at all.
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
  it('gives .summary the 12px trailing gutter, and only when it shares its row', () => {
    // Moved off .event-title, where it counted as clipped content. .summary is a block
    // box, so here the margin narrows the box instead of overflowing it -- which is how
    // the .time/.location/.description gutter has always behaved. That is the invariant:
    // the gutter lives on .summary, never on the inline title.
    //
    // It is conditional because a trailing gutter separates the title from whatever else
    // is on the row, and nothing else is on the row unless weather is in title placement.
    // Unconditional, it read in a narrow grid block as text held 12px off the right edge
    // while sitting hard against the left.
    expect(ruleBody('.summary:not(:only-child)')).toMatch(/margin-right:\s*12px/);
    expect(
      ruleBody('.summary'),
      'the unconditional rule carries the box model, not the separation',
    ).not.toMatch(/margin-right/);
  });

  it('leaves no horizontal margin on .event-title', () => {
    // The invariant, not just the old declaration: any horizontal margin on a descendant
    // of .summary re-creates the phantom overflow.
    const body = ruleBody('.event-title');
    expect(body).not.toMatch(/margin-(right|left|inline)/);
    expect(body).not.toMatch(/margin:\s/);
  });

  it('does not ellipsise .summary', () => {
    // At the default title_max_lines there is no limit for an ellipsis to signal, and
    // when it is set the ellipsis comes from -webkit-line-clamp on .event-title instead.
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

  it('leaves the description clamp -- a real truncation -- intact', () => {
    // Not rule-scoped: .description span is declared twice, and all this needs to know
    // is that the clamp survives somewhere.
    expect(cardStyles.cssText).toMatch(
      /-webkit-line-clamp:\s*var\(--calendar-card-description-max-lines\)/,
    );
  });

  it('still clamps on .event-title when title_max_lines is set', () => {
    // The clamp is the only remaining truncation path for a title, so it has to stay
    // intact -- dropping text-overflow must not disable intentional truncation.
    const body = ruleBody('.event-title');
    expect(body).toMatch(/-webkit-line-clamp:\s*var\(--calendar-card-title-max-lines\)/);
    expect(body).toMatch(/display:\s*var\(--calendar-card-title-display\)/);
  });
});

describe('metadata row overflow', () => {
  const SHARED = '.time span,\n  .location span,\n  .description span';

  it('breaks an over-long word in time, location and description', () => {
    // These spans are flex items carrying overflow: hidden, which per Flexbox 4.5
    // collapses min-width: auto to 0. Without break-word they shrink below their longest
    // word and clip it mid-glyph, with no ellipsis to signal the loss.
    expect(ruleBody(SHARED)).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('still clamps each field when its max_lines option is set', () => {
    // The clamps are what overflow: hidden is actually there for, and break-word must
    // not disturb them. Unscoped on purpose: .description span is declared twice.
    for (const field of ['time', 'location', 'description'])
      expect(cardStyles.cssText).toMatch(
        new RegExp(`-webkit-line-clamp:\\s*var\\(--calendar-card-${field}-max-lines\\)`),
      );
  });

  it('keeps the gutter on the flex row, not on the span', () => {
    // .time/.location/.description are flex boxes, so their margin sits outside the box
    // and cannot inflate min-content -- the mirror image of the .summary case above, and
    // the reason this defect needed a different fix from the title one.
    expect(ruleBody('.time,\n  .location,\n  .description')).toMatch(/margin-right:\s*12px/);
    expect(ruleBody(SHARED)).not.toMatch(/margin-(right|left|inline)/);
  });
});

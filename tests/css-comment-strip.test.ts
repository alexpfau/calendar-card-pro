import { describe, expect, it } from 'vitest';

import { stripComments } from '../rollup.config.mjs';
import { cardStyles } from '../src/rendering/styles';

/**
 * The build strips comments out of `css` tagged templates, because their contents are a
 * string literal that no minifier touches — 31,579 bytes raw and 12,234 gzip on the
 * eagerly-loaded card, which is 51% of the stylesheet. Measured by building
 * `dist/calendar-card-pro.js` with the plugin and again without it.
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

  // The figures in this file's header and in `AGENTS.md` are the reason anyone believes the
  // plugin is worth its complexity, and until this test existed nothing measured them. They
  // drifted to roughly double the truth — 29,259 raw against an actual 15,214, and 65% of
  // the sheet against an actual 46% — and disagreed with each other by five bytes, with
  // every gate green, because a number in a comment is not checked by anything.
  //
  // Bands rather than exact bytes: an exact pin would fail on every edit to a CSS comment,
  // which is precisely the thing `AGENTS.md` tells contributors to write freely. These are
  // wide enough to survive ordinary editing and far too tight to survive the 1.9x drift
  // that actually happened.
  //
  // Rebased in v4.0.0. The band was set around 15,214 and the stylesheet then grew until
  // `dev` sat at 17,887 — 113 bytes under the ceiling, so the next comment of any substance
  // was going to fail this whatever it said, and the documented figure was 19% light again.
  // Widening without re-measuring would have been the same mistake the test exists to catch,
  // so the header figures come from a real pair of builds, not from this number.
  //
  // Rebased again for the all-day badge, whose derivation needed explaining, and once more
  // after the light-dark() fault was written up in the stylesheet. Re-measured the same way —
  // one build with `stripCssComments` in `rollup.config.mjs` and one without — giving 31,579
  // raw and 12,234 gzip across both bundles. Note the split: 30,719 of the raw saving is the
  // card and only 860 the editor, because `rendering/styles.ts` is where the reasoning lives.
  //
  // Rebased once more when the badge's sizing was moved off the icon and onto its own font.
  // That fix carried two findings whose causes are invisible from the CSS and so had to be
  // written down beside it: the countdown's trailing-text clamp was silently swallowing the
  // badge and forcing display: -webkit-box on it, and .time-actual's default min-width: auto
  // made the pill's ellipsis unreachable in principle rather than merely rare. Both notes
  // record a measurement someone would otherwise have to repeat. The stylesheet was then
  // 56,221 chars of which 35,763 were comment, a share of 63.6% against 60.4% before.
  //
  // Rebased again for the badge's second position. Splitting one pill into a shared box plus
  // two sets of type decisions needed the shared/not-shared line written down, and the title
  // pill carries two constraints that are invisible from its own rule: why it is nested
  // inside .event-title rather than replacing it, and why its single-line clamp is not
  // title_max_lines. That reading was 59,026 chars of which 38,294 were comment, 64.9%.
  //
  // Rebased once more when the badge's vertical centring was measured properly. The old note
  // claimed the ink was centred to within a fifth of a pixel; a fourteen-size pixel sweep
  // showed a systematic +0.027em bias, reported from a live card. The replacement records the
  // measurement, the residual that baseline snapping leaves behind, and why the trim block
  // exists rather than a more precise padding value -- the last of which is the sort of thing
  // a later reader would otherwise delete as redundant with the fallback. Now 62,891 chars of
  // which 41,933 are comment, a share of 66.7%.
  // 🚨 Both attempts at this measurement first reported a saving of ZERO, years apart in
  // spirit and minutes apart in fact, because the edit meant to disable the plugin did not
  // match: it is registered as a bare identifier in the plugins array, not as a call, so
  // every regex written for `stripCssComments()` silently no-ops. Identical arms are a void
  // measurement, not a finding — diff the two configs and refuse to read the delta unless
  // they actually differ.
  it('saves the number of bytes the documentation claims it does', () => {
    const body = cardStyles.cssText;
    expect(body.length).toBeGreaterThan(10_000);

    const saved = body.length - stripComments(body).length;
    const share = saved / body.length;

    expect(saved).toBeGreaterThan(26_000);
    expect(saved).toBeLessThan(45_000);
    // 66.7% at the time of writing, up from 64.9%, 63.6%, 60.4% and before that ~51%. Both jumps were paid
    // for the same thing: a fault whose cause is invisible from the CSS and whose symptoms
    // point the wrong way needs a long explanation or the next person repeats the
    // investigation. That is the trade this plugin exists to make — none of it reaches a
    // user — but the share is worth watching, so the ceiling stays close enough to the
    // measurement to notice another jump rather than absorbing one silently.
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.72);
  });
});

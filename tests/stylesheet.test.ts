import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';

/**
 * The stylesheet gate.
 *
 * Nothing in this suite read `styles.ts` before this file existed, and the
 * consequences were not theoretical -- three layout regressions shipped green
 * and were caught only by deploying to a real Home Assistant and measuring card
 * heights by hand:
 *
 * 1. Three per-field clamp rules were given `display: -webkit-box`
 *    unconditionally. Two were harmless, because their parents are flex
 *    containers and a flex item is blockified already. The third was
 *    `.event-title`, whose parent `.summary` is a flex *item* and not a flex
 *    *container* -- so that one silently retightened every event row from 386px
 *    to 372px.
 * 2. The same trap resurfaced while adding the hanging indent, where the obvious
 *    implementation is to make `.summary` a flex or grid container.
 * 3. `.event-title` was declared in two separate blocks, so which value won
 *    depended on source order rather than on intent.
 *
 * `list-dom.test.ts` cannot see any of this: it serializes **DOM**, and a
 * stylesheet change moves no attribute. `max-lines.test.ts` asserts the *values*
 * of custom properties, which is a different question from what the stylesheet
 * does with them.
 *
 * ## Why this reads text rather than parsed CSSOM rules
 *
 * The first version of this file parsed `cssText` into a real stylesheet and
 * asserted on `CSSStyleDeclaration`. That does not work here: happy-dom's value
 * parser silently drops both `display: -webkit-box` (unrecognised value) and
 * `text-indent: calc(-1 * ...)` (negative multiplier) while keeping every
 * neighbouring declaration -- so the two constructs carrying all the layout risk
 * are exactly the two it cannot see. Chromium parses both correctly; the hanging
 * indent is confirmed live. The parser is wrong, not the CSS.
 *
 * Reading the source text is therefore the honest gate: it sees precisely the
 * string Lit hands to the browser.
 *
 * It deliberately pins **invariants that have broken, or that other code depends
 * on**, not the declarations themselves. A gate that fails on every colour tweak
 * gets updated reflexively and stops being a gate.
 */

/**
 * The stylesheet with comments stripped, so a selector named in prose never matches.
 *
 * 🚨 `cssText` comes back `undefined` — not empty, not throwing — when the `css` tagged
 * template contains an invalid escape sequence *anywhere in its text, comments included*.
 * A tagged template's cooked value is `undefined` in that case (ES2018 template literal
 * revision), so one `\200B` written as prose inside a CSS comment silently deletes the
 * entire stylesheet and ships a completely unstyled card. Nothing else catches it: it
 * typechecks, builds, lints and passes every other suite. Named here because the raw
 * symptom is `Cannot read properties of undefined (reading 'replace')` on the next line,
 * which points at this file rather than at the one with the typo. Double the backslash.
 */
const RAW_CSS = cardStyles.cssText;

if (typeof RAW_CSS !== 'string') {
  throw new Error(
    'cardStyles.cssText is not a string, so the whole stylesheet is missing. A `css` ' +
      'tagged template cooks to undefined when its text carries an invalid escape ' +
      'sequence — including inside a CSS comment. Look for a single-backslash `\\200B` ' +
      'or similar in src/rendering/styles.ts and double it.',
  );
}

const CSS = RAW_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every top-level rule as a `{ selectors, body }` pair.
 *
 * Hand-scanned rather than regex-matched because the stylesheet contains
 * `@supports` and `@keyframes` blocks, whose inner rules must not be mistaken
 * for top-level ones.
 */
function scanRules(): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < CSS.length; i++) {
    const ch = CSS[i];
    if (ch === '{') {
      if (depth === 0) {
        prelude = CSS.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // Skip at-rules: their prelude is not a selector list.
        if (!prelude.startsWith('@')) {
          out.push({
            selectors: prelude.split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
            body: CSS.slice(start, i),
          });
        }
        start = i + 1;
      }
    }
  }
  return out;
}

const RULES = scanRules();

/** Every rule listing `selector` as one of its comma-separated parts. */
function rulesFor(selector: string) {
  return RULES.filter((r) => r.selectors.includes(selector));
}

/** The last declared value of `prop` on `selector`, or '' when never declared. */
function declared(selector: string, prop: string): string {
  const values: string[] = [];
  for (const rule of rulesFor(selector)) {
    for (const decl of rule.body.split(';')) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      if (decl.slice(0, idx).trim() === prop) values.push(decl.slice(idx + 1).trim());
    }
  }
  return values[values.length - 1] ?? '';
}

/**
 * Strip one enclosing `calc(...)` so a value can be nested inside another.
 *
 * CSS forbids `calc(calc(...))`, so a rule that negates another rule's `calc()` gutter
 * has to inline the inner expression rather than wrap the whole declaration. The tests
 * that pair a hanging indent with its matching negative margin compare the two through
 * this, so they assert the invariant — the pull is the exact opposite of the gutter —
 * rather than restating both numbers and letting them drift apart independently.
 */
function inner(value: string): string {
  const match = /^calc\((.*)\)$/.exec(value.trim());
  return match ? match[1] : value.trim();
}

/**
 * A calc() expression reduced to a comparable form: `calc(` becomes a bare
 * paren and all whitespace is dropped, so two spellings of the same quantity
 * compare equal.
 */
function expr(value: string): string {
  return value.replace(/calc\(/g, '(').replace(/\s+/g, '');
}

describe('card stylesheet', () => {
  it('scans into top-level rules', () => {
    // Guards the scanner itself: a brace-counting bug would quietly yield a
    // handful of enormous rules and every assertion below would pass vacuously.
    expect(RULES.length).toBeGreaterThan(90);
    expect(rulesFor('.event-title')).toHaveLength(1);
  });

  describe('the blockification trap', () => {
    /*
     * `.summary` is a flex *item* of the event row and holds the label and
     * `.event-title` as inline siblings. Making it a flex or grid *container*
     * blockifies those children, which retightens every event row. This is the
     * single most repeated mistake in this stylesheet; see the file header.
     */
    it('.summary is not a flex or grid container', () => {
      expect(declared('.summary', 'display')).not.toMatch(/flex|grid/);
    });

    it('.event-title does not hardcode a display value', () => {
      // It must stay driven by --calendar-card-title-display, which resolves to
      // `inline` when title_max_lines is 0 so the clamp costs no layout change.
      expect(declared('.event-title', 'display')).toBe('var(--calendar-card-title-display)');
    });

    it.each([
      ['.location span', '.location'],
      ['.description span', '.description'],
      ['.time .time-actual > span:not(.time-text)', '.time-actual'],
    ])(
      '%s may clamp with a literal -webkit-box because %s is a flex container',
      (target, parent) => {
        // The literal is only safe while the parent blockifies it anyway. If a
        // future change drops `display: flex` from the parent, this fails here
        // rather than as an unexplained few-pixel shift on a live dashboard.
        expect(declared(target, 'display')).toBe('-webkit-box');
        expect(declared(parent, 'display')).toBe('flex');
      },
    );

    it('does not hand the countdown wrapper a literal -webkit-box', () => {
      // The exception that proves the rule above, and the reason its selector carries a
      // child combinator and a :not(). `.time-text` IS a direct-child span of a flex
      // container, so it satisfies the "safe to blockify" argument -- and blockifying it
      // would still be wrong, because -webkit-box turns its two inline children into
      // stacked box-flex items. The time and the countdown would then sit on separate
      // lines always, and a configured `time_max_lines` would clip the countdown away
      // entirely. The clamp belongs on the span that holds the time and nowhere else.
      expect(declared('.time .time-actual .time-text', 'display')).toBe('');
      expect(declared('.time .time-actual .time-text', '-webkit-line-clamp')).toBe('');
    });
  });

  describe('the strut behind an inline title', () => {
    /*
     * `.event-title` is inline, so each of its line boxes is the taller of its
     * own inline box and the strut of `.summary`, the block that contains it.
     * `.summary` used to declare neither font-size nor line-height, so its strut
     * came from Home Assistant's base typography -- roughly 14px at
     * --ha-line-height-normal, about 22px -- against the title's own 14px x 1.2
     * = 16.8px. The strut won at every supported font size, so a wrapped title
     * was spaced on Home Assistant's line height rather than the card's, and
     * lowering `event_font_size` made it worse rather than better: the pitch
     * stayed where it was while the glyphs shrank away from it. The demo
     * screenshots were shot with reduced font sizes and show it clearly.
     *
     * The fix has to live on `.summary` rather than on `.event-title`, because
     * an inline element cannot shrink its container's strut, and blockifying the
     * title is ruled out by the trap above.
     */
    it('.summary carries a strut matching the title it contains', () => {
      expect(declared('.summary', 'font-size')).toBe('var(--calendar-card-font-size-event)');
      expect(declared('.summary', 'line-height')).toBe('1.2');
    });

    it('the strut and the title cannot drift apart', () => {
      // Asserted as an invariant rather than as two literals, so changing the
      // title's size or leading has to move both or fail here.
      expect(declared('.summary', 'font-size')).toBe(declared('.event-title', 'font-size'));
      expect(declared('.summary', 'line-height')).toBe(declared('.event-title', 'line-height'));
    });

    it('gives back the leading the strut used to contribute, in em', () => {
      /*
       * Tightening the strut also removed the only thing separating the title
       * from the time row beneath it and from the top of the event -- measured
       * against v3.6.0, 7.0px -> 4.0px above and 5.4px -> 2.8px below. The
       * padding restores it: 0.2em is half of (22.4 - 16.8) at the v3.x default
       * font, so a one-line title occupies what it always did while a wrapped
       * one still gets shorter.
       *
       * The unit is load-bearing. A px value here would reinstate exactly the
       * defect this section exists to fix -- spacing that does not track
       * event_font_size -- so assert that it scales, not merely that it exists.
       */
      const pad = declared('.summary', 'padding-block');
      expect(pad).toBe('0.2em');
    });

    it('compensates with padding-block, not the padding shorthand', () => {
      // The :has() rules set padding-inline-start for glyph labels. The
      // shorthand would reset it and un-hang every icon and image label.
      expect(declared('.summary', 'padding')).toBe('');
      for (const sel of ['.summary:has(> .label-icon)', '.summary:has(> .label-emoji)']) {
        expect(declared(sel, 'padding-inline-start')).not.toBe('');
      }
    });
  });

  describe('per-field line clamping', () => {
    it.each([
      ['.event-title', '--calendar-card-title-max-lines'],
      ['.time .time-actual > span:not(.time-text)', '--calendar-card-time-max-lines'],
      ['.time .time-actual .time-text > span', '--calendar-card-time-max-lines'],
      ['.location span', '--calendar-card-location-max-lines'],
      ['.description span', '--calendar-card-description-max-lines'],
    ])('%s clamps on the element that holds the text', (selector, prop) => {
      // -webkit-line-clamp needs all three of these together, and the clamp has
      // to land on the innermost text-bearing element: clamping a wrapper would
      // clamp away the icon and countdown siblings instead of the text.
      //
      // The time appears twice because it has two placements. The two selectors are
      // disjoint by construction rather than by specificity -- `> span:not(.time-text)`
      // matches only where no wrapper exists, `.time-text > span` only where one does --
      // so neither can start winning over the other because a rule moved in the file.
      expect(declared(selector, '-webkit-line-clamp')).toBe(`var(${prop})`);
      expect(declared(selector, '-webkit-box-orient')).toBe('vertical');
      expect(declared(selector, 'overflow')).toBe('hidden');
    });
  });

  describe('hanging indent for glyph labels', () => {
    it.each([
      '.summary:has(> .label-icon)',
      '.summary:has(> .label-image)',
      '.summary:has(> .label-emoji)',
    ])('%s hangs the label in the margin', (selector) => {
      // A hanging indent is a negative text-indent cancelled by an equal
      // padding: the first line starts back at the label, every wrapped line
      // starts at the padding edge. One without the other is not an indent.
      //
      // Compared as normalised expressions rather than raw strings, because
      // `calc(-1 * (A + 4px))` and `calc(-1 * calc(A + 4px))` are the same
      // quantity -- a bare parenthesised sub-expression inside calc() is valid
      // and is what the source uses. Pinning one spelling would fail on a purely
      // cosmetic edit.
      const indent = expr(declared(selector, 'text-indent'));
      const padding = expr(declared(selector, 'padding-inline-start'));
      expect(padding).not.toBe('');
      expect(indent).toBe(`(-1*${padding})`);
    });

    it('does not hang a prose label', () => {
      // .calendar-label is emitted for both emoji and prose; only the emoji case
      // additionally carries .label-emoji. Hanging on .calendar-label would
      // indent by the width of a whole word such as "Familienkalender: ".
      expect(rulesFor('.summary:has(> .calendar-label)')).toHaveLength(0);
    });

    it('.event-title resets the inherited indent', () => {
      // text-indent inherits. Harmless while .event-title is inline, but
      // title_max_lines blockifies it, at which point it establishes its own
      // line boxes and would indent the title's first line a second time.
      expect(declared('.event-title', 'text-indent')).toBe('0');
    });

    it.each(['.label-icon', '.label-image', '.calendar-label'])(
      '%s carries the 4px margin the indent arithmetic assumes',
      (selector) => {
        expect(declared(selector, 'margin-right')).toBe('4px');
      },
    );
  });

  describe('the weather badge in its own-row placement', () => {
    /*
     * `.event-weather` is styled for the list view's title-row badge, where it floats
     * to the right of the title. The column view reuses the same element as a fourth
     * row beneath time/location/description, so every property tuned for the badge
     * has to be undone -- and each one missed showed up as a small visual
     * inconsistency rather than as anything a DOM test could see.
     */
    it.each([
      ['margin-inline-start', '0'],
      ['margin-inline-end', '12px'],
      ['font-weight', 'normal'],
    ])('resets %s, which the badge sets for the title row', (prop, value) => {
      expect(declared('.time-location .event-weather', prop)).toBe(value);
    });

    it('is scoped by descendant selector, not by a modifier class', () => {
      // The two placements are structurally exclusive, so the row variant must stay
      // a descendant of .time-location. A bare .event-weather rule would leak into
      // the list view's badge.
      expect(rulesFor('.time-location .event-weather')).toHaveLength(1);
    });

    /*
     * The text wrapper is the only shrinkable flex item in the row. Inside it the
     * temperature, UV index and condition are ordinary inline siblings, so a translated
     * condition can break at its own spaces instead of moving as one atomic flex item.
     */
    it('shrinks the inline text run rather than the condition as a flex chip', () => {
      expect(declared('.time-location .event-weather .event-weather-text', 'flex')).toBe(
        '1 1 auto',
      );
      expect(declared('.time-location .event-weather .event-weather-text', 'min-width')).toBe('0');
      expect(declared('.time-location .event-weather .weather-condition', 'flex')).toBe('');
    });

    it('keeps the condition in inline flow when it is not clamped', () => {
      // This is the falsifier for the reported wrapping bug. If the condition is a direct
      // flex item or a literal -webkit-box, flex line collection moves the whole
      // "· Clear, night" item to the next line before the browser ever considers the
      // break opportunity after the comma. The generated display custom property resolves
      // to inline when max_lines is 0, and to -webkit-box only when the user asks to clamp.
      expect(declared('.time-location .event-weather .weather-condition', 'display')).toBe(
        'var(--calendar-card-weather-event-condition-display)',
      );
    });

    it('clamps the words with the same mechanism as every other line limit', () => {
      // -webkit-line-clamp only takes effect on a -webkit-box, and unlimited is the
      // keyword `none`, which generateCustomPropertiesObject emits when the option is 0.
      const selector = '.time-location .event-weather .weather-condition';

      expect(declared(selector, '-webkit-box-orient')).toBe('vertical');
      expect(declared(selector, '-webkit-line-clamp')).toBe(
        'var(--calendar-card-weather-event-max-lines)',
      );
      expect(declared(selector, 'overflow')).toBe('hidden');
    });

    /*
     * The separators, corrected twice. The row is one composed string that breaks
     * like running text: the middot ends a line and the words that follow it start the
     * next one. Getting that means the separator has to be *in* the text, which is the
     * opposite of what the previous version did, so the three tests below pin the three
     * halves of the mechanism separately: what the glyph is, that it is in flow and
     * spaced by margins, and where the one break opportunity sits relative to it.
     */
    it('separates the text pieces with a middot', () => {
      const selector = '.time-location .event-weather .event-weather-text > span + span::before';

      // A middot, not a comma: Home Assistant's own condition vocabulary contains
      // "Clear, night", and a comma separator would be indistinguishable from it.
      // Two invisible characters travel with it — asserted on their own below, because
      // each one carries a distinct guarantee and a reader should not have to decode a
      // string of escapes to find out which.
      expect(declared(selector, 'content')).toContain('·');
    });

    it('keeps the separator in the text, spaced by margins rather than positioned', () => {
      // The maintainer's report: `29° · UV0` / `· Teilweise bewölkt` — the dot
      // travelling down with the words it introduces. It did that because it was an
      // absolutely positioned `::before` painted at its chip's origin, so when the chip
      // wrapped the dot wrapped with it, and the break opportunity (a `::after` on the
      // *previous* chip) sat in front of the dot rather than behind it.
      //
      // In flow it is ordinary inline content and the row breaks as one string. The
      // gaps are margins because a margin is not a break opportunity: that is what keeps
      // the dot attached to the chip before it. See the block comment in styles.ts.
      const dot = '.time-location .event-weather .event-weather-text > span + span::before';
      const chip = '.time-location .event-weather .event-weather-text > span + span';

      expect(declared(dot, 'position')).toBe('');
      expect(declared(dot, 'margin-inline-start')).toBe('4px');
      expect(declared(dot, 'margin-inline-end')).toBe('4px');

      // And the machinery the absolute version needed is gone rather than left behind:
      // a surviving gutter would sit on top of the margins and double one gap.
      expect(declared(chip, 'padding-inline-start')).toBe('');
      expect(declared(chip, 'position')).toBe('');
      expect(declared(dot, 'width')).toBe('');
      expect(declared(dot, 'text-align')).toBe('');
    });

    it('spaces the weather separator exactly as the countdown separator', () => {
      // The maintainer's ruling: one spacing for both rows, so a countdown and a
      // weather condition in the same event punctuate identically. Both now state it the
      // same way, as a plain 4px margin — which is also what makes it exact. The gutter
      // this replaced centred the glyph inside `2 * 4px + 0.28em`, and 0.28em is only an
      // estimate of a middot: measured live at 20px text the glyph is 5.21px against the
      // 5.6px reserved, so each gap came out at 4.195px rather than 4px.
      const gap = declared('.column-events .time-countdown::before', 'margin-inline-end');
      const dot = '.time-location .event-weather .event-weather-text > span + span::before';

      expect(gap).toBe('4px');
      expect(declared(dot, 'margin-inline-start')).toBe(gap);
      expect(declared(dot, 'margin-inline-end')).toBe(gap);
      expect(declared('.column-events .time', 'column-gap')).toBe(gap);
    });

    it('stops hyphenating the generated condition, and only that', () => {
      // `.content-container` sets `hyphens: auto` for the card, which is right for text
      // a user wrote and wrong for a translated condition -- it produced `Sun-`/`ny`.
      // `manual` rather than `none`, so an explicit soft hyphen is still honoured.
      expect(declared('.time-location .event-weather .weather-condition', 'hyphens')).toBe(
        'manual',
      );
      expect(declared('.content-container', 'hyphens')).toBe('auto');
      expect(declared('.location span', 'hyphens')).toBe('');
    });

    it('wraps the row rather than squeezing its last chip', () => {
      // The cause of every narrow-column defect in the row. The condition is the only
      // shrinkable item, so without wrapping a track too narrow for the whole row
      // squeezed that one chip -- measured at width 0 on a 100px track -- and everything
      // that then went wrong went wrong *inside* it. Flex resolves wrapping before
      // shrinking, so the chip now moves to a line of its own at full width instead.
      expect(declared('.time-location .event-weather', 'flex-wrap')).toBe('nowrap');
    });

    it('hangs the wrapped row under the temperature, not under the icon', () => {
      // The padding reserves the icon gutter on every line; the icon's matching negative
      // margin collapses its own margin box to nothing so the first line is unmoved and
      // it still paints in that gutter. The two must be exact opposites or the row is
      // indented by the difference.
      const gutter = declared('.time-location .event-weather', 'padding-inline-start');
      const pull = declared('.time-location .event-weather ha-icon', 'margin-inline-start');

      expect(gutter).toBe('calc(var(--calendar-card-weather-event-icon-size, 14px) + 4px)');
      expect(pull).toBe(`calc(-1 * (${inner(gutter)}))`);
    });

    it('cannot reach the list view badge', () => {
      // The scoping is the whole safety argument for a change made in CSS: a bare
      // `.event-weather span + span::before` would separate the title-row badge too,
      // which is a layout the maintainer has frozen.
      const separators = RULES.filter((rule) =>
        rule.selectors.some((s) => s.includes('span + span::before')),
      );

      expect(separators).toHaveLength(1);
      expect(separators[0].selectors).toEqual([
        '.time-location .event-weather .event-weather-text > span + span::before',
      ]);
    });

    it('lets a long condition break rather than escape its column', () => {
      // The reported bug, and every part of its diagnosis is a trap worth pinning.
      //
      // At a larger `weather.event.font_size` a German condition ran sideways out of its
      // own column and into the next one, with `Regnerisch` appearing to be cut off
      // mid-word. Nothing was clipping it: at the default `max_lines: 0` the display
      // property resolves to `inline`, and `overflow` does not apply to a non-replaced
      // inline box, so the `overflow: hidden` on the condition is inert exactly when the
      // bug appears. The text genuinely left the column and the neighbour painted over
      // it. Set `max_lines` and the element becomes a `-webkit-box`, `overflow` starts
      // applying and the symptom hides itself -- which is why this asserts the default.
      //
      // The declaration is on the *wrapper*, and that placement is the fix rather than an
      // implementation detail. The three chips carry no white space between them, so
      // `UV0Regnerisch` is one unbreakable run for line-breaking purposes and the break
      // the browser needs falls on characters belonging to the previous chip;
      // `overflow-wrap` is consulted where the break is attempted, so it has to be in
      // effect there too. Measured live at a 98px row and 20px text, worst overhang past
      // the row box: 113.3px with `normal`, 26.6px with `break-word` on the condition
      // alone, -0.8px with it on the wrapper.
      expect(declared('.time-location .event-weather .event-weather-text', 'overflow-wrap')).toBe(
        'break-word',
      );

      // And nothing narrower may quietly override it back. `overflow-wrap` is inherited,
      // so a `normal` on the condition would re-break exactly the case above.
      expect(declared('.time-location .event-weather .weather-condition', 'overflow-wrap')).toBe(
        '',
      );
      expect(declared('.time-location .event-weather .weather-condition', 'display')).toBe(
        'var(--calendar-card-weather-event-condition-display)',
      );
    });

    it('pairs break-word with a separator glued to the chip before it', () => {
      // These declarations are a pair, and this test is the pairing. The previous
      // version of it paired `break-word` with `position: absolute`, on the grounds
      // that a dot out of flow "is not part of any character sequence a break can land
      // inside". That was true, and it also produced the defect the maintainer then
      // reported: the dot travelled to the next line with its chip.
      //
      // In flow, the guarantee comes instead from the *absence of a legal break
      // opportunity* in front of the dot. The gaps are margins, and a margin is not a
      // break opportunity; the word joiner U+2060 forbids one at the character level as
      // well. Measured live: the dot leads a line of words 0 times across 539 rows at
      // seven viewport widths and every weather font size from 8px to 26px, against 444
      // for the mechanism this replaced, on the same rows at the same widths.
      //
      // 🚨 It is *not* an absolute guarantee, and the comment here said it was until the
      // sweep found the counter-example. `break-word` still takes an emergency break at
      // an arbitrary point when the run between two legal opportunities cannot fit a line
      // by itself, so below roughly 30px of column at 12px text the glyph can be pushed
      // onto a line of its own. See the block comment in styles.ts for the measurements
      // in that regime and why the trade is the right way round.
      const dot = '.time-location .event-weather .event-weather-text > span + span::before';
      const content = declared(dot, 'content');

      // U+2060 WORD JOINER, immediately before the glyph.
      expect(content).toContain('\\2060·');
      expect(declared(dot, 'margin-inline-start')).toBe('4px');
      expect(declared('.time-location .event-weather .event-weather-text', 'overflow-wrap')).toBe(
        'break-word',
      );
    });

    it('puts the one break opportunity after the dot, not in front of it', () => {
      // This is the fix, stated as narrowly as it can be. The row's template emits no
      // white space between the three spans, so every break opportunity in it is
      // generated — which means the *order of the characters in this one string* decides
      // which side of the middot a line ends on.
      //
      //   `\2060·\200B`   ->  `29° · UV0 ·` / `Teilweise bewölkt`   (wanted)
      //   `\200B·`        ->  `29° · UV0`   / `· Teilweise bewölkt` (the reported bug)
      //
      // U+200B is line-break class ZW, which provides an opportunity *after* itself, so
      // putting it last keeps the whole `::before` — glyph and trailing margin — on the
      // line it started, and the next chip's text begins the next line flush with the
      // row's hanging indent. A `::before` split across the break would put its 4px end
      // margin at the start of the continuation line instead, indenting that one line
      // and no other.
      //
      // Falsifier: delete the trailing `\200B` and the row has no legal break between
      // chips at all, so `overflow-wrap: break-word` falls back to emergency breaks and
      // severs chips mid-token — measured at a 98px row and 20px text as
      // `30°` / `UV` `7 · Sonni` / `g`.
      const dot = '.time-location .event-weather .event-weather-text > span + span::before';

      expect(declared(dot, 'content')).toMatch(/·\\200B'$/);

      // And nothing puts one back in front of the dot. The previous mechanism carried a
      // zero-width space on `span::after`, which sits *before* the following chip's
      // separator — exactly the ordering the bug report describes.
      expect(
        declared('.time-location .event-weather .event-weather-text > span::after', 'content'),
      ).toBe('');

      // Stated over the whole stylesheet rather than over this one rule, because the
      // defect was a zero-width space in the wrong *place*, not a missing one. Exactly two
      // rules may carry one — this separator and the folded countdown's — and in both it
      // must be the last character, behind the glyph. A third rule, or either of these two
      // growing a leading one, fails here.
      const zwsp = RULES.filter((rule) => rule.body.includes('\\200B'));

      expect(zwsp.flatMap((rule) => rule.selectors).sort()).toEqual([
        '.time .time-actual .time-text > .time-countdown::before',
        '.time-location .event-weather .event-weather-text > span + span::before',
      ]);
      for (const rule of zwsp) {
        expect(rule.body).toMatch(/content:\s*'\\2060·\\200B'/);
      }
    });

    it('resets the two properties the UV index sets for the title row', () => {
      // The margin is the title row's only separator and doubles up with the one
      // above. The weight is the same reset .time-location .event-weather already
      // performs on the container -- `font-weight: normal` is inherited, so a
      // descendant declaring 500 outright still won, leaving the UV index the only
      // semi-bold text in the event block.
      const selector = '.time-location .event-weather .weather-uv-index';

      expect(declared(selector, 'margin-inline-start')).toBe('0');
      expect(declared(selector, 'font-weight')).toBe('normal');
      expect(declared('.event-weather .weather-uv-index', 'margin-left')).toBe('2px');
    });

    it('relies on the list header being a flex container, which discards whitespace', () => {
      // renderDateWeather emits no whitespace between its parts, which is what stops
      // the column view's grid item rendering a phantom space before the temperature.
      // The list view never showed that space because this container is flex and a
      // whitespace-only anonymous flex item is not rendered -- so if this ever stops
      // being flex, the removal above stops being invisible there too.
      expect(declared('.date-column .weather', 'display')).toBe('flex');
      expect(declared('.column-date-content .weather', 'display')).toBe('');
    });

    it('reads weather size and colour from the emitted custom properties', () => {
      expect(declared('.date-column .weather', 'font-size')).toBe(
        'var(--calendar-card-weather-date-font-size, 12px)',
      );
      expect(declared('.date-column .weather', 'color')).toBe(
        'var(--calendar-card-weather-date-color, var(--primary-text-color))',
      );
      expect(declared('.date-column .weather ha-icon', '--mdc-icon-size')).toBe(
        'var(--calendar-card-weather-date-icon-size, 14px)',
      );
      expect(declared('.event-weather ha-icon', '--mdc-icon-size')).toBe(
        'var(--calendar-card-weather-event-icon-size, 14px)',
      );
      expect(declared('.time-location .event-weather .event-weather-text', 'color')).toBe(
        'var(--calendar-card-weather-event-color, var(--secondary-text-color))',
      );
      expect(declared('.time-location .event-weather', 'font-size')).toBe(
        'var(--calendar-card-weather-event-font-size, 12px)',
      );
    });

    it('sizes the weather row itself, so its strut matches the chips it holds', () => {
      // line-height is relative, so the size has to land on the row and not only on
      // the leaf chips. Left at the inherited event font size (14px) the row builds a
      // 16.8px strut around 12px text; under `align-items: flex-start` the glyphs then
      // sit ~2px below the icon and the row reads as misaligned next to .time and
      // .description. Those two line up precisely because they size their own row, so
      // the invariant is that every icon-bearing event row does.
      for (const selector of [
        '.time',
        '.location',
        '.description',
        '.time-location .event-weather',
      ]) {
        expect(declared(selector, 'font-size')).not.toBe('');
      }
    });
  });

  describe('the progress bar and countdown in column view', () => {
    /*
     * The two are strictly mutually exclusive -- `getCountdownString` returns null
     * once the event has started, `progressPercentage` is non-null only while it is
     * running -- which is what lets them be treated asymmetrically without ever
     * producing a visually inconsistent event. The countdown stays inline with the
     * time; the bar takes a row of its own. Neither half is visible to a DOM test on
     * the countdown side, and the width strategy is not visible to one at all.
     */

    it('gives each placement its own width fallback', () => {
      // The whole reason DEFAULT_CONFIG.progress_bar_width had to become absent. A
      // shipped default is merged in before render, so by the time CSS sees the value a
      // width the user chose and one they never touched are the same string -- and the
      // row would be pinned to the inline bar's 60px for everybody.
      expect(declared('.progress-bar', 'width')).toBe(
        'var(--calendar-card-progress-bar-width, 60px)',
      );
      expect(declared('.progress-bar-row', 'width')).toBe(
        'var(--calendar-card-progress-bar-width, 80%)',
      );
    });

    it('reads one custom property from both placements, so a set width is a width', () => {
      // "A plain width, not a maximum" was the ruling. Both fallbacks hang off the same
      // property, so a user-set value replaces both -- top level for every view, inside
      // `column:` for one. Two properties would have made a set width mean two things.
      const widths = ['.progress-bar', '.progress-bar-row'].map((s) => declared(s, 'width'));

      for (const width of widths) {
        expect(width).toContain('var(--calendar-card-progress-bar-width,');
      }
    });

    it('declares the row modifier after the base rule it has to beat', () => {
      // Both selectors are a single class, so specificity is tied and source order
      // decides. `.progress-bar` sets `margin-inline-start: auto` and a 60px width; the
      // modifier overrides both. Declared first it would silently lose, and the symptom
      // would be a right-aligned 60px bar sitting on its own row -- which reads as the
      // bug the row placement exists to fix rather than as a regression.
      const base = RULES.findIndex((rule) => rule.selectors.includes('.progress-bar'));
      const modifier = RULES.findIndex((rule) => rule.selectors.includes('.progress-bar-row'));

      expect(base).toBeGreaterThanOrEqual(0);
      expect(modifier).toBeGreaterThan(base);
    });

    it('keys the row on the placement, not on the view', () => {
      // `.progress-bar-row` is emitted by a placement parameter, so it must be styled
      // unqualified. Scoping it under `.column-events` would tie a *placement* to a
      // *view*, and a future layout that asks for the row would silently get the inline
      // styling. Same reasoning as the named view predicates, one level down.
      const rules = RULES.filter((rule) =>
        rule.selectors.some((selector) => selector.includes('progress-bar-row')),
      );

      expect(rules).toHaveLength(1);
      expect(rules[0].selectors).toEqual(['.progress-bar-row']);
    });

    it('sits flush left, aligned with the title above it', () => {
      // The bar spans a row between the title and the time, so it reads as an indicator
      // for the whole event. Indenting it to the time text would align it with the row
      // *below* it, which is the weaker reading. `.progress-bar`'s auto start margin is
      // what would otherwise push it right, so it has to be zeroed explicitly.
      expect(declared('.progress-bar-row', 'margin-inline-start')).toBe('0');
    });

    it('left-aligns the countdown instead of stranding it at the right edge', () => {
      // The reported defect. `margin-inline-start: auto` plus `justify-content:
      // space-between` put the countdown at the far right of a second line that was
      // otherwise empty once the column got too narrow to hold both. Both have to go:
      // zeroing the margin alone would leave space-between doing the same job.
      expect(declared('.column-events .time-countdown', 'margin-inline-start')).toBe('0');
      expect(declared('.column-events .time', 'justify-content')).toBe('flex-start');
    });

    it('hangs the wrapped countdown under the time text, not under the icon', () => {
      // Left-aligning it was the original fix and it landed the countdown under the *icon*.
      // The maintainer wants the middot directly below the first digit of the time, so
      // the row reserves the icon gutter as padding on every line and the wrapper that
      // holds the icon is pulled back by exactly that much -- the icon still paints in
      // the gutter, the first line is unmoved, and a wrapped line starts at the text.
      //
      // The negative margin goes on `.time-actual` rather than on the icon because the
      // icon is nested inside that wrapper, not a child of `.time`. The two values must
      // be exact opposites or every row is indented by the difference.
      const gutter = declared('.column-events .time', 'padding-inline-start');

      expect(gutter).toBe('calc(var(--calendar-card-icon-size-time, 14px) + 4px)');
      expect(declared('.column-events .time-actual', 'margin-inline-start')).toBe(
        `calc(-1 * (${inner(gutter)}))`,
      );

      // Reserving the gutter has to be paid for out of the border box, or `width: 100%`
      // plus the padding overflows the column by exactly the indent.
      expect(declared('.column-events .time', 'box-sizing')).toBe('border-box');
    });

    it('marks the join with a middot, and cannot reach the list view', () => {
      // Generated content rather than a character in the string, because the countdown
      // strings are translated -- 35 languages would each need the punctuation baking in,
      // and every one would then carry it in list view too.
      //
      // There are two such rules now, one per placement, and the invariant is about all
      // of them: neither may be reachable from the list view. The column-scoped one
      // serves the `show_time: false` case where the countdown is still a trailing div;
      // the `.time-text` one serves the folded case. `.time-text` is emitted only by
      // `countdownPlacement: 'text'`, so that rule is placement-scoped by construction
      // rather than by a class anyone has to remember to keep in the selector.
      const selector = '.column-events .time-countdown::before';

      expect(declared(selector, 'content')).toBe("'·'");
      expect(declared(selector, 'margin-inline-end')).not.toBe('');

      const rules = RULES.filter((rule) =>
        rule.selectors.some((s) => s.includes('.time-countdown::before')),
      );
      expect(rules).toHaveLength(2);
      for (const rule of rules) {
        for (const s of rule.selectors) {
          expect(
            s.includes('.column-events') || s.includes('.time-text'),
            `${s} is reachable from the list view`,
          ).toBe(true);
        }
      }
    });

    it('keeps the countdown from breaking mid-phrase in list view, and lets it wrap here', () => {
      // The list view keeps its single line: the event cell is as wide as the card, so
      // there is nothing for wrapping to buy there.
      expect(declared('.time-countdown', 'white-space')).toBe('nowrap');

      // The column releases it, and that is the indent above paying its own bill.
      // Reserving the gutter costs the wrapped countdown 18px of the line it lands on,
      // and a nowrap box cannot give that back -- measured at a 90px track, `in 10
      // hours` needed 68.7px against 56px of room and overflowed the column by 10.7px.
      //
      // The nowrap existed to stop the separator being orphaned at the end of a line,
      // and that job now belongs to the word joiner in the folded separator's own
      // content. The argument this comment used to make -- that there is no whitespace
      // between the middot and the first word, so the only break opportunities are the
      // spaces inside the phrase -- was true only for Latin scripts; see the separator
      // rule for the per-script measurements.
      expect(declared('.column-events .time-countdown', 'white-space')).toBe('normal');
    });

    /*
     * 🚨 The alignment trap, and a correction to the specification that describes it.
     *
     * The column-view design proposed dropping `display: flex` from `.time` so the time and
     * countdown would participate in inline flow, and warned that inline flow ignores
     * `align-items`, so `--calendar-card-event-icon-vertical-alignment` would stop
     * reaching this row and would have to be re-expressed as `vertical-align`.
     *
     * Two things are wrong with that. The smaller one: the property does not reach `.time`
     * today either. The shared `.time, .location, .description` rule sets it, and `.time`'s
     * own later rule -- same specificity, so source order wins -- hardcodes
     * `align-items: center` straight over the top. So the value is already inert on this
     * row, in both views, and has been. That is pre-existing and deliberately left alone:
     * changing it would move the list view, which the column work may not do.
     *
     * The larger one: the icon is not a child of `.time` at all, it is nested inside
     * `.time-actual`. Nothing declared on `.time` has ever positioned the time icon
     * against the time text. Where the property genuinely works is `.location`,
     * `.description` and -- since the time row gained its own flex wrapper --
     * `.time-actual`, whose icon and text are direct flex children. That is what the first
     * assertion below pins, and the icon-alignment block further down pins the third.
     *
     * What dropping the flex would actually have broken is worse than the trap named:
     * `.time-actual` is a block-level flex container, so in inline flow it and the
     * countdown would have stacked vertically instead of sharing a line -- the exact
     * layout the design rejected. It was built as flex instead, which is why nothing here
     * needed re-expressing.
     *
     * The countdown reached the same destination by the other road. Rather than dissolve
     * the flex, it moved *inside* `.time-actual` and into a `.time-text` wrapper, so the
     * flex row survives with two items -- icon and text -- and the wrapping happens in the
     * wrapper's own inline formatting context. `align-items` therefore keeps applying, and
     * now applies to something worth aligning against: two lines rather than one.
     */
    it('leaves the configured icon alignment working where it actually applies', () => {
      expect(declared('.location', 'align-items')).toBe(
        'var(--calendar-card-event-icon-vertical-alignment)',
      );
      expect(declared('.description', 'align-items')).toBe(
        'var(--calendar-card-event-icon-vertical-alignment)',
      );
    });

    it('changes neither the layout mode nor the alignment of the time row', () => {
      // The invariant: column view adds no `display` or `align-items` override, so the
      // row resolves identically in both views and whatever the shared rules decide keeps
      // deciding. This is what fails if a future change reaches for inline flow.
      expect(declared('.time', 'display')).toBe('flex');
      expect(declared('.column-events .time', 'display')).toBe('');
      expect(declared('.column-events .time', 'align-items')).toBe('');
    });

    it('keeps .time-actual a flex container, which is what makes the row work at all', () => {
      // Two things depend on it. `.time .time-actual > span:not(.time-text)` clamps with a
      // literal -webkit-box, which is only safe while its parent blockifies it (see the
      // blockification trap above). And in inline flow this box is block-level, so it
      // would take a line of its own and push the countdown off the row entirely.
      expect(declared('.time-actual', 'display')).toBe('flex');
      expect(declared('.column-events .time-actual', 'display')).toBe('');
    });

    /*
     * The countdown as running text, and the three declarations that make it one.
     *
     * The layout proof is not here and cannot be: happy-dom has no layout engine, so
     * nothing in this suite can observe a line break. These pin the *mechanism*, which is
     * the part that regresses silently; the wrapping itself is measured in a browser
     * against the real stylesheet.
     */
    it('gives the folded countdown one inline formatting context to break inside', () => {
      // The wrapper is a shrinkable flex item, exactly as `.event-weather-text` is, and
      // `min-width: 0` is the load-bearing half. A flex item's automatic minimum size is
      // its min-content width, and CSS Text 3 exempts `overflow-wrap: break-word` from
      // intrinsic sizing -- so without this a single long word refuses to shrink and
      // pushes the row out of the column instead of breaking inside it.
      expect(declared('.time .time-actual .time-text', 'min-width')).toBe('0');
      expect(declared('.time .time-actual .time-text', 'flex')).toBe('1 1 auto');
    });

    it('puts both pieces back into inline flow inside that wrapper', () => {
      // `.time span` blockifies every span in these rows to `inline-block`, which is
      // atomic: it cannot break across lines, so a countdown left at that value could
      // still only move as a whole -- the original defect, one level in. The time carries
      // the custom property so a configured limit can still turn it into the `-webkit-box`
      // its clamp requires; the countdown is never a clamp target and is literally inline.
      expect(declared('.time .time-actual .time-text > span', 'display')).toBe(
        'var(--calendar-card-time-display)',
      );
      expect(declared('.time .time-actual .time-text > .time-countdown', 'display')).toBe('inline');
      expect(declared('.time .time-actual .time-text > .time-countdown', 'white-space')).toBe(
        'normal',
      );
    });

    it('never lets a time limit clamp the countdown away', () => {
      // `time_max_lines` limits the time. The clamp rule above is this element's sibling
      // selector, not its parent's, so it reaches the countdown too and has to be switched
      // off again -- otherwise setting a limit would silently delete the countdown rather
      // than shorten the time.
      const selector = '.time .time-actual .time-text > .time-countdown';

      expect(declared(selector, '-webkit-line-clamp')).toBe('none');
      expect(declared(selector, 'overflow')).toBe('visible');
    });

    it('spaces the folded separator evenly on both sides', () => {
      // The wrapper's leading margin against the pseudo-element's trailing one. In the
      // trailing placement `.time`'s column-gap supplied the leading half; inline siblings
      // have no gap to inherit, so the countdown states it itself. Both must match the
      // weather row's 4px or the two rows punctuate differently in the same event.
      const countdown = '.time .time-actual .time-text > .time-countdown';

      expect(declared(countdown, 'margin-inline-start')).toBe('4px');
      expect(declared(`${countdown}::before`, 'margin-inline-end')).toBe('4px');
      expect(declared(`${countdown}::before`, 'content')).toContain('·');

      // And no trailing margin: the base rule's 12px is for a box that ends a row, and
      // inside a phrase it would open a gap before whatever follows.
      expect(declared(countdown, 'margin-inline-end')).toBe('0');
    });

    it('welds the folded separator to the time in every script, not just Latin ones', () => {
      // The countdown's middot was believed to be unbreakable from the time text already,
      // and the comment here said so: "there is no white space between the generated glyph
      // and the first word -- the gap is margin, and a margin is not a break opportunity".
      // Measured across 53 wrapped rows in English and German, that held: 0 cases of the
      // dot leading a continuation line.
      //
      // 🚨 It held because of the *script*, not because of the CSS. The character before
      // the dot was always a digit (UAX #14 class NU) or a Latin letter (AL), and LB23 and
      // LB28 forbid a break between either and the middot (class AI, resolving to AL).
      // Nothing in this rule was doing it. An ideograph is class ID, welded to nothing,
      // and LB31 then permits the break — so in zh-CN and zh-TW, whose all-day strings
      // `formatEventTime` builds out of words ending in one, the dot leads the next line.
      //
      // Measured by forcing the time text and holding everything else fixed, 96 rows per
      // string across five viewport widths, both arms injected so a concurrent deploy of
      // the shared dev bundle could not silently swap them — rows where the dot leads a
      // continuation line, bare middot against this rule:
      //
      //   整天, 明天结束       format.ts:519  ID   16 -> 0
      //   整天, 直到 17. 8月   format.ts:529  ID   36 -> 0
      //   整天                 format.ts:66   ID    0 -> 0
      //   all day, ends tomorrow              AL    0 -> 0
      //
      // The third row is the trap: same script, same class, never reproduces, because two
      // characters never force a break at that junction. Picking it as the representative
      // Chinese case would have cleared the rule and shipped the bug.
      const dot = '.time .time-actual .time-text > .time-countdown::before';

      expect(declared(dot, 'content')).toContain('\\2060·');
    });

    it('lets the folded countdown break after its dot, as the weather row does', () => {
      // The other half, and the reason the maintainer asked for the two rows to match.
      //
      // Without a break opportunity behind the glyph, `20:00 · in` is one unbreakable run:
      // the whole junction moves to the next line together rather than the line ending at
      // the dot, so a narrow column renders `0:00 -` / `20:00 · in 4` / `hours` and wastes
      // the first line. U+200B is class ZW and provides a break *after* itself, so it goes
      // last and the line can end at the dot — 0 rows to 100 across the same sweep, with 0
      // rows in either arm putting the dot alone on a line.
      //
      // Falsifier: delete the trailing `\200B` and the junction welds shut again.
      const dot = '.time .time-actual .time-text > .time-countdown::before';

      expect(declared(dot, 'content')).toMatch(/·\\200B'$/);
    });

    it('does not give the trailing placement the same break opportunity', () => {
      // Deliberately not applied to `.column-events .time-countdown::before`, and this is
      // the difference between the two placements rather than an oversight.
      //
      // Folded, the dot sits at a junction *between* two text runs, so a break after it
      // ends a line that already has the time on it. Trailing, the countdown is its own
      // flex item and the dot is the first thing in it -- a break straight after the glyph
      // would leave it alone at the top of that box, which is the orphan every version of
      // this rule has been trying to avoid. The word joiner would be inert there too:
      // there is no preceding text run in the same inline formatting context to weld to.
      expect(declared('.column-events .time-countdown::before', 'content')).toBe("'·'");
    });
  });

  describe('event icon vertical alignment reaches every row', () => {
    /*
     * `event_icon_vertical_alignment` was inert on the time row in both views, so a
     * user setting `top` or `bottom` got two rows out of three and no indication why.
     *
     * Two things had to be true at once for that to hide. The shared
     * `.time, .location, .description` rule does read the variable — so grepping for it
     * found a hit and the option looked wired up — but `.time`'s own later rule sets
     * `align-items: center` at equal specificity, and source order wins. And even had it
     * applied, `.time`'s children are `.time-actual` plus a countdown or progress bar, so
     * it would have tilted those and left the icon centred regardless: the icon is one
     * level deeper.
     *
     * These tests are written against the *containers whose children are (icon, text)*,
     * which is the property that actually governs the icon, rather than against a list of
     * selectors someone happened to think of.
     */
    const ICON_ROWS = ['.location', '.description', '.time-actual'];

    it.each(ICON_ROWS)('%s aligns its icon from the configured variable', (sel) => {
      expect(declared(sel, 'align-items')).toBe(
        'var(--calendar-card-event-icon-vertical-alignment)',
      );
    });

    it('the time row itself stays centred, which is a different question', () => {
      // Not an oversight: .time lays out siblings, not the icon. Restoring the variable
      // here would tilt the countdown and still leave the icon centred -- the exact
      // half-fix this test exists to prevent.
      expect(declared('.time', 'align-items')).toBe('center');
    });

    it('no icon row hardcodes the alignment it is supposed to read', () => {
      // The original bug in its general form: a literal value silently shadowing the
      // variable. Asserted across all three rather than only the one that regressed.
      for (const sel of ICON_ROWS) {
        expect(declared(sel, 'align-items')).not.toBe('center');
      }
    });
  });

  describe('date column vertical alignment reaches the date cell', () => {
    /*
     * The sibling of the icon-alignment bug above, and the half nobody guarded. When the
     * icon option
     * was pinned end to end, `date_vertical_alignment` -- the older option the icon one
     * was modelled on -- kept a single assertion on its default value and nothing at all
     * on its wiring.
     *
     * Both ends could therefore be severed with every gate green: `styles.ts` could stop
     * reading the user's config and hardcode a value, or this rule could lose its
     * `vertical-align` outright, and `npm test`, `check:docs`, `build` and `check:bundle`
     * all still passed. The option is documented as controlling how a date sits against
     * its day's events, so either break is silent and plainly visible to the user.
     */
    it('the date cell aligns from the configured variable', () => {
      expect(declared('.date-column', 'vertical-align')).toBe(
        'var(--calendar-card-date-column-vertical-alignment)',
      );
    });

    it('does not hardcode the alignment it is supposed to read', () => {
      // That failure mode in its general form. Worth asserting separately here because
      // `.date-column` is a table cell, whose initial `vertical-align` is `baseline`: a
      // literal `middle` would look like a sensible default and silently pin every
      // list-view row to one alignment.
      expect(declared('.date-column', 'vertical-align')).not.toBe('middle');
    });
  });

  describe('single-declaration invariants', () => {
    it.each(['.event-title', '.summary'])('%s is declared exactly once', (selector) => {
      // Both were split across two blocks at some point, which made the winning
      // value depend on source order. One block per element means a reader sees
      // the whole element in one place.
      expect(rulesFor(selector)).toHaveLength(1);
    });
  });
});

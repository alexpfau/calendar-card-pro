import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';
import * as Helpers from '../src/utils/helpers';

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
      ['.time .time-actual > span:not(.time-text):not(.allday-badge)', '.time-actual'],
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

    it('excludes the all-day badge from the countdown clamp', () => {
      // The second exception, and unlike .time-text it was found the hard way. The badge is
      // deliberately a direct child of .time-actual -- putting it inside .time-text would
      // clamp it -- but that placement is *exactly* the shape the clamp selector describes,
      // so it matched the badge too. At four classes it also outranks the badge's own
      // one-class rule, so it won silently: the pill computed display: -webkit-box, which
      // cannot show a text-overflow ellipsis, while -webkit-line-clamp: none meant no clamp
      // ellipsis either. A pill too narrow for its label was cut off flat, mid-word, with no
      // mark that anything had been dropped -- and every gate stayed green, because the DOM
      // does not move and the custom-property values do not change.
      //
      // Assert the exclusion is present in the selector rather than the resulting computed
      // display, because there is no computed display to read here: this file reads source
      // text. Dropping the :not() reintroduces the bug in full silence otherwise.
      expect(cardStyles.cssText).toContain(
        '.time .time-actual > span:not(.time-text):not(.allday-badge)',
      );
      expect(cardStyles.cssText).not.toMatch(/\.time \.time-actual > span:not\(\.time-text\)\s*\{/);
    });

    it('lets a badge row shrink below the pill, which is what makes the ellipsis reachable', () => {
      // .time-actual is a flex item, so it defaults to min-width: auto -- its min-content
      // width. A nowrap pill has no soft break, so its min-content width is the whole label,
      // and .time-actual therefore refuses to go narrower than the label however narrow the
      // card gets. Measured on a live card with the host forced from 1180px to 110px:
      // .event-content shrank to 35px, .time followed, and .time-actual stayed at 281px and
      // hung out of the card. max-width: 100% on the pill cannot help, because 100% resolves
      // against a parent the pill is itself sizing.
      expect(declared('.time .time-actual:has(.allday-badge)', 'min-width')).toBe('0');
    });

    it('centres a badge row rather than following event_icon_vertical_alignment', () => {
      // The pill is sized from its own font and the icon from time_icon_size, so raising
      // time_font_size makes the pill the taller of the two and flex-start hangs the icon off
      // its top edge. At the 12px default the two heights match and centre and flex-start are
      // indistinguishable, which is why this only shows up once someone scales the type.
      expect(declared('.time .time-actual:has(.allday-badge)', 'align-items')).toBe('center');
      expect(declared('.time-actual', 'align-items')).toBe(
        'var(--calendar-card-event-icon-vertical-alignment)',
      );
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
      [
        '.time .time-actual > span:not(.time-text):not(.allday-badge)',
        '--calendar-card-time-max-lines',
      ],
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
      // Two things depend on it. `.time .time-actual > span:not(.time-text):not(.allday-badge)` clamps with a
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

  describe('the badge/countdown separator, and the specificity it once lost on', () => {
    /*
     * Two declarations that had no guard at all. Both were verified null: setting the reset
     * to 4px, and reverting the badge's own margin to 4px, each left the whole suite green.
     *
     * That is acute here rather than merely untidy, because the rule's own comment records
     * that an EARLIER attempt at this same fix lost on specificity and "silently changed
     * nothing -- a fix that typechecked, built, deployed and did nothing". The documented
     * silent-failure mode was the one with no test.
     */
    it('drops the countdown lead-in when a badge precedes it', () => {
      expect(
        declared(
          '.time .time-actual .allday-badge + .time-text > .time-countdown',
          'margin-inline-start',
        ),
      ).toBe('0');
    });

    it('gives the badge the margin its own comment derives', () => {
      // 5px against the separator dot's 4px on the far side, because a drawn box has no right
      // side bearing where digits do. Pinned so the derivation and the number stay together.
      expect(declared('.allday-badge', 'margin-inline-end')).toBe('5px');
    });

    it('out-ranks the rule the earlier attempt lost to', () => {
      // Specificity, counted as classes: the badge selector must beat
      // `.time .time-actual .time-text > .time-countdown`. Compared rather than asserted as a
      // number, so the check survives either selector being rewritten.
      const classes = (selector: string) => (selector.match(/\.[a-z-]+/g) ?? []).length;

      expect(
        classes('.time .time-actual .allday-badge + .time-text > .time-countdown'),
      ).toBeGreaterThan(classes('.time .time-actual .time-text > .time-countdown'));
    });

    it('pins the cap-centring padding, not just that trimming happens', () => {
      // The @supports block's own comment spends a paragraph deriving 0.3295em from
      // (1.37 - 0.711) / 2, and nothing held the result: changing it to 0.32em left the suite
      // green. The existing test asserts the properties and the scope, never the value.
      const trim = cardStyles.cssText.slice(cardStyles.cssText.indexOf('text-box-trim: trim-both'));
      expect(trim.slice(0, trim.indexOf('}'))).toContain('padding-block: 0.3295em');
    });
  });

  describe('the all-day badge is sized by its own font, not by the clock icon', () => {
    /*
     * The pill's height was `line-height: calc(var(--calendar-card-icon-size-time, 14px)
     * - 0.12em)` -- pinned to the icon so that the two boxes would line up. That holds only
     * while the two happen to be similar, and they stop being similar the moment anyone
     * touches `time_font_size`, which moves the label and leaves the icon alone. At 20px the
     * label rendered at 17px inside a box still fixed at 14px and spilled out of the shape.
     *
     * The suite could not see it. `list-dom` serializes DOM and a stylesheet change moves no
     * attribute; `allday-badge.test.ts` asserts class names; and every one of them runs at
     * the default `time_font_size`, where the icon-pinned box and the font-derived box give
     * the same answer. This describe block is the reconciliation: it asserts the pill's box
     * is a function of the pill, so re-pinning it to anything that does not scale with the
     * type fails here instead of on someone's dashboard.
     */
    it('does not derive any part of its box from the time icon size', () => {
      // Read `.body` and not the rule object. The first version of this test did
      // `expect(rulesFor('.allday-badge')[0]).not.toContain(...)`, which passes against an
      // object no matter what the CSS says -- it survived a mutation that put the icon
      // variable straight back into this rule, which is the whole thing it exists to stop.
      const body = rulesFor('.allday-badge')[0]?.body ?? '';
      expect(body).not.toBe('');
      expect(body).not.toContain('--calendar-card-icon-size-time');
    });

    it('states its line box and padding in em, so both track the font', () => {
      // em resolves against the badge's own font-size, which is itself an em of the time
      // font -- so the whole pill is one multiplier away from `time_font_size` and needs no
      // key of its own. Measured live: 13.95px at 12px, 23.27px at 20px, 32.59px at 28px,
      // a constant 1.164x of the configured size.
      expect(declared('.allday-badge', 'font-size')).toBe('0.85em');
      expect(declared('.allday-badge', 'line-height')).toBe('1.05');
      expect(declared('.allday-badge', 'padding-block')).toMatch(/^[\d.]+em [\d.]+em$/);
      expect(declared('.allday-badge', 'padding-inline')).toMatch(/em$/);
    });

    it('keeps the label on one line and clips it with an ellipsis', () => {
      // All four are required together and each is load-bearing. Without nowrap French wraps
      // and the text leaves the shape; without overflow: hidden the ellipsis never appears;
      // without max-width the pill has nothing to clip against; without inline-block the
      // ellipsis does not apply at all.
      expect(declared('.allday-badge', 'white-space')).toBe('nowrap');
      expect(declared('.allday-badge', 'overflow')).toBe('hidden');
      expect(declared('.allday-badge', 'text-overflow')).toBe('ellipsis');
      expect(declared('.allday-badge', 'display')).toBe('inline-block');
      expect(declared('.allday-badge', 'max-width')).toBe('100%');
      expect(declared('.allday-badge', 'min-width')).toBe('0');
      // Without border-box, max-width caps the content and the inline padding is added
      // outside it, so a pill clamped to its container is still wider than the container.
      // Measured in a column cell: 1.19px past the right edge, against 12.00px inside it
      // with border-box. The card sets box-sizing per element, not globally, so the default
      // here really is content-box and this is not redundant.
      expect(declared('.allday-badge', 'box-sizing')).toBe('border-box');
    });

    it('keeps a pilled title on the same rhythm as an unpilled one', () => {
      // An inline-block with overflow: hidden takes its baseline from its BOTTOM MARGIN EDGE,
      // not from the text inside it. That rule exists so a scrollable box does not hang its
      // last line into the paragraph below, and here it hung the WHOLE pill above the text
      // baseline: the summary row grew from 22.39px to 31.50px and the gap from the title's
      // text down to the time row went 5.59px -> 11.77px, reported as double spacing.
      //
      // vertical-align: middle re-centres the pill on the text; the negative block margin
      // hands back the height the capsule borrowed, because for an atomic inline the line box
      // measures the margin box. Measured after: the text-to-text gap matches a row with no
      // pill exactly at 14px and 22px, and is within one pixel of it at 18px and 28px, which
      // is line-box snapping rather than the rule.
      //
      // Both are asserted because either alone leaves most of the gap: middle on its own gets
      // 11.77px to 7.97px against a 5.59px target.
      expect(declared('.allday-title-pill', 'vertical-align')).toBe('middle');

      const pull = declared('.allday-title-pill', 'margin-block');
      expect(pull).toMatch(/^-[\d.]+em$/);

      // In em, so it tracks event_font_size the way the pill it corrects does. A px value
      // would be right at one size and wrong at every other.
      expect(declared('.allday-title-pill', 'padding-block')).toMatch(/em$/);

      // The badge is a flex item of .time-actual, not an inline, so none of this applies to
      // it -- and applying it would misalign it against the clock icon.
      expect(declared('.allday-badge', 'vertical-align')).toBe('');
      expect(declared('.allday-badge', 'margin-block')).toBe('');
    });

    it('keeps its capsule radius, so a clipped pill is still a pill', () => {
      // The degrade at a very narrow column is a pill reading a few characters and an
      // ellipsis -- not a rectangle, and not nothing.
      expect(declared('.allday-badge', 'border-radius')).toBe('999px');
    });
  });

  describe('the two badge positions share one pill', () => {
    /*
     * `allday_badge` names a position and `allday_badge_style` names a treatment, so the
     * five treatments have to mean the same thing at both. The stylesheet does that by
     * declaring the box and the colour derivations ONCE against both selectors, and giving
     * each position only the type decisions that genuinely differ.
     *
     * The list below is ALLDAY_BADGE_STYLES itself, not a second copy of it, so a sixth
     * treatment added there and given no rule fails here instead of rendering unstyled.
     *
     * It was a hand-written literal of the same five when first written, and the comment
     * above it claimed exactly the property it did not have. Planting a sixth treatment in
     * the constant left the WHOLE suite green at 3195 passed -- only `check:docs` noticed,
     * and that only because it reconciles the docs table against the constant. This is the
     * `Object.keys(TABLE)` trap wearing a different hat: a literal that duplicates a table
     * reads as a reconciliation and is one only by coincidence, for as long as nobody edits
     * the table.
     */
    it.each(Helpers.ALLDAY_BADGE_STYLES)(
      'declares %s once, under a name tied to neither position',
      (style) => {
        // A treatment class named for one position would either be a lie at the other or
        // force a duplicate rule -- and a duplicate is how a treatment ends up correct in
        // the time row and stale on the title.
        expect(rulesFor(`.allday-pill-${style}`).length).toBeGreaterThan(0);
        expect(rulesFor(`.allday-badge-${style}`)).toHaveLength(0);
        expect(rulesFor(`.allday-title-pill-${style}`)).toHaveLength(0);
      },
    );

    it('declares a rule for exactly the treatments that exist, and no others', () => {
      // The it.each above iterates ALLDAY_BADGE_STYLES, which closes the ADDITION direction
      // -- a sixth treatment with no rule fails it. It cannot close removal: the loop is
      // derived from the table under test, so deleting a member deletes the assertion rather
      // than failing it. Removing 'subtle' took this file from 92 tests to 91 with ZERO
      // failures, leaving `.allday-pill-subtle` in the stylesheet as dead CSS.
      //
      // Comparing the two SETS closes both directions at once, and is the shape the rest of
      // this branch already uses. Scanning for the class pattern rather than looking each one
      // up is what makes an orphaned rule visible.
      const declared = new Set(
        [...cardStyles.cssText.matchAll(/\.allday-pill-([a-z]+)/g)].map((m) => m[1]),
      );

      expect([...declared].sort()).toEqual([...Helpers.ALLDAY_BADGE_STYLES].sort());
    });

    it('spreads the four across two shapes, and reaches every colour through a token', () => {
      // Nothing read a treatment's OWN declarations before this, in either direction, so the
      // scale's shape was unpinned: which treatments draw a ring and which draw a wash were
      // facts about the stylesheet that no test could see.
      //
      // The pairing is the design. `allday_badge_style` names a SHAPE and
      // `allday_badge_color` names the colour it is drawn in, so two rings (outline, tinted)
      // and two washes (subtle, filled is the solid) each come in every colour rather than
      // one shape owning the accent-free look. Until 4.2 that look was a sixth class called
      // `neutral`, so exactly one shape could be had without an accent -- and which one that
      // was changed twice in an evening, because there was only ever room for one.
      //
      // Pinned as a whole table by value, so a reversal is as loud as an addition.
      const shapeOf = (style: string) => {
        const ring = declared(`.allday-pill-${style}`, 'box-shadow');
        const fill = declared(`.allday-pill-${style}`, 'background-color');
        return {
          ring: ring !== '' && ring !== 'none',
          fill: fill !== '' && fill !== 'transparent',
        };
      };

      expect(Object.fromEntries(Helpers.ALLDAY_BADGE_STYLES.map((s) => [s, shapeOf(s)]))).toEqual({
        outline: { ring: true, fill: false },
        subtle: { ring: false, fill: true },
        tinted: { ring: true, fill: true },
        filled: { ring: false, fill: true },
      });
    });

    it('lets no treatment reach the accent except through a token', () => {
      // This is what makes the colour axis one block rather than four. Every treatment reads
      // --badge-ink, --badge-wash or --badge-solid, so `allday_badge_color` switches the
      // source by redefining three properties in one place and no shape rule has to know a
      // source exists. A rule that named --calendar-card-event-accent directly would keep
      // working in the default colour and silently ignore the other two, which is a failure
      // no rendering test would catch either: the accent IS the default.
      //
      // outline and filled are the two that did name it, and are the reason this exists.
      for (const style of Helpers.ALLDAY_BADGE_STYLES) {
        const body = rulesFor(`.allday-pill-${style}`)
          .map((r) => r.body)
          .join('');

        // The control: an empty body would satisfy the assertion below by having nothing in
        // it to object to.
        expect(body.length, style).toBeGreaterThan(0);
        expect(body, style).not.toContain('--calendar-card-event-accent');
      }

      // And the tokens themselves must still be defined FROM the accent, or the indirection
      // above would be satisfied by a stylesheet that had lost the accent altogether.
      expect(declared('.allday-badge', '--badge-solid')).toContain(
        'var(--calendar-card-event-accent)',
      );
    });

    it('draws tinted ring and outline ring in the same colour, from the same token', () => {
      // 🚨 Both rules wrote `inset 0 0 0 1px currentColor` and painted DIFFERENT rings,
      // because currentColor resolves against each rule's own `color`: outline sets
      // --badge-solid (the raw accent) and tinted sets --badge-ink (the 45% legibility mix).
      // Two identical-looking declarations, one token apart, and the difference is invisible
      // in the source -- which is why this reconciles the RESOLVED colour rather than the
      // text of the declaration.
      //
      // It matters because the ring sits four pixels from the event's vertical bar, which is
      // the raw accent, so a mixed ring reads as the wrong colour against it. Reported from
      // a live card.
      //
      // A ring is a boundary nobody reads, so it belongs with the bar; the LABEL is read and
      // keeps the mix. That is why only the ring is reconciled here and the two rules'
      // `color` values are deliberately allowed to differ.
      const ringToken = (style: string) => {
        const shadow = declared(`.allday-pill-${style}`, 'box-shadow');
        if (shadow === 'inset 0 0 0 1px currentColor') {
          // currentColor means "whatever this rule's own colour is".
          return declared(`.allday-pill-${style}`, 'color');
        }
        return shadow.replace('inset 0 0 0 1px ', '');
      };

      expect(ringToken('tinted')).toBe(ringToken('outline'));
      // And it is the RAW token, not the mixed one -- the same value the vertical bar draws.
      expect(ringToken('tinted')).toBe('var(--badge-solid)');

      // The label deliberately does NOT follow: raw accent as text on the wash measures
      // 2.33:1 on the default blue against 6.11:1 for the mix, so the two halves of the
      // tinted rule answer to different constraints.
      expect(declared('.allday-pill-tinted', 'color')).toBe('var(--badge-ink)');
    });

    it('points all three tokens at the row ink for the text colour source', () => {
      // `allday_badge_color: text` is the one source that cannot be resolved to a colour
      // before the render, because it is whatever the pill is nested in -- the time colour on
      // the time row, the title colour on the title. The renderer publishes that as
      // --badge-source and this block points the three tokens at it. A source that redefined
      // only two would leave one treatment drawing the accent beside two that did not.
      const selector = '.allday-badge.allday-source-text';
      for (const token of ['--badge-ink', '--badge-wash', '--badge-solid']) {
        expect(declared(selector, token), token).toContain('var(--badge-source)');
      }

      // Both positions, from one rule, for the same reason every other badge rule names both.
      const shared = RULES.filter(
        (r) =>
          r.selectors.includes('.allday-badge.allday-source-text') &&
          r.selectors.includes('.allday-title-pill.allday-source-text'),
      );
      expect(shared).toHaveLength(1);

      // 🚨 --badge-source is a published token and NOT currentColor, and the difference is
      // `filled`. currentColor resolves against the element's own computed colour -- the
      // thing the treatments SET -- so filled, which deliberately sets a CONTRASTING ink,
      // would resolve its own ground to its own ink and draw a pill filled with the colour of
      // its letters. There is no ordering fix: currentColor always names the final computed
      // value. The other three get away with it only because each sets `color` to the
      // inherited value anyway.
      expect(shared[0].body).not.toContain('currentColor');

      // The ink is the source EXACTLY, where the accent path mixes 45% into the primary text
      // colour for legibility. That mix's job is to make a NAMED colour readable against the
      // card; for the colour the row is already painted in it is identity, and running it
      // anyway would draw the label darker than the time beside it.
      expect(declared(selector, '--badge-ink')).toBe('var(--badge-source)');

      // The wash is alpha, not a mix into the card: it composites over whatever is behind the
      // pill, so under event_background_opacity it deepens the tinted row evenly instead of
      // punching a near-card-background hole in it.
      expect(declared(selector, '--badge-wash')).toContain('transparent');
      expect(declared(selector, '--badge-wash')).not.toContain('--calendar-card-background-color');
    });

    it('gives both positions the same box, declared once', () => {
      // rulesFor matches a selector LIST, so this passes only while one rule names both.
      // Two rules that happen to agree today would satisfy a per-selector check and drift
      // apart on the next edit.
      const shared = RULES.filter(
        (r) => r.selectors.includes('.allday-badge') && r.selectors.includes('.allday-title-pill'),
      );
      expect(shared.length).toBeGreaterThan(0);

      // line-height and padding-block are deliberately NOT in this list -- see the test
      // below, which asserts they differ and says why.
      for (const prop of [
        'display',
        'box-sizing',
        'max-width',
        'min-width',
        'white-space',
        'overflow',
        'text-overflow',
        'border-radius',
      ]) {
        expect(declared('.allday-badge', prop), prop).not.toBe('');
        expect(declared('.allday-title-pill', prop), prop).toBe(declared('.allday-badge', prop));
      }
    });

    it('uppercases the label but never the title', () => {
      // The time badge draws the localized words for "all day" -- a tag, so it is set small,
      // spaced and uppercased. The title pill draws the USER'S OWN WORDS: an event called
      // "Dentist" is not called "DENTIST", and forcing the case would mangle every language
      // that carries meaning in it.
      expect(declared('.allday-badge', 'text-transform')).toBe('uppercase');
      expect(declared('.allday-title-pill', 'text-transform')).toBe('');
      expect(declared('.allday-title-pill', 'letter-spacing')).toBe('');
    });

    it('shrinks the title pill less than the tag, and both relatively', () => {
      /*
       * Both positions step down from the text around them, for different reasons and by
       * different amounts. The badge is a TAG -- one short uppercase label -- and takes the
       * full 0.85em. The title pill holds the user's own prose, so it stops at 0.95em, enough
       * to stop competing with the title it wraps without becoming hard to read.
       *
       * Pinned as an ORDERING rather than only as two values, so the relationship survives
       * anyone retuning either number: the pill must never shrink as far as the tag. Both
       * must stay relative, because every other length in those rules is em of the element's
       * own font -- an absolute value would freeze the pill while event_font_size moved.
       */
      const badge = declared('.allday-badge', 'font-size');
      const pill = declared('.allday-title-pill', 'font-size');
      expect(badge).toBe('0.85em');
      expect(pill).toBe('0.95em');
      for (const [name, value] of [
        ['badge', badge],
        ['pill', pill],
      ] as const) {
        expect(value, name).toMatch(/em$/);
      }
      expect(Number.parseFloat(pill)).toBeGreaterThan(Number.parseFloat(badge));
      expect(Number.parseFloat(pill)).toBeLessThan(1);
    });

    it('does not pull the title pill outside its row', () => {
      // It used to. A negative inline margin of exactly the pill's own padding put the TEXT
      // on the same optical line as every other event's title, which reads well in isolation
      // and was wrong in place: the pill then began further left than anything else in the
      // card, and the container clipped its leading curve.
      //
      // The pill's BOX aligns with the row instead, and the text inside it sits indented by
      // the padding. That is what Apple Calendar does, and it is the trade the maintainer
      // chose once he saw the clipping. Measured live: pill box x=565.5 against a plain
      // title's x=565.5 -- the same edge.
      expect(declared('.allday-title-pill', 'margin-inline-start')).toBe('');
      expect(declared('.allday-title-pill', 'padding-inline')).not.toBe('');
    });

    it('gives the title pill a taller box than the badge, for emoji', () => {
      // The badge wraps one uppercase label; the title wraps the user's own words, which in
      // a calendar very often start with an emoji. An emoji is drawn to a larger box than a
      // Latin glyph and overflows a 1.05 line box at both ends, so at the badge's 0.32em of
      // padding it touched the pill's border -- reported by the maintainer against a live
      // card. Asserted as an inequality on the sum rather than as two magic numbers, so the
      // reason survives a retune.
      // padding-block takes one value for both sides or two for top and bottom, so a naive
      // sum reads a symmetric box as half its height -- which is exactly how this test first
      // reported the taller title pill as the shorter one, at 1.37 against 1.37.
      const block = (v: string) => {
        const parts = v.split(' ').map(parseFloat);
        return parts.length === 1 ? parts[0] * 2 : parts[0] + parts[1];
      };
      const badgeBox =
        parseFloat(declared('.allday-badge', 'line-height')) +
        block(declared('.allday-badge', 'padding-block'));
      const titleBox =
        parseFloat(declared('.allday-title-pill', 'line-height')) +
        block(declared('.allday-title-pill', 'padding-block'));

      expect(titleBox).toBeGreaterThan(badgeBox);
      // ...but only a little. The maintainer asked for headroom, not a different shape.
      expect(titleBox).toBeLessThan(badgeBox * 1.25);
    });

    it('centres the badge on its caps where the browser can, and on the em square otherwise', () => {
      // The fallback padding is asymmetric because an uppercase label leaves the em square's
      // descender depth empty, so the caps sit high in it. That correction is a measured font
      // constant and it removes the AVERAGE error, but not the per-size scatter: the browser
      // snaps the baseline to a whole CSS pixel, which is a sawtooth of up to half a pixel
      // that no em-valued padding can flatten.
      //
      // text-box-trim removes the cause rather than compensating for it -- it trims the line
      // box to the cap height and the alphabetic baseline, so symmetric padding then centres
      // the ink itself. Measured across fourteen sizes from 12px to 48px at 8x device scale:
      // mean residual +0.027em before, +0.006em after, worst case halved.
      //
      // The title pill must NOT take it: its content is mixed case with descenders and emoji,
      // where the em square is the right thing to centre and cap-to-baseline is not.
      const css = cardStyles.cssText;
      expect(css).toContain('text-box-trim: trim-both');
      expect(css).toContain('text-box-edge: cap alphabetic');

      const supports = css.slice(css.indexOf('text-box-trim: trim-both') - 400);
      const block = supports.slice(0, supports.indexOf('}', supports.indexOf('text-box-edge')));
      expect(block).toContain('@supports');
      expect(block).toContain('.allday-badge');
      expect(block).not.toContain('.allday-title-pill');

      // The fallback keeps its asymmetry, so a browser without trim is still corrected.
      const [top, bottom] = declared('.allday-badge', 'padding-block').split(' ').map(parseFloat);
      expect(top).toBeGreaterThan(bottom);

      // And the title pill's stays symmetric, because mixed-case text needs no correction.
      const title = declared('.allday-title-pill', 'padding-block').split(' ');
      expect(title).toHaveLength(1);
    });

    it('reaches the title pill from the OKLCH enhancement, not just the badge', () => {
      // The chroma-recovery blocks redefine --badge-ink and --badge-wash. Naming only
      // .allday-badge there would leave the title pill on the sRGB fallback: visibly a
      // different colour from the time badge on the same card, in the same treatment, with
      // nothing in either rule to say why.
      //
      // Scanned out of the raw text rather than through `rulesFor`, and that is not a
      // shortcut. `scanRules` deliberately skips at-rules, so RULES contains no rule nested
      // inside an @supports block -- the first version of this test used it, counted only
      // the top-level base rule, and reported one site where there are three. A gate that
      // cannot see the thing it is gating fails in whichever direction its threshold
      // happens to point.
      const sites = [...cardStyles.cssText.matchAll(/--badge-ink\s*:/g)].map((m) => {
        const before = cardStyles.cssText.slice(0, m.index);
        const open = before.lastIndexOf('{');
        const prelude = before.slice(before.lastIndexOf('}', open) + 1, open);
        return prelude;
      });

      // Base, both OKLCH tiers, and the text colour source. The last one is why the count is
      // stated rather than merely bounded: it redefines the same two tokens at (0,2,0) from
      // outside any @supports, and a source block that named only one position would put the
      // title pill on the accent while the time badge followed the row -- the same failure
      // this test was written for, arriving down the other axis.
      expect(sites).toHaveLength(4);
      for (const prelude of sites) {
        expect(prelude).toContain('.allday-badge');
        expect(prelude).toContain('.allday-title-pill');
      }
    });
  });

  describe('the grid view box model', () => {
    it('keeps positioned event boxes inside their percentage geometry', () => {
      // happy-dom cannot prove the 17:00 pixel edge is aligned with the 17:00 rule; it
      // does not do layout. What this stylesheet gate can prove is the declaration that
      // makes the browser include padding and borders inside the height emitted by the
      // grid renderer, rather than adding them below it.
      expect(declared('.grid-event', 'box-sizing')).toBe('border-box');
    });

    it('keeps all-day banners inside their grid tracks', () => {
      // Same failure class as `.grid-event`: the card does not set global box sizing, so
      // a padded banner is content-box unless this rule says otherwise.
      expect(declared('.grid-banner', 'box-sizing')).toBe('border-box');
    });

    it('uses height container queries for grid event disclosure', () => {
      // This is a stylesheet gate because happy-dom does not evaluate container queries.
      // It does not prove the browser's layout result; paired with `grid-dom.test.ts`, it
      // proves the renderer emits short blocks into the CSS-only mechanism and that the
      // thresholds live in CSS rather than in the percentage geometry.
      expect(declared('.grid-event', 'container')).toBe('calendar-card-grid-event / size');
      expect(CSS).toContain('@container calendar-card-grid-event (min-height: 19px)');
      expect(CSS).toContain('@container calendar-card-grid-event (min-height: 36px)');
      expect(CSS).toContain('@container calendar-card-grid-event (min-height: 40px)');
      expect(CSS).toContain('@container calendar-card-grid-event (min-height: 72px)');
      expect(CSS).toContain('@container calendar-card-grid-event (min-height: 96px)');
      expect(declared('.grid-event-disclosure .time', 'display')).toBe('none');
      expect(declared('.grid-event-disclosure .location', 'display')).toBe('none');
    });

    it('keeps grid detail rows from being sliced under wrapped titles', () => {
      // happy-dom has no layout engine, so this does not measure the narrow-column failure
      // directly. It pins the CSS contract that fixes it in browsers: the grid-only wrapper
      // gets the event box height, the title area is allowed to shrink and clip, and the
      // detail rows keep their full line height instead of becoming half-visible text.
      expect(declared('.grid-event-disclosure', 'height')).toBe('100%');
      expect(declared('.grid-event-disclosure .event-content', 'height')).toBe('100%');
      expect(declared('.grid-event-disclosure .summary-row', 'display')).toBe('none');
      expect(declared('.grid-event-disclosure .summary-row', 'flex')).toBe('0 0 auto');
      expect(declared('.grid-event-disclosure .summary-row', 'overflow')).toBe('hidden');
      expect(declared('.grid-event-disclosure .summary', 'min-height')).toBe('0');
      expect(declared('.grid-event-disclosure .summary', 'padding-block')).toBe('0');
      expect(declared('.grid-event-disclosure .event-title', '-webkit-line-clamp')).toBe(
        'var(--calendar-card-grid-title-lines-compact)',
      );
      expect(CSS).toContain('-webkit-line-clamp: var(--calendar-card-grid-title-lines-medium);');
      expect(CSS).toContain('-webkit-line-clamp: var(--calendar-card-grid-title-lines-expanded);');
      expect(declared('.grid-event-disclosure .time', 'flex')).toBe('0 0 auto');
      expect(declared('.grid-event-disclosure .time', 'min-width')).toBe('0');
      expect(declared('.grid-event-disclosure .time', 'overflow')).toBe('hidden');
      expect(declared('.grid-event-disclosure .time', 'text-overflow')).toBe('ellipsis');
      expect(declared('.grid-event-disclosure .time', 'white-space')).toBe('nowrap');
      expect(declared('.grid-event-disclosure .time', 'flex-wrap')).toBe('nowrap');
      expect(declared('.grid-event-disclosure .time-actual', 'min-width')).toBe('0');
      expect(declared('.grid-event-disclosure .time-text', 'white-space')).toBe('nowrap');
      expect(declared('.grid-event-disclosure .location', 'flex')).toBe('0 0 auto');
    });

    it('sizes the grid axis gutter from its visible labels with fixed inline padding', () => {
      // The gutter is `max-content` so it is exactly as wide as the widest hour label and
      // no wider, with the breathing room fixed either side rather than baked into a
      // width. A translated all-day caption used to sit in this column and set that
      // width for everything else; it was dropped, so the hours decide it again.
      expect(declared('.grid-axis', 'box-sizing')).toBe('border-box');
      expect(declared('.grid-axis', 'padding-inline')).toBe('4px 8px');
      expect(declared('.grid-axis-sizer', 'visibility')).toBe('hidden');
      expect(declared('.grid-axis-sizer span', 'display')).toBe('block');
    });

    it('dims a past all-day banner, which has no event-content to dim', () => {
      // `.past-event .event-content` is the card's only dimming rule, and a grid banner
      // emits a bare title span rather than an event-content wrapper -- so it carried the
      // past-event class from the day it was written with nothing selecting it. A finished
      // holiday stayed bright while the finished meeting under it dimmed.
      expect(declared('.past-event .event-content', 'opacity')).toBe('0.6');
      expect(declared('.grid-banner.past-event .grid-banner-title', 'opacity')).toBe('0.6');
    });

    it('matches all-day banner titles to timed event titles', () => {
      expect(declared('.grid-banner-title', 'font-size')).toBe(
        'var(--calendar-card-font-size-event)',
      );
      expect(declared('.grid-banner-title', 'font-weight')).toBe('500');
      expect(declared('.grid-banner-title', 'line-height')).toBe('1.2');
      expect(declared('.grid-banner-title', 'color')).toBe('var(--calendar-card-color-event)');
    });

    it('breaks a grid event title at spaces, and inside a word only as a last resort', () => {
      // Three values, three different failures, and the middle one is the trap. The
      // inherited `hyphens: auto` broke `Conference` as `Con-fer-en` in a lane-split
      // block, so it read as three words. Correcting that to `overflow-wrap: normal`
      // was worse: a word wider than the block overflowed and was clipped
      // horizontally, and since the clamp was never reached there was no ellipsis to
      // mark it — the block rendered `Conferen` with the `ce` silently gone, verified
      // live at 7 columns. `break-word` prefers spaces and breaks inside a word only
      // when that word cannot fit a line alone, so no character is ever dropped.
      expect(declared('.grid-event-disclosure .event-title', 'overflow-wrap')).toBe('break-word');
      expect(declared('.grid-event-disclosure .event-title', 'word-break')).toBe('normal');
      expect(declared('.grid-event-disclosure .event-title', 'hyphens')).toBe('manual');
    });

    it('draws clipped grid events with a subtle inset continuation mark', () => {
      expect(declared('.grid-event.clipped-top', 'border-block-start')).toBe('');
      expect(declared('.grid-event.clipped-bottom', 'border-block-end')).toBe('');
      expect(declared('.grid-event.clipped-top::before', 'border-block-start')).toBe(
        '1px dashed currentColor',
      );
      expect(declared('.grid-event.clipped-bottom::after', 'border-block-start')).toBe(
        '1px dashed currentColor',
      );
      expect(declared('.grid-event.clipped-top::before', 'opacity')).toBe('0.45');
    });
  });
});

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

/** The stylesheet with comments stripped, so a selector named in prose never matches. */
const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

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
      ['.time .time-actual span', '.time-actual'],
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
  });

  describe('per-field line clamping', () => {
    it.each([
      ['.event-title', '--calendar-card-title-max-lines'],
      ['.time .time-actual span', '--calendar-card-time-max-lines'],
      ['.location span', '--calendar-card-location-max-lines'],
      ['.description span', '--calendar-card-description-max-lines'],
    ])('%s clamps on the element that holds the text', (selector, prop) => {
      // -webkit-line-clamp needs all three of these together, and the clamp has
      // to land on the innermost text-bearing element: clamping a wrapper would
      // clamp away the icon and countdown siblings instead of the text.
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
     * The condition words are the only shrinkable thing in the row, and that asymmetry
     * is the whole width strategy: the column track bottoms out at 152px, so a German
     * condition cannot fit beside the numbers. Whatever room is short comes out of the
     * words. The temperature and the UV index survive every width, because they are the
     * fields a user configured on purpose.
     */
    it('lets only the words shrink', () => {
      expect(declared('.time-location .event-weather .weather-condition', 'flex')).toBe('0 1 auto');
      expect(declared('.time-location .event-weather span', 'flex')).toBe('none');
    });

    it('lets the words shrink past their own longest word', () => {
      // Per CSS Flexbox 4.5 a flex item's automatic minimum size is its min-content
      // width, so without this the words could not shrink below "Schneeregen" and would
      // push the temperature out of the row instead of yielding to it.
      expect(declared('.time-location .event-weather .weather-condition', 'min-width')).toBe('0');
    });

    it('clamps the words with the same mechanism as every other line limit', () => {
      // -webkit-line-clamp only takes effect on a -webkit-box, and unlimited is the
      // keyword `none`, which generateCustomPropertiesObject emits when the option is 0.
      const selector = '.time-location .event-weather .weather-condition';

      expect(declared(selector, 'display')).toBe('-webkit-box');
      expect(declared(selector, '-webkit-box-orient')).toBe('vertical');
      expect(declared(selector, '-webkit-line-clamp')).toBe(
        'var(--calendar-card-weather-event-max-lines)',
      );
      expect(declared(selector, 'overflow')).toBe('hidden');
    });

    /*
     * The separators — C6. `.event-weather` is a flex container, which drops the
     * whitespace between its items and strips each item's own edge whitespace, so
     * every space the template contains is discarded and the row rendered as
     * `30°UV4Sunny`. The rule below is what puts them back.
     */
    it('separates the text pieces with a middot', () => {
      const selector = '.time-location .event-weather span + span::before';

      // A middot, not a comma: Home Assistant's own condition vocabulary contains
      // "Clear, night", and a comma separator would be indistinguishable from it.
      expect(declared(selector, 'content')).toBe("'·'");
      expect(declared(selector, 'margin-inline')).not.toBe('');
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
        '.time-location .event-weather span + span::before',
      ]);
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
  });

  describe('the progress bar and countdown in column view', () => {
    /*
     * C5. The two are strictly mutually exclusive -- `getCountdownString` returns null
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
        'var(--calendar-card-progress-bar-width, 75%)',
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
      // bug C5 exists to fix rather than as a regression.
      const base = RULES.findIndex((rule) => rule.selectors.includes('.progress-bar'));
      const modifier = RULES.findIndex((rule) => rule.selectors.includes('.progress-bar-row'));

      expect(base).toBeGreaterThanOrEqual(0);
      expect(modifier).toBeGreaterThan(base);
    });

    it('keys the row on the placement, not on the view', () => {
      // `.progress-bar-row` is emitted by a placement parameter, so it must be styled
      // unqualified. Scoping it under `.column-events` would tie a *placement* to a
      // *view*, and a future layout that asks for the row would silently get the inline
      // styling. Same reasoning as C3's named view predicates, one level down.
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

    it('marks the join with a middot, and cannot reach the list view', () => {
      // Generated content rather than a character in the string, because the countdown
      // strings are translated -- 35 languages would each need the punctuation baking in,
      // and every one would then carry it in list view too.
      const selector = '.column-events .time-countdown::before';

      expect(declared(selector, 'content')).toBe("'·'");
      expect(declared(selector, 'margin-inline-end')).not.toBe('');

      const unscoped = RULES.filter((rule) =>
        rule.selectors.some((s) => s.includes('.time-countdown::before')),
      );
      expect(unscoped).toHaveLength(1);
      expect(unscoped[0].selectors).toEqual([selector]);
    });

    it('keeps the countdown from breaking mid-phrase', () => {
      // So the separator travels with the phrase and opens the second line, rather than
      // being orphaned at the end of the first.
      expect(declared('.time-countdown', 'white-space')).toBe('nowrap');
    });

    /*
     * 🚨 The alignment trap, and a correction to the specification that describes it.
     *
     * C5 §1 proposed dropping `display: flex` from `.time` in column view so the time and
     * countdown would participate in inline flow, and warned that inline flow ignores
     * `align-items`, so `--calendar-card-event-icon-vertical-alignment` would stop
     * reaching this row and would have to be re-expressed as `vertical-align`.
     *
     * Two things are wrong with that. The smaller one: the property does not reach `.time`
     * today either. The shared `.time, .location, .description` rule sets it, and `.time`'s
     * own later rule -- same specificity, so source order wins -- hardcodes
     * `align-items: center` straight over the top. So the value is already inert on this
     * row, in both views, and has been. That is pre-existing and deliberately left alone:
     * changing it would move the list view, which C5 may not do.
     *
     * The larger one: the icon is not a child of `.time` at all, it is nested inside
     * `.time-actual`, which hardcodes `align-items: center` of its own. Nothing declared
     * on `.time` has ever positioned the time icon against the time text. Where the
     * property genuinely works is `.location` and `.description`, whose icon and text are
     * direct flex children -- which is what the first assertion below pins.
     *
     * What dropping the flex would actually have broken is worse than the trap named:
     * `.time-actual` is a block-level flex container, so in inline flow it and the
     * countdown would have stacked vertically instead of sharing a line -- the exact
     * layout the design rejected. It was built as flex instead, which is why nothing here
     * needed re-expressing.
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
      // The C5 invariant: column view adds no `display` or `align-items` override, so the
      // row resolves identically in both views and whatever the shared rules decide keeps
      // deciding. This is what fails if a future change reaches for inline flow.
      expect(declared('.time', 'display')).toBe('flex');
      expect(declared('.column-events .time', 'display')).toBe('');
      expect(declared('.column-events .time', 'align-items')).toBe('');
    });

    it('keeps .time-actual a flex container, which is what makes the row work at all', () => {
      // Two things depend on it. `.time .time-actual span` clamps with a literal
      // -webkit-box, which is only safe while its parent blockifies it (see the
      // blockification trap above). And in inline flow this box is block-level, so it
      // would take a line of its own and push the countdown off the row entirely.
      expect(declared('.time-actual', 'display')).toBe('flex');
      expect(declared('.column-events .time-actual', 'display')).toBe('');
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

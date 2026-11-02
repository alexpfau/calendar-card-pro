import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';

/**
 * Every icon, label and weather part keeps its gap on the side that faces its text, in a
 * right-to-left card as in a left-to-right one.
 *
 * Each of them held its gap as a physical margin, a right one for a leading glyph. In a
 * left-to-right card that is the side facing the text; in a right-to-left one it is the leading
 * edge. So on a right-to-left dashboard every clock, pin and info icon started 4px in from its
 * row and touched its text, every label touched its title, the list's weather badge sat 4px
 * further from the title than in left-to-right and 4px closer to the card's edge, the column
 * view's today dot touched its weekday, and the list's date badge ran its UV index into the
 * temperature. Measured in Chromium, WebKit and Firefox against the same cards in
 * left-to-right: every gap mirrored once the margins were written by inline side, and the
 * left-to-right cards stayed byte-identical.
 *
 * The UV index right after a temperature is the one part that keeps a physical margin, and it is
 * pinned below with the rest. Where the two sit inline they are digits and Latin letters, which a
 * right-to-left line still lays out left to right, so the temperature is on its left either way.
 *
 * happy-dom does no layout, so this reads the stylesheet: what regressed is the declaration.
 */

const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every innermost rule as a normalized selector list and a body, nested at-rules included. */
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, prelude, body]) => ({
  selector: prelude.replace(/\s+/g, ' ').trim(),
  body,
}));

/** Each declaration in a rule body as a property and a value. */
function declarations(body: string): [string, string][] {
  return body
    .split(';')
    .filter((decl) => decl.includes(':'))
    .map((decl) => {
      const idx = decl.indexOf(':');
      return [decl.slice(0, idx).trim(), decl.slice(idx + 1).trim()];
    });
}

/** The last value a rule with exactly this selector list declares for `prop`, or ''. */
function declared(selector: string, prop: string): string {
  const values = RULES.filter((rule) => rule.selector === selector).flatMap((rule) =>
    declarations(rule.body)
      .filter(([name]) => name === prop)
      .map(([, value]) => value),
  );
  return values.length ? values[values.length - 1] : '';
}

const PHYSICAL = /^(margin|padding)-(left|right)$/;

describe('inline glyph gaps in either text direction', () => {
  it('reads the stylesheet', () => {
    // Guards the scans below: an empty rule list would pass them all.
    expect(RULES.length).toBeGreaterThan(300);
    expect(declared('ha-icon', 'display')).toBe('inline-flex');
  });

  it('keeps no physical inline margin or padding but these', () => {
    const physical = RULES.flatMap((rule) =>
      declarations(rule.body)
        .filter(([prop]) => PHYSICAL.test(prop))
        .map(([prop, value]) => `${rule.selector} { ${prop}: ${value} }`),
    );

    // The list view's week row, separators and date column held physical insets here until
    // they too were written by inline side, so a right-to-left list mirrors; their values are
    // pinned in rtl-mirroring.test.ts.
    expect(physical).toEqual([
      // The UV index right after a temperature, inline, in a run of digits and Latin letters:
      // see the file's comment. Each rule cancels its inline-start margin before this.
      '.column-date-content .weather .weather-temp-high + .weather-uv-index { margin-left: 2px }',
      '.summary-row .event-weather-text > span + .weather-uv-index { margin-left: 2px }',
    ]);
  });

  it.each([
    ['ha-icon', 'margin-inline-end', '4px', 'the clock, pin and info icons, and the error notice'],
    ['.calendar-label', 'margin-inline-end', '4px', 'a text or emoji label'],
    ['.label-icon', 'margin-inline-end', '4px', 'an icon label'],
    ['.label-image', 'margin-inline-end', '4px', 'a picture label'],
    ['.event-weather', 'margin-inline-start', '8px', "the list's weather badge, from the title"],
    ['.event-weather', 'margin-inline-end', '12px', "the list's weather badge, from the edge"],
    ['.event-weather ha-icon', 'margin-inline-end', '2px', "the weather badge's icon"],
    ['.weather ha-icon', 'margin-inline-end', '1px', "the date badge's icon"],
    ['.weather .weather-uv-index', 'margin-inline-start', '2px', "a date badge's UV index"],
    [
      '.event-weather .weather-uv-index',
      'margin-inline-start',
      '2px',
      "a weather badge's UV index",
    ],
    [
      '.column-date-content .weather .weather-temp-high + .weather-uv-index',
      'margin-inline-start',
      '0',
      'a day header UV index after the temperature, whose gap is its left margin',
    ],
    [
      '.summary-row .event-weather-text > span + .weather-uv-index',
      'margin-inline-start',
      '0',
      "a title-row badge's UV index after the temperature, whose gap is its left margin",
    ],
  ])('%s holds its gap as %s: %s (%s)', (selector, prop, value) => {
    expect(declared(selector, prop)).toBe(value);
  });

  it("leaves the list view's placed today indicator where its position puts it", () => {
    // today_indicator_position places it with an inline start and a top. ha-icon's inline-end
    // gap would be a left margin in right-to-left, and move it 4px; in left-to-right a right
    // margin moves nothing, so zero changes nothing there.
    expect(
      declared(
        '.today-indicator-container:not(.inline) > ha-icon.today-indicator',
        'margin-inline-end',
      ),
    ).toBe('0');
  });

  it('isolates a text label in its own direction, in either text direction', () => {
    // So an English label before an English title leads it in right-to-left, and a Hebrew
    // label before a Hebrew title in left-to-right, with its gap toward it, rather than joining
    // it in one run that the line draws label last. plaintext, not isolate, so "Work:" keeps
    // its colon after the word: isolate would lay the label out in the card's direction.
    const labels = '.calendar-label, .grid-event-disclosure .calendar-label:dir(rtl)';
    expect(declared(labels, 'unicode-bidi')).toBe('plaintext');
    // Grid view isolates its labels itself, and in left-to-right that still wins: a stronger
    // selector than the bare class. In right-to-left the :dir(rtl) entry above outweighs it.
    expect(
      declared(
        '.grid-event-disclosure .calendar-label, .grid-event-disclosure .label-icon, .grid-event-disclosure .label-image',
        'unicode-bidi',
      ),
    ).toBe('isolate');
  });
});

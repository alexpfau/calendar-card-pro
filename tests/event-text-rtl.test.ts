import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';

/**
 * An event's title and the detail rows under it start at the same inline edge in a
 * right-to-left language, as they do in a left-to-right one.
 *
 * The title block (`.summary`) and its rows (`.time`, `.location`, `.description`) each keep a
 * 12px gutter at their trailing edge, so a weather badge beside the title, or the end of the
 * card, is held clear of the text. Both gutters were written as `margin-right`. In a
 * left-to-right card that is the trailing edge; in a right-to-left one it is the leading edge,
 * so the gutter pushed the text 12px away from the accent bar instead.
 *
 * Up to v4.2 every `.summary` carried the gutter, so in right-to-left the title and its rows
 * were pushed in alike and still lined up. v5 gives the title its gutter only when something
 * shares its row, and the rows kept theirs: from then on, in right-to-left, the time, location
 * and description started 12px further in than the title, and in grid view the time row ran
 * 12px past its block, which cuts the end of the time off. Measured in Chromium, Firefox and
 * WebKit at 12px in list, column and grid, and 0px in left-to-right and in v4.2.
 *
 * Moving only the rows' gutter is not enough: a list card with a weather badge in the title
 * row gives the title its gutter as well, and its rows would then start 12px *outside* the
 * title. So the invariant is on every rule whose subject is the title block or one of its
 * rows, not on the two rules that broke. The inline-end gutter is the same 12px in a
 * left-to-right card, which is why the fix moves nothing there.
 *
 * happy-dom does no layout, so this reads the stylesheet: what regressed is the declaration.
 */

const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every innermost rule as a selector list and a body, nested at-rules included. */
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, prelude, body]) => ({
  selectors: splitTopLevel(prelude.trim(), ','),
  body,
}));

/** Split on a separator that is not inside parentheses or brackets. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

/** The last compound of a selector: the element a rule actually styles. */
function subject(selector: string): string {
  let depth = 0;
  let last = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) last = i + 1;
  }
  return selector.slice(last).trim();
}

/** The title block or one of its detail rows, not `.summary-row`, `.time-location` or the like. */
const TEXT_BLOCK = /^\.(summary|time|location|description)(?![\w-])/;

const textBlockRules = RULES.flatMap((rule) =>
  rule.selectors
    .filter((selector) => TEXT_BLOCK.test(subject(selector)))
    .map((selector) => ({ selector, body: rule.body })),
);

/** The value of `prop` in a rule body, or '' when it is not declared there. */
function declaredIn(body: string, prop: string): string {
  for (const decl of body.split(';')) {
    const idx = decl.indexOf(':');
    if (idx !== -1 && decl.slice(0, idx).trim() === prop) return decl.slice(idx + 1).trim();
  }
  return '';
}

describe("an event's text in right-to-left", () => {
  it('finds the title block and its rows in the stylesheet', () => {
    // Guards the scan: if it matched nothing, the next assertion would pass vacuously.
    const subjects = new Set(textBlockRules.map(({ selector }) => subject(selector)));
    expect(subjects).toContain('.summary');
    expect(subjects).toContain('.summary:not(:only-child)');
    expect(subjects).toContain('.time');
    expect(subjects).toContain('.location');
    expect(subjects).toContain('.description');
  });

  it('sets no physical inline margin on the title block or its rows', () => {
    const physical = textBlockRules
      .filter(({ body }) => /(^|;)\s*margin-(left|right)\s*:/.test(body))
      .map(({ selector }) => selector);
    expect(physical).toEqual([]);
  });

  it.each([
    ['.summary:not(:only-child)', 'the title, when a badge shares its row'],
    ['.time', 'the time row'],
    ['.location', 'the location row'],
    ['.description', 'the description row'],
  ])('keeps the 12px gutter of %s (%s) at its inline end', (selector) => {
    const values = textBlockRules
      .filter((rule) => rule.selector === selector)
      .map(({ body }) => declaredIn(body, 'margin-inline-end'))
      .filter(Boolean);
    expect(values).toEqual(['12px']);
  });
});

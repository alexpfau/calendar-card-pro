/**
 * Marks above and below the line (backlog item 258).
 *
 * Thai stacks a tone mark on a vowel above its letter, Vietnamese an accent on a circumflex, and
 * Arabic, Burmese and Khmer reach below. At the card's line height of 1.2 those marks run past
 * the line, measured up to 0.29em above it and 0.28em below in Chromium and WebKit, and every
 * box that hid its overflow cut them at its edge: "สิ้นสุดพรุ่งนี้" drew as "สินสุดพรุ่งนี", and in
 * grid "Ể" drew as "Ế". The stylesheet now lets each box hide only what it has to (see "Marks
 * above and below the line" in styles.ts):
 *
 * - a box that hid its overflow only as a backstop for a long word cuts the inline axis alone,
 *   behind `@supports (overflow: clip)`;
 * - a box that clamps lines keeps room above its first line, inside its cut, as padding given
 *   back by a negative margin of the same size, so nothing in the layout moves.
 *
 * What either draws can only be seen in a browser; the harness that measured it (both engines,
 * list, column and grid, Latin byte-identical) is described in the pull request. This file pins
 * the contract it was measured against, whole, so a box dropped from either list, or a room that
 * stops being given back, fails here.
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { cardStyles, generateCustomPropertiesObject } from '../src/rendering/styles';

const CSS = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

/** A rule body as property to value, whitespace normalized as Prettier may break a value. */
function declarationsOf(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const declaration of body.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    out[declaration.slice(0, colon).trim()] = declaration
      .slice(colon + 1)
      .replace(/\s+/g, ' ')
      .replace(/\(\s/g, '(')
      .replace(/\s\)/g, ')')
      .trim();
  }
  return out;
}

/** A selector list with its whitespace normalized. */
function normal(selector: string): string {
  return selector.replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')').trim();
}

/** Split at a separator outside parentheses, so `calc(a + b) c` or `:is(a, b)` stays whole. */
function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth -= 1;
    else if (value[index] === separator && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

/** The body of the block an at-rule opens at `start`, braces balanced. */
function blockAt(start: number): string {
  const open = CSS.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < CSS.length; index += 1) {
    if (CSS[index] === '{') depth += 1;
    else if (CSS[index] === '}' && (depth -= 1) === 0) return CSS.slice(open + 1, index);
  }
  throw new Error('unbalanced block');
}

/** Every rule inside `@supports (overflow: clip)`, as selector list to declarations. */
function clipRules(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const match of CSS.matchAll(/@supports \(overflow: clip\)/g)) {
    for (const [, selectors, body] of blockAt(match.index!).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const key = normal(selectors);
      expect(out[key], `${key} is cut along the inline axis by one rule only`).toBeUndefined();
      out[key] = declarationsOf(body);
    }
  }
  return out;
}

/** Every innermost rule in the stylesheet, at-rules' contents included. */
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: normal(selectors),
  declarations: declarationsOf(body),
}));

const INLINE_AXIS = { 'overflow-x': 'clip', 'overflow-y': 'visible' };
const COMPACT =
  ".grid-event:is([data-grid-title-fit='measuring'], [data-grid-title-fit='compact'], " +
  "[data-grid-title-fit='blank']) .summary > .event-title";

describe('a box that hides its overflow only as a backstop for a long word', () => {
  it('cuts the inline axis alone, every such box pinned by value', () => {
    expect(clipRules()).toEqual({
      '.summary': { ...INLINE_AXIS, 'min-width': '0' },
      // A labeled summary clamps the title's line where a limit is set, and only there.
      '.summary:not(.summary-scroll):has(> .event-title:not(:only-child))': {
        'overflow-y': 'var(--calendar-card-title-overflow)',
      },
      '.summary-scroll > .event-title.title-scrollable': INLINE_AXIS,
      '.time-beside-title > .summary-row.title-wrap > .summary:not(.summary-scroll)': {
        'overflow-y': 'visible',
      },
      '.time .time-actual > span:not(.time-text):not(.allday-badge):not(.now-time)': {
        'overflow-x': 'clip',
        'overflow-y': 'var(--calendar-card-time-overflow)',
        'min-width': '0',
      },
      '.location span': {
        'overflow-x': 'clip',
        'overflow-y': 'var(--calendar-card-location-overflow)',
        'min-width': '0',
      },
      '.description span': {
        'overflow-x': 'clip',
        'overflow-y': 'var(--calendar-card-description-overflow)',
        'min-width': '0',
      },
      '.grid-banner-title': { ...INLINE_AXIS, 'min-width': '0' },
      '.grid-event-disclosure .summary-row': INLINE_AXIS,
      '.grid-event-disclosure .event-title': {
        'overflow-x': 'clip',
        'overflow-y': 'var(--calendar-card-title-overflow)',
      },
      '.grid-event-disclosure .title-word': INLINE_AXIS,
      [COMPACT]: INLINE_AXIS,
      '.grid-event-disclosure .time, .grid-event-disclosure .time-actual': INLINE_AXIS,
    });
  });

  it('keeps the hidden overflow outside the @supports, for browsers without overflow: clip', () => {
    // Safari before 16 has no overflow: clip. There the boxes hide their overflow as before and
    // cut the marks as before; overflow-y: visible beside a hidden overflow-x would compute to
    // auto there and make each of them a scroll container.
    for (const list of Object.keys(clipRules())) {
      for (const selector of splitTopLevel(list, ',')) {
        if (selector.includes(':has(') || selector.includes('title-wrap')) continue;
        // Declared on the selector itself, or on the bare class of the box it names, as grid's
        // compact title takes it from .event-title.
        const subject = selector.split(/[\s>]+/).pop()!;
        const declared = RULES.filter((rule) => {
          const selectors = splitTopLevel(rule.selectors, ',');
          return (
            (selectors.includes(selector) || selectors.includes(subject)) &&
            rule.declarations.overflow
          );
        }).map((rule) => rule.declarations.overflow);
        expect(declared, selector).toContain('hidden');
      }
    }
  });
});

describe('the room a clamping box keeps above its first line', () => {
  /** The room term in a padding-top: what is added to the box's own padding there. */
  function roomIn(padding: string): string | null {
    if (/^0\.375em$|^var\(--calendar-card-[a-z-]+-ink-room, [0-9.a-z]+\)$/.test(padding)) {
      return padding;
    }
    return /\+ (var\(--calendar-card-summary-ink-room, 0px\))\)$/.exec(padding)?.[1] ?? null;
  }

  /** The room a negative margin gives back, or null for any other margin. */
  function roomOut(margin: string): string | null {
    if (margin === '-0.375em') return '0.375em';
    return (
      /^calc\(-1 \* (var\(--calendar-card-[a-z-]+-ink-room, [0-9.a-z]+\))\)$/.exec(margin)?.[1] ??
      null
    );
  }

  /** Every rule that adds room above a first line, with the room it adds. */
  function added(): Array<{ selectors: string; room: string }> {
    return RULES.flatMap((rule) => {
      const padding = rule.declarations['padding-top'] ?? rule.declarations['padding-block'];
      const room = padding ? roomIn(splitTopLevel(padding, ' ')[0]) : null;
      return room ? [{ selectors: rule.selectors, room }] : [];
    });
  }

  it('is given back by a top margin of the same size, in every rule that adds it', () => {
    const returned = RULES.flatMap((rule) => {
      const margin = rule.declarations['margin-top'];
      const room = margin ? roomOut(margin) : null;
      return room ? [{ selectors: rule.selectors, room }] : [];
    });
    // The two summary rules, the title, the time folded with its countdown, the trailing time
    // with the location and the description, the row cut beside the time, and grid's summary.
    expect(added()).toHaveLength(7);
    expect(returned).toEqual(added());
  });

  it('is a whole number of layout units at any whole-pixel font size', () => {
    // Chromium rounds a box's padding and its margin to a sixty-fourth of a pixel separately.
    // A room that does not land on that grid, added to a box's own padding, rounds differently
    // in the two: 0.35em under a summary moved every list row below a labeled capped title by
    // a sixty-fourth of a pixel.
    const values = [
      ...added().map(({ room }) => room),
      ...RULES.flatMap((rule) =>
        Object.entries(rule.declarations)
          .filter(([property]) => property.endsWith('-ink-room'))
          .map(([, value]) => value),
      ),
      ...['title_max_lines', 'time_max_lines'].flatMap((option) =>
        Object.entries(generateCustomPropertiesObject(buildConfig({ [option]: 2 })))
          .filter(([property]) => property.endsWith('-ink-room'))
          .map(([, value]) => value),
      ),
    ];
    const rooms = new Set(
      values.flatMap((value) => [...value.matchAll(/(\d*\.\d+)em/g)].map((m) => m[1])),
    );
    expect([...rooms].sort()).toEqual(['0.25', '0.375']);
    for (const room of rooms) {
      for (let size = 8; size <= 48; size += 1) {
        expect(Number.isInteger(Number(room) * size * 64), `${room}em at ${size}px`).toBe(true);
      }
    }
  });

  it('is kept by the title only where it clamps itself', () => {
    // Inline, the title takes no room, and a padding there would move the rectangles the card
    // measures a title beside the time by.
    const inline = RULES.filter(
      (rule) => rule.declarations.display === 'inline' && rule.selectors.endsWith('> .event-title'),
    );
    expect(inline.length).toBeGreaterThanOrEqual(3);
    for (const rule of inline) {
      expect(rule.declarations['--calendar-card-title-ink-room'], rule.selectors).toBe('0px');
    }
  });
});

describe('the custom properties that say which kind each box is', () => {
  it.each([
    ['title_max_lines', '--calendar-card-title-overflow'],
    ['time_max_lines', '--calendar-card-time-overflow'],
    ['location_max_lines', '--calendar-card-location-overflow'],
    ['description_max_lines', '--calendar-card-description-overflow'],
  ] as const)('hides the edges for %s only with a limit', (option, property) => {
    expect(generateCustomPropertiesObject(buildConfig())[property]).toBe('visible');
    expect(generateCustomPropertiesObject(buildConfig({ [option]: 1 }))[property]).toBe('hidden');
    expect(generateCustomPropertiesObject(buildConfig({ [option]: 3 }))[property]).toBe('hidden');
  });

  it.each([
    ['title_max_lines', '--calendar-card-title-ink-room'],
    ['time_max_lines', '--calendar-card-time-ink-room'],
  ] as const)('gives a box clamped by %s its room only with a limit', (option, property) => {
    // Without one the title, and a time folded with its countdown, are inline, where padding
    // takes no room but moved where Chromium put the glyphs on the pixel grid.
    expect(generateCustomPropertiesObject(buildConfig())[property]).toBe('0px');
    expect(generateCustomPropertiesObject(buildConfig({ [option]: 2 }))[property]).toBe('0.375em');
  });

  it('turns grid time rows to the unlimited kind, as it does their clamp', () => {
    const rule = RULES.find((candidate) => candidate.selectors === '.grid-event-disclosure');
    expect(rule?.declarations).toMatchObject({
      '--calendar-card-time-max-lines': 'none',
      '--calendar-card-time-overflow': 'visible',
      '--calendar-card-time-ink-room': '0px',
    });
  });
});

/**
 * Marks above and below the line (backlog items 258, 263 and 264).
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
 *   back by a negative margin of the same size, so nothing in the layout moves;
 * - either kind keeps 0.125em of room at its inline edges the same way, for a Thai tone mark past
 *   the last letter, the hook of a "j" past a grid word's edge, and the antialiasing Chromium drew
 *   past a field's first letter (backlog item 263);
 * - the summary that clamps a labeled title's line in list and column view ends at its last line,
 *   its 0.2em below the text a margin, so no piece of the next line shows there (backlog item 264).
 *
 * What either draws can only be seen in a browser; the harnesses that measured it (both engines,
 * list, column and grid) are described in the pull requests. Latin was byte-identical with the
 * room above a line, and the inline room changes it only by ink the inline cut used to take, at a
 * glyph's edge. This file pins the contract they were measured against, whole, so a box dropped
 * from any list, or a room that stops being given back, fails here.
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
    // measures a title beside the time by. Nor at its inline edges, where padding on an inline box
    // moved where Chromium put its glyphs.
    const inline = RULES.filter(
      (rule) => rule.declarations.display === 'inline' && rule.selectors.endsWith('> .event-title'),
    );
    expect(inline.length).toBeGreaterThanOrEqual(3);
    for (const rule of inline) {
      expect(rule.declarations['--calendar-card-title-ink-room'], rule.selectors).toBe('0px');
      expect(rule.declarations['--calendar-card-title-inline-room'], rule.selectors).toBe('0px');
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
    ['title_max_lines', '--calendar-card-title-ink-room', '0.375em'],
    ['time_max_lines', '--calendar-card-time-ink-room', '0.375em'],
    ['title_max_lines', '--calendar-card-title-inline-room', 'var(--calendar-card-inline-room)'],
    ['time_max_lines', '--calendar-card-time-inline-room', 'var(--calendar-card-inline-room)'],
  ] as const)('gives a box clamped by %s its %s only with a limit', (option, property, room) => {
    // Without one the title, and a time folded with its countdown, are inline, where padding
    // takes no room but moved where Chromium put the glyphs on the pixel grid.
    expect(generateCustomPropertiesObject(buildConfig())[property]).toBe('0px');
    expect(generateCustomPropertiesObject(buildConfig({ [option]: 2 }))[property]).toBe(room);
  });

  it('turns grid time rows to the unlimited kind, as it does their clamp', () => {
    const rule = RULES.find((candidate) => candidate.selectors === '.grid-event-disclosure');
    expect(rule?.declarations).toMatchObject({
      '--calendar-card-time-max-lines': 'none',
      '--calendar-card-time-overflow': 'visible',
      '--calendar-card-time-ink-room': '0px',
      '--calendar-card-time-inline-room': '0px',
    });
  });
});

/** Declarations that keep room at a box's inline edges, give it back, or say how much it keeps. */
const INLINE_PROPERTY =
  /^(padding|margin)(-inline(-start|-end)?)?$|^--calendar-card-((title|time|summary)-inline|inline|title-row|event-row|grid-block)-room$/;

/** Every rule that keeps, gives back or sets the room at a box's inline edges, by value. */
function inlineRoomRules(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const { selectors, declarations } of RULES) {
    // The rounded rooms where round() is known are pinned on their own, below.
    const room = Object.fromEntries(
      Object.entries(declarations).filter(
        ([property, value]) =>
          !value.startsWith('round(') &&
          INLINE_PROPERTY.test(property) &&
          /0\.125em|-inline-room|-row-room|-block-room/.test(`${property} ${value}`),
      ),
    );
    if (!Object.keys(room).length) continue;
    expect(out[selectors], `${selectors} keeps its inline room in one rule`).toBeUndefined();
    out[selectors] = room;
  }
  return out;
}

const INLINE_ROOM = 'var(--calendar-card-inline-room)';
const ROOM = { 'padding-inline': INLINE_ROOM, 'margin-inline': `calc(-1 * ${INLINE_ROOM})` };
const SUMMARY_ROOM = 'var(--calendar-card-summary-inline-room)';
const EVENT_ROOM = 'var(--calendar-card-event-row-room)';
const GRID_TEXT_ROOM = 'var(--calendar-card-grid-block-room)';
const SPANS =
  '.time .time-actual > span:not(.time-text):not(.allday-badge):not(.now-time), .location span, ' +
  '.description span';
const SCROLLING = '.summary-scroll > .event-title.title-scrollable';
const ROW_BESIDE_TIME =
  '.time-beside-title > .summary-row.title-wrap > .summary:not(.summary-scroll)';
const COMPACT_MODES = COMPACT.replace(' .summary > .event-title', '');
const WRAPPED_END = '.grid-event-disclosure.grid-time-wrap .time .time-actual .time-end';
const LIMITED = '.grid-event.grid-event-content-limited .grid-event-disclosure';
const GRID_TIME = '.grid-event-disclosure .time, .grid-event-disclosure .time-actual';
const TIME_SPAN = '.time .time-actual > span:not(.time-text):not(.allday-badge):not(.now-time)';
const OUTSIDE = 'outside the event fields this covers, and given no room';
const CUT_ROW = ".time-beside-title > .summary-row.title-wrap[data-title-cut='']";

/**
 * Every rule that cuts a box's inline axis: the rules that keep that box's room, or why it has
 * none. A rule's own padding counts as room where the box has enough of it.
 */
const CUTS_INLINE_AXIS: Record<string, string[] | string> = {
  'ha-card': 'the card, whose padding keeps its rows off its edges',
  '.content-container': 'the scroller, whose rows keep their own padding',
  '.toolbar-month-reserve': OUTSIDE,
  '.toolbar-month-measure': OUTSIDE,
  '.toolbar-month-text': OUTSIDE,
  '.toolbar-range-text': OUTSIDE,
  '.toolbar-legend': OUTSIDE,
  '.legend-chip-label': OUTSIDE,
  '.legend-menu, .custom-menu': OUTSIDE,
  '.column-date-content .weather': OUTSIDE,
  '.time-location .event-weather .weather-condition': OUTSIDE,
  '.grid-axis': OUTSIDE,
  '.grid-axis-sizer': OUTSIDE,
  '.progress-bar': 'no text',
  '.allday-badge, .allday-title-pill': 'a pill, whose own padding is its room',
  '.grid-event, .grid-event-backdrop': 'a block, whose own padding is its room',
  '.summary': ['.summary'],
  '.event-title': ['.event-title'],
  [SCROLLING]: [SCROLLING],
  '.time .time-actual .time-text > span': ['.time .time-actual .time-text > span'],
  [TIME_SPAN]: [SPANS],
  '.location span': [SPANS],
  '.description span': [SPANS],
  // The row a title is cut in beside its time, which clamps in place of its summary.
  [CUT_ROW]: [CUT_ROW],
  '.grid-banner-title': ['.grid-banner-title'],
  '.grid-event-disclosure .summary-row': ['.grid-event-disclosure .summary-row'],
  '.grid-event-disclosure .event-title': ['.grid-event-disclosure .event-title'],
  '.grid-event-disclosure .title-word': ['.grid-event-disclosure .title-word'],
  // .time-text is given overflow: visible by a later rule.
  [`${GRID_TIME}, .grid-event-disclosure .time-text`]: [
    '.grid-event-disclosure .time',
    '.grid-event-disclosure .time-actual',
  ],
  [GRID_TIME]: ['.grid-event-disclosure .time', '.grid-event-disclosure .time-actual'],
  [WRAPPED_END]: [WRAPPED_END],
  [COMPACT]: [COMPACT],
  [LIMITED]: [LIMITED],
};

describe('the room a box keeps at its inline edges (backlog item 263)', () => {
  it('is kept, given back and switched off in these rules, pinned by value', () => {
    expect(inlineRoomRules()).toEqual({
      // The room itself, a whole pixel or more (pinned below), and the room for text set in a
      // size other than the box's own, from the share the card writes on ha-card.
      ':host': { '--calendar-card-inline-room': '1px' },
      'ha-card': {
        '--calendar-card-event-row-room': '1px',
        '--calendar-card-grid-block-room': '1px',
      },
      // The summary's, through a property the row cut beside the time sets to 0px.
      '.summary': {
        '--calendar-card-summary-inline-room': INLINE_ROOM,
        'padding-inline': SUMMARY_ROOM,
        'margin-inline': `calc(-1 * ${SUMMARY_ROOM})`,
      },
      // The separations a summary keeps from a badge beside it measure 12px from its text.
      '.summary:not(:only-child)': { 'margin-inline-end': `calc(12px - ${SUMMARY_ROOM})` },
      ".summary-row:dir(rtl) > .summary[dir='ltr']:not(:only-child), .summary-row:dir(ltr) > .summary[dir='rtl']:not(:only-child)":
        {
          'margin-inline-end': `calc(-1 * ${SUMMARY_ROOM})`,
          'margin-inline-start': `calc(12px - ${SUMMARY_ROOM})`,
        },
      // A hanging indent's padding holds the room as well; the text-indent leaves it out.
      '.summary:has(> .label-icon), .summary:has(> .label-image)': {
        'padding-inline-start': `calc(1em + 4px + ${SUMMARY_ROOM})`,
      },
      '.summary:has(> .label-emoji)': {
        'padding-inline-start': `calc(1.25em + 4px + ${SUMMARY_ROOM})`,
      },
      '.summary.summary-scroll:has(> .label-icon), .summary.summary-scroll:has(> .label-image), .summary.summary-scroll:has(> .label-emoji)':
        { 'padding-inline-start': SUMMARY_ROOM },
      [ROW_BESIDE_TIME]: { 'margin-inline': `calc(-1 * ${SUMMARY_ROOM})` },
      '.grid-event-disclosure .summary': { 'padding-inline-start': SUMMARY_ROOM },
      // The row a title is cut in beside its time cuts in its summary's place, with the title's
      // room, and places the time inside it.
      [CUT_ROW]: {
        'padding-inline': EVENT_ROOM,
        'margin-inline': `calc(-1 * ${EVENT_ROOM})`,
        '--calendar-card-title-row-room': EVENT_ROOM,
      },
      [`${CUT_ROW} > .summary:not(.summary-scroll)`]: {
        '--calendar-card-summary-inline-room': '0px',
      },
      // The title and a time folded with its countdown take it from a property that is 0px
      // wherever either is inline.
      '.event-title': {
        'padding-inline': 'var(--calendar-card-title-inline-room, 0px)',
        'margin-inline': 'calc(-1 * var(--calendar-card-title-inline-room, 0px))',
      },
      '.time .time-actual .time-text > span': {
        'padding-inline': 'var(--calendar-card-time-inline-room, 0px)',
        'margin-inline': 'calc(-1 * var(--calendar-card-time-inline-room, 0px))',
      },
      [SCROLLING]: { '--calendar-card-title-inline-room': INLINE_ROOM },
      '.grid-event-disclosure .event-title': { '--calendar-card-title-inline-room': INLINE_ROOM },
      '.summary:not(.summary-scroll):has(> .event-title:not(:only-child)) > .event-title': {
        '--calendar-card-title-inline-room': '0px',
      },
      '.time-beside-title > .summary-row.title-wrap > .summary > .event-title': {
        '--calendar-card-title-inline-room': '0px',
      },
      '.grid-event-disclosure .summary:not(.summary-scroll):has(> .event-title:not(:only-child)) > .event-title':
        { '--calendar-card-title-inline-room': '0px' },
      '.grid-event-disclosure': { '--calendar-card-time-inline-room': '0px' },
      [SPANS]: ROOM,
      '.grid-banner-title': ROOM,
      // The row around a grid title, in the title's size rather than its own.
      '.grid-event-disclosure .summary-row': {
        'padding-inline': EVENT_ROOM,
        'margin-inline': `calc(-1 * ${EVENT_ROOM})`,
      },
      '.grid-event-disclosure .title-word': ROOM,
      // The row keeps the 12px end margin every .time has, less the room.
      '.grid-event-disclosure .time': {
        'padding-inline': INLINE_ROOM,
        'margin-inline': `calc(-1 * ${INLINE_ROOM}) calc(12px - ${INLINE_ROOM})`,
      },
      '.grid-event-disclosure .time-actual': ROOM,
      [WRAPPED_END]: ROOM,
      [COMPACT]: { padding: `0 ${INLINE_ROOM}`, 'margin-inline': `calc(-1 * ${INLINE_ROOM})` },
      // Its inline start only, in the largest size its rows are set in: its end is where the
      // block covering this one begins.
      [LIMITED]: {
        'padding-inline-start': GRID_TEXT_ROOM,
        'margin-inline-start': `calc(-1 * ${GRID_TEXT_ROOM})`,
      },
    });
  });

  it('is a whole pixel, at least 0.125em of its text, where round() is known, and 1px elsewhere', () => {
    // A whole pixel stays out of every sum it joins: a gutter or a hanging indent it is folded
    // into, which a fraction rounded apart from the margin giving it back, and a width read as
    // clientWidth less the padding, which a fraction moved by half a pixel.
    const rounded = [...CSS.matchAll(/@supports \(width: round\(1px, 1px\)\) \{/g)].flatMap(
      (match) =>
        [...blockAt(match.index!).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
          selectors: normal(selectors),
          declarations: declarationsOf(body),
        })),
    );
    expect(
      rounded.filter(({ declarations }) =>
        Object.keys(declarations).some((property) => INLINE_PROPERTY.test(property)),
      ),
    ).toEqual([
      {
        selectors: ':host',
        declarations: { '--calendar-card-inline-room': 'round(up, 0.125em, 1px)' },
      },
      {
        selectors: 'ha-card',
        declarations: {
          '--calendar-card-event-row-room':
            'round(up, var(--calendar-card-event-inline-room, 0.125em), 1px)',
          '--calendar-card-grid-block-room':
            'round(up, var(--calendar-card-grid-text-inline-room, 0.125em), 1px)',
        },
      },
    ]);
    // And nothing else keeps a room of its own: every one is one of those three, or 0px.
    const rooms = new Set(
      Object.values(inlineRoomRules()).flatMap((room) =>
        Object.values(room).flatMap((value) =>
          [...value.matchAll(/(\d*\.?\d+)(em|px)/g)].map((match) => match[0]),
        ),
      ),
    );
    expect([...rooms].sort()).toEqual(['0px', '12px', '1em', '1px', '1.25em', '4px'].sort());
  });

  it("is in the size of the text a box cuts, where that is not the box's own", () => {
    // Emitted as lengths in the parent's font, as the font size options are written.
    const rooms = (config: Record<string, string>) => {
      const properties = generateCustomPropertiesObject(buildConfig(config));
      return [
        properties['--calendar-card-event-inline-room'],
        properties['--calendar-card-grid-text-inline-room'],
      ];
    };
    expect(rooms({ event_font_size: '14px', time_font_size: '12px' })).toEqual([
      '1.75px',
      'max(1.75px, 1.5px, 1.5px, 1.5px)',
    ]);
    expect(rooms({ event_font_size: '200%', description_font_size: '24px' })).toEqual([
      '0.25em',
      'max(0.25em, 1.5px, 1.5px, 3px)',
    ]);
    // Every size the card accepts, rewritten as a length first as the date column's is: a
    // percentage inside a function as the em it is, a keyword as its length, no !important.
    expect(rooms({ event_font_size: 'calc(200%)', time_font_size: 'calc(1em + 2px)' })).toEqual([
      'calc(0.125 * (calc(2em)))',
      'max(calc(0.125 * (calc(2em))), calc(0.125 * (calc(1em + 2px))), 1.5px, 1.5px)',
    ]);
    expect(rooms({ event_font_size: '10vw', time_font_size: '20px !important' })).toEqual([
      '1.25vw',
      'max(1.25vw, 2.5px, 1.5px, 1.5px)',
    ]);
    expect(rooms({ event_font_size: 'large' })).toEqual([
      '2.4px',
      'max(2.4px, 1.5px, 1.5px, 1.5px)',
    ]);
    // A size naming a custom property keeps the room of the box's own font: what it holds is
    // known only at layout, and a percentage there would make the padding a share of the box's
    // width, and the time beside a cut title placed by another share.
    expect(
      rooms({ event_font_size: 'var(--event-size)', time_font_size: 'var(--x, 14px)' }),
    ).toEqual(['0.125em', 'max(0.125em, 0.125em, 1.5px, 1.5px)']);
  });

  it('is kept by every box that cuts its inline axis around event text, every other one named', () => {
    // Every rule anywhere in the stylesheet that cuts a box's inline axis, reconciled both ways:
    // a box added to them fails here until it keeps the room or says why it does not.
    const rules = inlineRoomRules();
    const cutting = new Set(
      RULES.filter(({ declarations }) =>
        /hidden|clip|auto|scroll/.test(declarations['overflow-x'] ?? declarations.overflow ?? ''),
      ).map(({ selectors }) => selectors),
    );
    expect(Object.keys(CUTS_INLINE_AXIS).sort()).toEqual([...cutting].sort());
    for (const [box, kept] of Object.entries(CUTS_INLINE_AXIS)) {
      if (typeof kept === 'string') continue;
      for (const selectors of kept) expect(rules[selectors], box).toBeDefined();
    }
  });

  it('is taken by none of these boxes where a later rule lays them out inline', () => {
    // Padding on an inline box takes room on its line, and moved where Chromium put its glyphs.
    const zero = (selectors: string) =>
      RULES.filter((rule) => rule.selectors === selectors).map(({ declarations }) => ({
        display: declarations.display,
        padding: declarations['padding-inline'],
        margin: declarations['margin-inline'] ?? declarations['margin-inline-start'],
      }));
    // A countdown folded into the time, which the time's rule would give room.
    expect(zero('.time .time-actual .time-text > .time-countdown')).toEqual([
      { display: 'inline', padding: '0', margin: '4px' },
    ]);
    // Grid's words in the one-line fallback, and an end time a countdown follows.
    expect(zero(`${COMPACT_MODES} .title-word`)).toEqual([
      { display: 'inline', padding: '0', margin: '0' },
    ]);
    expect(zero(`${WRAPPED_END.replace(' .time-end', ' .time-text .time-end')}`)).toEqual([
      { display: 'inline', padding: '0', margin: '0' },
    ]);
    // Nor the summary of a row cut beside its time: the row cuts in its place, and WebKit placed
    // the clamp's "…" by the summary's padding box, a letter further along. Through the summary's
    // property, so a label's hanging indent stays in its padding.
    expect(
      RULES.filter((rule) => rule.selectors === `${CUT_ROW} > .summary:not(.summary-scroll)`),
    ).toEqual([
      {
        selectors: `${CUT_ROW} > .summary:not(.summary-scroll)`,
        declarations: {
          display: 'block',
          overflow: 'visible',
          'padding-bottom': '0',
          '--calendar-card-summary-inline-room': '0px',
        },
      },
    ]);
    let starts = 0;
    for (const { selectors, declarations } of RULES) {
      const start = declarations['padding-inline-start'];
      if (!/(^|[\s>])\.summary[:\s.]|\.summary$/.test(selectors.split(', ').pop()!) || !start)
        continue;
      if (selectors.includes('grid-event:is(')) continue;
      starts += 1;
      expect(start, selectors).toContain(SUMMARY_ROOM);
    }
    expect(starts).toBe(4);
  });

  it('is given back exactly, wherever one rule keeps it and nothing else', () => {
    let pairs = 0;
    for (const [selectors, room] of Object.entries(inlineRoomRules())) {
      for (const side of ['', '-start']) {
        const padding = room[`padding-inline${side}`];
        const margin = room[`margin-inline${side}`];
        // A two-value margin folds a separation into the room; the pin above holds those.
        if (!padding || !margin || splitTopLevel(margin, ' ').length > 1) continue;
        pairs += 1;
        expect(margin, selectors).toBe(
          padding.startsWith('var(') ? `calc(-1 * ${padding})` : `-${padding}`,
        );
      }
    }
    expect(pairs).toBe(11);
  });
});

describe("a summary that clamps a labeled title's line (backlog item 264)", () => {
  const ENDS_AT_LAST_LINE = [
    'td.event .event-content > .summary-row:not(.title-wrap)',
    '.column-events > .event > .event-content > .summary-row:not(.title-wrap)',
  ]
    .map((row) => `${row} > .summary:not(.summary-scroll):has(> .event-title:not(:only-child))`)
    .join(', ');

  it('ends at its last line in list and column view, its space below a margin outside the cut', () => {
    // WebKit and Chromium both drew the top of the next line through 0.2em of bottom padding
    // inside the cut. As a margin of the same size, it takes the place it took.
    const base = RULES.find(
      (rule) => rule.selectors === '.summary' && rule.declarations['padding-block'],
    );
    expect(splitTopLevel(base!.declarations['padding-block'], ' ')[1]).toBe('0.2em');
    expect(RULES.filter((rule) => rule.selectors === ENDS_AT_LAST_LINE)).toEqual([
      {
        selectors: ENDS_AT_LAST_LINE,
        declarations: {
          'padding-bottom': 'calc(0.2em - var(--calendar-card-summary-end-margin, 0px))',
          'margin-bottom': 'var(--calendar-card-summary-end-margin, 0px)',
        },
      },
    ]);
  });

  it('does so only under a limit, where a line is hidden', () => {
    // Without one nothing is hidden, and a mark below the last line keeps the room it had, as
    // in Safari before 16, where the summary hides its overflow whatever the limit.
    const margin = (title_max_lines: number) =>
      generateCustomPropertiesObject(buildConfig({ title_max_lines }))[
        '--calendar-card-summary-end-margin'
      ];
    expect([margin(0), margin(1), margin(3)]).toEqual(['0px', '0.2em', '0.2em']);
  });

  it('is the only rule giving a summary a bottom margin', () => {
    // Grid's summary has no padding below its text, and the row cut beside the time is cut by
    // the card, which reads the padding it keeps.
    const margins = RULES.filter(
      ({ selectors, declarations }) =>
        selectors
          .split(', ')
          // The subject, the last compound once pseudo-class arguments are taken out, is a summary.
          .map((selector) => selector.replace(/\((?:[^()]|\([^()]*\))*\)/g, ''))
          .some((selector) => /(^|[\s>+~])\.summary(?![-\w])[^\s>+~]*$/.test(selector)) &&
        Object.entries(declarations).some(
          ([property, value]) => /^margin(-bottom|-block(-end)?)?$/.test(property) && value !== '0',
        ),
    ).map(({ selectors }) => selectors);
    expect(margins).toEqual([ENDS_AT_LAST_LINE]);
  });
});

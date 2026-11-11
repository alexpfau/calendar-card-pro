/**
 * Marks above and below the line (backlog items 258, 263, 264, 265, 266 and 268).
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
 *   past a field's first letter (backlog item 263), and so does text outside the event fields cut
 *   the same way: the month, a legend chip's name, a day's weather in column and grid view, and a
 *   clamped weather condition (backlog item 266);
 * - the summary that clamps a labeled title's line in list and column view ends at its last line,
 *   its 0.2em below the text a margin, so no piece of the next line shows there (backlog item 264),
 *   and an unlabeled title there, which clamps itself, does the same with its 2px (backlog item 265);
 * - text outside the event fields takes the same remedies above and below its line: the month cuts
 *   the inline axis alone, and a legend chip's name keeps room above and below it, since the card
 *   reads its scrollWidth. A clamped weather condition keeps none above its first line, which
 *   moved it in WebKit (backlog item 268).
 *
 * What either draws can only be seen in a browser; the harnesses that measured it (both engines,
 * list, column and grid) are described in the pull requests. Latin was byte-identical with the
 * room above a line in the event fields; the inline room changes it only by ink the inline cut
 * used to take, at a glyph's edge, and a chip's room only by the descenders its old cut took. This
 * file pins the contract they were measured against, whole, so a box dropped from any list, or a
 * room that stops being given back, fails here.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { renderColumnGroupedEvents } from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import { cardStyles, generateCustomPropertiesObject } from '../src/rendering/styles';
import * as EventUtils from '../src/utils/events';

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
      // The month, which hides only a month too long for its row (backlog item 268). Not a chip's
      // name: the card reads its scrollWidth, which Chromium counts differently in a box that clips.
      '.toolbar-month-text': { ...INLINE_AXIS, 'min-width': '0' },
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
      // A legend chip's name, above and below its line (backlog item 268).
      ...RULES.filter((rule) => rule.selectors === '.legend-chip-label').flatMap((rule) =>
        [rule.declarations['padding-block'], rule.declarations['margin-block']].filter(Boolean),
      ),
    ];
    const rooms = new Set(
      values.flatMap((value) => [...value.matchAll(/(\d*\.\d+)em/g)].map((m) => m[1])),
    );
    expect([...rooms].sort()).toEqual(['0.25', '0.375', '0.5']);
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

  it("gives a weather condition the room only while weather's max_lines makes it a box", () => {
    // Inline, the condition cuts nothing, and padding there would move where Chromium puts its
    // glyphs. So the room follows the display the same option chooses, at every limit.
    const properties = (max_lines: number) =>
      generateCustomPropertiesObject(
        buildConfig({ weather: { entity: 'weather.home', event: { max_lines } } } as never),
      );
    const room = (max_lines: number) => [
      properties(max_lines)['--calendar-card-weather-event-condition-display'],
      properties(max_lines)['--calendar-card-weather-condition-inline-room'],
    ];
    expect(room(0)).toEqual(['inline', '0px']);
    expect(room(1)).toEqual(['-webkit-inline-box', 'var(--calendar-card-inline-room)']);
    expect(room(3)).toEqual(['-webkit-inline-box', 'var(--calendar-card-inline-room)']);
    expect(generateCustomPropertiesObject(buildConfig())).toMatchObject({
      '--calendar-card-weather-condition-inline-room': '0px',
    });
  });
});

/** Declarations that keep room at a box's inline edges, give it back, or say how much it keeps. */
const INLINE_PROPERTY =
  /^(padding|margin)(-inline(-start|-end)?)?$|^--calendar-card-((title|time|summary|weather-condition)-inline|inline|title-row|event-row|grid-block)-room$/;

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
const CUT_ROW = ".time-beside-title > .summary-row.title-wrap[data-title-cut='']";
// Text outside the event fields that is cut at its inline edges (backlog item 266).
const OUTSIDE_TEXT = '.toolbar-month-text, .legend-chip-label, .column-date-content .weather';
const CONDITION = '.time-location .event-weather .weather-condition';
const CONDITION_ROOM = 'var(--calendar-card-weather-condition-inline-room, 0px)';

/**
 * Every rule that cuts a box's inline axis: the rules that keep that box's room, or why it has
 * none. A rule's own padding counts as room where the box has enough of it.
 */
const CUTS_INLINE_AXIS: Record<string, string[] | string> = {
  'ha-card': 'the card, whose padding keeps its rows off its edges',
  '.content-container': 'the scroller, whose rows keep their own padding',
  '.toolbar-month-reserve': 'invisible copies of the month, which keep its room in the row',
  '.toolbar-month-measure': 'invisible copies of the month, which the card measures',
  '.toolbar-month-text': [OUTSIDE_TEXT],
  '.toolbar-range-text': 'the dates read out, never drawn',
  '.toolbar-legend': "the chips' box, whose padding and the chips' own keep their names off it",
  '.legend-chip-label': [OUTSIDE_TEXT],
  '.legend-menu, .custom-menu': 'a menu, whose own padding is its room',
  '.column-date-content .weather': [OUTSIDE_TEXT],
  [CONDITION]: [CONDITION],
  '.grid-axis': 'its own padding is its room (pinned below)',
  '.grid-axis-sizer': 'invisible copies of the labels, which size the axis',
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
      // room, and places the time inside it. Its end margin keeps the 12px every wrapping title's
      // row keeps, so its lines stop where the time ends.
      [CUT_ROW]: {
        'padding-inline': EVENT_ROOM,
        'margin-inline': `calc(-1 * ${EVENT_ROOM}) calc(12px - ${EVENT_ROOM})`,
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
      // Outside the event fields: the month, a chip's name and a day's weather in column and
      // grid view, and a weather condition, through a property that is 0px while it is inline.
      [OUTSIDE_TEXT]: ROOM,
      [CONDITION]: {
        'padding-inline': CONDITION_ROOM,
        'margin-inline': `calc(-1 * ${CONDITION_ROOM})`,
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
    expect(pairs).toBe(12);
  });
});

describe('text outside the event fields (backlog item 266)', () => {
  it("is kept by the grid's time axis in its own padding, for the digits and AM or PM it draws", () => {
    // The axis cuts its labels at its edges, and keeps them off both: the widest label begins at
    // its padding's start, 4px in, and every label ends 8px before its end. Its labels are digits,
    // a colon and AM or PM, which reach past their letters by no more than their antialiasing, so
    // that holds at any size: at 12px to 160px, in either clock and direction, the axis cut none
    // of their ink in Chromium or WebKit. A label in a script whose marks lean, which the axis
    // never draws, would need the room (a Thai one planted at 160px was cut in both engines), so
    // that premise is pinned below. No room of its own, because the width fitter adds exactly this padding to the labels
    // it measures.
    const axis = RULES.find((rule) => rule.selectors === '.grid-axis');
    expect(axis?.declarations).toMatchObject({
      'padding-inline': `${ViewConfig.GRID_AXIS_PADDING_START_PX}px ${ViewConfig.GRID_AXIS_PADDING_END_PX}px`,
      overflow: 'hidden',
    });
    const label = RULES.find((rule) => rule.selectors === '.grid-axis-label');
    expect(label?.declarations).toMatchObject({ position: 'absolute', 'inset-inline-end': '8px' });
    // And no less than the 4px it is, the room of a 32px label, so shrinking it fails here.
    expect(Math.min(ViewConfig.GRID_AXIS_PADDING_START_PX, 8)).toBeGreaterThanOrEqual(0.125 * 32);
  });

  it("draws only digits, a colon and AM or PM on the grid's time axis, in every language", () => {
    // The premise above. A label localized into a script with leaning marks fails here, and needs
    // the axis given the room.
    for (const language of ['en', 'th', 'ar', 'vi', 'ja']) {
      for (const time_24h of [true, false]) {
        const config = buildConfig({
          view: 'grid',
          days_to_show: 1,
          language,
          time_24h,
          time_grid: { start_time: '00:00', end_time: '24:00', axis_label_minutes: 30 },
        } as never);
        const container = document.createElement('div');
        litRender(
          Grid.renderGridGroupedEvents(
            EventUtils.groupEventsByDay([], config, false, language, 'grid'),
            ViewConfig.resolveEffectiveConfig(config, 'grid'),
            language,
            undefined,
            null,
            FROZEN_NOW,
          ),
          container,
        );
        const labels = [...container.querySelectorAll('.grid-axis-label, .grid-axis-sizer span')]
          .map((element) => element.textContent!.trim())
          .filter(Boolean);
        expect(labels.length, `${language} ${time_24h}`).toBeGreaterThanOrEqual(48 * 2);
        for (const text of labels)
          expect(text).toMatch(/^\u2068?\d{1,2}(:\d\d)?(\u00a0[AP]M)?\u2069?$/);
      }
    }
  });

  it('needs none for the dates beside the month, which are read out and never drawn', () => {
    // A 1px box clipped to nothing, pinned whole: without any of it the dates would be drawn, and
    // cut at an edge with no room.
    expect(RULES.find((rule) => rule.selectors === '.toolbar-range-text')?.declarations).toEqual({
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: '0',
      overflow: 'hidden',
      'clip-path': 'inset(50%)',
      'white-space': 'nowrap',
      border: '0',
    });
  });
});

describe('text outside the event fields, above and below its line (backlog item 268)', () => {
  /**
   * Every rule whose subject is `subject`, in any selector of its list, as selector list to
   * declarations: the whole cascade the box takes from this stylesheet, so a later rule that
   * narrows its overflow or takes its room away fails as surely as an edit to the rules pinned.
   */
  function cascadeOf(subject: string): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const { selectors, declarations } of RULES) {
      const subjects = splitTopLevel(selectors, ',').map((selector) =>
        selector.split(/[\s>+~]+/).pop()!,
      );
      if (!subjects.some((last) => new RegExp(`\\${subject}(?![-\\w])`).test(last))) continue;
      out[selectors] = { ...out[selectors], ...declarations };
    }
    return out;
  }

  it('cuts the month along the inline axis alone, its hidden overflow kept where clip is unknown', () => {
    // The month hides only a month too long for its row, so Thai marks above and below it are
    // drawn. The first rule keeps the ellipsis, which the clip draws as the hidden overflow did,
    // and is all a browser without overflow: clip reads; the second, inside the @supports, wins.
    expect(cascadeOf('.toolbar-month-text')).toEqual({
      '.toolbar-month-text': {
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        ...INLINE_AXIS,
        'min-width': '0',
      },
      [OUTSIDE_TEXT]: ROOM,
    });
    expect(
      RULES.filter((rule) => rule.selectors === '.toolbar-month-text').map((r) => r.declarations),
    ).toEqual([
      { overflow: 'hidden', 'text-overflow': 'ellipsis' },
      { ...INLINE_AXIS, 'min-width': '0' },
    ]);
  });

  it("keeps a chip's name a box that hides its overflow, with room above and below its line", () => {
    // markShortenedChips reads the name's scrollWidth against its clientWidth to tell a name cut
    // short. Chromium leaves the end padding out of the scrollWidth of a box that clips, so a name
    // too long by less than that padding would read as fitting and lose its tooltip; the name
    // keeps its hidden overflow, and room given back by a margin of the same size, so the chip and
    // the name's margin box stay where they were.
    expect(cascadeOf('.legend-chip-label')).toEqual({
      '.legend-chip-label': {
        'min-width': '0',
        'max-width': '14em',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        'padding-block': '0.5em',
        'margin-block': '-0.5em',
      },
      [OUTSIDE_TEXT]: ROOM,
    });
  });

  it("keeps as much room as a clamping box, and what the chip's shorter line takes off", () => {
    // A clamping box's 0.375em clears the marks measured past a line 1.2em tall. A chip's line is
    // as tall as its line height says, so the same marks reach further past it by half the
    // difference, on each side.
    const lineHeights = RULES.filter(
      (rule) => rule.selectors === '.legend-chip' && rule.declarations['line-height'],
    ).map((rule) => Number(rule.declarations['line-height']));
    expect(lineHeights).toHaveLength(1);
    const room = parseFloat(cascadeOf('.legend-chip-label')['.legend-chip-label']['padding-block']);
    expect(room).toBeGreaterThanOrEqual(0.375 + (1.2 - lineHeights[0]) / 2);
  });

  it('keeps no room above or below a clamped weather condition', () => {
    // It clamps as an inline box, which places itself on its line by its own lines. Room above
    // them, given back by a margin or not, moved it on its line by a sixty-fourth of a pixel in
    // WebKit at some sizes and fonts and redrew its Latin; below its last line is where the line
    // the clamp hides begins. So its marks above stay cut, and only its inline edges keep room.
    expect(cascadeOf('.weather-condition')).toEqual({
      [CONDITION]: {
        display: 'var(--calendar-card-weather-event-condition-display)',
        '-webkit-box-orient': 'vertical',
        '-webkit-line-clamp': 'var(--calendar-card-weather-event-max-lines)',
        overflow: 'hidden',
        hyphens: 'manual',
        'padding-inline': CONDITION_ROOM,
        'margin-inline': `calc(-1 * ${CONDITION_ROOM})`,
      },
    });
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

describe('an unlabeled title that clamps itself (backlog item 265)', () => {
  const ENDS_AT_LAST_LINE = [
    'td.event .event-content > .summary-row:not(.title-wrap)',
    '.column-events > .event > .event-content > .summary-row:not(.title-wrap)',
  ]
    .map((row) => `${row} > .summary:not(.summary-scroll) > .event-title:only-child`)
    .join(', ');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A computed length in px: a plain length, or a calc() that only adds and subtracts px. */
  function px(value: string): number {
    return [...value.matchAll(/([-+]?)\s*(\d*\.?\d+)px/g)].reduce(
      (sum, [, sign, amount]) => sum + (sign === '-' ? -1 : 1) * Number(amount),
      0,
    );
  }

  /**
   * Each title the view draws, by its text, as its bottom padding and margin once the stylesheet
   * and the emitted properties are resolved over it. happy-dom resolves the cascade and var(), so
   * this sees a rule that stops reaching the title as well as one that overrides it.
   */
  function bottoms(view: 'list' | 'column', config: Partial<Types.Config>) {
    const cfg = buildConfig({
      entities: ['calendar.anna', { entity: 'calendar.ben', label: 'Ben' }],
      days_to_show: 1,
      title_max_lines: 2,
      ...config,
    });
    const events = ['calendar.anna', 'calendar.ben'].map((id, index) => ({
      summary: id === 'calendar.anna' ? 'Anna' : 'Ben',
      start: { dateTime: `2026-06-17T1${index}:00:00Z` },
      end: { dateTime: `2026-06-17T1${index}:30:00Z` },
      _entityId: id,
      _matchedConfig: cfg.entities[index] as Types.EntityConfig,
    }));
    const days = EventUtils.groupEventsByDay(events, cfg, false, 'en', view);
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = cardStyles.cssText;
    const card = document.createElement('div');
    for (const [property, value] of Object.entries(generateCustomPropertiesObject(cfg))) {
      card.style.setProperty(property, value);
    }
    root.append(style, card);
    litRender(
      view === 'list'
        ? Render.renderGroupedEvents(days, cfg, 'en')
        : renderColumnGroupedEvents(days, cfg, 'en'),
      card,
    );
    const out = Object.fromEntries(
      Array.from(root.querySelectorAll<HTMLElement>('.event-title')).map((title) => {
        const computed = getComputedStyle(title);
        return [title.textContent!.trim(), [px(computed.paddingBottom), px(computed.marginBottom)]];
      }),
    );
    host.remove();
    return out;
  }

  it('ends at its last line in list and column view, its 2px below a margin outside the cut', () => {
    // Its own clamping box held them as padding inside its cut, where WebKit and Chromium both
    // drew the top of the next line. As a margin of the same size, they take the place they took.
    const base = RULES.filter(
      (rule) => rule.selectors === '.event-title' && rule.declarations['padding-bottom'],
    );
    expect(base.map((rule) => rule.declarations['padding-bottom'])).toEqual(['2px']);
    expect(RULES.filter((rule) => rule.selectors === ENDS_AT_LAST_LINE)).toEqual([
      {
        selectors: ENDS_AT_LAST_LINE,
        declarations: {
          'padding-bottom': 'calc(2px - var(--calendar-card-title-end-margin, 0px))',
          'margin-bottom': 'var(--calendar-card-title-end-margin, 0px)',
        },
      },
    ]);
  });

  it('does so only under a limit, where a line is hidden', () => {
    // Without one the title is inline and nothing is hidden, so it keeps its padding as it was.
    const margin = (title_max_lines: number) =>
      generateCustomPropertiesObject(buildConfig({ title_max_lines }))[
        '--calendar-card-title-end-margin'
      ];
    expect([margin(0), margin(1), margin(3)]).toEqual(['0px', '2px', '2px']);
  });

  it.each(['list', 'column'] as const)(
    'reaches the unlabeled title in %s view under a limit, and nothing else',
    (view) => {
      // As [padding, margin] below the title. A labeled title is inline in the summary that
      // clamps it (backlog item 264); beside the time the card cuts the row, and a scrolling title
      // keeps to one line, with no padding beside a label. Each keeps what it had, as does a title
      // without a limit.
      expect(bottoms(view, {})).toEqual({ Anna: [0, 2], Ben: [2, 0] });
      expect(bottoms(view, { title_max_lines: 0 })).toEqual({ Anna: [2, 0], Ben: [2, 0] });
      expect(bottoms(view, { time_position: 'title' })).toEqual({ Anna: [2, 0], Ben: [2, 0] });
      expect(bottoms(view, { scroll_long_titles: true })).toEqual({ Anna: [2, 0], Ben: [0, 0] });
    },
  );

  it('is the only rule giving a title a bottom margin', () => {
    // Grid's word fit takes the words it hides out of the layout, and its cut drops the 2px.
    const margins = RULES.filter(
      ({ selectors, declarations }) =>
        selectors
          .split(', ')
          .map((selector) => selector.replace(/\((?:[^()]|\([^()]*\))*\)/g, ''))
          .some((selector) => /(^|[\s>+~])\.event-title(?![-\w])[^\s>+~]*$/.test(selector)) &&
        Object.entries(declarations).some(
          ([property, value]) => /^margin(-bottom|-block(-end)?)?$/.test(property) && value !== '0',
        ),
    ).map(({ selectors }) => selectors);
    expect(margins).toEqual([ENDS_AT_LAST_LINE]);
  });
});

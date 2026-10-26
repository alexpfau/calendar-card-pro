/**
 * The legend's pure halves: where its menu goes, and which calendars it lists.
 *
 * The menu is placed by coordinates the browser reports, so a placement that is wrong at one
 * edge of the viewport is invisible at every other. Each case here names the edge it is the
 * only one to reach. How the card opens, keeps and closes the menu is in `legend.test.ts`.
 *
 * The button leads the action row, so the menu lines its inline start up with the button's:
 * the left edges in a card read left to right, the right edges in one read right to left.
 */

import { describe, expect, it } from 'vitest';

import { type Rect, legendCalendarIds, placeMenu } from '../src/rendering/legend';

/** A 36px button whose box starts at `left`, `top`. */
function button(left: number, top: number): Rect {
  return { left, top, right: left + 36, bottom: top + 36 };
}

const VIEWPORT = { width: 400, height: 800 };
const MENU = { width: 200, height: 300 };

describe('where the menu goes', () => {
  it("opens below its button with its left edge on the button's, left to right", () => {
    expect(placeMenu(button(40, 50), MENU, VIEWPORT, false)).toEqual({
      left: 40,
      top: 90,
      maxHeight: undefined,
    });
  });

  it("puts its right edge on the button's when the card reads right to left", () => {
    // The button ends at 336, so the menu starts 200px before that.
    expect(placeMenu(button(300, 50), MENU, VIEWPORT, true)).toEqual({
      left: 136,
      top: 90,
      maxHeight: undefined,
    });
  });

  it('stays inside the viewport at its start edge', () => {
    // Left to right, its left edge on the button's would sit 4px from the viewport's edge.
    expect(placeMenu(button(4, 50), MENU, VIEWPORT, false).left).toBe(8);
    // Right to left, its right edge on the button's would sit 6px past the viewport's.
    expect(placeMenu(button(370, 50), MENU, VIEWPORT, true).left).toBe(192);
  });

  it('stays inside the viewport at its end edge', () => {
    // Left to right, its left edge on the button's would put its right edge 100px past the
    // viewport's.
    expect(placeMenu(button(300, 50), MENU, VIEWPORT, false).left).toBe(192);
    // Right to left, its right edge on the button's would put its left edge 84px off the
    // viewport's.
    expect(placeMenu(button(80, 50), MENU, VIEWPORT, true).left).toBe(8);
  });

  it('keeps its left edge inside a viewport narrower than itself, whichever way it reads', () => {
    const wide = { width: 500, height: 100 };

    expect(placeMenu(button(10, 50), wide, VIEWPORT, false).left).toBe(8);
    expect(placeMenu(button(10, 50), wide, VIEWPORT, true).left).toBe(8);
  });

  it('opens above its button when only there is room', () => {
    expect(placeMenu(button(40, 600), MENU, VIEWPORT, false)).toEqual({
      left: 40,
      top: 296,
      maxHeight: undefined,
    });
  });

  it('takes the roomier side, and a height that fits there, when neither is enough', () => {
    const tall = { width: 200, height: 700 };

    // 402px below this button, against 338px above.
    expect(placeMenu(button(40, 350), tall, VIEWPORT, false)).toEqual({
      left: 40,
      top: 390,
      maxHeight: 402,
    });
    // 398px above a button lower down, against 342px below: it ends right above the button.
    expect(placeMenu(button(40, 410), tall, VIEWPORT, false)).toEqual({
      left: 40,
      top: 8,
      maxHeight: 398,
    });
  });
});

describe('the calendars a legend lists', () => {
  it('lists each calendar once, in the order the configuration first names it', () => {
    expect(
      legendCalendarIds([
        'calendar.anna',
        { entity: 'calendar.ben' },
        { entity: 'calendar.anna' },
        'calendar.family',
      ]),
    ).toEqual(['calendar.anna', 'calendar.ben', 'calendar.family']);
  });

  it('skips an entry that names no calendar', () => {
    expect(
      legendCalendarIds([
        '',
        { entity: '' },
        null as unknown as string,
        { entity: 'calendar.anna' },
      ]),
    ).toEqual(['calendar.anna']);
  });
});

/**
 * The legend's pure halves: where its menu goes, what it is painted, and which calendars it
 * lists.
 *
 * The menu is placed by coordinates the browser reports, so a placement that is wrong at one
 * edge of the viewport is invisible at every other. Each case here names the edge it is the
 * only one to reach. How the card opens, keeps and closes the menu is in `legend.test.ts`.
 *
 * The button leads the action row, so the menu lines its inline start up with the button's:
 * the left edges in a card read left to right, the right edges in one read right to left.
 */

import { describe, expect, it } from 'vitest';

import {
  type Rect,
  type Rgba,
  gradientColors,
  legendCalendarIds,
  opaqueMenuSurface,
  placeMenu,
} from '../src/rendering/legend';

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

/**
 * What the menu is painted, from the colors a canvas reads back: each channel and the alpha
 * 0–255. The values are the themes' own, so each case is a theme someone runs.
 */
describe("the menu's surface", () => {
  const WHITE_INK: Rgba = [255, 255, 255, 255];
  const DARK_INK: Rgba = [33, 33, 33, 255];

  it("leaves an opaque surface to the stylesheet, so an opaque theme's menu is untouched", () => {
    // Home Assistant's default dark theme, whatever the page and the text.
    expect(opaqueMenuSurface([28, 28, 28, 255], [17, 17, 17, 255], WHITE_INK)).toBeUndefined();
    expect(opaqueMenuSurface([255, 255, 255, 255], undefined, undefined)).toBeUndefined();
  });

  it("lays a see-through surface over the theme's page color", () => {
    // A dark card at 40% over a dark gray page: 10 × 0.4 + 44 × 0.6, and 46 for blue.
    expect(opaqueMenuSurface([10, 10, 10, 102], [44, 44, 46, 255], WHITE_INK)).toBe(
      'rgb(30, 30, 32)',
    );
    // A light card at 40% over a light gray page.
    expect(opaqueMenuSurface([245, 245, 245, 102], [229, 229, 234, 255], DARK_INK)).toBe(
      'rgb(235, 235, 238)',
    );
  });

  it('keeps white text readable on a gray card at 30% in a light mode with a dark page', () => {
    // The case a black-or-white base chosen by the color scheme gets wrong: the scheme says
    // light, the text is white, and the page under it is dark.
    expect(opaqueMenuSurface([128, 128, 128, 77], [84, 80, 76, 255], WHITE_INK)).toBe(
      'rgb(97, 94, 92)',
    );
  });

  it('is the page color itself under a card background that is fully transparent', () => {
    expect(opaqueMenuSurface([0, 0, 0, 0], [250, 250, 250, 255], DARK_INK)).toBe(
      'rgb(250, 250, 250)',
    );
  });

  it('falls back to black under light text and white under dark text, with no page color', () => {
    // The same gray card at 30%, and no page color to lay it over: the text decides.
    expect(opaqueMenuSurface([128, 128, 128, 77], undefined, WHITE_INK)).toBe('rgb(39, 39, 39)');
    expect(opaqueMenuSurface([128, 128, 128, 77], undefined, DARK_INK)).toBe('rgb(217, 217, 217)');
    // No text color read either: white, Home Assistant's default card.
    expect(opaqueMenuSurface([0, 0, 0, 0], undefined, undefined)).toBe('rgb(255, 255, 255)');
  });

  it('lays a see-through page color over that fallback, so the result is always opaque', () => {
    // A page color at 50% over black under light text, and over white under dark text.
    expect(opaqueMenuSurface([0, 0, 0, 0], [20, 20, 20, 128], WHITE_INK)).toBe('rgb(10, 10, 10)');
    expect(opaqueMenuSurface([0, 0, 0, 0], [20, 20, 20, 128], DARK_INK)).toBe('rgb(137, 137, 137)');
  });
});

describe("the colors of a gradient the menu's surface may be", () => {
  it('reads no colors where there is no image', () => {
    expect(gradientColors('none')).toEqual([]);
    expect(gradientColors('')).toEqual([]);
  });

  it('reads every stop of a gradient, however its color is written', () => {
    // As browsers serialize a computed gradient: angles and positions around the colors.
    expect(
      gradientColors('linear-gradient(90deg, rgb(18, 52, 86) 0%, rgba(0, 0, 0, 0.5) 100%)'),
    ).toEqual(['rgb(18, 52, 86)', 'rgba(0, 0, 0, 0.5)']);
    expect(
      gradientColors(
        'radial-gradient(circle, color(srgb 0.1 0.2 0.3) 10%, oklch(0.5 0.1 200 / 0.4), transparent)',
      ),
    ).toEqual(['color(srgb 0.1 0.2 0.3)', 'oklch(0.5 0.1 200 / 0.4)', 'transparent']);
  });

  it('reads the stops of every layer', () => {
    expect(
      gradientColors(
        'linear-gradient(#123456, #fedcba), linear-gradient(rgb(1, 2, 3), rgba(4, 5, 6, 0.5))',
      ),
    ).toEqual(['#123456', '#fedcba', 'rgb(1, 2, 3)', 'rgba(4, 5, 6, 0.5)']);
  });

  it('cannot read an image, or a stop the browser left unresolved', () => {
    // An image's opacity is in its pixels, and currentColor is the text's color only in place.
    expect(gradientColors('url("https://example.com/card.png")')).toBeUndefined();
    expect(
      gradientColors('linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6)), url("a.png")'),
    ).toBeUndefined();
    expect(gradientColors('linear-gradient(currentcolor, rgb(4, 5, 6))')).toBeUndefined();
    expect(
      gradientColors('linear-gradient(color-mix(in srgb, currentcolor 50%, red), red)'),
    ).toBeUndefined();
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

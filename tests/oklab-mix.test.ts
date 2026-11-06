import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';

/**
 * Every color-mix() in the card stylesheet goes toward the theme's text or card color, which
 * is usually a gray. In OKLCH a gray still carries a hue angle, and Chrome 131 and earlier
 * interpolate it as real: the Now pill's green came out beige on Chrome 119 to 124 and gold
 * on 125 to 131 (#742). Where the theme's gray is slightly tinted, current Chrome and Safari
 * pull the accent's hue toward the tint as well. Oklab has no hue, so the accent keeps its
 * own, and against a true gray it computes the same color OKLCH does in a current browser.
 */
describe('color mixes keep the accent hue (#742)', () => {
  const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const spaces = [...css.matchAll(/color-mix\(\s*in\s+([a-z-]+)/gi)].map((m) => m[1].toLowerCase());

  it('finds the mixes, so the check below is not vacuous', () => {
    expect(spaces).toContain('oklab');
  });

  it('never mixes in a polar space, whose hue a gray can move', () => {
    expect(spaces.filter((space) => ['oklch', 'lch', 'hsl', 'hwb'].includes(space))).toEqual([]);
  });
});

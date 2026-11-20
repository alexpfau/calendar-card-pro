import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';

/**
 * Every color-mix() in the card stylesheet goes toward the theme's text or card color, which
 * is usually a gray. In OKLCH a gray still carries a hue angle, and Chrome 131 and earlier
 * interpolate it as real: the Now pill's green came out beige on Chrome 119 to 124 and gold
 * on 125 to 131 (#742). Safari 16 does the same, and drew the today tile olive rather than
 * light blue there: a 2023 WebKit build mixes #03a9f4 into white at hue 128 in OKLCH, and at
 * 238 in Oklab, its own hue being 239. Where the theme's gray is slightly tinted, current
 * Chrome and Safari pull the accent's hue toward the tint as well. Oklab has no hue, so the
 * accent keeps its own, and against a true gray it computes the same color OKLCH does in a
 * current browser.
 */

const POLAR = ['oklch', 'lch', 'hsl', 'hwb'];

/** The interpolation space of every color-mix() in a text. */
const spacesIn = (text: string): string[] =>
  [...text.matchAll(/color-mix\(\s*in\s+([a-z-]+)/gi)].map((m) => m[1].toLowerCase());

/** Every `.ts` file under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('color mixes keep the accent hue (#742)', () => {
  const spaces = spacesIn(cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, ''));

  it('finds the mixes, so the check below is not vacuous', () => {
    expect(spaces).toContain('oklab');
  });

  it('never mixes in a polar space, whose hue a gray can move', () => {
    expect(spaces.filter((space) => POLAR.includes(space))).toEqual([]);
  });

  it('mixes in no polar space anywhere else in src/ either', () => {
    const root = join(process.cwd(), 'src');
    const files = sourceFiles(root).map((path) => ({
      file: relative(root, path),
      spaces: spacesIn(readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')),
    }));
    // The popover, the search panel and the custom properties the card writes mix as well.
    expect(files.filter(({ spaces: s }) => s.length > 0).length).toBeGreaterThan(3);
    expect(
      files.flatMap(({ file, spaces: s }) =>
        s.filter((space) => POLAR.includes(space)).map((space) => `${file}: ${space}`),
      ),
    ).toEqual([]);
  });
});

/**
 * The relative-color tiers put back the chroma a mix spent, and they scale it as Oklab's a and b,
 * never as OKLCH's c. Below a chroma of about 0.02 Chromium (measured in Chrome 157) converts a
 * mix to OKLCH with no hue, reads that missing hue as 0, and scaling c then paints hue 0: the
 * all-day badge's wash of Home Assistant's default blue came out pink, and the ink of a muted
 * calendar color mauve, while Safari kept the hue. Scaling a and b scales chroma at the same hue,
 * and Oklab has no hue to lose. An OKLCH relative color that sets c outright, as the filled
 * badge's 0 does, has no hue to keep and is left alone.
 */
describe('relative colors restore chroma without a hue Chromium can drop', () => {
  const css = cardStyles.cssText.replace(/\/\*[\s\S]*?\*\//g, '');

  /** The channel list of every relative color in `css` written in a polar space. */
  const polarChannels = [...css.matchAll(/\b(?:oklch|lch)\(\s*from\s/gi)].map((match) => {
    let depth = 0;
    for (let i = match.index; i < css.length; i++) {
      if (css[i] === '(') depth++;
      else if (css[i] === ')' && --depth === 0) return css.slice(match.index, i + 1);
    }
    return css.slice(match.index);
  });

  it('scales chroma as a and b in every tier that restores it', () => {
    const scaled = [
      ...css.matchAll(/calc\(\s*a\s*\*\s*([\d.]+)\s*\)\s+calc\(\s*b\s*\*\s*\1\s*\)/g),
    ];
    // The today tile's wash and ink, a set week pill's number, the accent ink, the Now ink, and
    // the badge's ink and wash.
    expect(scaled.map((match) => match[1]).sort()).toEqual([
      '1.8',
      '1.8',
      '2.2',
      '2.2',
      '2.2',
      '2.2',
      '2.2',
    ]);
  });

  it('scales no OKLCH chroma, which keeps a hue Chromium may have dropped', () => {
    expect(polarChannels.length).toBeGreaterThan(0);
    expect(polarChannels.filter((channels) => /\bc\s*\*|\*\s*c\b/.test(channels))).toEqual([]);
  });
});

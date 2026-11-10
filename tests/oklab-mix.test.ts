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

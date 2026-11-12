import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { declarations } from './helpers/css-declarations';
import { cardStyles } from '../src/rendering/styles';

/**
 * Safari 16.4 and 16.5 crash the page's whole process on a color-mix() of currentColor that has
 * to be resolved while styles are built, which is what happens to one in `color` (WebKit bug
 * 256171) and in a box-shadow, a text-shadow, a gradient or a drop-shadow (WebKit bug 257255);
 * 16.6 fixed both. A background-color keeps the mix and resolves it where it is used, and is
 * safe. In the Home Assistant app the whole dashboard goes down with "Connection lost".
 *
 * The card writes two such mixes, the washes a tinted event takes under the pointer and when
 * pressed, and column and grid draw them as an inset box-shadow, so a tap on a tinted grid event
 * crashed those Safari versions. Measured in a WebKit build from between the two commits: the
 * box-shadow and color forms crash the page, the background-color form does not.
 *
 * Pinned in two halves. Every currentColor mix in `src/` is the value of a custom property,
 * named below by value, so a new one, or one written straight into a declaration, fails here.
 * And every declaration reading one of those properties is a background-color, or sits behind
 * content-visibility, which Safari first enabled by default in 18.0.
 *
 * That covers the colors the card writes, not ones a user or a theme supplies, and those cannot
 * be covered here. The card mixes a user's color into a `color` as well as a shadow or a
 * gradient: in the same WebKit build an `accent_color` of currentColor crashed a press on a grid
 * or column event through the ripple color, a `today_indicator_color` of plain currentColor
 * crashed the page on load through the today tile's ink, and so did a theme's `--primary-color`
 * of currentColor. Safari 16.6 fixed both bugs and added nothing a `@supports` can test, so any
 * fence around 16.4 and 16.5 also takes in 16.6 and 16.7, the last update of every device that
 * stops at iOS 16, and would draw each of those mixes plainly there. That is a larger cost than
 * a crash on two versions that every device running them can update past.
 */

const CURRENT_MIX = /color-mix\((?:[^()]|\([^()]*\))*?\bcurrentcolor\b(?:[^()]|\([^()]*\))*\)/gi;
const SAFE_PROPERTIES = new Set(['background-color']);
const GATE = '@supports (content-visibility: auto)';

/** Every `.ts` file under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** The source with block comments removed, and line comments where a line opens with one. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const ROOT = join(process.cwd(), 'src');

/** A reading of a custom property, however the var() is wrapped. */
const reading = (name: string): RegExp => new RegExp(`var\\(\\s*${name}(?![\\w-])`, 'g');

/**
 * Every currentColor mix in `src/`, with the custom property it is written to, read from the
 * text just before it: `'--name'] =` in a style object, or `--name:` in a stylesheet.
 */
function currentColorMixes(): Array<{ where: string; property: string | null }> {
  return sourceFiles(ROOT).flatMap((path) => {
    const text = code(path);
    return [...text.matchAll(CURRENT_MIX)].map((m) => {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 120), m.index);
      const name = /(--[a-z0-9-]+)['"]?\]?\s*[:=]\s*['"`]?\s*$/i.exec(before);
      return { where: relative(ROOT, path), property: name ? name[1] : null };
    });
  });
}

describe('color-mix() of currentColor on Safari 16.4 and 16.5 (WebKit 256171, 257255)', () => {
  const mixes = currentColorMixes();
  const properties = [...new Set(mixes.map(({ property }) => property))].sort();
  const readers = declarations(cardStyles.cssText).filter((d) =>
    properties.some((name) => name !== null && reading(name).test(d.value)),
  );

  it('writes every one to a custom property, and these two only', () => {
    expect(mixes.map(({ where }) => where)).toEqual([
      join('rendering', 'styles.ts'),
      join('rendering', 'styles.ts'),
    ]);
    expect(properties).toEqual([
      '--calendar-card-event-wash-hover',
      '--calendar-card-event-wash-pressed',
    ]);
  });

  it('finds the readers, a box-shadow among them, so the check below is not vacuous', () => {
    expect(readers.some((d) => d.property === 'box-shadow')).toBe(true);
    expect(readers.some((d) => d.property === 'background-color')).toBe(true);
  });

  it('reads them outside content-visibility only in a background-color', () => {
    const unsafe = readers
      .filter((d) => !SAFE_PROPERTIES.has(d.property) && !d.at.includes(GATE))
      .map((d) => `${d.selectors.join(', ')} { ${d.property} }`);
    expect(unsafe).toEqual([]);
  });

  it('overrides an ungated wash with each gated one, from later in the sheet', () => {
    const all = declarations(cardStyles.cssText);
    const outside = (at: readonly string[]): string => at.filter((p) => p !== GATE).join(' | ');
    const gated = readers.filter((d) => d.at.includes(GATE));
    expect(gated.length).toBeGreaterThan(0);
    const unbased = gated
      .filter(
        (g) =>
          !all.some(
            (b) =>
              !b.at.includes(GATE) &&
              b.property === g.property &&
              outside(b.at) === outside(g.at) &&
              g.selectors.every((s) => b.selectors.includes(s)) &&
              b.index < g.index,
          ),
      )
      .map((g) => `${g.selectors.join(', ')} { ${g.property} }`);
    expect(unbased).toEqual([]);
  });

  it('reads them nowhere but the card stylesheet, which the check above reads', () => {
    const uses = (text: string): number =>
      properties.reduce((n, name) => n + (name ? [...text.matchAll(reading(name))].length : 0), 0);
    const inSource = sourceFiles(ROOT).reduce((n, path) => n + uses(code(path)), 0);
    expect(inSource).toBe(readers.length);
  });
});

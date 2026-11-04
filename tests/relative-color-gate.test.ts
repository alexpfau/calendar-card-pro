import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cardStyles } from '../src/rendering/styles';

/**
 * Safari 16.4 to 17.6 parse a relative color whose origin is a color-mix() by handing the mix
 * to the system-color lookup as if it were a keyword, and on Safari 16 that can crash the
 * page's whole process (#731). They do pass `@supports (color: oklch(from red l c h))`,
 * because a plain origin works, so that probe alone admits them. An origin written as var()
 * is no safer, since a user's or a theme's color can resolve to a mix. Every relative color
 * therefore sits behind a second condition, content-visibility, which Safari first enabled by
 * default in 18.0.
 *
 * The probe cannot simply name a color-mix() origin instead: evaluating that condition runs
 * the same parser code. Both halves are pinned here.
 */

const RELATIVE_COLOR = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*from\s/gi;

/** The CSS with comments removed, since a comment may name the construct without using it. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The preludes of the blocks enclosing `index`, outermost first, and the text between the
 * last boundary and `index`, which is an at-rule's prelude when `index` sits inside one.
 *
 * @param css - Comment-free CSS
 * @param index - Offset of the construct
 * @returns The enclosing preludes, and the open fragment before `index`
 */
function context(css: string, index: number): { preludes: string[]; fragment: string } {
  const preludes: string[] = [];
  let start = 0;
  for (let i = 0; i < index; i++) {
    const ch = css[i];
    if (ch === '{') {
      preludes.push(css.slice(start, i).trim().replace(/\s+/g, ' '));
      start = i + 1;
    } else if (ch === '}') {
      preludes.pop();
      start = i + 1;
    } else if (ch === ';') {
      start = i + 1;
    }
  }
  return { preludes, fragment: css.slice(start, index).trim() };
}

/** Whether an `@supports` prelude requires content-visibility, and nothing weaker. */
function requiresContentVisibility(prelude: string): boolean {
  const p = prelude.toLowerCase();
  return (
    p.startsWith('@supports') &&
    /\band \(content-visibility: auto\)/.test(p) &&
    !/\b(?:or|not)\b/.test(p)
  );
}

/**
 * Whether every relative color a condition names takes a plain origin: a named color or a hex
 * value. Anything computed (a function, currentcolor) reaches the faulty code.
 */
function namesOnlyPlainOrigins(prelude: string): boolean {
  return [...prelude.matchAll(/\bfrom\s+([^\s)]+)/gi)].every(([, origin]) =>
    /^(?!currentcolor$)(?:[a-z]+|#[0-9a-f]{3,8})$/i.test(origin),
  );
}

/** Every `@supports` prelude in the CSS. */
function supportsPreludes(css: string): string[] {
  return [...css.matchAll(/@supports\b([^{]*)\{/gi)].map((m) => m[1].trim());
}

/** Every `.ts` file under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('relative colors on Safari 16.4 to 17.6 (#731)', () => {
  const css = stripComments(cardStyles.cssText);
  const declarations = [...css.matchAll(RELATIVE_COLOR)]
    .map((m) => ({ index: m.index ?? 0, ...context(css, m.index ?? 0) }))
    .filter(({ fragment }) => !fragment.startsWith('@'));

  it('finds the construct, so the checks below are not vacuous', () => {
    expect(declarations.length).toBeGreaterThan(0);
  });

  it('gates every relative color behind content-visibility as well', () => {
    const ungated = declarations
      .filter(({ preludes }) => !preludes.some(requiresContentVisibility))
      .map(({ preludes }) => preludes[preludes.length - 1]);
    expect(ungated).toEqual([]);
  });

  it('probes relative color only with a plain origin', () => {
    expect(supportsPreludes(css).filter((p) => !namesOnlyPlainOrigins(p))).toEqual([]);
  });

  it('uses relative colors nowhere but the card stylesheet, which the checks above read', () => {
    const root = join(process.cwd(), 'src');
    const uses = new RegExp(RELATIVE_COLOR.source, 'i');
    const elsewhere = sourceFiles(root)
      .filter((path) => !path.endsWith(join('rendering', 'styles.ts')))
      .filter((path) => uses.test(stripComments(readFileSync(path, 'utf8'))))
      .map((path) => relative(root, path));
    expect(elsewhere).toEqual([]);
  });
});

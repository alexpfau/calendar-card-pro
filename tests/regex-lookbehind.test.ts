import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Safari before 16.4 cannot parse a regular expression lookbehind, and a literal one is a
 * syntax error when the bundle loads: the whole card fails to define, on every view, not just
 * the code that uses it (#735). iOS 15 devices that cannot update further still run such a
 * Safari, so the source must not contain one. This pins the card's own code, and names the
 * file; `npm run check:bundle` scans the built files too, which is what catches one a
 * dependency brings in.
 */

/** Every `.ts` file under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const LOOKBEHIND = /\(\?<[=!]/;

describe('regular expressions Safari 15 can parse (#735)', () => {
  const root = join(process.cwd(), 'src');
  const files = sourceFiles(root);

  it('reads the source, so the check below is not vacuous', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(LOOKBEHIND.test('/(?<=a)b/')).toBe(true);
    expect(LOOKBEHIND.test('/(?<!a)b/')).toBe(true);
    expect(LOOKBEHIND.test('/(?<name>a)/')).toBe(false);
  });

  it('uses no lookbehind anywhere in the card or its editor', () => {
    const found = files
      .filter((path) =>
        LOOKBEHIND.test(readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')),
      )
      .map((path) => relative(root, path));
    expect(found).toEqual([]);
  });
});

/**
 * The stylesheets' block structure.
 *
 * A style rule that loses its closing brace swallows every rule after it: the next selector
 * reads as a declaration the browser discards, or as a nested rule under the wrong parent, and
 * the rules below stop applying. Nothing else here would notice. The CSS is a string inside a
 * tagged template, so `tsc`, ESLint and Prettier never parse it, and happy-dom's CSSOM recovers
 * silently. A merge dropped the brace after `.entry-notice` this way, and the editor's live
 * region went on showing its announcements at the foot of every dialog.
 *
 * Neither stylesheet uses CSS nesting, so the structure is strict: braces balance, and only an
 * at-rule (`@media`, `@supports`, `@keyframes`) holds a block. A style rule holding one is the
 * signature of a missing `}`, even where a stray `}` further down evens the count.
 */

import { describe, expect, it } from 'vitest';

import editorStyles from '../src/rendering/editor/styles';
import { cardStyles } from '../src/rendering/styles';

interface Block {
  readonly prelude: string;
  readonly parents: ReadonlyArray<string>;
}

interface Scan {
  readonly blocks: Block[];
  readonly problems: string[];
}

/**
 * Walks a stylesheet's blocks, comments and strings skipped.
 *
 * @param cssText - The stylesheet's text
 * @returns Every block with the preludes enclosing it, and every structural problem found
 */
function scan(cssText: string): Scan {
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '""');
  const blocks: Block[] = [];
  const problems: string[] = [];
  const stack: string[] = [];
  let since = 0;

  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '{') {
      const prelude = text.slice(since, at).split(/[;}]/).pop()!.replace(/\s+/g, ' ').trim();
      const parent = stack[stack.length - 1] as string | undefined;
      // A `@keyframes` step (`from`, `50%`) opens inside an at-rule, so it passes.
      if (parent !== undefined && !parent.startsWith('@')) {
        problems.push(`"${prelude}" opens inside the style rule "${parent}"`);
      }
      blocks.push({ prelude, parents: [...stack] });
      stack.push(prelude);
      since = at + 1;
    } else if (char === '}') {
      if (stack.length === 0) problems.push(`a "}" closes nothing at offset ${at}`);
      else stack.pop();
      since = at + 1;
    }
  }
  if (stack.length > 0) problems.push(`left open: ${stack.map((p) => `"${p}"`).join(', ')}`);

  return { blocks, problems };
}

const SHEETS = [
  ['editor', editorStyles.cssText, ['.live-region', '.jump', '.entry-notice']],
  ['card', cardStyles.cssText, [':host', '.day-table', '.event']],
] as const;

describe('stylesheet structure', () => {
  for (const [name, cssText, landmarks] of SHEETS) {
    describe(`the ${name} stylesheet`, () => {
      it('balances its braces, and nests blocks only in at-rules', () => {
        const { blocks, problems } = scan(cssText);

        // The denominator: a scan that found nothing would agree with any stylesheet.
        expect(blocks.length).toBeGreaterThan(30);
        expect(problems).toEqual([]);
      });

      it.each(landmarks)('keeps %s a rule of its own, outside any style rule', (selector) => {
        const found = scan(cssText).blocks.filter((block) =>
          block.prelude.split(',').some((part) => part.trim() === selector),
        );

        expect(found.length, selector).toBeGreaterThan(0);
        expect(
          found.filter((block) => block.parents.some((parent) => !parent.startsWith('@'))),
        ).toEqual([]);
      });
    });
  }
});

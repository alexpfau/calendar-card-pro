/**
 * One declaration in a stylesheet, with the rules around it.
 */
export interface Declaration {
  /** The enclosing at-rule preludes, outermost first, whitespace collapsed. */
  readonly at: readonly string[];
  /** The selectors of the style rule holding it, one entry per comma-separated part. */
  readonly selectors: readonly string[];
  /** The property, lowercased; a custom property keeps its leading dashes. */
  readonly property: string;
  /** The value, whitespace collapsed. */
  readonly value: string;
  /** Where it starts in the stylesheet, so two in one sheet compare in cascade order. */
  readonly index: number;
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * A selector list split at its top-level commas, so `:is(a, b)` stays whole.
 *
 * @param list - The style rule's prelude
 * @returns Each selector, whitespace collapsed
 */
function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(collapse(list.slice(start, i)));
      start = i + 1;
    }
  }
  parts.push(collapse(list.slice(start)));
  return parts;
}

/**
 * Every declaration in a stylesheet's text, with the at-rules and selectors around it.
 *
 * Read as text rather than through the CSSOM, for the reason `stylesheet.test.ts` gives:
 * happy-dom's parser drops values it does not know, which here would be the very values under
 * test. Comments are removed first, and quotes and parentheses are tracked, so a `;` or a brace
 * inside a string or a function does not end anything.
 *
 * @param css - A stylesheet's `cssText`
 * @returns The declarations, in source order
 */
export function declarations(css: string): Declaration[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Declaration[] = [];
  const stack: string[] = [];
  let start = 0;
  let parens = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') parens++;
    else if (ch === ')') parens--;
    if (parens > 0) continue;

    if (ch === '{') {
      stack.push(collapse(text.slice(start, i)));
      start = i + 1;
    } else if (ch === ';' || ch === '}') {
      const chunk = text.slice(start, i).trim();
      const rule = stack[stack.length - 1];
      const colon = chunk.indexOf(':');
      if (chunk && rule !== undefined && !rule.startsWith('@') && colon > 0) {
        out.push({
          at: stack.slice(0, -1).filter((prelude) => prelude.startsWith('@')),
          selectors: splitSelectors(rule),
          property: chunk.slice(0, colon).trim().toLowerCase(),
          value: collapse(chunk.slice(colon + 1)),
          index: start,
        });
      }
      if (ch === '}') stack.pop();
      start = i + 1;
    }
  }

  return out;
}

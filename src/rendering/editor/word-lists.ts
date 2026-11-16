/**
 * Word lists as terms: the RegExp source `blocklist`, `allowlist` and Countries To Remove store,
 * read as the plain words and phrases a person typed, and written back from them.
 *
 * DOM-free. Split This Calendar writes its words through these, and a pattern the card cannot
 * compile is flagged at its field through `compiles`, which builds it exactly as the card does.
 */

/** The characters that mean something in a RegExp source, outside a character class. */
const META = /[\\^$.*+?()[\]{}|]/g;

/**
 * One pattern matching any of the terms, each taken literally: escaped, joined with `|`. Terms
 * are trimmed, and an empty one is left out, since it would match every event.
 *
 * @param terms - Words or phrases
 * @returns The pattern; empty for no terms
 */
export function toPattern(terms: ReadonlyArray<string>): string {
  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => term.replace(META, '\\$&'))
    .join('|');
}

/**
 * The terms a pattern matches, where it is nothing but terms joined with `|`, each written
 * literally or with its metacharacters escaped, as `toPattern` writes them.
 *
 * @param pattern - A stored pattern
 * @returns The terms, none for an empty pattern; undefined for an expression, which stays one
 */
export function fromPattern(pattern: string): ReadonlyArray<string> | undefined {
  // Only an empty pattern is no list: a space is a pattern, and the card applies it.
  if (pattern === '') return [];
  const terms: string[] = [];
  let term = '';
  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at];
    if (char === '\\') {
      const next = pattern[at + 1];
      // Only an escaped metacharacter is a literal one; `\d` or `\b` is an expression.
      if (next === undefined || !/[\\^$.*+?()[\]{}|/]/.test(next)) return undefined;
      term += next;
      at++;
    } else if (char === '|') {
      terms.push(term);
      term = '';
    } else if (/[\^$.*+?()[\]{}]/.test(char)) {
      return undefined;
    } else {
      term += char;
    }
  }
  terms.push(term);
  // An empty or space-padded alternative matches differently from the words it would read as.
  return terms.every((each) => each !== '' && each === each.trim()) ? terms : undefined;
}

/**
 * A pattern matching whatever either matches. Two plain lists of terms join as one list, so a
 * merged blocklist still reads as words; anything else is grouped, `(?:a)|(?:b)`.
 *
 * @param a - A pattern
 * @param b - Another
 * @returns The pattern matching either
 */
export function orPatterns(a: string, b: string): string {
  if (a === '') return b;
  if (b === '') return a;
  const first = fromPattern(a);
  const second = fromPattern(b);
  if (first !== undefined && second !== undefined) {
    return toPattern([...first, ...second.filter((term) => !first.includes(term))]);
  }
  return `(?:${a})|(?:${b})`;
}

/**
 * Whether the card can read a pattern: built exactly as it builds a word list,
 * `new RegExp(pattern, 'i')`. A pattern that throws there is skipped by the card, with only a
 * warning in the browser's console.
 *
 * @param pattern - A stored pattern
 * @returns False where the card ignores it
 */
export function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch {
    return false;
  }
}

/**
 * Per-calendar text replacement: rewriting one field of an event for display (#153, #212).
 *
 * Three keys, and the interesting part is that two of them are **independently optional**,
 * so the four combinations mean four different things rather than one thing with defaults:
 *
 * | `replace_pattern` | `replace_with` | Result                          |
 * | ----------------- | -------------- | ------------------------------- |
 * | set               | unset          | the match is **removed**        |
 * | set               | set            | the match is **replaced**       |
 * | unset             | set            | the **whole field** is replaced |
 * | unset             | unset          | nothing happens                 |
 *
 * 🚨 The third row is what makes the first one reachable, and it is forced by the editor
 * rather than chosen for symmetry. `isSet` in `rendering/editor/synthetic.ts` counts the
 * empty string as unset and `toEntityConfig` drops any key that fails it, so the visual
 * editor **cannot store an empty string**. Spelling deletion as `replace_with: ''` would
 * therefore have put #153's own first example — strip `Geburtstag von ` off a birthday —
 * out of reach of every user who does not hand-edit YAML. Giving the absent replacement
 * its own meaning costs nothing and makes the whole feature usable from the editor.
 *
 * Deliberately pure — no DOM, no Lit and no config lookups, in the same spirit as
 * `event-age.ts` and `start-date.ts`. The caller resolves the three values off the
 * `_matchedConfig` stamp and decides which field each one applies to.
 */

import * as Logger from './logger';
import * as Types from '../config/types';

/**
 * One calendar's configured rewrite.
 *
 * Both text fields are optional here for the same reason they are optional in the config:
 * which of them is present *is* the instruction. `field` is resolved rather than optional,
 * because its absent state is a real field — the title — and not an absence of one.
 */
export interface TextReplacement {
  readonly field: Types.ReplaceField;
  readonly pattern?: string;
  readonly replacement?: string;
}

/** What applying a rewrite produced, and whether it kept anything of the original. */
export interface ReplacementResult {
  /** The text to draw. */
  readonly text: string;
  /**
   * Whether the field was replaced outright rather than edited.
   *
   * Carried out of here because a whole-field replacement is a statement about the event's
   * own text no longer being shown, which one caller acts on: `groupEventsByDay` suppresses
   * #124's age count on a title that was replaced wholesale, so #212's `Busy` cannot render
   * as `Busy (40)` and announce that the hidden event is a birthday.
   */
  readonly replacedWholeField: boolean;
}

/**
 * Compiled patterns, including the ones that failed to compile.
 *
 * Exactly `compileCountryPattern`'s bargain in `format.ts`, and for exactly its reasons.
 * The option is free text in the editor and unvalidated in YAML, so it may not be a valid
 * regular expression at all; compiling is attempted once per distinct pattern and the
 * outcome remembered, a `null` entry marking one known to be broken. This runs on the
 * render path rather than the fetch path — once per event, per render — so without the
 * cache a malformed pattern would warn on every row of every frame, and a valid one would
 * be recompiled just as often.
 */
const patternCache = new Map<string, RegExp | null>();

/**
 * Compiles a replacement pattern, tolerating an invalid one.
 *
 * `g` is the point of the feature: @Tom-10101 on #212 asks for a *repeating* fragment
 * removed from a generated title, which a first-match replace would leave behind on the
 * second occurrence. `i` is consistency — `blocklist`, `allowlist` and
 * `remove_location_country` are the card's three other user-supplied patterns and all three
 * compile case-insensitively, so a pattern lifted from one of them has to keep working
 * here. The alternative failure is the worse one: a case-sensitive rewrite that silently
 * does nothing looks like the option is broken.
 *
 * Caching a global expression is safe **only** because it is used with `String.replace`,
 * which resets `lastIndex` to zero as part of the operation. The same cached object handed
 * to `.test()` would advance its own `lastIndex` between calls and start skipping matches.
 *
 * @param pattern - User-supplied pattern
 * @returns The compiled expression, or `null` when it is not a valid regular expression
 */
function compilePattern(pattern: string): RegExp | null {
  if (patternCache.has(pattern)) return patternCache.get(pattern) ?? null;

  let compiled: RegExp | null = null;

  try {
    compiled = new RegExp(pattern, 'gi');
  } catch {
    Logger.warn(
      `Ignoring "replace_pattern": ${JSON.stringify(pattern)} is not a valid regular ` +
        `expression. Event text is shown unchanged.`,
    );
  }

  patternCache.set(pattern, compiled);

  return compiled;
}

/**
 * Reads a value that is only meaningful when it is not empty.
 *
 * The editor cannot produce an empty string, but YAML can, and the two have to agree about
 * what one means. Folding it into "unset" here makes `replace_pattern: ''` a whole-field
 * replacement in a hand-written config exactly as omitting the key is in the editor —
 * rather than a pattern that matches at every position and, being global, would splice the
 * replacement between every pair of characters.
 *
 * @param value - Value as configured
 * @returns The value, or undefined when it is absent or empty
 */
function present(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Builds one calendar's rewrite from its configured values.
 *
 * @param field - Configured `replace_field`; unset means the title
 * @param pattern - Configured `replace_pattern`
 * @param replacement - Configured `replace_with`
 * @returns The rewrite, or `null` when this calendar has nothing to do
 */
export function resolveTextReplacement(
  field: Types.ReplaceField | undefined,
  pattern: string | undefined,
  replacement: string | undefined,
): TextReplacement | null {
  const from = present(pattern);
  const to = present(replacement);

  // The fourth row of the table. Naming a field on its own is not an instruction, so a
  // calendar carrying only `replace_field` is indistinguishable from one carrying nothing —
  // which is what lets the caller skip the whole thing on one null check.
  if (from === undefined && to === undefined) return null;

  return {
    field: field === 'location' || field === 'description' ? field : 'title',
    pattern: from,
    replacement: to,
  };
}

/**
 * Applies a rewrite to one field's text.
 *
 * **An empty field stays empty.** This rewrites text an event carries; it does not give an
 * event a location or a description it never had. Without the guard, a whole-field
 * replacement would put the same text on every event on the calendar rather than on the
 * ones the user was looking at, and `show_description` being off by default means most of
 * them would be invisible while still being wrong.
 *
 * With a pattern, this is `String.replace`, so `$1` and `$&` carry their usual meaning in
 * the replacement and a literal `$` is written `$$`. Replacing the whole field takes the
 * text verbatim instead — there are no groups for it to reference.
 *
 * @param text - The field's text, after any formatting the card does of its own
 * @param rule - The calendar's rewrite, or `null` when it has none
 * @param field - Which field this text is
 * @returns The text to draw, and whether it replaced the field outright
 */
export function applyTextReplacement(
  text: string,
  rule: TextReplacement | null,
  field: Types.ReplaceField,
): ReplacementResult {
  if (rule === null || rule.field !== field || text === '') {
    return { text, replacedWholeField: false };
  }

  if (rule.pattern === undefined) {
    return { text: rule.replacement ?? '', replacedWholeField: true };
  }

  const compiled = compilePattern(rule.pattern);

  // A pattern that does not compile leaves the text alone, the way an uncompilable
  // `blocklist` leaves the event list alone rather than emptying it: a broken pattern
  // should cost the user their rewrite, never their content.
  if (compiled === null) return { text, replacedWholeField: false };

  return { text: text.replace(compiled, rule.replacement ?? ''), replacedWholeField: false };
}

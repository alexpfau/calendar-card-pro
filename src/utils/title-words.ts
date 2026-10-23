/**
 * Splitting a grid title into the pieces it may wrap between.
 *
 * A grid block can be narrower than one word of its title. The browser's only answer for
 * that is to break inside the word, so "Sprint planning" in a 30px lane read as "Sprin / t /
 * plann". Grid titles therefore wrap only at spaces, and a word too wide for its lane is cut
 * and ends in "…". CSS cannot put an ellipsis on one word of a wrapped paragraph, so each
 * word gets an element of its own; this module decides where those elements begin and end.
 *
 * DOM-free on purpose, so the rules can be tested exhaustively without a layout engine.
 */

/** One piece of a title, in order. Joining every `text` gives back the title exactly. */
export interface TitleSegment {
  /**
   * `word` is drawn as a unit that is cut with an ellipsis rather than broken. `space` is a
   * breaking space between words. `text` is left to the browser's own line breaking: runs in
   * scripts written without spaces between words, where breaking between characters is how
   * the text wraps and an ellipsis would hide almost all of it.
   */
  kind: 'word' | 'space' | 'text';
  text: string;
}

/**
 * Breaking whitespace only. The no-break spaces (U+00A0, U+2007, U+202F) stay inside their
 * word, because `Dr. Smith` written with one says not to break there, and a word boundary
 * would hand the browser exactly that break.
 */
const BREAKING_SPACE = /([^\S\u00A0\u2007\u202F]+)/u;

/**
 * Scripts written without spaces between words. A piece containing any of them is left to
 * the browser, because a run mixing them with Latin text ("会議Room") still has nowhere
 * else to wrap. The rest of the same title is still split into words, so a Latin word
 * beside it is cut with an ellipsis like any other.
 */
const NO_SPACE_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/**
 * Scripts written right to left. A title containing any of them is not split at all.
 *
 * Each word is an atomic inline box, and the bidirectional algorithm orders those by the
 * direction of the line they sit in rather than by the script inside them. Split, a Hebrew
 * title on a left-to-right dashboard read its words backwards, and one mixing directions
 * can never be ordered right as separate boxes. Left as one text run, the browser orders it
 * as it always did, and break-word wraps it as before.
 */
const RIGHT_TO_LEFT_SCRIPT =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;

/**
 * Between a letter or digit and a hyphen or dash, and the letter or digit after it. A
 * compound such as `Parent-teacher` can then still wrap after its hyphen, where the browser
 * would have wrapped it, instead of being cut as one word. A leading dash (`-5°C`) and a
 * spaced dash are left alone.
 */
const AFTER_HYPHEN = /(?<=[\p{L}\p{N}][-\u2010\u2013\u2014])(?=[\p{L}\p{N}])/u;

/**
 * Split a title into the words it may wrap between.
 *
 * @param title - The title as it is shown
 * @returns The pieces, in order; empty for an empty title
 */
export function splitTitleWords(title: string): TitleSegment[] {
  if (RIGHT_TO_LEFT_SCRIPT.test(title)) return title ? [{ kind: 'text', text: title }] : [];

  return title.split(BREAKING_SPACE).flatMap((piece, index): TitleSegment[] => {
    if (piece === '') return [];
    if (index % 2 === 1) return [{ kind: 'space', text: piece }];
    if (NO_SPACE_SCRIPT.test(piece)) return [{ kind: 'text', text: piece }];
    return piece.split(AFTER_HYPHEN).map((text) => ({ kind: 'word', text }));
  });
}

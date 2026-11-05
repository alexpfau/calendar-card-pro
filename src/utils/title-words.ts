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
 * beside it is cut with an ellipsis like any other. The one exception is the first word of
 * a title opening in Thai or a neighbor of it (`DICTIONARY_SCRIPT`).
 */
const NO_SPACE_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/**
 * Scripts written right to left. A title containing any of them is not split into words,
 * but for its first.
 *
 * Each word is an atomic inline box, and the bidirectional algorithm orders those by the
 * direction of the line they sit in rather than by the script inside them. Split, a Hebrew
 * title on a left-to-right dashboard read its words backwards, and one mixing directions
 * can never be ordered right as separate boxes. Left as one text run, the browser orders it
 * as it always did, and break-word wraps it as before.
 *
 * The first word is the exception, because it is the one a label shares its line with: left
 * in the run, a first word wider than what the label leaves wraps below it and leaves the
 * label alone on the first line. As a box of its own it can be narrowed to that room and cut
 * (leadGridTitles in grid-title-fit.ts). One box at the start of the title is ordered right
 * whatever the line's direction: the title takes its own direction from its first letter
 * (`dir="auto"`), and a box opening a paragraph sits at its start.
 */
const RIGHT_TO_LEFT_SCRIPT =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;

/**
 * Scripts written without spaces whose lines break between words rather than between
 * characters: the browser finds the words with a dictionary. Han and kana break between any
 * two characters, so a run of them fills the line beside a label; a run in one of these
 * leaves the label alone on its line when its first word does not fit beside it, so that
 * first word is split off (`leadingRun`).
 */
/** A letter in any script: what makes a piece of a title a word rather than a time or a mark. */
const LETTER = /\p{L}/u;

const DICTIONARY_SCRIPT = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

const Segmenter = (
  Intl as typeof Intl & {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: 'word' },
    ) => { segment(value: string): Iterable<{ segment: string }> };
  }
).Segmenter;

/** Word boundaries, as the browser's own line breaker finds them in those scripts. */
const WORDS = Segmenter ? new Segmenter(undefined, { granularity: 'word' }) : null;

/**
 * A run in a dictionary script, its first word split off as a word of its own and the rest
 * left to the browser; the run untouched where it does not open with such a word, or where
 * the browser has no word segmenter.
 *
 * @param run - A piece of the title with no breaking space in it
 * @returns Its pieces, in order
 */
function leadingRun(run: string): TitleSegment[] {
  // Whatever opens the run before its first letter, an emoji say, goes with the first word.
  let word = '';
  for (const { segment } of WORDS ? WORDS.segment(run) : []) {
    word += segment;
    if (!LETTER.test(segment)) continue;
    if (!DICTIONARY_SCRIPT.test(segment)) break;
    const rest = run.slice(word.length);
    return rest
      ? [
          { kind: 'word', text: word },
          { kind: 'text', text: rest },
        ]
      : [{ kind: 'word', text: word }];
  }
  return [{ kind: 'text', text: run }];
}

/**
 * Between a letter or digit and a hyphen or dash, and the letter or digit after it. A
 * compound such as `Parent-teacher` can then still wrap after its hyphen, where the browser
 * would have wrapped it, instead of being cut as one word. A leading dash (`-5°C`) and a
 * spaced dash are left alone.
 */
const AFTER_HYPHEN = /(?<=[\p{L}\p{N}][-\u2010\u2013\u2014])(?=[\p{L}\p{N}])/u;

/**
 * The direction a title reads in, from its first letter or direction mark, as `dir="auto"`
 * decides it. Only for the scripts `RIGHT_TO_LEFT_SCRIPT` names; a right-to-left script it does
 * not reads left to right here.
 *
 * @param title - The title as it is shown
 * @returns Its direction, or undefined for a title with no letter in it
 */
export function titleDirection(title: string): 'ltr' | 'rtl' | undefined {
  // A direction mark is as strong as a letter: LEFT-TO-RIGHT MARK, then RIGHT-TO-LEFT MARK and
  // ARABIC LETTER MARK.
  const strong = title.match(/[\p{L}\u200E\u200F\u061C]/u)?.[0];
  if (!strong) return undefined;
  if (strong === '\u200E') return 'ltr';
  if (strong === '\u200F' || strong === '\u061C') return 'rtl';
  return RIGHT_TO_LEFT_SCRIPT.test(strong) ? 'rtl' : 'ltr';
}

/**
 * Split a title into the words it may wrap between.
 *
 * @param title - The title as it is shown
 * @returns The pieces, in order; empty for an empty title
 */
export function splitTitleWords(title: string): TitleSegment[] {
  const pieces = title.split(BREAKING_SPACE);
  // Pieces alternate: text at even indexes, the breaking space between them at odd ones. The
  // lead is the first with a letter in it, so a time or an emoji opening the title ("10:00",
  // "📅") is not taken for its first word.
  const lead = pieces.findIndex((piece, index) => index % 2 === 0 && LETTER.test(piece));

  if (RIGHT_TO_LEFT_SCRIPT.test(title)) {
    // Words up to and including the lead, split after a hyphen as any word is; the rest one run.
    const words = lead === -1 ? pieces.length : lead + 1;
    const after = pieces.slice(words);
    const rest = after.slice(1).join('');
    return [
      ...pieces
        .slice(0, words)
        .flatMap((piece, index): TitleSegment[] =>
          piece === ''
            ? []
            : index % 2 === 1
              ? [{ kind: 'space', text: piece }]
              : piece.split(AFTER_HYPHEN).map((text) => ({ kind: 'word', text })),
        ),
      ...(after.length && after[0] ? [{ kind: 'space' as const, text: after[0] }] : []),
      ...(rest ? [{ kind: 'text' as const, text: rest }] : []),
    ];
  }

  return pieces.flatMap((piece, index): TitleSegment[] => {
    if (piece === '') return [];
    if (index % 2 === 1) return [{ kind: 'space', text: piece }];
    if (NO_SPACE_SCRIPT.test(piece)) {
      return index === lead ? leadingRun(piece) : [{ kind: 'text', text: piece }];
    }
    return piece.split(AFTER_HYPHEN).map((text) => ({ kind: 'word', text }));
  });
}

/**
 * Text with its links found: bare web addresses, and the `<a href>` links calendars such as
 * Google's write into descriptions.
 *
 * The result is plain text and link pieces for a Lit template to draw, never markup: text goes
 * through a text binding and a link's address through an attribute, so nothing in an event
 * can become an element. Only `http` and `https` links are kept as links; any other scheme,
 * `javascript:` included, is drawn as its words.
 */

import { stripHtmlTags } from './format';

//-----------------------------------------------------------------------------
// TYPES
//-----------------------------------------------------------------------------

/** A run of plain text, or a link with the words drawn for it. */
export type TextPiece = { text: string } | { text: string; href: string };

/** A calendar's anchor: its `href`, entities still encoded, and its words as written. */
interface Anchor {
  readonly href: string;
  readonly words: string;
}

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * An `<a>` element: the attributes of its start tag, and its words.
 *
 * 🚨 Every part stops at the next `<`, and the words stop at the next `<a`, so each attempt
 * that fails gives up at the next tag rather than at the end of the description. Anyone who
 * can write to a calendar writes its descriptions, and an earlier pattern backtracked
 * catastrophically on markup that never closes: 18 KB of `<a href="` repeated held a tab for
 * 37 seconds, and 105 KB of unclosed anchors for 280 ms on every render, where this takes about
 * a millisecond.
 *
 * 🚨 **The `href` is read afterwards, from the attributes alone (`HREF`), not here.** Read
 * here, its value's alternatives sat between the attributes and the `>`, so on a start tag
 * with no `>` a long bare value was handed back one character at a time, and the rest of the
 * tag was read again for each one: quadratic in the length of the tag, seconds for a few tens
 * of KB. A tag that did close was read again the same way for each character of its value
 * when its words never reached a `</a>`. With nothing to choose between before the `>`, a tag
 * either closes or fails in one read, and every alternative of `HREF` ends where the tag does.
 * An `<a>` with no `href` matches too, and `markAnchors` leaves it as it was, which is what
 * the pattern this replaced did by not matching it: no anchor can start inside one, so
 * stepping over it misses nothing.
 */
const ANCHOR = /<a\b([^<>]*)>((?:(?!<a\b)[\s\S])*?)<\/a\s*>/gi;

/**
 * The `href` among an anchor's attributes, with its quoted, single-quoted or bare value: the
 * first `href` that has one. An `href` holding `<` or `>` is no link a calendar writes.
 */
const HREF = /\bhref\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s<>]+))/i;

/** Words that are a web address and nothing else, which may only link to themselves. */
const URL_WORDS = /^https?:\/\/[^\s<>"']+$/i;

/** A web address in running text, up to the first space or angle bracket or quote. */
const BARE_URL = /\bhttps?:\/\/[^\s<>"']+/gi;

/** Punctuation that ends a sentence, and so an address it follows. */
const SENTENCE_END = /[.,;:!?'"]/;

/** Markup that ends a line, kept as a line break so a description keeps its paragraphs. */
const LINE_ENDING_MARKUP = /<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr)\s*>/gi;

/** The private-use characters an anchor's mark is made of: the first and the last. */
const PRIVATE_USE = [0xe000, 0xf8ff] as const;

//-----------------------------------------------------------------------------
// PUBLIC API
//-----------------------------------------------------------------------------

/**
 * A link's address when it may be drawn as one: `http` or `https` only.
 *
 * @param href - An address, entities already decoded
 * @returns The address, or undefined
 */
export function safeHref(href: string): string | undefined {
  const value = href.trim();
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/**
 * How many times a character occurs in a string.
 *
 * @param text - The string
 * @param char - The character
 * @returns The count
 */
function countOf(text: string, char: string): number {
  return text.split(char).length - 1;
}

/**
 * A web address without what follows it in the sentence: trailing punctuation, and each
 * closing parenthesis while the address closes more than it opened.
 *
 * The parentheses are counted once and the count kept as each one comes off. Counting them
 * again for every character taken off read the whole address once per character, which made a
 * run of `)` after an address quadratic in its length: seconds for a few tens of KB, on text
 * anyone who can write to a calendar controls.
 *
 * @param found - An address as `BARE_URL` found it
 * @returns The address the text links to
 */
function trimAddress(found: string): string {
  const opened = countOf(found, '(');
  let closed = countOf(found, ')');
  let end = found.length;
  for (;;) {
    const last = found.charAt(end - 1);
    if (SENTENCE_END.test(last)) {
      end--;
    } else if (last === ')' && closed > opened) {
      closed--;
      end--;
    } else {
      return found.slice(0, end);
    }
  }
}

/**
 * Split plain text at its web addresses. Trailing punctuation that ends a sentence stays text,
 * and a closing parenthesis stays with the address only while the address opened as many.
 *
 * @param text - Plain text
 * @returns The pieces, in order
 */
export function linkPlainText(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(BARE_URL)) {
    const url = trimAddress(match[0]);
    const start = match.index ?? 0;
    if (start > last) pieces.push({ text: text.slice(last, start) });
    pieces.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

/**
 * Text with each of its `<a href>` anchors replaced by a mark naming it: its number between
 * `open` and `close`, which the card picks so the text holds neither (`markOwnAnchors`).
 *
 * Exported so `tests/links.test.ts` can compare it with the pattern it replaced.
 *
 * @param raw - The text as the calendar delivered it
 * @param open - The character a mark opens with
 * @param close - The character it closes with
 * @returns The marked text, and the anchors in the order their marks number them
 */
export function markAnchors(
  raw: string,
  open = '\uE000',
  close = '\uE001',
): { marked: string; anchors: Anchor[] } {
  const anchors: Anchor[] = [];
  const marked = raw.replace(ANCHOR, (anchor: string, attributes: string, words: string) => {
    const href = HREF.exec(attributes);
    if (!href) return anchor;
    anchors.push({ href: href[1] ?? href[2] ?? href[3] ?? '', words });
    return `${open}${anchors.length - 1}${close}`;
  });
  return { marked, anchors };
}

/**
 * Two private-use characters the text does not hold, to mark where its anchors stood with:
 * neither as written nor as a character reference, which `stripHtmlTags` decodes once the
 * anchors are marked. No calendar character is out of reach of whoever writes to it, so a fixed
 * pair was itself text that could be written, and was then taken for a mark: dropped, or drawn
 * as an anchor's words in its place. Read in one pass, however many of them the text holds.
 *
 * @param raw - The text as the calendar delivered it
 * @returns The opening and closing characters, or undefined where the text holds every one
 */
function markCharacters(raw: string): readonly [string, string] | undefined {
  const text = raw.includes('&#') ? raw + stripHtmlTags(raw) : raw;
  const used = new Set<number>();
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code >= PRIVATE_USE[0] && code <= PRIVATE_USE[1]) used.add(code);
  }
  const free: string[] = [];
  for (let code = PRIVATE_USE[0]; code <= PRIVATE_USE[1] && free.length < 2; code++) {
    if (!used.has(code)) free.push(String.fromCharCode(code));
  }
  return free.length === 2 ? [free[0], free[1]] : undefined;
}

/**
 * The text with its anchors marked in characters it does not hold, the anchors, and the pattern
 * that finds a mark. Text that holds every such character is marked nowhere: it keeps every
 * word, and no anchor of it links.
 *
 * @param raw - The text as the calendar delivered it
 * @returns The marked text, its anchors, and the pattern of their marks
 */
function markOwnAnchors(raw: string): { marked: string; anchors: Anchor[]; mark: RegExp } {
  const marks = markCharacters(raw);
  if (!marks) return { marked: raw, anchors: [], mark: /(?!)/ };
  const [open, close] = marks;
  return { ...markAnchors(raw, open, close), mark: new RegExp(`${open}(\\d+)${close}`) };
}

/**
 * The pieces a calendar's anchor stands for.
 *
 * Words that are themselves a web address link to that address and nowhere else, whatever
 * the `href` says: `<a href="https://elsewhere.example">https://bank.example</a>` would
 * otherwise show one address and open another, and anyone who can write to a calendar can
 * write that. Other words keep the anchor's link, where it may be drawn as one.
 *
 * @param href - The anchor's `href`, entities still encoded
 * @param words - Its words, as plain text
 * @returns The pieces, which join to `words`
 */
function anchorPieces(href: string, words: string): TextPiece[] {
  if (URL_WORDS.test(words.trim())) return linkPlainText(words);
  const safe = safeHref(stripHtmlTags(href));
  return [safe && words ? { text: words, href: safe } : { text: words }];
}

/**
 * A description or a location as pieces of text and links.
 *
 * Markup is removed as the card's rows remove it, with line-ending tags kept as line breaks,
 * except that an `<a href>` link keeps its address: the words of the link, linked. A link with
 * no words shows its address.
 *
 * @param raw - The text as the calendar delivered it
 * @returns The pieces, in order
 */
export function linkText(raw: string | null | undefined): TextPiece[] {
  if (!raw) return [];
  const { marked: anchored, anchors, mark } = markOwnAnchors(raw);
  const marked = anchored.replace(LINE_ENDING_MARKUP, '\n');
  const plain = stripHtmlTags(marked).replace(/\n{3,}/g, '\n\n');

  const pieces: TextPiece[] = [];
  const parts = plain.split(mark);
  parts.forEach((part, index) => {
    if (index % 2 === 0) {
      pieces.push(...linkPlainText(part));
      return;
    }
    const anchor = anchors[Number(part)];
    if (!anchor) return;
    const words = stripHtmlTags(anchor.words) || stripHtmlTags(anchor.href);
    pieces.push(...anchorPieces(anchor.href, words));
  });
  return pieces.filter((piece) => piece.text !== '');
}

/**
 * Whether any piece is a link.
 *
 * @param pieces - Pieces of text and links
 * @returns True when at least one piece links somewhere
 */
export function hasLink(pieces: ReadonlyArray<TextPiece>): boolean {
  return pieces.some((piece) => 'href' in piece);
}

/**
 * The text an event row shows, as pieces of text and links, without changing a word of it.
 *
 * A row shows its description with the markup removed (`stripHtmlTags`), so an `<a href>` a
 * calendar wrote there reaches the row as its words alone. Where those words are exactly what
 * the row shows, they keep their link: the description is read again with each anchor held
 * in place, and its link is used only if the text comes out the same as `shown`. Anything
 * that rewrote the text on its way to the row, such as a text replacement or a birthday
 * marker, makes the two differ, and then only the web addresses written in `shown` itself are
 * linked. Either way the pieces join to `shown`, character for character.
 *
 * @param shown - The text the row shows
 * @param raw - The text as the calendar delivered it, if it may hold markup
 * @returns The pieces, in order
 */
export function linkShownText(shown: string, raw?: string | null): TextPiece[] {
  if (!shown) return [];
  if (raw && /<a\b/i.test(raw)) {
    const { marked, anchors, mark } = markOwnAnchors(raw);
    const pieces: TextPiece[] = [];
    stripHtmlTags(marked)
      .split(mark)
      .forEach((part, index) => {
        if (index % 2 === 0) {
          pieces.push(...linkPlainText(part));
          return;
        }
        const anchor = anchors[Number(part)];
        if (!anchor) return;
        pieces.push(...anchorPieces(anchor.href, stripHtmlTags(anchor.words)));
      });
    const kept = pieces.filter((piece) => piece.text !== '');
    if (kept.map((piece) => piece.text).join('') === shown) return kept;
  }
  return linkPlainText(shown);
}

/** An event row's location and description as pieces, each present only where it links. */
export interface RowLinks {
  readonly location?: TextPiece[];
  readonly description?: TextPiece[];
}

/**
 * The links in an event row: its location and its description as pieces, each only where it
 * holds at least one link, so a row with none draws its text exactly as it always has.
 *
 * @param shown - The location and description the row shows
 * @param source - The same fields as the calendar delivered them
 * @returns The pieces to draw in place of each text
 */
export function rowLinks(
  shown: { readonly location: string; readonly description: string },
  source?: { readonly location?: string | null; readonly description?: string | null },
): RowLinks {
  const location = linkShownText(shown.location, source?.location);
  const description = linkShownText(shown.description, source?.description);
  return {
    location: hasLink(location) ? location : undefined,
    description: hasLink(description) ? description : undefined,
  };
}

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

//-----------------------------------------------------------------------------
// CONSTANTS
//-----------------------------------------------------------------------------

/**
 * An `<a>` element with an `href`, its quoted, single-quoted or bare value, and its words.
 *
 * 🚨 Every part stops at the next `<`, and the words stop at the next `<a`, so each attempt
 * that fails gives up at the next tag rather than at the end of the description. Anyone who
 * can write to a calendar writes its descriptions, and the pattern this replaced backtracked
 * catastrophically on markup that never closes: 18 KB of `<a href="` repeated held a tab for
 * 37 seconds, and 105 KB of unclosed anchors for 280 ms on every render, where this takes about
 * a millisecond. An `href` holding `<` or `>` is no link a calendar writes.
 */
const ANCHOR =
  /<a\b[^<>]*?\bhref\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s<>]+))[^<>]*>((?:(?!<a\b)[\s\S])*?)<\/a\s*>/gi;

/** Words that are a web address and nothing else, which may only link to themselves. */
const URL_WORDS = /^https?:\/\/[^\s<>"']+$/i;

/** A web address in running text, up to the first space or angle bracket or quote. */
const BARE_URL = /\bhttps?:\/\/[^\s<>"']+/gi;

/** Markup that ends a line, kept as a line break so a description keeps its paragraphs. */
const LINE_ENDING_MARKUP = /<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr)\s*>/gi;

/** Marks where an anchor stood, in characters no calendar text uses. */
const ANCHOR_MARK = /\uE000(\d+)\uE001/;

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
    let url = match[0];
    while (
      /[.,;:!?'"]$/.test(url) ||
      (url.endsWith(')') && countOf(url, ')') > countOf(url, '('))
    ) {
      url = url.slice(0, -1);
    }
    const start = match.index ?? 0;
    if (start > last) pieces.push({ text: text.slice(last, start) });
    pieces.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
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
  const anchors: Array<{ href: string; words: string }> = [];
  const marked = raw
    .replace(ANCHOR, (_match, doubled: string, single: string, bare: string, words: string) => {
      anchors.push({ href: doubled ?? single ?? bare ?? '', words });
      return `\uE000${anchors.length - 1}\uE001`;
    })
    .replace(LINE_ENDING_MARKUP, '\n');
  const plain = stripHtmlTags(marked).replace(/\n{3,}/g, '\n\n');

  const pieces: TextPiece[] = [];
  const parts = plain.split(ANCHOR_MARK);
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
    const anchors: Array<{ href: string; words: string }> = [];
    const marked = raw.replace(
      ANCHOR,
      (_match, doubled: string, single: string, bare: string, words: string) => {
        anchors.push({ href: doubled ?? single ?? bare ?? '', words });
        return `\uE000${anchors.length - 1}\uE001`;
      },
    );
    const pieces: TextPiece[] = [];
    stripHtmlTags(marked)
      .split(ANCHOR_MARK)
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

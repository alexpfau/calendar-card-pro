import { describe, expect, it } from 'vitest';

import { stripHtmlTags } from '../src/utils/format';
import {
  hasLink,
  linkPlainText,
  linkShownText,
  linkText,
  markAnchors,
  rowLinks,
  safeHref,
} from '../src/utils/links';

/**
 * Links in an event's description and location: what becomes a link, and that nothing a
 * calendar writes can become anything but text or an http(s) link.
 */

describe('linkPlainText', () => {
  it('links web addresses and leaves sentence punctuation as text', () => {
    expect(linkPlainText('Plan: https://swim.example.com/plan. Bring goggles!')).toEqual([
      { text: 'Plan: ' },
      { text: 'https://swim.example.com/plan', href: 'https://swim.example.com/plan' },
      { text: '. Bring goggles!' },
    ]);
  });

  it('keeps a closing parenthesis only on an address that opened one', () => {
    expect(linkPlainText('(see https://example.com/a)')).toEqual([
      { text: '(see ' },
      { text: 'https://example.com/a', href: 'https://example.com/a' },
      { text: ')' },
    ]);
    expect(linkPlainText('https://en.wikipedia.org/wiki/Pool_(game)')[0]).toEqual({
      text: 'https://en.wikipedia.org/wiki/Pool_(game)',
      href: 'https://en.wikipedia.org/wiki/Pool_(game)',
    });
  });

  it('leaves text without an address as one piece, and empty text as none', () => {
    expect(linkPlainText('No links here, www.example.com either')).toEqual([
      { text: 'No links here, www.example.com either' },
    ]);
    expect(linkPlainText('')).toEqual([]);
  });
});

describe('linkText', () => {
  it("keeps a calendar's anchor as a link with its words", () => {
    expect(
      linkText('Join <a href="https://meet.example.com/abc?x=1&amp;y=2">the call</a> at 9.'),
    ).toEqual([
      { text: 'Join ' },
      { text: 'the call', href: 'https://meet.example.com/abc?x=1&y=2' },
      { text: ' at 9.' },
    ]);
  });

  it('shows the address of an anchor with no words, and links bare addresses beside it', () => {
    expect(linkText("<a href='https://a.example'></a> or https://b.example")).toEqual([
      { text: 'https://a.example', href: 'https://a.example' },
      { text: ' or ' },
      { text: 'https://b.example', href: 'https://b.example' },
    ]);
  });

  it('keeps line-ending markup as line breaks and strips the rest', () => {
    expect(linkText('<p>Line one</p><p>Line <b>two</b><br>three</p>')).toEqual([
      { text: 'Line one\nLine two\nthree' },
    ]);
  });

  it.each([
    ['a javascript link', '<a href="javascript:alert(1)">click</a>', [{ text: 'click' }]],
    ['a data link', '<a href="data:text/html,x">x</a>', [{ text: 'x' }]],
    ['an encoded scheme', '<a href="&#106;avascript:alert(1)">x</a>', [{ text: 'x' }]],
    [
      'markup in the words',
      '<a href="https://e.example"><img src=x onerror=alert(1)>go</a>',
      [{ text: 'go', href: 'https://e.example' }],
    ],
    ['a script', 'a <script>alert(1)</script> b', [{ text: 'a alert(1) b' }]],
  ])('never makes %s into anything but text or an http link', (_name, raw, pieces) => {
    expect(linkText(raw)).toEqual(pieces);
  });

  it('gives nothing for nothing', () => {
    expect(linkText(undefined)).toEqual([]);
    expect(linkText('')).toEqual([]);
  });
});

describe('safeHref', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['  HTTP://example.com ', 'HTTP://example.com'],
    ['javascript:alert(1)', undefined],
    ['mailto:a@example.com', undefined],
    ['//example.com', undefined],
  ])('reads %j as %j', (href, expected) => {
    expect(safeHref(href)).toBe(expected);
  });
});

/**
 * Links in an event row (`open_links`): the row's own text, word for word, with the addresses in
 * it linked, and a calendar's anchor kept only where the row shows its words unchanged.
 */
describe('linkShownText', () => {
  const GOOGLE =
    'Bring the plan. <a href="https://docs.example.com/plan?a=1&amp;b=2">Swim plan</a><br>' +
    'Call https://meet.example.com/xyz.';

  it("keeps a calendar's anchor where the row shows the description as written", () => {
    const shown = stripHtmlTags(GOOGLE);
    expect(linkShownText(shown, GOOGLE)).toEqual([
      { text: 'Bring the plan. ' },
      { text: 'Swim plan', href: 'https://docs.example.com/plan?a=1&b=2' },
      { text: 'Call ' },
      { text: 'https://meet.example.com/xyz', href: 'https://meet.example.com/xyz' },
      { text: '.' },
    ]);
  });

  it('links only the addresses written out once the row rewrote the text', () => {
    // As a text replacement or a birthday marker leaves it: the anchor's words are no longer
    // where the description put them, so they stay words.
    const shown = 'Bring the plan. Swim planCall https://meet.example.com/xyz. (edited)';
    expect(linkShownText(shown, GOOGLE)).toEqual([
      { text: 'Bring the plan. Swim planCall ' },
      { text: 'https://meet.example.com/xyz', href: 'https://meet.example.com/xyz' },
      { text: '. (edited)' },
    ]);
  });

  it.each([
    ['a javascript anchor', '<a href="javascript:alert(1)">Open</a> now'],
    ['an encoded scheme', '<a href="&#106;avascript:alert(1)">Open</a> now'],
    ['a data anchor', '<a href="data:text/html,x">Open</a> now'],
  ])('never links %s, and keeps its words', (_name, raw) => {
    expect(linkShownText(stripHtmlTags(raw), raw)).toEqual([{ text: 'Open' }, { text: ' now' }]);
  });

  it.each([
    ['plain text', 'Room 4', undefined],
    ['a bare address', 'https://zoom.example/j/1', undefined],
    ['an anchor', 'Agenda', '<a href="https://a.example">Agenda</a>'],
    ['an anchor with spaced words', 'Go  there', 'Go <a href="https://a.example"> there</a>'],
    ['entities', 'Fish & chips https://f.example', 'Fish &amp; chips https://f.example'],
    ['an empty anchor', 'x', 'x<a href="https://a.example"></a>'],
    ['a rewritten text', 'Busy', '<a href="https://a.example">Dentist</a>'],
  ])('joins its pieces back to the shown text for %s', (_name, shown, raw) => {
    expect(
      linkShownText(shown, raw)
        .map((piece) => piece.text)
        .join(''),
    ).toBe(shown);
  });

  it('gives nothing for nothing', () => {
    expect(linkShownText('', '<a href="https://a.example">x</a>')).toEqual([]);
  });
});

describe('a link shows where it goes', () => {
  const SPOOF = '<a href="https://elsewhere.example/login">https://bank.example/login</a>';

  it('links an address written as the words of an anchor to itself, not to its href', () => {
    const own = [{ text: 'https://bank.example/login', href: 'https://bank.example/login' }];
    expect(linkText(SPOOF)).toEqual(own);
    expect(linkShownText(stripHtmlTags(SPOOF), SPOOF)).toEqual(own);
  });

  it('keeps the closing parenthesis of a sentence out of an address that holds a pair', () => {
    expect(linkPlainText('See (https://en.wikipedia.org/wiki/Pool_(game)).')).toEqual([
      { text: 'See (' },
      {
        text: 'https://en.wikipedia.org/wiki/Pool_(game)',
        href: 'https://en.wikipedia.org/wiki/Pool_(game)',
      },
      { text: ').' },
    ]);
  });
});

/**
 * Markup that never closes, which anyone who can write to a calendar can put in a description.
 * An earlier anchor pattern took 37 s on the first input here and 280 ms on the second; each
 * takes about a millisecond now, so a bound this loose still fails on that one.
 *
 * Only inputs whose tags do close somewhere, or are short. A long run of tags that never close
 * at all (`<a ` twenty thousand times) was slow in `stripHtmlTags` as well, which every row runs
 * on its description, until its pattern became a scanner; `tests/strip-html-tags.test.ts` pins
 * that one, measured without happy-dom's own parser, which this file's textarea would put back.
 * The long runs the anchor pattern after that one was slow on are pinned below, under "text
 * that never ends where a link would".
 */
describe('markup that never closes', () => {
  it.each([
    ['an unclosed quote', '<a href="'.repeat(2000)],
    ['an unclosed anchor', '<a href="https://e.example">x'.repeat(5000)],
  ])('reads %s in linear time', (_name, raw) => {
    const started = performance.now();
    linkText(raw);
    linkShownText('x', raw);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

/**
 * The anchor pattern `markAnchors` replaced, verbatim, kept as its oracle.
 *
 * It read the `href` inside the pattern, which took quadratic time on a start tag that never
 * closes. What it found is, by definition, what an anchor was until then, so `markAnchors`
 * has to agree with it on every input rather than on the rows above.
 */
const PREVIOUS_ANCHOR =
  /<a\b[^<>]*?\bhref\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s<>]+))[^<>]*>((?:(?!<a\b)[\s\S])*?)<\/a\s*>/gi;

/** What the previous anchor pattern marked in `raw`. */
function previousMarkAnchors(raw: string): ReturnType<typeof markAnchors> {
  const anchors: Array<{ href: string; words: string }> = [];
  const marked = raw.replace(
    PREVIOUS_ANCHOR,
    (_match, doubled: string, single: string, bare: string, words: string) => {
      anchors.push({ href: doubled ?? single ?? bare ?? '', words });
      return `\uE000${anchors.length - 1}\uE001`;
    },
  );
  return { marked, anchors };
}

/**
 * What `linkPlainText` made of `text` before its trim counted the parentheses once, kept as its
 * oracle: the same loop, counting both kinds again for each character it took off.
 */
function previousLinkPlainText(text: string): ReturnType<typeof linkPlainText> {
  const countOf = (url: string, char: string): number => url.split(char).length - 1;
  const pieces: ReturnType<typeof linkPlainText> = [];
  let last = 0;
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>"']+/gi)) {
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
 * The inputs among `inputs` where `actual` and `expected` disagree, and how many of them
 * `expected` found a link in: a corpus with none would agree with anything.
 */
function disagreements<T>(
  inputs: Iterable<string>,
  actual: (input: string) => T,
  expected: (input: string) => T,
  linked: (result: T) => boolean,
): { inputs: number; linked: number; differ: string[] } {
  const differ: string[] = [];
  let count = 0;
  let found = 0;
  for (const input of inputs) {
    count++;
    const want = expected(input);
    if (linked(want)) found++;
    if (JSON.stringify(actual(input)) !== JSON.stringify(want) && differ.length < 5) {
      differ.push(input);
    }
  }
  return { inputs: count, linked: found, differ };
}

/** Every string made of one choice from each list, in order. */
function* product(parts: ReadonlyArray<ReadonlyArray<string>>, prefix = ''): Generator<string> {
  if (parts.length === 0) {
    yield prefix;
    return;
  }
  for (const part of parts[0]) yield* product(parts.slice(1), prefix + part);
}

/** Every arrangement of up to `depth` of `fragments`, the empty one included. */
function* arrangements(
  fragments: readonly string[],
  depth: number,
  prefix = '',
): Generator<string> {
  yield prefix;
  if (depth === 0) return;
  for (const fragment of fragments) yield* arrangements(fragments, depth - 1, prefix + fragment);
}

/** `count` seeded random strings up to 400 characters, built from `fragments`. */
function* randomText(fragments: readonly string[], seed: number, count: number): Generator<string> {
  // mulberry32, so the corpus is the same on every run and a failure reproduces.
  let state = seed >>> 0;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let sample = 0; sample < count; sample++) {
    let text = '';
    const length = Math.floor(random() * 400);
    while (text.length < length) text += fragments[Math.floor(random() * fragments.length)];
    yield text;
  }
}

describe('finds exactly the anchors the previous pattern found', () => {
  // The rows above cannot show this: an `href` that is not the first, a quote that never
  // closes, or an `<a>` with no `href` beside one that has one each need parts arranged just
  // so. Each corpus states its size and how many of its inputs hold an anchor before it states
  // that the two agree — a corpus with none would agree with anything.
  const ANCHOR_PARTS = [
    ['<a', '<A', '<ab'],
    [' ', '\t', ' x ', ' xhref=y '],
    ['href', 'HREF', 'hre'],
    ['=', ' = ', ''],
    ['"u"', "'u'", 'u', '""', '"u', "'u", ''],
    ['', ' href=v'],
    ['>', '', '<'],
    ['', 'w', '<a>', '<a href=z>'],
    ['</a>', '</A >', '</a', ''],
  ];
  const FRAGMENTS = [
    ...['<a ', '<a href=', '<a href="', "<a href='", '<A HREF = ', '<ab ', 'href=', ' href'],
    ...['"', "'", 'x', 'https://e.example/p', ' ', '=', '>', '>', '>w', '</a>', '</a>', '</A >'],
    ...['</a', '<', '\n', '<b>', '/', '&amp;'],
  ];
  const linked = (result: ReturnType<typeof markAnchors>): boolean => result.anchors.length > 0;

  it('agrees on every anchor built from these parts', () => {
    const result = disagreements(product(ANCHOR_PARTS), markAnchors, previousMarkAnchors, linked);

    expect(result.inputs).toBe(3 * 4 * 3 * 3 * 7 * 2 * 3 * 4 * 4);
    expect(result.linked).toBe(11_856);
    expect(result.differ).toEqual([]);
  });

  it('agrees on long random text dense with anchors', () => {
    const result = disagreements(
      randomText(FRAGMENTS, 28, 2_000),
      markAnchors,
      previousMarkAnchors,
      linked,
    );

    expect(result.inputs).toBe(2_000);
    expect(result.linked).toBe(585);
    expect(result.differ).toEqual([]);
  });
});

describe('takes the same sentence ends off an address as before', () => {
  // A wrong count shows only where an address holds parentheses of both kinds and ends in a
  // mix of them and sentence ends, which up to five fragments reach in every arrangement.
  const FRAGMENTS = ['https://a.example/', 'http://b', ')', '(', '.', ',', '!', '?', 'x', ' '];
  const MORE = [...FRAGMENTS, '))', '()', ':', ';', '"', "'", '<', '\n', 'HTTPS://C'];
  const linked = (pieces: ReturnType<typeof linkPlainText>): boolean => hasLink(pieces);

  it('agrees on every arrangement of up to five address fragments', () => {
    const result = disagreements(
      arrangements(FRAGMENTS, 5),
      linkPlainText,
      previousLinkPlainText,
      linked,
    );

    expect(result.inputs).toBe(1 + 10 + 10 ** 2 + 10 ** 3 + 10 ** 4 + 10 ** 5);
    expect(result.linked).toBe(68_586);
    expect(result.differ).toEqual([]);
  });

  it('agrees on long random text dense with addresses', () => {
    const result = disagreements(
      randomText(MORE, 108, 2_000),
      linkPlainText,
      previousLinkPlainText,
      linked,
    );

    expect(result.inputs).toBe(2_000);
    expect(result.linked).toBe(1_971);
    expect(result.differ).toEqual([]);
  });
});

/**
 * Text that never ends where a link would: a run of closing parentheses after an address, and
 * an anchor's start tag or words that never close. Each shape took quadratic time until the
 * trim counted the parentheses once and the anchor's `href` was read apart from its tag, and
 * each runs here at a size where that took seconds. Each takes about a millisecond now, so the
 * bound is loose enough for a loaded machine and still fails on the old code by a wide margin.
 * They call the two functions directly, so the time measured is the card's own and not
 * happy-dom's parser.
 */
describe('text that never ends where a link would', () => {
  const ADDRESS = 'https://a.example/';
  const run = (unit: string, kib: number): string =>
    unit.repeat(Math.ceil((kib * 1024) / unit.length));

  it.each([
    ['closing parentheses', run(')', 32)],
    ['sentence ends and closing parentheses', run('.)', 64)],
  ])('trims a run of %s after an address in linear time', (_name, tail) => {
    const started = performance.now();
    const pieces = linkPlainText(ADDRESS + tail);
    const elapsed = performance.now() - started;

    // The whole run was read, and none of it went with the address.
    expect(pieces).toEqual([{ text: ADDRESS, href: ADDRESS }, { text: tail }]);
    expect(elapsed).toBeLessThan(250);
  });

  it.each([
    ['a bare value', '<a href=' + run('x', 128)],
    ['an unclosed quote', '<a href="' + run('x', 128)],
    ['one href after another', '<a ' + run('href=x ', 256)],
    ['words that never close', '<a href=' + run('x', 64) + '>' + run('w', 64)],
  ])('reads an anchor with %s in linear time', (_name, raw) => {
    const started = performance.now();
    const { marked, anchors } = markAnchors(raw);
    const elapsed = performance.now() - started;

    // Nothing closes, so nothing is an anchor: the text was read, not skipped.
    expect(anchors).toEqual([]);
    expect(marked).toBe(raw);
    expect(elapsed).toBeLessThan(250);
  });
});

/**
 * The characters `markAnchors` marks an anchor's place with are private-use characters, which a
 * calendar can still write, as written or as a character reference. Text holding them was taken
 * for a mark and dropped, or stood in for an anchor's words.
 */
describe('text holding the characters an anchor is marked with', () => {
  const OPEN = '\uE000';
  const CLOSE = '\uE001';
  const joined = (pieces: ReturnType<typeof linkText>): string =>
    pieces.map((piece) => piece.text).join('');

  it.each([
    ['a whole mark', `Code ${OPEN}0${CLOSE} here`],
    ['a mark naming no anchor', `Code ${OPEN}7${CLOSE} here`],
    ['an opening character alone', `Code ${OPEN} here`],
    ['a closing character alone', `Code ${CLOSE} here`],
  ])('keeps %s with no anchor beside it', (_name, raw) => {
    expect(joined(linkText(raw))).toBe(raw);
    expect(linkText(raw).some((piece) => 'href' in piece)).toBe(false);
  });

  it('keeps a whole mark beside a real anchor, in its place, as text', () => {
    const raw = `${OPEN}0${CLOSE} then <a href="https://e.example">the call</a>`;
    expect(linkText(raw)).toEqual([
      { text: `${OPEN}0${CLOSE} then ` },
      { text: 'the call', href: 'https://e.example' },
    ]);
  });

  it('keeps a mark written as character references beside a real anchor', () => {
    const raw = '&#xE000;0&#xE001; then <a href="https://e.example">the call</a>';
    expect(linkText(raw)).toEqual([
      { text: `${OPEN}0${CLOSE} then ` },
      { text: 'the call', href: 'https://e.example' },
    ]);
  });

  it('keeps the link on a row whose text holds a mark', () => {
    const raw = `${OPEN}0${CLOSE} then <a href="https://e.example">the call</a>`;
    expect(linkShownText(stripHtmlTags(raw), raw)).toEqual([
      { text: `${OPEN}0${CLOSE} then ` },
      { text: 'the call', href: 'https://e.example' },
    ]);
  });

  it('keeps every word of text holding every character a mark could use, linking none', () => {
    let every = '';
    for (let code = 0xe000; code <= 0xf8ff; code++) every += String.fromCharCode(code);
    const raw = `${every} <a href="https://e.example">the call</a>`;
    expect(linkText(raw)).toEqual([{ text: `${every} the call` }]);
  });
});

describe('rowLinks', () => {
  it('hands back pieces only for a field that links somewhere', () => {
    const links = rowLinks({ location: 'Pool', description: 'See https://swim.example' });
    expect(links.location).toBeUndefined();
    expect(links.description && hasLink(links.description)).toBe(true);
  });

  it("reads each field's anchors from its own source", () => {
    const links = rowLinks(
      { location: 'Club', description: 'Notes' },
      {
        location: '<a href="https://club.example">Club</a>',
        description: '<a href="javascript:x">Notes</a>',
      },
    );
    expect(links.location).toEqual([{ text: 'Club', href: 'https://club.example' }]);
    expect(links.description).toBeUndefined();
  });
});

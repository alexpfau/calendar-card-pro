import { describe, expect, it } from 'vitest';

import { stripHtmlTags } from '../src/utils/format';
import {
  hasLink,
  linkPlainText,
  linkShownText,
  linkText,
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
 * The anchor pattern this replaced took 37 s on the first input here and 280 ms on the second;
 * each takes about a millisecond now, so a bound this loose still fails on the old one.
 *
 * Only inputs whose tags do close somewhere, or are short. A long run of tags that never close
 * at all (`<a ` twenty thousand times) was slow in `stripHtmlTags` as well, which every row runs
 * on its description, until its pattern became a scanner; `tests/strip-html-tags.test.ts` pins
 * that one, measured without happy-dom's own parser, which this file's textarea would put back.
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

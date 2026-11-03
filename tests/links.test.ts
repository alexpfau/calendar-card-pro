import { describe, expect, it } from 'vitest';

import { linkPlainText, linkText, safeHref } from '../src/utils/links';

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

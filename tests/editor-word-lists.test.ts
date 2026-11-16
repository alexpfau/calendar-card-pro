import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { compiles, fromPattern, orPatterns, toPattern } from '../src/rendering/editor/word-lists';
import * as EventUtils from '../src/utils/events';
import { formatLocation } from '../src/utils/format';

/**
 * Word lists as terms (section 5.9): the patterns `blocklist`, `allowlist` and Countries To
 * Remove store, read as the words a person typed and written back from them, and whether the card
 * can read one at all.
 */

describe('word lists, written from terms', () => {
  it('escapes every metacharacter, so each term matches only itself', () => {
    const terms = [
      'C++',
      'Piano (2.5h)',
      '[room 3]',
      'a|b',
      '$5 ^up',
      'x{2}',
      'back\\slash',
      'why?',
    ];
    const pattern = toPattern(terms);
    const regex = new RegExp(pattern, 'i');

    for (const term of terms) expect(regex.test(`before ${term} after`)).toBe(true);
    for (const near of ['C', 'Piano 2.5h', 'room 3', 'a', 'b', '5 up', 'xx', 'backslash', 'why']) {
      expect(regex.test(near)).toBe(false);
    }
  });

  it('trims each term and leaves out an empty one, which would match every event', () => {
    expect(toPattern(['  School ', '', '   ', 'Piano'])).toBe('School|Piano');
    expect(toPattern([])).toBe('');
  });

  it('reads its own patterns back as the terms they were written from', () => {
    for (const terms of [['School'], ['C++', 'Piano (2.5h)'], ['a|b', 'x.y'], ['back\\slash']]) {
      expect(fromPattern(toPattern(terms))).toEqual(terms);
    }
    expect(fromPattern('')).toEqual([]);
    expect(fromPattern('School|Piano')).toEqual(['School', 'Piano']);
  });

  it('keeps an expression an expression', () => {
    for (const pattern of [
      '^Bin',
      'Sch(o)+l',
      'a.b',
      '\\d+',
      'x|',
      '|x',
      'a||b',
      ' a|b',
      '[',
      'a\\',
    ]) {
      expect(fromPattern(pattern)).toBeUndefined();
    }
  });

  it('joins two word lists as one list, and anything else as groups', () => {
    expect(orPatterns('Soccer', 'School')).toBe('Soccer|School');
    expect(orPatterns('Soccer|School', 'School|C\\+\\+')).toBe('Soccer|School|C\\+\\+');
    expect(orPatterns('^Bin', 'School')).toBe('(?:^Bin)|(?:School)');
    expect(orPatterns('', 'School')).toBe('School');
    // A space is a pattern the card applies, not an empty list.
    expect(fromPattern(' ')).toBeUndefined();
    expect(orPatterns(' ', 'School')).toBe('(?: )|(?:School)');

    const either = new RegExp(orPatterns('^Bin', 'School'), 'i');
    expect(['Bin Day', 'school run'].map((text) => either.test(text))).toEqual([true, true]);
    expect(either.test('Recycling Bin')).toBe(false);
  });
});

describe('whether the card can read a pattern', () => {
  /**
   * What the card does with an allowlist: an event no readable pattern here matches is dropped
   * where the card compiled the pattern, and kept where it skipped it.
   *
   * @param pattern - The allowlist
   * @returns Whether the card skipped it
   */
  function cardSkips(pattern: string): boolean {
    const config = buildConfig({ entities: [{ entity: 'calendar.family', allowlist: pattern }] });
    const event: Types.CalendarEventData = {
      summary: 'zzz',
      start: { date: '2026-01-14' },
      end: { date: '2026-01-15' },
      _entityId: 'calendar.family',
    };
    return EventUtils.processEvents([event], config).length === 1;
  }

  it.each([
    '[',
    '(',
    'a(',
    '\\',
    '*a',
    'a{2,1}',
    '(?<x>a',
    '(?i)a',
    '[a-',
    'school',
    'a|b',
    '^Bin$',
    '(?<x>a)',
  ])('agrees with the card about %s', (pattern) => {
    expect(compiles(pattern)).toBe(!cardSkips(pattern));
  });

  it('reads Countries To Remove as the card builds it, wrapped', () => {
    // The card builds `(${pattern})\s*$`, so `a)(b` is read there although it is no pattern alone.
    expect(compiles('a)(b')).toBe(false);
    expect(compiles('(a)(b)\\s*$')).toBe(true);
    expect(formatLocation('Venue ab', 'a)(b')).toBe('Venue');
    expect(compiles('(Deutsch(land)\\s*$')).toBe(false);
    expect(formatLocation('Venue, Deutsch(land', 'Deutsch(land')).toBe('Venue, Deutsch(land');
  });
});

/**
 * Where a grid title may wrap.
 *
 * Grid draws each word as its own element so a word too wide for its lane is cut with an
 * ellipsis rather than broken inside ("Sprin / t / plann"). These pin the split itself; the
 * stylesheet and DOM halves are pinned in `stylesheet.test.ts` and `grid-dom.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { gridTitleUsefulPrefix } from '../src/utils/grid-title-fit';
import { splitTitleWords } from '../src/utils/title-words';

const words = (title: string) => splitTitleWords(title).map(({ kind, text }) => `${kind}:${text}`);

describe('splitTitleWords', () => {
  it('splits at breaking spaces and keeps the spaces as they were', () => {
    expect(words('Sprint planning')).toEqual(['word:Sprint', 'space: ', 'word:planning']);
    expect(words('  Two  spaces ')).toEqual([
      'space:  ',
      'word:Two',
      'space:  ',
      'word:spaces',
      'space: ',
    ]);
  });

  it('gives back the title exactly when joined', () => {
    for (const title of [
      'Quarterly review',
      '– Team sync',
      'Dr.\u00A0Smith at 10',
      'Parent-teacher meeting (Clara)',
      '会議 Quarterly review',
      '회의 준비',
      '\tTabs\nand lines ',
      '',
    ]) {
      expect(
        splitTitleWords(title)
          .map((segment) => segment.text)
          .join(''),
      ).toBe(title);
    }
  });

  it('keeps a no-break space inside its word, since it asks not to be broken', () => {
    expect(words('Dr.\u00A0Smith')).toEqual(['word:Dr.\u00A0Smith']);
    expect(words('10\u202F°C')).toEqual(['word:10\u202F°C']);
  });

  it('keeps leading punctuation as a word of its own', () => {
    expect(words('– Team sync')).toEqual([
      'word:–',
      'space: ',
      'word:Team',
      'space: ',
      'word:sync',
    ]);
  });

  it('lets a compound wrap after its hyphen, but not a leading or spaced dash', () => {
    expect(words('Parent-teacher')).toEqual(['word:Parent-', 'word:teacher']);
    expect(words('Check-in–out')).toEqual(['word:Check-', 'word:in–', 'word:out']);
    expect(words('-5°C')).toEqual(['word:-5°C']);
    expect(words('Lunch - Ben')).toEqual([
      'word:Lunch',
      'space: ',
      'word:-',
      'space: ',
      'word:Ben',
    ]);
  });

  it('splits Hangul into words, because Korean is written with spaces', () => {
    expect(words('회의 준비')).toEqual(['word:회의', 'space: ', 'word:준비']);
  });

  it('leaves runs in scripts written without spaces to the browser', () => {
    expect(words('会議の準備')).toEqual(['text:会議の準備']);
    expect(words('ประชุมทีม')).toEqual(['text:ประชุมทีม']);
    expect(words('会議Room')).toEqual(['text:会議Room']);
  });

  it('still cuts a Latin word beside such a run', () => {
    expect(words('会議 Quarterly review')).toEqual([
      'text:会議',
      'space: ',
      'word:Quarterly',
      'space: ',
      'word:review',
    ]);
  });

  it('leaves a title containing right-to-left script as one run', () => {
    // Separate boxes are ordered by the line's direction, not their own, so a Hebrew title
    // split into words read backwards on a left-to-right dashboard. One run is ordered by
    // the browser's bidirectional algorithm, as before.
    expect(words('פגישת צוות')).toEqual(['text:פגישת צוות']);
    expect(words('اجتماع الفريق')).toEqual(['text:اجتماع الفريق']);
    expect(words('Microsoft Teams עם דנה')).toEqual(['text:Microsoft Teams עם דנה']);
  });

  it('returns nothing for an empty title', () => {
    expect(splitTitleWords('')).toEqual([]);
  });

  // The split after a hyphen used to be a lookbehind, which Safari cannot parse before 16.4
  // (#735). The reference below is that original split, so every generated word must come
  // out the same through the matching rewrite. The alphabet has no breaking spaces and no
  // script that skips the split, so each title is one word and the hyphen rule alone decides.
  it('splits after a hyphen exactly as the lookbehind it replaced did', () => {
    const lookbehind = new RegExp(
      '(?<=[\\p{L}\\p{N}][-\\u2010\\u2013\\u2014])(?=[\\p{L}\\p{N}])',
      'u',
    );
    const alphabet = [
      'a',
      'Z',
      'é',
      'ß',
      'Ж',
      '한',
      '7',
      '३',
      '-',
      '\u2010',
      '\u2013',
      '\u2014',
      '_',
      '.',
      '°',
      '\u0301',
      '\u00a0',
      '🎉',
    ];
    let seed = 735;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const mismatches: string[] = [];
    let compared = 0;
    for (let i = 0; i < 50_000; i++) {
      let title = '';
      const length = 1 + Math.floor(next() * 9);
      for (let j = 0; j < length; j++) title += alphabet[Math.floor(next() * alphabet.length)];
      const expected = title.split(lookbehind);
      const actual = splitTitleWords(title).map(({ text }) => text);
      compared++;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push(title);
    }
    expect(compared).toBe(50_000);
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});

describe('gridTitleUsefulPrefix', () => {
  // A title split into one text node per word must be judged readable exactly as the single
  // node was. Reading only the first node would call `– Team sync` unreadable.
  it('runs from the first node to the first useful grapheme in any node', () => {
    expect(gridTitleUsefulPrefix(['Team', 'sync'])).toEqual({ run: 0, length: 1 });
    expect(gridTitleUsefulPrefix(['–', 'Team', 'sync'])).toEqual({ run: 1, length: 1 });
    expect(gridTitleUsefulPrefix(['(Ben)', 'dentist'])).toEqual({ run: 0, length: 2 });
  });

  it('finds nothing when no node holds a useful grapheme', () => {
    expect(gridTitleUsefulPrefix([])).toBeNull();
    expect(gridTitleUsefulPrefix(['–', '—'])).toBeNull();
  });
});

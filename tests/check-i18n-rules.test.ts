// @vitest-environment node
// Node, not the DOM: the gate's modules start with a shebang, which the DOM transform cannot parse.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  capitalizedAgainst,
  capitalizedRunningTextWeekday,
  checkSeparators,
  cldrListSeparator,
  cldrRunningTextWeekdays,
  isOverlongLabel,
  labelLengthBasis,
  separatorDisagreement,
  separatorProblem,
} from '../scripts/check-i18n.mjs';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import deEditor from '../src/rendering/editor/translations/de.json';

/**
 * Two rules in `scripts/check-i18n.mjs` that settle a warning by what a string is, rather
 * than by a list of strings allowed to break the rule. A list would have to be kept in step
 * with the translations by hand; these hold for a language or a label nobody has written yet.
 *
 * Both are advisory in the gate, so nothing else fails when either stops working. These tests
 * plant the cases the gate exists to catch and the cases it must leave alone.
 */

const LANGUAGES_DIR = join(process.cwd(), 'src/translations/languages');

/** Every card language, as the gate keys it: the file name, lowercased. */
const cardLanguages = () =>
  readdirSync(LANGUAGES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, '').toLowerCase());

/** A card language's `fullDaysOfWeek`, read from its file. */
const cardDays = (code: string): string[] => {
  const file = readdirSync(LANGUAGES_DIR).find((name) => name.toLowerCase() === `${code}.json`);
  return JSON.parse(readFileSync(join(LANGUAGES_DIR, file!), 'utf8')).fullDaysOfWeek;
};

describe('the label length advisory', () => {
  const de = deEditor as Record<string, string>;

  it('measures a label built on another label without that label', () => {
    // The German day label is Home Assistant's own term for a tap action plus "von Tagen",
    // which is 32 characters against the English's 14, and would warn whole.
    const label = de.day_tap_action_mode;
    expect(label).toBe(`${de.tap_action} von Tagen`);
    expect(isOverlongLabel({ value: label.length, english: 14 })).toBe(true);

    const basis = labelLengthBasis('day_tap_action_mode', label, EDITOR_STRINGS, de, 'de');
    expect(basis).toEqual({
      value: ' von Tagen'.length,
      english: 'Day '.length,
      term: 'tap_action',
    });
    expect(isOverlongLabel(basis)).toBe(false);
  });

  it('still warns on what a translation adds to the term', () => {
    const label = `${de.tap_action} von Tagen im Kalender und im Zeitraster`;
    const basis = labelLengthBasis('day_tap_action_mode', label, EDITOR_STRINGS, de, 'de');

    expect(basis.term).toBe('tap_action');
    expect(isOverlongLabel(basis)).toBe(true);
  });

  it('credits nothing to a translation that does not use the term', () => {
    const label = 'Was beim Antippen eines Tages geschehen soll';
    const basis = labelLengthBasis('day_tap_action_mode', label, EDITOR_STRINGS, de, 'de');

    expect(basis).toEqual({ value: label.length, english: 'Day Tap Action'.length });
    expect(isOverlongLabel(basis)).toBe(true);
  });

  it('needs the term as whole words on both sides', () => {
    const term = 'Abcdefghijklmnopqrstuvwxyz';
    const english = { term: 'Tap', whole: 'Tap Day', part: 'Tapping', inside: 'Tap Day' };
    const translated = {
      term,
      whole: `${term} xy`,
      part: `${term} xy`,
      // The term's translation, but only as the tail of a longer word.
      inside: `Xyz${term.toLowerCase()} xy`,
    };
    const basis = (key: keyof typeof english) =>
      labelLengthBasis(key, translated[key], english, translated, 'en');

    expect(basis('whole').term).toBe('term');
    expect(basis('part')).toEqual({ value: translated.part.length, english: 'Tapping'.length });
    expect(basis('inside')).toEqual({ value: translated.inside.length, english: 'Tap Day'.length });
  });

  it('leaves a label under the line as it is', () => {
    const basis = labelLengthBasis('day_tap_action_mode', de.tap_action, EDITOR_STRINGS, de, 'de');
    expect(basis).toEqual({ value: de.tap_action.length, english: 'Day Tap Action'.length });
  });
});

describe('the running-text weekday casing check', () => {
  const capitalized = (days: string[]) => days.map((day) => day[0].toUpperCase() + day.slice(1));

  // The rule, against fixed weekdays. Each oracle here is what CLDR 48 writes inside a date,
  // copied rather than looked up, so a CLDR release cannot change what these assert.
  describe('compares case only, one way', () => {
    it('flags a capitalized day the oracle writes in lower case', () => {
      const ca = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
      expect(capitalizedAgainst(capitalized(ca), ca)).toEqual(['Diumenge', 'diumenge']);
      expect(capitalizedAgainst(ca, ca)).toBeNull();
    });

    it('leaves a language that capitalizes its weekdays alone', () => {
      const de = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
      expect(capitalizedAgainst(de, de)).toBeNull();
    });

    it('accepts an inflected form the oracle does not have', () => {
      // Czech "do" takes the genitive, so "středy" stands where CLDR writes "středa". Only
      // case is compared, which is why the inflection needs a test of its own.
      const oracle = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
      const cs = ['neděle', 'pondělí', 'úterý', 'středy', 'čtvrtka', 'pátku', 'soboty'];
      expect(capitalizedAgainst(cs, oracle)).toBeNull();
      expect(capitalizedAgainst(capitalized(cs), oracle)).toEqual(['Neděle', 'neděle']);
    });

    it('accepts a lower-case card day the oracle capitalizes', () => {
      // Vietnamese: CLDR title-cases the weekday inside a date; the card's running text,
      // after "đến", rightly does not.
      const oracle = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      const vi = ['chủ nhật', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy'];
      expect(capitalizedAgainst(vi, oracle)).toBeNull();
    });
  });

  // The lookup, against the runtime's CLDR. These assert only what no CLDR release can turn
  // red: a language that stops distinguishing two forms drops out rather than failing.
  describe('reads CLDR through Intl', () => {
    const sundays = Array.from({ length: 7 }, (_, day) => Date.UTC(2026, 0, 4 + day, 12));
    const weekdayIn = (code: string, options: Intl.DateTimeFormatOptions) => {
      const format = new Intl.DateTimeFormat(code, { ...options, timeZone: 'UTC' });
      return sundays.map(
        (date) => format.formatToParts(date).find((part) => part.type === 'weekday')?.value,
      );
    };

    it('takes the form a weekday has inside a date, not the stand-alone one', () => {
      // Latvian capitalizes "Svētdiena" standing alone and writes "svētdiena" inside a date;
      // Finnish writes "sunnuntai" alone and "sunnuntaina" inside one. An oracle reading the
      // stand-alone form would accept "Svētdiena" in running text.
      const distinct = cardLanguages().filter(
        (code) =>
          weekdayIn(code, { weekday: 'long' }).join() !==
          weekdayIn(code, { weekday: 'long', day: 'numeric', month: 'numeric' }).join(),
      );
      expect(distinct.length, 'no language has two forms, so this proves nothing').toBeGreaterThan(
        0,
      );

      for (const code of distinct) {
        expect(cldrRunningTextWeekdays(code), code).not.toEqual(
          weekdayIn(code, { weekday: 'long' }),
        );
      }
    });

    it('compares no language Intl would answer in another', () => {
      // An unknown tag resolves to the default locale. Comparing against that would judge a
      // language by English rules and call the result a pass.
      const days = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      expect(cldrRunningTextWeekdays('xx')).toBeNull();
      expect(capitalizedRunningTextWeekday('xx', days)).toBeUndefined();
    });

    it('has CLDR data for every card language', () => {
      // The gate warns on a language it could not compare. This holds the same denominator
      // at all of them, so a runtime without the data fails here too.
      const skipped = cardLanguages().filter(
        (code) => capitalizedRunningTextWeekday(code, cardDays(code)) === undefined,
      );
      expect(skipped).toEqual([]);
    });
  });
});

describe('the time-text separator check', () => {
  // The shape rule, against fixed strings. Its errors fail CI, so a false positive here would
  // fail a good translation; that is why an unspaced mark only warns.
  it('accepts punctuation followed by a space, a full-width mark, or a space alone', () => {
    for (const separator of [', ', '، ', '，', '、', ' ', '\u00a0', ' – ']) {
      expect(separatorProblem(separator), JSON.stringify(separator)).toBeNull();
    }
  });

  it('fails a word, a tab, a line break and two spaces in a row', () => {
    for (const separator of ['und ', ' 2 ', ',\t', ',\n', ',  ']) {
      expect(separatorProblem(separator)?.severity, JSON.stringify(separator)).toBe('error');
    }
    expect(separatorProblem('und ')?.message).toMatch(/letter or a digit/);
    expect(separatorProblem(',  ')?.message).toMatch(/two spaces in a row/);
  });

  it('warns on a mark the next word would touch, which a language could still mean', () => {
    for (const separator of [',', ' -', '—']) {
      expect(separatorProblem(separator), JSON.stringify(separator)).toEqual({
        severity: 'warning',
        message: expect.stringMatching(/runs into the word after it/),
      });
    }
  });

  it('leaves an empty or missing value to the parity check, which reports it', () => {
    expect(separatorProblem('')).toBeNull();
    expect(separatorProblem(undefined)).toBeNull();
  });

  // The CLDR comparison, against fixed literals. CLDR 48 lists with "、" in Chinese and " " in
  // Thai, copied rather than looked up, so a CLDR release cannot change what these assert.
  it('flags a language writing ", " where CLDR does not, and the reverse', () => {
    expect(separatorDisagreement(', ', '、')).toBe(true);
    expect(separatorDisagreement(', ', ' ')).toBe(true);
    expect(separatorDisagreement('; ', ', ')).toBe(true);
  });

  it('leaves two marks that both differ from ", " alone', () => {
    // Chinese joins clauses with "，" and lists with "、": different, and both its own.
    expect(separatorDisagreement('，', '、')).toBe(false);
    expect(separatorDisagreement(' ', ' ')).toBe(false);
    expect(separatorDisagreement(', ', ', ')).toBe(false);
  });

  it('compares no language Intl would answer in another', () => {
    expect(cldrListSeparator('xx')).toBeNull();
  });

  it('has CLDR list data for every card language', () => {
    const skipped = cardLanguages().filter((code) => cldrListSeparator(code) === null);
    expect(skipped).toEqual([]);
  });

  it('reports what it finds where the gate reports it', () => {
    // The rules above, wired into the gate: planted languages, each with one problem, and a
    // control with none. The real files have no violation, so without this the wiring could
    // come apart with every test green.
    const planted = new Map([
      ['de', { file: 'de.json', data: { separator: 'und ' } }],
      ['fr', { file: 'fr.json', data: { separator: ',' } }],
      ['zh-cn', { file: 'zh-CN.json', data: { separator: ', ' } }],
      ['th', { file: 'th.json', data: { separator: ' ' } }],
    ]);
    const errors: string[] = [];
    const warnings: string[] = [];
    const notes: string[] = [];
    checkSeparators(planted, {
      error: (where: string) => errors.push(where),
      warn: (where: string) => warnings.push(where),
      note: (line: string) => notes.push(line),
    });

    expect(errors).toEqual(['languages/de.json']);
    // French for its shape and for disagreeing with CLDR's ", "; German for the latter alone;
    // Chinese for writing ", " where CLDR lists with "、". Thai is the control.
    expect(warnings.sort()).toEqual([
      'languages/de.json',
      'languages/fr.json',
      'languages/fr.json',
      'languages/zh-CN.json',
    ]);
    expect(notes).toEqual([expect.stringContaining('in 4 of 4 languages; 3 disagree')]);
  });
});

describe('the gate itself', () => {
  it('runs when invoked as a script and compares every language', () => {
    // The rules above are exported for these tests, and the gate runs only when it is the
    // script node was asked for. If that guard misjudged, `npm run check:i18n` would exit 0
    // having checked nothing, and every test above would still pass.
    const run = spawnSync(process.execPath, ['scripts/check-i18n.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const count = cardLanguages().length;

    expect(run.status, run.stdout).toBe(0);
    expect(run.stdout).toContain(`${count} languages, `);
    expect(run.stdout).toContain(`${count} of ${count} languages compared with CLDR`);
    expect(run.stdout).toContain(`list punctuation in ${count} of ${count} languages`);
  });
});

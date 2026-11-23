/**
 * The month heading under Home Assistant's `Intl` polyfill, as formatjs 7 writes it.
 *
 * Home Assistant installs formatjs's `Intl.DateTimeFormat` where the browser has no data for its
 * own language, and every card on the page then writes through it. formatjs 7.8.2, which Home
 * Assistant's frontend 20261028 ships, writes a month and year with the month as a date writes
 * it: the genitive "ноября 2026 г." where the browser writes "ноябрь 2026 г.", in ten of the
 * card's languages, and Catalan's "de nov." with its preposition. `tests/intl-polyfill.ts` writes
 * its text with Node's own `Intl`, so it cannot show this, and Node's own `Intl` cannot stand in
 * for formatjs here either: it names Greek's month on its own in the genitive, where formatjs
 * does not. So every format the heading asks for is served from what the real formatjs 7.8.2
 * returned, with its own locale data, for November 15, 2026, and any other is refused.
 *
 * The other half, that a heading the browser writes right is left as it is, is held by
 * `intl-locale-data.test.ts`, which compares every card language under the polyfill with the
 * browser's own writing. Measured outside the suite as well: with the fix, every card language's
 * twelve headings in both forms, and every month rule label, are byte for byte what they were
 * under Node's `Intl` and under formatjs 8.0.3, and under formatjs 7.8.2 they differ from Node's
 * only in Thai's year and the no-break space before "г." and "р.".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { forgetIntlFormats, intlLocales } from '../src/translations/intl-locales';
import { CARD_LANGUAGES } from '../src/translations/language-codes';
import * as Paging from '../src/utils/paging';

type Parts = ReadonlyArray<readonly [Intl.DateTimeFormatPartTypes, string]>;

/** What formatjs 7.8.2's `formatToParts` returned for each format a heading asks for. */
interface Recorded {
  /** `{ month, year: 'numeric' }` */
  heading: Parts;
  /** `{ day: 'numeric', month }` */
  inDate: Parts;
  /** `{ month }` */
  alone: Parts;
}

/** By language and the heading's form, for November 15, 2026, in UTC. */
const FORMATJS_7: Readonly<Record<string, Recorded>> = {
  'ca long': {
    heading: [
      ['month', 'de novembre'],
      ['literal', ' del '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'de novembre'],
    ],
    alone: [['month', 'novembre']],
  },
  'ca short': {
    heading: [
      ['month', 'de nov.'],
      ['literal', ' del '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'de nov.'],
    ],
    alone: [['month', 'nov.']],
  },
  'cs long': {
    heading: [
      ['month', 'listopadu'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', 'listopadu'],
    ],
    alone: [['month', 'listopad']],
  },
  'cs short': {
    heading: [
      ['month', 'listopadu'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', '11'],
      ['literal', '.'],
    ],
    alone: [['month', 'lis']],
  },
  'el long': {
    heading: [
      ['month', 'Νοεμβρίου'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'Νοεμβρίου'],
    ],
    alone: [['month', 'Νοέμβριος']],
  },
  'el short': {
    heading: [
      ['month', 'Νοε'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'Νοε'],
    ],
    alone: [['month', 'Νοέ']],
  },
  'fi long': {
    heading: [
      ['month', 'marraskuuta'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', 'marraskuuta'],
    ],
    alone: [['month', 'marraskuu']],
  },
  'fi short': {
    heading: [
      ['month', 'marras'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '.'],
      ['month', '11'],
      ['literal', '.'],
    ],
    alone: [['month', 'marras']],
  },
  'hr long': {
    heading: [
      ['month', 'studenoga'],
      ['literal', ' '],
      ['year', '2026'],
      ['literal', '.'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', 'studenoga'],
    ],
    alone: [['month', 'studeni']],
  },
  'hr short': {
    heading: [
      ['month', 'stu'],
      ['literal', ' '],
      ['year', '2026'],
      ['literal', '.'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', 'stu'],
    ],
    alone: [['month', 'stu']],
  },
  'lt long': {
    heading: [
      ['year', '2026'],
      ['literal', ' m. '],
      ['month', 'lapkričio'],
    ],
    inDate: [
      ['month', 'lapkričio'],
      ['literal', ' '],
      ['day', '15'],
      ['literal', ' d.'],
    ],
    alone: [['month', 'lapkritis']],
  },
  'lt short': {
    heading: [
      ['year', '2026'],
      ['literal', '-'],
      ['month', '11'],
    ],
    inDate: [
      ['month', '11'],
      ['literal', '-'],
      ['day', '15'],
    ],
    alone: [['month', '11']],
  },
  'pl long': {
    heading: [
      ['month', 'listopada'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'listopada'],
    ],
    alone: [['month', 'listopad']],
  },
  'pl short': {
    heading: [
      ['month', 'lis'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'lis'],
    ],
    alone: [['month', 'lis']],
  },
  'ru long': {
    heading: [
      ['month', 'ноября'],
      ['literal', ' '],
      ['year', '2026'],
      ['literal', '\u202fг.'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'ноября'],
    ],
    alone: [['month', 'ноябрь']],
  },
  'ru short': {
    heading: [
      ['month', 'нояб.'],
      ['literal', ' '],
      ['year', '2026'],
      ['literal', '\u202fг.'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'нояб.'],
    ],
    alone: [['month', 'нояб.']],
  },
  'sk long': {
    heading: [
      ['month', 'novembra'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', 'novembra'],
    ],
    alone: [['month', 'november']],
  },
  'sk short': {
    heading: [
      ['month', '11'],
      ['literal', '/'],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', '11'],
      ['literal', '.'],
    ],
    alone: [['month', 'nov']],
  },
  'uk long': {
    heading: [
      ['month', 'листопада'],
      ['literal', ' '],
      ['year', '2026'],
      ['literal', '\u202fр.'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'листопада'],
    ],
    alone: [['month', 'листопад']],
  },
  'uk short': {
    heading: [
      ['month', 'лист.'],
      ['literal', ' '],
      ['year', '2026'],
      ['literal', '\u202fр.'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'лист.'],
    ],
    alone: [['month', 'лист.']],
  },
  'de long': {
    heading: [
      ['month', 'November'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', 'November'],
    ],
    alone: [['month', 'November']],
  },
  'de short': {
    heading: [
      ['month', 'Nov.'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', '. '],
      ['month', 'Nov.'],
    ],
    alone: [['month', 'Nov']],
  },
  'vi long': {
    heading: [
      ['month', 'tháng 11'],
      ['literal', ' năm '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'tháng 11'],
    ],
    alone: [['month', 'Tháng 11']],
  },
  'vi short': {
    heading: [
      ['month', 'thg 11'],
      ['literal', ' '],
      ['year', '2026'],
    ],
    inDate: [
      ['day', '15'],
      ['literal', ' '],
      ['month', 'thg 11'],
    ],
    alone: [['month', 'Tháng 11']],
  },
  'zh-cn long': {
    heading: [
      ['year', '2026'],
      ['literal', '年'],
      ['month', '11'],
      ['literal', '月'],
    ],
    inDate: [
      ['month', '11'],
      ['literal', '月'],
      ['day', '15'],
      ['literal', '日'],
    ],
    alone: [['month', '十一月']],
  },
  'zh-cn short': {
    heading: [
      ['year', '2026'],
      ['literal', '年'],
      ['month', '11'],
      ['literal', '月'],
    ],
    inDate: [
      ['month', '11'],
      ['literal', '月'],
      ['day', '15'],
      ['literal', '日'],
    ],
    alone: [['month', '11月']],
  },
};

const NOVEMBER = new Date(2026, 10, 15);
const NativeDateTimeFormat = Intl.DateTimeFormat;

/**
 * Which recorded format a set of options asks for, by the fields it names.
 *
 * @param options - What the card asked for
 * @returns The format's name in `Recorded`, or undefined for one not recorded
 */
function recordedFormat(options: Intl.DateTimeFormatOptions): keyof Recorded | undefined {
  const fields = (['weekday', 'year', 'month', 'day'] as const).filter((field) => options[field]);
  return (
    { 'year,month': 'heading', 'month,day': 'inDate', month: 'alone' } as const satisfies Record<
      string,
      keyof Recorded
    >
  )[fields.join(',')];
}

/** formatjs 7 for the formats recorded above, by the language and width asked for. */
class Formatjs7 extends NativeDateTimeFormat {
  private readonly recorded: Parts;

  constructor(locales?: Intl.LocalesArgument, options: Intl.DateTimeFormatOptions = {}) {
    super(locales, options);
    const format = recordedFormat(options);
    const entry = FORMATJS_7[`${super.resolvedOptions().locale.toLowerCase()} ${options.month}`];
    if (!format || !entry) throw new Error(`not recorded: ${JSON.stringify(options)}`);
    this.recorded = entry[format];
  }

  formatToParts(date?: Date | number): Intl.DateTimeFormatPart[] {
    if (new Date(date ?? NaN).getUTCMonth() !== 10) throw new Error('recorded for November only');
    return this.recorded.map(([type, value]) => ({ type, value }));
  }

  format(date?: Date | number): string {
    return this.formatToParts(date)
      .map((part) => part.value)
      .join('');
  }
}

const CASES = Object.keys(FORMATJS_7).map((key) => {
  const [language, form] = key.split(' ') as [string, Paging.MonthForm];
  return { key, language, form };
});

/** The month's run of a heading: the word the toolbar sets bold. */
const monthRun = (language: string, form: Paging.MonthForm) =>
  Paging.monthHeadingParts(NOVEMBER, language, form).find((part) => part.month)?.text;

/** The month part of a heading's parts. */
const monthOf = (parts: ReadonlyArray<{ type: string; value: string }>) =>
  parts.find((part) => part.type === 'month')!.value;

const native = new Map(
  CASES.map(({ key, language, form }) => {
    const format = new NativeDateTimeFormat(language, {
      month: form,
      year: 'numeric',
      timeZone: 'UTC',
    });
    return [key, { run: monthRun(language, form), month: monthOf(format.formatToParts(NOVEMBER)) }];
  }),
);

describe('the month heading under formatjs 7', () => {
  beforeEach(() => {
    Object.defineProperty(Intl, 'DateTimeFormat', { value: Formatjs7, configurable: true });
    forgetIntlFormats();
  });

  afterEach(() => {
    Object.defineProperty(Intl, 'DateTimeFormat', {
      value: NativeDateTimeFormat,
      configurable: true,
    });
    forgetIntlFormats();
  });

  it('is served what formatjs 7 writes, which in ten languages is not the browser’s month', () => {
    const differs = CASES.filter(({ key }) => {
      const recorded = monthOf(FORMATJS_7[key].heading.map(([type, value]) => ({ type, value })));
      return recorded.toLowerCase() !== native.get(key)!.month.toLowerCase();
    }).map(({ key }) => key);
    expect(differs).toEqual([
      'ca long',
      'ca short',
      'cs long',
      'cs short',
      'el long',
      'fi long',
      'hr long',
      'lt long',
      'pl long',
      'ru long',
      'sk long',
      'uk long',
    ]);
  });

  it.each(CASES)('names the month as the browser does: $key', ({ key, language, form }) => {
    expect(monthRun(language, form)).toBe(native.get(key)!.run);
  });

  it('keeps the rest of the heading as formatjs 7 writes it', () => {
    expect(Paging.monthHeading(NOVEMBER, 'ru')).toBe('Ноябрь 2026\u202fг.');
    expect(Paging.monthHeading(NOVEMBER, 'ca', 'short')).toBe('Nov. del 2026');
    expect(Paging.monthHeading(NOVEMBER, 'lt')).toBe('2026 m. lapkritis');
  });
});

describe("the month heading under the browser's own Intl", () => {
  // The months a date writes differently from a heading in some language, at either width: a
  // genitive, a preposition, an abbreviation's dot, or a number. None may change a heading.
  it.each(CARD_LANGUAGES)(
    'is what Intl writes, capitalized where the month leads: %s',
    (language) => {
      const wrong: string[] = [];
      for (const form of ['long', 'short'] as const) {
        const format = new Intl.DateTimeFormat(intlLocales(language), {
          month: form,
          year: 'numeric',
          timeZone: 'UTC',
        });
        for (let month = 0; month < 12; month++) {
          const date = new Date(2026, month, 1);
          const day = new Date(Date.UTC(2026, month, 1));
          const words = format.format(day);
          const expected =
            format.formatToParts(day)[0]?.type === 'month'
              ? words.charAt(0).toLocaleUpperCase(format.resolvedOptions().locale) + words.slice(1)
              : words;
          const heading = Paging.monthHeading(date, language, form);
          if (heading !== expected) wrong.push(`${form} ${month + 1}: ${heading} ≠ ${expected}`);
        }
      }
      expect(wrong).toEqual([]);
    },
  );
});

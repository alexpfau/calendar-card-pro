import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Presentation from '../src/rendering/presentation';
import type { CardLanguage } from '../src/translations/language-codes';
import * as Localize from '../src/translations/localize';
import * as FormatUtils from '../src/utils/format';

/**
 * `separator` joins two clauses of an event's time where English writes ", ": the all-day
 * label and what follows it ("All day, ends tomorrow"), and a start time and the sentence
 * saying when it ends ("22:30, ends tomorrow at 0:30").
 *
 * The card wrote an ASCII ", " there in every language. Chinese writes a clause comma as "，",
 * which carries its own space ("整天，明天结束"), as Home Assistant's own strings do ("容量：
 * {size}，序列号：{serial}"). Thai writes a space between two clauses rather than a comma, as
 * Home Assistant's Thai strings do in 9 of the 11 that join two clauses where English has a
 * comma, and as CLDR's Thai list patterns do. Every other card language writes ", ", as CLDR
 * and Home Assistant do for each of them.
 */

/** Wednesday 21 October 2026, 10:30 local. */
const NOW = new Date(2026, 9, 21, 10, 30);

const TRANSLATIONS = (Localize as unknown as { TRANSLATIONS: Record<string, Types.Translations> })
  .TRANSLATIONS;

/** Every language the card ships, read from the map rather than hardcoded. */
const LANGUAGES = Object.keys(TRANSLATIONS);

const config = buildConfig({ split_multiday_events: false, time_24h: true });

const timed = (start: Date, end: Date): Types.CalendarEventData => ({
  summary: 'Ben night shift',
  start: { dateTime: start.toISOString() },
  end: { dateTime: end.toISOString() },
});

const allDay = (start: string, endExclusive: string): Types.CalendarEventData => ({
  summary: 'Anna away',
  start: { date: start },
  end: { date: endExclusive },
});

/**
 * Each shape that writes a separator, and one that writes none:
 *
 * - a timed event from tonight to tomorrow, where it follows the start time;
 * - all-day events ending today, tomorrow and on Sunday, where it follows the label;
 * - a timed event from yesterday to today, which is one clause and has none to write.
 */
const SHAPES: Types.CalendarEventData[] = [
  timed(new Date(2026, 9, 21, 22, 30), new Date(2026, 9, 22, 0, 30)),
  allDay('2026-10-20', '2026-10-22'),
  allDay('2026-10-21', '2026-10-23'),
  allDay('2026-10-21', '2026-10-26'),
  timed(new Date(2026, 9, 20, 20, 0), new Date(2026, 9, 21, 12, 0)),
];

const timeOf = (event: Types.CalendarEventData, language: string): string =>
  FormatUtils.formatEventTime(event, config, language);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the separator between two parts of an event time', () => {
  it('is ", " in every language but Chinese and Thai', () => {
    // The whole table, by value and written out, so a language losing its own separator, a
    // language gaining one nobody explained, and a language leaving the map all fail. The
    // type holds this list to the card's languages, so it cannot fall behind a new one either.
    const comma = ', ';
    const expected: Record<CardLanguage, string> = {
      bg: comma,
      ca: comma,
      cs: comma,
      da: comma,
      de: comma,
      el: comma,
      en: comma,
      'en-gb': comma,
      es: comma,
      et: comma,
      fi: comma,
      fr: comma,
      he: comma,
      hr: comma,
      hu: comma,
      is: comma,
      it: comma,
      ko: comma,
      lt: comma,
      lv: comma,
      nb: comma,
      nl: comma,
      nn: comma,
      pl: comma,
      pt: comma,
      ro: comma,
      ru: comma,
      sk: comma,
      sl: comma,
      sr: comma,
      'sr-latn': comma,
      sv: comma,
      th: ' ',
      tr: comma,
      uk: comma,
      vi: comma,
      'zh-cn': '，',
      'zh-tw': '，',
    };

    const separators = Object.fromEntries(
      LANGUAGES.map((language) => [language, TRANSLATIONS[language].separator]),
    );

    expect(separators).toEqual(expected);
  });

  it.each([
    [
      'zh-cn',
      [
        '22:30，明天 0:30 结束',
        '整天，今天结束',
        '整天，明天结束',
        '整天，直到 10月25日星期日',
        '今天 12:00 结束',
      ],
    ],
    [
      'zh-tw',
      [
        '22:30，明天 0:30 結束',
        '整天，今天結束',
        '整天，明天結束',
        '整天，直到 10月25日星期日',
        '今天 12:00 結束',
      ],
    ],
    [
      'th',
      [
        '22:30 สิ้นสุดพรุ่งนี้ เวลา 0:30',
        'ตลอดวัน สิ้นสุดวันนี้',
        'ตลอดวัน สิ้นสุดพรุ่งนี้',
        'ตลอดวัน ถึง วันอาทิตย์ที่ 25 ต.ค.',
        'สิ้นสุดวันนี้ เวลา 12:00',
      ],
    ],
  ])('reads in %s as the language punctuates a pause', (language, times) => {
    expect(SHAPES.map((event) => timeOf(event, language))).toEqual(times);
  });

  it.each([
    [
      'en',
      [
        '22:30, ends tomorrow at 0:30',
        'All day, ends today',
        'All day, ends tomorrow',
        'All day, until Sunday, Oct 25',
        'Ends today at 12:00',
      ],
    ],
    [
      'ko',
      [
        '22:30, 내일 0:30에 종료',
        '종일, 오늘 종료',
        '종일, 내일 종료',
        '종일, ~ 10월 25일 일요일',
        '오늘 12:00에 종료',
      ],
    ],
    [
      'he',
      [
        '22:30, מסתיים מחר בשעה 0:30',
        'כל-היום, מסתיים היום',
        'כל-היום, מסתיים מחר',
        'כל-היום, עד ראשון, 25 באוק׳',
        'מסתיים היום בשעה 12:00',
      ],
    ],
  ])('is unchanged in %s', (language, times) => {
    // The controls: Latin, Hangul and Hebrew, each keeping the ", " it always had.
    expect(SHAPES.map((event) => timeOf(event, language))).toEqual(times);
  });

  it('takes the language separator at every join, not a comma written into one', () => {
    // A separator no language writes, planted in English and in Finnish, the language whose
    // "until" is its verb "ends", so its later ends take the separator too ("9:00, päättyy
    // …"). Any join still writing its own ", " keeps it here.
    const planted = ' ¦ ';
    const restore = { en: TRANSLATIONS.en.separator, fi: TRANSLATIONS.fi.separator };
    try {
      TRANSLATIONS.en.separator = planted;
      TRANSLATIONS.fi.separator = planted;

      expect(SHAPES.map((event) => timeOf(event, 'en'))).toEqual([
        '22:30 ¦ ends tomorrow at 0:30',
        'All day ¦ ends today',
        'All day ¦ ends tomorrow',
        'All day ¦ until Sunday, Oct 25',
        'Ends today at 12:00',
      ]);

      const toFriday = timed(new Date(2026, 9, 21, 9, 0), new Date(2026, 9, 23, 17, 0));
      expect(timeOf(toFriday, 'fi')).toBe('9:00 ¦ päättyy perjantaina 23. lokakuuta klo 17:00');
      expect(timeOf(toFriday, 'en')).toBe('9:00 until Friday, Oct 23 at 17:00');
    } finally {
      TRANSLATIONS.en.separator = restore.en;
      TRANSLATIONS.fi.separator = restore.fi;
    }
    expect(timeOf(SHAPES[0], 'en')).toBe('22:30, ends tomorrow at 0:30');
  });

  it('reaches the row the card draws, and stays out of an all-day pill', () => {
    // The row's text is joined in `buildEventPresentation`, which has to hand the join the
    // card's language. With the label drawn as a pill there is nothing to join it to.
    const event = SHAPES[2];
    const row = (overrides: Partial<Types.Config>) =>
      Presentation.buildEventPresentation(event, buildConfig(overrides), 'zh-cn', null)
        .contentParts;

    expect(row({}).eventTime).toBe('整天，明天结束');

    const pill = row({ allday_badge: 'time' });
    expect(pill.allDayBadge?.label).toBe('整天');
    expect(pill.eventTime).toBe('明天结束');
  });
});

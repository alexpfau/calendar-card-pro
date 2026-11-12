import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Localize from '../src/translations/localize';
import * as FormatUtils from '../src/utils/format';

/**
 * The time an unsplit multi-day timed event reads, around "tomorrow".
 *
 * `formatMultiDayTime` builds an end phrase and joins it after the start time with
 * `multiDay` ("until"). For an end on a date that reads naturally — "22:30 until Friday,
 * 23 October at 17:00" — but `endsTomorrow` is a phrase with its own verb, so the join read
 * "22:30 until ends tomorrow at 0:30", and "22:30 bis endet morgen um 0:30" in German. It
 * takes the language's `separator` now, as the all-day label already does ("All day, ends
 * tomorrow"): ", " in English and German, "，" in Chinese. `tests/time-separator.test.ts` pins
 * each language's separator.
 */

/** Wednesday 21 October 2026, 10:30 local. */
const NOW = new Date(2026, 9, 21, 10, 30);

/** Every language the card ships, read from the map rather than hardcoded. */
const LANGUAGES = Object.keys(
  (Localize as unknown as { TRANSLATIONS: Record<string, unknown> }).TRANSLATIONS,
);

/** A timed event between two local wall-clock times. */
function timed(start: Date, end: Date): Types.CalendarEventData {
  return {
    summary: 'Ben night shift',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

const config = buildConfig({ split_multiday_events: false, time_24h: true });

/** The event time as the card writes it. */
function timeOf(event: Types.CalendarEventData, language = 'en'): string {
  return FormatUtils.formatEventTime(event, config, language);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('an unsplit multi-day timed event', () => {
  const tonight = timed(new Date(2026, 9, 21, 22, 30), new Date(2026, 9, 22, 0, 30));

  it('starting today and ending tomorrow reads with a comma', () => {
    expect(timeOf(tonight)).toBe('22:30, ends tomorrow at 0:30');
    expect(timeOf(tonight, 'de')).toBe('22:30, endet morgen um 0:30');
  });

  it('never puts "until" in front of "ends tomorrow", in any language', () => {
    expect(LANGUAGES.length, 'no languages found').toBeGreaterThan(30);

    for (const language of LANGUAGES) {
      const t = Localize.getTranslations(language);
      const out = timeOf(tonight, language);

      // The phrase up to its time, which Hungarian places inside it.
      const phrase = t.endsTomorrow.split(' {at}')[0];
      expect(out, language).not.toContain(`${t.multiDay} ${phrase}`);
      expect(out, language).toContain(`${t.separator}${phrase} `);
    }
  });

  it('keeps "until" before a date', () => {
    const toFriday = timed(new Date(2026, 9, 21, 9, 0), new Date(2026, 9, 23, 17, 0));

    expect(timeOf(toFriday)).toBe('9:00 until Friday, Oct 23 at 17:00');
  });

  it('that started before today keeps its own sentence', () => {
    const overnight = timed(new Date(2026, 9, 20, 20, 0), new Date(2026, 9, 22, 8, 0));

    expect(timeOf(overnight)).toBe('Ends tomorrow at 8:00');
  });

  it('agrees with the all-day label it now follows', () => {
    const allDay: Types.CalendarEventData = {
      summary: 'Anna away',
      start: { date: '2026-10-21' },
      end: { date: '2026-10-23' },
    };

    expect(timeOf(allDay)).toBe('All day, ends tomorrow');
  });
});

describe('the end time in a sentence', () => {
  // `at` puts the end time in the sentence. Most languages write a word before the time,
  // "at 0:30", after "ends today" or "ends tomorrow". Hungarian marks the time with a suffix,
  // "0:30-kor", so its `at` is a template, "{time}-kor", and puts the time before its verb, so
  // its `endsTomorrow` marks the place with `{at}`: "holnap {at} ér véget". Korean does the
  // same with a particle written onto the place, "내일 {at}에 종료". Each shape below is one
  // branch of `formatMultiDayTime` that writes `at`, with the reading the 24-hour and 12-hour
  // clocks print for its end.
  const shapes: [string, Types.CalendarEventData, string, string][] = [
    [
      'from today to tomorrow',
      timed(new Date(2026, 9, 21, 22, 30), new Date(2026, 9, 22, 0, 30)),
      '0:30',
      '12:30 AM',
    ],
    [
      'from today to a later day',
      timed(new Date(2026, 9, 21, 9, 0), new Date(2026, 9, 23, 17, 0)),
      '17:00',
      '5:00 PM',
    ],
    [
      'from an earlier day to today',
      timed(new Date(2026, 9, 20, 20, 0), new Date(2026, 9, 21, 12, 0)),
      '12:00',
      '12:00 PM',
    ],
    [
      'from an earlier day to tomorrow',
      timed(new Date(2026, 9, 20, 20, 0), new Date(2026, 9, 22, 8, 0)),
      '8:00',
      '8:00 AM',
    ],
    [
      'from an earlier day to a later day',
      timed(new Date(2026, 9, 20, 20, 0), new Date(2026, 9, 23, 17, 0)),
      '17:00',
      '5:00 PM',
    ],
  ];

  /** All-day events ending today, tomorrow and later, which read "ends today" with no time. */
  const allDays: Types.CalendarEventData[] = [
    { summary: 'Anna away', start: { date: '2026-10-20' }, end: { date: '2026-10-22' } },
    { summary: 'Anna away', start: { date: '2026-10-21' }, end: { date: '2026-10-23' } },
    { summary: 'Anna away', start: { date: '2026-10-20' }, end: { date: '2026-10-26' } },
  ];

  const twelveHour = buildConfig({ split_multiday_events: false, time_24h: false });
  const events = shapes.map(([, event]) => event);

  it('writes a Hungarian time with its suffix, -kor, before the verb', () => {
    // The dated ends are a label, "eddig:", as Home Assistant's own Hungarian writes one
    // ("eddig használhatja: {date}"), with the date as CLDR writes it: "okt. 23., péntek".
    expect(events.map((event) => timeOf(event, 'hu'))).toEqual([
      '22:30, holnap 0:30-kor ér véget',
      '9:00 eddig: okt. 23., péntek 17:00-kor',
      'Ma 12:00-kor ér véget',
      'Holnap 8:00-kor ér véget',
      'Eddig: okt. 23., péntek 17:00-kor',
    ]);
    // On a 12-hour clock the suffix follows the meridiem, which ends the reading.
    expect(FormatUtils.formatEventTime(events[0], twelveHour, 'hu')).toBe(
      '10:30 PM, holnap 12:30 AM-kor ér véget',
    );
  });

  it('reads a Hungarian all-day end without a time', () => {
    expect(allDays.map((event) => timeOf(event, 'hu'))).toEqual([
      'Egész napos, ma ér véget',
      'Egész napos, holnap ér véget',
      'Egész napos, eddig: okt. 25., vasárnap',
    ]);
  });

  it('writes a Korean time with 에 inside the end phrase, and bare after a date', () => {
    // Korean puts a time before its verb with the particle 에, as Home Assistant's own Korean
    // does ("{time}에 완료"), and writes a date and time side by side with nothing between, as
    // CLDR does ("10월 23일 금요일 오후 5:00").
    expect(events.map((event) => timeOf(event, 'ko'))).toEqual([
      '22:30, 내일 0:30에 종료',
      '9:00 ~ 10월 23일 금요일 17:00',
      '오늘 12:00에 종료',
      '내일 8:00에 종료',
      '~ 10월 23일 금요일 17:00',
    ]);
    expect(events.map((event) => FormatUtils.formatEventTime(event, twelveHour, 'ko'))).toEqual([
      '10:30 PM, 내일 12:30 AM에 종료',
      '9:00 AM ~ 10월 23일 금요일 5:00 PM',
      '오늘 12:00 PM에 종료',
      '내일 8:00 AM에 종료',
      '~ 10월 23일 금요일 5:00 PM',
    ]);
  });

  it('reads a Korean all-day end without the time or its particle', () => {
    // The particle is written onto `{at}`, so it goes with it: "내일 에 종료" would strand it.
    expect(allDays.map((event) => timeOf(event, 'ko'))).toEqual([
      '종일, 오늘 종료',
      '종일, 내일 종료',
      '종일, ~ 10월 25일 일요일',
    ]);
  });

  it('writes a Turkish end as a label, with "saat" before the time', () => {
    // A Turkish time before a verb takes a locative suffix whose vowel follows how the number
    // is read ("0:30'da", "17:00'de", "3:05'te"), so "sona eriyor" needs one string per reading.
    // A label needs none: "bitiş: yarın saat 0:30", as Home Assistant's own Turkish writes a
    // day and time ("{day} saat {time}"). A dated end is the same label, so "bitiş:" is
    // `multiDay` too, and the date follows it as CLDR writes it, "23 Eki Cuma". The word it
    // replaced, "değin", is a postposition and stood before the day it should have followed.
    expect(events.map((event) => timeOf(event, 'tr'))).toEqual([
      '22:30, bitiş: yarın saat 0:30',
      '9:00, bitiş: 23 Eki Cuma saat 17:00',
      'Bitiş: bugün saat 12:00',
      'Bitiş: yarın saat 8:00',
      'Bitiş: 23 Eki Cuma saat 17:00',
    ]);
    expect(events.map((event) => FormatUtils.formatEventTime(event, twelveHour, 'tr'))).toEqual([
      '10:30 PM, bitiş: yarın saat 12:30 AM',
      '9:00 AM, bitiş: 23 Eki Cuma saat 5:00 PM',
      'Bitiş: bugün saat 12:00 PM',
      'Bitiş: yarın saat 8:00 AM',
      'Bitiş: 23 Eki Cuma saat 5:00 PM',
    ]);
    expect(allDays.map((event) => timeOf(event, 'tr'))).toEqual([
      'Tüm gün, bitiş: bugün',
      'Tüm gün, bitiş: yarın',
      'Tüm gün, bitiş: 25 Eki Pazar',
    ]);
  });

  it('leaves English as it was, on both clocks', () => {
    expect(events.map((event) => timeOf(event))).toEqual([
      '22:30, ends tomorrow at 0:30',
      '9:00 until Friday, Oct 23 at 17:00',
      'Ends today at 12:00',
      'Ends tomorrow at 8:00',
      'Until Friday, Oct 23 at 17:00',
    ]);
    expect(events.map((event) => FormatUtils.formatEventTime(event, twelveHour, 'en'))).toEqual([
      '10:30 PM, ends tomorrow at 12:30 AM',
      '9:00 AM until Friday, Oct 23 at 5:00 PM',
      'Ends today at 12:00 PM',
      'Ends tomorrow at 8:00 AM',
      'Until Friday, Oct 23 at 5:00 PM',
    ]);
    expect(allDays.map((event) => timeOf(event))).toEqual([
      'All day, ends today',
      'All day, ends tomorrow',
      'All day, until Sunday, Oct 25',
    ]);
  });

  /** Whether a language writes any of the three strings as a template. */
  const templated = (language: string) => {
    const t = Localize.getTranslations(language);
    return [t.at, t.endsToday, t.endsTomorrow].some((text) => /\{\w+\}/.test(text));
  };

  it('is a template in Hungarian, Korean, Lithuanian and Chinese alone', () => {
    // A language that takes up the template gets a test of its own above or below, rather
    // than passing the one after this by being skipped.
    expect(LANGUAGES.filter(templated)).toEqual(['hu', 'ko', 'lt', 'zh-cn', 'zh-tw']);
  });

  it('ends every other language with `at`, a space and the time', () => {
    let compared = 0;
    for (const language of LANGUAGES) {
      if (templated(language)) continue;
      const t = Localize.getTranslations(language);
      for (const [shape, event, reading] of shapes) {
        expect(
          timeOf(event, language).endsWith(` ${t.at} ${reading}`),
          `${language}, ${shape}`,
        ).toBe(true);
        compared++;
      }
    }
    expect(compared).toBe((LANGUAGES.length - 5) * shapes.length);
  });

  it('leaves no placeholder behind in any language, on either clock', () => {
    // A misspelled placeholder, or one written into a string that is not a template, would
    // reach the card as literal text.
    for (const language of LANGUAGES) {
      for (const [shape, event, reading, twelve] of shapes) {
        const day = timeOf(event, language);
        const half = FormatUtils.formatEventTime(event, twelveHour, language);
        expect(day, `${language}, ${shape}`).not.toMatch(/[{}]/);
        expect(half, `${language}, ${shape}, 12-hour`).not.toMatch(/[{}]/);
        expect(day, `${language}, ${shape}`).toContain(reading);
        expect(half, `${language}, ${shape}, 12-hour`).toContain(twelve);
      }
      for (const event of allDays) {
        expect(timeOf(event, language), `${language}, all day`).not.toMatch(/[{}]/);
      }
    }
  });

  it('writes a Norwegian end with one space after "kl."', () => {
    expect(events.map((event) => timeOf(event, 'nb'))).toEqual([
      '22:30, slutter i morgen kl. 0:30',
      '9:00 til fredag 23. okt. kl. 17:00',
      'Slutter i dag kl. 12:00',
      'Slutter i morgen kl. 8:00',
      'Til fredag 23. okt. kl. 17:00',
    ]);
    expect(events.map((event) => timeOf(event, 'nn'))).toEqual([
      '22:30, sluttar i morgon kl. 0:30',
      '9:00 til fredag 23. okt. kl. 17:00',
      'Sluttar i dag kl. 12:00',
      'Sluttar i morgon kl. 8:00',
      'Til fredag 23. okt. kl. 17:00',
    ]);
  });

  // The words around the date and the time, each checked against CLDR's own date-and-time
  // pattern (`Intl.DateTimeFormat` with a date and time style) and Home Assistant's strings
  // for the language. Each row is the five shapes above on both clocks, then the three
  // all-day ends: today, tomorrow, and Sunday, Oct 25.
  //
  // - Slovene `do` and Estonian `kuni` govern the weekday, so `fullDaysOfWeek` holds the
  //   genitive ("do petka") and the terminative ("kuni reedeni").
  // - Spanish names a day with its article, "hasta el viernes", as Home Assistant writes
  //   "hasta el {date}". Every weekday is masculine, so the article is part of `multiDay`.
  // - Greek does too, but its article follows the day's gender, "έως την Παρασκευή", "έως το
  //   Σάββατο", so it is part of each weekday.
  // - Slovak writes a clock time with "o" and Ukrainian with "о", as CLDR ("o 17:00",
  //   "о 17:00") and Home Assistant ("{day} o {time}", "{day} о {time}") do.
  // - Lithuanian writes a date and its time side by side, as CLDR ("penktadienis 17:00") and
  //   Home Assistant ("{day} {time}") do, so its `at` is `{time}`.
  // - Chinese does too, and puts a time before its verb: "明天 0:30 结束". All day there is no
  //   time, and the phrase reads as it always did, "明天结束", with no space left inside it.
  //
  // Czech is the control: it shares Slovak's `do` and its genitive, and its "v 17:00" is right.
  const PHRASES: Record<string, { h24: string[]; h12: string[]; allDay: string[] }> = {
    sl: {
      h24: [
        '22:30, konča se jutri ob 0:30',
        '9:00 do petka, 23. okt. ob 17:00',
        'Konča se danes ob 12:00',
        'Konča se jutri ob 8:00',
        'Do petka, 23. okt. ob 17:00',
      ],
      h12: [
        '10:30 PM, konča se jutri ob 12:30 AM',
        '9:00 AM do petka, 23. okt. ob 5:00 PM',
        'Konča se danes ob 12:00 PM',
        'Konča se jutri ob 8:00 AM',
        'Do petka, 23. okt. ob 5:00 PM',
      ],
      allDay: [
        'Cel dan, konča se danes',
        'Cel dan, konča se jutri',
        'Cel dan, do nedelje, 25. okt.',
      ],
    },
    es: {
      h24: [
        '22:30, termina mañana a las 0:30',
        '9:00 hasta el viernes, 23 oct a las 17:00',
        'Termina hoy a las 12:00',
        'Termina mañana a las 8:00',
        'Hasta el viernes, 23 oct a las 17:00',
      ],
      h12: [
        '10:30 PM, termina mañana a las 12:30 AM',
        '9:00 AM hasta el viernes, 23 oct a las 5:00 PM',
        'Termina hoy a las 12:00 PM',
        'Termina mañana a las 8:00 AM',
        'Hasta el viernes, 23 oct a las 5:00 PM',
      ],
      allDay: [
        'Todo el día, termina hoy',
        'Todo el día, termina mañana',
        'Todo el día, hasta el domingo, 25 oct',
      ],
    },
    el: {
      h24: [
        '22:30, λήγει αύριο στις 0:30',
        '9:00 έως την Παρασκευή 23 Οκτ στις 17:00',
        'Λήγει σήμερα στις 12:00',
        'Λήγει αύριο στις 8:00',
        'Έως την Παρασκευή 23 Οκτ στις 17:00',
      ],
      h12: [
        '10:30 PM, λήγει αύριο στις 12:30 AM',
        '9:00 AM έως την Παρασκευή 23 Οκτ στις 5:00 PM',
        'Λήγει σήμερα στις 12:00 PM',
        'Λήγει αύριο στις 8:00 AM',
        'Έως την Παρασκευή 23 Οκτ στις 5:00 PM',
      ],
      allDay: [
        'Ολοήμερο, λήγει σήμερα',
        'Ολοήμερο, λήγει αύριο',
        'Ολοήμερο, έως την Κυριακή 25 Οκτ',
      ],
    },
    et: {
      h24: [
        '22:30, lõpeb homme kell 0:30',
        '9:00 kuni reedeni, 23. okt kell 17:00',
        'Lõpeb täna kell 12:00',
        'Lõpeb homme kell 8:00',
        'Kuni reedeni, 23. okt kell 17:00',
      ],
      h12: [
        '10:30 PM, lõpeb homme kell 12:30 AM',
        '9:00 AM kuni reedeni, 23. okt kell 5:00 PM',
        'Lõpeb täna kell 12:00 PM',
        'Lõpeb homme kell 8:00 AM',
        'Kuni reedeni, 23. okt kell 5:00 PM',
      ],
      allDay: [
        'Kogu päev, lõpeb täna',
        'Kogu päev, lõpeb homme',
        'Kogu päev, kuni pühapäevani, 25. okt',
      ],
    },
    sk: {
      h24: [
        '22:30, končí zajtra o 0:30',
        '9:00 do piatku 23. októbra o 17:00',
        'Končí dnes o 12:00',
        'Končí zajtra o 8:00',
        'Do piatku 23. októbra o 17:00',
      ],
      h12: [
        '10:30 PM, končí zajtra o 12:30 AM',
        '9:00 AM do piatku 23. októbra o 5:00 PM',
        'Končí dnes o 12:00 PM',
        'Končí zajtra o 8:00 AM',
        'Do piatku 23. októbra o 5:00 PM',
      ],
      allDay: ['Celý deň, končí dnes', 'Celý deň, končí zajtra', 'Celý deň, do nedele 25. októbra'],
    },
    uk: {
      h24: [
        '22:30, закінчується завтра о 0:30',
        "9:00 до п'ятниці, 23 жовт. о 17:00",
        'Закінчується сьогодні о 12:00',
        'Закінчується завтра о 8:00',
        "До п'ятниці, 23 жовт. о 17:00",
      ],
      h12: [
        '10:30 PM, закінчується завтра о 12:30 AM',
        "9:00 AM до п'ятниці, 23 жовт. о 5:00 PM",
        'Закінчується сьогодні о 12:00 PM',
        'Закінчується завтра о 8:00 AM',
        "До п'ятниці, 23 жовт. о 5:00 PM",
      ],
      allDay: [
        'Весь день, закінчується сьогодні',
        'Весь день, закінчується завтра',
        'Весь день, до неділі, 25 жовт.',
      ],
    },
    lt: {
      h24: [
        '22:30, baigiasi rytoj 0:30',
        '9:00 iki spalio 23 d., penktadienio 17:00',
        'Baigiasi šiandien 12:00',
        'Baigiasi rytoj 8:00',
        'Iki spalio 23 d., penktadienio 17:00',
      ],
      h12: [
        '10:30 PM, baigiasi rytoj 12:30 AM',
        '9:00 AM iki spalio 23 d., penktadienio 5:00 PM',
        'Baigiasi šiandien 12:00 PM',
        'Baigiasi rytoj 8:00 AM',
        'Iki spalio 23 d., penktadienio 5:00 PM',
      ],
      allDay: [
        'Visą dieną, baigiasi šiandien',
        'Visą dieną, baigiasi rytoj',
        'Visą dieną, iki spalio 25 d., sekmadienio',
      ],
    },
    'zh-cn': {
      h24: [
        '22:30，明天 0:30 结束',
        '9:00 直到 10月23日星期五 17:00',
        '今天 12:00 结束',
        '明天 8:00 结束',
        '直到 10月23日星期五 17:00',
      ],
      h12: [
        '10:30 PM，明天 12:30 AM 结束',
        '9:00 AM 直到 10月23日星期五 5:00 PM',
        '今天 12:00 PM 结束',
        '明天 8:00 AM 结束',
        '直到 10月23日星期五 5:00 PM',
      ],
      allDay: ['整天，今天结束', '整天，明天结束', '整天，直到 10月25日星期日'],
    },
    'zh-tw': {
      h24: [
        '22:30，明天 0:30 結束',
        '9:00 直到 10月23日星期五 17:00',
        '今天 12:00 結束',
        '明天 8:00 結束',
        '直到 10月23日星期五 17:00',
      ],
      h12: [
        '10:30 PM，明天 12:30 AM 結束',
        '9:00 AM 直到 10月23日星期五 5:00 PM',
        '今天 12:00 PM 結束',
        '明天 8:00 AM 結束',
        '直到 10月23日星期五 5:00 PM',
      ],
      allDay: ['整天，今天結束', '整天，明天結束', '整天，直到 10月25日星期日'],
    },
    cs: {
      h24: [
        '22:30, končí zítra v 0:30',
        '9:00 do pátku 23. října v 17:00',
        'Končí dnes v 12:00',
        'Končí zítra v 8:00',
        'Do pátku 23. října v 17:00',
      ],
      h12: [
        '10:30 PM, končí zítra v 12:30 AM',
        '9:00 AM do pátku 23. října v 5:00 PM',
        'Končí dnes v 12:00 PM',
        'Končí zítra v 8:00 AM',
        'Do pátku 23. října v 5:00 PM',
      ],
      allDay: ['Celý den, končí dnes', 'Celý den, končí zítra', 'Celý den, do neděle 25. října'],
    },
  };

  it.each(Object.keys(PHRASES))('writes the words around the date and time in %s', (language) => {
    const { h24, h12, allDay } = PHRASES[language];
    expect(events.map((event) => timeOf(event, language))).toEqual(h24);
    expect(events.map((event) => FormatUtils.formatEventTime(event, twelveHour, language))).toEqual(
      h12,
    );
    expect(allDays.map((event) => timeOf(event, language))).toEqual(allDay);
  });

  it('puts one space between words in every language, on every clock', () => {
    // A string carrying a space of its own at either end doubles the one the card joins it
    // with: Norwegian's `at` was "kl. ", so its ends read "slutter i morgen kl.  0:30". The
    // test above that ends a language with `at`, a space and the time cannot see that, since it
    // builds its expectation from the same `at`.
    const twoDigit = buildConfig({
      split_multiday_events: false,
      time_24h: true,
      time_two_digit_hours: true,
    });
    const clocks = [config, twelveHour, twoDigit];
    let compared = 0;
    for (const language of LANGUAGES) {
      for (const [index, clock] of clocks.entries()) {
        for (const event of [...events, ...allDays]) {
          const text = FormatUtils.formatEventTime(event, clock, language);
          expect(text, `${language}, clock ${index}: ${JSON.stringify(text)}`).not.toMatch(
            /\s{2}|^\s|\s$/,
          );
          compared++;
        }
      }
    }
    expect(compared).toBe(LANGUAGES.length * clocks.length * (events.length + allDays.length));
  });
});

describe('a Hungarian event ending today', () => {
  it('says "today", not "this evening", whatever the hour', () => {
    // "ma este" is "this evening", which an end at noon contradicts ("Ma 12:00-kor ér véget"
    // above). The card's "holnap ér véget" has no time of day in it either.
    const t = Localize.getTranslations('hu');
    expect(t.endsToday).toBe('ma {at} ér véget');
    expect(t.endsTomorrow).toBe('holnap {at} ér véget');
  });
});

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
 * takes a comma now, as the all-day label already does ("All day, ends tomorrow"), with no
 * new string in any language.
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
      expect(out, language).toContain(`, ${phrase} `);
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
    // The whole phrase is pinned, so the dated ends also record "eddig:" and the month as
    // "Okt 23", which are older strings this test does not vouch for.
    expect(events.map((event) => timeOf(event, 'hu'))).toEqual([
      '22:30, holnap 0:30-kor ér véget',
      '9:00 eddig: péntek, Okt 23 17:00-kor',
      'Ma 12:00-kor ér véget',
      'Holnap 8:00-kor ér véget',
      'Eddig: péntek, Okt 23 17:00-kor',
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
      'Egész napos, eddig: vasárnap, Okt 25',
    ]);
  });

  it('writes a Korean time with 에 inside the end phrase, and bare after a date', () => {
    // Korean puts a time before its verb with the particle 에, as Home Assistant's own Korean
    // does ("{time}에 완료"), and writes a date and time side by side with nothing between, as
    // CLDR does ("10월 23일 금요일 오후 5:00"). The dated ends also record "23 10월", an older
    // date order this test does not vouch for.
    expect(events.map((event) => timeOf(event, 'ko'))).toEqual([
      '22:30, 내일 0:30에 종료',
      '9:00 ~ 금요일, 23 10월 17:00',
      '오늘 12:00에 종료',
      '내일 8:00에 종료',
      '~ 금요일, 23 10월 17:00',
    ]);
    expect(events.map((event) => FormatUtils.formatEventTime(event, twelveHour, 'ko'))).toEqual([
      '10:30 PM, 내일 12:30 AM에 종료',
      '9:00 AM ~ 금요일, 23 10월 5:00 PM',
      '오늘 12:00 PM에 종료',
      '내일 8:00 AM에 종료',
      '~ 금요일, 23 10월 5:00 PM',
    ]);
  });

  it('reads a Korean all-day end without the time or its particle', () => {
    // The particle is written onto `{at}`, so it goes with it: "내일 에 종료" would strand it.
    expect(allDays.map((event) => timeOf(event, 'ko'))).toEqual([
      '종일, 오늘 종료',
      '종일, 내일 종료',
      '종일, ~ 일요일, 25 10월',
    ]);
  });

  it('writes a Turkish end as a label, with "saat" before the time', () => {
    // A Turkish time before a verb takes a locative suffix whose vowel follows how the number
    // is read ("0:30'da", "17:00'de", "3:05'te"), so "sona eriyor" needs one string per reading.
    // A label needs none: "bitiş: yarın saat 0:30", as Home Assistant's own Turkish writes a
    // day and time ("{day} saat {time}"). The dated ends also record "değin" before the day,
    // an older string this test does not vouch for.
    expect(events.map((event) => timeOf(event, 'tr'))).toEqual([
      '22:30, bitiş: yarın saat 0:30',
      '9:00 değin Cuma, 23 Eki saat 17:00',
      'Bitiş: bugün saat 12:00',
      'Bitiş: yarın saat 8:00',
      'Değin Cuma, 23 Eki saat 17:00',
    ]);
    expect(events.map((event) => FormatUtils.formatEventTime(event, twelveHour, 'tr'))).toEqual([
      '10:30 PM, bitiş: yarın saat 12:30 AM',
      '9:00 AM değin Cuma, 23 Eki saat 5:00 PM',
      'Bitiş: bugün saat 12:00 PM',
      'Bitiş: yarın saat 8:00 AM',
      'Değin Cuma, 23 Eki saat 5:00 PM',
    ]);
    expect(allDays.map((event) => timeOf(event, 'tr'))).toEqual([
      'Tüm gün, bitiş: bugün',
      'Tüm gün, bitiş: yarın',
      'Tüm gün, değin Pazar, 25 Eki',
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

  it('is a template in Hungarian and Korean alone', () => {
    // A language that takes up the template gets a test of its own above, rather than
    // passing the one below by being skipped.
    expect(LANGUAGES.filter(templated)).toEqual(['hu', 'ko']);
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
    expect(compared).toBe((LANGUAGES.length - 2) * shapes.length);
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
    // The whole phrase is pinned, so the dated ends also record "23 okt", an older string this
    // test does not vouch for.
    expect(events.map((event) => timeOf(event, 'nb'))).toEqual([
      '22:30, slutter i morgen kl. 0:30',
      '9:00 til fredag, 23 okt kl. 17:00',
      'Slutter i dag kl. 12:00',
      'Slutter i morgen kl. 8:00',
      'Til fredag, 23 okt kl. 17:00',
    ]);
    expect(events.map((event) => timeOf(event, 'nn'))).toEqual([
      '22:30, sluttar i morgon kl. 0:30',
      '9:00 til fredag, 23 okt kl. 17:00',
      'Sluttar i dag kl. 12:00',
      'Sluttar i morgon kl. 8:00',
      'Til fredag, 23 okt kl. 17:00',
    ]);
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

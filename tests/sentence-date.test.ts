/**
 * The date inside an event's end phrase: "until Friday, Oct 23 at 17:00".
 *
 * The browser writes it, in the card's language, so its order, punctuation, and the form and
 * case of its month are CLDR's: "do pátku 23. října", "eddig: okt. 23., péntek", "~ 10월 23일
 * 금요일". The language's own `fullDaysOfWeek` supplies the weekday, because its form depends
 * on the word before it ("do pátku", where CLDR writes "pátek"). Until this, the card built
 * the date from its own month abbreviations in one of three hard-coded orders, which read
 * "15 Lis" in Czech, "23 10월" in Korean and "Nov 15" in Hungarian.
 *
 * The values pinned here are what Node's CLDR writes, which is what Chromium writes too: the
 * same 20,178 end phrases were compared in both, byte for byte. Safari's CLDR differed in a few
 * valid details (Catalan "1 nov." for "1 de nov.", British "Sep" for "Sept", a comma after the
 * Slovak weekday), so these are Node's bytes, not every browser's. A Node release that moves
 * CLDR can move a pin; read such a failure as a CLDR change before reading it as a regression.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Localize from '../src/translations/localize';
import * as FormatUtils from '../src/utils/format';

/** Wednesday 21 October 2026, 10:30 local. */
const NOW = new Date(2026, 9, 21, 10, 30);

const LANGUAGES = Object.keys(Localize.TRANSLATIONS);

const config = buildConfig({ split_multiday_events: false, time_24h: true });
const twelveHour = buildConfig({ split_multiday_events: false, time_24h: false });

/** A timed event between two local wall-clock times. */
function timed(start: Date, end: Date): Types.CalendarEventData {
  return {
    summary: 'Anna away',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

/** `YYYY-MM-DD` for a local date. */
function ymd(date: Date): string {
  return (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-` +
    String(date.getDate()).padStart(2, '0')
  );
}

/** An all-day event from yesterday through `last`, inclusive. */
function allDayThrough(last: Date): Types.CalendarEventData {
  const end = new Date(last);
  end.setDate(end.getDate() + 1);
  return { summary: 'Ben away', start: { date: '2026-10-20' }, end: { date: ymd(end) } };
}

/**
 * Three ends, one per branch that writes a date: from today to Friday, Oct 23, on the 24-hour
 * clock; from yesterday to Sunday, Nov 15, on the 12-hour clock; and all day through Nov 15.
 */
function ends(language: string): string[] {
  return [
    FormatUtils.formatEventTime(
      timed(new Date(2026, 9, 21, 9, 0), new Date(2026, 9, 23, 17, 0)),
      config,
      language,
    ),
    FormatUtils.formatEventTime(
      timed(new Date(2026, 9, 20, 20, 0), new Date(2026, 10, 15, 17, 0)),
      twelveHour,
      language,
    ),
    FormatUtils.formatEventTime(allDayThrough(new Date(2026, 10, 15)), config, language),
  ];
}

/** The date alone, as the all-day phrase writes it after `multiDay`, for a last day. */
function dateOf(language: string, last: Date): string {
  const { text } = FormatUtils.formatEventTimeParts(allDayThrough(last), config, language);
  const { multiDay } = Localize.getTranslations(language);
  expect(text.startsWith(`${multiDay} `), `${language}: ${text}`).toBe(true);
  return text.slice(multiDay.length + 1);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a date in an end phrase', () => {
  it('leaves English and Polish as they were, on both clocks', () => {
    // English's own order was already CLDR's, and Polish's abbreviations were CLDR's too, so
    // neither moves. A change to how the date is put together would move them first.
    expect(ends('en')).toEqual([
      '9:00 until Friday, Oct 23 at 17:00',
      'Until Sunday, Nov 15 at 5:00 PM',
      'All day, until Sunday, Nov 15',
    ]);
    expect(ends('pl')).toEqual([
      '9:00 do piątku, 23 paź o 17:00',
      'Do niedzieli, 15 lis o 5:00 PM',
      'Cały dzień, do niedzieli, 15 lis',
    ]);
  });

  it('writes the month as German abbreviates it, with its dot', () => {
    expect(ends('de')).toEqual([
      '9:00 bis Freitag, 23. Okt. um 17:00',
      'Bis Sonntag, 15. Nov. um 5:00 PM',
      'Ganztägig, bis Sonntag, 15. Nov.',
    ]);
  });

  it('names the month in full, in the genitive, where Czech abbreviates it as a number', () => {
    // CLDR's short Czech date is "15. 11.", so the card names the month in full instead,
    // which after "do" is the genitive CLDR writes inside a date anyway: "15. listopadu".
    expect(ends('cs')).toEqual([
      '9:00 do pátku 23. října v 17:00',
      'Do neděle 15. listopadu v 5:00 PM',
      'Celý den, do neděle 15. listopadu',
    ]);
  });

  it('writes a Finnish date in the partitive after the essive weekday', () => {
    expect(ends('fi')).toEqual([
      '9:00, päättyy perjantaina 23. lokakuuta klo 17:00',
      'Päättyy sunnuntaina 15. marraskuuta klo 5:00 PM',
      'Koko päivä, päättyy sunnuntaina 15. marraskuuta',
    ]);
  });

  it('writes a Hungarian date month first, with the weekday after it', () => {
    // "eddig:" is a label, as Home Assistant's own Hungarian writes one ("eddig használhatja:
    // {date}"), so the date after it stands in the nominative.
    expect(ends('hu')).toEqual([
      '9:00 eddig: okt. 23., péntek 17:00-kor',
      'Eddig: nov. 15., vasárnap 5:00 PM-kor',
      'Egész napos, eddig: nov. 15., vasárnap',
    ]);
  });

  it('writes a Korean date month first, with its units', () => {
    expect(ends('ko')).toEqual([
      '9:00 ~ 10월 23일 금요일 17:00',
      '~ 11월 15일 일요일 5:00 PM',
      '종일, ~ 11월 15일 일요일',
    ]);
  });

  it('writes a Turkish date day first, with the weekday after it', () => {
    expect(ends('tr')).toEqual([
      '9:00 değin 23 Eki Cuma saat 17:00',
      'Değin 15 Kas Pazar saat 5:00 PM',
      'Tüm gün, değin 15 Kas Pazar',
    ]);
  });

  it('names the weekday as the language writes it after `multiDay`, in every language', () => {
    // A week of last days, Sunday 25 October first. Where CLDR's own weekday is not a part of
    // the card's, as Czech "pátek" is not of "pátku", it must be absent: the card's form
    // replaced it rather than joining it.
    let replaced = 0;
    for (const language of LANGUAGES) {
      const days = Localize.getTranslations(language).fullDaysOfWeek;
      const cldr = new Intl.DateTimeFormat(language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      for (let i = 0; i < 7; i++) {
        const last = new Date(2026, 9, 25 + i);
        const date = dateOf(language, last);
        expect(date, `${language}, day ${i}`).toContain(days[last.getDay()]);
        const own = cldr.formatToParts(last).find((part) => part.type === 'weekday')?.value ?? '';
        expect(own, language).not.toBe('');
        if (!days[last.getDay()].includes(own)) {
          expect(date, `${language}, day ${i}`).not.toContain(own);
          replaced++;
        }
      }
    }
    // Czech, Slovak, Croatian, both Serbians, Ukrainian, Polish, Russian, Lithuanian, Latvian,
    // Finnish, Hebrew and Vietnamese write a weekday of their own here.
    expect(replaced).toBeGreaterThan(50);
  });

  it('writes a Thai weekday as CLDR does, since its date reads "วันศุกร์ที่ 23"', () => {
    // CLDR's Thai date puts ที่ after the weekday, written with วัน: "วันศุกร์ที่ 23 ต.ค.". The
    // card's weekday took the place of CLDR's without its วัน, "ศุกร์ที่ 23", until it became
    // CLDR's own word.
    expect(ends('th')[0]).toBe('9:00 ถึง วันศุกร์ที่ 23 ต.ค. เวลา 17:00');
  });

  it('names the month in words and the day as a number, in every language and month', () => {
    // A date that named its month as a number would have no letter left once its weekday is
    // taken out: Czech's short form is "23. 10.". Korean's and Chinese's units, 월 and 月,
    // are letters, so their dates pass as they should.
    //
    // And the month is the language's own: one of the names CLDR gives it inside a date, short
    // or full, read from a date with no weekday, which the card never formats. A date written
    // in the wrong language, English say, fails here for every language whose months differ.
    let compared = 0;
    for (const language of LANGUAGES) {
      const days = Localize.getTranslations(language).fullDaysOfWeek;
      const monthName = (form: 'short' | 'long', last: Date) =>
        new Intl.DateTimeFormat(language, { day: 'numeric', month: form })
          .formatToParts(last)
          .find((part) => part.type === 'month')?.value ?? '';
      for (let month = 0; month < 12; month++) {
        const last = new Date(2027, month, 23);
        const date = dateOf(language, last);
        const withoutWeekday = date.replace(days[last.getDay()], '');
        expect(withoutWeekday, `${language}, ${date}`).toMatch(/\p{L}/u);
        expect(withoutWeekday, `${language}, ${date}`).toContain('23');
        const names = [monthName('short', last), monthName('long', last)];
        expect(
          names.some((name) => name !== '' && withoutWeekday.includes(name)),
          `${language}: ${date} names none of ${JSON.stringify(names)}`,
        ).toBe(true);
        compared++;
      }
    }
    expect(compared).toBe(LANGUAGES.length * 12);
  });

  it("names the day the device is in, after the device's time zone changes", async () => {
    // The browser's format is made once per language and kept, and a format reads a moment in
    // the zone it was made in. One made in UTC and kept after the device moved to New York
    // named Friday, Jan 15 for an end at 19:30 on Thursday, Jan 14 there. The card reads the
    // day in the local zone and has the format write it as noon UTC, in UTC. Noon UTC is the
    // same date from UTC-12 to UTC+12, so the format is made here in Kiritimati, UTC+14, where
    // it is not: a format made there without its own zone named the next day. A fresh module
    // makes sure no earlier test made the format first.
    const event = timed(new Date(Date.UTC(2026, 9, 20, 9)), new Date(Date.UTC(2027, 0, 15, 0, 30)));
    const before = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati';
      expect(new Date(2027, 0, 1).getTimezoneOffset(), 'the zone did not change').toBe(-840);
      vi.resetModules();
      const fresh = await import('../src/utils/format');
      expect(fresh.formatEventTime(event, config, 'en')).toBe('Until Friday, Jan 15 at 14:30');
      process.env.TZ = 'America/New_York';
      expect(new Date(2027, 0, 1).getTimezoneOffset(), 'the zone did not change').toBe(300);
      expect(fresh.formatEventTime(event, config, 'en')).toBe('Until Thursday, Jan 14 at 19:30');
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it('writes a language the card does not have in English, words and date alike', () => {
    // Japanese is a language the browser has and the card does not, so a date written in the
    // requested language rather than the translations' would read "until 10月23日 Friday".
    const event = timed(new Date(2026, 9, 21, 9, 0), new Date(2026, 9, 23, 17, 0));
    for (const language of ['ja', 'qq', '']) {
      expect(FormatUtils.formatEventTime(event, config, language), language).toBe(
        '9:00 until Friday, Oct 23 at 17:00',
      );
    }
    expect(FormatUtils.formatEventTime(event, config, 'DE')).toBe(
      FormatUtils.formatEventTime(event, config, 'de'),
    );
  });
});

describe('a date in a language the browser has no data for', () => {
  // Chromium ships no Icelandic, and answers an Icelandic format in English. The card builds
  // that date from its own names instead, as it did before the browser wrote it. Each case
  // loads the formatter afresh, since it remembers what the browser answered per language.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function withoutBrowserData(fail: () => string[]): Promise<typeof FormatUtils> {
    vi.resetModules();
    vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockImplementation(fail);
    return import('../src/utils/format');
  }

  it("builds the date from the card's own names, in the order it had before", async () => {
    const format = await withoutBrowserData(() => []);
    const event = timed(new Date(2026, 9, 21, 9, 0), new Date(2026, 9, 23, 17, 0));
    const read = (language: string) => format.formatEventTime(event, config, language);

    expect(read('is')).toBe('9:00 þar til föstudagur, 23 Okt kl 17:00');
    expect(read('de')).toBe('9:00 bis Freitag, 23. Okt um 17:00');
    expect(read('hu')).toBe('9:00 eddig: péntek, Okt 23 17:00-kor');
    expect(read('en')).toBe('9:00 until Friday, Oct 23 at 17:00');
    expect(Intl.DateTimeFormat.supportedLocalesOf).toHaveBeenCalled();
  });

  it('builds it the same way where the browser rejects the language outright', async () => {
    const format = await withoutBrowserData(() => {
      throw new RangeError('Incorrect locale information provided');
    });
    const event = timed(new Date(2026, 9, 21, 9, 0), new Date(2026, 9, 23, 17, 0));

    expect(format.formatEventTime(event, config, 'cs')).toBe('9:00 do pátku, 23 Říj v 17:00');
  });
});

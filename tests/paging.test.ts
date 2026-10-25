/**
 * The pure rules of paging through dates: how long a page is, where home is, where the arrows
 * and the date picker lead, and what the toolbar calls a page.
 *
 * Everything here is a local calendar day, so this file runs under the `unit` project's UTC;
 * `paging.dst.test.ts` runs the arithmetic across daylight-saving changes in three zones.
 * Labels are compared against `Intl`'s own answers on the pinned Node, written out rather
 * than derived from `Intl` again here, so a change to how a label is built shows up as a
 * changed string.
 */

import { describe, expect, it } from 'vitest';

import * as Paging from '../src/utils/paging';

/** A Wednesday, mid-month and mid-year: no week, month or year boundary by accident. */
const NOW = new Date(2026, 5, 17, 10, 0);

const day = (year: number, month: number, date: number): Date => new Date(year, month - 1, date);

/** `Intl`'s range separator: an en dash between thin spaces. */
const TO = '\u2009–\u2009';
const key = (date: Date): string => Paging.pageKey(date);

describe('page length', () => {
  it('is every configured day, or the columns drawn while the layout drops some', () => {
    expect(Paging.pageSpan(7, 0)).toBe(7);
    expect(Paging.pageSpan(7, 7)).toBe(7);
    expect(Paging.pageSpan(7, 4)).toBe(4);
    expect(Paging.pageSpan(1, 0)).toBe(1);
  });

  it('is never shorter than a day', () => {
    expect(Paging.pageSpan(0, 0)).toBe(1);
    expect(Paging.pageSpan(Number.NaN, 0)).toBe(1);
  });
});

describe('home', () => {
  it('is the configured window when every day is drawn', () => {
    const home = Paging.homeRange(day(2026, 6, 15), 7, 0, NOW);
    expect(key(home.start)).toBe('2026-06-15');
    expect(home.days).toBe(7);
  });

  it('starts at today while the layout drops columns and today is in the window', () => {
    const home = Paging.homeRange(day(2026, 6, 15), 7, 3, NOW);
    expect(key(home.start)).toBe('2026-06-17');
    expect(home.days).toBe(3);
  });

  it('stays inside the window at either end, as the drawn slice does', () => {
    // Today near the end: the slice ends on the window's last day rather than past it, so
    // June 12 to 18 drawn four days wide is the 15th to the 18th.
    expect(key(Paging.homeRange(day(2026, 6, 12), 7, 4, NOW).start)).toBe('2026-06-15');
    // A window still to come starts where it starts.
    expect(key(Paging.homeRange(day(2026, 6, 20), 7, 4, NOW).start)).toBe('2026-06-20');
    // A window already past shows its last days.
    expect(key(Paging.homeRange(day(2026, 6, 1), 7, 4, NOW).start)).toBe('2026-06-04');
  });

  it('takes a start given at any time of day as that day', () => {
    expect(key(Paging.homeRange(new Date(2026, 5, 15, 13, 45), 7, 0, NOW).start)).toBe(
      '2026-06-15',
    );
  });
});

describe('the arrows and the date picker', () => {
  it('step by exactly the page, so pages join up', () => {
    const start = day(2026, 6, 15);
    expect(key(Paging.stepPage(start, 7, 1))).toBe('2026-06-22');
    expect(key(Paging.stepPage(start, 7, -1))).toBe('2026-06-08');
    expect(key(Paging.stepPage(start, 3, 1))).toBe('2026-06-18');
  });

  it('cross a month and a year by calendar days', () => {
    expect(key(Paging.stepPage(day(2026, 12, 28), 7, 1))).toBe('2027-01-04');
    expect(key(Paging.stepPage(day(2026, 3, 1), 1, -1))).toBe('2026-02-28');
  });

  it('open the page holding a picked day, lined up with home', () => {
    const home = { start: day(2026, 6, 15), days: 7 };
    expect(key(Paging.pageContaining(day(2026, 7, 2), home, 7))).toBe('2026-06-29');
    expect(key(Paging.pageContaining(day(2026, 6, 28), home, 7))).toBe('2026-06-22');
    // Before home as well: the page runs Monday to Sunday like home's.
    expect(key(Paging.pageContaining(day(2026, 6, 1), home, 7))).toBe('2026-06-01');
    expect(key(Paging.pageContaining(day(2026, 6, 7), home, 7))).toBe('2026-06-01');
    // A picked day inside home is home.
    expect(key(Paging.pageContaining(day(2026, 6, 21), home, 7))).toBe('2026-06-15');
  });

  it('know which days a page covers', () => {
    const page = { start: day(2026, 6, 15), days: 7 };
    expect(Paging.rangeContains(page, day(2026, 6, 15))).toBe(true);
    expect(Paging.rangeContains(page, new Date(2026, 5, 21, 23, 59))).toBe(true);
    expect(Paging.rangeContains(page, day(2026, 6, 22))).toBe(false);
    expect(Paging.rangeContains(page, day(2026, 6, 14))).toBe(false);
  });
});

describe("the range's name", () => {
  const label = (start: Date, days: number, language = 'en') =>
    Paging.rangeLabel({ start, days }, language, NOW);

  it('names a page of this year without the year', () => {
    expect(label(day(2026, 6, 15), 7)).toBe(`Jun 15${TO}21`);
    expect(label(day(2026, 6, 29), 7)).toBe(`Jun 29${TO}Jul 5`);
  });

  it('names a single day with its weekday', () => {
    expect(label(day(2026, 6, 17), 1)).toBe('Wed, Jun 17');
  });

  it('adds the year only to a page with no day in this one', () => {
    expect(label(day(2027, 3, 1), 7)).toBe(`Mar 1${TO}7, 2027`);
    expect(label(day(2025, 3, 1), 1)).toBe('Sat, Mar 1, 2025');
    // The turn of this year reads as such, and the year would make it the widest label of all.
    expect(label(day(2026, 12, 28), 7)).toBe(`Dec 28${TO}Jan 3`);
    expect(label(day(2025, 12, 29), 7)).toBe(`Dec 29${TO}Jan 4`);
  });

  it('names both years of a turn of the year that is neither this one nor last', () => {
    expect(label(day(2027, 12, 28), 7)).toBe(`Dec 28, 2027${TO}Jan 3, 2028`);
  });

  it("joins the turn of the year with each language's own separator", () => {
    // Korean and Hungarian end a date with a suffix `Intl` writes once for a whole range; it
    // stays with each date and leaves the separator alone.
    expect(label(day(2026, 12, 28), 7, 'ko')).toBe('12월 28일~1월 3일');
    expect(label(day(2026, 12, 28), 7, 'hu')).toBe(`dec. 28.${TO}jan. 3.`);
    expect(label(day(2026, 12, 28), 7, 'he')).toBe('28 בדצמ׳–3 בינו׳');
    expect(label(day(2026, 12, 28), 7, 'de')).toBe(`28. Dez.${TO}3. Jan.`);
  });

  it("follows each language's own order and punctuation", () => {
    expect(label(day(2026, 6, 29), 7, 'de')).toBe(`29. Juni${TO}5. Juli`);
    expect(label(day(2026, 6, 29), 7, 'en-GB')).toBe(`29 Jun${TO}5 Jul`);
    expect(label(day(2026, 6, 29), 7, 'he')).toBe('29 ביוני–5 ביולי');
  });

  it('falls back to English for a language Intl does not know', () => {
    expect(label(day(2026, 6, 15), 7, 'not-a-language-code-at-all')).toBe(`Jun 15${TO}21`);
  });
});

describe("the range's reserved width", () => {
  it('is the widest label a page of this length can have: two months and a year', () => {
    expect(Paging.widestRangeLabel(7, 'en')).toBe(`Jan 31${TO}Feb 6, 2000`);
    expect(Paging.widestRangeLabel(7, 'de')).toBe(`31. Aug.${TO}6. Sept. 2000`);
    expect(Paging.widestRangeLabel(1, 'en')).toBe('Mon, Jan 31, 2000');
  });

  it('is at least as long as any page within a year of today is named', () => {
    // Every page a year of paging reaches either way, named as the card names it. Further out,
    // a turn of the year can name two years and be wider, which `widestRangeLabel` states.
    for (const days of [1, 3, 7, 14]) {
      const widest = Paging.widestRangeLabel(days, 'en').length;
      for (let offset = -365; offset <= 365; offset += 1) {
        const start = Paging.addDays(NOW, offset);
        const name = Paging.rangeLabel({ start, days }, 'en', NOW);
        expect(name.length, `${days} days from ${key(start)}`).toBeLessThanOrEqual(widest);
      }
    }
  });
});

describe("the home button's name", () => {
  it('is "Today" in the card language while home holds today', () => {
    const home = { start: day(2026, 6, 15), days: 7 };
    expect(Paging.homeButtonName(home, 'en', NOW)).toBe('Today');
    expect(Paging.homeButtonName(home, 'de', NOW)).toBe('Heute');
    expect(Paging.homeButtonName(home, 'fr', NOW)).toBe('Aujourd’hui');
  });

  it('is the day home starts on when home does not hold today', () => {
    // `start_date: today+7`, or a fixed date: the button says where it goes.
    expect(Paging.homeButtonName({ start: day(2026, 6, 24), days: 7 }, 'en', NOW)).toBe(
      'Wed, Jun 24',
    );
    expect(Paging.homeButtonName({ start: day(2026, 12, 24), days: 3 }, 'de', NOW)).toBe(
      'Do., 24. Dez.',
    );
  });
});

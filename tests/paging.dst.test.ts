import { describe, expect, it } from 'vitest';

import * as Paging from '../src/utils/paging';

/**
 * Paging across daylight-saving changes.
 *
 * Run under Berlin, Sydney and New York (`vitest.config.mjs`), never UTC, where every day is
 * 24 hours long and arithmetic that adds milliseconds is indistinguishable from arithmetic
 * that adds calendar days. A page that crosses a change is 167 or 169 hours long; adding
 * `7 * 86_400_000` to its start lands an hour before or after midnight, which is the previous
 * day in one hemisphere and a midnight drifting off the grid in the other. Every expected
 * value is a calendar date, so the same answers hold in all three zones; one that moves with
 * the zone is the failure.
 *
 * Planted as a falsifier: `addDays` rewritten as `new Date(date.getTime() + days * 86_400_000)`
 * fails the stepping cases here in all three zones and passes them all under UTC.
 *
 * No zone is uniquely required: each covers both changes of its own year. They run in all
 * three because that is where the suite's `.dst.test.ts` files run.
 */

const key = Paging.pageKey;

describe('paging is independent of daylight saving', () => {
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2026, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2026, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });

  // The weeks holding each zone's changes in 2026: Europe on Mar 29 and Oct 25, New York on
  // Mar 8 and Nov 1, Sydney on Apr 5 and Oct 4. Every start is a Monday.
  const mondays = [
    '2026-03-02',
    '2026-03-23',
    '2026-03-30',
    '2026-09-28',
    '2026-10-19',
    '2026-10-26',
  ];

  it.each(mondays)('steps a week forward and back from %s to the neighboring Mondays', (start) => {
    const monday = Paging.pageStart(start);
    const next = Paging.stepPage(monday, 7, 1);
    const previous = Paging.stepPage(monday, 7, -1);

    expect(next.getDay()).toBe(1);
    expect(previous.getDay()).toBe(1);
    expect(next.getHours()).toBe(0);
    expect(previous.getHours()).toBe(0);
    expect(key(Paging.stepPage(next, 7, -1))).toBe(start);
  });

  it('pages a whole year by weeks and lands on the same weekday, at midnight, every time', () => {
    let page = Paging.pageStart('2026-01-05');
    for (let week = 0; week < 52; week += 1) {
      page = Paging.stepPage(page, 7, 1);
      expect(page.getDay(), key(page)).toBe(1);
      expect(page.getHours(), key(page)).toBe(0);
    }
    expect(key(page)).toBe('2027-01-04');
  });

  it('steps single days across each change without skipping or repeating one', () => {
    const seen: string[] = [];
    let page = Paging.pageStart('2026-03-01');
    for (let step = 0; step < 250; step += 1) {
      seen.push(key(page));
      page = Paging.stepPage(page, 1, 1);
    }
    expect(new Set(seen).size).toBe(250);
    expect(seen[0]).toBe('2026-03-01');
    expect(seen[249]).toBe('2026-11-05');
  });

  it('opens the page holding a day across a change, lined up with home', () => {
    const home = { start: Paging.pageStart('2026-03-02'), days: 7 };
    expect(key(Paging.pageContaining(Paging.pageStart('2026-04-08'), home, 7))).toBe('2026-04-06');
    expect(key(Paging.pageContaining(Paging.pageStart('2026-11-04'), home, 7))).toBe('2026-11-02');
    expect(key(Paging.pageContaining(Paging.pageStart('2026-02-25'), home, 7))).toBe('2026-02-23');
  });

  it('keeps home on today, and a page around a change on its own days', () => {
    // A window across Europe's spring change, drawn four days wide, on its fifth day.
    const now = new Date(2026, 2, 31, 9);
    const home = Paging.homeRange(Paging.pageStart('2026-03-27'), 7, 4, now);
    expect(key(home.start)).toBe('2026-03-30');
    expect(Paging.rangeContains(home, now)).toBe(true);
    expect(Paging.rangeContains(home, new Date(2026, 3, 2, 23, 30))).toBe(true);
    expect(Paging.rangeContains(home, new Date(2026, 3, 3, 0, 30))).toBe(false);
  });

  it('names a page across a change by the days it covers', () => {
    const now = new Date(2026, 5, 17);
    expect(Paging.rangeLabel({ start: Paging.pageStart('2026-03-26'), days: 7 }, 'en', now)).toBe(
      'Mar 26\u2009–\u2009Apr 1',
    );
    expect(Paging.rangeLabel({ start: Paging.pageStart('2026-10-22'), days: 14 }, 'en', now)).toBe(
      'Oct 22\u2009–\u2009Nov 4',
    );
  });
});

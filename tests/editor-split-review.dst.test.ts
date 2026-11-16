import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  PLANTED,
  cardFirstDays,
  disagreements,
  mirrorFirstDays,
  reviewCases,
  reviewEvents,
  reviewNow,
} from './helpers/split-review-cases';

/**
 * Split's review list against the card, in the four zones that change their clocks (section 5.7).
 *
 * The same case table `editor-split-review.test.ts` runs under UTC: the card's `processEvents`
 * and `groupEventsByDay` beside the editor's mirror, naming the same events on the same first
 * day. Under UTC a local day and a UTC day are one and the same, so a mirror reading the wrong
 * one agrees there and nowhere else; and no day there is shorter or longer than 24 hours. Every
 * zone here sees the first; the Azores, whose clocks change at midnight, the second.
 */

describe("Split's review names what the card shows, in a zone that changes its clocks", () => {
  const cases = reviewCases();
  const events = reviewEvents();
  let card: ReturnType<typeof cardFirstDays>[] = [];

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(reviewNow());
    card = cases.map((each) => cardFirstDays(each, events));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  it('names the same events on the same first day as the card, in every case', () => {
    const found = cases.flatMap((each, at) =>
      disagreements(card[at], mirrorFirstDays(each, events)).map((line) => `${each.name}: ${line}`),
    );
    const named = card.reduce((sum, days) => sum + days.size, 0);

    expect({ cases: cases.length, named: named > cases.length * 5 }).toEqual({
      cases: 2020,
      named: true,
    });
    expect(found).toEqual([]);
  });

  it.each(Object.keys(PLANTED))('disagrees with the card where the mirror has %s', (name) => {
    const found = cases.filter(
      (each, at) =>
        disagreements(card[at], mirrorFirstDays(each, events, PLANTED[name])).length > 0,
    );

    expect(found.length).toBeGreaterThan(0);
  });
});

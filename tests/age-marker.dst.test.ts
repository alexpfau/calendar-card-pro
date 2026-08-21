/**
 * The age of a birthday that falls on January 1.
 *
 * The count is `eventYear - markerYear`, so the year the card reads off an occurrence is
 * the whole of the arithmetic. A one-*day* error in that reading is invisible for 364 days
 * of the year and is a one-**year** error on the 365th, which is exactly the day this file
 * is about: a birthday on January 1 renders `(39)` instead of `(40)` for everyone in the
 * Americas if the date is parsed as UTC midnight rather than local midnight.
 *
 * This file is excluded from the `unit` project and run three times instead — under
 * `Europe/Berlin`, `Australia/Sydney` and `America/New_York` (see `vitest.config.mjs`).
 * Only the third can see the defect. Berlin and Sydney are both *ahead* of UTC, so UTC
 * midnight on January 1 is still January 1 locally in both and the wrong parse lands on
 * the right year anyway; New York is behind it, where the same instant is December 31 of
 * the previous year. AGENTS.md records the same asymmetry for `all-day-parse.dst.test.ts`,
 * and this is the case where its cost is a whole year rather than a row on the wrong day.
 *
 * Falsified rather than assumed: replacing `FormatUtils.parseAllDayDate` with
 * `new Date(...)` at the all-day branch of `groupEventsByDay` fails the all-day cases here
 * under `America/New_York` and leaves both other zones green.
 *
 * The timed case is the opposite assertion. A timed event near midnight genuinely does
 * fall in different years in different zones, and that is correct — the count has to agree
 * with the date drawn next to it. So it is pinned against the day the card actually
 * grouped the event under rather than against a fixed number, which is the only form of
 * the assertion that can hold in all three zones and still say something.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/**
 * New Year's Eve, midday UTC.
 *
 * Late enough that it is already December 31 in New York and not yet January 1 in Sydney,
 * so "today" is the same calendar day in all three zones and the January 1 event is one
 * day ahead in each. Both fixtures start after it, so neither is filtered out as past.
 */
const FROZEN_NOW = new Date('2025-12-31T12:00:00.000Z');

/** A yearly recurring birthday on January 1 — the shape a calendar produces for one. */
const ALL_DAY_BIRTHDAY: Types.CalendarEventData = {
  start: { date: '2026-01-01' },
  end: { date: '2026-01-02' },
  summary: 'Annas Geburtstag',
  description: 'YEAR=1976',
  _entityId: 'calendar.personal',
};

/**
 * The same birthday stored as a timed event just after midnight UTC.
 *
 * 04:00–04:30 UTC is 05:00 on January 1 in Berlin, 15:00 on January 1 in Sydney, and
 * 23:00 on December 31 in New York — so the three zones disagree about which year this
 * occurrence falls in, which is the point. Both ends sit inside the same local day in
 * every zone, so nothing here is incidentally multi-day.
 */
const TIMED_BIRTHDAY: Types.CalendarEventData = {
  start: { dateTime: '2026-01-01T04:00:00.000Z' },
  end: { dateTime: '2026-01-01T04:30:00.000Z' },
  summary: 'Annas Geburtstag',
  description: 'YEAR=1976',
  _entityId: 'calendar.personal',
};

/** The day bucket carrying an event, and the event as the card will draw it. */
function grouped(event: Types.CalendarEventData): { year: number; summary: string } {
  const config = buildConfig({ days_to_show: 3 });
  const days = EventUtils.groupEventsByDay([event], config, true, 'en');

  const carriesBirthday = (candidate: Types.CalendarEventData): boolean =>
    (candidate.summary ?? '').startsWith('Annas Geburtstag');

  const day = days.find((candidate) => candidate.events.some(carriesBirthday));

  expect(day).toBeDefined();
  const entry = day!.events.find(carriesBirthday);
  expect(entry).toBeDefined();

  return { year: new Date(day!.timestamp).getFullYear(), summary: entry!.summary ?? '' };
}

describe('a January 1 birthday across time zones', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Sanity: everything below is vacuous under UTC, which has no DST transitions and no
  // offset to be on the wrong side of. If this file is ever run in the `unit` project by
  // accident, this fails rather than silently proving nothing.
  it('runs under a zone that observes DST', () => {
    const janOffset = new Date(2025, 0, 1).getTimezoneOffset();
    const julOffset = new Date(2025, 6, 1).getTimezoneOffset();
    expect(janOffset).not.toBe(julOffset);
  });

  // 🚨 The assertion the file exists for. An all-day date is a date, not an instant, so it
  // means January 1 wherever it is read — and the count must therefore be the same number
  // in every zone. A zone-dependent answer here *is* the failure.
  it('shows the same age everywhere', () => {
    expect(grouped(ALL_DAY_BIRTHDAY).summary).toBe('Annas Geburtstag (40)');
  });

  it('lands on January 1 of the year it names', () => {
    expect(grouped(ALL_DAY_BIRTHDAY).year).toBe(2026);
  });

  // The timed half. The year genuinely differs by zone here, so the invariant is
  // agreement rather than a constant: whatever date the card put beside the event, the
  // count is measured from that same year.
  it('counts from the year of the day it is drawn under', () => {
    const { year, summary } = grouped(TIMED_BIRTHDAY);

    expect(summary).toBe(`Annas Geburtstag (${year - 1976})`);
  });

  // And the two really do disagree, which is what stops the assertion above from being
  // satisfiable by an implementation that ignores the zone altogether.
  it('is the same occurrence in a different year than the all-day form', () => {
    const allDayYear = grouped(ALL_DAY_BIRTHDAY).year;
    const timedYear = grouped(TIMED_BIRTHDAY).year;

    // Behind UTC, the timed event has not reached January yet; ahead of it, it has.
    const expected = new Date('2026-01-01T04:00:00.000Z').getFullYear();
    expect(timedYear).toBe(expected);
    expect(allDayYear).toBe(2026);
  });
});

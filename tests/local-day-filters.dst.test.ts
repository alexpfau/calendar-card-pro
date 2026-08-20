/**
 * Both per-calendar filters must read the **local** calendar, not UTC.
 *
 * This file is excluded from the `unit` project and run three times instead — under
 * `Europe/Berlin`, `Australia/Sydney` and `America/New_York` (see `projects` in
 * `vitest.config.mjs`). That is not redundancy. The rest of the suite pins `TZ=UTC`, which
 * is the right default and is also exactly why it cannot see this: under UTC the local
 * calendar and the UTC calendar are the same calendar, so an implementation reading either
 * one passes every assertion in `days-of-week-filter.test.ts` and `allday-expiry.test.ts`.
 *
 * Two one-word edits are the whole risk, and each is the kind that reads as a tidy-up:
 *
 * - `getDay()` → `getUTCDay()` in `isWeekendDate`, which moves a Friday-evening event into
 *   Saturday for everyone west of Greenwich and a Saturday-morning one into Friday for
 *   everyone east of it.
 * - `setHours()` → `setUTCHours()` in the expiry instant, which retires a 10:00 bin at
 *   06:00 in New York and at noon in Berlin.
 *
 * Neither changes a single character of rendered output under UTC.
 *
 * **Why three zones and not one.** The two weekday fixtures below straddle a local
 * midnight in opposite directions, and which of them disagrees with UTC depends on the
 * sign of the offset: east of Greenwich it is the Saturday-morning event, west of it the
 * Friday-evening one. Berlin and Sydney are both ahead of UTC and so exercise the same
 * half; New York is the only one of the three that exercises the other. A control below
 * asserts that at least one fixture genuinely disagrees with UTC, so the pair can never
 * pass vacuously in a zone that happens to align.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { groupEventsByDay } from '../src/utils/events';

/** Friday 22:30 local, one hour long, so it does not cross a local midnight and split. */
const LATE_FRIDAY = new Date(2026, 5, 19, 22, 30);

/** Saturday 00:30 local, likewise. */
const EARLY_SATURDAY = new Date(2026, 5, 20, 0, 30);

/**
 * Group one calendar's events and return the summaries that survived.
 *
 * @param events Events to group
 * @param entity The calendar's own settings
 * @param overrides Card configuration beyond the defaults
 * @returns The surviving real summaries, placeholders excluded
 */
function render(
  events: Types.CalendarEventData[],
  entity: Partial<Types.EntityConfig>,
  overrides: Partial<Types.Config> = {},
): string[] {
  const config = buildConfig({
    entities: [{ entity: 'calendar.local', ...entity }],
    days_to_show: 7,
    ...overrides,
  } as Partial<Types.Config>);

  const stamped = events.map((event) => ({
    ...event,
    _matchedConfig: { entity: 'calendar.local', ...entity } as Types.EntityConfig,
  }));

  return groupEventsByDay(stamped, config, true, 'en')
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay)
    .map((event) => event.summary ?? '');
}

/**
 * A one-hour timed event beginning at a local instant.
 *
 * Built from a local `Date` and serialized to an ISO instant, which is how a real feed
 * delivers one: the wire format is absolute and the weekday is a question about where the
 * user is standing.
 *
 * @param summary Event title
 * @param localStart Local instant it begins at
 * @returns The event
 */
function timedAt(summary: string, localStart: Date): Types.CalendarEventData {
  const end = new Date(localStart.getTime() + 60 * 60 * 1000);

  return {
    summary,
    start: { dateTime: localStart.toISOString() },
    end: { dateTime: end.toISOString() },
    _entityId: 'calendar.local',
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the zone these tests need', () => {
  /** Without this, a file silently run under UTC would prove nothing and still pass. */
  it('observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  /**
   * The denominator for the weekday cases. If neither fixture disagreed with UTC, both
   * readings would answer identically and the two assertions below would be decoration.
   */
  it('puts at least one weekday fixture on a different date in UTC', () => {
    const disagreeing = [LATE_FRIDAY, EARLY_SATURDAY].filter(
      (instant) => instant.getUTCDay() !== instant.getDay(),
    );

    expect(
      disagreeing.length,
      'no fixture discriminates local from UTC in this zone',
    ).toBeGreaterThan(0);
  });
});

describe('days_of_week reads the local weekday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Friday morning, local, so both fixtures are ahead of now and inside the window.
    vi.setSystemTime(new Date(2026, 5, 19, 8, 0));
  });

  const both = () => [
    timedAt('Friday evening', LATE_FRIDAY),
    timedAt('Saturday morning', EARLY_SATURDAY),
  ];

  it('keeps the Friday-evening event under weekdays and drops the Saturday-morning one', () => {
    expect(render(both(), { days_of_week: 'weekdays' })).toEqual(['Friday evening']);
  });

  it('does the exact opposite under weekends', () => {
    expect(render(both(), { days_of_week: 'weekends' })).toEqual(['Saturday morning']);
  });

  it('control: unfiltered, this zone shows both', () => {
    expect(render(both(), {}).sort()).toEqual(['Friday evening', 'Saturday morning']);
  });
});

describe('allday_expires_at fires at the local clock time', () => {
  /** An all-day event on Wednesday 17 June, expiring at 10:00. */
  const bin = (): Types.CalendarEventData[] => [
    {
      summary: 'Green bin',
      start: { date: '2026-06-17' },
      end: { date: '2026-06-18' },
      _entityId: 'calendar.local',
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('is still showing one minute before 10:00 local', () => {
    vi.setSystemTime(new Date(2026, 5, 17, 9, 59));

    expect(render(bin(), { allday_expires_at: '10:00' })).toEqual(['Green bin']);
  });

  it('is gone one minute after 10:00 local', () => {
    vi.setSystemTime(new Date(2026, 5, 17, 10, 1));

    expect(render(bin(), { allday_expires_at: '10:00' })).toEqual([]);
  });

  /**
   * The denominator. Without the option the same event survives both instants, so the pair
   * above is the expiry working rather than the window excluding a fixture this zone
   * happens to place elsewhere.
   */
  it('control: unset, it survives both instants', () => {
    vi.setSystemTime(new Date(2026, 5, 17, 9, 59));
    expect(render(bin(), {})).toEqual(['Green bin']);

    vi.setSystemTime(new Date(2026, 5, 17, 10, 1));
    expect(render(bin(), {})).toEqual(['Green bin']);
  });

  /**
   * A UTC reading would put the expiry hours away from 10:00 local in every zone this file
   * runs under, so this states the gap rather than leaving it to the two cases above to
   * imply. Berlin and Sydney are ahead of UTC and would expire late; New York is behind and
   * would expire early.
   */
  it('control: 10:00 local is not 10:00 UTC in this zone', () => {
    const localTen = new Date(2026, 5, 17, 10, 0);

    expect(
      localTen.getUTCHours(),
      'this zone is on UTC, so the pair above proves nothing',
    ).not.toBe(10);
  });
});

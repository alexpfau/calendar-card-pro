/**
 * Both per-calendar filters must read the **local** calendar, not UTC.
 *
 * This file is excluded from the `unit` project and run four times instead — under
 * `Europe/Berlin`, `Australia/Sydney`, `America/New_York` and `Atlantic/Azores` (see `projects` in
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
 * **Why several zones and not one.** The two weekday fixtures below straddle a local
 * midnight in opposite directions, and which of them disagrees with UTC depends on the
 * sign of the offset: east of Greenwich it is the Saturday-morning event, west of it the
 * Friday-evening one. Berlin and Sydney are both ahead of UTC and so exercise the same
 * half; New York and the Azores exercise the other. A control below asserts that at least
 * one fixture genuinely disagrees with UTC, so the pair can never pass vacuously in a zone
 * that happens to align.
 *
 * The fixtures run in January and in June, so each zone is read at both of its offsets, and
 * the Friday one starts at 23:20 for the Azores: in winter they are only an hour behind UTC,
 * so an event has to start in the last hour of a local day for its UTC date to differ. They
 * keep UTC itself all summer, where nothing can tell the two readings apart, so they run
 * January alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { groupEventsByDay } from '../src/utils/events';

/**
 * A Friday, the Saturday after it and a Wednesday, in each half of the year. A season in which
 * the zone keeps UTC itself is skipped (`offUtc`).
 */
const SEASONS = [
  { name: 'January', month: 0, friday: 16, wednesday: 14 },
  { name: 'June', month: 5, friday: 19, wednesday: 17 },
].map((season) => ({
  ...season,
  offUtc: new Date(2026, season.month, season.friday, 12).getTimezoneOffset() !== 0,
}));

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
 * @param minutes How long it runs
 * @returns The event
 */
function timedAt(summary: string, localStart: Date, minutes = 60): Types.CalendarEventData {
  const end = new Date(localStart.getTime() + minutes * 60 * 1000);

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

  // The denominator for the seasons: at least one runs in every zone.
  it('is off UTC in at least one season', () => {
    expect(SEASONS.filter((season) => season.offUtc).length).toBeGreaterThan(0);
  });
});

describe.each(SEASONS)('in $name', ({ month, friday, wednesday, offUtc }) => {
  /** Friday 23:20 local, half an hour long, so it does not cross a local midnight and split. */
  const LATE_FRIDAY = new Date(2026, month, friday, 23, 20);

  /** Saturday 00:30 local, one hour long. */
  const EARLY_SATURDAY = new Date(2026, month, friday + 1, 0, 30);

  const day = (d: number) =>
    `2026-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  /**
   * The denominator for the weekday cases. If neither fixture disagreed with UTC, both
   * readings would answer identically and the two assertions below would be decoration.
   */
  it.runIf(offUtc)('puts at least one weekday fixture on a different date in UTC', () => {
    const disagreeing = [LATE_FRIDAY, EARLY_SATURDAY].filter(
      (instant) => instant.getUTCDay() !== instant.getDay(),
    );

    expect(
      disagreeing.length,
      'no fixture discriminates local from UTC in this zone',
    ).toBeGreaterThan(0);
  });

  describe.runIf(offUtc)('days_of_week reads the local weekday', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Friday morning, local, so both fixtures are ahead of now and inside the window.
      vi.setSystemTime(new Date(2026, month, friday, 8, 0));
    });

    const both = () => [
      timedAt('Friday evening', LATE_FRIDAY, 30),
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

  describe.runIf(offUtc)('allday_expires_at fires at the local clock time', () => {
    /** An all-day event on a Wednesday, expiring at 10:00. */
    const bin = (): Types.CalendarEventData[] => [
      {
        summary: 'Green bin',
        start: { date: day(wednesday) },
        end: { date: day(wednesday + 1) },
        _entityId: 'calendar.local',
      },
    ];

    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('is still showing one minute before 10:00 local', () => {
      vi.setSystemTime(new Date(2026, month, wednesday, 9, 59));

      expect(render(bin(), { allday_expires_at: '10:00' })).toEqual(['Green bin']);
    });

    it('is gone one minute after 10:00 local', () => {
      vi.setSystemTime(new Date(2026, month, wednesday, 10, 1));

      expect(render(bin(), { allday_expires_at: '10:00' })).toEqual([]);
    });

    /**
     * The denominator. Without the option the same event survives both instants, so the pair
     * above is the expiry working rather than the window excluding a fixture this zone
     * happens to place elsewhere.
     */
    it('control: unset, it survives both instants', () => {
      vi.setSystemTime(new Date(2026, month, wednesday, 9, 59));
      expect(render(bin(), {})).toEqual(['Green bin']);

      vi.setSystemTime(new Date(2026, month, wednesday, 10, 1));
      expect(render(bin(), {})).toEqual(['Green bin']);
    });

    /**
     * A UTC reading would put the expiry hours away from 10:00 local in every zone this file
     * runs under, so this states the gap rather than leaving it to the two cases above to
     * imply. Berlin and Sydney are ahead of UTC and would expire late; New York and the
     * Azores are behind and would expire early.
     */
    it('control: 10:00 local is not 10:00 UTC in this zone', () => {
      const localTen = new Date(2026, month, wednesday, 10, 0);

      expect(
        localTen.getUTCHours(),
        'this zone is on UTC, so the pair above proves nothing',
      ).not.toBe(10);
    });
  });
});

import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';

/**
 * Fixtures and helpers for the list-view DOM equality gate (`tests/list-dom.test.ts`).
 *
 * Kept separate from the test so that Phase 1's shared leaf renderers, and later the
 * column view, can reuse exactly the same event data. The whole point of the gate is
 * that both views are fed identical input; that only holds if the input has one home.
 */

/**
 * The instant every list-DOM test runs at.
 *
 * The list render is time-dependent — it decides today, weekend and past-event state
 * from the clock — so the same fixture serialized on two different days produces two
 * different DOMs. `vi.setSystemTime(FROZEN_NOW)` holds it still.
 *
 * Chosen deliberately:
 * - **Wednesday**, so "today" is mid-week and neither weekend nor week boundary
 *   styling is silently exercised as the default case.
 * - **Mid-month (17th)**, so it is not a month boundary either. Both boundaries have
 *   their own separators; a frozen instant sitting on one would make that separator
 *   permanently on and its absence permanently untested.
 * - **10:00 UTC**, leaving room either side within the same day for events that are
 *   already past and events still upcoming, without either crossing midnight.
 *
 * Paired with `TZ=UTC` from `vitest.config.mjs`: an instant alone does not determine
 * which local day it falls in, so both are required for a stable result.
 */
export const FROZEN_NOW = new Date('2026-06-17T10:00:00.000Z');

/**
 * Builds a config the same way `setConfig` does, so fixtures exercise the real
 * normalization path rather than a hand-assembled object that happens to look right.
 *
 * Mirrors `calendar-card-pro.ts` `setConfig`: merge over defaults, then normalize
 * entities and numeric options in that order.
 */
export function buildConfig(overrides: Partial<Types.Config> = {}): Types.Config {
  const config: Types.Config = {
    ...Config.DEFAULT_CONFIG,
    entities: ['calendar.personal'],
    ...overrides,
  };
  config.entities = Config.normalizeEntities(config.entities);
  Config.normalizeNumericOptions(config);
  return config;
}

/** A timed event on a given date, expressed in UTC to match the pinned zone. */
function timed(
  date: string,
  startHour: string,
  endHour: string,
  summary: string,
  extra: Partial<Types.CalendarEventData> = {},
): Types.CalendarEventData {
  return {
    start: { dateTime: `${date}T${startHour}:00.000Z` },
    end: { dateTime: `${date}T${endHour}:00.000Z` },
    summary,
    _entityId: 'calendar.personal',
    ...extra,
  };
}

/** An all-day event. All-day events use `date`, not `dateTime` — that is the branch. */
function allDay(
  startDate: string,
  endDate: string,
  summary: string,
  extra: Partial<Types.CalendarEventData> = {},
): Types.CalendarEventData {
  return {
    start: { date: startDate },
    end: { date: endDate },
    summary,
    _entityId: 'calendar.personal',
    ...extra,
  };
}

/**
 * The gate's event set.
 *
 * Enumerated rather than described, because "the soak fixtures" named no file and a
 * gate that does not say what it covers will pass while missing the branches most
 * likely to regress. Each entry below exists to hold one render branch open:
 *
 * | Fixture              | Branch it pins                                    |
 * | -------------------- | ------------------------------------------------- |
 * | `pastEarlier`        | past-event styling (before FROZEN_NOW, same day)  |
 * | `currentlyRunning`   | an event straddling "now"                          |
 * | `upcomingLater`      | ordinary future event on today                     |
 * | `withLocation`       | the location row, which is separately toggleable   |
 * | `allDaySingle`       | all-day rendering (no time shown)                  |
 * | `multiDay`           | an event spanning day boundaries — the rowspan path |
 * | `tomorrowOnly`       | a day whose events are all future                  |
 */
export const EVENTS: Types.CalendarEventData[] = [
  timed('2026-06-17', '08:00', '09:00', 'Past standup'),
  timed('2026-06-17', '09:30', '11:00', 'Currently running review'),
  timed('2026-06-17', '14:00', '15:00', 'Upcoming one-to-one'),
  timed('2026-06-17', '16:00', '17:00', 'Dentist', { location: '12 High Street' }),
  allDay('2026-06-17', '2026-06-18', 'Public holiday'),
  allDay('2026-06-18', '2026-06-20', 'Conference'),
  timed('2026-06-19', '10:00', '10:30', 'Delivery window'),
];

/**
 * A single timed event, for tests that need a minimal render rather than the full set.
 */
export const SINGLE_EVENT: Types.CalendarEventData[] = [
  timed('2026-06-17', '14:00', '15:00', 'Upcoming one-to-one'),
];

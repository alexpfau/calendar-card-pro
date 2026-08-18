import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

/**
 * Countdown behaviour for multi-day events (issue #344 and its follow-up).
 *
 * Two regressions have shipped here, both invisible to the rest of the suite:
 * the original "one day short after midday" for all-day events, and then a
 * split multi-day event whose rows disagreed with each other because splitting
 * gives the middle days an all-day shape while the first and last keep a
 * `dateTime`. Both are time-dependent and neither changes the DOM structure, so
 * the list-DOM snapshot cannot see them — they need explicit assertions.
 *
 * Every case asserts across several times of day. A single instant would have
 * passed happily on the broken code: the sequence was correct before noon and
 * wrong after it.
 */
const TIMED_MULTI_DAY = {
  summary: 'Sommerferie',
  start: { dateTime: '2026-08-17T07:00:00.000Z' },
  end: { dateTime: '2026-08-20T12:00:00.000Z' },
};

const ALL_DAY_MULTI_DAY = {
  summary: 'Sommerferie',
  start: { date: '2026-08-17' },
  end: { date: '2026-08-21' },
};

const SINGLE_DAY_TIMED = {
  summary: 'Standup',
  start: { dateTime: '2026-08-17T07:00:00.000Z' },
  end: { dateTime: '2026-08-17T08:00:00.000Z' },
};

/** Times of day spanning the midday rounding boundary that broke both fixes. */
const HOURS = ['00:30', '08:30', '11:30', '12:30', '13:30', '19:53', '23:30'];

let instance = 0;

function fakeHass(events: unknown[]) {
  return {
    states: {},
    callApi: async () => events,
    callService: async () => undefined,
    locale: { language: 'en' },
  } as never;
}

/** Runs the real fetch → process → split → group pipeline and returns one countdown per row. */
async function countdowns(events: unknown[], nowIso: string, split = true) {
  vi.setSystemTime(new Date(nowIso));
  const config = buildConfig({
    entities: ['calendar.test'],
    split_multiday_events: split,
    days_to_show: 12,
  });
  const { events: processed } = await EventUtils.fetchEventData(
    fakeHass(events),
    config,
    `countdown-${instance++}`,
    true,
  );
  return EventUtils.groupEventsByDay(processed, config, false, 'en')
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay)
    .map((event) => FormatUtils.getCountdownString(event, 'en'));
}

describe('countdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('split multi-day events', () => {
    it('counts consecutive calendar days on every row of a timed event', async () => {
      for (const hour of HOURS) {
        expect(await countdowns([TIMED_MULTI_DAY], `2026-08-13T${hour}:00.000Z`), hour).toEqual([
          'in 4 days',
          'in 5 days',
          'in 6 days',
          'in 7 days',
        ]);
      }
    });

    it('counts consecutive calendar days on every row of an all-day event', async () => {
      for (const hour of HOURS) {
        expect(await countdowns([ALL_DAY_MULTI_DAY], `2026-08-13T${hour}:00.000Z`), hour).toEqual([
          'in 4 days',
          'in 5 days',
          'in 6 days',
          'in 7 days',
        ]);
      }
    });

    it('drops the countdown from rows already under way and keeps counting the rest', async () => {
      for (const hour of HOURS) {
        expect(await countdowns([TIMED_MULTI_DAY], `2026-08-18T${hour}:00.000Z`), hour).toEqual([
          null,
          'in a day',
          'in 2 days',
        ]);
      }
    });

    it('keeps wall-clock precision on a row starting later today', async () => {
      expect(await countdowns([TIMED_MULTI_DAY], '2026-08-17T05:00:00.000Z')).toEqual([
        'in 2 hours',
        'in a day',
        'in 2 days',
        'in 3 days',
      ]);
    });
  });

  describe('unsplit events', () => {
    it('measures a single-day timed event from the current instant', async () => {
      expect(await countdowns([SINGLE_DAY_TIMED], '2026-08-13T19:53:00.000Z')).toEqual([
        'in 3 days',
      ]);
    });

    it('measures an unsplit multi-day event from its real start time', async () => {
      expect(await countdowns([TIMED_MULTI_DAY], '2026-08-13T19:53:00.000Z', false)).toEqual([
        'in 3 days',
      ]);
    });
  });
});

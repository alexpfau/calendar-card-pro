import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as EventUtils from '../src/utils/events';

/**
 * An event ending at exactly local midnight must not appear on the following day.
 *
 * The UTC case lives in `multiday-split-scope.test.ts`; this file exists because
 * UTC cannot falsify the interesting half of the fix. The splitter anchors the end
 * of the start day with `setHours(23, 59, 59, 999)` and then derives the next day's
 * first instant from it. Under UTC every day is exactly 24 hours long, so an
 * implementation that added a hardcoded 24 hours — or that re-entered `setHours` on
 * the following day — would pass every UTC assertion and still be wrong twice a year.
 *
 * The nights below are chosen so that each zone gets one real transition:
 *
 * - `2026-10-25` is 25 hours long in `Europe/Berlin` (DST ends, 03:00 → 02:00).
 * - `2026-10-04` is 23 hours long in `Australia/Sydney` (DST starts, 02:00 → 03:00).
 *
 * Each is an ordinary 24-hour day in the other zone, which is the control: the same
 * assertion has to hold whether or not the start day is a normal length. Both nights
 * keep a real midnight in both zones — the transitions are at 02:00/03:00 — so the
 * boundary under test always exists.
 */

/** The one `hass` surface `fetchEvents` touches. */
function fakeHass(events: Types.CalendarEventData[]): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async () => events,
  } as unknown as Types.Hass;
}

/** Count the days actually carrying the event, by summary. */
async function daysShowing(
  event: Types.CalendarEventData,
  config: Types.Config,
  instanceId: string,
): Promise<number> {
  const { events } = await EventUtils.fetchEventData(fakeHass([event]), config, instanceId);
  const grouped = EventUtils.groupEventsByDay(
    events,
    ViewConfig.resolveEffectiveConfig(config, 'column'),
    false,
    'en',
    'column',
  );
  return grouped.filter((day) => day.events.some((entry) => entry.summary === event.summary))
    .length;
}

describe('midnight boundary under real DST zones', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const nights = [
    { label: '2026-10-25 (25 hours in Berlin)', day: '2026-10-25', next: '2026-10-26' },
    { label: '2026-10-04 (23 hours in Sydney)', day: '2026-10-04', next: '2026-10-05' },
  ];

  describe.each(nights)('night of $label', ({ day, next }) => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Local morning of the day under test, so the evening event is still ahead.
      vi.setSystemTime(new Date(`${day}T08:00:00`));
    });

    it('keeps an event ending at exactly midnight on one day', async () => {
      const overnight: Types.CalendarEventData = {
        start: { dateTime: `${day}T23:00:00` },
        end: { dateTime: `${next}T00:00:00` },
        summary: 'Overnight',
        _entityId: 'calendar.personal',
      };

      await expect(
        daysShowing(overnight, buildConfig({ view: 'column' }), `mid-${day}`),
      ).resolves.toBe(1);
    });

    it('still splits an event running one minute past midnight', async () => {
      const overnight: Types.CalendarEventData = {
        start: { dateTime: `${day}T23:00:00` },
        end: { dateTime: `${next}T00:01:00` },
        summary: 'Overnight',
        _entityId: 'calendar.personal',
      };

      await expect(
        daysShowing(overnight, buildConfig({ view: 'column' }), `past-${day}`),
      ).resolves.toBe(2);
    });
  });
});

/**
 * A view drawing fewer days than the card loads, across daylight-saving changes.
 *
 * Since v5 the card loads the longest `days_to_show` among the views it can show, so a
 * seven-day view can be handed fourteen days of events. `groupEventsByDay` bounds every
 * occurrence by the view's own window end, a local midnight built with `setDate`. These
 * cases put that midnight on each side of every transition of 2026 in the zone the project
 * runs under, and check that the last minute of the view's final day is kept while its next
 * local midnight, and everything after, is not.
 *
 * No zone is uniquely required: every zone is checked against its own transitions, found by
 * scanning rather than named, so any zone with DST exercises the bound the same way.
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';

/** Local midnight of each day in 2026 whose next day starts at a different UTC offset. */
function transitionDays(): Date[] {
  const days: Date[] = [];
  for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026;) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    if (day.getTimezoneOffset() !== next.getTimezoneOffset()) days.push(day);
    day = next;
  }
  return days;
}

function timed(summary: string, start: Date, end: Date): Types.CalendarEventData {
  return {
    summary,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    _entityId: 'calendar.anna',
  };
}

function allDay(summary: string, first: Date, daysLong: number): Types.CalendarEventData {
  const end = new Date(first.getFullYear(), first.getMonth(), first.getDate() + daysLong);
  return {
    summary,
    start: { date: getLocalDateKey(first) },
    end: { date: getLocalDateKey(end) },
    _entityId: 'calendar.anna',
  };
}

/** Local midnight `offset` days after `start`. */
function day(start: Date, offset: number, hours = 0, minutes = 0): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, hours, minutes);
}

/**
 * Fourteen days of events around a seven-day view starting on `start`. Summaries starting
 * `in` must be drawn; those starting `out` lie past the view and must not be.
 */
function fixture(start: Date): Types.CalendarEventData[] {
  return [
    timed('in: last half hour of day seven', day(start, 6, 23, 30), day(start, 6, 23, 59)),
    timed('out: midnight after day seven', day(start, 7), day(start, 7, 1)),
    allDay('in: all day, day seven', day(start, 6), 1),
    allDay('out: all day, day eight', day(start, 7), 1),
    allDay('out: three days from day nine', day(start, 8), 3),
    timed('out: day thirteen', day(start, 12, 9), day(start, 12, 10)),
    timed('in: from the day before, into day one', day(start, -1, 22), day(start, 0, 2)),
  ];
}

/** Every event drawn, by summary, with the day it is drawn on. */
function drawn(days: Types.EventsByDay[]): Array<[string, string]> {
  return days.flatMap((group) =>
    group.events
      .filter((event) => !event._isEmptyDay)
      .map((event): [string, string] => [
        event.summary ?? '',
        getLocalDateKey(new Date(group.timestamp)),
      ]),
  );
}

describe('a view drawing fewer days than the card loads', () => {
  // Sanity: these cases only mean something if the runner is NOT on UTC.
  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
    expect(transitionDays()).toHaveLength(2);
  });

  // Every seven-day window holding a transition, starting each day from six before it to the
  // day itself, in list (split and unsplit, collapsed and expanded) and in grid.
  const cases = transitionDays().flatMap((transition) =>
    [0, 1, 2, 3, 4, 5, 6].map((before) => day(transition, -before)),
  );

  it.each([
    ['list, unsplit', 'list', { list: { days_to_show: 7, split_multiday_events: false } }],
    ['list, split', 'list', { list: { days_to_show: 7, split_multiday_events: true } }],
    ['grid', 'grid', { time_grid: { days_to_show: 7 } }],
  ] as const)('draws nothing past day seven: %s', (_label, view, block) => {
    const failures: string[] = [];

    for (const start of cases) {
      const config = buildConfig({
        entities: ['calendar.anna'],
        start_date: getLocalDateKey(start),
        days_to_show: 14,
        show_past_events: true,
        show_empty_days: false,
        ...block,
      } as Partial<Types.Config>);
      const lastDay = getLocalDateKey(day(start, 6));

      for (const expanded of [true, false]) {
        const result = drawn(
          EventUtils.groupEventsByDay(fixture(start), config, expanded, 'en', view),
        );
        const summaries = [...new Set(result.map(([summary]) => summary))].sort();
        const expected = fixture(start)
          .map((event) => event.summary ?? '')
          .filter((summary) => summary.startsWith('in:'))
          .sort();
        const late = result.filter(([, key]) => key > lastDay);

        if (JSON.stringify(summaries) !== JSON.stringify(expected) || late.length > 0) {
          failures.push(
            `${getLocalDateKey(start)} expanded=${expanded}: drew ${JSON.stringify(result)}`,
          );
        }
      }
    }

    expect(cases.length).toBe(14);
    expect(failures).toEqual([]);
  });

  it('removes nothing the fetch kept when the view draws every loaded day', async () => {
    // The control. Fetched through the real path with the view and the load both seven days,
    // the fetch-side trim and the grouping bound are the same boundary, so the grouping
    // draws every event the fetch returned.
    const failures: string[] = [];

    for (const start of cases) {
      const config = buildConfig({
        entities: ['calendar.anna'],
        start_date: getLocalDateKey(start),
        days_to_show: 7,
        show_past_events: true,
      });
      const raw = fixture(start).map(({ _entityId: _ignored, ...event }) => event);
      const hass = {
        states: {},
        locale: { language: 'en' },
        callApi: async () => raw,
      } as unknown as Types.Hass;

      const fetched = await EventUtils.fetchEventData(
        hass,
        config,
        `days-dst-${getLocalDateKey(start)}`,
        'network',
      );
      const fetchedSummaries = [...new Set(fetched.events.map((event) => event.summary))].sort();
      const grouped = [
        ...new Set(
          drawn(EventUtils.groupEventsByDay(fetched.events, config, true, 'en', 'list')).map(
            ([summary]) => summary,
          ),
        ),
      ].sort();

      if (
        fetchedSummaries.length === 0 ||
        JSON.stringify(grouped) !== JSON.stringify(fetchedSummaries)
      ) {
        failures.push(`${getLocalDateKey(start)}: fetched ${fetchedSummaries}, drew ${grouped}`);
      }
    }

    expect(cases.length).toBe(14);
    expect(failures).toEqual([]);
  });
});

/**
 * `event_order: latest_first`, for a calendar used as a log (#176).
 *
 * The contract: the latest-first list is the earliest-first list read from the bottom up,
 * ties included, and every list limit then keeps from the top, so the event limit keeps the
 * most recent events. The dates the card covers do not move, and column and grid view ignore
 * it. Each `it` below states one half of that, against `groupEventsByDay` directly, so the
 * expected rows are plain summaries rather than a snapshot.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/** A timed event on a June 2026 day, in UTC like the unit project. */
function timed(
  day: number,
  hour: number,
  summary: string,
  entity = 'calendar.log',
): Types.CalendarEventData {
  const date = `2026-06-${String(day).padStart(2, '0')}`;
  const at = (h: number) => `${date}T${String(h).padStart(2, '0')}:00:00.000Z`;
  return {
    start: { dateTime: at(hour) },
    end: { dateTime: at(hour + 1) },
    summary,
    _entityId: entity,
  };
}

/** An all-day event on a June 2026 day. */
function allDay(day: number, summary: string, entity = 'calendar.log'): Types.CalendarEventData {
  const date = (d: number) => `2026-06-${String(d).padStart(2, '0')}`;
  return { start: { date: date(day) }, end: { date: date(day + 1) }, summary, _entityId: entity };
}

/**
 * A week of log entries ending today, June 17, with today's all-day entry beside two timed
 * ones and two calendars on one day so the ties are exercised.
 */
const LOG: Types.CalendarEventData[] = [
  timed(11, 8, 'Jun 11 08'),
  timed(12, 9, 'Jun 12 09'),
  timed(12, 17, 'Jun 12 17'),
  allDay(14, 'Jun 14 all day A', 'calendar.log'),
  allDay(14, 'Jun 14 all day B', 'calendar.other'),
  timed(14, 7, 'Jun 14 07', 'calendar.other'),
  timed(15, 20, 'Jun 15 20'),
  allDay(17, 'Jun 17 all day'),
  timed(17, 6, 'Jun 17 06'),
  timed(17, 9, 'Jun 17 09'),
];

/** The card a log is shown on: the last seven days, past events kept. */
const LOG_CARD: Partial<Types.Config> = {
  entities: ['calendar.log', 'calendar.other'],
  start_date: 'today-6',
  days_to_show: 7,
  show_past_events: true,
};

/**
 * Each day the grouping returns, as its date and its rows' summaries, in order. The events
 * go through `processEvents` first, as they do in the card, which stamps the calendar entry
 * each one matched and so what a per-calendar cap counts against.
 */
function rows(
  overrides: Partial<Types.Config>,
  options: {
    expanded?: boolean;
    view?: Types.EffectiveView;
    events?: Types.CalendarEventData[];
  } = {},
): Array<[string, string[]]> {
  const config = buildConfig({ ...LOG_CARD, ...overrides });
  return EventUtils.groupEventsByDay(
    EventUtils.processEvents(options.events ?? LOG, config),
    config,
    options.expanded ?? false,
    'en',
    options.view ?? 'list',
  ).map((day) => [
    new Date(day.timestamp).toISOString().slice(5, 10),
    day.events.map((event) => (event._isEmptyDay ? '(empty)' : (event.summary ?? '?'))),
  ]);
}

/** Every row, top to bottom. */
function flat(days: Array<[string, string[]]>): string[] {
  return days.flatMap(([, summaries]) => summaries);
}

const LATEST: Partial<Types.Config> = { list: { event_order: 'latest_first' } };

describe('event_order: latest_first', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the earliest-first list read from the bottom up, ties included', () => {
    const earliest = rows({});
    expect(flat(earliest)).toEqual([
      'Jun 11 08',
      'Jun 12 09',
      'Jun 12 17',
      'Jun 14 all day A',
      'Jun 14 all day B',
      'Jun 14 07',
      'Jun 15 20',
      'Jun 17 all day',
      'Jun 17 06',
      'Jun 17 09',
    ]);

    const latest = rows(LATEST);
    expect(flat(latest)).toEqual([...flat(earliest)].reverse());
    expect(latest.map(([date]) => date)).toEqual(['06-17', '06-15', '06-14', '06-12', '06-11']);
  });

  it('is read at the top level too, and a list block outranks it', () => {
    expect(rows({ event_order: 'latest_first' })).toEqual(rows(LATEST));
    expect(rows({ event_order: 'latest_first', list: { event_order: 'earliest_first' } })).toEqual(
      rows({}),
    );
  });

  it('reads any other value as earliest first', () => {
    expect(rows({ event_order: 'newest' as Types.EventOrder })).toEqual(rows({}));
  });

  it('keeps the most recent events under the event limit, an all-day one only after the timed', () => {
    // The two reasons this is exact reversal rather than "all-day first, then latest": a
    // limit of 1 must keep today's 09:00 entry, not today's all-day one.
    expect(
      flat(rows({ list: { event_order: 'latest_first', compact_events_to_show: 1 } })),
    ).toEqual(['Jun 17 09']);
    expect(
      flat(rows({ list: { event_order: 'latest_first', compact_events_to_show: 5 } })),
    ).toEqual(['Jun 17 09', 'Jun 17 06', 'Jun 17 all day', 'Jun 15 20', 'Jun 14 07']);
  });

  it('finishes the oldest day it reaches when complete days are asked for', () => {
    expect(
      rows({
        list: {
          event_order: 'latest_first',
          compact_events_to_show: 4,
          compact_events_complete_days: true,
        },
      }),
    ).toEqual([
      ['06-17', ['Jun 17 09', 'Jun 17 06', 'Jun 17 all day']],
      ['06-15', ['Jun 15 20']],
    ]);
    expect(
      flat(
        rows({
          list: {
            event_order: 'latest_first',
            compact_events_to_show: 5,
            compact_events_complete_days: true,
          },
        }),
      ),
    ).toEqual([
      'Jun 17 09',
      'Jun 17 06',
      'Jun 17 all day',
      'Jun 15 20',
      'Jun 14 07',
      'Jun 14 all day B',
      'Jun 14 all day A',
    ]);
  });

  it('keeps the latest days with events under the day limit', () => {
    expect(
      rows({ list: { event_order: 'latest_first', compact_days_to_show: 2 } }).map(([d]) => d),
    ).toEqual(['06-17', '06-15']);
  });

  it("keeps each calendar's latest events under its own cap", () => {
    const capped = rows({
      ...LATEST,
      entities: [
        { entity: 'calendar.log', compact_events_to_show: 2 },
        'calendar.other',
      ] as Types.Config['entities'],
    });
    expect(flat(capped)).toEqual(['Jun 17 09', 'Jun 17 06', 'Jun 14 07', 'Jun 14 all day B']);
  });

  it('lifts every limit when expanded, and stays latest first', () => {
    const limited = { list: { event_order: 'latest_first' as const, compact_events_to_show: 1 } };
    expect(rows(limited, { expanded: true })).toEqual(rows(LATEST));
  });

  it('changes nothing in column or grid view', () => {
    for (const view of ['column', 'grid'] as const) {
      expect(rows({ event_order: 'latest_first' }, { view })).toEqual(rows({}, { view }));
    }
  });

  describe('fills empty days from the window’s last day', () => {
    it('lists every date of the window, latest first', () => {
      const days = rows({ ...LATEST, show_empty_days: true });
      expect(days.map(([date]) => date)).toEqual([
        '06-17',
        '06-16',
        '06-15',
        '06-14',
        '06-13',
        '06-12',
        '06-11',
      ]);
      expect(days[1]).toEqual(['06-16', ['(empty)']]);
    });

    it('back to the oldest day the event limit reaches', () => {
      const days = rows({
        show_empty_days: true,
        list: { event_order: 'latest_first', compact_events_to_show: 4 },
      });
      expect(days.map(([date]) => date)).toEqual(['06-17', '06-16', '06-15']);
    });

    it('over the latest dates the day limit allows', () => {
      const days = rows({
        show_empty_days: true,
        list: { event_order: 'latest_first', compact_days_to_show: 3 },
      });
      expect(days.map(([date]) => date)).toEqual(['06-17', '06-16', '06-15']);
    });

    it('puts an empty card’s notice on the last day, at the top', () => {
      expect(rows(LATEST, { events: [] })).toEqual([['06-17', ['(empty)']]]);
      expect(rows({ ...LATEST, start_date: 'today-9' }, { events: [] })).toEqual([
        ['06-14', ['(empty)']],
      ]);
      expect(rows({}, { events: [] })).toEqual([['06-11', ['(empty)']]]);
    });

    it('keeps today on the card when it is empty, wherever it falls', () => {
      const days = rows(
        { ...LATEST, start_date: 'today-3', show_empty_today: true },
        { events: [timed(15, 20, 'Jun 15 20')] },
      );
      expect(days).toEqual([
        ['06-17', ['(empty)']],
        ['06-15', ['Jun 15 20']],
      ]);
    });
  });

  it('draws each week’s number above its latest day, and the month change between days', () => {
    // The renderer compares each day with the one drawn above it, so the pills and the
    // month rule move with the order without a branch of their own. Saturday May 30 is
    // ISO week 22, June 1 to 7 week 23, June 8 to 14 week 24.
    const events: Types.CalendarEventData[] = ['05-30', '06-01', '06-03', '06-08', '06-10'].map(
      (date) => ({
        start: { dateTime: `2026-${date}T09:00:00.000Z` },
        end: { dateTime: `2026-${date}T10:00:00.000Z` },
        summary: `E-${date}`,
        _entityId: 'calendar.log',
      }),
    );
    const drawn = (order: Types.EventOrder): string[] => {
      const config = buildConfig({
        entities: ['calendar.log'],
        start_date: '2026-05-30',
        days_to_show: 14,
        show_past_events: true,
        first_day_of_week: 'monday',
        show_week_numbers: 'iso',
        month_separator_width: '2px',
        list: { event_order: order },
      });
      const days = EventUtils.groupEventsByDay(
        EventUtils.processEvents(events, config),
        config,
        false,
        'en',
        'list',
      );
      const container = document.createElement('div');
      litRender(Render.renderGroupedEvents(days, config, 'en'), container);
      return Array.from(container.children).flatMap((child) => {
        if (child.classList.contains('week-row-table')) {
          return [`week ${child.querySelector('.week-number')!.textContent!.trim()}`];
        }
        if (child.classList.contains('month-separator')) return ['month'];
        if (child.classList.contains('day-table')) {
          return [child.textContent!.match(/E-\d\d-\d\d/)![0]];
        }
        return [];
      });
    };

    expect(drawn('earliest_first')).toEqual([
      'week 22',
      'E-05-30',
      'week 23',
      'E-06-01',
      'E-06-03',
      'week 24',
      'E-06-08',
      'E-06-10',
    ]);
    expect(drawn('latest_first')).toEqual([
      'week 24',
      'E-06-10',
      'E-06-08',
      'week 23',
      'E-06-03',
      'E-06-01',
      'week 22',
      'E-05-30',
    ]);
  });
});

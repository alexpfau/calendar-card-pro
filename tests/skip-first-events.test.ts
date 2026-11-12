/**
 * `skip_first_events`, so a second card continues a list where a first one stopped (#222).
 *
 * The contract: the skip leaves out the first rows the card would draw, counted in display
 * order after every filter, duplicates and each calendar's cap, and in force expanded too. A
 * day it empties leaves the card, and no empty day is drawn before the day it stopped in.
 * Column and grid view ignore it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';

/** A timed event on a June 2026 day, in UTC like the unit project. */
function timed(
  day: number,
  hour: number,
  summary: string,
  entity = 'calendar.anna',
  hours = 1,
): Types.CalendarEventData {
  const at = (d: number, h: number) => new Date(Date.UTC(2026, 5, d, h)).toISOString();
  return {
    start: { dateTime: at(day, hour) },
    end: { dateTime: at(day, hour + hours) },
    summary,
    _entityId: entity,
  };
}

/** An all-day event on June 2026 days, `days` long. */
function allDay(
  day: number,
  summary: string,
  entity = 'calendar.anna',
  days = 1,
): Types.CalendarEventData {
  const date = (d: number) => `2026-06-${String(d).padStart(2, '0')}`;
  return {
    start: { date: date(day) },
    end: { date: date(day + days) },
    summary,
    _entityId: entity,
  };
}

/**
 * Two calendars over a week from today, June 17: a shared event on both (merged by
 * `filter_duplicates`), a timed event running across midnight and a three-day trip (both split),
 * and several rows a day so the skip has to stop mid-day as well as at a day's end.
 */
const WEEK: Types.CalendarEventData[] = [
  timed(17, 12, 'Lunch'),
  timed(17, 15, 'Call', 'calendar.ben'),
  timed(17, 18, 'Dinner', 'calendar.anna'),
  timed(17, 18, 'Dinner', 'calendar.ben'),
  allDay(18, 'Trip', 'calendar.ben', 3),
  timed(18, 9, 'Dentist'),
  timed(18, 22, 'Night shift', 'calendar.ben', 10),
  timed(19, 14, 'Swim'),
  timed(21, 10, 'Market', 'calendar.ben'),
  timed(22, 8, 'School'),
  timed(22, 16, 'Piano', 'calendar.ben'),
];

const CARD: Partial<Types.Config> = {
  entities: ['calendar.anna', 'calendar.ben'],
  days_to_show: 7,
  filter_duplicates: true,
  split_multiday_events: true,
};

/** Each day the grouping returns, as its date and its rows' summaries, top to bottom. */
function rows(
  overrides: Partial<Types.Config>,
  options: {
    expanded?: boolean;
    view?: Types.EffectiveView;
    events?: Types.CalendarEventData[];
  } = {},
): Array<[string, string[]]> {
  const config = buildConfig({ ...CARD, ...overrides });
  return EventUtils.groupEventsByDay(
    EventUtils.processEvents(options.events ?? WEEK, config),
    config,
    options.expanded ?? false,
    'en',
    options.view ?? 'list',
  ).map((day) => [
    new Date(day.timestamp).toISOString().slice(5, 10),
    day.events.map((event) => (event._isEmptyDay ? '(empty)' : (event.summary ?? '?'))),
  ]);
}

/** Every event a card draws, top to bottom, with the date it is drawn on; no empty-day notice. */
function flat(days: Array<[string, string[]]>): string[] {
  return days.flatMap(([date, summaries]) =>
    summaries.filter((summary) => summary !== '(empty)').map((summary) => `${date} ${summary}`),
  );
}

describe('skip_first_events', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves out the first rows, and the days it empties', () => {
    expect(rows({ list: { skip_first_events: 4 } }).slice(0, 2)).toEqual([
      ['06-18', ['Dentist', 'Night shift']],
      ['06-19', ['Trip', 'Night shift', 'Swim']],
    ]);
  });

  describe.each(['earliest_first', 'latest_first'] as const)('read %s', (order) => {
    // Calendar Ben capped at two: the cap belongs to both cards, so they count the same rows.
    const capped: Partial<Types.Config> = {
      entities: ['calendar.anna', { entity: 'calendar.ben', compact_events_to_show: 2 }],
    };

    it.each([
      ['with no caps', {}],
      ['with a calendar capped', capped],
    ])('lets a second card continue exactly where the first stopped, %s', (_, extra) => {
      const all = flat(rows({ ...extra, list: { event_order: order } }));
      expect(all.length).toBeGreaterThan(5);

      for (let n = 0; n <= all.length + 1; n++) {
        const first = flat(
          rows({ ...extra, list: { event_order: order, compact_events_to_show: n } }),
        );
        const second = flat(rows({ ...extra, list: { event_order: order, skip_first_events: n } }));
        expect([...first, ...second], `skip ${n}`).toEqual(all);
      }
    });

    it('stays in force expanded', () => {
      const expanded = flat(
        rows({ list: { event_order: order, skip_first_events: 3 } }, { expanded: true }),
      );
      expect(expanded).toEqual(flat(rows({ list: { event_order: order } })).slice(3));
    });
  });

  it('counts the rows the card would draw, not those a day limit let the first card show', () => {
    // The first card's day limit stops it after one row, though its event limit is two; the
    // second still leaves out two, so the third day's row is the first it draws.
    const events = [timed(17, 12, 'A'), timed(18, 12, 'B'), timed(19, 12, 'C')];
    expect(
      flat(rows({ list: { compact_events_to_show: 2, compact_days_to_show: 1 } }, { events })),
    ).toEqual(['06-17 A']);
    expect(flat(rows({ list: { skip_first_events: 2 } }, { events }))).toEqual(['06-19 C']);
  });

  it("counts after a calendar's cap, which expanding lifts", () => {
    // Anna capped at one, so the first card, at two events, draws A1 and B1. Collapsed, the
    // second card leaves out the same two and draws B2; expanded, the cap no longer holds A2
    // back, so it leaves out A1 and A2 and draws B1 again.
    const events = [
      timed(17, 12, 'A1'),
      timed(17, 13, 'A2'),
      timed(17, 14, 'B1', 'calendar.ben'),
      timed(17, 15, 'B2', 'calendar.ben'),
    ];
    const cardTwo = {
      entities: [{ entity: 'calendar.anna', compact_events_to_show: 1 }, 'calendar.ben'],
      list: { skip_first_events: 2 },
    } as Partial<Types.Config>;
    expect(flat(rows(cardTwo, { events }))).toEqual(['06-17 B2']);
    expect(flat(rows(cardTwo, { events, expanded: true }))).toEqual(['06-17 B1', '06-17 B2']);
  });

  it('counts the day limit from the first day it leaves', () => {
    expect(
      rows({ list: { skip_first_events: 4, compact_days_to_show: 2 } }).map(([date]) => date),
    ).toEqual(['06-18', '06-19']);
  });

  it('is read at the top level too, and a list block outranks it', () => {
    expect(rows({ skip_first_events: 2 })).toEqual(rows({ list: { skip_first_events: 2 } }));
    expect(rows({ skip_first_events: 2, list: { skip_first_events: 0 } })).toEqual(rows({}));
  });

  it('reads a quoted count, rounds a fraction down, and ignores a negative or a word', () => {
    const two = rows({ list: { skip_first_events: 2 } });
    expect(rows({ list: { skip_first_events: '2' as unknown as number } })).toEqual(two);
    expect(rows({ list: { skip_first_events: 2.7 } })).toEqual(two);
    expect(rows({ list: { skip_first_events: -1 } })).toEqual(rows({}));
    expect(rows({ list: { skip_first_events: 'two' as unknown as number } })).toEqual(rows({}));
  });

  it('changes nothing in column or grid view', () => {
    for (const view of ['column', 'grid'] as const) {
      expect(rows({ skip_first_events: 3 }, { view })).toEqual(rows({}, { view }));
    }
  });

  describe('draws no empty day before the day it stopped in', () => {
    it('starting the days on the day it stopped in, part-way through', () => {
      const days = rows({ show_empty_days: true, list: { skip_first_events: 2 } });
      expect(days.map(([date]) => date)).toEqual([
        '06-17',
        '06-18',
        '06-19',
        '06-20',
        '06-21',
        '06-22',
        '06-23',
      ]);
      expect(days[0]).toEqual(['06-17', ['Dinner']]);
    });

    it('starting them on the next date when it stopped at the end of a day', () => {
      const days = rows({ show_empty_days: true, list: { skip_first_events: 3 } });
      expect(days[0][0]).toBe('06-18');
      expect(days).toHaveLength(6);
    });

    it('and on the date before, for a list read latest first', () => {
      // The latest rows are June 22's Piano and School, then June 21's Market.
      const days = rows({
        show_empty_days: true,
        list: { event_order: 'latest_first', skip_first_events: 2 },
      });
      expect(days.map(([date]) => date)).toEqual(['06-21', '06-20', '06-19', '06-18', '06-17']);
    });

    it('so a card it emptied shows its notice there, held inside the window', () => {
      expect(rows({ list: { skip_first_events: 3 } }, { events: WEEK.slice(0, 4) })).toEqual([
        ['06-18', ['(empty)']],
      ]);
      expect(rows({ days_to_show: 1, list: { skip_first_events: 9 } })).toEqual([
        ['06-17', ['(empty)']],
      ]);
    });

    it('nor today, when it passed over today', () => {
      const events = [
        timed(15, 12, 'Before'),
        timed(16, 12, 'Yesterday'),
        timed(18, 12, 'Tomorrow'),
        timed(19, 12, 'Swim'),
      ];
      const card = (skip: number) =>
        rows(
          {
            start_date: 'today-2',
            show_past_events: true,
            show_empty_today: true,
            list: { skip_first_events: skip },
          },
          { events },
        );

      // Today, empty, is where the list goes on after Yesterday, so it stays.
      expect(card(2)).toEqual([
        ['06-17', ['(empty)']],
        ['06-18', ['Tomorrow']],
        ['06-19', ['Swim']],
      ]);
      // Here the skip passed over today to Tomorrow, so today is left out.
      expect(card(3)).toEqual([['06-19', ['Swim']]]);
    });
  });
});

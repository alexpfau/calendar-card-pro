/**
 * Searching the card's events, the pure half (`src/utils/search.ts`): the days searched, how
 * words are folded and matched, the order and grouping of what a term finds, the row cap, and
 * how a picked event is found again on the card.
 *
 * The card's half, which feeds this its events as the rows draw them, is pinned in
 * `toolbar-search.test.ts`; the window across daylight saving time in
 * `search-window.dst.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as EventUtils from '../src/utils/events';
import * as Search from '../src/utils/search';

/** Wednesday, June 17, 2026, mid-morning; the unit project runs on UTC. */
const NOW = new Date('2026-06-17T10:00:00.000Z');

const ANNA = 'calendar.anna';

/** A window as plain values, so it can be pinned whole. */
function plain(window: Search.SearchWindow) {
  return {
    start: window.start.toISOString(),
    end: window.end.toISOString(),
    days: window.days,
    key: window.key,
  };
}

/**
 * A row as the card would describe an event: an hour from `at` unless told otherwise.
 *
 * @param at - When it starts, as an ISO instant
 * @param title - Its title as drawn
 * @param extra - Its location and description as drawn, and when it ends
 */
function row(
  at: string,
  title: string,
  extra: { location?: string; description?: string; end?: string; language?: string } = {},
): Search.SearchRow {
  const language = extra.language ?? 'en';
  const start = new Date(at).getTime();
  const end = extra.end ? new Date(extra.end).getTime() : start + 60 * 60 * 1000;
  const day = at.slice(0, 10);
  const location = extra.location ?? '';
  return {
    id: `${title}@${at}`,
    entityId: ANNA,
    title,
    location,
    folded: {
      title: Search.foldText(title, language),
      location: Search.foldText(location, language),
      description: Search.foldText(extra.description ?? '', language).text,
    },
    start,
    end,
    day,
    monthKey: day.slice(0, 7),
    month: day.slice(0, 7),
    dayText: day,
    timeText: '',
    color: 'red',
    calendar: 'Anna',
    target: { entityId: ANNA, start: at, summary: title },
  };
}

/** What a term finds, as `[month, past, row ids]` per group. */
function shape(results: Search.SearchResults) {
  return results.groups.map((group) => [
    group.key,
    group.past,
    group.hits.map((hit) => hit.row.id),
  ]);
}

//-----------------------------------------------------------------------------
// THE WINDOW
//-----------------------------------------------------------------------------

describe('the days searched', () => {
  it('run from midnight a year ago to midnight after this day a year ahead', () => {
    expect(plain(Search.searchWindow(NOW))).toEqual({
      start: '2025-06-17T00:00:00.000Z',
      end: '2027-06-18T00:00:00.000Z',
      days: 731,
      key: '2025-06-17',
    });
  });

  it('take the last day of February either side of a February 29', () => {
    expect(plain(Search.searchWindow(new Date('2028-02-29T12:00:00.000Z')))).toEqual({
      start: '2027-02-28T00:00:00.000Z',
      end: '2029-03-01T00:00:00.000Z',
      days: 732,
      key: '2027-02-28',
    });
  });

  it('are the same from the first moment of a day to its last', () => {
    const first = Search.searchWindow(new Date('2026-12-31T00:00:00.000Z'));
    const last = Search.searchWindow(new Date('2026-12-31T23:59:59.999Z'));

    expect(plain(last)).toEqual(plain(first));
    expect(plain(first)).toEqual({
      start: '2025-12-31T00:00:00.000Z',
      end: '2028-01-01T00:00:00.000Z',
      days: 731,
      key: '2025-12-31',
    });
  });

  it('move on with the day, which is what tells a stale load from a current one', () => {
    expect(Search.searchWindow(new Date('2026-06-18T00:00:00.000Z')).key).toBe('2025-06-18');
  });
});

describe('the configuration a search groups with', () => {
  const view = buildConfig({
    days_to_show: 7,
    start_date: '2026-01-05',
    show_past_events: false,
    show_empty_days: true,
    show_empty_today: true,
    show_location: false,
    list: { days_to_show: 3 },
    column: { days_to_show: 5 },
    time_grid: { days_to_show: 4, start_time: '18:00', end_time: '22:00' },
  } as Partial<Types.Config>);
  const window = Search.searchWindow(NOW);
  const forced = {
    start_date: '2025-06-17',
    days_to_show: 731,
    show_past_events: true,
    show_empty_days: false,
    show_empty_today: false,
  };

  it('is the view’s, over the whole window, with every past event and no empty day', () => {
    expect(Search.searchGroupingConfig(view, window, 'list')).toEqual({
      ...view,
      ...forced,
      list: { ...forced },
    });
  });

  it('writes those into the view’s own block too, which outranks them, keeping the rest of it', () => {
    expect(Search.searchGroupingConfig(view, window, 'grid')).toEqual({
      ...view,
      ...forced,
      time_grid: { start_time: '18:00', end_time: '22:00', ...forced },
    });
    expect(Search.searchGroupingConfig(view, window, 'column')).toEqual({
      ...view,
      ...forced,
      column: { ...forced },
    });
  });

  it('wins over a view’s own defaults once the card resolves it for that view', () => {
    // The grid's own default shows empty days and a block's days_to_show is its own.
    const resolved = ViewConfig.resolveEffectiveConfig(
      Search.searchGroupingConfig(view, window, 'grid'),
      'grid',
    );
    expect({
      days: resolved.days_to_show,
      empty: resolved.show_empty_days,
      past: resolved.show_past_events,
      start: ViewConfig.resolveTimeGridOption(resolved, 'start_time'),
    }).toEqual({ days: 731, empty: false, past: true, start: '18:00' });
  });
});

describe('what the view on screen draws', () => {
  const config = buildConfig({
    entities: [ANNA],
    view: 'grid',
    time_grid: { start_time: '18:00', end_time: '22:00' },
  } as Partial<Types.Config>);
  const window = Search.searchWindow(NOW);

  function drawn(view: Types.EffectiveView, events: Types.CalendarEventData[]): string[] {
    const grouping = Search.searchGroupingConfig(
      ViewConfig.resolveEffectiveConfig(config, view),
      window,
      view,
    );
    const days = EventUtils.groupEventsByDay(
      EventUtils.processEvents(
        events.map((event) => ({ ...event, _entityId: ANNA })),
        config,
      ),
      grouping,
      true,
      'en',
      view,
      null,
    );
    return Search.occurrencesIn(Search.drawnIn(days, grouping, view)).map(
      ({ event }) => event.summary ?? '',
    );
  }

  const EVENTS: Types.CalendarEventData[] = [
    {
      summary: 'Morning swim',
      start: { dateTime: '2026-06-20T09:00:00.000Z' },
      end: { dateTime: '2026-06-20T10:00:00.000Z' },
    },
    {
      summary: 'Evening choir',
      start: { dateTime: '2026-06-20T19:00:00.000Z' },
      end: { dateTime: '2026-06-20T20:00:00.000Z' },
    },
    // Across midnight, and outside the hours on both of its days.
    {
      summary: 'Night shift',
      start: { dateTime: '2026-06-20T23:00:00.000Z' },
      end: { dateTime: '2026-06-21T06:00:00.000Z' },
    },
    // Across midnight, inside the hours on its first day only.
    {
      summary: 'Late concert',
      start: { dateTime: '2026-06-21T21:00:00.000Z' },
      end: { dateTime: '2026-06-22T01:00:00.000Z' },
    },
    { summary: 'Holiday', start: { date: '2026-06-22' }, end: { date: '2026-06-24' } },
  ];

  it('in grid view, only what reaches into the hours it shows, by the grid’s own test', () => {
    expect(drawn('grid', EVENTS)).toEqual(['Evening choir', 'Late concert', 'Holiday']);
  });

  it('in list view, every event', () => {
    expect(drawn('list', EVENTS)).toEqual([
      'Morning swim',
      'Evening choir',
      'Night shift',
      'Late concert',
      'Holiday',
    ]);
  });
});

//-----------------------------------------------------------------------------
// FOLDING AND MATCHING
//-----------------------------------------------------------------------------

describe('folding words for matching', () => {
  it('lower-cases plain text unit for unit, with no map to keep', () => {
    expect(Search.foldText('Dentist Check-Up', 'en')).toEqual({ text: 'dentist check-up' });
  });

  it('drops accents, and marks a match in the words as drawn', () => {
    const words = 'Café Zürich';
    const folded = Search.foldText(words, 'de');

    expect(folded.text).toBe('cafe zurich');
    const range = Search.matchIn(folded, 'zur')!;
    expect(words.slice(...range)).toBe('Zür');
  });

  it('marks an accent written apart from its letter with the letter', () => {
    const words = 'Cafe\u0301 Rio';
    const folded = Search.foldText(words, 'en');

    expect(folded.text).toBe('cafe rio');
    expect(Search.matchIn(folded, 'cafe')).toEqual([0, 5]);
    expect(Search.matchIn(folded, 'fe')).toEqual([2, 5]);
    expect(Search.matchIn(folded, 'e r')).toEqual([3, 7]);
  });

  it('lower-cases in the card’s language before dropping accents: a Turkish İ is an i', () => {
    expect(Search.foldText('İstanbul', 'tr').text).toBe('istanbul');
    expect(Search.foldText('İstanbul', 'en').text).toBe('istanbul');
    expect(Search.matchIn(Search.foldText('İstanbul', 'tr'), 'ist')).toEqual([0, 3]);
  });

  it('keeps the card’s language’s own lower case: a Turkish I is a dotless ı', () => {
    expect(Search.foldText('IKEA', 'tr').text).toBe('ıkea');
    expect(Search.foldText('IKEA', 'en').text).toBe('ikea');
  });

  it('drops the accents a Lithuanian lower case adds', () => {
    expect(Search.foldText('ĨÌ', 'lt').text).toBe('ii');
  });

  it('reads a Greek final sigma as any other sigma', () => {
    expect(Search.foldText('ΟΔΟΣ', 'el').text).toBe('οδοσ');
    expect(Search.foldText('οδος', 'el').text).toBe('οδοσ');
  });

  it('keeps a mark that is part of its letter, as in Japanese kana', () => {
    expect(Search.foldText('が', 'ja').text).toBe('か\u3099');
    expect(Search.matchIn(Search.foldText('か', 'ja'), 'か\u3099')).toBeUndefined();
    // The other way round it is found, as an unaccented letter finds an accented one, and the
    // letter is marked whole.
    expect(Search.matchIn(Search.foldText('がっこう', 'ja'), 'か')).toEqual([0, 1]);
  });

  it('finds a Korean syllable from its first letters, as it is typed', () => {
    const words = '한국';
    expect(Search.matchIn(Search.foldText(words, 'ko'), Search.foldText('하', 'ko').text)).toEqual([
      0, 1,
    ]);
    expect(
      Search.matchIn(Search.foldText(words, 'ko'), Search.foldText('한구', 'ko').text),
    ).toEqual([0, 2]);
  });

  it('maps a match past a letter outside the Basic Multilingual Plane', () => {
    const words = '🦷 Dentist';
    const range = Search.matchIn(Search.foldText(words, 'en'), 'dent')!;

    expect(words.slice(...range)).toBe('Dent');
  });

  it('finds nothing for no term', () => {
    expect(Search.matchIn(Search.foldText('Dentist', 'en'), '')).toBeUndefined();
  });

  it('accepts a language Intl does not know', () => {
    expect(Search.foldText('Zürich', 'not a language!').text).toBe('zurich');
  });
});

//-----------------------------------------------------------------------------
// FINDING
//-----------------------------------------------------------------------------

describe('what a term finds', () => {
  const now = NOW.getTime();

  it('is upcoming first, then the past, each grouped by the month it starts in', () => {
    const rows = [
      row('2026-06-10T09:00:00.000Z', 'Dentist A'),
      row('2026-06-20T09:00:00.000Z', 'Dentist B'),
      row('2026-05-01T09:00:00.000Z', 'Dentist C'),
      row('2026-07-02T09:00:00.000Z', 'Dentist D'),
      // Under way: it has not ended, so it is upcoming.
      row('2026-06-17T09:00:00.000Z', 'Dentist E', { end: '2026-06-17T11:00:00.000Z' }),
      row('2026-06-17T00:00:00.000Z', 'Dentist F', { end: '2026-06-18T00:00:00.000Z' }),
      // Ended at this very moment: past.
      row('2026-06-17T09:00:00.000Z', 'Dentist G', { end: '2026-06-17T10:00:00.000Z' }),
    ];

    expect(shape(Search.findRows(rows, 'dentist', 'en', now))).toEqual([
      [
        '2026-06',
        false,
        [
          'Dentist F@2026-06-17T00:00:00.000Z',
          'Dentist E@2026-06-17T09:00:00.000Z',
          'Dentist B@2026-06-20T09:00:00.000Z',
        ],
      ],
      ['2026-07', false, ['Dentist D@2026-07-02T09:00:00.000Z']],
      [
        '2026-06',
        true,
        ['Dentist G@2026-06-17T09:00:00.000Z', 'Dentist A@2026-06-10T09:00:00.000Z'],
      ],
      ['2026-05', true, ['Dentist C@2026-05-01T09:00:00.000Z']],
    ]);
  });

  it('puts the shorter of two events starting together first, upcoming and past alike', () => {
    const rows = [
      row('2026-06-20T09:00:00.000Z', 'Long', { end: '2026-06-20T12:00:00.000Z' }),
      row('2026-06-20T09:00:00.000Z', 'Short', { end: '2026-06-20T10:00:00.000Z' }),
      row('2026-06-10T09:00:00.000Z', 'Long', { end: '2026-06-10T12:00:00.000Z' }),
      row('2026-06-10T09:00:00.000Z', 'Short', { end: '2026-06-10T10:00:00.000Z' }),
    ];

    expect(shape(Search.findRows(rows, 'o', 'en', now))).toEqual([
      ['2026-06', false, ['Short@2026-06-20T09:00:00.000Z', 'Long@2026-06-20T09:00:00.000Z']],
      ['2026-06', true, ['Long@2026-06-10T09:00:00.000Z', 'Short@2026-06-10T09:00:00.000Z']],
    ]);
  });

  it('looks in the title, the location and the description, and marks the first two', () => {
    const rows = [
      row('2026-06-20T09:00:00.000Z', 'Check-up', { location: 'Dental Clinic' }),
      row('2026-06-21T09:00:00.000Z', 'Appointment', { description: 'dental cleaning' }),
      row('2026-06-22T09:00:00.000Z', 'Dentist'),
      row('2026-06-23T09:00:00.000Z', 'Lunch', { location: 'Cafe' }),
    ];
    const results = Search.findRows(rows, 'DENT', 'en', now);
    const hits = results.groups.flatMap((group) => group.hits);

    expect(hits.map(({ row: { title }, title: t, location: l }) => [title, t, l])).toEqual([
      ['Check-up', undefined, [0, 4]],
      ['Appointment', undefined, undefined],
      ['Dentist', [0, 4], undefined],
    ]);
    expect(results.total).toBe(3);
  });

  it('finds a term inside a word, from its first letter on', () => {
    const results = Search.findRows([row('2026-06-20T09:00:00.000Z', 'Dentist')], 'n', 'en', now);

    expect(results.total).toBe(1);
    expect(results.groups[0].hits[0].title).toEqual([2, 3]);
  });

  it('trims the term, and finds nothing for one of spaces alone', () => {
    const rows = [row('2026-06-20T09:00:00.000Z', 'Dentist')];

    expect(Search.findRows(rows, '  dent ', 'en', now).total).toBe(1);
    expect(Search.findRows(rows, '   ', 'en', now)).toEqual({ term: '   ', total: 0, groups: [] });
    expect(Search.findRows(rows, '', 'en', now)).toEqual({ term: '', total: 0, groups: [] });
  });

  it('ignores accents and case in the term as in the words', () => {
    const rows = [row('2026-06-20T09:00:00.000Z', 'Zahnarzt Zürich')];

    expect(Search.findRows(rows, 'ZURICH', 'de', now).total).toBe(1);
    expect(Search.findRows(rows, 'zürich', 'de', now).total).toBe(1);
  });

  it('draws at most the cap, cutting the oldest of the past, and counts every match', () => {
    const day = 24 * 60 * 60 * 1000;
    const at = (offset: number) => new Date(now + offset * day).toISOString();
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => row(at(i + 1), `Up ${i}`)),
      ...Array.from({ length: 220 }, (_, i) => row(at(-(i + 1)), `Past ${i}`)),
    ];
    const found = Search.findRows(rows, 'p', 'en', now);
    const drawn = found.groups.flatMap((group) => group.hits.map((hit) => hit.row.title));

    expect(Search.SEARCH_RESULT_LIMIT).toBe(200);
    expect(found.total).toBe(250);
    expect(drawn).toHaveLength(200);
    expect(drawn.slice(0, 30)).toEqual(Array.from({ length: 30 }, (_, i) => `Up ${i}`));
    expect(drawn.slice(30)).toEqual(Array.from({ length: 170 }, (_, i) => `Past ${i}`));
  });

  it('draws nothing under a cap of none, and still counts', () => {
    const results = Search.findRows(
      [row('2026-06-20T09:00:00.000Z', 'Dentist')],
      'd',
      'en',
      now,
      0,
    );

    expect(results).toEqual({ term: 'd', total: 1, groups: [] });
  });
});

//-----------------------------------------------------------------------------
// OCCURRENCES
//-----------------------------------------------------------------------------

describe('the events of a grouping, once each', () => {
  const config = buildConfig({
    entities: [ANNA],
    split_multiday_events: true,
    show_past_events: true,
  } as Partial<Types.Config>);
  const window = Search.searchWindow(NOW);

  function grouped(events: Types.CalendarEventData[]) {
    return EventUtils.groupEventsByDay(
      EventUtils.processEvents(
        events.map((event) => ({ ...event, _entityId: ANNA })),
        config,
      ),
      Search.searchGroupingConfig(config, window, 'list'),
      true,
      'en',
      'list',
      null,
    );
  }

  it('counts an event split into a row a day once, with the start and end it really has', () => {
    const days = grouped([
      {
        summary: 'Conference',
        start: { dateTime: '2026-06-20T15:00:00.000Z' },
        end: { dateTime: '2026-06-22T11:00:00.000Z' },
      },
    ]);
    expect(days.filter((day) => day.events.length > 0)).toHaveLength(3);

    const occurrences = Search.occurrencesIn(days);
    expect(
      occurrences.map(({ event, start, end }) => [
        event.summary,
        start.toISOString(),
        end.toISOString(),
      ]),
    ).toEqual([['Conference', '2026-06-20T15:00:00.000Z', '2026-06-22T11:00:00.000Z']]);
  });

  it('keeps two events of the same title on different days apart', () => {
    const days = grouped([
      {
        summary: 'Swim',
        start: { dateTime: '2026-06-20T15:00:00.000Z' },
        end: { dateTime: '2026-06-20T16:00:00.000Z' },
      },
      {
        summary: 'Swim',
        start: { dateTime: '2026-06-27T15:00:00.000Z' },
        end: { dateTime: '2026-06-27T16:00:00.000Z' },
      },
    ]);

    expect(Search.occurrencesIn(days).map(({ start }) => start.toISOString())).toEqual([
      '2026-06-20T15:00:00.000Z',
      '2026-06-27T15:00:00.000Z',
    ]);
  });

  it('keeps two events with the same title and times apart, each found by its own words', () => {
    const days = grouped([
      {
        summary: 'Conference',
        start: { dateTime: '2026-06-20T15:00:00.000Z' },
        end: { dateTime: '2026-06-22T11:00:00.000Z' },
        location: 'Hall A',
        uid: 'c-1',
      },
      {
        summary: 'Conference',
        start: { dateTime: '2026-06-20T15:00:00.000Z' },
        end: { dateTime: '2026-06-22T11:00:00.000Z' },
        location: 'Hall B',
        uid: 'c-2',
      },
    ]);
    const occurrences = Search.occurrencesIn(days);

    expect(occurrences.map(({ event }) => event.location)).toEqual(['Hall A', 'Hall B']);
  });

  it('keeps the copies two identical entries for one calendar draw, one per entry', () => {
    const twice = buildConfig({
      entities: [ANNA, ANNA],
      split_multiday_events: true,
      show_past_events: true,
    } as Partial<Types.Config>);
    const days = EventUtils.groupEventsByDay(
      EventUtils.processEvents(
        [
          {
            summary: 'Conference',
            start: { dateTime: '2026-06-20T15:00:00.000Z' },
            end: { dateTime: '2026-06-22T11:00:00.000Z' },
            _entityId: ANNA,
          },
        ],
        twice,
      ),
      Search.searchGroupingConfig(twice, window, 'list'),
      true,
      'en',
      'list',
      null,
    );

    expect(Search.occurrencesIn(days).map(({ event }) => event.summary)).toEqual([
      'Conference',
      'Conference',
    ]);
  });

  it('tells a day carrying no stamp apart by what it says', () => {
    const day = (location: string): Types.CalendarEventData => ({
      summary: 'Conference',
      start: { dateTime: '2026-06-20T15:00:00.000Z' },
      end: { dateTime: '2026-06-20T23:59:59.999Z' },
      _sourceStart: { dateTime: '2026-06-20T15:00:00.000Z' },
      _sourceEnd: { dateTime: '2026-06-22T11:00:00.000Z' },
      _isMultiDaySegment: true,
      _entityId: ANNA,
      location,
    });
    const days: Types.EventsByDay[] = [
      {
        weekday: 'Sat',
        day: 20,
        month: 'Jun',
        timestamp: Date.parse('2026-06-20T00:00:00.000Z'),
        events: [day('Hall A'), day('Hall A'), day('Hall B')],
      },
    ];

    expect(Search.occurrencesIn(days).map(({ event }) => event.location)).toEqual([
      'Hall A',
      'Hall B',
    ]);
  });

  it('reads an all-day event at local midnights, and skips a day made up as empty', () => {
    const days: Types.EventsByDay[] = [
      ...grouped([
        { summary: 'Holiday', start: { date: '2026-06-20' }, end: { date: '2026-06-21' } },
      ]),
      {
        ...grouped([])[0],
        events: [{ summary: '', start: {}, end: {}, _isEmptyDay: true } as Types.CalendarEventData],
      } as Types.EventsByDay,
    ];

    expect(
      Search.occurrencesIn(days).map(({ event, start, end }) => [
        event.summary,
        start.toISOString(),
        end.toISOString(),
      ]),
    ).toEqual([['Holiday', '2026-06-20T00:00:00.000Z', '2026-06-21T00:00:00.000Z']]);
  });
});

//-----------------------------------------------------------------------------
// FINDING A PICK AGAIN
//-----------------------------------------------------------------------------

describe('finding a picked event again', () => {
  const event = (
    over: Partial<Types.CalendarEventData> & { source?: Record<string, unknown> },
  ): Types.CalendarEventData => {
    const { source, ...rest } = over;
    const start = { dateTime: '2026-06-20T09:00:00+00:00' };
    return {
      summary: 'Dentist',
      start,
      end: { dateTime: '2026-06-20T10:00:00+00:00' },
      _entityId: ANNA,
      _source: { summary: 'Dentist', start, ...source } as Types.CalendarEventData['_source'],
      ...rest,
    };
  };

  it('names the event by its uid and recurrence id where Home Assistant gives them', () => {
    const picked = event({ source: { uid: 'u-1', recurrence_id: '20260620T090000Z' } });
    const target = Search.ringTargetOf(picked);

    expect(target).toEqual({
      entityId: ANNA,
      uid: 'u-1',
      recurrenceId: '20260620T090000Z',
      start: '2026-06-20T09:00:00.000Z',
      summary: 'Dentist',
    });
    expect(Search.isRingTarget(picked, target)).toBe(true);
    expect(
      Search.isRingTarget(
        event({ source: { uid: 'u-1', recurrence_id: '20260627T090000Z' } }),
        target,
      ),
    ).toBe(false);
    expect(Search.isRingTarget(event({ _entityId: 'calendar.ben' }), target)).toBe(false);
  });

  it('rings only the occurrence picked where every one shares a uid and has no recurrence id', () => {
    const first = event({ source: { uid: 'u-series' } });
    const next = event({
      start: { dateTime: '2026-06-27T09:00:00+00:00' },
      source: { uid: 'u-series', start: { dateTime: '2026-06-27T09:00:00+00:00' } },
    });

    expect(Search.isRingTarget(first, Search.ringTargetOf(first))).toBe(true);
    expect(Search.isRingTarget(next, Search.ringTargetOf(first))).toBe(false);
    expect(Search.isRingTarget(first, Search.ringTargetOf(next))).toBe(false);
  });

  it('finds a start again however its zone was written', () => {
    const asPushed = event({
      source: { uid: 'u-1', start: { dateTime: '2026-06-20T11:00:00+02:00' } },
    });

    expect(
      Search.isRingTarget(asPushed, Search.ringTargetOf(event({ source: { uid: 'u-1' } }))),
    ).toBe(true);
  });

  it('names one without a uid by when it starts and its title as Home Assistant wrote them', () => {
    // The title drawn may be replaced; the one Home Assistant returned is what identifies it.
    const picked = event({ summary: 'Teeth' });
    const target = Search.ringTargetOf(picked);

    expect(target).toEqual({
      entityId: ANNA,
      uid: undefined,
      recurrenceId: undefined,
      start: '2026-06-20T09:00:00.000Z',
      summary: 'Dentist',
    });
    expect(Search.isRingTarget(event({}), target)).toBe(true);
    expect(Search.isRingTarget(event({ source: { summary: 'Swim' } }), target)).toBe(false);
    expect(Search.isRingTarget(event({ source: { uid: 'u-2' } }), target)).toBe(false);
    expect(
      Search.isRingTarget(event({ _isEmptyDay: true } as Partial<Types.CalendarEventData>), target),
    ).toBe(false);
  });

  it('rings every day of an event split into days, on copies, and leaves the grouping alone', () => {
    const config = buildConfig({
      entities: [ANNA],
      split_multiday_events: true,
      show_past_events: true,
    } as Partial<Types.Config>);
    const days = EventUtils.groupEventsByDay(
      EventUtils.processEvents(
        [
          {
            summary: 'Conference',
            start: { dateTime: '2026-06-20T15:00:00.000Z' },
            end: { dateTime: '2026-06-22T11:00:00.000Z' },
            _entityId: ANNA,
          },
          {
            summary: 'Swim',
            start: { dateTime: '2026-06-21T07:00:00.000Z' },
            end: { dateTime: '2026-06-21T08:00:00.000Z' },
            _entityId: ANNA,
          },
        ],
        config,
      ),
      Search.searchGroupingConfig(config, Search.searchWindow(NOW), 'list'),
      true,
      'en',
      'list',
      null,
    );
    const conference = Search.occurrencesIn(days)[0].event;
    const before = JSON.stringify(days);

    const ringed = Search.ringIn(days, Search.ringTargetOf(conference));

    expect(ringed.found).toBe(true);
    expect(
      ringed.days.flatMap((day) =>
        day.events.map((e) => [day.timestamp, e.summary, e._searchRing === true]),
      ),
    ).toEqual(
      days.flatMap((day) =>
        day.events.map((e) => [day.timestamp, e.summary, e.summary === 'Conference']),
      ),
    );
    expect(JSON.stringify(days)).toBe(before);
  });

  it('hands back the very same grouping where nothing is picked, or nothing found', () => {
    const days: Types.EventsByDay[] = [];
    expect(Search.ringIn(days, null)).toEqual({ days, found: false });
    expect(Search.ringIn(days, null).days).toBe(days);

    const target = Search.ringTargetOf(event({}));
    const elsewhere: Types.EventsByDay[] = [
      {
        weekday: 'Sun',
        day: 21,
        month: 'Jun',
        timestamp: Date.parse('2026-06-21T00:00:00.000Z'),
        events: [event({ summary: 'Swim', source: { summary: 'Swim' } })],
      },
    ];
    expect(Search.ringIn(elsewhere, target).days).toBe(elsewhere);
    expect(Search.ringIn(elsewhere, target).found).toBe(false);
  });
});

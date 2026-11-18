import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { type SplitHow, refusals, splitEntry } from '../src/rendering/editor/split';
import * as EventUtils from '../src/utils/events';
import { getLocalDateKey } from '../src/utils/format';

/**
 * Split This Calendar keeps what the card shows: every row the entry draws before a
 * split is drawn after it by exactly one of the two parts, none twice and none missing.
 *
 * Proven through the card's own `processEvents` and `groupEventsByDay`, the display copy every
 * row is drawn from, rather than by the keys the split writes: a pair of keys can look right and
 * partition nothing. Named `.dst` because rows are days, and a day is a local thing: January
 * fixtures, so every zone here is off UTC, and one event crossing the zone's own midnight.
 *
 * The control applies a by-words split to an entry whose blocklist the card cannot read, the
 * case Split refuses, and must fail the same assertion: School events then show twice, which
 * proves the assertion can see the defect the refusal prevents.
 */

const CALENDAR = 'calendar.family';

const at = (day: number, hour = 0, minute = 0): string =>
  new Date(2026, 0, day, hour, minute).toISOString();
const date = (day: number): string => getLocalDateKey(new Date(2026, 0, day));
const at15 = (hour: number): string => at(15, hour);

/** The events, their words in every field, in every case, with RegExp metacharacters. */
function events(): Types.CalendarEventData[] {
  const timed = (
    summary: string,
    from: string,
    to: string,
    extra: Partial<Types.CalendarEventData> = {},
  ): Types.CalendarEventData => ({
    summary,
    start: { dateTime: from },
    end: { dateTime: to },
    _entityId: CALENDAR,
    ...extra,
  });
  const allDay = (
    summary: string,
    from: number,
    to: number,
    extra: Partial<Types.CalendarEventData> = {},
  ): Types.CalendarEventData => ({
    summary,
    start: { date: date(from) },
    end: { date: date(to) },
    _entityId: CALENDAR,
    ...extra,
  });
  // Each event a split's first part keeps has an event the second part keeps at the same start,
  // listed before it, so a split that drew one part after the other would swap the pair.
  return [
    timed('Dentist', at(14, 16), at(14, 17)),
    timed('Parents evening', at(15, 7, 30), at(15, 8)),
    timed('Choir', at(15, 17), at(15, 18)),
    timed('Kickoff', at(16, 10), at(16, 11)),
    timed('Dinner', at(16, 18), at(16, 19)),
    timed('Packing', at(19, 9), at(19, 10)),
    timed('School trip', at(14, 8), at(14, 15), { location: 'School', description: 'Bring lunch' }),
    timed('school run', at(15, 7, 30), at(15, 8)),
    allDay('SCHOOL Fair', 16, 17, { description: 'At the school hall' }),
    timed('Piano (2.5h) [room 3]', at(14, 16), at(14, 18, 30)),
    timed('C++ club', at(15, 17), at(15, 18), { location: 'Library' }),
    timed('Soccer', at(16, 10), at(16, 11), { location: 'Field', description: 'Soccer match' }),
    allDay('Holiday', 15, 19),
    timed('School camp', at(16, 18), at(18, 12), { location: 'Lake' }),
    allDay('Grandma visits', 12, 16, { location: 'Home' }),
    timed('Past breakfast', at(14, 7), at(14, 8)),
    timed('Overnight shift', at(14, 22), at(15, 6)),
    timed('Two whole days', at(19, 9), at(21, 9), { description: 'school trip' }),
    allDay('Bin Day', 17, 18),
    timed('No location', at(17, 9), at(17, 10)),
  ];
}

interface Rows {
  /** Each drawn row, by day, title and start, with the entry it was drawn for. */
  readonly rows: ReadonlyArray<{ readonly key: string; readonly entry: number }>;
}

/**
 * The rows the card draws for a configuration.
 *
 * @param config - The card's configuration
 * @param view - The layout
 * @returns Its rows
 */
function draw(config: Types.Config, view: Types.EffectiveView): Rows {
  const days = EventUtils.groupEventsByDay(
    EventUtils.processEvents(events(), config),
    config,
    false,
    'en',
    view,
  );
  return {
    rows: days.flatMap((bucket) =>
      bucket.events
        .filter((row) => !row._isEmptyDay)
        .map((row) => ({
          key: [
            getLocalDateKey(new Date(bucket.timestamp)),
            row._source?.summary ?? row.summary,
            row.start.dateTime ?? row.start.date,
          ].join(' · '),
          entry: config.entities.findIndex((each) => each === row._matchedConfig),
        })),
    ),
  };
}

/**
 * How a split's rows differ from the entry's: rows drawn twice, rows missing, rows not drawn
 * before. All three are empty where the split partitions what the entry shows.
 *
 * @param before - The entry's rows
 * @param after - The two parts' rows
 * @returns The differences
 */
function compare(
  before: Rows,
  after: Rows,
): { twice: string[]; missing: string[]; extra: string[] } {
  const count = (rows: Rows): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const { key } of rows.rows) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  };
  const was = count(before);
  const is = count(after);
  return {
    twice: [...is].filter(([key, n]) => was.has(key) && n > was.get(key)!).map(([key]) => key),
    missing: [...was].filter(([key, n]) => (is.get(key) ?? 0) < n).map(([key]) => key),
    extra: [...is].filter(([key]) => !was.has(key)).map(([key]) => key),
  };
}

/**
 * The entry's rows and the two parts' rows, under one card configuration.
 *
 * @param entry - The entry
 * @param how - The split
 * @param card - The card's own options
 * @param view - The layout
 * @returns Both sets of rows
 */
function beforeAndAfter(
  entry: Types.EntityConfig,
  how: SplitHow,
  card: Partial<Types.Config>,
  view: Types.EffectiveView,
): { before: Rows; after: Rows } {
  const original = buildConfig({ ...card, entities: [entry] });
  const pair = splitEntry(original.entities[0], how, [{ color: 'var(--blue-color)' }, {}]);
  const split = buildConfig({ ...card, entities: [...pair] });
  return { before: draw(original, view), after: draw(split, view) };
}

const TYPE: SplitHow = { kind: 'type' };
const words = (terms: string[], field: Types.FilterField = 'title'): SplitHow => ({
  kind: 'words',
  terms,
  field,
});

/** Every split Split allows, with the entry it starts from. */
const SPLITS: ReadonlyArray<
  readonly [string, Types.EntityConfig, SplitHow, Partial<Types.Config>?]
> = [
  ['by type', { entity: CALENDAR }, TYPE],
  ['by type, with its own blocklist', { entity: CALENDAR, blocklist: 'Soccer' }, TYPE],
  ['by type, with its own allowlist', { entity: CALENDAR, allowlist: 'school' }, TYPE],
  ['by type, with an unreadable blocklist', { entity: CALENDAR, blocklist: '[' }, TYPE],
  ['by type, with an unreadable allowlist', { entity: CALENDAR, allowlist: '(' }, TYPE],
  [
    'by type, weekdays and split across days',
    { entity: CALENDAR, days_of_week: 'weekdays', split_multiday_events: true },
    TYPE,
  ],
  ['by type, expiring at 10:00', { entity: CALENDAR, allday_expires_at: '10:00' }, TYPE],
  ['by a title word, any case', { entity: CALENDAR }, words(['school'])],
  ['by metacharacters', { entity: CALENDAR }, words(['Piano (2.5h)', 'C++'])],
  ['by a location word', { entity: CALENDAR }, words(['field'], 'location')],
  ['by a description word', { entity: CALENDAR }, words(['SCHOOL'], 'description')],
  [
    'by words over a blocklist of one space',
    { entity: CALENDAR, blocklist: ' ' },
    words(['school']),
  ],
  ['by words over its own blocklist', { entity: CALENDAR, blocklist: 'Soccer' }, words(['school'])],
  [
    'by words over its own location blocklist',
    { entity: CALENDAR, blocklist: 'Field', filter_field: 'location' },
    words(['lake'], 'location'),
  ],
  [
    'by words over a blocklist that is an expression',
    { entity: CALENDAR, blocklist: '^Bin' },
    words(['school']),
  ],
  [
    'by words, keeping its own all-day type',
    { entity: CALENDAR, event_type: 'all_day' },
    words(['school']),
  ],
  [
    'by words, keeping the card’s timed type',
    { entity: CALENDAR },
    words(['school']),
    { event_type: 'timed' },
  ],
];

const LAYOUTS: ReadonlyArray<readonly [string, Types.EffectiveView, Partial<Types.Config>]> = [
  ['List', 'list', {}],
  ['List, split across days', 'list', { split_multiday_events: true }],
  ['Columns', 'column', { view: 'column' }],
  ['Grid', 'grid', { view: 'grid' }],
];

describe('Split This Calendar keeps every row the entry draws, in exactly one part', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 14, 11, 30));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs under a zone that observes DST', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(
      new Date(2026, 6, 1).getTimezoneOffset(),
    );
  });

  describe.each(LAYOUTS)('in %s', (_, view, layout) => {
    it.each(SPLITS.map(([name, entry, how, card]) => ({ name, entry, how, card: card ?? {} })))(
      '$name',
      ({ entry, how, card }) => {
        // Only splits Split offers: the method is not refused for this entry.
        const refused = refusals(entry, buildConfig({ ...card, entities: [entry] }));
        expect(
          how.kind === 'type' ? refused.type : (refused.words ?? refused.pattern),
        ).toBeUndefined();
        expect(refused.budget).toBeUndefined();

        for (const past of [false, true]) {
          const { before, after } = beforeAndAfter(
            entry,
            how,
            {
              ...card,
              ...layout,
              show_past_events: past,
              // Grid shows past events by its own default, so its block says it too.
              ...(view === 'grid' ? { time_grid: { show_past_events: past } } : {}),
              days_to_show: 7,
            },
            view,
          );
          // The card's own options reach the pipeline: a card keeping timed events draws no
          // all-day row on either side.
          if (card.event_type === 'timed') {
            expect(before.rows.some((row) => /Holiday|Bin Day|Fair/.test(row.key))).toBe(false);
          }

          expect(compare(before, after)).toEqual({ twice: [], missing: [], extra: [] });
          expect(before.rows.length).toBeGreaterThan(0);
          // Attributed to the two parts, and only to them.
          expect(new Set(after.rows.map((row) => row.entry))).toSatisfy((parts: Set<number>) =>
            [...parts].every((part) => part === 0 || part === 1),
          );
        }
      },
    );

    // A card-wide event limit and Skip First Events count rows in the order the card draws them,
    // so they keep the same events only where the parts' rows come in the entry's order, events
    // sharing a start included.
    it.each(SPLITS.map(([name, entry, how, card]) => ({ name, entry, how, card: card ?? {} })))(
      'in the same order, under a card-wide event limit or skip: $name',
      ({ entry, how, card }) => {
        const order = (rows: Rows): string[] => rows.rows.map((row) => row.key);
        let limited = 0;
        for (const past of [false, true]) {
          const base = {
            ...card,
            ...layout,
            show_past_events: past,
            ...(view === 'grid' ? { time_grid: { show_past_events: past } } : {}),
            days_to_show: 7,
          };
          const whole = beforeAndAfter(entry, how, base, view);
          expect(order(whole.after)).toEqual(order(whole.before));

          for (let n = 1; n <= whole.before.rows.length; n++) {
            for (const budget of [{ compact_events_to_show: n }, { skip_first_events: n }]) {
              const { before, after } = beforeAndAfter(entry, how, { ...base, ...budget }, view);
              if (before.rows.length < whole.before.rows.length) limited++;
              expect(order(after), JSON.stringify(budget)).toEqual(order(before));
            }
          }
        }
        // The limits cut rows in List, the one layout they act in, so the comparison above saw
        // them at work there.
        expect(limited > 0).toBe(view === 'list');
      },
    );

    it('keeps the same one of two events at one start, where the limit keeps one of them', () => {
      const kept = (
        pair: Types.CalendarEventData[],
        entities: Types.EntityConfig[],
        budget: Partial<Types.Config>,
      ): string[] => {
        const config = buildConfig({ ...layout, ...budget, days_to_show: 7, entities });
        return EventUtils.groupEventsByDay(
          EventUtils.processEvents(pair, config),
          config,
          false,
          'en',
          view,
        ).flatMap((day) =>
          day.events.filter((row) => !row._isEmptyDay).map((row) => row.summary ?? ''),
        );
      };
      const entry: Types.EntityConfig = { entity: CALENDAR };
      const parts = [...splitEntry(entry, words(['school']), [{}, {}])];

      // The event without the word arrives first, once before the worded one alphabetically and
      // once after it, so neither the parts' order nor the titles' can stand in for arrival.
      for (const [first, second] of [
        ['Dentist', 'School play'],
        ['Swimming', 'Assembly at school'],
      ]) {
        const pair = [first, second].map((summary, at) => ({
          summary,
          start: { dateTime: at15(9) },
          end: { dateTime: at15(10 + at) },
          _entityId: CALENDAR,
        }));
        const cases = [
          [{ compact_events_to_show: 1 }, [first]],
          [{ skip_first_events: 1 }, [second]],
        ] as const;
        for (const [budget, listed] of cases) {
          const one = kept(pair, [entry], budget);
          // The calendar's own order decides the tie; the limits act in List alone.
          expect(one, first).toEqual(view === 'list' ? listed : [first, second]);
          expect(kept(pair, parts, budget), `${first} ${JSON.stringify(budget)}`).toEqual(one);
        }
      }
    });

    it('keeps the same events where Filter Duplicates folds two the split tells apart', () => {
      // Lunch arrives twice, alike but for a description only the split reads, around Other at
      // the same start. Listed once, the first Lunch is kept; split, the worded part's, which
      // must still be drawn where the first arrived.
      const three = [
        ['Lunch', 'normal'],
        ['Other', ''],
        ['Lunch', 'priority'],
      ].map(([summary, description]) => ({
        summary,
        description,
        start: { dateTime: at15(9) },
        end: { dateTime: at15(10) },
        _entityId: CALENDAR,
      }));
      const entry: Types.EntityConfig = { entity: CALENDAR };
      const parts = [...splitEntry(entry, words(['priority'], 'description'), [{}, {}])];
      const kept = (entities: Types.EntityConfig[], budget: Partial<Types.Config>): string[] => {
        const config = buildConfig({
          ...layout,
          ...budget,
          filter_duplicates: true,
          days_to_show: 7,
          entities,
        });
        return EventUtils.groupEventsByDay(
          EventUtils.processEvents(three, config),
          config,
          false,
          'en',
          view,
        ).flatMap((day) =>
          day.events.filter((row) => !row._isEmptyDay).map((row) => row.summary ?? ''),
        );
      };

      for (const budget of [{}, { compact_events_to_show: 1 }, { skip_first_events: 1 }]) {
        expect(kept(parts, budget), JSON.stringify(budget)).toEqual(kept([entry], budget));
      }
      expect(kept([entry], {})).toEqual(['Lunch', 'Other']);
    });

    it('fails where a split by words meets a blocklist the card cannot read', () => {
      const entry: Types.EntityConfig = { entity: CALENDAR, blocklist: '[' };
      expect(refusals(entry, buildConfig({ entities: [entry] })).pattern).toBe(
        'split.refused.blocklist',
      );

      const { before, after } = beforeAndAfter(
        entry,
        words(['School']),
        { ...layout, show_past_events: true, days_to_show: 7 },
        view,
      );

      const found = compare(before, after);
      expect(found.twice.length).toBeGreaterThan(0);
      expect(found.twice.every((key) => /school/i.test(key))).toBe(true);
    });
  });
});

/**
 * A calendar's `starts_after` and `starts_before` (#346): the hours of the day its timed events
 * have to start in.
 *
 * The request is a shared volunteer calendar of a dozen events a day, of which only the ones
 * after 15:00 matter to one household, and the screenshots attached to it keep the afternoon
 * rows and drop the days that end up empty. So the reporter's case below is a list with a day
 * the filter empties, and a card the filter empties entirely.
 *
 * What this file pins, and the mutation each part exists to catch:
 *
 * - the value contract (`readStartWindow`): every spelling, both midnights, equal bounds, and an
 *   invalid half dropping the whole window, since honoring the valid half shows less than asked;
 * - the bounds through the card's own `normalizeEntities`, `processEvents` and `groupEventsByDay`,
 *   to the second: `>` for `>=` and `<=` for `<` each fail here, and so does reading minutes only;
 * - hours past midnight, which only the wrap branch keeps;
 * - all-day events passing every window;
 * - each event judged once by its real start: moving the filter after multi-day splitting keeps
 *   the middle days of a morning-to-morning event, which read as all-day once split.
 *
 * Pinned to UTC by the `unit` project, where the browser's clock and UTC agree.
 * `start-window.dst.test.ts` reads the same rule in four real zones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as Logger from '../src/utils/logger';
import { readStartWindow } from '../src/utils/start-window';

const SHIFTS = 'calendar.volunteer_shifts';
const FAMILY = 'calendar.family';

/** Monday 2026-06-15, 06:00 UTC: before every fixture, so nothing is past. */
const NOW = new Date('2026-06-15T06:00:00.000Z');

/** A timed event, in UTC, which is the browser's clock here. */
function timed(
  summary: string,
  start: string,
  end: string,
  entity: string = SHIFTS,
): Types.CalendarEventData {
  return { summary, start: { dateTime: start }, end: { dateTime: end }, _entityId: entity };
}

/** An all-day event, with Home Assistant's exclusive end. */
function allDay(summary: string, start: string, endExclusive: string): Types.CalendarEventData {
  return { summary, start: { date: start }, end: { date: endExclusive }, _entityId: SHIFTS };
}

/** A timed event on 2026-06-15 starting at a clock time, `HH:MM:SS`, lasting half an hour. */
function at(time: string, summary = time): Types.CalendarEventData {
  const start = new Date(`2026-06-15T${time}.000Z`);
  return timed(summary, start.toISOString(), new Date(start.getTime() + 1_800_000).toISOString());
}

/** The local date key of a grouped day. */
function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
}

/**
 * Runs events through the card's own path: normalization, processing, then grouping for a list.
 *
 * @param events - Events as Home Assistant sends them
 * @param entities - The card's `entities`
 * @param overrides - Card options beyond the defaults
 * @returns The real summaries on each drawn day, and the days carrying only a notice
 */
function render(
  events: Types.CalendarEventData[],
  entities: Array<string | Partial<Types.EntityConfig>>,
  overrides: Partial<Types.Config> = {},
): { days: Record<string, string[]>; notices: string[] } {
  const config = buildConfig({
    entities,
    days_to_show: 4,
    start_date: '2026-06-15',
    show_empty_days: false,
    ...overrides,
  } as Partial<Types.Config>);
  const grouped = EventUtils.groupEventsByDay(
    EventUtils.processEvents(events, config),
    config,
    true,
    'en',
    'list',
  );
  const days: Record<string, string[]> = {};
  const notices: string[] = [];
  for (const day of grouped) {
    const real = day.events.filter((event) => !event._isEmptyDay);
    if (real.length > 0) days[dateKey(day.timestamp)] = real.map((event) => event.summary ?? '');
    else notices.push(dateKey(day.timestamp));
  }
  return { days, notices };
}

/** The summaries one entry keeps, across every day, in order. */
function kept(events: Types.CalendarEventData[], entry: Partial<Types.EntityConfig>): string[] {
  return Object.values(render(events, [{ entity: SHIFTS, ...entry }]).days).flat();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('readStartWindow, the value contract', () => {
  it.each<[string, unknown, unknown, ReturnType<typeof readStartWindow>]>([
    ['nothing set', undefined, undefined, { problems: [] }],
    ['blank, null and whitespace are unset', '', null, { problems: [] }],
    ['whitespace alone is unset', '   ', undefined, { problems: [] }],
    [
      'after alone runs to midnight',
      '16:00',
      undefined,
      { window: { from: 57600, until: 86400 }, problems: [] },
    ],
    [
      'before alone runs from midnight',
      undefined,
      '12:00',
      { window: { from: 0, until: 43200 }, problems: [] },
    ],
    [
      'seconds are honored',
      '16:00:30',
      undefined,
      { window: { from: 57630, until: 86400 }, problems: [] },
    ],
    [
      'a single-digit hour, trimmed',
      ' 9:05 ',
      undefined,
      { window: { from: 32700, until: 86400 }, problems: [] },
    ],
    [
      'before 00:00 is the end of the day',
      '16:00',
      '00:00',
      { window: { from: 57600, until: 86400 }, problems: [] },
    ],
    [
      'before 24:00 is the end of the day',
      '16:00',
      '24:00',
      { window: { from: 57600, until: 86400 }, problems: [] },
    ],
    ['before 00:00 alone keeps everything', undefined, '00:00', { problems: [] }],
    ['after 00:00 alone keeps everything', '00:00', undefined, { problems: [] }],
    [
      'an earlier before runs past midnight',
      '22:00',
      '06:00',
      { window: { from: 79200, until: 21600 }, problems: [] },
    ],
    [
      'equal bounds leave nothing out, and say so',
      '16:00',
      '16:00',
      { problems: [{ kind: 'equal', value: '16:00' }] },
    ],
    [
      '24:00 is not a time to start from',
      '24:00',
      '20:00',
      { problems: [{ kind: 'invalid', key: 'starts_after', value: '24:00' }] },
    ],
    [
      '25:00 is no time',
      '25:00',
      undefined,
      { problems: [{ kind: 'invalid', key: 'starts_after', value: '25:00' }] },
    ],
    [
      '4pm is no time',
      '4pm',
      undefined,
      { problems: [{ kind: 'invalid', key: 'starts_after', value: '4pm' }] },
    ],
    [
      'an unquoted YAML time is a number, not a time',
      960,
      undefined,
      { problems: [{ kind: 'invalid', key: 'starts_after', value: 960 }] },
    ],
    [
      'a bad half drops the whole window',
      '22:00',
      '6am',
      { problems: [{ kind: 'invalid', key: 'starts_before', value: '6am' }] },
    ],
    [
      'both bad are both reported',
      true,
      '7',
      {
        problems: [
          { kind: 'invalid', key: 'starts_after', value: true },
          { kind: 'invalid', key: 'starts_before', value: '7' },
        ],
      },
    ],
  ])('%s', (_name, after, before, expected) => {
    expect(readStartWindow(after, before)).toEqual(expected);
  });
});

describe('the reporter’s case, in the list', () => {
  const week = [
    timed('Help desk', '2026-06-15T08:00:00Z', '2026-06-15T11:00:00Z'),
    timed('Help shift', '2026-06-15T16:00:00Z', '2026-06-15T18:45:00Z'),
    timed('Help desk', '2026-06-16T08:00:00Z', '2026-06-16T11:00:00Z'),
    timed('Help lunch', '2026-06-16T11:00:00Z', '2026-06-16T13:00:00Z'),
    timed('Help desk', '2026-06-17T08:00:00Z', '2026-06-17T11:00:00Z'),
    timed('Help shift', '2026-06-17T16:00:00Z', '2026-06-17T18:45:00Z'),
    timed('Anna', '2026-06-17T16:00:00Z', '2026-06-17T18:45:00Z'),
  ];

  it('keeps the afternoon rows and drops the day left with none', () => {
    const { days } = render(week, [{ entity: SHIFTS, starts_after: '16:00' }]);

    expect(days).toEqual({
      '2026-06-15': ['Help shift'],
      '2026-06-17': ['Help shift', 'Anna'],
    });
  });

  it('keeps every row without it, the day it empties among them', () => {
    expect(Object.keys(render(week, [SHIFTS]).days)).toEqual([
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
    ]);
  });

  it('leaves the card the notices an empty calendar leaves, where it empties every day', () => {
    const mornings = week.filter((event) => !event.start.dateTime!.includes('T16'));
    const { days, notices } = render(mornings, [{ entity: SHIFTS, starts_after: '16:00' }]);

    expect(days).toEqual({});
    expect(notices.length).toBeGreaterThan(0);
    expect(notices).toEqual(render([], [SHIFTS]).notices);
  });

  it('narrows one calendar and leaves the others on the card alone', () => {
    const family = timed('Breakfast', '2026-06-16T07:30:00Z', '2026-06-16T08:00:00Z', FAMILY);
    const { days } = render([...week, family], [{ entity: SHIFTS, starts_after: '16:00' }, FAMILY]);

    expect(days['2026-06-16']).toEqual(['Breakfast']);
  });
});

describe('the bounds', () => {
  const times = ['15:59:30', '16:00:00', '16:00:29', '16:00:30', '16:00:31'];
  const events = times.map((time) => at(time));

  it('reads a bound to the second', () => {
    expect(kept(events, { starts_after: '16:00:30' })).toEqual(['16:00:30', '16:00:31']);
  });

  it('keeps an event starting at starts_after, and leaves out one starting at starts_before', () => {
    expect(kept(events, { starts_after: '16:00' })).toEqual(times.slice(1));
    expect(kept(events, { starts_before: '16:00' })).toEqual(['15:59:30']);
  });

  it('splits a calendar between two entries with every timed event in exactly one', () => {
    const { days } = render(events, [
      { entity: SHIFTS, starts_before: '16:00', label: 'early' },
      { entity: SHIFTS, starts_after: '16:00', label: 'late' },
    ]);

    expect(Object.values(days).flat().sort()).toEqual([...times].sort());
  });

  it('reads both midnights as the end of the day', () => {
    for (const before of ['00:00', '24:00']) {
      expect(kept(events, { starts_before: before })).toEqual(times);
      expect(kept(events, { starts_after: '16:00', starts_before: before })).toEqual(
        times.slice(1),
      );
    }
  });

  it('takes a single-digit hour, seconds and surrounding spaces', () => {
    const morning = [at('09:04:59'), at('09:05:00')];
    expect(kept(morning, { starts_after: ' 9:05 ' })).toEqual(['09:05:00']);
    expect(kept(morning, { starts_after: '9:05:00' })).toEqual(['09:05:00']);
  });
});

describe('hours past midnight', () => {
  it('keeps the night, from starts_after on and before starts_before', () => {
    const night = [
      timed('23:00', '2026-06-15T23:00:00Z', '2026-06-15T23:30:00Z'),
      timed('02:00', '2026-06-16T02:00:00Z', '2026-06-16T02:30:00Z'),
      timed('05:59', '2026-06-16T05:59:00Z', '2026-06-16T06:30:00Z'),
      timed('06:00', '2026-06-16T06:00:00Z', '2026-06-16T06:30:00Z'),
      timed('12:00', '2026-06-16T12:00:00Z', '2026-06-16T12:30:00Z'),
      timed('22:00', '2026-06-16T22:00:00Z', '2026-06-16T22:30:00Z'),
    ];

    expect(kept(night, { starts_after: '22:00', starts_before: '06:00' })).toEqual([
      '23:00',
      '02:00',
      '05:59',
      '22:00',
    ]);
  });
});

describe('all-day events', () => {
  it('pass every window, one day long or several', () => {
    const events = [
      allDay('Bin day', '2026-06-15', '2026-06-16'),
      allDay('Holiday', '2026-06-16', '2026-06-18'),
      at('09:00:00', 'Morning'),
    ];

    for (const entry of [
      { starts_after: '16:00' },
      { starts_before: '06:00' },
      { starts_after: '22:00', starts_before: '06:00' },
    ]) {
      expect(kept(events, entry)).toEqual(['Bin day', 'Holiday']);
    }
  });

  it('leave with event_type: timed, which a window composes with', () => {
    const events = [allDay('Bin day', '2026-06-15', '2026-06-16'), at('17:00:00', 'Evening')];

    expect(kept(events, { starts_after: '16:00', event_type: 'timed' })).toEqual(['Evening']);
  });
});

describe('an event over several days', () => {
  const split = { split_multiday_events: true };

  it('is left out on every day where it starts outside the hours', () => {
    const event = timed('Conference', '2026-06-15T09:00:00Z', '2026-06-17T10:00:00Z');

    expect(kept([event], { starts_after: '16:00', ...split })).toEqual([]);
  });

  it('is kept on every day where it starts inside them, even split into days', () => {
    const event = timed('Night shift', '2026-06-15T20:00:00Z', '2026-06-17T10:00:00Z');
    const { days } = render([event], [{ entity: SHIFTS, starts_after: '16:00', ...split }]);

    expect(Object.keys(days)).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
  });

  it('is judged by its real start when it began before the card’s first day', () => {
    const event = timed('Night shift', '2026-06-14T20:00:00Z', '2026-06-16T10:00:00Z');

    expect(kept([event], { starts_after: '16:00' })).toEqual(['Night shift']);
    expect(kept([event], { starts_before: '16:00' })).toEqual([]);
  });
});

describe('a value the card cannot read', () => {
  const events = [at('09:00:00', 'Morning'), at('17:00:00', 'Evening')];

  it.each<[string, Partial<Types.EntityConfig>]>([
    ['4pm', { starts_after: '4pm' }],
    ['25:00', { starts_after: '25:00' }],
    ['an unquoted YAML time', { starts_after: 960 as unknown as string }],
    ['24:00 to start from', { starts_after: '24:00', starts_before: '20:00' }],
    ['a half that is not a time', { starts_after: '16:00', starts_before: '6am' }],
    ['equal bounds', { starts_after: '16:00', starts_before: '16:00' }],
  ])('%s keeps every event, and says so once', (_name, entry) => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    // A calendar of its own per case, so one case's report cannot stand in for another's.
    const entity = `calendar.${_name.replace(/\W+/g, '_')}`;
    const own = events.map((event) => ({ ...event, _entityId: entity }));

    for (let pass = 0; pass < 3; pass++) {
      const config = buildConfig({ entities: [{ entity, ...entry }] } as Partial<Types.Config>);
      expect(EventUtils.processEvents(own, config).map((event) => event.summary)).toEqual([
        'Morning',
        'Evening',
      ]);
    }

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(entity);
  });

  it('names the number an unquoted time became, and asks for quotes', () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const config = buildConfig({
      entities: [{ entity: 'calendar.unquoted', starts_before: 600 as unknown as string }],
    } as Partial<Types.Config>);
    EventUtils.processEvents([], config);
    EventUtils.processEvents([{ ...at('09:00:00'), _entityId: 'calendar.unquoted' }], config);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('starts_before is the number 600');
    expect(warn.mock.calls[0][0]).toContain("starts_before: '16:00'");
  });
});

describe('with filter_duplicates', () => {
  it('shows the copy of a calendar that keeps the event, where another leaves it out', () => {
    const shared = (entity: string) =>
      timed('School run', '2026-06-15T07:30:00Z', '2026-06-15T08:00:00Z', entity);
    const { days } = render(
      [shared(SHIFTS), shared(FAMILY)],
      [{ entity: SHIFTS, starts_after: '16:00' }, FAMILY],
      { filter_duplicates: true },
    );

    expect(days).toEqual({ '2026-06-15': ['School run'] });
  });
});

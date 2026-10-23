/**
 * A timed event whose end is missing or before its start.
 *
 * List printed a backwards event as "14:41 - 13:00" while Grid dropped it, and an event with
 * no end, or a `null` one, disappeared from every view with a warning only the development
 * build logs. Home Assistant's API should always send an end, so this is a guard against
 * integrations and iCal data that do not. Such an event still says when it happens, so it is
 * kept as an instant at its start, which every view already draws (#625): List and Column
 * print the start time alone and Grid draws the reminder marker.
 *
 * An all-day event has no instant to fall back on, so one whose end is missing or not after
 * its start is dropped — in every view now, where it used to depend on the view and on
 * `show_past_events`.
 *
 * Runs under `TZ=UTC`, so an ISO instant here is also the wall-clock time printed.
 */

import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/** 14:41 on `FROZEN_NOW`'s day, so later today and inside grid's default 07:00–22:00. */
const AT = '2026-06-17T14:41:00.000Z';

const VIEWS: Types.EffectiveView[] = ['list', 'column', 'grid'];

/** The shapes of a missing or backwards end, each on an event starting at `AT`. */
const BAD_ENDS: ReadonlyArray<[string, Record<string, unknown>]> = [
  ['no end at all', {}],
  ['a null end', { end: null }],
  ['an empty end', { end: {} }],
  ['an end whose dateTime is null', { end: { dateTime: null } }],
  ['an end before the start', { end: { dateTime: '2026-06-17T13:00:00.000Z' } }],
];

function badEnd(shape: Record<string, unknown>, summary = 'Backwards'): Types.CalendarEventData {
  return {
    start: { dateTime: AT },
    summary,
    _entityId: 'calendar.personal',
    ...shape,
  } as unknown as Types.CalendarEventData;
}

function renderView(
  view: Types.EffectiveView,
  events: Types.CalendarEventData[],
  overrides: Partial<Types.Config> = {},
): HTMLElement {
  const config = buildConfig({ view, days_to_show: 1, time_24h: true, ...overrides });
  const effective = ViewConfig.resolveEffectiveConfig(config, view);
  const days = EventUtils.groupEventsByDay(events, config, false, 'en', view);
  const container = document.createElement('div');
  litRender(
    view === 'grid'
      ? Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null, new Date())
      : view === 'column'
        ? Column.renderColumnGroupedEvents(days, effective, 'en', undefined, null)
        : Render.renderGroupedEvents(days, effective, 'en', undefined, null),
    container,
  );
  return container;
}

/** Titles of the events drawn, leaving out the placeholder row of an empty day. */
function titles(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.event-title:not(.empty-day-title)')].map((title) =>
    (title.textContent ?? '').trim(),
  );
}

function timeRows(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.time .time-actual')].map((row) =>
    (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function hassReturning(events: unknown[]): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async (_method: string, path: string) => (path.startsWith('calendars/') ? events : []),
  } as unknown as Types.Hass;
}

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(BAD_ENDS)('a timed event with %s', (_label, shape) => {
  it.each(VIEWS)('is drawn in %s view, at its start', (view) => {
    const container = renderView(view, [badEnd(shape)]);

    expect(titles(container)).toEqual(['Backwards']);
    if (view === 'grid') {
      // A marker too short to reveal a time row, like any reminder; its time is in the
      // block's accessible name.
      expect(container.querySelectorAll('.grid-event:not(.grid-event-overflow)')).toHaveLength(1);
      expect(
        container.querySelector('.grid-event-accessible')?.getAttribute('aria-label'),
      ).toContain('14:41');
    } else {
      expect(timeRows(container)).toEqual(['14:41']);
    }
  });

  it('comes out of fetch processing as an instant, and leaves the original alone', async () => {
    const raw = badEnd(shape);
    const before = JSON.stringify(raw);
    const config = buildConfig({ entities: ['calendar.one'] });
    const result = await EventUtils.fetchEventData(
      hassReturning([raw]),
      config,
      `bad-end-${_label}`,
    );

    expect(result.events.map((event) => [event.summary, event.end])).toEqual([
      ['Backwards', { dateTime: AT }],
    ]);
    // The original object is also the cache's, and other cards read it.
    expect(JSON.stringify(raw)).toBe(before);
  });
});

describe('ends that are not repaired', () => {
  it.each([
    ['an unparseable end', { end: { dateTime: 'soon' } }],
    ['a date end on a timed start', { end: { date: '2026-06-18' } }],
    ['an end that is not an object', { end: '2026-06-17T15:00:00.000Z' }],
  ])('drops %s, in every view', (_label, shape) => {
    for (const view of VIEWS) {
      expect(titles(renderView(view, [badEnd(shape)])), view).toEqual([]);
    }
  });

  it('keeps a DST fall-back event whose wall clock only looks backwards', () => {
    // 02:30 summer time to 02:15 winter time: the second reading is 45 minutes later.
    const event = {
      start: { dateTime: '2026-10-25T02:30:00+02:00' },
      end: { dateTime: '2026-10-25T02:15:00+01:00' },
      summary: 'Night shift handover',
      _entityId: 'calendar.personal',
    };
    const days = EventUtils.groupEventsByDay(
      [event],
      buildConfig({ start_date: '2026-10-25', days_to_show: 1 }),
      false,
      'en',
      'list',
    );

    expect(days.flatMap((day) => day.events).map((kept) => kept.end)).toEqual([event.end]);
  });

  it('leaves a well-formed event exactly as it was', () => {
    const event = {
      start: { dateTime: AT },
      end: { dateTime: '2026-06-17T15:30:00.000Z' },
      summary: 'Dentist',
      _entityId: 'calendar.personal',
    };
    const container = renderView('list', [event]);

    expect(timeRows(container)).toEqual(['14:41 - 15:30']);
  });
});

describe('an all-day event whose end is not after its start', () => {
  const ALL_DAY: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['an end before the start', { end: { date: '2026-06-16' } }],
    ['an end on the start', { end: { date: '2026-06-17' } }],
    ['no end', {}],
  ];

  it.each(ALL_DAY)('drops %s in every view, finished events shown or not', (_label, shape) => {
    const event = {
      start: { date: '2026-06-17' },
      summary: 'Reversed day',
      _entityId: 'calendar.personal',
      ...shape,
    } as unknown as Types.CalendarEventData;

    for (const view of VIEWS) {
      for (const show_past_events of [true, false]) {
        const container = renderView(view, [event], {
          show_past_events,
          time_grid: { show_past_events },
          column: { show_past_events },
        } as Partial<Types.Config>);
        expect(container.textContent, `${view}, past events ${show_past_events}`).not.toContain(
          'Reversed day',
        );
      }
    }
  });

  it('keeps a one-day all-day event, the control', () => {
    const event = {
      start: { date: '2026-06-17' },
      end: { date: '2026-06-18' },
      summary: 'School holiday',
      _entityId: 'calendar.personal',
    };
    for (const view of VIEWS) {
      expect(renderView(view, [event]).textContent, view).toContain('School holiday');
    }
  });
});

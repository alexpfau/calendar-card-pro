/**
 * One malformed event from one calendar must not take the whole card down.
 *
 * The processing pipeline dereferences `event.start` and `event.end` unguarded in about a
 * dozen places — deduplication, day grouping, multi-day splitting, sorting. Every one of
 * them assumes Home Assistant supplied both. A single event missing `end` therefore does
 * not degrade that event, it throws, and the card renders nothing at all: the perfectly
 * good events from the same calendar, and from every other configured calendar, disappear
 * with it.
 *
 * That payload comes from whichever integration backs the calendar entity — CalDAV, ICS,
 * Google, or any of the third-party ones — so the card cannot assume it is well formed.
 *
 * Under the default configuration the event happened to fall out of the time-window filter
 * before anything dereferenced it, so this only ever surfaced for users who had turned
 * `filter_duplicates` on: deduplication reads `start.dateTime` and `end.dateTime` on every
 * event before any filtering runs. That is why the deduplicating cases below are the ones
 * that matter, and why asserting on default config alone would have proved nothing.
 *
 * The controls are all-valid payloads, which pin the filter to malformed input only: a
 * filter that is too eager would silently drop real events, and this suite would be the
 * only thing standing between that and a card that quietly shows less than it should.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';

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

const VALID = {
  summary: 'Complete event',
  start: { dateTime: '2026-06-17T11:00:00Z' },
  end: { dateTime: '2026-06-17T12:00:00Z' },
};

const SECOND_VALID = {
  summary: 'Second complete event',
  start: { dateTime: '2026-06-17T13:00:00Z' },
  end: { dateTime: '2026-06-17T14:00:00Z' },
};

/** Events exactly as a misbehaving integration might hand them over. */
const NO_END = {
  summary: 'Event with no end',
  start: { dateTime: '2026-06-17T15:00:00Z' },
};

const NO_START = {
  summary: 'Event with no start',
  end: { dateTime: '2026-06-17T16:00:00Z' },
};

function hassReturning(events: unknown[]): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async (_method: string, path: string) => (path.startsWith('calendars/') ? events : []),
  } as unknown as Types.Hass;
}

async function summariesFor(
  events: unknown[],
  instanceId: string,
  extra: Record<string, unknown> = {},
): Promise<string[]> {
  const config = buildConfig({ entities: ['calendar.one'], ...extra }) as Types.Config;
  const result = await fetchEventData(hassReturning(events), config, instanceId);
  const days = groupEventsByDay(result.events, config, false, 'en');
  return days.flatMap((day) => day.events.map((event) => event.summary ?? ''));
}

describe('malformed calendar payloads', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('control: two well-formed events both survive the default pipeline', async () => {
    const summaries = await summariesFor([VALID, SECOND_VALID], 'control-default');

    expect(summaries).toEqual(['Complete event', 'Second complete event']);
  });

  it('control: two well-formed events both survive deduplication', async () => {
    const summaries = await summariesFor([VALID, SECOND_VALID], 'control-dedup', {
      filter_duplicates: true,
    });

    expect(summaries).toEqual(['Complete event', 'Second complete event']);
  });

  it('drops an event with no end without losing the valid event beside it', async () => {
    const summaries = await summariesFor([VALID, NO_END], 'defect-end', {
      filter_duplicates: true,
    });

    expect(summaries).toEqual(['Complete event']);
  });

  it('groups a malformed payload handed straight to the renderer', () => {
    // Not the same guard as the fetch path: `groupEventsByDay` deduplicates whatever it is
    // given before any of the fetch-side filtering has run, so it has to defend itself.
    const config = buildConfig({
      entities: ['calendar.one'],
      filter_duplicates: true,
    }) as Types.Config;

    const days = groupEventsByDay(
      [VALID, NO_END] as unknown as Types.CalendarEventData[],
      config,
      false,
      'en',
    );

    expect(days.flatMap((day) => day.events.map((event) => event.summary))).toEqual([
      'Complete event',
    ]);
  });

  it('drops an event with no start without losing the valid event beside it', async () => {
    const summaries = await summariesFor([VALID, NO_START], 'defect-start', {
      filter_duplicates: true,
    });

    expect(summaries).toEqual(['Complete event']);
  });
});

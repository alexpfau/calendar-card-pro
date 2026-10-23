/**
 * One malformed event from one calendar must not take the whole card down.
 *
 * Downstream date and text operations rely on validated input. Both fetch processing and
 * grouping guard their entry points so an unusable record cannot crash valid neighbors.
 *
 * That payload comes from whichever integration backs the calendar entity — CalDAV, ICS,
 * Google, or any of the third-party ones — so the card cannot assume it is well formed.
 *
 * The original missing-end failure was exposed by duplicate comparison before date
 * filtering. Keep both deduplicating and ordinary cases covered as pipeline ordering changes.
 *
 * The controls are all-valid payloads, which pin the filter to malformed input only: a
 * filter that is too eager would silently drop real events, and this suite would be the
 * only thing standing between that and a card that quietly shows less than it should.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { fetchEventData, groupEventsByDay } from '../src/utils/events';
import * as Logger from '../src/utils/logger';

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
  const days = groupEventsByDay(result.events, config, false, 'en', config.view);
  return days.flatMap((day) =>
    day.events.filter((event) => !event._isEmptyDay).map((event) => event.summary ?? ''),
  );
}

describe('malformed calendar payloads', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    // Independent of the fetch path: grouping must validate inputs before deriving
    // occurrences, even when no fetch-side processing ran.
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

  describe.each(['list', 'column', 'grid'] as const)('fields in %s', (view) => {
    it.each([
      ['numeric all-day start', { start: { date: 20260617 }, end: { date: '2026-06-18' } }],
      ['numeric all-day end', { start: { date: '2026-06-17' }, end: { date: 20260618 } }],
      ['array all-day start', { start: { date: ['2026-06-17'] }, end: { date: '2026-06-18' } }],
      ['impossible all-day date', { start: { date: '2026-06-31' }, end: { date: '2026-07-03' } }],
      [
        'all-day date with trailing text',
        { start: { date: '2026-06-17-extra' }, end: { date: '2026-06-18' } },
      ],
      ['unparseable timed end', { ...SECOND_VALID, end: { dateTime: 'not-a-date' } }],
      ['object summary', { ...VALID, summary: { text: 'Malformed' } }],
      ['numeric summary', { ...VALID, summary: 123 }],
      ['object location', { ...SECOND_VALID, location: { text: 'Room' } }],
      ['array description', { ...SECOND_VALID, description: ['Not a string'] }],
    ])('isolates a %s instead of losing the valid neighboring event', async (name, malformed) => {
      const warning = vi.spyOn(Logger, 'warn');
      const summaries = await summariesFor([VALID, malformed], `malformed-${name}`, {
        view,
        show_description: true,
        filter_duplicates: true,
        remove_location_country: true,
        days_to_show: 20,
      });

      expect(summaries).toEqual(['Complete event']);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring 1 malformed calendar event'),
      );
    });
  });

  it('control: absent and null optional text still renders an otherwise valid event', async () => {
    const summaries = await summariesFor(
      [
        VALID,
        {
          ...SECOND_VALID,
          summary: null,
          location: null,
          description: null,
        },
      ],
      'null-optional-text',
      { show_description: true, filter_duplicates: true },
    );

    expect(summaries).toEqual(['Complete event', '']);
  });
});

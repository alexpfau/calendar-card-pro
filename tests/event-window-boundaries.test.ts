/**
 * The three date comparisons that decide whether an event is inside the card's window.
 *
 * Each is an inequality one character away from a different card. Every one of them is
 * hit by ordinary data rather than by an edge case someone has to construct: all-day
 * events start at exactly midnight, so they land exactly on the window's exclusive upper
 * bound, and a shift that runs 22:00 -> 00:00 ends at exactly the lower bound. Flipping
 * `<` to `<=` or `>=` to `>` at any of the three changed what the card rendered while
 * the whole suite stayed green, so none of them was pinned anywhere.
 *
 * The bounds are *half-open*: the lower bound includes its instant, the upper bound
 * excludes it. That asymmetry is the whole point, and it is why each test below pairs
 * the boundary instant with its neighbour on the other side -- an assertion that an
 * event is absent proves nothing on its own, because a card rendering nothing at all
 * would satisfy it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as EventUtils from '../src/utils/events';
import * as FormatUtils from '../src/utils/format';

const ENTITY = 'calendar.personal';

/** Local midnight `offset` days from the frozen clock, so no test hardcodes a zone. */
function midnight(offset: number): Date {
  const d = new Date(FROZEN_NOW);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

const dateKey = (d: Date) => FormatUtils.getLocalDateKey(d);

/** happy-dom's `localStorage` has no usable `clear()`, so the cache needs its own. */
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

function hassReturning(events: unknown[]): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: () => Promise.resolve(events),
  } as unknown as Types.Hass;
}

const allDay = (summary: string, from: number, to: number) => ({
  summary,
  start: { date: dateKey(midnight(from)) },
  end: { date: dateKey(midnight(to)) },
  _entityId: ENTITY,
});

describe('event window boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => vi.useRealTimers());

  it('excludes an all-day event starting on the exclusive upper bound of the fetch window', async () => {
    // `days_to_show: 3` covers days 0, 1 and 2; the window's upper bound is midnight on
    // day 3. An all-day event on day 3 starts at exactly that instant. Accepting it
    // would hand the card a fourth day of events it was never asked to show.
    const hass = hassReturning([allDay('inside', 2, 3), allDay('on-bound', 3, 4)]);

    const result = await EventUtils.fetchEventData(
      hass,
      buildConfig({ days_to_show: 3 }),
      'boundary-upper',
      true,
    );

    expect(result.events.map((event) => event.summary)).toEqual(['inside']);
  });

  it('excludes a multi-day segment that starts on the exclusive upper bound', () => {
    // `days_to_show` is a `.slice()` over days that *have* events, not a date range, so
    // a sparse card leaves room for out-of-window days to be drawn rather than trimmed.
    // Day 0 is occupied and days 1-3 are empty, so the six slots are nowhere near full
    // when the multi-day event's segments arrive.
    const config = buildConfig({ days_to_show: 6, split_multiday_events: true });
    const events = [allDay('anchor', 0, 1), allDay('span', 4, 10)] as never;

    const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'list');

    expect(days.map((day) => dateKey(new Date(day.timestamp)))).toEqual([
      dateKey(midnight(0)),
      dateKey(midnight(4)),
      dateKey(midnight(5)),
    ]);
  });

  it('keeps an event that ends exactly at the start of the reference day', () => {
    // A 22:00 -> 00:00 shift ends at exactly the lower bound. The bound is inclusive, so
    // the shift still belongs to the card; treating it as strictly past deleted it.
    const config = buildConfig({ show_past_events: true, days_to_show: 3 });
    const start = new Date(midnight(-1));
    start.setHours(22, 0, 0, 0);
    const events = [
      {
        summary: 'ends-at-midnight',
        start: { dateTime: start.toISOString() },
        end: { dateTime: midnight(0).toISOString() },
        _entityId: ENTITY,
      },
    ] as never;

    const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'list');

    expect(days.map((day) => day.events.map((event) => event.summary))).toEqual([
      ['ends-at-midnight'],
    ]);
  });

  it('control: drops an event that ends one millisecond before the reference day', () => {
    // The neighbour on the other side of the same bound. Without this the test above
    // would pass just as happily against a card that had stopped filtering at all.
    const config = buildConfig({ show_past_events: true, days_to_show: 3 });
    const start = new Date(midnight(-1));
    start.setHours(22, 0, 0, 0);
    const end = new Date(midnight(0).getTime() - 1);
    const events = [
      {
        summary: 'ends-just-before-midnight',
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        _entityId: ENTITY,
      },
    ] as never;

    const days = EventUtils.groupEventsByDay(events, config, false, 'en', 'list');

    expect(days.flatMap((day) => day.events.map((event) => event.summary))).not.toContain(
      'ends-just-before-midnight',
    );
  });
});

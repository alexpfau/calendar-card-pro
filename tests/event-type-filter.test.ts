/**
 * `event_type` decides which class of event a calendar contributes: all of them, only
 * those with a clock time, or only all-day ones.
 *
 * The option exists to be a **discriminator**, not a visibility toggle. The request behind
 * it (#132) was to give all-day events a different colour from timed ones on a single
 * calendar, which is only reachable by listing that calendar twice and splitting it
 * between the two blocks. That makes two properties load-bearing, and neither is implied
 * by the other:
 *
 * - `timed` and `all_day` must be exact complements, or the split loses or duplicates
 *   events.
 * - Each block must be filtered *and coloured* independently, or both copies come out the
 *   same colour and the whole pattern is pointless. That half is not this option's code at
 *   all — it is `_matchedConfig` — so it is asserted here rather than assumed, because a
 *   regression there would leave every test below green while the feature was useless.
 *
 * The option names an axis, not a duration. A 23:30–00:30 dinner is `timed` however many
 * calendar dates it touches, and a one-day holiday is `all_day`; how long an event lasts
 * is a separate question this key deliberately does not answer.
 *
 * The suite is built from `DEFAULT_CONFIG`, where `event_type` is `all` and therefore
 * renders exactly what it rendered before. Every case here sets it deliberately; without
 * that this option would be invisible to the whole suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import {
  fetchEventData,
  getEntityAccentColorWithOpacity,
  groupEventsByDay,
} from '../src/utils/events';

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

/** A timed event. The clock time is the whole distinction being tested. */
function timed(summary: string, hour: number) {
  return {
    summary,
    start: { dateTime: `2026-06-17T${String(hour).padStart(2, '0')}:00:00Z` },
    end: { dateTime: `2026-06-17T${String(hour + 1).padStart(2, '0')}:00:00Z` },
  };
}

/** An all-day event, which Home Assistant returns with `date` and no `dateTime`. */
function allDay(summary: string, day = 17) {
  return {
    summary,
    start: { date: `2026-06-${String(day).padStart(2, '0')}` },
    end: { date: `2026-06-${String(day + 1).padStart(2, '0')}` },
  };
}

const STANDUP = timed('Standup', 9);
const REVIEW = timed('Review', 13);
const BIRTHDAY = allDay('Birthday');
const HOLIDAY = allDay('Holiday', 18);

/** Deliberately interleaved, so nothing passes by virtue of the payload's order. */
const ALL = [STANDUP, BIRTHDAY, REVIEW, HOLIDAY];

function hassReturning(events: unknown[]): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async (_method: string, path: string) => (path.startsWith('calendars/') ? events : []),
  } as unknown as Types.Hass;
}

let instance = 0;

/** Every event the card would draw, in order, for one payload and one configuration. */
async function drawn(
  events: unknown[],
  overrides: Partial<Types.Config>,
): Promise<Types.CalendarEventData[]> {
  const config = buildConfig(overrides) as Types.Config;
  const result = await fetchEventData(hassReturning(events), config, `all-day-${instance++}`);

  return groupEventsByDay(result.events, config, false, 'en')
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay);
}

/** Titles the card would draw, in order. */
async function shown(events: unknown[], overrides: Partial<Types.Config>): Promise<string[]> {
  return (await drawn(events, overrides)).map((event) => event.summary || '(untitled)');
}

describe('event_type', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps everything, only all-day, or only timed events at card level', async () => {
    // Three arms against one payload. The unfiltered arm pins what "everything" looks
    // like, and each of the other two must differ from it in exactly one direction — so a
    // filter that has stopped discriminating fails whichever way it broke, including the
    // damaging way round where it drops everything.
    //
    // The entity is written as a bare id because that is the configuration most users
    // have. Note that this does *not* exercise the filter's `typeof entityConfig ===
    // 'string'` branch: normalization rewrites every bare id into an object long before
    // events are processed, so that branch is unreachable from a card — restoring an early
    // return in front of the all-day filter leaves this whole file green.
    await expect(
      Promise.all([
        shown(ALL, { entities: ['calendar.one'] }),
        shown(ALL, { entities: ['calendar.one'], event_type: 'all_day' }),
        shown(ALL, { entities: ['calendar.one'], event_type: 'timed' }),
      ]),
    ).resolves.toEqual([
      ['Birthday', 'Standup', 'Review', 'Holiday'],
      ['Birthday', 'Holiday'],
      ['Standup', 'Review'],
    ]);
  });

  it('partitions the calendar exactly, losing and duplicating nothing', async () => {
    // The property the two-block pattern rests on, asserted as a property rather than
    // inferred from the case above. `only` and `hide` have to be complements over the
    // *same* payload: an event that is neither, or that is both, breaks the split in a way
    // no single-arm assertion would notice.
    const [everything, allDayOnly, timedOnly] = await Promise.all([
      shown(ALL, { entities: ['calendar.one'] }),
      shown(ALL, { entities: ['calendar.one'], event_type: 'all_day' }),
      shown(ALL, { entities: ['calendar.one'], event_type: 'timed' }),
    ]);

    expect([...allDayOnly, ...timedOnly].sort()).toEqual([...everything].sort());
    expect(allDayOnly.filter((title) => timedOnly.includes(title))).toEqual([]);
  });

  it('gives one calendar two colours when it is listed twice, once each way', async () => {
    // 🚨 The actual request in #132, and the reason this option is a discriminator rather
    // than a filter. The reporter wants all-day events in one colour and timed events in
    // another *on a single calendar*, which is unreachable with one block however the
    // filter behaves.
    //
    // The colour half is the part that could regress silently. `getEntityAccentColorWithOpacity`
    // prefers the per-event `_matchedConfig` stamp and falls back to `config.entities.find()`,
    // which returns the **first** block matching the entity id — so if the stamp were ever
    // dropped, both copies would resolve to grey, every filtering test above would stay
    // green, and the feature would be silently worthless. Asserting the title alone would
    // not see it.
    const config = buildConfig({
      entities: [
        { entity: 'calendar.family', event_type: 'all_day', accent_color: '#808080' },
        { entity: 'calendar.family', event_type: 'timed', accent_color: '#0000ff' },
      ],
    } as Partial<Types.Config>) as Types.Config;

    const result = await fetchEventData(hassReturning(ALL), config, `all-day-${instance++}`);
    const events = groupEventsByDay(result.events, config, false, 'en')
      .flatMap((day) => day.events)
      .filter((event) => !event._isEmptyDay);

    expect(
      events.map((event) => [
        event.summary,
        getEntityAccentColorWithOpacity(event._entityId, config, undefined, event),
      ]),
    ).toEqual([
      ['Birthday', '#808080'],
      ['Standup', '#0000ff'],
      ['Review', '#0000ff'],
      ['Holiday', '#808080'],
    ]);
  });

  it('lets a calendar depart from the card in either direction', async () => {
    // Both directions, because they fail differently. A per-entity value ignored against a
    // permissive card shows too much; ignored against a restrictive card it shows too
    // little, and `all` is the only way back from a card-level filter — without it a
    // calendar could never opt out of the card's choice.
    await expect(
      Promise.all([
        shown(ALL, { entities: [{ entity: 'calendar.one', event_type: 'all_day' }] }),
        shown(ALL, {
          entities: [{ entity: 'calendar.one', event_type: 'all' }],
          event_type: 'timed',
        }),
        shown(ALL, {
          entities: [{ entity: 'calendar.one', event_type: 'timed' }],
          event_type: 'all_day',
        }),
      ] as Array<Promise<string[]>>),
    ).resolves.toEqual([
      ['Birthday', 'Holiday'],
      ['Birthday', 'Standup', 'Review', 'Holiday'],
      ['Standup', 'Review'],
    ]);
  });

  it('shows every event when the value is not one it recognises', async () => {
    // Fail open, for the same reason the title filters do: a typo, or a value from a newer
    // version of the card, costs the user an unfiltered calendar rather than an empty one.
    // An empty card reads as the integration having broken; too many events reads as the
    // option not having applied, which is what actually happened.
    await expect(
      Promise.all([
        shown(ALL, {
          entities: ['calendar.one'],
          event_type: 'nonsense',
        } as unknown as Partial<Types.Config>),
        shown(ALL, {
          entities: [{ entity: 'calendar.one', event_type: 'nonsense' }],
        } as unknown as Partial<Types.Config>),
      ]),
    ).resolves.toEqual([
      ['Birthday', 'Standup', 'Review', 'Holiday'],
      ['Birthday', 'Standup', 'Review', 'Holiday'],
    ]);
  });

  it('narrows further when a title filter is set on the same calendar', async () => {
    // The two filters are independent and must compose. Written as an intersection rather
    // than as either one alone: an implementation that let the title filter replace the
    // all-day filter, or that applied the all-day filter to a set the allowlist had
    // already emptied, would pass a test that only ever set one of them.
    await expect(
      Promise.all([
        shown(ALL, {
          entities: [{ entity: 'calendar.one', event_type: 'all_day', allowlist: 'Holiday' }],
        }),
        shown(ALL, {
          entities: [{ entity: 'calendar.one', event_type: 'timed', blocklist: 'Standup' }],
        }),
      ]),
    ).resolves.toEqual([['Holiday'], ['Review']]);
  });
});

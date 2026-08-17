/**
 * `allowlist` and `blocklist` decide which events a calendar contributes at all, and
 * nothing exercised them. The three suites that mention the options by name are about
 * something else: two cover the editor's own schema and search box, and the third uses
 * them only as sample values in a change-detection table, so none of them ever runs the
 * filter. A change that inverted either one, or that quietly stopped filtering, would have
 * left the suite green while the card showed the wrong calendar — either leaking the
 * private events someone deliberately excluded, or hiding almost everything they own.
 *
 * Each case carries both directions: something that must survive the filter and something
 * that must not. A suite that only asserted the drop would pass against a filter that
 * dropped everything, which is the more damaging of the two failures.
 *
 * Every case here is the only thing standing between some specific regression and a green
 * run; cases that duplicated another's coverage were folded into the first test rather
 * than kept. Two behaviours were deliberately left unpinned. Whether a permissive pattern
 * such as `.*` should also admit an event with no title is undocumented either way, so a
 * test would freeze an accident rather than a decision. And the `typeof entityConfig ===
 * 'string'` branch of the filter cannot be reached from a card at all, because config
 * normalization has already rewritten every bare entity id into an object by the time
 * events are processed.
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

/** One event per hour, so the window keeps them all and only the filter can remove any. */
function event(summary: string, hour: number) {
  return {
    summary,
    start: { dateTime: `2026-06-17T${String(hour).padStart(2, '0')}:00:00Z` },
    end: { dateTime: `2026-06-17T${String(hour + 1).padStart(2, '0')}:00:00Z` },
  };
}

const BIRTHDAY = event('Birthday party', 9);
const STANDUP = event('Standup', 11);
const PRIVATE = event('Private appointment', 13);
const ALL = [BIRTHDAY, STANDUP, PRIVATE];

function hassReturning(events: unknown[]): Types.Hass {
  return {
    states: {},
    callService: () => {},
    locale: { language: 'en' },
    callApi: async (_method: string, path: string) => (path.startsWith('calendars/') ? events : []),
  } as unknown as Types.Hass;
}

let instance = 0;

/** Titles the card would draw, in order, for one payload and one set of entity blocks. */
async function shown(events: unknown[], entities: unknown[]): Promise<string[]> {
  const config = buildConfig({ entities } as Partial<Types.Config>) as Types.Config;
  const result = await fetchEventData(hassReturning(events), config, `filters-${instance++}`);
  return groupEventsByDay(result.events, config, false, 'en')
    .flatMap((day) => day.events)
    .filter((event) => !event._isEmptyDay)
    .map((event) => event.summary || '(untitled)');
}

describe('per-calendar allowlist and blocklist', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps what an allowlist names, drops what a blocklist names, whatever the case', () => {
    // Three arms against one payload, so a filter that has stopped discriminating fails
    // whichever way it broke: the unfiltered calendar pins what "everything" looks like,
    // and the other two must each differ from it in one direction only.
    //
    // Both patterns are lowercase against capitalised titles. Users type these by hand,
    // against titles they do not control, and a case-sensitive blocklist is the costly
    // half — it silently leaks the events someone deliberately excluded while looking
    // like the pattern simply was not applied.
    return expect(
      Promise.all([
        shown(ALL, ['calendar.one']),
        shown(ALL, [{ entity: 'calendar.one', allowlist: 'birthday' }]),
        shown(ALL, [{ entity: 'calendar.one', blocklist: 'private' }]),
      ]),
    ).resolves.toEqual([
      ['Birthday party', 'Standup', 'Private appointment'],
      ['Birthday party'],
      ['Birthday party', 'Standup'],
    ]);
  });

  it('separates alternatives on a pipe, not a comma', () => {
    // The documented separator, and previously the subject of a documentation fix: these
    // are regular expressions, so a comma is not special and `a,b` would only ever match
    // the literal text "a,b". Escaping the pattern to make user input "safe" would break
    // this while leaving every single-word pattern working.
    return expect(
      shown(ALL, [{ entity: 'calendar.one', allowlist: 'Birthday|Standup' }]),
    ).resolves.toEqual(['Birthday party', 'Standup']);
  });

  it('lets the allowlist win when a calendar carries both', () => {
    // Documented: "When both are specified, allowlist takes precedence." Evaluate both and
    // this returns nothing, because the one title the allowlist admits is also blocked.
    return expect(
      shown(ALL, [{ entity: 'calendar.one', allowlist: 'Birthday', blocklist: 'Birthday' }]),
    ).resolves.toEqual(['Birthday party']);
  });

  it('keeps showing the calendar when either pattern will not compile', () => {
    // A half-typed pattern in the editor is an ordinary intermediate state. Failing open
    // costs the user a moment of unfiltered events; failing closed empties their card and
    // reads as the integration having broken.
    return expect(
      Promise.all([
        shown([BIRTHDAY, STANDUP], [{ entity: 'calendar.one', allowlist: '(' }]),
        shown([BIRTHDAY, STANDUP], [{ entity: 'calendar.one', blocklist: '(' }]),
      ]),
    ).resolves.toEqual([
      ['Birthday party', 'Standup'],
      ['Birthday party', 'Standup'],
    ]);
  });

  it('filters each block separately when one calendar is listed twice', () => {
    // Listing the same calendar under two filters is how people split one busy calendar
    // into sections. These once shared a single pass, so the second block's pattern was
    // applied to what the first had already removed and one section came out empty.
    return expect(
      shown(ALL, [
        { entity: 'calendar.one', allowlist: 'Birthday' },
        { entity: 'calendar.one', allowlist: 'Standup' },
      ]),
    ).resolves.toEqual(['Birthday party', 'Standup']);
  });
});

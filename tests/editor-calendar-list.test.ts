/**
 * The calendar list's algebra (`calendar-list.ts`): grouping, the calendar-level moves,
 * Duplicate, Remove, Add and re-pointing, and the row-summary words.
 *
 * The operations rewrite `entities`, so the claim that matters is what the card then draws.
 * Moving calendars across each other is invisible to it, and AGENTS.md says why. The order of
 * one calendar's entries is not: with Filter Duplicates on, the first entry's copy of an event
 * they both keep is the one drawn. So the invariance cases at the end run the card's own
 * `processEvents` and `groupEventsByDay`, render the row, and read the winner and its drawn
 * color, rather than reading the order of the keys written; and a planted reversal of one
 * calendar's entries shows those cases can fail.
 */
import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FROZEN_NOW, buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as List from '../src/rendering/editor/calendar-list';
import { entityIdOf } from '../src/rendering/editor/synthetic';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

type Entry = string | Types.EntityConfig;

const RED = '#e53935';
const BLUE = '#1e88e5';
const GREEN = '#43a047';

/** A list keyed 1, 2, 3 … in stored order. */
function state(entities: Entry[]): List.ListState {
  return { entities, keys: entities.map((_, index) => index + 1) };
}

function ids(list: List.ListState): string[] {
  return list.entities.map(entityIdOf);
}

/** Each calendar's keys, in list order. */
function keysByCalendar(list: List.ListState): Map<string, number[]> {
  const byCalendar = new Map<string, number[]>();
  list.entities.forEach((entry, index) => {
    const id = entityIdOf(entry);
    byCalendar.set(id, [...(byCalendar.get(id) ?? []), list.keys[index]]);
  });
  return byCalendar;
}

/** Whether each calendar's entries sit together. */
function isGrouped(list: List.ListState): boolean {
  const seen = new Set<string>();
  return ids(list).every((id, index, all) => {
    if (index > 0 && all[index - 1] === id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Asserts that every calendar keeps its entries in their relative order: the keys of each
 * calendar that survive the operation appear in the order they had before it.
 */
function expectRelativeOrderKept(before: List.ListState, after: List.ListState): void {
  const earlier = keysByCalendar(before);
  for (const [id, keys] of keysByCalendar(after)) {
    const rank = new Map((earlier.get(id) ?? []).map((key, at) => [key, at]));
    const ranks = keys.filter((key) => rank.has(key)).map((key) => rank.get(key)!);
    expect(ranks, `entries of ${id} reordered`).toEqual([...ranks].sort((a, b) => a - b));
  }
}

// Anna listed twice, apart, as hand-written YAML can hold her.
const ANNA_RED: Types.EntityConfig = { entity: 'calendar.anna', name: 'Anna', label: '🎒' };
const ANNA_BLUE: Types.EntityConfig = { entity: 'calendar.anna', blocklist: 'Soccer' };
const SCATTERED = state([ANNA_RED, 'calendar.ben', ANNA_BLUE, 'calendar.leo']);

describe('groups', () => {
  it('lists calendars in first-occurrence order, each with its entries in order', () => {
    expect(List.groups(SCATTERED)).toEqual([
      {
        entityId: 'calendar.anna',
        rows: [
          { index: 0, key: 1, position: 1, total: 2 },
          { index: 2, key: 3, position: 2, total: 2 },
        ],
      },
      { entityId: 'calendar.ben', rows: [{ index: 1, key: 2, position: 1, total: 1 }] },
      { entityId: 'calendar.leo', rows: [{ index: 3, key: 4, position: 1, total: 1 }] },
    ]);
  });

  it('is empty for an empty list', () => {
    expect(List.groups(state([]))).toEqual([]);
  });
});

describe('moveCalendar', () => {
  it('moves a whole calendar, its entries together, and writes the list grouped', () => {
    const moved = List.moveCalendar(SCATTERED, 'calendar.anna', 1);

    expect(ids(moved)).toEqual(['calendar.ben', 'calendar.anna', 'calendar.anna', 'calendar.leo']);
    expect(moved.keys).toEqual([2, 1, 3, 4]);
    expect(moved.entities[1]).toBe(ANNA_RED);
    expect(moved.entities[2]).toBe(ANNA_BLUE);
  });

  it('moves up, down and to the top as one place less, one more, and zero', () => {
    const grouped = List.moveCalendar(SCATTERED, 'calendar.anna', 0);
    const place = (list: List.ListState, id: string) =>
      List.groups(list).findIndex((group) => group.entityId === id);

    const up = List.moveCalendar(grouped, 'calendar.leo', place(grouped, 'calendar.leo') - 1);
    expect(List.groups(up).map((group) => group.entityId)).toEqual([
      'calendar.anna',
      'calendar.leo',
      'calendar.ben',
    ]);

    const down = List.moveCalendar(grouped, 'calendar.anna', place(grouped, 'calendar.anna') + 1);
    expect(ids(down)).toEqual(['calendar.ben', 'calendar.anna', 'calendar.anna', 'calendar.leo']);

    const top = List.moveCalendar(grouped, 'calendar.leo', 0);
    expect(ids(top)).toEqual(['calendar.leo', 'calendar.anna', 'calendar.anna', 'calendar.ben']);
    expect(top.keys).toEqual([4, 1, 3, 2]);
  });

  it('clamps a place past either end', () => {
    expect(ids(List.moveCalendar(SCATTERED, 'calendar.leo', -3))[0]).toBe('calendar.leo');
    expect(ids(List.moveCalendar(SCATTERED, 'calendar.anna', 99)).slice(-2)).toEqual([
      'calendar.anna',
      'calendar.anna',
    ]);
  });

  it('only groups the list for a calendar it does not hold', () => {
    expect(ids(List.moveCalendar(SCATTERED, 'calendar.nobody', 0))).toEqual([
      'calendar.anna',
      'calendar.anna',
      'calendar.ben',
      'calendar.leo',
    ]);
  });
});

describe('duplicateEntry', () => {
  it('lands the copy right after the original, inside its calendar, with the new key', () => {
    const copied = List.duplicateEntry(SCATTERED, 0, 9);

    expect(ids(copied)).toEqual([
      'calendar.anna',
      'calendar.anna',
      'calendar.anna',
      'calendar.ben',
      'calendar.leo',
    ]);
    expect(copied.keys).toEqual([1, 9, 3, 2, 4]);
    expect(copied.entities[1]).toEqual(ANNA_RED);
    expect(copied.entities[1]).not.toBe(ANNA_RED);
  });

  it('lands after the last entry when that is the one duplicated', () => {
    expect(List.duplicateEntry(SCATTERED, 2, 9).keys).toEqual([1, 3, 9, 2, 4]);
  });

  it('copies a bare id as a bare id', () => {
    const copied = List.duplicateEntry(SCATTERED, 1, 9);
    expect(copied.entities.slice(2, 4)).toEqual(['calendar.ben', 'calendar.ben']);
    expect(copied.keys).toEqual([1, 3, 2, 9, 4]);
  });
});

describe('removeEntry and removeCalendar', () => {
  it('removes one entry with its key, its calendar keeping the shared name', () => {
    const removed = List.removeEntry(SCATTERED, 0);

    expect(ids(removed)).toEqual(['calendar.ben', 'calendar.anna', 'calendar.leo']);
    expect(removed.keys).toEqual([2, 3, 4]);
    expect(removed.entities[1]).toEqual({ ...ANNA_BLUE, name: 'Anna' });
  });

  it('removes every entry of a calendar', () => {
    const removed = List.removeCalendar(SCATTERED, 'calendar.anna');

    expect(removed).toEqual({ entities: ['calendar.ben', 'calendar.leo'], keys: [2, 4] });
  });
});

describe('addCalendar', () => {
  it('appends a new calendar as its bare id, with the new key', () => {
    const added = List.addCalendar(SCATTERED, 'calendar.bin_day', 9);

    expect(ids(added)).toEqual([
      'calendar.anna',
      'calendar.anna',
      'calendar.ben',
      'calendar.leo',
      'calendar.bin_day',
    ]);
    expect(added.entities[4]).toBe('calendar.bin_day');
    expect(added.keys[added.keys.length - 1]).toBe(9);
  });

  it('joins the end of a calendar the card already shows', () => {
    expect(List.addCalendar(SCATTERED, 'calendar.anna', 9).keys).toEqual([1, 3, 9, 2, 4]);
  });
});

describe('repointEntry', () => {
  const FAMILY_FIRST: Types.EntityConfig = {
    entity: 'calendar.family',
    name: 'Family',
    accent_color: RED,
  };
  const FAMILY_SECOND: Types.EntityConfig = { entity: 'calendar.family', accent_color: BLUE };
  const BEN: Types.EntityConfig = {
    entity: 'calendar.ben',
    name: 'Ben',
    show_in_legend: false,
    accent_color: GREEN,
    allowlist: 'School',
  };

  it("joins the end of the target's entries and adopts its name and filter setting", () => {
    const before = state([BEN, FAMILY_FIRST, 'calendar.leo', FAMILY_SECOND]);
    const { state: after, adopted } = List.repointEntry(before, 0, 'calendar.family');

    expect(adopted).toBe(true);
    expect(ids(after)).toEqual([
      'calendar.family',
      'calendar.family',
      'calendar.family',
      'calendar.leo',
    ]);
    expect(after.keys).toEqual([2, 4, 1, 3]);
    // Its own settings stay; the calendar's two become Family's.
    expect(after.entities[2]).toEqual({
      entity: 'calendar.family',
      name: 'Family',
      accent_color: GREEN,
      allowlist: 'School',
    });
  });

  it("takes the target's hidden filter setting, and drops a name the target does not set", () => {
    const hidden = state([
      { entity: 'calendar.family', show_in_legend: false },
      { entity: 'calendar.ben', name: 'Ben', allowlist: 'School' },
    ]);
    const { state: after, adopted } = List.repointEntry(hidden, 1, 'calendar.family');

    expect(adopted).toBe(true);
    expect(after.entities[1]).toEqual({
      entity: 'calendar.family',
      show_in_legend: false,
      allowlist: 'School',
    });
  });

  it('keeps its own name and setting when the target has no entries yet', () => {
    const before = state([BEN, 'calendar.leo']);
    const { state: after, adopted } = List.repointEntry(before, 0, 'calendar.family');

    expect(adopted).toBe(false);
    expect(after.entities).toEqual(['calendar.leo', { ...BEN, entity: 'calendar.family' }]);
    expect(after.keys).toEqual([2, 1]);
  });

  it('leaves the calendar it left its name, on the entry that remains', () => {
    const before = state([FAMILY_FIRST, FAMILY_SECOND]);
    const { state: after } = List.repointEntry(before, 0, 'calendar.ben');

    expect(after.entities).toEqual([
      { ...FAMILY_SECOND, name: 'Family' },
      { ...FAMILY_FIRST, entity: 'calendar.ben' },
    ]);
  });

  it('keeps a bare id bare unless it adopts something', () => {
    expect(List.repointEntry(state(['calendar.ben', 'calendar.leo']), 0, 'calendar.leo')).toEqual({
      state: { entities: ['calendar.leo', 'calendar.leo'], keys: [2, 1] },
      adopted: true,
    });
    expect(
      List.repointEntry(state(['calendar.ben', FAMILY_FIRST]), 0, 'calendar.family').state
        .entities[1],
    ).toEqual({ entity: 'calendar.family', name: 'Family' });
  });

  it('changes nothing but the grouping when pointed at its own calendar', () => {
    expect(List.repointEntry(SCATTERED, 2, 'calendar.anna')).toEqual({
      state: List.moveCalendar(SCATTERED, 'calendar.anna', 0),
      adopted: false,
    });
  });
});

describe('every operation', () => {
  const NEW_KEY = 99;
  const operations: Array<[string, (list: List.ListState) => List.ListState]> = [
    ['move', (list) => List.moveCalendar(list, 'calendar.ben', 0)],
    ['move to the end', (list) => List.moveCalendar(list, 'calendar.anna', 9)],
    ['duplicate', (list) => List.duplicateEntry(list, 2, NEW_KEY)],
    ['remove an entry', (list) => List.removeEntry(list, 1)],
    ['remove a calendar', (list) => List.removeCalendar(list, 'calendar.ben')],
    ['add', (list) => List.addCalendar(list, 'calendar.anna', NEW_KEY)],
    ['re-point', (list) => List.repointEntry(list, 1, 'calendar.anna').state],
  ];
  // Three Anna entries scattered between Ben's two, so relative order inside a calendar can be
  // lost in more than one way.
  const MIXED = state([
    { entity: 'calendar.anna', label: 'a1' },
    { entity: 'calendar.ben', label: 'b1' },
    { entity: 'calendar.anna', label: 'a2' },
    { entity: 'calendar.ben', label: 'b2' },
    { entity: 'calendar.anna', label: 'a3' },
  ]);

  it.each(operations)('%s: writes the list grouped and keeps each calendar in order', (_, run) => {
    const after = run(MIXED);

    expect(isGrouped(after)).toBe(true);
    expectRelativeOrderKept(MIXED, after);
    expect(after.keys).toHaveLength(after.entities.length);
  });

  it.each(operations)('%s: moves each key with its entry', (_, run) => {
    const labelOf = new Map(
      MIXED.keys.map((key, index) => [key, (MIXED.entities[index] as Types.EntityConfig).label]),
    );
    const after = run(MIXED);

    after.keys.forEach((key, index) => {
      if (key === NEW_KEY) return;
      expect((after.entities[index] as Types.EntityConfig).label, `key ${key}`).toBe(
        labelOf.get(key),
      );
    });
  });
});

describe('rowParts', () => {
  const parts = (entry: Entry) => List.rowParts(entry, 'en');

  it('says each kind of part in the list’s words', () => {
    expect(parts({ entity: 'x', event_type: 'all_day' })).toEqual(['All-day events']);
    expect(parts({ entity: 'x', event_type: 'timed' })).toEqual(['Events with a time']);
    expect(parts({ entity: 'x', allowlist: 'School|PTA' })).toEqual(['Only: School, PTA']);
    expect(parts({ entity: 'x', blocklist: ' Private | ' })).toEqual(['Without: Private']);
    expect(parts({ entity: 'x', days_of_week: 'weekdays' })).toEqual(['Weekdays']);
    expect(parts({ entity: 'x', days_of_week: 'weekends' })).toEqual(['Weekend days']);
    expect(parts({ entity: 'x', allday_expires_at: '18:00' })).toEqual(['Expires at 18:00']);
    expect(
      parts({
        entity: 'x',
        visibility: [{ condition: 'user', users: ['a'] }],
      } as Types.EntityConfig),
    ).toEqual(['Shown under conditions']);
  });

  it('says All events when none applies, for a bare id and for an empty word list', () => {
    expect(parts('calendar.anna')).toEqual(['All events']);
    expect(parts({ entity: 'x', event_type: 'all', allowlist: '|', visibility: [] })).toEqual([
      'All events',
    ]);
  });

  it('keeps the first two in order of preference', () => {
    expect(
      parts({
        entity: 'x',
        visibility: [{ condition: 'user', users: ['a'] }],
        allday_expires_at: '18:00',
        days_of_week: 'weekends',
        blocklist: 'Private',
        allowlist: 'School',
        event_type: 'timed',
      } as Types.EntityConfig),
    ).toEqual(['Events with a time', 'Only: School']);
    expect(
      parts({
        entity: 'x',
        visibility: [{ condition: 'user', users: ['a'] }],
        allday_expires_at: '18:00',
        days_of_week: 'weekdays',
      } as Types.EntityConfig),
    ).toEqual(['Weekdays', 'Expires at 18:00']);
  });

  it('falls back to English, key by key, in a language without these strings yet', () => {
    expect(List.rowParts({ entity: 'x', event_type: 'all_day' }, 'de')).toEqual(['All-day events']);
  });
});

describe('rowName', () => {
  const hass = {
    states: { 'calendar.ben': { attributes: { friendly_name: 'Ben (Work)' } } },
  } as unknown as Types.Hass;

  it("names a calendar's only entry by the calendar", () => {
    const list = state([{ entity: 'calendar.ben', allowlist: 'School' }, 'calendar.leo']);

    expect(List.rowName(list, 0, 'en', hass)).toBe('Ben (Work)');
    expect(List.rowName(list, 1, 'en', hass)).toBe('calendar.leo');
  });

  it('adds the first part inside a calendar with several entries, and prefers the card’s name', () => {
    const list = state([
      { entity: 'calendar.ben', event_type: 'all_day' },
      { entity: 'calendar.ben', name: 'Ben', event_type: 'timed', blocklist: 'Private' },
    ]);

    expect(List.rowName(list, 0, 'en', hass)).toBe('Ben, All-day events');
    expect(List.rowName(list, 1, 'en', hass)).toBe('Ben, Events with a time');
  });

  it('is empty for an index outside the list', () => {
    expect(List.rowName(SCATTERED, 7, 'en')).toBe('');
  });
});

describe('setCount', () => {
  it('counts the stored options other than the id', () => {
    expect(List.setCount('calendar.anna')).toBe(0);
    expect(List.setCount({ entity: 'calendar.anna' })).toBe(0);
    expect(List.setCount(ANNA_RED)).toBe(2);
    expect(List.setCount({ entity: 'calendar.anna', name: undefined, blocklist: 'x' })).toBe(1);
  });
});

/*
 * Invariance through the card's own pipeline. Family is listed twice, red first and blue
 * second, and both entries keep the same event, so with Filter Duplicates on the card draws one
 * row: red's. Ben sits between Family's two entries, as hand-written YAML can hold them, with an
 * event of his own: a Ben holding Family's event too would be a duplicate across calendars, which
 * the calendar listed first keeps, and moving calendars is meant to change that.
 */
describe('what the card draws, before and after', () => {
  const EVENT_START = '2026-06-17T11:00:00.000Z';
  const EVENT_END = '2026-06-17T12:00:00.000Z';
  const FAMILY_RED: Types.EntityConfig = { entity: 'calendar.family', accent_color: RED };
  const FAMILY_BLUE: Types.EntityConfig = { entity: 'calendar.family', accent_color: BLUE };
  const BEN: Types.EntityConfig = { entity: 'calendar.ben', accent_color: GREEN };
  const BEFORE = state([FAMILY_RED, BEN, FAMILY_BLUE]);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** What Home Assistant answers for a calendar: Family's lunch, or a school run. */
  function eventsFor(entityId: string): Types.CalendarEventData[] {
    const family = entityId === 'calendar.family';
    return [
      {
        summary: family ? 'Lunch' : 'School run',
        start: { dateTime: family ? EVENT_START : '2026-06-17T14:00:00.000Z' },
        end: { dateTime: family ? EVENT_END : '2026-06-17T15:00:00.000Z' },
        _entityId: entityId,
      },
    ];
  }

  /** Runs the card's pipeline over a list and reads the one lunch row it draws. */
  function drawn(list: List.ListState): { matched: unknown; color: string | undefined } {
    const config = buildConfig({
      entities: [...list.entities],
      filter_duplicates: true,
      days_to_show: 1,
    });
    const raw = [...new Set(list.entities.map(entityIdOf))].flatMap(eventsFor);
    const processed = EventUtils.processEvents(raw, config);
    const days = EventUtils.groupEventsByDay(processed, config, false, 'en', 'list');
    const rows = days.flatMap((day) => day.events).filter((e) => e.summary === 'Lunch');

    const container = document.createElement('div');
    litRender(
      Render.renderGroupedEvents(
        days,
        ViewConfig.resolveEffectiveConfig(config, 'list'),
        'en',
        undefined,
        null,
      ),
      container,
    );
    const colors = [...container.querySelectorAll('td.event')]
      .filter((event) => event.textContent?.includes('Lunch'))
      .map((event) =>
        /--calendar-card-event-accent-bar-color:\s*([^;]+)/
          .exec(event.getAttribute('style') ?? '')?.[1]
          .trim(),
      );

    expect(rows, 'one lunch row').toHaveLength(1);
    expect(colors, 'one lunch row drawn').toHaveLength(1);
    return { matched: rows[0]._matchedConfig, color: colors[0] };
  }

  function expectRedWins(list: List.ListState): void {
    const { matched, color } = drawn(list);
    expect(matched).toEqual(FAMILY_RED);
    expect(color).toBe(RED);
  }

  it('draws red before any operation', () => {
    expectRedWins(BEFORE);
  });

  it('draws red after the list is grouped', () => {
    const grouped = List.moveCalendar(BEFORE, 'calendar.family', 0);
    expect(ids(grouped)).toEqual(['calendar.family', 'calendar.family', 'calendar.ben']);
    expectRedWins(grouped);
  });

  it('draws red after a calendar move', () => {
    const moved = List.moveCalendar(BEFORE, 'calendar.ben', 0);
    expect(ids(moved)).toEqual(['calendar.ben', 'calendar.family', 'calendar.family']);
    expectRedWins(moved);
  });

  it("draws red after another entry is re-pointed at Family, joining the end of Family's entries", () => {
    const { state: after } = List.repointEntry(BEFORE, 1, 'calendar.family');
    expect(ids(after)).toEqual(['calendar.family', 'calendar.family', 'calendar.family']);
    expectRedWins(after);
  });

  it("fails on a planted reversal of Family's entries, which draws blue", () => {
    const reversed: List.ListState = { entities: [FAMILY_BLUE, BEN, FAMILY_RED], keys: [3, 2, 1] };

    expect(drawn(reversed)).toEqual({ matched: FAMILY_BLUE, color: BLUE });
    expect(() => expectRedWins(reversed)).toThrow();
  });

  it('requests the same calendars from Home Assistant, each once', async () => {
    async function requested(list: List.ListState): Promise<string[]> {
      const paths: string[] = [];
      const hass = {
        callApi: (_method: string, path: string) => {
          paths.push(path);
          return Promise.resolve(eventsFor(path.slice('calendars/'.length, path.indexOf('?'))));
        },
      } as unknown as Types.Hass;
      const entities = list.entities.map((entry) =>
        typeof entry === 'string' ? { entity: entry } : entry,
      );
      await EventUtils.fetchEvents(hass, entities, {
        start: new Date('2026-06-17T00:00:00.000Z'),
        end: new Date('2026-06-18T00:00:00.000Z'),
      });
      return paths.map((path) => path.slice('calendars/'.length, path.indexOf('?')));
    }

    const before = await requested(BEFORE);
    expect(before).toEqual(['calendar.family', 'calendar.ben']);

    // Grouping keeps the first occurrences, so the requests and their order are the same.
    expect(await requested(List.moveCalendar(BEFORE, 'calendar.family', 0))).toEqual(before);
    // A move changes their order and nothing else.
    expect(await requested(List.moveCalendar(BEFORE, 'calendar.ben', 0))).toEqual([
      'calendar.ben',
      'calendar.family',
    ]);
    // Re-pointing Ben's only entry leaves Ben unrequested.
    expect(await requested(List.repointEntry(BEFORE, 1, 'calendar.family').state)).toEqual([
      'calendar.family',
    ]);
  });
});

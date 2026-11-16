import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import {
  PLANTED,
  cardFirstDays,
  disagreements,
  mirrorFirstDays,
  reviewCases,
  reviewEvents,
  reviewNow,
} from './helpers/split-review-cases';
import type * as Types from '../src/config/types';
import { splitEntry } from '../src/rendering/editor/split';
import {
  READ_TIMEOUT,
  readUpcoming,
  reviewParts,
  reviewWindow,
} from '../src/rendering/editor/split-review';

/**
 * Split This Calendar's review list (section 5.7): it reads the calendar over the card's own REST
 * path, names the events the card shows for the entry in the layout displayed, and puts each in
 * the first part that keeps it.
 *
 * The case table runs the card's `processEvents` and `groupEventsByDay` beside the editor's
 * mirror under UTC; `editor-split-review.dst.test.ts` runs the same table in the four zones that
 * change their clocks.
 */

describe("Split's review reads the calendar as the card does", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the REST path the card asks, for the window', async () => {
    const callApi = vi.fn().mockResolvedValue([{ summary: 'Dentist', start: {}, end: {} }]);
    const window = { start: new Date(Date.UTC(2026, 0, 14)), end: new Date(Date.UTC(2026, 0, 21)) };

    const events = await readUpcoming({ callApi } as unknown as Types.Hass, 'calendar.ben', window);

    expect(callApi).toHaveBeenCalledWith(
      'GET',
      'calendars/calendar.ben?start=2026-01-14T00:00:00.000Z&end=2026-01-21T00:00:00.000Z',
    );
    expect(events).toEqual([{ summary: 'Dentist', start: {}, end: {}, _entityId: 'calendar.ben' }]);
  });

  it('gives up after its timeout, and on an answer that is no list', async () => {
    vi.useFakeTimers();
    const hang = { callApi: () => new Promise(() => undefined) } as unknown as Types.Hass;
    const window = { start: new Date(0), end: new Date(1) };

    const pending = readUpcoming(hang, 'calendar.ben', window);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();

    const odd = { callApi: () => Promise.resolve({ events: [] }) } as unknown as Types.Hass;
    expect(await readUpcoming(odd, 'calendar.ben', window)).toBeNull();
    const failing = { callApi: () => Promise.reject(new Error('401')) } as unknown as Types.Hass;
    expect(await readUpcoming(failing, 'calendar.ben', window)).toBeNull();
  });
});

describe("Split's review puts each shown event in the first part that keeps it", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(reviewNow());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const hass = {
    config: {},
    locale: { language: 'en', time_format: '24' },
  } as unknown as Types.Hass;

  it('lists all-day events under the first part and timed ones under the second', () => {
    const config = buildConfig({ entities: ['calendar.ben'], days_to_show: 7 });
    const original = config.entities[0];
    const pair = splitEntry(original, { kind: 'type' }, [{}, {}]);
    const window = reviewWindow(config, 'list', hass, reviewNow());

    const [allDay, timed] = reviewParts(
      reviewEvents(),
      original,
      pair,
      window,
      'list',
      hass,
      'en',
      reviewNow(),
    );

    // Ties keep the calendar's order, as the card's own rows do.
    expect(allDay.lines.slice(0, 2)).toEqual([
      'Wed 14 · All day today',
      'Wed 14 · Holiday from Sunday',
    ]);
    expect(timed.lines[0]).toBe('Wed 14 · 9:00 · Conference');
    expect(timed.lines).toHaveLength(5);
    expect(timed.lines[4]).toMatch(/^\+\d+$/);
    // Every event the entry shows, once: the parts' counts add up to the entry's.
    const shown = mirrorCount(config, original);
    expect(allDay.count + timed.count).toBe(shown);
    expect(allDay.count).toBeGreaterThan(0);
  });

  it('gives an event both parts would keep to the first', () => {
    const config = buildConfig({ entities: ['calendar.ben'], days_to_show: 7 });
    const original = config.entities[0];
    const both: readonly [Types.EntityConfig, Types.EntityConfig] = [
      { entity: 'calendar.ben' },
      { entity: 'calendar.ben' },
    ];
    const window = reviewWindow(config, 'list', hass, reviewNow());

    const [first, second] = reviewParts(reviewEvents(), original, both, window, 'list', hass, 'en');

    expect(second.count).toBe(0);
    expect(first.count).toBe(mirrorCount(config, original));
  });

  it('splits by words into the worded part and every other event', () => {
    const config = buildConfig({ entities: ['calendar.ben'], days_to_show: 7 });
    const original = config.entities[0];
    const pair = splitEntry(original, { kind: 'words', terms: ['training'], field: 'title' }, [
      {},
      {},
    ]);
    const window = reviewWindow(config, 'list', hass, reviewNow());

    const [worded, other] = reviewParts(reviewEvents(), original, pair, window, 'list', hass, 'en');

    expect(worded.lines).toEqual(['Fri 16 · 17:00 · Friday training']);
    expect(other.count).toBe(mirrorCount(config, original) - 1);
  });
});

/**
 * How many events the mirror names for an entry.
 *
 * @param config - The card's configuration
 * @param entry - The entry
 * @returns The count
 */
function mirrorCount(config: Types.Config, entry: string | Types.EntityConfig): number {
  return mirrorFirstDays(
    { name: '', view: 'list', config, hass: { config: {}, locale: {} } as unknown as Types.Hass },
    reviewEvents(),
    (inputs) => ({ ...inputs, entry }),
  ).size;
}

describe("Split's review names what the card shows, under UTC", () => {
  const cases = reviewCases();
  const events = reviewEvents();
  let card: ReturnType<typeof cardFirstDays>[] = [];

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(reviewNow());
    card = cases.map((each) => cardFirstDays(each, events));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('names the same events on the same first day as the card, in every case', () => {
    const found = cases.flatMap((each, at) =>
      disagreements(card[at], mirrorFirstDays(each, events)).map((line) => `${each.name}: ${line}`),
    );
    const named = card.reduce((sum, days) => sum + days.size, 0);

    // The denominators beside the verdict: a table that names nothing would agree trivially.
    expect({ cases: cases.length, named: named > cases.length * 5 }).toEqual({
      cases: 2020,
      named: true,
    });
    expect(found).toEqual([]);
  });

  it.each(Object.keys(PLANTED))('disagrees with the card where the mirror has %s', (name) => {
    const found = cases.filter(
      (each, at) =>
        disagreements(card[at], mirrorFirstDays(each, events, PLANTED[name])).length > 0,
    );

    expect(found.length).toBeGreaterThan(0);
  });
});

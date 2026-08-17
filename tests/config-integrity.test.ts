import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import { SYNTHETIC_FIELDS } from '../src/rendering/editor/synthetic';
import * as EventUtils from '../src/utils/events';
import '../src/calendar-card-pro';

/**
 * Three ways a valid configuration could be silently replaced by a different
 * one. None of them is reachable from an invalid config — each starts from a
 * state the card itself produced and supports.
 */

/** happy-dom's own `localStorage.clear()` is not callable; supply a real one. */
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

describe('the calendar picker preserves per-block configuration', () => {
  /**
   * Listing one calendar twice is supported — `event-cache.test.ts` pins that
   * each block gets its own copy so the two can render with different labels.
   * The picker's `apply` looked its blocks up in a `Map` keyed by entity ID,
   * which keeps only the last block for a repeated ID, so simply re-opening the
   * picker rewrote every earlier duplicate with the last one's settings.
   */
  const shapes = (out: { changes: Partial<Types.Config> }) =>
    (out.changes.entities as unknown[]).map((e) => JSON.stringify(e));

  it('keeps each duplicate block distinct, in picker order', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.a', label: 'First' },
        { entity: 'calendar.a', label: 'Second' },
      ],
    }) as Types.Config;

    const out = SYNTHETIC_FIELDS.calendars.apply(
      ['calendar.a', 'calendar.a', 'calendar.b'],
      config,
    );

    expect(shapes(out)).toEqual([
      '{"entity":"calendar.a","label":"First"}',
      '{"entity":"calendar.a","label":"Second"}',
      '"calendar.b"',
    ]);
  });

  it('control: distinct entity ids keep their own blocks', () => {
    const config = buildConfig({
      entities: [
        { entity: 'calendar.a', label: 'First' },
        { entity: 'calendar.b', label: 'Second' },
      ],
    }) as Types.Config;

    const out = SYNTHETIC_FIELDS.calendars.apply(
      ['calendar.a', 'calendar.b', 'calendar.c'],
      config,
    );

    expect(shapes(out)).toEqual([
      '{"entity":"calendar.a","label":"First"}',
      '{"entity":"calendar.b","label":"Second"}',
      '"calendar.c"',
    ]);
  });
});

interface CardUnderTest extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  readonly effectiveView: Types.EffectiveView;
  _handleWidthMeasured(widthPx: number): void;
}

describe('a measured column fit survives an unrelated config edit', () => {
  /**
   * Column fitting is hysteretic — it holds its answer inside a band so the
   * layout does not oscillate around a boundary width. `setConfig()` passed
   * `null` for the previous fit, so any edit re-fit the card from scratch. At a
   * width inside that band a card already showing seven columns fell back to
   * the *list* view on an edit that had nothing to do with layout, and stayed
   * there until the next resize moved it out of the band.
   *
   * This has to go through the element: `resolveColumnFit` itself was correct,
   * so a test that calls the resolver directly passes either way.
   */
  const COLUMN_CONFIG = {
    entities: [{ entity: 'calendar.one' }],
    view: 'column',
    days_to_show: 7,
  };

  /** A card that has measured a width inside the hysteresis band. */
  function measuredCard(): CardUnderTest {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ ...COLUMN_CONFIG });
    card._handleWidthMeasured(1600);
    card._handleWidthMeasured(1075);
    return card;
  }

  it('holds the column view when an unrelated option changes', () => {
    const card = measuredCard();
    expect(card.effectiveView).toBe('column');

    card.setConfig({ ...COLUMN_CONFIG, title: 'Renamed' });

    expect(card.effectiveView).toBe('column');
  });

  it('control: the same width never reaches column view without a prior fit', () => {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig({ ...COLUMN_CONFIG });
    card._handleWidthMeasured(1075);

    expect(card.effectiveView).toBe('list');
  });

  it('control: a config that no longer fits still leaves column view', () => {
    const card = measuredCard();

    card.setConfig({ ...COLUMN_CONFIG, view: 'list' });

    expect(card.effectiveView).toBe('list');
  });
});

describe('malformed cache entries are rejected rather than rendered', () => {
  /**
   * The entry was cast straight out of `JSON.parse`. A *string* `events` was
   * the dangerous case: iterating it yields characters, so the card rendered
   * garbage and still counted a cache hit, suppressing the refetch that would
   * have repaired it.
   */
  const KEY = 'calendar_events_shape_probe';
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  const write = (payload: unknown) => storage.setItem(KEY, JSON.stringify(payload));

  it('accepts a well-formed entry, including an empty event list', () => {
    write({ events: [], timestamp: Date.now() });
    expect(EventUtils.getValidCacheEntry(KEY)).not.toBeNull();
    expect(storage.getItem(KEY)).not.toBeNull();
  });

  it.each([
    ['a string events value', { events: 'not-an-array', timestamp: Date.now() }],
    ['a missing events key', { timestamp: Date.now() }],
    ['a null events value', { events: null, timestamp: Date.now() }],
    ['a null entry inside events', { events: [null], timestamp: Date.now() }],
    ['a non-numeric timestamp', { events: [], timestamp: 'soon' }],
    ['a bare array instead of an entry', [{ events: [], timestamp: Date.now() }]],
  ])('rejects and evicts %s', (_label, payload) => {
    write(payload);
    expect(EventUtils.getValidCacheEntry(KEY)).toBeNull();
    expect(storage.getItem(KEY)).toBeNull();
  });

  /**
   * `NaN` and `Infinity` cannot be written through `JSON.stringify` — it emits
   * `null` for both, which the `typeof !== 'number'` half already rejects. Raw
   * JSON is the only way a non-finite timestamp reaches the parsed entry, and
   * `1e999` is how it gets there in practice: it overflows to `Infinity`.
   */
  it('rejects and evicts an entry whose timestamp overflows to Infinity', () => {
    storage.setItem(KEY, '{"events":[],"timestamp":1e999}');
    expect(EventUtils.getValidCacheEntry(KEY)).toBeNull();
    expect(storage.getItem(KEY)).toBeNull();
  });
});

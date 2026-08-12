import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIG,
  DEPRECATED_CONFIG_MAP,
  findDeprecatedKeys,
  hasConfigChanged,
  normalizeEntities,
  normalizeNumericOptions,
  toValidNumber,
} from '../src/config/config';
import type * as Types from '../src/config/types';

/**
 * Config normalization and change detection.
 *
 * These are the guards behind issue #327: the visual editor persists an empty
 * string when a numeric field is cleared, and hand-written YAML can supply `null`
 * or free text. Such values pass the `!== undefined` checks used throughout the
 * card, then coerce to `0` in numeric comparisons and silently suppress events or
 * whole days. The failure is invisible — the card renders successfully, just
 * empty — so it is exactly the class of bug that needs a test rather than a soak.
 */

describe('toValidNumber', () => {
  it('accepts plain numbers at or above the minimum', () => {
    expect(toValidNumber(5)).toBe(5);
    expect(toValidNumber(0)).toBe(0);
    expect(toValidNumber(1, 1)).toBe(1);
  });

  it('parses numeric strings, which is what the editor persists', () => {
    expect(toValidNumber('7')).toBe(7);
    expect(toValidNumber(' 7 ')).toBe(7);
    expect(toValidNumber('0.5')).toBe(0.5);
  });

  // The #327 inputs. Each of these coerces to 0 under `Number()` or passes a
  // `!== undefined` guard, which is how they reached the comparison in the first place.
  it.each([
    ['empty string (editor clears a field)', ''],
    ['whitespace only', '   '],
    ['null (hand-written YAML)', null],
    ['undefined', undefined],
    ['non-numeric text', 'seven'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['boolean', true],
    ['object', {}],
    ['array', []],
  ])('rejects %s', (_label, value) => {
    expect(toValidNumber(value)).toBeUndefined();
  });

  it('rejects values below the minimum rather than clamping them', () => {
    // Clamping would silently change the user's intent; `undefined` lets the caller
    // decide between "fall back to default" and "no limit", which differ per key.
    expect(toValidNumber(0, 1)).toBeUndefined();
    expect(toValidNumber(-1, 0)).toBeUndefined();
    expect(toValidNumber('-3', 0)).toBeUndefined();
  });
});

describe('normalizeNumericOptions', () => {
  it('restores defaults for required values so the range can never collapse to zero', () => {
    const config = {
      days_to_show: '',
      refresh_interval: null,
      event_background_opacity: 'abc',
    } as unknown as Types.Config;

    normalizeNumericOptions(config);

    expect(config.days_to_show).toBe(DEFAULT_CONFIG.days_to_show);
    expect(config.refresh_interval).toBe(DEFAULT_CONFIG.refresh_interval);
    expect(config.event_background_opacity).toBe(DEFAULT_CONFIG.event_background_opacity);
  });

  it('clears optional limits instead of collapsing them to zero', () => {
    // `undefined` means "no limit" for these two. Falling back to `0` would hide
    // all content, which is the opposite of the user's intent when they clear a field.
    const config = {
      compact_days_to_show: '',
      compact_events_to_show: 'nonsense',
    } as unknown as Types.Config;

    normalizeNumericOptions(config);

    expect(config.compact_days_to_show).toBeUndefined();
    expect(config.compact_events_to_show).toBeUndefined();
  });

  it('preserves compact_events_to_show: 0, which is a valid configuration', () => {
    // 0 means "show nothing until tapped". It must survive normalization, and is
    // why the minimum for this key is 0 while compact_days_to_show uses 1.
    const config = { compact_events_to_show: 0 } as unknown as Types.Config;
    normalizeNumericOptions(config);
    expect(config.compact_events_to_show).toBe(0);
  });

  it('rejects compact_days_to_show: 0, which would render nothing at all', () => {
    const config = { compact_days_to_show: 0 } as unknown as Types.Config;
    normalizeNumericOptions(config);
    expect(config.compact_days_to_show).toBeUndefined();
  });

  it('leaves valid values untouched', () => {
    const config = {
      days_to_show: 5,
      refresh_interval: 60,
      event_background_opacity: 20,
      compact_days_to_show: 2,
      compact_events_to_show: 3,
    } as unknown as Types.Config;

    normalizeNumericOptions(config);

    expect(config).toMatchObject({
      days_to_show: 5,
      refresh_interval: 60,
      event_background_opacity: 20,
      compact_days_to_show: 2,
      compact_events_to_show: 3,
    });
  });
});

describe('normalizeEntities', () => {
  it('expands bare entity id strings into objects', () => {
    expect(normalizeEntities(['calendar.personal'])).toEqual([
      {
        entity: 'calendar.personal',
        color: undefined,
        accent_color: undefined,
        label_icon_color: undefined,
      },
    ]);
  });

  it('drops malformed entries rather than emitting entity: undefined', () => {
    const result = normalizeEntities([
      'calendar.good',
      { color: 'red' },
      null,
      42,
    ] as unknown as Parameters<typeof normalizeEntities>[0]);

    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe('calendar.good');
  });

  it('survives a null entry, which a bare "-" in YAML produces', () => {
    // `typeof null === 'object'`, so this used to throw inside setConfig and take
    // the whole card down with a red error box rather than dropping the entry.
    expect(() =>
      normalizeEntities([null, undefined] as unknown as Parameters<typeof normalizeEntities>[0]),
    ).not.toThrow();

    expect(
      normalizeEntities([null, undefined] as unknown as Parameters<typeof normalizeEntities>[0]),
    ).toEqual([]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(normalizeEntities(undefined as unknown as [])).toEqual([]);
    expect(normalizeEntities({} as unknown as [])).toEqual([]);
  });

  it('applies the same numeric guard to per-entity compact caps', () => {
    // Per-entity limits go through toValidNumber too — the #327 class is not
    // limited to top-level keys.
    const result = normalizeEntities([
      { entity: 'calendar.a', compact_events_to_show: '' },
      { entity: 'calendar.b', compact_events_to_show: 2 },
      { entity: 'calendar.c', compact_events_to_show: 0 },
    ] as unknown as Parameters<typeof normalizeEntities>[0]);

    expect(result[0].compact_events_to_show).toBeUndefined();
    expect(result[1].compact_events_to_show).toBe(2);
    expect(result[2].compact_events_to_show).toBe(0);
  });

  it('normalizes empty colour strings to undefined so defaults apply', () => {
    const result = normalizeEntities([
      { entity: 'calendar.a', color: '', accent_color: '', label_icon_color: '' },
    ]);

    expect(result[0].color).toBeUndefined();
    expect(result[0].accent_color).toBeUndefined();
    expect(result[0].label_icon_color).toBeUndefined();
  });

  it('preserves per-entity boolean overrides, including explicit false', () => {
    // `false` must survive: it is a deliberate override, not an absent value.
    const result = normalizeEntities([
      {
        entity: 'calendar.a',
        show_time: false,
        show_location: false,
        split_multiday_events: false,
      },
    ]);

    expect(result[0].show_time).toBe(false);
    expect(result[0].show_location).toBe(false);
    expect(result[0].split_multiday_events).toBe(false);
  });
});

describe('hasConfigChanged', () => {
  const base = {
    entities: ['calendar.personal'],
    days_to_show: 3,
    refresh_interval: 30,
  } as unknown as Types.Config;

  it('treats a missing or empty previous config as changed', () => {
    expect(hasConfigChanged(undefined, base)).toBe(true);
    expect(hasConfigChanged({}, base)).toBe(true);
  });

  it('reports no change for an identical config', () => {
    expect(hasConfigChanged({ ...base }, base)).toBe(false);
  });

  it.each([
    ['days_to_show', { days_to_show: 7 }],
    ['start_date', { start_date: '2026-01-01' }],
    ['show_past_events', { show_past_events: true }],
    ['filter_duplicates', { filter_duplicates: true }],
    ['refresh_interval', { refresh_interval: 60 }],
    ['entities', { entities: ['calendar.other'] }],
  ])('detects a change to %s', (_label, patch) => {
    expect(hasConfigChanged(base, { ...base, ...patch } as Types.Config)).toBe(true);
  });

  it('ignores entity reordering, which does not change the data fetched', () => {
    const previous = { ...base, entities: ['calendar.a', 'calendar.b'] } as Types.Config;
    const current = { ...base, entities: ['calendar.b', 'calendar.a'] } as Types.Config;
    expect(hasConfigChanged(previous, current)).toBe(false);
  });

  it('ignores styling-only entity changes, which need a re-render but not a refetch', () => {
    // This is the point of the function: colour edits must not trigger an API call.
    const previous = { ...base, entities: ['calendar.a'] } as Types.Config;
    const current = {
      ...base,
      entities: [{ entity: 'calendar.a', color: 'red' }],
    } as unknown as Types.Config;

    expect(hasConfigChanged(previous, current)).toBe(false);
  });
});

/**
 * Removed-key reporting.
 *
 * The five keys below were deleted from the runtime in the v3.0.0 API cleanup
 * (`ac801e0`), but the visual editor kept offering a one-click upgrade for them.
 * A user who writes YAML and never opens the editor therefore got no signal:
 * the value was ignored and its replacement silently took the default. These
 * pin the reporting that closes that gap.
 *
 * Note the shape being tested — `findDeprecatedKeys` reads the *raw* config, not
 * a merged one, because after the `DEFAULT_CONFIG` spread every key is present
 * and a removed key can no longer be distinguished from an absent one.
 */
describe('findDeprecatedKeys', () => {
  it('says nothing about a clean config', () => {
    expect(findDeprecatedKeys({ entities: ['calendar.a'] } as Types.Config)).toEqual([]);
  });

  it('names the replacement for every removed top-level key', () => {
    for (const [oldKey, newKey] of Object.entries(DEPRECATED_CONFIG_MAP)) {
      const [message, ...rest] = findDeprecatedKeys({ [oldKey]: 'x' } as unknown as Types.Config);

      expect(rest).toEqual([]);
      expect(message).toContain(oldKey);
      // The replacement is the actionable half — a notice without it is just noise.
      expect(message).toContain(newKey);
    }
  });

  it('reports a removed key on a per-entity object, with its index', () => {
    const messages = findDeprecatedKeys({
      entities: [{ entity: 'calendar.a' }, { entity: 'calendar.b', max_events_to_show: 3 }],
    } as unknown as Types.Config);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('entities[1]');
    expect(messages[0]).toContain('compact_events_to_show');
  });

  it('tolerates string entities, which carry no options', () => {
    // normalizeEntities has not run at this point, so plain strings are still present.
    expect(findDeprecatedKeys({ entities: ['calendar.a'] } as Types.Config)).toEqual([]);
  });

  it('survives a null entity entry rather than throwing during setConfig', () => {
    // typeof null === 'object', so the guard has to test for null explicitly.
    expect(
      findDeprecatedKeys({ entities: [null, 'calendar.a'] } as unknown as Types.Config),
    ).toEqual([]);
  });

  it('reports a top-level key set to a falsy value', () => {
    // `in` rather than truthiness: `row_spacing: 0` is still a setting being discarded.
    expect(findDeprecatedKeys({ row_spacing: 0 } as unknown as Types.Config)).toHaveLength(1);
  });
});

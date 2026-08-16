/**
 * The editor's numeric floors must match the ones the card actually enforces.
 *
 * Home Assistant treats a number selector's `min` as the lowest value the user
 * can enter, so an editor floor above the runtime floor makes a supported
 * configuration unauthorable — the field silently refuses the value and there is
 * no error to explain why.
 *
 * `compact_events_to_show` shipped that way. The runtime normalizes it with a
 * floor of zero at both scopes, a documented behaviour (`compact_events_to_show: 0`
 * keeps a card visible so it can still be expanded) that was the subject of its
 * own bug fix, and the editor's own advisory check reads it with a floor of zero
 * too. Only the two selectors disagreed, and they were the one pair out of five
 * shared keys that did.
 *
 * This walks every numeric selector the editor builds and, for each key the card
 * normalizes, checks the floor from both sides: the value at the floor survives
 * normalization, and the value one below it is rejected. The paired assertion
 * matters — checking only that the floor is accepted would pass for a floor set
 * far too low, and checking only the rejection would pass for one set too high.
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import * as Config from '../src/config/config';
import * as Types from '../src/config/types';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { buildContentSchema } from '../src/rendering/editor/schemas/content';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';

const config = buildConfig({});
const ctx = { view: config.view, config, language: 'en' };

/**
 * Collect every numeric selector floor a schema declares, including nested rows.
 *
 * @param schema - Schema entries to walk
 * @returns Map of option name to declared minimum
 */
function numericMinima(schema: ReadonlyArray<HaFormSchema>): Map<string, number> {
  const found = new Map<string, number>();

  const walk = (entries: ReadonlyArray<HaFormSchema>): void => {
    for (const entry of entries) {
      const nested = (entry as { schema?: ReadonlyArray<HaFormSchema> }).schema;
      if (nested) {
        walk(nested);
        continue;
      }

      const min = (entry as { selector?: { number?: { min?: number } } }).selector?.number?.min;
      const name = (entry as { name?: string }).name;
      if (typeof min === 'number' && name) {
        found.set(name, min);
      }
    }
  };

  walk(schema);
  return found;
}

describe('editor numeric floors match the runtime', () => {
  const cardMinima = numericMinima(buildContentSchema(ctx));
  const entityMinima = numericMinima(buildEntitySchema(ctx));

  it('finds the numeric selectors it means to check', () => {
    // Guards against the walk silently returning nothing, which would make
    // every parity assertion below vacuous.
    expect(cardMinima.size).toBeGreaterThan(0);
    expect(cardMinima.has('compact_events_to_show')).toBe(true);
    expect(entityMinima.has('compact_events_to_show')).toBe(true);
  });

  it.each([...cardMinima].filter(([name]) => name in Config.DEFAULT_CONFIG))(
    'card-wide %s accepts its declared floor and rejects one below it',
    (name, min) => {
      const atFloor = Config.normalizeNumericOptions({
        ...Config.DEFAULT_CONFIG,
        [name]: min,
      } as unknown as Types.Config) as unknown as Record<string, unknown>;

      const belowFloor = Config.normalizeNumericOptions({
        ...Config.DEFAULT_CONFIG,
        [name]: min - 1,
      } as unknown as Types.Config) as unknown as Record<string, unknown>;

      expect(atFloor[name]).toBe(min);
      // Rejection may surface as undefined or as a fallback to the default, so
      // assert only that the below-floor value is not the one the card keeps.
      expect(belowFloor[name]).not.toBe(min - 1);
    },
  );

  it('per-calendar compact_events_to_show accepts its declared floor', () => {
    const min = entityMinima.get('compact_events_to_show') as number;

    const atFloor = Config.normalizeEntities([
      { entity: 'calendar.personal', compact_events_to_show: min },
    ] as unknown as Parameters<typeof Config.normalizeEntities>[0]);

    const belowFloor = Config.normalizeEntities([
      { entity: 'calendar.personal', compact_events_to_show: min - 1 },
    ] as unknown as Parameters<typeof Config.normalizeEntities>[0]);

    expect(atFloor[0].compact_events_to_show).toBe(min);
    expect(belowFloor[0].compact_events_to_show).not.toBe(min - 1);
  });

  it('keeps compact_days_to_show at one, as the runtime requires', () => {
    // The neighbouring option in the same editor row genuinely rejects zero, so
    // it is the control proving these floors are not simply all being lowered.
    expect(cardMinima.get('compact_days_to_show')).toBe(1);
    expect(cardMinima.get('compact_events_to_show')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { hitIds, searchIndex } from './helpers/search-index';
import type * as Types from '../src/config/types';
import { parseFieldId } from '../src/rendering/editor/field-index';
import { walkSchema } from '../src/rendering/editor/panels';
import {
  ACCENT_COLOR_MODE,
  LABEL_IMAGE_SOURCE,
  LABEL_TYPE,
  buildEntitySchema,
  entityConfigKeys,
  entitySchemaFor,
} from '../src/rendering/editor/schemas/entity';
import { SYNTHETIC_FIELDS, configKeysForField } from '../src/rendering/editor/synthetic';
import { WORKSPACES } from '../src/rendering/editor/workspace';

/**
 * Searching the YAML key of an option finds the control that writes it.
 *
 * Most controls are named after the key they write, so their name was always searchable.
 * A derived control is not — `time_format` writes `time_24h`, `week_number_mode` writes
 * `show_week_numbers` — and search used to read only the name, so a key copied out of the
 * configuration reference found nothing for exactly the controls whose label differs most
 * from it.
 *
 * Reconciled against the mappings the editor writes through, `configKeysForField` and
 * `entityConfigKeys`, rather than a list of known cases, so the next derived control is
 * covered without being named here. Each field is its own row of the jump list, so a query
 * finding it lists that row, whatever else it lists.
 */

/**
 * Configurations that between them reveal every conditional control. A synthetic field
 * shown only in one mode (a fixed height, a relative start date, an icon indicator) is
 * absent from the default schema, and a test that never builds it cannot speak for it —
 * the coverage assertion below fails if a new one is added without a config here.
 */
const CARD_CONFIGS: ReadonlyArray<Partial<Types.Config>> = [
  {},
  { height: '400px' },
  { max_height: '400px' },
  { start_date: '2026-10-21' },
  { start_date: 'today+2' },
  { remove_location_country: 'USA|Germany' },
  { today_indicator: 'mdi:star' },
  { today_indicator: '⭐' },
  { allday_badge: 'title' },
  { allday_badge: 'time', allday_badge_color: '#ff0000' },
  { language: 'de' },
  { show_countdown: true },
];

describe('editor search finds the control that writes a key', () => {
  it('for every card-wide control, in every workspace', () => {
    const misses: string[] = [];
    const seen = new Set<string>();
    let checked = 0;

    for (const overrides of CARD_CONFIGS) {
      const config = buildConfig({ entities: ['calendar.anna'], ...overrides });

      for (const workspace of WORKSPACES) {
        const index = searchIndex(config, { workspace });

        for (const { target } of index) {
          if (target.kind !== 'field') continue;
          const { dataPath, name } = parseFieldId(target.id);
          seen.add(name);

          for (const key of configKeysForField(name)) {
            const qualified = [...dataPath, key].join('.');
            for (const query of new Set([key, qualified])) {
              checked++;
              if (!hitIds(index, query).includes(target.id)) {
                misses.push(`${workspace}: "${query}" misses ${target.id}`);
              }
            }
          }
        }
      }
    }

    expect(checked, 'no card-wide control was checked').toBeGreaterThan(100);
    expect([...new Set(misses)]).toEqual([]);

    // Every derived control was actually built and asked about. Without this the test
    // would pass vacuously for any synthetic field the configurations above never reveal.
    const unseen = Object.keys(SYNTHETIC_FIELDS).filter((name) => !seen.has(name));
    expect(unseen, 'synthetic fields no configuration above reveals').toEqual([]);
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('for every per-calendar control, in every shape it takes', () => {
    const config = buildConfig({ entities: ['calendar.anna'] });
    const base = buildEntitySchema({ view: 'list', config, language: 'en' });

    /** The values a dropdown in the per-calendar schema offers. */
    const offered = (name: string): string[] => {
      for (const { node } of walkSchema(base)) {
        if (node.name !== name || !('selector' in node) || !('select' in node.selector)) continue;
        return (node.selector.select?.options ?? []).map((option) =>
          typeof option === 'string' ? option : String(option.value),
        );
      }
      throw new Error(`no dropdown ${name} in the per-calendar schema`);
    };

    const misses: string[] = [];
    const seen = new Set<string>();
    let checked = 0;

    for (const type of offered(LABEL_TYPE)) {
      for (const accent of offered(ACCENT_COLOR_MODE)) {
        for (const iconSource of ['custom', 'home_assistant']) {
          for (const imageSource of offered(LABEL_IMAGE_SOURCE)) {
            const schema = entitySchemaFor(base, type, accent, iconSource, true, imageSource);

            for (const workspace of WORKSPACES) {
              const index = searchIndex(config, { workspace, entrySchemas: [schema] });

              for (const { target } of index) {
                if (target.kind !== 'entry-field') continue;
                const { name } = parseFieldId(target.id);
                seen.add(name);

                for (const key of entityConfigKeys(name)) {
                  checked++;
                  if (!hitIds(index, key).includes(`${target.id}@0`)) {
                    misses.push(`${workspace} ${type}/${accent}: "${key}" misses ${name}`);
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(checked, 'no per-calendar control was checked').toBeGreaterThan(50);
    expect([...new Set(misses)]).toEqual([]);
    for (const derived of [LABEL_TYPE, ACCENT_COLOR_MODE, LABEL_IMAGE_SOURCE]) {
      expect(seen, `${derived} was never built`).toContain(derived);
    }
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it.each([
    ['time_24h', 'time_format'],
    ['show_week_numbers', 'week_number_mode'],
    ['remove_location_country', 'location_country_mode'],
  ])('finds the derived control for %s', (key, control) => {
    // Three of the four keys the editor guide used to list as unsearchable, as named cases: the
    // reconciliation above covers them too, but a failure here reads as the regression it is.
    const index = searchIndex(buildConfig({ entities: ['calendar.anna'] }));
    const found = hitIds(index, key).map((id) => parseFieldId(id.split('@')[0]).name);

    expect(found).toContain(control);
  });
});

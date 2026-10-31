import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import {
  type FilterCtx,
  NO_FILTER,
  matchesQuery,
  withholdInertFields,
} from '../src/rendering/editor/filter';
import { type HaFormSchema, isGroupSchema } from '../src/rendering/editor/ha-form';
import { PANELS, type SchemaCtx, walkSchema } from '../src/rendering/editor/panels';
import { ENTITY_PATH } from '../src/rendering/editor/schemas/calendars';
import {
  ACCENT_COLOR_MODE,
  LABEL_IMAGE_SOURCE,
  LABEL_TYPE,
  buildEntitySchema,
  entityConfigKeys,
  entitySchemaFor,
} from '../src/rendering/editor/schemas/entity';
import { SYNTHETIC_FIELDS, configKeysForField } from '../src/rendering/editor/synthetic';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';

/**
 * Searching the YAML key of an option finds the control that writes it.
 *
 * Most controls are named after the key they write, so their name was always searchable.
 * A derived control is not — `time_format` writes `time_24h`, the calendar picker writes
 * `entities` — and search used to read only the name, so a key copied out of the
 * configuration reference found nothing for exactly the controls whose label differs most
 * from it.
 *
 * Reconciled against the mappings the editor writes through, `configKeysForField` and
 * `entityConfigKeys`, rather than a list of known cases, so the next derived control is
 * covered without being named here. Each leaf is matched on its own, with its own label
 * and data paths: asking whether it survives `filterSchema` would pass for any leaf inside
 * a group that happens to match, because a matching group keeps all of its children.
 */

/** The query a context carries, with nothing else filtered. */
function searching<T extends SchemaCtx>(ctx: T, query: string): T & FilterCtx {
  return { ...ctx, criteria: { ...NO_FILTER, query } };
}

/** Whether a node is a setting rather than a group or a sub-heading. */
function isLeaf(node: HaFormSchema): boolean {
  return !isGroupSchema(node) && !('type' in node && node.type === 'constant');
}

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
];

/** The context a panel is built and searched in, for one editing workspace. */
function cardCtx(config: Types.Config, workspace: EditorWorkspace): SchemaCtx {
  return {
    view: workspace === 'shared' ? 'list' : workspace,
    workspace,
    config,
    language: 'en',
  };
}

describe('editor search finds the control that writes a key', () => {
  it('for every card-wide control, in every workspace', () => {
    const misses: string[] = [];
    const seen = new Set<string>();
    let checked = 0;

    for (const overrides of CARD_CONFIGS) {
      const config = buildConfig({ entities: ['calendar.anna'], ...overrides });

      for (const workspace of WORKSPACES) {
        const ctx = cardCtx(config, workspace);

        for (const panel of PANELS) {
          const schema = withholdInertFields(panel.build(ctx), workspace);

          for (const { node, path, dataPath } of walkSchema(schema)) {
            if (!isLeaf(node)) continue;
            seen.add(node.name);

            for (const key of configKeysForField(node.name)) {
              const qualified = [...dataPath, key].join('.');
              for (const query of new Set([key, qualified])) {
                checked++;
                if (!matchesQuery(node, path, searching(ctx, query), dataPath)) {
                  misses.push(`${workspace} ${panel.id}: "${query}" misses ${node.name}`);
                }
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
  });

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
              const ctx: FilterCtx = {
                ...searching(cardCtx(config, workspace), ''),
                scope: 'entity',
              };

              for (const { node, path } of walkSchema(schema, ENTITY_PATH, [])) {
                if (!isLeaf(node)) continue;
                seen.add(node.name);

                for (const key of entityConfigKeys(node.name)) {
                  checked++;
                  if (!matchesQuery(node, path, searching(ctx, key))) {
                    misses.push(`${workspace} ${type}/${accent}: "${key}" misses ${node.name}`);
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
  });

  it.each([
    ['time_24h', 'time_format'],
    ['show_week_numbers', 'week_number_mode'],
    ['remove_location_country', 'location_country_mode'],
    ['entities', 'calendars'],
  ])('finds the derived control for %s', (key, control) => {
    // The four keys the editor guide used to list as unsearchable, as named cases: the
    // reconciliation above covers them too, but a failure here reads as the regression it is.
    const config = buildConfig({ entities: ['calendar.anna'] });
    const ctx = searching(cardCtx(config, 'shared'), key);
    const found: string[] = [];

    for (const panel of PANELS) {
      for (const { node, path, dataPath } of walkSchema(panel.build(ctx))) {
        if (isLeaf(node) && matchesQuery(node, path, ctx, dataPath)) found.push(node.name);
      }
    }

    expect(found).toContain(control);
  });
});

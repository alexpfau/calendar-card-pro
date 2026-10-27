/**
 * Every Example Stories card uses only options the card has, in the place the card reads them.
 *
 * The stories are the pages readers copy whole, and nothing else checks their option names:
 * `check:docs` verifies a card example's structure, not its keys, and the card itself ignores
 * an unknown key without a word. So a misspelled option, a key under the wrong view block, or
 * a per-calendar option that `normalizeEntities` drops would ship in a copy-paste card that
 * renders, looks plausible, and silently does less than its page says.
 *
 * Each rule reconciles against the code's own tables rather than a list kept here, so a new
 * option is covered the day it lands. A planted card runs first and must trip every rule, so a
 * clean page means the rules ran rather than that they could not fire.
 */
import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { STORY_GUIDES, readGuideCard } from './guide-config';
import {
  DEFAULT_CONFIG,
  DEPRECATED_CONFIG_MAP,
  DEPRECATED_ENTITY_CONFIG_MAP,
  normalizeEntities,
} from '../src/config/config';
import type * as Types from '../src/config/types';
import {
  COLUMN_ONLY_KEYS,
  COLUMN_OVERRIDE_KEYS,
  LIST_OVERRIDE_KEYS,
  TIME_GRID_ONLY_KEYS,
  reachableViews,
  viewBlockFor,
} from '../src/config/view';
import { ambiguousRootKeys } from '../src/rendering/editor/value';

type Card = Record<string, unknown>;

const VIEW_BLOCK_KEYS: Record<string, ReadonlySet<string>> = {
  list: new Set<string>(LIST_OVERRIDE_KEYS),
  column: new Set<string>([...COLUMN_OVERRIDE_KEYS, ...COLUMN_ONLY_KEYS]),
  time_grid: new Set<string>([...COLUMN_OVERRIDE_KEYS, ...TIME_GRID_ONLY_KEYS]),
};
const TOOLBAR_KEYS = new Set(Object.keys(DEFAULT_CONFIG.toolbar ?? {}));
const WEATHER_KEYS: Record<string, ReadonlySet<string>> = {
  '': new Set(Object.keys(DEFAULT_CONFIG.weather ?? {})),
  date: new Set(Object.keys(DEFAULT_CONFIG.weather?.date ?? {})),
  event: new Set(Object.keys(DEFAULT_CONFIG.weather?.event ?? {})),
};
const ROOT_KEYS = new Set([
  ...Object.keys(DEFAULT_CONFIG),
  'type',
  'config_version',
  'list',
  'column',
  'time_grid',
]);

const keysOf = (value: unknown): string[] =>
  value && typeof value === 'object' ? Object.keys(value as object) : [];

/** Every way the card would misread `card`, as one line each. */
function problems(card: Card): string[] {
  const out: string[] = [];
  for (const key of Object.keys(card)) {
    if (key in DEPRECATED_CONFIG_MAP) out.push(`deprecated ${key}`);
    else if (!ROOT_KEYS.has(key)) out.push(`unknown ${key}`);
  }
  for (const key of keysOf(card.toolbar)) {
    if (!TOOLBAR_KEYS.has(key)) out.push(`unknown toolbar.${key}`);
  }
  const weather = (card.weather ?? {}) as Record<string, unknown>;
  for (const key of keysOf(weather)) {
    if (!WEATHER_KEYS[''].has(key)) out.push(`unknown weather.${key}`);
  }
  for (const part of ['date', 'event'] as const) {
    for (const key of keysOf(weather[part])) {
      if (!WEATHER_KEYS[part].has(key)) out.push(`unknown weather.${part}.${key}`);
    }
  }
  for (const [block, allowed] of Object.entries(VIEW_BLOCK_KEYS)) {
    for (const key of keysOf(card[block])) {
      if (!allowed.has(key)) out.push(`${block}.${key} is not read there`);
    }
  }

  // A per-calendar key must survive the hand-written projection in `normalizeEntities`,
  // unchanged, or it never reaches anything (AGENTS.md, "A new per-calendar option must be
  // added to a hand-written whitelist").
  const entities = (card.entities ?? []) as Array<Record<string, unknown>>;
  const kept = normalizeEntities(entities as Parameters<typeof normalizeEntities>[0]);
  entities.forEach((entity, i) => {
    for (const [key, value] of Object.entries(entity)) {
      if (key in DEPRECATED_ENTITY_CONFIG_MAP) out.push(`deprecated entities[${i}].${key}`);
      else if ((kept[i] as unknown as Record<string, unknown>)[key] !== value) {
        out.push(`entities[${i}].${key} is dropped`);
      }
    }
  });

  // Without `config_version: 5` a root key that a view defaults differently makes the editor
  // ask the reader how to migrate a card they have just pasted.
  const ambiguous = ambiguousRootKeys(card);
  if (ambiguous.length > 0 && card.config_version !== 5) {
    out.push(`no config_version: 5 beside ${ambiguous.join(', ')}`);
  }

  // A root value never reaches a view whose block carries its own default for that key, so
  // a page describing it as card-wide would be describing nothing in that view.
  const merged = buildConfig(card as unknown as Partial<Types.Config>);
  for (const view of reachableViews(merged)) {
    const blockKey = view === 'grid' ? 'time_grid' : view;
    const own = (card[blockKey] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(viewBlockFor(view)?.defaultOverrides ?? {})) {
      if (key in card && !(key in own)) out.push(`${key} is shadowed in ${view} by its default`);
    }
  }
  return out;
}

describe('the Example Stories cards', () => {
  it('trips every rule on a planted card, so a clean page means the rules ran', () => {
    const planted = problems({
      type: 'custom:calendar-card-pro',
      view: 'grid',
      max_events_to_show: 3,
      tint: 'red',
      toolbar: { show: true, labels: true },
      weather: { entity: 'weather.home', event: { show_temperature: true } },
      list: { start_time: '07:00' },
      show_location: false,
      entities: [{ entity: 'calendar.a', hue: 'red', max_events_to_show: 1 }],
    });
    expect(planted.sort()).toEqual(
      [
        'deprecated max_events_to_show',
        'unknown tint',
        'unknown toolbar.labels',
        'unknown weather.event.show_temperature',
        'list.start_time is not read there',
        'entities[0].hue is dropped',
        'deprecated entities[0].max_events_to_show',
        'no config_version: 5 beside show_location',
        'show_location is shadowed in grid by its default',
      ].sort(),
    );
  });

  it.each(STORY_GUIDES.map((page) => [page.split('/').pop() as string, page]))(
    '%s prints one card whose every option the card reads',
    (_name, page) => {
      const { config, entities } = readGuideCard(page);
      // The denominator: a page read as nothing would pass every rule below.
      expect(config.type).toBe('custom:calendar-card-pro');
      expect(entities.length).toBeGreaterThan(0);
      expect(config.config_version).toBe(5);
      expect(problems(config)).toEqual([]);
    },
  );
});

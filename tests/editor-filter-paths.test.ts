import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import {
  type FilterCriteria,
  type FilterCtx,
  NO_FILTER,
  filterSchema,
  isCustomized,
} from '../src/rendering/editor/filter';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { PANELS, walkSchema } from '../src/rendering/editor/panels';
import { stripColumnDefaults } from '../src/rendering/editor/value';

/**
 * The editor's search index and its translation keys are both built from a node's enclosing
 * path, but those two paths are not the same path. A `scope()` group extends the
 * configuration path without extending the label path, so its fields must stay findable by
 * their real configuration key without their translation keys moving. A partially written
 * nested block, meanwhile, leaves its remaining keys absent rather than defaulted, and a
 * column value that the render path coerces must not read as customized once it coerces to
 * the default.
 */

function ctxFor(config: Types.Config, criteria: Partial<FilterCriteria> = {}): FilterCtx {
  return {
    language: 'en',
    view: config.view === 'column' ? 'column' : 'list',
    config,
    criteria: { ...NO_FILTER, ...criteria },
  };
}

function fieldNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...walkSchema(schema)]
    .filter(({ node }) => !('schema' in node))
    .map(({ node }) => node.name);
}

function searchIn(panelId: string, query: string, config: Types.Config): string[] {
  const panel = PANELS.find((entry) => entry.id === panelId);
  if (!panel) throw new Error(`no panel ${panelId}`);
  const ctx = ctxFor(config, { query });

  return fieldNames(filterSchema(panel.build({ view: ctx.view, config, language: 'en' }), ctx));
}

function nodeNamed(panelId: string, name: string, config: Types.Config): HaFormSchema {
  const panel = PANELS.find((entry) => entry.id === panelId);
  if (!panel) throw new Error(`no panel ${panelId}`);
  const built = panel.build({
    view: config.view === 'column' ? 'column' : 'list',
    config,
    language: 'en',
  });
  for (const { node } of walkSchema(built)) if (node.name === name) return node;
  throw new Error(`no node ${name} in ${panelId}`);
}

const WITH_WEATHER = () =>
  buildConfig({
    weather: { entity: 'weather.home', position: 'both' } as unknown as Types.WeatherConfig,
  });

describe('editor search resolves configuration paths as well as label paths', () => {
  it.each([
    ['weather.position', 'position'],
    ['weather.date.show_high_temp', 'show_high_temp'],
    ['weather.event.show_temp', 'show_temp'],
  ])('finds %s by its configuration path', (query, expected) => {
    expect(searchIn('weather', query, WITH_WEATHER())).toContain(expected);
  });

  it.each([
    ['date.show_high_temp', 'show_high_temp'],
    ['event.show_temp', 'show_temp'],
  ])('still finds %s by its label path, so translation keys are unchanged', (query, expected) => {
    expect(searchIn('weather', query, WITH_WEATHER())).toContain(expected);
  });

  it('still finds a field nested under an expandable by its qualified path', () => {
    expect(searchIn('events', 'location.show_location', buildConfig())).toContain('show_location');
  });

  it('still finds a field by its bare name', () => {
    expect(searchIn('weather', 'position', WITH_WEATHER())).toContain('position');
  });

  it('returns nothing for a path that does not exist', () => {
    expect(searchIn('weather', 'weather.date.no_such_field', WITH_WEATHER())).toEqual([]);
  });
});

describe('customized-only ignores keys a partial block never wrote', () => {
  it('does not flag a weather field when only the entity was configured', () => {
    const config = WITH_WEATHER();

    expect(
      isCustomized(
        nodeNamed('weather', 'show_high_temp', config),
        ['weather', 'date'],
        ctxFor(config),
      ),
    ).toBe(false);
  });

  it('still flags a weather field the user did set', () => {
    const config = buildConfig({
      weather: {
        entity: 'weather.home',
        date: { show_high_temp: false },
      } as unknown as Types.WeatherConfig,
    });

    expect(
      isCustomized(
        nodeNamed('weather', 'show_high_temp', config),
        ['weather', 'date'],
        ctxFor(config),
      ),
    ).toBe(true);
  });

  it('does not flag anything in an untouched configuration', () => {
    const config = WITH_WEATHER();

    expect(
      isCustomized(
        nodeNamed('weather', 'show_conditions', config),
        ['weather', 'date'],
        ctxFor(config),
      ),
    ).toBe(false);
  });
});

describe('customized-only compares column values the way the render path resolves them', () => {
  const columnConfig = (min_day_width: unknown) =>
    buildConfig({
      view: 'column',
      column: { min_day_width } as unknown as Types.ColumnOverrides,
    });

  it('does not flag a string that coerces to the default', () => {
    const config = columnConfig('140');

    expect(
      isCustomized(nodeNamed('layout', 'min_day_width', config), ['column'], ctxFor(config)),
    ).toBe(false);
  });

  it('does not flag the default written as a number', () => {
    const config = columnConfig(140);

    expect(
      isCustomized(nodeNamed('layout', 'min_day_width', config), ['column'], ctxFor(config)),
    ).toBe(false);
  });

  it('still flags a genuinely different value', () => {
    const config = columnConfig(220);

    expect(
      isCustomized(nodeNamed('layout', 'min_day_width', config), ['column'], ctxFor(config)),
    ).toBe(true);
  });

  it.each([
    ['140', undefined],
    [140, undefined],
    ['220', '220'],
    [220, 220],
  ])('strips %s from the stored block as %s', (written, kept) => {
    const stripped = stripColumnDefaults(columnConfig(written));

    expect(stripped?.min_day_width).toBe(kept);
  });
});

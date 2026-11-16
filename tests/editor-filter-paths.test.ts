import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { hitIds, searchIndex } from './helpers/search-index';
import type * as Types from '../src/config/types';
import { parseFieldId } from '../src/rendering/editor/field-index';
import { stripColumnDefaults } from '../src/rendering/editor/value';

/**
 * The editor's search index (`search.ts`) and its translation keys are both built from a node's
 * enclosing path, but those two paths are not the same path. A `scope()` group extends the
 * configuration path without extending the label path, so its fields must stay findable by
 * their real configuration key without their translation keys moving. A column value an edit
 * writes is stored only when it does not coerce to the default.
 */

/** The names of a panel's fields a query lists in the jump list. */
function searchIn(panelId: string, query: string, config: Types.Config): string[] {
  const workspace = config.view === 'column' ? 'column' : 'shared';
  return hitIds(searchIndex(config, { workspace }), query)
    .map((id) => parseFieldId(id))
    .filter(({ scope }) => scope === panelId)
    .map(({ name }) => name);
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

  it('still finds a field by its bare name', () => {
    expect(searchIn('weather', 'position', WITH_WEATHER())).toContain('position');
  });

  it('returns nothing for a path that does not exist', () => {
    expect(searchIn('weather', 'weather.date.no_such_field', WITH_WEATHER())).toEqual([]);
  });
});

describe('the write path reads column values the way the card does', () => {
  const columnConfig = (min_day_width: unknown) =>
    buildConfig({
      view: 'column',
      column: { min_day_width } as unknown as Types.ColumnOverrides,
    });

  // Not held by the YAML here, so a value that stays is stored as the card resolves it, as grid
  // always did; `tests/editor-view-block-strip.test.ts` pins the held spelling.
  it.each([
    ['140', undefined],
    [140, undefined],
    ['220', 220],
    [220, 220],
  ])('strips %j from the stored block as %j', (written, kept) => {
    const stripped = stripColumnDefaults(columnConfig(written));

    expect(stripped?.min_day_width).toBe(kept);
  });
});

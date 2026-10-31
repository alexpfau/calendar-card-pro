import { render as litRender } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS, FROZEN_NOW } from './fixtures';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Column from '../src/rendering/column';
import * as Grid from '../src/rendering/grid';
import * as Render from '../src/rendering/render';
import * as EventUtils from '../src/utils/events';

/**
 * The null-config class gate.
 *
 * ## Why this exists
 *
 * A blank length option (`height: ''` in the visual editor, which reaches `setConfig`
 * as an empty string and then `null`) hard-crashed the card at render. That was fixed
 * for the two keys it was reported against. This file exists because fixing two keys
 * does not close the class: *any* option that a renderer reads without a guard can do
 * the same, and there is no reason the editor can only blank those two.
 *
 * So rather than pin the two known instances, this sweeps **every** key in
 * `DEFAULT_CONFIG`, sets it to `null` one at a time, and drives the real pipeline
 * through **all three** renderers. Grid-only options get a second sweep through the
 * `time_grid:` block. A new option added without a guard fails here on the day
 * it is added, which is the only version of this test worth having.
 *
 * ## Why all three views
 *
 * `renderGroupedEvents` does not dispatch on view — column and grid are separate
 * renderers in `column.ts` and `grid.ts`. Sweeping the list alone would cover the keys
 * through only one of three paths and miss the views v4 and v5 exist to add. That is not hypothetical: with the
 * length coercion removed, the list crashes on 2 keys and the column on **3** — the
 * same two plus `day_spacing`, which only the column renderer reads (via
 * `sanitizeGutter`). Validated against the list alone, that third instance of the
 * original defect would not have been visible.
 *
 * ## Why the real `setConfig` pipeline and not `buildConfig`
 *
 * `tests/fixtures.ts` `buildConfig` calls `normalizeNumericOptions` but **not**
 * `normalizeLengthOptions`. That is exactly the gap the original crash came through:
 * a test written against `buildConfig` cannot see a length-coercion bug, because the
 * coercion it depends on never ran. This file therefore replays the five calls
 * `calendar-card-pro.ts` `setConfig` makes, in order, rather than reaching for the
 * convenient helper. If `setConfig` gains a sixth step, it belongs here too.
 *
 * The card element itself is deliberately not constructed — same reasoning as
 * `list-dom.test.ts`: that would need a fake `hass`, a mocked `callApi` and an async
 * fetch, none of which this gate is about. The three render paths used here
 * (`groupEventsByDay` → the list, column, or grid renderer → Lit) are what `render()`
 * dispatches to.
 */

/** The five normalization/validation calls `setConfig` makes, in source order. */
function realSetConfigPipeline(raw: Partial<Types.Config>): Types.Config {
  const config = { ...Config.DEFAULT_CONFIG, ...raw } as Types.Config;
  config.entities = Config.normalizeEntities(config.entities);
  Config.normalizeNumericOptions(config);
  Config.normalizeLengthOptions(config);
  ViewConfig.validateView(config);
  ViewConfig.validateColumnOverrides(config);
  return config;
}

/** Drive the populated list render path far enough to touch every leaf renderer. */
function renderList(config: Types.Config): void {
  const container = document.createElement('div');
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en');
  litRender(Render.renderGroupedEvents(days, config, 'en'), container);
}

/** The column equivalent — a separate renderer, not a branch of the list one. */
function renderColumn(config: Types.Config): void {
  const container = document.createElement('div');
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'column');
  litRender(Column.renderColumnGroupedEvents(days, config, 'en'), container);
}

/** The grid equivalent — a third independent renderer with its own option block. */
function renderGrid(config: Types.Config): void {
  const container = document.createElement('div');
  const effective = ViewConfig.resolveEffectiveConfig(config, 'grid');
  const days = EventUtils.groupEventsByDay(EVENTS, config, false, 'en', 'grid');
  litRender(Grid.renderGridGroupedEvents(days, effective, 'en', undefined, null), container);
}

describe('null-valued config options', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const keys = Object.keys(Config.DEFAULT_CONFIG) as (keyof Types.Config)[];

  it('sweeps a non-trivial number of keys', () => {
    // Guards the sweep itself: if DEFAULT_CONFIG were ever renamed or re-shaped, the
    // `it.each` below would silently iterate nothing and report all-green.
    expect(keys.length).toBeGreaterThan(50);
  });

  it.each(keys)('survives %s: null in the list view', (key) => {
    const config = realSetConfigPipeline({
      entities: ['calendar.test'],
      [key]: null,
    } as unknown as Partial<Types.Config>);

    expect(() => renderList(config)).not.toThrow();
  });

  it.each(keys)('survives %s: null in the column view', (key) => {
    // `view: 'column'` goes in *under* the null key, so when `key` is `view` itself the
    // null still wins and `validateView` falls back to list. Rendering that through the
    // column renderer anyway is deliberate: it is the mismatched-config case, and the
    // renderer should degrade rather than throw.
    const config = realSetConfigPipeline({
      entities: ['calendar.test'],
      view: 'column',
      [key]: null,
    } as unknown as Partial<Types.Config>);

    expect(() => renderColumn(config)).not.toThrow();
  });

  it.each(keys)('survives %s: null in the grid view', (key) => {
    const config = realSetConfigPipeline({
      entities: ['calendar.test'],
      view: 'grid',
      [key]: null,
    } as unknown as Partial<Types.Config>);

    expect(() => renderGrid(config)).not.toThrow();
  });

  const gridKeys = Object.keys(
    ViewConfig.TIME_GRID_DEFAULTS,
  ) as (keyof typeof ViewConfig.TIME_GRID_DEFAULTS)[];

  // Grid-only keys plus every key the block may override. The two halves resolve through
  // different functions — `resolveTimeGridOption` and `resolveEffectiveConfig` — and only
  // the first was swept. That was survivable while no override key had a divergent grid
  // default, because a card-level null was then the same null the renderer read and the
  // card-level sweep covered it. `day_spacing` broke that: grid substitutes its own value,
  // so the block is now the *only* place a null for it can reach the renderer.
  const gridBlockKeys = [...new Set<string>([...gridKeys, ...ViewConfig.TIME_GRID_OVERRIDE_KEYS])];

  it('sweeps a non-trivial number of grid-only keys', () => {
    expect(gridKeys.length).toBeGreaterThan(10);
    expect(gridBlockKeys.length).toBeGreaterThan(gridKeys.length);
  });

  it.each(gridBlockKeys)('survives time_grid.%s: null in the grid view', (key) => {
    const config = realSetConfigPipeline({
      entities: ['calendar.test'],
      view: 'grid',
      time_grid: { [key]: null },
    } as unknown as Partial<Types.Config>);

    expect(() => renderGrid(config)).not.toThrow();
  });

  it('detects a crash when the length coercion is skipped (positive control)', () => {
    // Without this control the sweeps above are unfalsifiable: a harness that swallowed
    // exceptions would report every key green. This reproduces the original defect by
    // omitting `normalizeLengthOptions` — the one step whose absence let the crash
    // through — and asserts the harness sees it.
    //
    // Measured denominators at the time of writing: 93 keys total, 19 of them altered by
    // the length coercion, of which 2 (`day_separator_width`, `week_separator_width`)
    // crash the list render without it. Those two are exactly the originally-reported
    // defect, so this control reproduces the real bug rather than a synthetic one.
    const lengthKeys = keys.filter((k) => {
      const probe = { ...Config.DEFAULT_CONFIG, [k]: null } as Types.Config;
      const before = JSON.stringify(probe[k] ?? null);
      Config.normalizeLengthOptions(probe);
      return JSON.stringify(probe[k] ?? null) !== before;
    });

    // A control whose denominator is zero passes vacuously, so assert it as well as the
    // verdict.
    expect(lengthKeys.length).toBeGreaterThan(10);

    const crashed = lengthKeys.filter((k) => {
      const config = {
        ...Config.DEFAULT_CONFIG,
        entities: ['calendar.test'],
        [k]: null,
      } as unknown as Types.Config;
      config.entities = Config.normalizeEntities(config.entities);
      Config.normalizeNumericOptions(config);
      // normalizeLengthOptions deliberately omitted.
      try {
        renderList(config);
        return false;
      } catch {
        return true;
      }
    });

    expect(crashed).toEqual(['day_separator_width', 'week_separator_width']);
  });

  it('detects a crash in the column renderer too (positive control, second path)', () => {
    // The list control above says nothing about the column harness: it is a different
    // function, and 93 of the sweeps above run through it. Without this, adding the
    // column pass would have doubled the test count without doubling the evidence.
    //
    // The column surface is strictly larger than the list's — the same two keys plus
    // `day_spacing`, which the column renderer feeds to `sanitizeGutter` and the list
    // never touches. That asymmetry is the reason this file sweeps both views rather
    // than assuming one stands in for the other: validated against the list alone,
    // `day_spacing` would have been an undetected third instance of the same defect.
    const crashed = keys.filter((k) => {
      const config = {
        ...Config.DEFAULT_CONFIG,
        entities: ['calendar.test'],
        view: 'column',
        [k]: null,
      } as unknown as Types.Config;
      config.entities = Config.normalizeEntities(config.entities);
      Config.normalizeNumericOptions(config);
      // normalizeLengthOptions deliberately omitted.
      try {
        renderColumn(config);
        return false;
      } catch {
        return true;
      }
    });

    expect(crashed).toEqual(['day_spacing', 'day_separator_width', 'week_separator_width']);
  });

  it('detects a crash in the grid renderer too (positive control, third path)', () => {
    // Grid has its own consumers: `day_spacing` reaches the timed-event gutter, while
    // `week_separator_width` reaches the day-header separator. Pin the exact non-empty
    // result so this control cannot pass merely because an unrelated key started throwing.
    //
    // 🚨 `day_spacing` is absent from the card-level set and its absence is the finding,
    // not a gap: grid substitutes its own `2px` default for that key, so a card-level
    // value — null included — never reaches the renderer at all. The block sweep above is
    // where a null for it can still arrive, and it is guarded there by a different
    // mechanism; see the second assertion.
    const crashIn = (place: 'card' | 'block') =>
      keys.filter((k) => {
        const config = {
          ...Config.DEFAULT_CONFIG,
          entities: ['calendar.test'],
          view: 'grid',
          ...(place === 'card' ? { [k]: null } : { time_grid: { [k]: null } }),
        } as unknown as Types.Config;
        config.entities = Config.normalizeEntities(config.entities);
        Config.normalizeNumericOptions(config);
        // normalizeLengthOptions deliberately omitted.
        try {
          renderGrid(config);
          return false;
        } catch {
          return true;
        }
      });

    expect(crashIn('card')).toEqual(['week_separator_width']);
    // `[]`, and the line above is what makes that readable rather than vacuous: the same
    // probe returns a key on the card-level arm in the same run. The block arm is empty
    // because `resolveEffectiveConfig` coerces every block value on its way onto the
    // config, so the block never depends on `normalizeLengthOptions` the way the card
    // level does. The `time_grid.*` sweep above is what covers that path.
    expect(crashIn('block')).toEqual([]);
  });
});

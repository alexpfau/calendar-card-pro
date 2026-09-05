/**
 * A config filled in on read must come back out minimal on write.
 *
 * `setConfig` deep-merges the user's YAML over `DEFAULT_CONFIG`, so the config the editor
 * holds carries every nested default explicitly. `toStoredConfig` is what strips them back
 * out when the editor saves. If the two ever disagree, the card rewrites the user's YAML
 * with ninety keys they never typed — the failure the deep merge was deferred over, and one
 * that would be found by users rather than by CI, because nothing about it is red.
 *
 * Each case asserts the exact stored object rather than a key count, so a default that
 * survives the strip fails here even if the total happens to match.
 */

import { describe, expect, it } from 'vitest';

import '../src/calendar-card-pro';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import { columnFormBlock, gridFormBlock, toStoredConfig } from '../src/rendering/editor/value';

/** The config `setConfig` would hold for a given piece of user YAML. */
function asSetConfigWould(raw: Record<string, unknown>): Types.Config {
  const merged = Config.mergeConfig(
    Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
    raw,
  ) as unknown as Types.Config;

  merged.entities = Config.normalizeEntities(merged.entities);
  Config.normalizeNumericOptions(merged);
  Config.normalizeLengthOptions(merged);
  return merged;
}

describe('setConfig and toStoredConfig round trip', () => {
  it('gives back only the calendars for a minimal config', () => {
    expect(toStoredConfig(asSetConfigWould({ entities: ['calendar.a'] }))).toEqual({
      entities: [{ entity: 'calendar.a' }],
    });
  });

  it('gives back only the entity for a weather block that names one', () => {
    // The case the deep merge exists for. On the way in this gains `position`, `date` and
    // `event`; on the way out it has to lose all three again.
    expect(
      toStoredConfig(
        asSetConfigWould({ entities: ['calendar.a'], weather: { entity: 'weather.home' } }),
      ),
    ).toEqual({
      entities: [{ entity: 'calendar.a' }],
      weather: { entity: 'weather.home' },
    });
  });

  it('keeps the one nested option the user changed, and nothing beside it', () => {
    expect(
      toStoredConfig(
        asSetConfigWould({
          entities: ['calendar.a'],
          weather: { entity: 'weather.home', event: { show_temp: false } },
        }),
      ),
    ).toEqual({
      entities: [{ entity: 'calendar.a' }],
      weather: { entity: 'weather.home', event: { show_temp: false } },
    });
  });

  it('keeps a partial action block whole', () => {
    expect(
      toStoredConfig(
        asSetConfigWould({
          entities: ['calendar.a'],
          tap_action: { action: 'navigate', navigation_path: '/lovelace/0' },
        }),
      ),
    ).toEqual({
      entities: [{ entity: 'calendar.a' }],
      tap_action: { action: 'navigate', navigation_path: '/lovelace/0' },
    });
  });

  it('keeps a column override without filling the block', () => {
    // `column` has no default block at all, so it takes a different path through both the
    // merge and the strip; a regression there would show as a filled-in block here.
    expect(
      toStoredConfig(
        asSetConfigWould({
          entities: ['calendar.a'],
          view: 'column',
          column: { day_spacing: '4px' },
        }),
      ),
    ).toEqual({
      entities: [{ entity: 'calendar.a' }],
      view: 'column',
      column: { day_spacing: '4px' },
    });
  });

  it('does not save projected column defaults when the editor is opened and left alone', () => {
    const config = asSetConfigWould({ entities: ['calendar.a'], view: 'column' });

    expect(toStoredConfig({ ...config, column: columnFormBlock(config) })).toEqual({
      entities: [{ entity: 'calendar.a' }],
      view: 'column',
    });
  });

  it('does not save projected grid defaults when the editor is opened and left alone', () => {
    const config = asSetConfigWould({ entities: ['calendar.a'], view: 'grid' });

    expect(toStoredConfig({ ...config, grid: gridFormBlock(config) })).toEqual({
      entities: [{ entity: 'calendar.a' }],
      view: 'grid',
    });
  });

  it('control: a genuinely changed top-level option is kept', () => {
    // Without this, every assertion above is satisfied by a strip that drops everything.
    expect(toStoredConfig(asSetConfigWould({ entities: ['calendar.a'], days_to_show: 7 }))).toEqual(
      {
        entities: [{ entity: 'calendar.a' }],
        days_to_show: 7,
      },
    );
  });
});

/**
 * The same contract, reached through the element rather than through a helper.
 *
 * Everything above calls `mergeConfig` directly, which is the producer — not the path
 * production takes. Reverting `setConfig` to its old shallow spread left every assertion
 * above passing, because none of them touches the card. These drive the real custom
 * element, so the wiring is pinned rather than the function it is wired to.
 */
describe('the card element fills nested blocks on setConfig', () => {
  interface CardUnderTest extends HTMLElement {
    setConfig(config: unknown): void;
    config: Types.Config;
  }

  function configure(raw: Record<string, unknown>): Types.Config {
    const card = document.createElement('calendar-card-pro-dev') as unknown as CardUnderTest;
    card.setConfig(raw);
    return card.config;
  }

  it('keeps the weather defaults a partial block does not mention', () => {
    const config = configure({ entities: ['calendar.a'], weather: { entity: 'weather.home' } });

    expect(config.weather?.entity).toBe('weather.home');
    expect(config.weather?.position).toBe(Config.DEFAULT_CONFIG.weather?.position);
    expect(config.weather?.event?.icon_size).toBe(Config.DEFAULT_CONFIG.weather?.event?.icon_size);
  });

  it('still replaces the calendar list rather than merging it', () => {
    // The control: the element must not have started deep-merging arrays either.
    expect(configure({ entities: ['calendar.only'] }).entities).toEqual([
      { entity: 'calendar.only' },
    ]);
  });
});

/**
 * The panel binds a whole view block as one expandable `ha-form` field and writes it back
 * wholesale, so whatever the form block omits is deleted from the user's YAML the moment
 * the user touches any option in that panel. That makes the block a data-preservation
 * contract, not just a display convenience.
 *
 * 🚨 Driven off {@link ViewConfig.VIEW_BLOCKS} rather than a written-out list of views,
 * and the override key is *found* on each block rather than named. A third view therefore
 * arrives here already covered, which a hardcoded pair would not — `AGENTS.md` records
 * three separate occasions where a note beside a family protected only the member it sat
 * next to.
 *
 * The key each case stores is deliberately an `overrideKeys` member, never an
 * `onlyDefaults` one. The form block projects the defaults, so a fixture storing one of
 * those is reproduced by the projection whether the stored block is read at all — which
 * is precisely why every fixture that existed before this, all of them storing
 * `min_day_width`, stayed green while the block silently dropped overrides for both
 * views.
 */
describe('a view block survives the round trip the panel puts it through', () => {
  const formBlockFor: Record<string, (config: Types.Config) => Record<string, unknown>> = {
    column: columnFormBlock,
    grid: gridFormBlock,
  };

  it.each(Object.keys(ViewConfig.VIEW_BLOCKS))('keeps a stored %s override', (view) => {
    const block = ViewConfig.VIEW_BLOCKS[view as Types.EffectiveView];
    const buildBlock = formBlockFor[view];

    // Every view in the registry needs a form block here. A new one that reaches the
    // panel without one is the gap this reconciliation exists to report.
    expect(block, view).toBeDefined();
    expect(buildBlock, `no form block wired for view '${view}'`).toBeDefined();

    // A boolean override that ships `true`, so storing `false` is a real difference the
    // strip cannot mistake for the inherited value. Found on the block, not named here.
    const key = block!.overrideKeys.find(
      (candidate) =>
        (Config.DEFAULT_CONFIG as unknown as Record<string, unknown>)[candidate] === true &&
        !(candidate in block!.defaultOverrides),
    );

    expect(key, `${view} has no boolean override to test with`).toBeDefined();

    const config = asSetConfigWould({
      entities: ['calendar.a'],
      view,
      [view]: { [key!]: false },
    });

    expect(buildBlock(config)[key!], `${view}.${key} missing from the form block`).toBe(false);
    expect(toStoredConfig({ ...config, [view]: buildBlock(config) })).toEqual({
      entities: [{ entity: 'calendar.a' }],
      view,
      [view]: { [key!]: false },
    });
  });

  it.each([
    ['column', 'day_spacing', '4px'],
    ['grid', 'event_background_opacity', 55],
  ] as const)('keeps a stored non-boolean %s.%s', (view, key, value) => {
    // The reconciliation above can only pick a boolean. These two pin a length and a
    // number, so a strip that mishandled one type would not hide behind the other.
    const config = asSetConfigWould({ entities: ['calendar.a'], view, [view]: { [key]: value } });
    const block = formBlockFor[view](config);

    expect(block[key], `${view}.${key} missing from the form block`).toBe(value);
    expect(toStoredConfig({ ...config, [view]: block })).toEqual({
      entities: [{ entity: 'calendar.a' }],
      view,
      [view]: { [key]: value },
    });
  });
});

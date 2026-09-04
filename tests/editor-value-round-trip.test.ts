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

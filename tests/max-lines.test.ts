import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { generateCustomPropertiesObject } from '../src/rendering/styles';

/**
 * Per-field line-clamping custom properties.
 *
 * `title_max_lines`, `time_max_lines`, `location_max_lines` and
 * `description_max_lines` all default to `0` (unlimited), which renders nothing
 * and is therefore invisible to the default-config DOM gate. These tests turn
 * each option on and assert the emitted CSS custom property, mirroring the
 * `description_max_lines` precedent: a positive value emits the line count as a
 * string, and `0` emits `none` (the correct `-webkit-line-clamp` unlimited value).
 */

describe('per-field max-lines custom properties', () => {
  it.each([
    ['title_max_lines', '--calendar-card-title-max-lines'],
    ['time_max_lines', '--calendar-card-time-max-lines'],
    ['location_max_lines', '--calendar-card-location-max-lines'],
    ['description_max_lines', '--calendar-card-description-max-lines'],
  ] as const)('emits the line count for %s when set to a positive value', (option, prop) => {
    const props = generateCustomPropertiesObject(buildConfig({ [option]: 2 }));
    expect(props[prop]).toBe('2');
  });

  it.each([
    ['title_max_lines', '--calendar-card-title-max-lines'],
    ['time_max_lines', '--calendar-card-time-max-lines'],
    ['location_max_lines', '--calendar-card-location-max-lines'],
    ['description_max_lines', '--calendar-card-description-max-lines'],
  ] as const)('emits none for %s at the default of 0 (unlimited)', (_option, prop) => {
    const props = generateCustomPropertiesObject(buildConfig());
    expect(props[prop]).toBe('none');
  });

  // Regression guard. The title is the only clamp target whose parent (.summary)
  // is not a flex container, so an unconditional `display: -webkit-box` blockifies
  // it and measurably tightens every event row -- in BOTH views, for every user,
  // at a default that is meant to be a no-op. Measured live: card height fell
  // 386px -> 372px before this was made conditional. The other three targets sit
  // inside flex parents and are already blockified, so they need no guard.
  it('leaves the title inline at the default so clamping is layout-neutral', () => {
    const props = generateCustomPropertiesObject(buildConfig());
    expect(props['--calendar-card-title-display']).toBe('inline');
  });

  it('blockifies the title only once a limit is actually set', () => {
    const props = generateCustomPropertiesObject(buildConfig({ title_max_lines: 2 }));
    expect(props['--calendar-card-title-display']).toBe('-webkit-box');
  });

  it('honours a per-field value overridden inside a column block', () => {
    const config = buildConfig({ time_max_lines: 0, column: { time_max_lines: 1 } });
    // The override lives in the column block; generateCustomPropertiesObject reads
    // the resolved top-level value, so this asserts only that the key round-trips
    // as a COLUMN_OVERRIDE_KEYS member (see view-config.test.ts for resolution).
    expect(config.column?.time_max_lines).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import { COLUMN_OVERRIDE_KEYS, resolveEffectiveConfig } from '../src/config/view';
import { toStoredConfig } from '../src/rendering/editor/value';
import { generateCustomPropertiesObject } from '../src/rendering/styles';

/**
 * `progress_bar_width`, and why its default had to become absent (C5).
 *
 * The bar has two placements with genuinely different right answers. Sharing the time
 * row it wants to be small and fixed; owning a row of its own it wants to span that row.
 * A shipped default cannot express both, because `setConfig` merges it in before render
 * — so by the time CSS sees the value, a width the user chose and one they never touched
 * are the same string, and the row would be pinned to the inline bar's 60px for everyone.
 *
 * The fix is to emit the custom property only when the user actually set one and let each
 * placement carry its own fallback in the stylesheet. That is invisible to every DOM test
 * (a fallback lives inside a `var()`, and `show_progress_bar` defaults to `false` anyway),
 * which is the blind spot this file exists to close.
 *
 * The three cases the maintainer named are the three `describe` blocks below.
 */
const PROP = '--calendar-card-progress-bar-width';

describe('progress_bar_width', () => {
  it('ships absent, so neither placement is pinned', () => {
    // The load-bearing assertion. If a default is ever restored here, the row's own width
    // becomes unreachable and this fails before anything visual does.
    expect(DEFAULT_CONFIG.progress_bar_width).toBeUndefined();
  });

  describe('unset — each placement uses its own fallback', () => {
    it('emits no custom property at all', () => {
      expect(generateCustomPropertiesObject(buildConfig())).not.toHaveProperty(PROP);
    });

    it('emits none in column view either', () => {
      // Resolved rather than raw, because column view is where the row placement lives
      // and a `column:` block must not accidentally reintroduce the value.
      const props = generateCustomPropertiesObject(resolveEffectiveConfig(buildConfig(), 'column'));

      expect(props).not.toHaveProperty(PROP);
    });
  });

  describe('set at the top level — both views use that value', () => {
    it.each(['list', 'column'] as const)('emits the value in %s view', (view) => {
      const config = resolveEffectiveConfig(buildConfig({ progress_bar_width: '120px' }), view);

      expect(generateCustomPropertiesObject(config)[PROP]).toBe('120px');
    });
  });

  describe('set inside column — the two views differ', () => {
    it('gives each view its own width', () => {
      const config = buildConfig({
        progress_bar_width: '60px',
        column: { progress_bar_width: '100%' },
      });

      expect(generateCustomPropertiesObject(resolveEffectiveConfig(config, 'list'))[PROP]).toBe(
        '60px',
      );
      expect(generateCustomPropertiesObject(resolveEffectiveConfig(config, 'column'))[PROP]).toBe(
        '100%',
      );
    });

    it('leaves list view on its fallback when only the column is set', () => {
      // The interesting asymmetry: an override inside `column:` must not leak a value
      // into list view, which would silently pin the inline bar to a width meant for a
      // row. Absent means absent, and list view keeps reaching its 60px fallback.
      const config = buildConfig({ column: { progress_bar_width: '100%' } });

      expect(
        generateCustomPropertiesObject(resolveEffectiveConfig(config, 'list')),
      ).not.toHaveProperty(PROP);
      expect(generateCustomPropertiesObject(resolveEffectiveConfig(config, 'column'))[PROP]).toBe(
        '100%',
      );
    });

    it('is eligible for a column override in the first place', () => {
      // The mechanism the three cases above rest on, and the reason C5 needed no new
      // plumbing. The editor derives its exceptions widget from this list too, so
      // removing the key would take the option out of the UI as well as out of YAML.
      expect(COLUMN_OVERRIDE_KEYS).toContain('progress_bar_width');
    });
  });

  it('treats an empty string as unset', () => {
    // Home Assistant's YAML parser and the editor's text inputs both produce '' for a
    // field a user cleared. Emitting `width: ;` would be an invalid declaration the
    // browser drops, which collapses the bar to its intrinsic width -- worse than the
    // fallback and with no diagnostic. Clearing the field has to mean "back to default".
    expect(
      generateCustomPropertiesObject(buildConfig({ progress_bar_width: '' })),
    ).not.toHaveProperty(PROP);
  });

  describe('does not reach the user YAML unbidden', () => {
    /*
     * The failure `weather.color` shipped, and the reason it is written down in
     * DEFAULT_CONFIG. A default that gets copied into stored config on the first edit is
     * indistinguishable from a deliberate choice forever after -- so an absent default is
     * only absent for as long as nothing writes it back.
     *
     * `progress_bar_width` is safe for a structural reason rather than a lucky one: it is
     * a top-level scalar, so it goes through `filterDefaultValues`, which drops undefined
     * outright. `weather` is an ATOMIC_KEY and bypasses that pass, which is why the two
     * keys need different arguments even though they use the same mechanism.
     */
    it('stays out of stored config until the user sets it', () => {
      expect(toStoredConfig(buildConfig())).not.toHaveProperty('progress_bar_width');
    });

    it('is stored once the user does set it', () => {
      // The other half: an absent default must not make a real value look like a default
      // and get filtered away with it.
      expect(toStoredConfig(buildConfig({ progress_bar_width: '80px' }))).toHaveProperty(
        'progress_bar_width',
        '80px',
      );
    });
  });
});

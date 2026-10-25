/**
 * The `toolbar:` block, as configured.
 *
 * Pinned by value rather than by walking the block's own keys: a walk would notice nothing
 * if a control left the defaults, and the defaults are a product decision — the bar hidden,
 * the two v5 controls on inside it, so `toolbar: { show: true }` alone gives both, labels
 * where they fit, and the date navigation off, because a control added after v5's first two
 * must not appear in a toolbar someone already set up.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, resolveToolbar } from '../src/config/config';
import type * as Types from '../src/config/types';

/** What every member reads as when the block says nothing about it. */
const DEFAULTS = {
  show: false,
  labels: true,
  navigation: false,
  addEvent: true,
  viewSwitcher: true,
};

describe('the toolbar configuration', () => {
  it('ships hidden, with the view switcher, the add button and labels on, navigation off', () => {
    expect(DEFAULT_CONFIG.toolbar).toEqual({
      show: false,
      labels: true,
      navigation: false,
      add_event: true,
      view_switcher: true,
    });
    expect(resolveToolbar(DEFAULT_CONFIG)).toEqual(DEFAULTS);
  });

  it('reads a partly written block member by member', () => {
    expect(resolveToolbar({ toolbar: { show: true } })).toEqual({ ...DEFAULTS, show: true });
    expect(resolveToolbar({ toolbar: { show: true, view_switcher: false } })).toEqual({
      ...DEFAULTS,
      show: true,
      viewSwitcher: false,
    });
    expect(resolveToolbar({ toolbar: { show: true, navigation: true, labels: false } })).toEqual({
      ...DEFAULTS,
      show: true,
      navigation: true,
      labels: false,
    });
  });

  it('keeps the choices of a hidden bar', () => {
    expect(
      resolveToolbar({ toolbar: { show: false, add_event: false, navigation: true } }),
    ).toEqual({ ...DEFAULTS, addEvent: false, navigation: true });
  });

  it.each([
    ['no block at all', {}],
    ['a null block', { toolbar: null }],
    ['a block that is not an object', { toolbar: 'yes' }],
    ['an array', { toolbar: [true] }],
  ])('reads %s as the defaults', (_name, config) => {
    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>)).toEqual(DEFAULTS);
  });

  it('reads a value that is not a boolean as that member’s default', () => {
    const config = {
      toolbar: { show: 'true', add_event: 0, view_switcher: null, navigation: 'yes', labels: 0 },
    };

    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>)).toEqual(DEFAULTS);
  });
});

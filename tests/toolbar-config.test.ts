/**
 * The `toolbar:` block, as configured.
 *
 * Pinned by value rather than by walking the block's own keys: a walk would notice nothing
 * if a control left the defaults, and the defaults are a product decision — the bar hidden,
 * and the two v5 controls on inside it, so `toolbar: { show: true }` alone gives both.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, resolveToolbar } from '../src/config/config';
import type * as Types from '../src/config/types';

describe('the toolbar configuration', () => {
  it('ships hidden, with the view switcher and the add button on inside it', () => {
    expect(DEFAULT_CONFIG.toolbar).toEqual({ show: false, add_event: true, view_switcher: true });
    expect(resolveToolbar(DEFAULT_CONFIG)).toEqual({
      show: false,
      addEvent: true,
      viewSwitcher: true,
    });
  });

  it('reads a partly written block member by member', () => {
    expect(resolveToolbar({ toolbar: { show: true } })).toEqual({
      show: true,
      addEvent: true,
      viewSwitcher: true,
    });
    expect(resolveToolbar({ toolbar: { show: true, view_switcher: false } })).toEqual({
      show: true,
      addEvent: true,
      viewSwitcher: false,
    });
  });

  it('keeps the choices of a hidden bar', () => {
    expect(resolveToolbar({ toolbar: { show: false, add_event: false } })).toEqual({
      show: false,
      addEvent: false,
      viewSwitcher: true,
    });
  });

  it.each([
    ['no block at all', {}],
    ['a null block', { toolbar: null }],
    ['a block that is not an object', { toolbar: 'yes' }],
    ['an array', { toolbar: [true] }],
  ])('reads %s as the defaults', (_name, config) => {
    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>)).toEqual({
      show: false,
      addEvent: true,
      viewSwitcher: true,
    });
  });

  it('reads a value that is not a boolean as that member’s default', () => {
    const config = { toolbar: { show: 'true', add_event: 0, view_switcher: null } };

    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>)).toEqual({
      show: false,
      addEvent: true,
      viewSwitcher: true,
    });
  });
});

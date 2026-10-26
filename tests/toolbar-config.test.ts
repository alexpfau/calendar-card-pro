/**
 * The `toolbar:` block, as configured.
 *
 * Pinned by value rather than by walking the block's own keys: a walk would notice nothing
 * if a control left the defaults, and the defaults are a product decision — the bar hidden,
 * and once shown, everything a shared screen needs on: the date navigation, the view switcher,
 * reset, add and the calendar filter as a menu, with labels where they fit. Refresh alone is
 * off, since it only matters where events change somewhere else between refreshes.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, TOOLBAR_LEGEND_VALUES, resolveToolbar } from '../src/config/config';
import type * as Types from '../src/config/types';
import { workspaceFormData } from '../src/rendering/editor/routing';
import { toolbarFormBlock } from '../src/rendering/editor/value';

/** What every member reads as when the block says nothing about it. */
const DEFAULTS = {
  show: false,
  labels: true,
  navigation: true,
  addEvent: true,
  viewSwitcher: true,
  reset: true,
  refresh: false,
  legend: 'menu',
};

describe('the toolbar configuration', () => {
  it('ships hidden, with every control on once shown except refresh, and the filter as a menu', () => {
    expect(DEFAULT_CONFIG.toolbar).toEqual({
      show: false,
      labels: true,
      navigation: true,
      add_event: true,
      view_switcher: true,
      reset: true,
      refresh: false,
      legend: 'menu',
    });
    expect(resolveToolbar(DEFAULT_CONFIG)).toEqual(DEFAULTS);
  });

  it('offers the filter as a menu, as chips, or not at all', () => {
    expect(TOOLBAR_LEGEND_VALUES).toEqual([false, 'menu', 'chips']);
  });

  it('reads a partly written block member by member', () => {
    expect(resolveToolbar({ toolbar: { show: true } })).toEqual({ ...DEFAULTS, show: true });
    expect(resolveToolbar({ toolbar: { show: true, view_switcher: false } })).toEqual({
      ...DEFAULTS,
      show: true,
      viewSwitcher: false,
    });
    expect(resolveToolbar({ toolbar: { show: true, navigation: false, labels: false } })).toEqual({
      ...DEFAULTS,
      show: true,
      navigation: false,
      labels: false,
    });
    expect(resolveToolbar({ toolbar: { show: true, refresh: true, legend: 'chips' } })).toEqual({
      ...DEFAULTS,
      show: true,
      refresh: true,
      legend: 'chips',
    });
    expect(resolveToolbar({ toolbar: { show: true, reset: false, legend: false } })).toEqual({
      ...DEFAULTS,
      show: true,
      reset: false,
      legend: false,
    });
  });

  it('keeps the choices of a hidden bar', () => {
    expect(
      resolveToolbar({ toolbar: { show: false, add_event: false, navigation: false } }),
    ).toEqual({ ...DEFAULTS, addEvent: false, navigation: false });
  });

  it.each([
    ['no block at all', {}],
    ['a null block', { toolbar: null }],
    ['a block that is not an object', { toolbar: 'yes' }],
    ['an array', { toolbar: [true] }],
  ])('reads %s as the defaults', (_name, config) => {
    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>)).toEqual(DEFAULTS);
  });

  it('reads a value of the wrong kind as that member’s default', () => {
    const config = {
      toolbar: {
        show: 'true',
        add_event: 0,
        view_switcher: null,
        navigation: 'yes',
        labels: 0,
        reset: 'yes',
        refresh: 'on',
        legend: 1,
      },
    };

    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>)).toEqual(DEFAULTS);
  });

  it.each([
    ['true, which names no form', true],
    ['an unknown form', 'lane'],
    ['a form in the wrong case', 'Chips'],
    ['the editor’s own word for off', 'off'],
  ])('reads a legend of %s as the default menu', (_name, legend) => {
    const config = { toolbar: { show: true, legend } };

    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>).legend).toBe('menu');
  });
});

describe('the toolbar block the editor shows', () => {
  it('shows every member at the value the card reads, each one changed from its default', () => {
    // Reconciled against the shipped block rather than listed: a member the form leaves out
    // reaches its switch as `undefined`, which draws as off whatever the configuration says.
    const changed = Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.toolbar as Record<string, unknown>).map(([key, value]) => [
        key,
        key === 'legend' ? 'chips' : !value,
      ]),
    );
    const block = toolbarFormBlock({ ...DEFAULT_CONFIG, toolbar: changed } as Types.Config);

    expect(block).toEqual(changed);
    expect(Object.keys(block).sort()).toEqual(
      [
        'add_event',
        'labels',
        'legend',
        'navigation',
        'refresh',
        'reset',
        'show',
        'view_switcher',
      ].sort(),
    );
  });

  it('shows the legend off as the word its dropdown offers, since a dropdown holds strings', () => {
    const config = { ...DEFAULT_CONFIG, toolbar: { show: true, legend: false } } as Types.Config;

    expect(toolbarFormBlock(config).legend).toBe('off');
    expect(toolbarFormBlock(DEFAULT_CONFIG as Types.Config).legend).toBe('menu');
    expect(workspaceFormData(config, 'shared').toolbar).toMatchObject({ legend: 'off' });
  });
});

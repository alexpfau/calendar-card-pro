/**
 * The `toolbar:` block, as configured.
 *
 * Pinned by value rather than by walking the block's own keys: a walk would notice nothing
 * if a control left the defaults, and the defaults are a product decision — the bar hidden,
 * and once shown, what anyone looking at a calendar needs on: the date navigation, the view
 * switcher, add, refresh, search and the calendar filter as a menu. Reset is off, since it is
 * for a screen several people share. Search, the first control added after v5, is on, by the
 * maintainer's choice (backlog item 182), and drawn only beside the date navigation a match
 * needs to open its day. The configuration's own
 * buttons are a list, empty unless it writes some, and read entry by entry: one that cannot be
 * drawn as written is left out.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIG,
  TOOLBAR_LEGEND_VALUES,
  resolveToolbar,
  undrawableToolbarButtons,
} from '../src/config/config';
import type * as Types from '../src/config/types';
import { workspaceFormData } from '../src/rendering/editor/routing';
import { toolbarFormBlock } from '../src/rendering/editor/value';

/** What every member reads as when the block says nothing about it. */
const DEFAULTS = {
  show: false,
  navigation: true,
  addEvent: true,
  viewSwitcher: true,
  reset: false,
  refresh: true,
  search: true,
  legend: 'menu',
  buttons: [],
};

describe('the toolbar configuration', () => {
  it('ships hidden, with every control on once shown except reset, and the filter as a menu', () => {
    expect(DEFAULT_CONFIG.toolbar).toEqual({
      show: false,
      navigation: true,
      add_event: true,
      view_switcher: true,
      reset: false,
      refresh: true,
      search: true,
      legend: 'menu',
      buttons: [],
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
    expect(resolveToolbar({ toolbar: { show: true, navigation: false } })).toEqual({
      ...DEFAULTS,
      show: true,
      navigation: false,
    });
    expect(resolveToolbar({ toolbar: { show: true, refresh: true, legend: 'chips' } })).toEqual({
      ...DEFAULTS,
      show: true,
      refresh: true,
      legend: 'chips',
    });
    expect(resolveToolbar({ toolbar: { show: true, reset: true, legend: false } })).toEqual({
      ...DEFAULTS,
      show: true,
      reset: true,
      legend: false,
    });
    expect(resolveToolbar({ toolbar: { show: true, search: true } })).toEqual({
      ...DEFAULTS,
      show: true,
      search: true,
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
        reset: 'yes',
        refresh: 'on',
        search: 1,
        legend: 1,
      },
    };

    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>)).toEqual(DEFAULTS);
  });

  it('has no switch for labels: which control is an icon and which is words is fixed', () => {
    // `labels` was an option during v5's development and never shipped. A block that still
    // carries it reads exactly as one that does not.
    const config = { toolbar: { show: true, labels: false } };

    expect(resolveToolbar(config as unknown as Pick<Types.Config, 'toolbar'>)).toEqual({
      ...DEFAULTS,
      show: true,
    });
    expect('labels' in (DEFAULT_CONFIG.toolbar as object)).toBe(false);
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
        key === 'legend' ? 'chips' : key === 'buttons' ? [{ icon: 'mdi:arrow-left' }] : !value,
      ]),
    );
    const block = toolbarFormBlock({ ...DEFAULT_CONFIG, toolbar: changed } as Types.Config);

    expect(block).toEqual(changed);
    expect(Object.keys(block).sort()).toEqual(
      [
        'add_event',
        'buttons',
        'legend',
        'navigation',
        'refresh',
        'reset',
        'search',
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

describe("the toolbar's own buttons", () => {
  const BACK = { icon: 'mdi:arrow-left', name: 'Back', tap_action: { action: 'back' } };
  const LAMP = {
    icon: 'mdi:lamp',
    name: 'Lamp',
    entity: 'light.hall',
    tap_action: { action: 'toggle' },
  };
  /** A button that is only an icon, still being set up: drawn, and a press does nothing. */
  const BARE = { icon: 'mdi:gesture-tap-button' };

  const read = (buttons: unknown) =>
    resolveToolbar({ toolbar: { show: true, buttons } } as unknown as Pick<Types.Config, 'toolbar'>)
      .buttons;

  it('reads every entry that can be drawn, in the order written', () => {
    expect(read([BACK, LAMP, BARE])).toEqual([BACK, LAMP, BARE]);
  });

  it('counts an empty value as no value, as YAML writes a key with nothing after it', () => {
    const empty = { icon: 'mdi:lamp', name: null, entity: null, tap_action: null };

    expect(read([empty])).toEqual([empty]);
  });

  it.each([
    ['no icon', { name: 'Back', tap_action: { action: 'back' } }],
    ['an empty icon', { icon: '', name: 'Back' }],
    ['an icon of spaces', { icon: '   ' }],
    ['an icon that is not text', { icon: 42 }],
    ['a name that is not text', { icon: 'mdi:lamp', name: 2026 }],
    ['an entity that is not text', { icon: 'mdi:lamp', entity: ['light.hall'] }],
    ['an action that is not an object', { icon: 'mdi:lamp', tap_action: 'toggle' }],
    ['an action that is a list', { icon: 'mdi:lamp', tap_action: [{ action: 'toggle' }] }],
    ['a bare icon name', 'mdi:lamp'],
    ['null', null],
    ['a list', [BACK]],
  ])('leaves out an entry with %s, whole, and keeps the rest', (_name, entry) => {
    expect(read([BACK, entry, LAMP])).toEqual([BACK, LAMP]);
    expect(
      undrawableToolbarButtons({ toolbar: { buttons: [BACK, entry, LAMP] } } as never),
    ).toEqual([entry]);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['one button rather than a list', BACK],
    ['text', 'mdi:arrow-left'],
  ])('reads a list of %s as no buttons', (_name, buttons) => {
    expect(read(buttons)).toEqual([]);
    expect(undrawableToolbarButtons({ toolbar: { buttons } } as never)).toEqual([]);
  });

  it("reads the list whether or not the toolbar is shown, as every member's choice is kept", () => {
    expect(
      resolveToolbar({ toolbar: { show: false, buttons: [BACK] } } as Pick<Types.Config, 'toolbar'>)
        .buttons,
    ).toEqual([BACK]);
  });

  it('shows the list in the editor as written, so an entry it cannot draw survives the next edit', () => {
    // The editor edits the list in panels of its own; an entry with no icon yet is one being set
    // up there, and must not vanish from it because the card cannot draw it.
    const written = [BACK, { name: 'Lamp' }, 'stray'];
    const config = { ...DEFAULT_CONFIG, toolbar: { show: true, buttons: written } } as Types.Config;

    expect(toolbarFormBlock(config).buttons).toBe(written);
    expect(toolbarFormBlock(DEFAULT_CONFIG as Types.Config).buttons).toEqual([]);
  });
});

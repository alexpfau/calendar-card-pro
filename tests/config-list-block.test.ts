/**
 * The v5 `list:` block, and the one-way migration that fills it.
 *
 * Three separate contracts share this file because they only make sense together:
 * the block is a peer of `column:` and `time_grid:` in the registry, the top level is
 * now a shared base rather than list's storage, and an old configuration is relocated
 * onto that arrangement the first time its owner saves from the editor.
 *
 * 🚨 The migration is deliberately asymmetric and the asymmetry is the whole safety
 * argument, so it is asserted from both sides here. A key that is list-only by
 * `VIEW_SCOPE` moves on any card, because no other view reads it either way. A key whose
 * column or grid default *diverges* from the top-level one moves only on a card that is
 * displaying list — moving it on a column card would hand column its own divergent
 * default in place of the value the user had been seeing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { DEFAULT_CONFIG } from '../src/config/config';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as Value from '../src/rendering/editor/value';
import * as Logger from '../src/utils/logger';

/** The five keys `VIEW_SCOPE` restricts to list, derived rather than written out. */
const LIST_ONLY = Object.keys(ViewConfig.VIEW_SCOPE).filter((key) => {
  const scope = ViewConfig.VIEW_SCOPE[key];
  return scope !== undefined && scope.size === 1 && scope.has('list');
});

/** Keys a registered view gives a different default from the top level. */
const DIVERGENT = [
  ...new Set(
    Object.values(ViewConfig.VIEW_BLOCKS).flatMap((block) => Object.keys(block.defaultOverrides)),
  ),
];

/**
 * The registry entry, asserted present rather than assumed.
 *
 * @returns The list view's block
 */
function listBlock(): NonNullable<(typeof ViewConfig.VIEW_BLOCKS)['list']> {
  const block = ViewConfig.VIEW_BLOCKS.list;
  if (block === undefined) {
    throw new Error('No list block registered — the whole of this file now proves nothing');
  }
  return block;
}

describe('the list block is a registered peer', () => {
  it('registers alongside the other views and claims the `list` key', () => {
    expect(Object.keys(ViewConfig.VIEW_BLOCKS).sort()).toEqual(['column', 'grid', 'list']);
    expect(listBlock().blockKey).toBe('list');
  });

  it('makes no view-specific claim of its own', () => {
    // Load-bearing rather than incidental. `baseViewForWorkspace` builds the Shared
    // workspace's panels as list precisely because list adds no only-keys and no
    // divergent defaults, so building as list asserts nothing about any view.
    expect(listBlock().onlyKeys).toHaveLength(0);
    expect(listBlock().defaultOverrides).toEqual({});
  });

  it('carries every key column can override, plus the five list-only ones', () => {
    expect(new Set(ViewConfig.LIST_OVERRIDE_KEYS)).toEqual(
      new Set([...ViewConfig.COLUMN_OVERRIDE_KEYS, ...LIST_ONLY]),
    );
    expect(LIST_ONLY).toHaveLength(5);
  });

  it('resolves a list override over the shared base', () => {
    const config = buildConfig({
      view: 'list',
      event_font_size: '20px',
      list: { event_font_size: '30px' },
    } as unknown as Partial<Types.Config>);

    expect(ViewConfig.resolveEffectiveConfig(config, 'list').event_font_size).toBe('30px');
    expect(ViewConfig.resolveEffectiveConfig(config, 'column').event_font_size).toBe('20px');
  });

  it('leaves a configuration with no list block identical rather than copied', () => {
    // The card memoizes on configuration identity and hands the result to caches that
    // compare by reference, so allocating here would render correctly and turn every
    // downstream comparison into a miss.
    const config = buildConfig({ view: 'list' });

    expect(ViewConfig.resolveEffectiveConfig(config, 'list')).toBe(config);
  });
});

describe('validation reaches the list block', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function messages(block: Record<string, unknown>): string[] {
    ViewConfig.validateColumnOverrides(
      buildConfig({ view: 'list', list: block } as unknown as Partial<Types.Config>),
    );
    return warn.mock.calls.map((call) => String(call[0]));
  }

  it('accepts an option the block may carry', () => {
    expect(messages({ event_font_size: '20px' })).toEqual([]);
  });

  it('gives a fetch-time option its tailored diagnostic', () => {
    expect(messages({ days_to_show: 7 }).join('\n')).toContain(
      'it determines which events are loaded',
    );
  });

  it('rejects another view\u2019s only-key', () => {
    expect(messages({ hour_height: 40 }).join('\n')).toContain('Ignoring "list.hour_height"');
  });
});

describe('the shared base refuses what has no top-level home', () => {
  it('offers a key more than one view reads', () => {
    expect(ViewConfig.appliesToSharedBase('event_font_size')).toBe(true);
    expect(ViewConfig.appliesToSharedBase('empty_day_color')).toBe(true);
  });

  it('withholds a key only one view reads', () => {
    for (const key of LIST_ONLY) {
      expect(ViewConfig.appliesToSharedBase(key), key).toBe(false);
    }
  });

  it('withholds a block-only key, which is unscoped for the opposite reason', () => {
    // 🚨 The trap this guards. `hour_height` and `min_day_width` are absent from
    // `VIEW_SCOPE` not because every view reads them but because they have no top-level
    // home at all, so the unscoped-means-shared reading offers a control whose edits
    // would be written where nothing reads them.
    for (const key of ['hour_height', 'min_day_width']) {
      expect(ViewConfig.appliesToSharedBase(key), key).toBe(false);
    }
  });
});

describe('empty_day_color is overridable per view', () => {
  it('joins the routable set alongside the rest of its family', () => {
    // It was the one member of the empty-day family stranded at the top level, so a
    // column card could restyle the text and not the color it sits on.
    expect(ViewConfig.COLUMN_OVERRIDE_KEYS).toContain('empty_day_color');

    const config = buildConfig({
      view: 'column',
      empty_day_color: '#111111',
      column: { empty_day_color: '#222222' },
    } as unknown as Partial<Types.Config>);

    expect(ViewConfig.resolveEffectiveConfig(config, 'column').empty_day_color).toBe('#222222');
  });
});

describe('the migration relocates an old configuration', () => {
  function relocate(
    stored: Record<string, unknown>,
    view: Types.EffectiveView,
    includeDivergent = true,
  ): Record<string, unknown> {
    const copy = structuredClone(stored);
    Value.relocateListKeys(copy, view, includeDivergent);
    return copy;
  }

  it('moves a list-only key on a card displaying any view', () => {
    for (const view of ['list', 'column', 'grid'] as Types.EffectiveView[]) {
      const moved = relocate(
        { entities: ['calendar.anna'], today_indicator_position: 'left' },
        view,
      );

      expect(moved, view).toEqual({
        entities: ['calendar.anna'],
        list: { today_indicator_position: 'left' },
      });
    }
  });

  it('moves a divergent key only on a card displaying list', () => {
    const stored = { entities: ['calendar.anna'], event_font_size: '18px' };

    expect(relocate(stored, 'list')).toEqual({
      entities: ['calendar.anna'],
      list: { event_font_size: '18px' },
    });

    for (const view of ['column', 'grid'] as Types.EffectiveView[]) {
      // Relocating here would replace the value column had been inheriting with column's
      // own divergent default, changing what the user sees on a save they did not intend
      // as a restyle.
      expect(relocate(stored, view), view).toEqual(stored);
    }
  });

  it('leaves a divergent key at the top level when the edit came from Shared', () => {
    // The user is authoring the shared base at that moment, so moving what they just
    // wrote into `list:` would undo the edit as it was saved.
    expect(relocate({ event_font_size: '18px' }, 'list', false)).toEqual({
      event_font_size: '18px',
    });

    // The list-only half still moves, because no other view reads it either way.
    expect(relocate({ today_indicator_position: 'left' }, 'list', false)).toEqual({
      list: { today_indicator_position: 'left' },
    });
  });

  it('keeps an existing block entry, which is the newer answer of the two', () => {
    expect(
      relocate({ event_font_size: '18px', list: { event_font_size: '22px' } }, 'list'),
    ).toEqual({ list: { event_font_size: '22px' } });
  });

  it('leaves a configuration that needs nothing moved untouched', () => {
    const stored = { entities: ['calendar.anna'], days_to_show: 7, column: { columns: 3 } };

    expect(relocate(stored, 'column')).toEqual(stored);
    expect(relocate(stored, 'list')).toEqual(stored);
  });

  it('covers every relocatable key and nothing else', () => {
    // Reconciled against the two sets rather than spot-checked, so a key leaving either
    // one fails here instead of quietly narrowing what the migration reaches.
    const listCard = relocate(
      Object.fromEntries([...LIST_ONLY, ...DIVERGENT].map((key) => [key, 'x'])),
      'list',
    );

    expect(Object.keys(listCard)).toEqual(['list']);
    expect(new Set(Object.keys(listCard.list as object))).toEqual(
      new Set([...LIST_ONLY, ...DIVERGENT]),
    );
  });
});

describe('presence in the list block is authorship', () => {
  it('keeps a value equal to the shipped default rather than stripping it', () => {
    // The point of the block. A value equal to the default is indistinguishable from an
    // absent one at the top level, which is what made a renderer unable to tell an
    // authored `false` from a defaulted one; inside `list:` its presence says it was
    // chosen.
    const stored = Value.toStoredConfig(
      buildConfig({
        view: 'list',
        list: { show_past_events: DEFAULT_CONFIG.show_past_events },
      } as unknown as Partial<Types.Config>),
    );

    expect(stored.list).toHaveProperty('show_past_events', DEFAULT_CONFIG.show_past_events);
  });

  it('still drops a key the block may not carry', () => {
    const stored = Value.toStoredConfig(
      buildConfig({
        view: 'list',
        list: { event_font_size: '20px', days_to_show: 7 },
      } as unknown as Partial<Types.Config>),
    );

    expect(stored.list).toEqual({ event_font_size: '20px' });
  });
});

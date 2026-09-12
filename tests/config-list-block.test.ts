/**
 * The v5 `list:` block, and the one-way migration that fills it.
 *
 * Three separate contracts share this file because they only make sense together:
 * the block is a peer of `column:` and `time_grid:` in the registry, the top level is
 * now a shared base rather than list's storage, and the editor records how an owner
 * chooses to interpret an older configuration.
 *
 * 🚨 The migration is deliberately asymmetric and the asymmetry is the whole safety
 * argument, so it is asserted from both sides here. A key that is list-only by
 * `VIEW_SCOPE` moves on any card, because no other view reads it either way. A key whose
 * column or grid default *diverges* from the top-level one moves only after the owner
 * chooses to keep it with List. Column adoption leaves those roots in place so it
 * does not discard values the user is already seeing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import { CURRENT_CONFIG_VERSION, DEFAULT_CONFIG } from '../src/config/config';
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
  function migrate(
    stored: Record<string, unknown>,
    mode: Value.ListMigrationMode,
    authored: Record<string, unknown> = stored,
  ): Record<string, unknown> {
    return Value.migrateListConfig(stored, authored, mode).config;
  }

  it('moves a list-only key on a card displaying any view', () => {
    const moved = migrate(
      { entities: ['calendar.anna'], today_indicator_position: 'left' },
      'shared-root',
    );

    expect(moved).toEqual({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      list: { today_indicator_position: 'left' },
    });
  });

  it('moves a divergent key only when the user keeps the List appearance', () => {
    const stored = { entities: ['calendar.anna'], event_font_size: '18px' };

    expect(migrate(stored, 'keep-list')).toEqual({
      config_version: CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      list: { event_font_size: '18px' },
    });
  });

  it('leaves a divergent key at the top level when it is declared shared', () => {
    expect(migrate({ event_font_size: '18px' }, 'shared-root')).toEqual({
      config_version: CURRENT_CONFIG_VERSION,
      event_font_size: '18px',
    });

    // The list-only half still moves, because no other view reads it either way.
    expect(migrate({ today_indicator_position: 'left' }, 'shared-root')).toEqual({
      config_version: CURRENT_CONFIG_VERSION,
      list: { today_indicator_position: 'left' },
    });
  });

  it('keeps an existing block entry, which is the newer answer of the two', () => {
    expect(
      migrate({ event_font_size: '18px', list: { event_font_size: '22px' } }, 'keep-list'),
    ).toEqual({
      config_version: CURRENT_CONFIG_VERSION,
      list: { event_font_size: '22px' },
    });
  });

  it('stamps a configuration that needs nothing moved without changing its values', () => {
    const stored = { entities: ['calendar.anna'], days_to_show: 7, column: { columns: 3 } };

    expect(migrate(stored, 'shared-root')).toEqual({
      ...stored,
      config_version: CURRENT_CONFIG_VERSION,
    });
  });

  it('covers every relocatable key and nothing else', () => {
    // Reconciled against the two sets rather than spot-checked, so a key leaving either
    // one fails here instead of quietly narrowing what the migration reaches.
    const listCard = migrate(
      Object.fromEntries([...LIST_ONLY, ...DIVERGENT].map((key) => [key, 'x'])),
      'keep-list',
    );

    expect(Object.keys(listCard).sort()).toEqual(['config_version', 'list']);
    expect(new Set(Object.keys(listCard.list as object))).toEqual(
      new Set([...LIST_ONLY, ...DIVERGENT]),
    );
  });

  it('reads default-valued authorship from the raw configuration before stripping', () => {
    const authored = {
      show_past_events: DEFAULT_CONFIG.show_past_events,
      compact_events_complete_days: DEFAULT_CONFIG.compact_events_complete_days,
    };
    const migrated = migrate({}, 'keep-list', authored);

    expect(migrated.list).toEqual(authored);
  });

  it('derives ambiguity from authored divergent root presence only', () => {
    expect(Value.ambiguousRootKeys({ event_font_size: '18px', title: 'Example' })).toEqual([
      'event_font_size',
    ]);
    expect(
      Value.ambiguousRootKeys({
        list: { event_font_size: '18px' },
        today_indicator_position: 'left',
      }),
    ).toEqual([]);
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

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/config/config';
import * as Types from '../src/config/types';
import {
  COLUMN_DEFAULTS,
  COLUMN_ONLY_KEYS,
  COLUMN_OVERRIDE_KEYS,
  OVERRIDE_BLOCK_BY_VIEW,
  VIEW_BLOCKS,
  resolveColumnOption,
  resolveEffectiveConfig,
  resolveViewOption,
  validateView,
  viewBlockFor,
} from '../src/config/view';

/**
 * The view-block registry.
 *
 * Five functions used to hardcode `'column'` and `config.column`: the two resolvers,
 * `validateView`, the override validator and its top-level-key warning. Registering a
 * second view meant editing all five and remembering all five — the shape AGENTS.md
 * § _Proximity is not reach_ describes, where the next case is written by someone
 * reading a different file.
 *
 * 🚨 The whole existing suite passes whether the resolvers read the registry or the
 * hardcoded literal, because `column` is the only registered view and both answers
 * agree for it. That makes every assertion here that merely exercises column view
 * worthless as evidence. The tests that carry weight are the ones under
 * _behaviour follows the registry_, which **repoint the registry** and require the
 * resolvers to follow — something a hardcoded implementation cannot do.
 */

type MutableBlock = {
  blockKey: string;
  overrideKeys: ReadonlyArray<string>;
  onlyKeys: ReadonlyArray<string>;
  onlyDefaults: Readonly<Record<string, string | number>>;
  defaultOverrides: Readonly<Record<string, unknown>>;
};

/** The registry, reachable for mutation. Restored after every test. */
const registry = VIEW_BLOCKS as unknown as Record<string, MutableBlock | undefined>;
const pristine = { ...registry.column } as MutableBlock;

afterEach(() => {
  registry.column = { ...pristine };
});

const baseConfig = (overrides: Record<string, unknown> = {}): Types.Config =>
  ({ ...DEFAULT_CONFIG, ...overrides }) as Types.Config;

describe('the registry is the single source', () => {
  it('registers exactly the views that own a block', () => {
    expect(Object.keys(VIEW_BLOCKS)).toEqual(['column']);
  });

  it('reports no block for a view that has none', () => {
    expect(viewBlockFor('list')).toBeUndefined();
  });

  // Derived rather than written out a second time, so a view cannot be registered in
  // one and missed in the other — the exact drift the registry exists to prevent.
  it('derives the block-key map from the registry', () => {
    expect(OVERRIDE_BLOCK_BY_VIEW).toEqual(
      Object.fromEntries(Object.entries(VIEW_BLOCKS).map(([view, b]) => [view, b.blockKey])),
    );
  });

  it('still carries column its own tables', () => {
    expect(viewBlockFor('column')).toEqual({
      blockKey: 'column',
      overrideKeys: COLUMN_OVERRIDE_KEYS,
      onlyKeys: COLUMN_ONLY_KEYS,
      onlyDefaults: COLUMN_DEFAULTS,
      defaultOverrides: expect.any(Object),
    });
  });
});

describe('every registered view is internally consistent', () => {
  // Runs per registered view rather than naming column, so a second view is checked by
  // being registered rather than by someone remembering to extend this file.
  const registered = Object.entries(VIEW_BLOCKS) as Array<[string, MutableBlock]>;

  it.each(registered)('%s: the two key arrays are disjoint', (_view, block) => {
    const overlap = block.overrideKeys.filter((key) => block.onlyKeys.includes(key));

    expect(overlap).toEqual([]);
  });

  it.each(registered)('%s: every override key has a top-level counterpart', (_view, block) => {
    const orphans = block.overrideKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key),
    );

    expect(orphans).toEqual([]);
  });

  it.each(registered)('%s: no view-only key has a top-level counterpart', (_view, block) => {
    const shadowed = block.onlyKeys.filter((key) =>
      Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key),
    );

    expect(shadowed).toEqual([]);
  });

  it.each(registered)('%s: every view-only key ships a default', (_view, block) => {
    // A view-only key has no top-level counterpart to fall back to, so it needs a
    // default of its own — unless that default is *derived* from another option and so
    // cannot be a constant. `min_days_to_show` defaults to `days_to_show` and is
    // resolved by `resolveMinDaysToShow`, which is why it is absent from
    // `COLUMN_DEFAULTS` by design rather than by omission.
    //
    // 🚨 Reconciled in both directions rather than skipped. A bare exception list
    // silently stops covering anything added to it, and stops meaning anything when a
    // key leaves — the `Object.keys(TABLE)` trap in AGENTS.md, one level down. So an
    // undeclared missing default fails here, and a declared exception that is no longer
    // missing fails too.
    const derived: Readonly<Record<string, ReadonlyArray<string>>> = {
      column: ['min_days_to_show'],
    };
    const expected = derived[_view] ?? [];

    const missing = block.onlyKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(block.onlyDefaults, key),
    );

    expect([...missing].sort()).toEqual([...expected].sort());
  });

  it.each(registered)('%s: every divergent default is a hoisted key', (_view, block) => {
    const unhoisted = Object.keys(block.defaultOverrides).filter(
      (key) => !block.overrideKeys.includes(key),
    );

    expect(unhoisted).toEqual([]);
  });

  it.each(registered)('%s: the block key is a real config key', (_view, block) => {
    expect(Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, block.blockKey)).toBe(true);
  });
});

describe('behaviour follows the registry', () => {
  // These are the tests that mean something. Each repoints the registry and requires the
  // resolver to follow; an implementation that still reads `config.column` directly, or
  // still tests `view !== 'column'`, fails them while passing everything else.

  it('reads the block from the registered key, not from `config.column`', () => {
    registry.column = { ...pristine, blockKey: 'relocated_block' as string };

    const config = baseConfig({
      day_spacing: '10px',
      relocated_block: { day_spacing: '99px' },
      column: { day_spacing: '1px' },
    });

    const resolved = resolveEffectiveConfig(config, 'column');

    expect(resolved.day_spacing, 'the relocated block should win').toBe('99px');
    expect(resolved.day_spacing, 'the old hardcoded key must be ignored').not.toBe('1px');
  });

  it('hoists only the keys the registry lists', () => {
    registry.column = { ...pristine, overrideKeys: ['day_spacing'] };

    const config = baseConfig({
      day_spacing: '10px',
      event_spacing: '10px',
      column: { day_spacing: '99px', event_spacing: '99px' },
    });

    const resolved = resolveEffectiveConfig(config, 'column');

    expect(resolved.day_spacing).toBe('99px');
    expect(resolved.event_spacing, 'not in overrideKeys, so not hoisted').toBe('10px');
  });

  it('seeds the divergent defaults the registry lists', () => {
    registry.column = { ...pristine, defaultOverrides: { day_spacing: '42px' } };

    expect(resolveEffectiveConfig(baseConfig({ day_spacing: '10px' }), 'column').day_spacing).toBe(
      '42px',
    );
  });

  it('leaves a view with no registry entry untouched', () => {
    const config = baseConfig({ day_spacing: '10px', column: { day_spacing: '99px' } });

    expect(resolveEffectiveConfig(config, 'list')).toBe(config);
  });

  it('resolves a single option through the registered block too', () => {
    registry.column = { ...pristine, blockKey: 'relocated_block' as string };

    const config = baseConfig({
      show_location: true,
      relocated_block: { show_location: false },
      column: { show_location: true },
    });

    expect(resolveViewOption(config, 'show_location', 'column')).toBe(false);
  });

  it('falls back to the registry default before the top-level value', () => {
    registry.column = { ...pristine, defaultOverrides: { show_location: false } };

    expect(resolveViewOption(baseConfig({ show_location: true }), 'show_location', 'column')).toBe(
      false,
    );
  });

  it('resolves a view-only option through the registered block too', () => {
    registry.column = { ...pristine, blockKey: 'relocated_block' as string };

    const config = baseConfig({
      relocated_block: { day_header_gap: '77px' },
      column: { day_header_gap: '1px' },
    });

    expect(resolveColumnOption(config, 'day_header_gap')).toBe('77px');
  });

  // 🚨 The one test that proves the *view selection* is registry-driven rather than a
  // hardcoded `view !== 'column'`. With column the only registered view the two are
  // behaviourally identical, so nothing else here can tell them apart — regressing
  // `resolveEffectiveConfig` to a literal comparison passes every other assertion in
  // this file and the whole existing suite. Registering a second view is what makes the
  // difference observable, which is the same reason the real grid view will be the
  // thing that finally exercises this machinery for real.
  it('applies a block to any view the registry registers, not just column', () => {
    registry.list = {
      blockKey: 'list_block' as string,
      overrideKeys: ['day_spacing'],
      onlyKeys: [],
      onlyDefaults: {},
      defaultOverrides: { event_spacing: '5px' },
    };

    try {
      const config = baseConfig({
        day_spacing: '10px',
        event_spacing: '10px',
        list_block: { day_spacing: '99px' },
      });

      const resolved = resolveEffectiveConfig(config, 'list');

      expect(resolved.day_spacing, 'the newly registered block should be hoisted').toBe('99px');
      expect(resolved.event_spacing, 'its divergent default should be seeded').toBe('5px');

      // The single-option resolver has to follow the registry for the same reason, and
      // needs its own assertion: a `view !== 'column'` regression inside it is invisible
      // to the bulk resolver's result.
      expect(
        resolveViewOption(config, 'day_spacing', 'list'),
        'resolveViewOption should read the newly registered block too',
      ).toBe('99px');
      expect(
        resolveViewOption(config, 'event_spacing', 'list'),
        'and should fall back to its divergent default',
      ).toBe('5px');
    } finally {
      delete registry.list;
    }
  });
});

describe('validateView derives its vocabulary', () => {
  it('accepts every view the card offers', () => {
    for (const view of ['list', 'column'] as const) {
      const config = baseConfig({ view });
      validateView(config);

      expect(config.view).toBe(view);
    }
  });

  it.each([['grid'], ['agenda'], [''], [null], [undefined], [7]])('coerces %o to list', (value) => {
    const config = baseConfig({ view: value });
    validateView(config);

    expect(config.view).toBe('list');
  });
});

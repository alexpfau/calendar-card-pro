/**
 * When Too Narrow: one choice over `min_days_to_show` and `min_days_fallback` on Columns' and
 * Grid's pages (`synthetic.ts` › `narrow_fit`, `ViewConfig.narrowFit`). Reading a configuration
 * never writes it, so every combination reads as the choice that would write it, and a pick writes
 * only into the layout's own block.
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import { walkSchema } from '../src/rendering/editor/panels';
import * as Routing from '../src/rendering/editor/routing';
import { NARROW_FIT_CHOICES, buildLayoutSchema } from '../src/rendering/editor/schemas/layout';
import { toStoredConfig } from '../src/rendering/editor/value';

const LAYOUTS = [
  ['column', 'column'],
  ['grid', 'time_grid'],
] as const;

/** A card on the layout, three days unless said, with `block` as its block. */
function card(
  view: 'column' | 'grid',
  block: Record<string, unknown> = {},
  days = 3,
): Types.Config {
  const key = View.OVERRIDE_BLOCK_BY_VIEW[view]!;
  return buildConfig({ view, days_to_show: days, [key]: block });
}

/** Columns keeps every day under `cramp` while no floor is written; Grid's floor stays one. */
const SHEDS_UNSET = { column: false, grid: true } as const;

/** Picks a choice on the layout's page, as the form does. */
function pick(config: Types.Config, view: 'column' | 'grid', choice: string): Types.Config {
  const frame: Routing.FormFrame = {
    workspace: view,
    schema: [{ name: 'narrow_fit', selector: { select: { options: [...NARROW_FIT_CHOICES] } } }],
    data: Routing.workspaceFormData(config, view),
  };
  return Routing.applyWorkspaceChange(config, frame, { ...frame.data, narrow_fit: choice }, {})
    .config;
}

/** The choice the layout's page shows. */
function shown(config: Types.Config, view: 'column' | 'grid'): unknown {
  return Routing.workspaceFormData(config, view).narrow_fit;
}

/** The names the layout's page builds. */
function built(config: Types.Config, view: 'column' | 'grid'): string[] {
  const ctx = {
    view,
    workspace: view,
    config: Routing.workspaceConfig(config, view),
    language: 'en',
  };
  return [...walkSchema(buildLayoutSchema(ctx))]
    .filter(({ node }) => 'selector' in node)
    .map(({ node }) => node.name);
}

describe.each(LAYOUTS)('When Too Narrow on %s', (view, blockKey) => {
  it.each<readonly [string, Record<string, unknown>, string]>([
    ['nothing written', {}, 'fewer'],
    ['a floor below the days', { min_days_to_show: 2 }, 'fewer'],
    ['a floor at the days', { min_days_to_show: 3 }, 'list'],
    ['a floor past the days', { min_days_to_show: 7 }, 'list'],
    ['narrower, a floor of one', { min_days_fallback: 'cramp', min_days_to_show: 1 }, 'custom'],
    ['narrower, a floor at the days', { min_days_fallback: 'cramp', min_days_to_show: 3 }, 'cramp'],
    ['narrower below a floor', { min_days_fallback: 'cramp', min_days_to_show: 2 }, 'custom'],
    ['a list written out', { min_days_fallback: 'list', min_days_to_show: 2 }, 'fewer'],
  ])('reads %s as %s', (_name, block, choice) => {
    expect(shown(card(view, block), view)).toBe(choice);
  });

  it('reads narrower with no floor written as the layout resolves it', () => {
    expect(shown(card(view, { min_days_fallback: 'cramp' }), view)).toBe(
      SHEDS_UNSET[view] ? 'custom' : 'cramp',
    );
  });

  it('reads each choice back after picking it from every other, writing only its block', () => {
    for (const from of NARROW_FIT_CHOICES) {
      const entered = pick(card(view), view, from);
      expect(shown(entered, view), `never reached ${from}`).toBe(from);
      for (const to of NARROW_FIT_CHOICES) {
        const moved = pick(entered, view, to);
        expect(shown(moved, view), `${from} → ${to}`).toBe(to);
        const without = (config: Types.Config): Record<string, unknown> => {
          const stored = { ...(toStoredConfig(config) as Record<string, unknown>) };
          delete stored[blockKey];
          return stored;
        };
        const rest = without(moved);
        const before = without(card(view));
        expect(rest, `${from} → ${to}`).toEqual(before);
      }
    }
  });

  it('writes each choice as its combination', () => {
    const stored = (choice: string) =>
      toStoredConfig(pick(card(view), view, choice))[blockKey] ?? {};
    expect(stored('list')).toEqual({ min_days_to_show: 3 });
    expect(stored('cramp')).toEqual(
      SHEDS_UNSET[view]
        ? { min_days_fallback: 'cramp', min_days_to_show: 3 }
        : { min_days_fallback: 'cramp' },
    );
    expect(stored('fewer')).toEqual({});
    // Custom sheds to the layout's own floor, a day short of the days at most, then narrower.
    // Grid's is its default, which the stored block leaves out; Columns' default under cramp is
    // every day, so its two is written.
    expect(stored('custom')).toEqual(
      SHEDS_UNSET[view]
        ? { min_days_fallback: 'cramp' }
        : { min_days_fallback: 'cramp', min_days_to_show: 2 },
    );
    expect(shown(pick(card(view), view, 'custom'), view)).toBe('custom');
  });

  it('keeps a floor below the days between Custom and fewer days, and drops one that sheds none', () => {
    const custom = card(view, { min_days_fallback: 'cramp', min_days_to_show: 3 }, 5);
    expect(toStoredConfig(pick(custom, view, 'fewer'))[blockKey]).toEqual({ min_days_to_show: 3 });
    const fewer = card(view, { min_days_to_show: 3 }, 5);
    expect(toStoredConfig(pick(fewer, view, 'custom'))[blockKey]).toEqual({
      min_days_fallback: 'cramp',
      min_days_to_show: 3,
    });
    const list = card(view, { min_days_to_show: 3 });
    expect(toStoredConfig(pick(list, view, 'fewer'))[blockKey] ?? {}).toEqual({});
  });

  it('builds Down To with fewer days and Custom, Below That with Custom alone', () => {
    expect(built(card(view), view)).toContain('min_days_to_show');
    expect(built(card(view), view)).not.toContain('min_days_fallback');
    const custom = card(view, { min_days_fallback: 'cramp', min_days_to_show: 2 });
    expect(built(custom, view)).toEqual(
      expect.arrayContaining(['min_days_to_show', 'min_days_fallback']),
    );
    for (const block of [
      { min_days_to_show: 3 },
      { min_days_fallback: 'cramp', min_days_to_show: 3 },
    ]) {
      expect(built(card(view, block), view)).not.toContain('min_days_to_show');
    }
  });

  it('offers no Custom on a one-day layout, which has nothing to shed', () => {
    const one = buildConfig({ view, days_to_show: 1 });
    const ctx = {
      view,
      workspace: view,
      config: Routing.workspaceConfig(one, view),
      language: 'en',
    };
    const choice = [...walkSchema(buildLayoutSchema(ctx))].find(
      ({ node }) => node.name === 'narrow_fit',
    )!.node as unknown as { selector: { select: { options: Array<{ value: string }> } } };
    expect(choice.selector.select.options.map((option) => option.value)).toEqual([
      'fewer',
      'list',
      'cramp',
    ]);
    expect(built(one, view)).not.toContain('min_days_to_show');
  });
});

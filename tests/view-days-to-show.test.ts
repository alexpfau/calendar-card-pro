/**
 * `days_to_show` per view: the rules.
 *
 * Two numbers, kept apart. What a view **draws** is its own `days_to_show`, resolved like any
 * other per-view option. What the card **loads** is the longest of those among the views it
 * can show, so every view draws a prefix of one load and switching never refetches. The card
 * itself is pinned in `view-days-to-show-host.test.ts`, and the date bound in
 * `view-days-to-show.dst.test.ts`.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import * as EditorLocalize from '../src/rendering/editor/localize';
import * as Routing from '../src/rendering/editor/routing';
import { buildContentSchema } from '../src/rendering/editor/schemas/content';
import { buildLayoutSchema } from '../src/rendering/editor/schemas/layout';
import * as Logger from '../src/utils/logger';

vi.mock('../src/utils/logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  setLogLevel: vi.fn(),
  initializeLogger: vi.fn(),
  printVersionInfo: vi.fn(),
}));

/** List 14, Columns 5, Grid 7. */
const PER_VIEW: Partial<Types.Config> = {
  days_to_show: 14,
  column: { days_to_show: 5 },
  time_grid: { days_to_show: 7 },
};

const SWITCHER = { show: true, view_switcher: true };

/** A shown switcher without month, whose weeks widen the load past any count (`loadConfig`). */
const COUNTED_SWITCHER: Types.ToolbarConfig = {
  show: true,
  view_switcher_layouts: ['list', 'column', 'grid'],
};

function config(overrides: Partial<Types.Config> = {}): Types.Config {
  return buildConfig({ ...PER_VIEW, ...overrides } as Partial<Types.Config>);
}

describe('each view draws its own count', () => {
  it('is an override in every view block but month’s, and in no fetch-time list', () => {
    for (const view of ['list', 'column', 'grid'] as const) {
      expect(ViewConfig.viewBlockFor(view)!.overrideKeys, view).toContain('days_to_show');
    }
    // A month draws its six weeks whatever the count says, so its block has none to override.
    expect(ViewConfig.viewBlockFor('month')!.overrideKeys).not.toContain('days_to_show');
    expect(ViewConfig.FETCH_TIME_KEYS.has('days_to_show')).toBe(false);
    // It reaches every view but month, which is still more than one.
    expect(ViewConfig.appliesToView('days_to_show', 'grid')).toBe(true);
    expect(ViewConfig.appliesToView('days_to_show', 'month')).toBe(false);
    expect(ViewConfig.appliesToSharedBase('days_to_show')).toBe(true);
  });

  // Both resolvers, because the card reads both: `resolveViewOption` per key, and
  // `resolveEffectiveConfig` in bulk for every renderer. Pinning only one would leave the
  // other free to disagree.
  it.each([
    ['list', 14],
    ['column', 5],
    ['grid', 7],
  ] as const)('resolves %s to %i in both resolvers', (view, days) => {
    const resolved = config();

    expect(ViewConfig.resolveViewOption(resolved, 'days_to_show', view)).toBe(days);
    expect(ViewConfig.resolveEffectiveConfig(resolved, view).days_to_show).toBe(days);
  });

  it('inherits the card-wide count where a view sets none', () => {
    const resolved = buildConfig({ days_to_show: 9, time_grid: { days_to_show: 4 } });

    expect(ViewConfig.resolveEffectiveConfig(resolved, 'list').days_to_show).toBe(9);
    expect(ViewConfig.resolveEffectiveConfig(resolved, 'column').days_to_show).toBe(9);
    expect(ViewConfig.resolveEffectiveConfig(resolved, 'grid').days_to_show).toBe(4);
  });

  // An invalid block value resolves as the top level's own invalid value does: to the
  // shipped default. Every consumer — draw, fit, load — must reach the same answer, or the
  // card would load one range and draw another.
  it.each([
    ['a quoted number', '6', 6],
    ['zero', 0, 3],
    ['a negative number', -2, 3],
    ['text', 'many', 3],
  ] as const)('resolves %s in a block the same way everywhere', (_label, raw, expected) => {
    const resolved = buildConfig({
      days_to_show: 2,
      view: 'grid',
      time_grid: { days_to_show: raw as unknown as number, min_days_fallback: 'cramp' },
    });

    expect(ViewConfig.resolveViewOption(resolved, 'days_to_show', 'grid')).toBe(expected);
    expect(ViewConfig.resolveEffectiveConfig(resolved, 'grid').days_to_show).toBe(expected);
    expect(ViewConfig.loadedDaysToShow(resolved)).toBe(expected);
    expect(ViewConfig.resolveColumnFit('grid', resolved, 5000, null).columns).toBe(expected);
  });

  it('is accepted in every block without a warning', () => {
    vi.mocked(Logger.warn).mockClear();
    ViewConfig.validateColumnOverrides(
      buildConfig({
        list: { days_to_show: 14 },
        column: { days_to_show: 5 },
        time_grid: { days_to_show: 7 },
      }),
    );

    expect(Logger.warn).not.toHaveBeenCalled();
  });
});

describe('the views a card can show', () => {
  it.each([
    // The shipped toolbar is hidden with its switcher flag on, so the flag alone means nothing.
    ['the shipped toolbar, list', {}, ['list']],
    ['a hidden toolbar with the switcher', { toolbar: { view_switcher: true } }, ['list']],
    ['the switcher shown', { toolbar: SWITCHER }, ['list', 'column', 'grid', 'month']],
    [
      'a switcher offering some layouts, and the one the card opens in',
      { view: 'column', toolbar: { show: true, view_switcher_layouts: ['month', 'grid'] } },
      ['column', 'grid', 'month', 'list'],
    ],
    [
      'a switcher offering month and the list the card opens in',
      { toolbar: { show: true, view_switcher_layouts: ['month'] } },
      ['list', 'month'],
    ],
    [
      'a switcher whose list names no layout, as no switcher',
      { view: 'grid', toolbar: { show: true, view_switcher_layouts: [] } },
      ['grid', 'list'],
    ],
    [
      'a switcher whose list names only the layout the card opens in, as no switcher',
      { view: 'month', toolbar: { show: true, view_switcher_layouts: ['month'] } },
      ['month'],
    ],
    [
      'a switcher turned off, which keeps a list naming month',
      {
        view: 'grid',
        toolbar: { show: true, view_switcher: false, view_switcher_layouts: ['month'] },
      },
      ['grid', 'list'],
    ],
    [
      'a hidden toolbar whose switcher names month',
      { toolbar: { show: false, view_switcher_layouts: ['month'] } },
      ['list'],
    ],
    ['a month card', { view: 'month' }, ['month']],
    [
      'a month card whose switcher offers grid, which falls back to list',
      { view: 'month', toolbar: { show: true, view_switcher_layouts: ['grid'] } },
      ['grid', 'month', 'list'],
    ],
    [
      'a toolbar without the switcher',
      { view: 'grid', toolbar: { show: true, view_switcher: false } },
      ['grid', 'list'],
    ],
    ['a column card, which falls back to list', { view: 'column' }, ['column', 'list']],
    ['a grid card, which falls back to list', { view: 'grid' }, ['grid', 'list']],
    [
      'a grid card that cramps instead',
      { view: 'grid', time_grid: { min_days_fallback: 'cramp' } },
      ['grid'],
    ],
    [
      'a column card that cramps instead',
      { view: 'column', column: { min_days_fallback: 'cramp' } },
      ['column'],
    ],
    ['a malformed toolbar', { toolbar: 'yes' as unknown as Types.ToolbarConfig }, ['list']],
  ] as const)('%s', (_label, overrides, expected) => {
    expect(ViewConfig.reachableViews(buildConfig(overrides as Partial<Types.Config>))).toEqual(
      expected,
    );
  });
});

describe('the card loads the longest view it can show', () => {
  it.each([
    ['every view, with the switcher', { toolbar: SWITCHER }, 14],
    ['list alone', { view: 'list' }, 14],
    ['a grid card and its list fallback', { view: 'grid' }, 14],
    [
      'a grid card that cannot fall back',
      { view: 'grid', time_grid: { days_to_show: 7, min_days_fallback: 'cramp' } },
      7,
    ],
    ['a longer view nothing can reach', { view: 'list', time_grid: { days_to_show: 30 } }, 14],
    [
      'a longer view the switcher can reach',
      { toolbar: SWITCHER, time_grid: { days_to_show: 30 } },
      30,
    ],
  ] as const)('%s', (_label, overrides, expected) => {
    expect(ViewConfig.loadedDaysToShow(config(overrides as Partial<Types.Config>))).toBe(expected);
  });

  it('loads exactly the card-wide count of a card that sets no per-view one', () => {
    // A fraction too: nothing here may round what a pre-v5 card has always loaded. Month is left
    // off the switcher, since its weeks are loaded by date rather than by count.
    for (const days of [1, 3, 7.5, 31]) {
      const plain = buildConfig({ days_to_show: days, toolbar: COUNTED_SWITCHER });
      expect(ViewConfig.loadedDaysToShow(plain)).toBe(days);
      for (const home of [true, false]) {
        expect(ViewConfig.loadConfig(plain, 1, home)).toBe(plain);
      }
    }
  });

  it('loads a card month cannot reach as before, whatever the weekday, the page or the day', () => {
    // Pinned by value: the configuration with the longest count, and its own start date, which
    // neither the first weekday nor the moment it is asked at can move.
    const original = config({
      view: 'grid',
      start_date: 'start_of_week',
      time_grid: { days_to_show: 21 },
    });
    expect(ViewConfig.reachesMonth(original)).toBe(false);
    const expected = { ...original, days_to_show: 21 };
    for (const firstDayOfWeek of [0, 1, 6]) {
      for (const home of [true, false]) {
        for (const now of [new Date(2026, 0, 1), new Date(2026, 6, 15, 23, 30)]) {
          const loaded = ViewConfig.loadConfig(original, firstDayOfWeek, home, now);
          expect(loaded).toEqual(expected);
          expect(loaded.start_date).toBe('start_of_week');
        }
      }
    }
  });

  it('counts no days for month, which draws its weeks whatever the count', () => {
    expect(ViewConfig.loadedDaysToShow(config({ toolbar: SWITCHER }))).toBe(14);
    expect(ViewConfig.loadedDaysToShow(config({ view: 'month' }))).toBe(14);
    expect(ViewConfig.loadedDaysToShow(buildConfig({ view: 'month', days_to_show: 3 }))).toBe(3);
  });

  it('hands the load to the fetch path as a copy, leaving the card’s own config alone', () => {
    const original = config({ view: 'grid', time_grid: { days_to_show: 21 } });
    const loaded = ViewConfig.loadConfig(original, 1, true);

    expect(loaded).not.toBe(original);
    expect(loaded.days_to_show).toBe(21);
    expect(original.days_to_show).toBe(14);
    expect(loaded.time_grid).toBe(original.time_grid);
  });
});

describe('the layout fits each view by its own count', () => {
  it('fits columns up to the view’s own count, not the card-wide one', () => {
    const resolved = config();

    expect(ViewConfig.resolveColumnFit('column', resolved, 5000, null)).toEqual({
      view: 'column',
      columns: 5,
    });
    expect(ViewConfig.resolveColumnFit('grid', resolved, 5000, null)).toEqual({
      view: 'grid',
      columns: 7,
    });
    expect(ViewConfig.resolveColumnFitIfPicked('column', resolved, 5000)).toEqual({
      view: 'column',
      columns: 5,
    });
  });

  it('defaults column’s floor to column’s own count', () => {
    expect(ViewConfig.resolveMinDaysToShow(config(), 'column')).toBe(5);
  });

  it('measures the room a view needs from its own count', () => {
    const resolved = config();

    expect(ViewConfig.describeColumnLayoutBands(resolved, 'column').bands[0].columns).toBe(5);
    expect(ViewConfig.describeColumnLayoutBands(resolved, 'grid').bands[0].columns).toBe(7);
  });
});

describe('the editor', () => {
  function find(schema: ReadonlyArray<HaFormSchema>, name: string): HaFormSchema | undefined {
    for (const node of schema) {
      if (node.name === name) return node;
      if ('schema' in node) {
        const found = find(node.schema, name);
        if (found) return found;
      }
    }
    return undefined;
  }

  it('shows each workspace its own count, and Shared the card-wide one', () => {
    const resolved = config();

    expect(Routing.workspaceFormData(resolved, 'shared').days_to_show).toBe(14);
    expect(Routing.workspaceFormData(resolved, 'list').days_to_show).toBe(14);
    expect(Routing.workspaceFormData(resolved, 'column').days_to_show).toBe(5);
    expect(Routing.workspaceFormData(resolved, 'grid').days_to_show).toBe(7);
  });

  it('says where a workspace’s count comes from', () => {
    const resolved = config();

    expect(Routing.valueSource(resolved, 'grid', 'days_to_show')).toBe('own');
    expect(Routing.valueSource(resolved, 'list', 'days_to_show')).toBe('inherited');
    expect(Routing.valueSource(resolved, 'shared', 'days_to_show')).toBeUndefined();
  });

  it('caps the column floor at the workspace’s own count', () => {
    const projected = Routing.workspaceConfig(config(), 'column');
    const schema = buildLayoutSchema({ view: 'column', config: projected, language: 'en' });
    const node = find(schema, 'min_days_to_show') as { selector: { number: { max: number } } };

    expect(node.selector.number.max).toBe(5);
  });

  it('explains that each layout may differ and a switch never reloads', () => {
    const node = find(
      buildContentSchema({ view: 'list', config: config(), language: 'en' }),
      'days_to_show',
    )!;
    const helper = EditorLocalize.computeHelper('en', 'list', node);

    expect(helper).toContain('Each layout can set its own');
    expect(helper).toContain('never reloads');
  });
});

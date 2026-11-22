/**
 * The whole card's height in every layout (`card_height`, `card_max_height`), and what the editor's
 * fit summary and Month's width table say about each layout's width.
 *
 * The card writes the height on `ha-card` and the events area fills what the header leaves
 * (`rendering/card-size.ts`); happy-dom lays nothing out, so these pin the declarations, and the
 * layout they produce was measured in Chromium (`grid.ts` › `renderGridGroupedEvents` notes it).
 */

import { describe, expect, it } from 'vitest';

import { buildConfig } from './fixtures';
import type * as Types from '../src/config/types';
import * as ViewConfig from '../src/config/view';
import * as CardSize from '../src/rendering/card-size';
import * as Routing from '../src/rendering/editor/routing';
import { fitSummary, monthWidthTable } from '../src/rendering/editor/schemas/layout';
import * as MonthDay from '../src/utils/month-day';
import * as Sections from '../src/utils/sections';

const VIEWS: ReadonlyArray<Types.EffectiveView> = ['list', 'column', 'grid'];

describe('the whole card’s height', () => {
  it.each(VIEWS)('leaves %s at its content’s height while nothing sets one', (view) => {
    expect(CardSize.cardSizeStyle(buildConfig({ view }), view, 'wide', false)).toEqual({});
  });

  it.each(VIEWS)('writes %s’s height on the card and lets the events area fill it', (view) => {
    expect(
      CardSize.cardSizeStyle(buildConfig({ view, card_height: '30rem' }), view, 'wide', false),
    ).toEqual({
      height: '30rem',
      '--calendar-card-content-flex': '1 1 0',
      // The events area's own height gives way to the whole card's.
      '--calendar-card-height': 'auto',
    });
  });

  it.each(VIEWS)('caps %s without a height of its own, so it grows to the cap', (view) => {
    expect(
      CardSize.cardSizeStyle(buildConfig({ view, card_max_height: '40rem' }), view, 'wide', false),
    ).toEqual({ 'max-height': '40rem' });
  });

  it('takes a layout’s block over the top level, and the top level elsewhere', () => {
    const config = buildConfig({
      card_height: '30rem',
      column: { card_height: '20rem' },
      month: { card_height: '50rem' },
    });
    expect(ViewConfig.resolveCardSize(config, 'column').height).toBe('20rem');
    expect(ViewConfig.resolveCardSize(config, 'grid').height).toBe('30rem');
    expect(ViewConfig.resolveCardSize(config, 'list').height).toBe('30rem');
    expect(ViewConfig.resolveCardSize(config, 'month').height).toBe('50rem');
    // A layout's own `auto` stops it inheriting the top level's.
    const own = buildConfig({ card_height: '30rem', list: { card_height: 'auto' } });
    expect(CardSize.cardSizeStyle(own, 'list', 'wide', false)).toEqual({});
  });

  it('folds what it cannot draw to auto and none, at the top level and in a block', () => {
    const config = buildConfig({
      card_height: '50%',
      card_max_height: 'fit-content',
      column: { card_height: 'big' },
    });
    for (const view of [...VIEWS, 'month'] as const) {
      expect(ViewConfig.resolveCardSize(config, view), view).toEqual({
        height: 'auto',
        max: 'none',
      });
    }
  });

  it('keeps the events area’s own height and cap as they were while no whole height is set', () => {
    // `height` and `max_height` are released: they size the content area under the header, which
    // the card's custom properties carry, and the card adds nothing of its own.
    const config = buildConfig({ view: 'list', height: '300px', max_height: '400px' });
    expect(CardSize.cardSizeStyle(config, 'list', 'wide', false)).toEqual({});
    expect(CardSize.fillsCard(config, 'list', false)).toBe(false);
  });

  it('fills a Sections slot in every layout, Month by its own stylesheet', () => {
    const config = buildConfig({ card_height: '30rem' });
    for (const view of VIEWS) {
      expect(CardSize.cardSizeStyle(config, view, 'wide', true), view).toEqual(CardSize.FILL_CARD);
      expect(CardSize.fillsCard(buildConfig(), view, true), view).toBe(true);
    }
    expect(CardSize.cardSizeStyle(config, 'month', 'wide', true)).toEqual({});
  });

  it('asks a Sections dashboard for no rows of its own outside Month, whatever the height', () => {
    expect(Sections.cardGridOptions(buildConfig({ view: 'list', card_height: '30rem' })).rows).toBe(
      'auto',
    );
    // The card's own height sizes a month too, so it stops asking for its rows.
    expect(
      Sections.cardGridOptions(buildConfig({ view: 'month', card_height: '30rem' })).rows,
    ).toBe('auto');
    expect(Sections.cardGridOptions(buildConfig({ view: 'month' })).rows).toBe(10);
  });
});

describe('Card Height in the editor', () => {
  /** Picks a Card Height mode in a workspace, as the form does. */
  function pick(config: Types.Config, workspace: 'list' | 'column' | 'month', mode: string) {
    const frame: Routing.FormFrame = {
      workspace,
      schema: [{ name: 'height_mode', selector: { select: { options: [] } } }],
      data: Routing.workspaceFormData(config, workspace),
    };
    return Routing.applyWorkspaceChange(config, frame, { ...frame.data, height_mode: mode }, {})
      .config;
  }

  it('clears the events area’s own pair in the layout where a whole height is picked', () => {
    const config = buildConfig({
      height: '300px',
      max_height: '500px',
      column: { height: '200px' },
    });
    const fixed = pick(config, 'column', 'fixed');
    expect(fixed.column).toMatchObject({
      card_height: '300px',
      height: 'auto',
      max_height: 'none',
    });
    // The top level, which List and Grid read, keeps its own.
    expect(fixed.height).toBe('300px');
    expect(fixed.max_height).toBe('500px');
  });

  it('writes the whole card’s height in the month block and leaves the pair Month never reads', () => {
    const config = buildConfig({ view: 'month', height: '300px' });
    const fixed = pick(config, 'month', 'fixed');
    expect(fixed.month).toEqual({ card_height: '300px' });
    expect(fixed.height).toBe('300px');
  });
});

describe('Month’s widths', () => {
  /** The form the card itself settles on at a width, from a fresh load and then narrowed. */
  function formAt(config: Types.Config, width: number, wasNarrow: boolean): 'wide' | 'narrow' {
    const weekNumbers = ViewConfig.resolveViewOption(config, 'show_week_numbers', 'month') !== null;
    const narrow = MonthDay.monthNarrowAt(
      MonthDay.monthDayWidth(width, weekNumbers),
      ViewConfig.resolveMonthOption(config, 'min_day_width'),
      wasNarrow,
    );
    return narrow ? 'narrow' : 'wide';
  }

  it.each<readonly [string, Partial<Types.Config>, number, number]>([
    ['the default', {}, 594, 622],
    ['week numbers', { show_week_numbers: 'iso' }, 616, 644],
    ['a wider day', { month: { min_day_width: 100.5 } }, 738, 766],
  ])('names the widths the card switches at, with %s', (_name, extra, wide, again) => {
    const config = buildConfig({ view: 'month', ...extra });
    expect(ViewConfig.describeMonthWidths(config)).toEqual({
      wideFromPx: wide,
      wideAgainFromPx: again,
    });
    // Reconciled against the card's own rule, a pixel either side of each width.
    expect(formAt(config, wide, false)).toBe('wide');
    expect(formAt(config, wide - 1, false)).toBe('narrow');
    expect(formAt(config, again, true)).toBe('wide');
    expect(formAt(config, again - 1, true)).toBe('narrow');
  });

  it('draws them in its width table, with the margin it keeps once narrow', () => {
    const config = buildConfig({ view: 'month' });
    const table = monthWidthTable({ view: 'month', config, language: 'en' });
    expect(table.rows).toEqual([
      { width: '\u2265 594 px', layout: 'the Wide Month' },
      { width: '< 594 px', layout: 'the Narrow Month' },
    ]);
    expect(table.note).toContain('622 px');
  });
});

describe('the fit summary', () => {
  function summary(config: Partial<Types.Config>) {
    const merged = buildConfig(config);
    return fitSummary({ view: 'list', workspace: 'shared', config: merged, language: 'en' });
  }

  it('says what each layout the card can show draws at the common widths', () => {
    const result = summary({
      view: 'column',
      days_to_show: 7,
      toolbar: { show: true, view_switcher: true, view_switcher_layouts: ['list', 'month'] },
      list: { days_to_show: 3 },
    } as Partial<Types.Config>);
    expect(result?.layouts).toEqual(['List', 'Columns', 'Month']);
    // A seven-day Columns card sheds to two, the default floor, on a phone and in a Sections
    // column, and draws four at 768px, as measured in Chromium for the fit review.
    expect(result?.rows).toEqual([
      { width: '390 px · phone', cells: ['3 days', '2 days', 'Narrow'] },
      { width: '480 px · Sections column', cells: ['3 days', '2 days', 'Narrow'] },
      { width: '768 px', cells: ['3 days', '4 days', 'Wide'] },
      { width: '1,280 px', cells: ['3 days', '7 days', 'Wide'] },
    ]);
  });

  it('names the list a layout falls back to, and days kept narrower', () => {
    const fallback = summary({ view: 'column', days_to_show: 7, column: { min_days_to_show: 7 } });
    expect(fallback?.rows[0].cells).toEqual(['List, 7 days']);
    const narrower = summary({
      view: 'grid',
      days_to_show: 7,
      time_grid: { min_days_fallback: 'cramp', min_days_to_show: 7 },
    });
    expect(narrower?.rows[0].cells).toEqual(['7 days, narrower']);
  });

  it('agrees with the width each layout’s table lists', () => {
    const config = buildConfig({ view: 'grid', days_to_show: 7 });
    const { bands } = ViewConfig.describeColumnLayoutBands(config, 'grid');
    for (const band of bands) {
      expect(ViewConfig.fitAtWidth(config, 'grid', band.minWidthPx)).toEqual({
        kind: 'days',
        days: band.columns,
      });
    }
  });

  it('is left out where every width draws the same', () => {
    expect(summary({ view: 'list' })).toBeUndefined();
  });
});

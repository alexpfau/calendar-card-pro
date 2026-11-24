/**
 * Full Size: the overview's section between Layouts and More, and its Full-Size Settings page,
 * whose row says what the page holds and never its values. The page holds what the card opens
 * full size with, its Layout, Days To Show and Show Toolbar, each saying where its value comes
 * from, then whatever else `overlay:` holds, each line with Remove. Opening it writes nothing;
 * Taps and the toolbar's chips lead to it. Names are invented.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  factsOf,
  goOverview,
  goPage,
  labelOf,
  mountEditor,
  openPageOf,
  pressReset,
  reportsOf,
  stateWordOf,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { fullSizeLayoutsOwn, fullSizeSource } from '../src/rendering/editor/full-size';
import { overlayFormBlock, stripOverlayDefaults } from '../src/rendering/editor/value';

const VIEW = 'actions:overlay.view';
const DAYS = 'actions:overlay.days_to_show';
const TOOLBAR = 'actions:overlay.toolbar.show';

const CARD = { entities: ['calendar.anna'], view: 'list' };

const merged = (config: Record<string, unknown>): Types.Config =>
  ({ ...Config.DEFAULT_CONFIG, ...config }) as Types.Config;

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const $ = (editor: Editor, selector: string): HTMLElement | null =>
  editor.shadowRoot!.querySelector<HTMLElement>(selector);

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** The overlay block the editor last wrote, `undefined` where it wrote none. */
const lastOverlay = (editor: Editor): unknown => reportsOf(editor).slice(-1)[0]?.overlay;

/** The rows under Also Set for Full Size: each line's label and value. */
const lines = (editor: Editor): string[][] =>
  [...editor.shadowRoot!.querySelectorAll('[data-full-size]')].map((row) => [
    text(row.querySelector('.audit-line > span:first-child')),
    text(row.querySelector('.audit-value')),
  ]);

afterEach(() => {
  document.body.replaceChildren();
});

describe('Full Size on the overview', () => {
  it('says what the page holds, never the values it holds', async () => {
    const row = async (overlay?: Record<string, unknown>): Promise<string[]> => {
      const editor = await mountEditor({ ...CARD, ...(overlay && { overlay }) });
      const at = $(editor, '[data-focus="nav:full_size"]');
      return [text(at?.querySelector('.nav-title')), text(at?.querySelector('.nav-summary'))];
    };
    const line = ['Full-Size Settings', 'Layout, days and toolbar for the full-size view'];
    expect(await row()).toEqual(line);
    expect(await row({ view: 'month', days_to_show: 3 })).toEqual(line);
    expect(await row({ days_to_show: 1, toolbar: { show: false }, title: 'Big' })).toEqual(line);
  });

  it('opens the page, and writes nothing', async () => {
    const editor = await mountEditor({
      ...CARD,
      overlay: { toolbar: { search: false }, days_to_show: 14 },
    });
    const before = reportsOf(editor).length;
    await goPage(editor, 'full_size');
    expect($(editor, '.page[data-page="full_size"]')).not.toBeNull();
    expect(text($(editor, '.page-title'))).toBe('Full-Size Settings');
    expect([labelOf(editor, VIEW), labelOf(editor, DAYS), labelOf(editor, TOOLBAR)]).toEqual([
      'Layout',
      'Days To Show',
      'Show Toolbar',
    ]);
    expect([valueOf(editor, VIEW), valueOf(editor, DAYS), valueOf(editor, TOOLBAR)]).toEqual([
      'grid',
      14,
      true,
    ]);
    expect(reportsOf(editor)).toHaveLength(before);
  });
});

describe('the page’s settings', () => {
  it('say whether each is the full-size default or set for full size', async () => {
    const editor = await mountEditor({ ...CARD, days_to_show: 3, overlay: { days_to_show: 14 } });
    await goPage(editor, 'full_size');
    expect(stateWordOf(editor, VIEW)).toBe('Full-Size Default');
    expect(stateWordOf(editor, DAYS)).toBe('Set for Full Size');
    expect(stateWordOf(editor, TOOLBAR)).toBe('Full-Size Default');
  });

  it('writes only what changes, and drops a value back at the default', async () => {
    const editor = await mountEditor({
      ...CARD,
      tap_action: { action: 'overlay' },
      overlay: { toolbar: { search: false }, days_to_show: 14 },
    });
    await openPageOf(editor, VIEW);

    await changeField(editor, VIEW, 'month');
    expect(lastOverlay(editor)).toEqual({
      toolbar: { search: false },
      days_to_show: 14,
      view: 'month',
    });
    await changeField(editor, VIEW, 'grid');
    await changeField(editor, DAYS, 5);
    expect(lastOverlay(editor)).toEqual({ toolbar: { search: false }, days_to_show: 5 });
    await changeField(editor, DAYS, 7);
    expect(lastOverlay(editor)).toEqual({ toolbar: { search: false } });

    await changeField(editor, TOOLBAR, false);
    expect(lastOverlay(editor)).toEqual({ toolbar: { search: false, show: false } });
    await changeField(editor, TOOLBAR, true);
    expect(lastOverlay(editor)).toEqual({ toolbar: { search: false } });
  });

  it('resets a value to the full-size default, and leaves no empty block', async () => {
    const editor = await mountEditor({ ...CARD, overlay: { toolbar: { show: false } } });
    await goPage(editor, 'full_size');
    expect(stateWordOf(editor, TOOLBAR)).toBe('Set for Full Size');
    await pressReset(editor, TOOLBAR);
    expect(reportsOf(editor).slice(-1)[0]).not.toHaveProperty('overlay');
    expect(valueOf(editor, TOOLBAR)).toBe(true);
    expect(stateWordOf(editor, TOOLBAR)).toBe('Full-Size Default');
  });

  it('says which layout has a count of its own, and lists it to remove', async () => {
    const editor = await mountEditor({ ...CARD, overlay: { time_grid: { days_to_show: 3 } } });
    await goPage(editor, 'full_size');
    expect(factsOf(editor, DAYS)).toEqual(['Full-Size Default', 'Grid Has Its Own: 3']);
    expect(lines(editor)).toEqual([['Days To Show in Grid', '3']]);

    $(editor, '[data-focus="full-size:remove:overlay.time_grid.days_to_show"]')!.click();
    await editor.updateComplete;
    expect(reportsOf(editor).slice(-1)[0]).not.toHaveProperty('overlay');
    expect(factsOf(editor, DAYS)).toEqual(['Full-Size Default']);
    expect($(editor, '[data-heading="heading.full_size_more"]')).toBeNull();
  });
});

describe('Also Set for Full Size', () => {
  it('lists what else the block holds, each with its value, and removes one', async () => {
    const editor = await mountEditor({
      ...CARD,
      overlay: { view: 'month', toolbar: { search: false }, title: 'Big', shade: 2 },
    });
    await goPage(editor, 'full_size');
    // In Stored Settings' order: one value for every layout first, then what a layout can have
    // its own of, then what no setting writes.
    expect(lines(editor)).toEqual([
      ['Search Button', 'Off'],
      ['Title', 'Big'],
      ['shade', '2'],
    ]);

    $(editor, '[data-focus="full-size:remove:overlay.toolbar.search"]')!.click();
    await editor.updateComplete;
    expect(lastOverlay(editor)).toEqual({ view: 'month', title: 'Big', shade: 2 });
    expect(lines(editor)).toEqual([
      ['Title', 'Big'],
      ['shade', '2'],
    ]);
  });

  it('is not drawn while the block holds only the page’s own settings', async () => {
    const editor = await mountEditor({ ...CARD, overlay: { view: 'list', days_to_show: 3 } });
    await goPage(editor, 'full_size');
    expect($(editor, '[data-heading="heading.full_size_more"]')).toBeNull();
  });
});

describe('the lines leading to Full-Size Settings', () => {
  it('lead there from Taps while a tap or a hold opens the card full size', async () => {
    const none = await mountEditor(CARD);
    await goPage(none, 'taps_refresh');
    expect($(none, '[data-focus="xlink:full_size"]')).toBeNull();

    const hold = await mountEditor({
      ...CARD,
      hold_action: { action: 'overlay' },
      overlay: { days_to_show: 5 },
    });
    await goPage(hold, 'taps_refresh');
    const link = $(hold, '[data-focus="xlink:full_size"]');
    expect(text(link?.closest('.page-line'))).toBe(
      'Opens full size in Grid, 5 days: Full-Size Settings',
    );
    link!.click();
    await hold.updateComplete;
    expect($(hold, '.page[data-page="full_size"]')).not.toBeNull();
  });

  it('lead there from the toolbar’s chips while Open Full Size is pressed', async () => {
    const off = await mountEditor({ ...CARD, toolbar: { show: true } });
    await goPage(off, 'card_header');
    expect($(off, '[data-focus="xlink:full_size:toolbar"]')).toBeNull();

    const on = await mountEditor({
      ...CARD,
      toolbar: { show: true, overlay: true },
      overlay: { view: 'month' },
    });
    await goPage(on, 'card_header');
    const link = $(on, '[data-focus="xlink:full_size:toolbar"]');
    expect(text(link?.closest('.page-line'))).toBe('Opens full size in Month: Full-Size Settings');
    link!.click();
    await on.updateComplete;
    expect($(on, '.page[data-page="full_size"]')).not.toBeNull();
    await goOverview(on);
    expect($(on, '.page')).toBeNull();
  });
});

describe('where a full-size value comes from', () => {
  it('is set where overlay: holds it, else the full-size card’s own or the card’s', () => {
    const card = { title: 'Family', days_to_show: 7, compact_events_to_show: 3 };
    expect(fullSizeSource({ ...card, overlay: { days_to_show: 5 } }, ['days_to_show'])).toBe('set');
    // Seven days are the full-size card's own even where the card shows seven too.
    expect(fullSizeSource(card, ['days_to_show'])).toBe('default');
    expect(fullSizeSource(card, ['view'])).toBe('default');
    expect(fullSizeSource(card, ['toolbar', 'show'])).toBe('default');
    // The card's title reaches the full-size card; its compact limit is left out.
    expect(fullSizeSource(card, ['title'])).toBe('card');
    expect(fullSizeSource(card, ['compact_events_to_show'])).toBe('default');
    // Adding an event from a day is assumed where the card says nothing, and the card's own else.
    expect(fullSizeSource(card, ['day_tap_action'])).toBe('default');
    expect(
      fullSizeSource({ ...card, day_tap_action: { action: 'none' } }, ['day_tap_action']),
    ).toBe('card');
  });

  it('names each layout whose own count the block holds, where the layout keeps one', () => {
    const raw = {
      overlay: {
        time_grid: { days_to_show: 3 },
        column: { days_to_show: 5 },
        month: { days_to_show: 9 },
      },
    };
    expect(fullSizeLayoutsOwn(raw, ['days_to_show'])).toEqual([
      { view: 'column', value: 5 },
      { view: 'grid', value: 3 },
    ]);
  });
});

describe('the overlay block as stored', () => {
  it('drops what the full-size card opens with anyway, unless the YAML holds it', () => {
    expect(stripOverlayDefaults(merged({ overlay: { view: 'grid' } }))).toBeUndefined();
    expect(stripOverlayDefaults(merged({ overlay: { view: 'grid' } }), { view: 'grid' })).toEqual({
      view: 'grid',
    });
    expect(
      stripOverlayDefaults(merged({ overlay: { days_to_show: 7, toolbar: { show: true } } })),
    ).toBeUndefined();
    expect(
      stripOverlayDefaults(merged({ overlay: { days_to_show: 7, toolbar: { show: true } } }), {
        days_to_show: 7,
        toolbar: { show: true },
      }),
    ).toEqual({ days_to_show: 7, toolbar: { show: true } });
    expect(stripOverlayDefaults(merged({ overlay: { view: 'list', title: 'Big' } }))).toEqual({
      view: 'list',
      title: 'Big',
    });
  });

  it('drops a block a reset emptied, and keeps one the YAML holds empty', () => {
    const emptied = merged({ overlay: { toolbar: {}, time_grid: { days_to_show: undefined } } });
    expect(stripOverlayDefaults(emptied, { toolbar: { show: false } })).toBeUndefined();
    expect(stripOverlayDefaults(merged({ overlay: { time_grid: {} } }), { time_grid: {} })).toEqual(
      { time_grid: {} },
    );
  });

  it('shows the block as written, with what the full-size card opens with filled in', () => {
    expect(overlayFormBlock(merged({}))).toEqual({
      view: 'grid',
      days_to_show: 7,
      toolbar: { show: true },
    });
    expect(
      overlayFormBlock(
        merged({ overlay: { view: 'month', title: 'Big', toolbar: { show: false } } }),
      ),
    ).toEqual({ view: 'month', title: 'Big', days_to_show: 7, toolbar: { show: false } });
  });
});

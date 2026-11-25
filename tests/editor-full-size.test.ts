/**
 * Full Size: the overview's section between Layouts and More, and its Full-Size Settings page,
 * whose row says what the page holds and never its values. The page holds what the card opens
 * full size with, its Layout and Days To Show, then its toolbar as the card's own is drawn on Card
 * & Header, each saying where its value comes from, then whatever else `overlay:` holds, each line
 * with Remove. Opening it writes nothing; Taps and the toolbar's chips lead to it. Names are
 * invented.
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
  searchFor,
  stateWordOf,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { overlayConfig } from '../src/config/overlay';
import type * as Types from '../src/config/types';
import { VIEWS } from '../src/config/views';
import { fullSizeLayoutsOwn, fullSizeSource } from '../src/rendering/editor/full-size';
import { overlayFormBlock, stripOverlayDefaults } from '../src/rendering/editor/value';

const VIEW = 'actions:overlay.view';
const DAYS = 'actions:overlay.days_to_show';
const TOOLBAR = 'actions:overlay.toolbar.show';
const LEGEND = 'actions:overlay.toolbar.legend';
const LAYOUTS = 'actions:overlay.toolbar.view_switcher_layouts';

/** A full-size toolbar control's field. */
const control = (name: string): string => `actions:overlay.toolbar.${name}`;

const CARD = { entities: ['calendar.anna'], view: 'list' };

/**
 * A small List with a lean toolbar that opens full size on a tap, as on a wall tablet: the toolbar
 * shown with Add Event, Calendar Filter, Refresh, Search and the switcher turned off.
 */
const LEAN = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: ['calendar.anna', 'calendar.ben'],
  view: 'list',
  tap_action: { action: 'overlay' },
  toolbar: {
    show: true,
    add_event: false,
    legend: false,
    refresh: false,
    search: false,
    view_switcher: false,
  },
};

const merged = (config: Record<string, unknown>): Types.Config =>
  ({ ...Config.DEFAULT_CONFIG, ...config }) as Types.Config;

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const $ = (editor: Editor, selector: string): HTMLElement | null =>
  editor.shadowRoot!.querySelector<HTMLElement>(selector);

const text = (element: Element | null | undefined): string =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** The overlay block the editor last wrote, `undefined` where it wrote none. */
const lastOverlay = (editor: Editor): unknown => reportsOf(editor).slice(-1)[0]?.overlay;

/** The toolbar chips the open page draws, each with a check while pressed. */
const chipsOf = (editor: Editor): string[] =>
  [
    ...editor.shadowRoot!.querySelectorAll('.page .chip-group[aria-label="Controls"] button.chip'),
  ].map(
    (chip) =>
      `${text(chip.querySelector('span'))}${chip.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`,
  );

/** The lines under the toolbar's chips saying where their values come from. */
const chipFacts = (editor: Editor): string[] =>
  [
    ...editor.shadowRoot!.querySelectorAll('[data-heading="heading_toolbar"] .chip-source .fact'),
  ].map(text);

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
      overlay: { view: 'month', show_month: false, title: 'Big', shade: 2 },
    });
    await goPage(editor, 'full_size');
    // In Stored Settings' order: one value for every layout first, then what a layout can have
    // its own of, then what no setting writes.
    expect(lines(editor)).toEqual([
      ['Title', 'Big'],
      ['Show Month', 'Off'],
      ['shade', '2'],
    ]);

    $(editor, '[data-focus="full-size:remove:overlay.show_month"]')!.click();
    await editor.updateComplete;
    expect(lastOverlay(editor)).toEqual({ view: 'month', title: 'Big', shade: 2 });
    expect(lines(editor)).toEqual([
      ['Title', 'Big'],
      ['shade', '2'],
    ]);
  });

  it('is not drawn while the block holds only the page’s own settings', async () => {
    const editor = await mountEditor({
      ...CARD,
      overlay: {
        view: 'list',
        days_to_show: 3,
        toolbar: { search: false, legend: 'chips', size: 'large', view_switcher_layouts: ['list'] },
      },
    });
    await goPage(editor, 'full_size');
    expect($(editor, '[data-heading="heading.full_size_more"]')).toBeNull();
  });
});

describe('the full-size toolbar', () => {
  it('draws the card’s controls but Open Full Size, pressed as full size draws them, and why', async () => {
    const editor = await mountEditor(LEAN);
    await goPage(editor, 'full_size');
    // The switcher and the arrows are the full-size card's own; the rest the card turns off.
    expect(chipsOf(editor)).toEqual([
      'Add Event',
      'View Switcher ✓',
      'Calendar Filter',
      'Reset',
      'Refresh',
      'Search',
      'Date Navigation ✓',
    ]);
    expect(chipFacts(editor)).toEqual([
      'Full-Size Default: View Switcher (On), Date Navigation (On), Layouts in Switcher',
      'From the Card: Add Event (Off), Calendar Filter (Off), Reset (Off), Refresh (Off), Search (Off)',
    ]);
    expect(
      $(editor, `button.chip[data-field="${control('search')}"]`)?.getAttribute('aria-label'),
    ).toBe('Search, From the Card');
    expect($(editor, '.page button.chip[data-field$="toolbar.overlay"]')).toBeNull();
    expect(stateWordOf(editor, control('size'))).toBe('From the Card');
  });

  it('writes a control turned on for full size under overlay alone, the card’s toolbar as it was', async () => {
    const editor = await mountEditor(LEAN);
    await goPage(editor, 'full_size');
    await changeField(editor, control('add_event'), true);
    await changeField(editor, LEGEND, 'menu');
    await changeField(editor, control('refresh'), true);
    await changeField(editor, control('search'), true);

    const { overlay, ...card } = reportsOf(editor).slice(-1)[0];
    expect(overlay).toEqual({
      toolbar: { add_event: true, legend: 'menu', refresh: true, search: true },
    });
    // Everything else, the card's own toolbar included, exactly as written.
    expect(card).toEqual(LEAN);
    expect(chipFacts(editor)).toEqual([
      'Set for Full Size: Add Event (On), Calendar Filter (On), Refresh (On), Search (On)',
      'Full-Size Default: View Switcher (On), Date Navigation (On), Layouts in Switcher',
      'From the Card: Reset (Off)',
    ]);

    // The card's own controls stay off on Card & Header.
    await goPage(editor, 'card_header');
    expect(chipsOf(editor)).toEqual([
      'Add Event',
      'View Switcher',
      'Calendar Filter',
      'Reset',
      'Refresh',
      'Search',
      'Open Full Size',
      'Date Navigation ✓',
    ]);
  });

  it('drops a control pressed back to the card’s, and Reset Controls takes every one back', async () => {
    const editor = await mountEditor({
      ...LEAN,
      overlay: { days_to_show: 5, toolbar: { search: true, refresh: true, size: 'large' } },
    });
    await goPage(editor, 'full_size');
    await changeField(editor, control('search'), false);
    expect(lastOverlay(editor)).toEqual({
      days_to_show: 5,
      toolbar: { refresh: true, size: 'large' },
    });

    const reset = $(editor, '[data-heading="heading_toolbar"] .chip-source .line-button');
    expect(text(reset)).toBe('Reset Controls');
    reset!.click();
    await editor.updateComplete;
    // Arrow & Chip Size is a setting of its own, with its own Reset.
    expect(lastOverlay(editor)).toEqual({ days_to_show: 5, toolbar: { size: 'large' } });
    await pressReset(editor, control('size'));
    expect(lastOverlay(editor)).toEqual({ days_to_show: 5 });
    expect(reportsOf(editor).slice(-1)[0].toolbar).toEqual(LEAN.toolbar);
  });

  it('writes Calendar Filter’s form, and remembers it when pressed on again', async () => {
    const editor = await mountEditor(LEAN);
    await goPage(editor, 'full_size');
    await changeField(editor, LEGEND, 'chips');
    expect(lastOverlay(editor)).toEqual({ toolbar: { legend: 'chips' } });
    expect($(editor, `.qualifier[data-qualifies="${LEGEND}"] input[value="chips"]`)).not.toBeNull();

    // Off is the card's own, so nothing is left for full size.
    await changeField(editor, LEGEND, 'off');
    expect(reportsOf(editor).slice(-1)[0]).not.toHaveProperty('overlay');
    $(editor, `button.chip[data-field="${LEGEND}"]`)!.click();
    await editor.updateComplete;
    expect(lastOverlay(editor)).toEqual({ toolbar: { legend: 'chips' } });
  });

  it('turns off for full size a control the card shows, as YAML writes it', async () => {
    const editor = await mountEditor({ ...CARD, toolbar: { show: true } });
    await goPage(editor, 'full_size');
    await changeField(editor, LEGEND, 'off');
    await changeField(editor, control('add_event'), false);
    expect(lastOverlay(editor)).toEqual({ toolbar: { legend: false, add_event: false } });
    expect(reportsOf(editor).slice(-1)[0].toolbar).toEqual({ show: true });
  });

  it('offers the layout full size opens in, kept, and writes the switcher’s list for full size', async () => {
    const editor = await mountEditor({ ...CARD, overlay: { view: 'month' } });
    await goPage(editor, 'full_size');
    const boxes = [
      ...editor.shadowRoot!.querySelectorAll<HTMLInputElement>(
        `.qualifier[data-qualifies="${control('view_switcher')}"] input[data-value]`,
      ),
    ];
    expect(boxes.map((box) => box.getAttribute('aria-label') ?? box.value)).toEqual([
      'list',
      'column',
      'grid',
      'Month, Starting Layout',
    ]);
    expect(valueOf(editor, LAYOUTS)).toEqual([...VIEWS]);

    await changeField(editor, LAYOUTS, ['list', 'grid', 'month']);
    expect(lastOverlay(editor)).toEqual({
      view: 'month',
      toolbar: { view_switcher_layouts: ['list', 'grid', 'month'] },
    });
    expect(reportsOf(editor).slice(-1)[0]).not.toHaveProperty('toolbar');
    // Every layout again is what full size offers anyway.
    await changeField(editor, LAYOUTS, [...VIEWS]);
    expect(lastOverlay(editor)).toEqual({ view: 'month' });
  });

  it('keeps the switcher at two layouts when full size opens in the one it offered', async () => {
    const editor = await mountEditor({
      ...CARD,
      overlay: { toolbar: { view_switcher_layouts: ['month'] } },
    });
    await openPageOf(editor, VIEW);
    // Grid, where it opens, and Month.
    await changeField(editor, VIEW, 'month');
    expect(lastOverlay(editor)).toEqual({
      view: 'month',
      toolbar: { view_switcher_layouts: ['grid', 'month'] },
    });
    // One step: Undo takes back both.
    $(editor, '[data-focus="undo"]')!.click();
    await editor.updateComplete;
    expect(lastOverlay(editor)).toEqual({ toolbar: { view_switcher_layouts: ['month'] } });
  });

  it('withholds the controls while full size shows no toolbar, as the card’s own', async () => {
    const editor = await mountEditor({ ...CARD, overlay: { toolbar: { show: false } } });
    await goPage(editor, 'full_size');
    expect(chipsOf(editor)).toEqual([]);
    // Arrow & Chip Size waits in its place; a chip a gate withholds is not drawn at all.
    expect(
      [
        ...editor.shadowRoot!.querySelectorAll('[data-heading="heading_toolbar"] .setting-gated'),
      ].map((row) => row.getAttribute('aria-label')),
    ).toEqual(['Arrow & Chip Size. Appears once Show Toolbar is on.']);
    await changeField(editor, TOOLBAR, true);
    expect(chipsOf(editor)).toHaveLength(7);
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

describe('the preview on Full-Size Settings', () => {
  type Previewing = {
    _previewedScope(): { view: string; config: object; fullSize?: true } | undefined;
  };
  const previewed = (editor: Editor) => (editor as unknown as Previewing)._previewedScope();
  const line = (editor: Editor) => text($(editor, '.scope-preview-text'));
  const SAYS = 'Preview shows the full-size view, as wide as this dialog. Full size adds Close.';

  it('draws the card as full size opens it, and says so, while the page is open', async () => {
    const editor = await mountEditor(LEAN);
    expect(previewed(editor)).toBeUndefined();
    await goPage(editor, 'full_size');
    // Grid, with the toolbar's own defaults over the card's, and no Open Full Size.
    expect(previewed(editor)).toEqual({
      view: 'grid',
      config: overlayConfig(LEAN),
      authored: LEAN,
      fullSize: true,
    });
    expect(line(editor)).toBe(SAYS);

    // An edit there reaches the preview at once.
    await changeField(editor, control('search'), true);
    expect(previewed(editor)?.config).toMatchObject({ toolbar: { search: true } });

    // Back to the card as it opens, on the overview and in a search begun on the page.
    await goOverview(editor);
    expect(previewed(editor)).toBeUndefined();
    expect($(editor, '.scope-preview-text')).toBeNull();
    await goPage(editor, 'full_size');
    await searchFor(editor, 'refresh');
    expect(previewed(editor)).toBeUndefined();
  });

  it('draws full size in the layout it opens in, the card’s own layout included', async () => {
    const editor = await mountEditor({ ...LEAN, overlay: { view: 'list', days_to_show: 14 } });
    await goPage(editor, 'full_size');
    expect(previewed(editor)).toMatchObject({
      view: 'list',
      config: { view: 'list', days_to_show: 14 },
      fullSize: true,
    });
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
    const toolbar = {
      show: true,
      legend: 'menu',
      add_event: true,
      view_switcher: true,
      view_switcher_layouts: [...VIEWS],
      reset: false,
      refresh: true,
      search: true,
      navigation: true,
      size: 'normal',
    };
    expect(overlayFormBlock(merged({}))).toEqual({ view: 'grid', days_to_show: 7, toolbar });
    // Each control as full size draws it: the card's own where neither says otherwise.
    expect(
      overlayFormBlock(
        merged({
          toolbar: { search: false, legend: false, navigation: false },
          overlay: { view: 'month', title: 'Big', toolbar: { show: false, size: 'large' } },
        }),
      ),
    ).toEqual({
      view: 'month',
      title: 'Big',
      days_to_show: 7,
      toolbar: { ...toolbar, show: false, search: false, legend: 'off', size: 'large' },
    });
  });

  it('drops a toolbar line that leaves full size as it would be, unless the YAML holds it', () => {
    const card = { toolbar: { show: true, search: false, legend: false } };
    // The same as the card's, the same as full size's own, and the card's default: all nothing.
    const same = { search: false, navigation: true, refresh: true, view_switcher_layouts: VIEWS };
    expect(stripOverlayDefaults(merged({ ...card, overlay: { toolbar: same } }))).toBeUndefined();
    expect(
      stripOverlayDefaults(merged({ ...card, overlay: { toolbar: same } }), {
        toolbar: { search: false },
      }),
    ).toEqual({ toolbar: { search: false } });
    expect(
      stripOverlayDefaults(
        merged({
          ...card,
          overlay: {
            toolbar: { search: true, legend: 'menu', view_switcher_layouts: ['grid', 'month'] },
          },
        }),
      ),
    ).toEqual({
      toolbar: { search: true, legend: 'menu', view_switcher_layouts: ['grid', 'month'] },
    });
  });
});

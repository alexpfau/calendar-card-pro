/**
 * Layouts in Switcher: which layouts the toolbar's View Switcher offers, a setting of its own on
 * Card & Header › Toolbar, after the Controls, while View Switcher is pressed.
 *
 * Two options, never one value: the View Switcher chip turns the switcher on and off
 * (`toolbar.view_switcher`), and this setting writes `toolbar.view_switcher_layouts`, the list
 * of layouts, and nothing else. Folded at its default, it reads All Layouts; open, it is a toggle
 * chip per layout. The starting layout's chip stays pressed, as the card always offers it, and so
 * does the one other layout's beside it alone, since a switcher of one layout is not drawn: each
 * says why inside itself and in its name. Read off the mounted editor, as a user meets it.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  fakeHass,
  goPage,
  lastConfig,
  lineOf,
  mountEditor,
  reportsOf,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { SWITCHER_LAYOUTS_FIELD, layoutChips, pressLayout } from '../src/rendering/editor/chips';
import { buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
import { wordValue } from '../src/rendering/editor/summary';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const ID = SWITCHER_LAYOUTS_FIELD;

afterEach(() => document.body.replaceChildren());

/**
 * Mounts the editor over a card with one calendar and the toolbar shown, on Card & Header.
 *
 * @param toolbar - The toolbar block, beside `show: true`
 * @param extra - Further options
 * @param language - The editor's language
 * @returns The editor
 */
async function mount(
  toolbar: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
  language = 'en',
): Promise<Editor> {
  const editor = await mountEditor(
    {
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      toolbar: { show: true, ...toolbar },
      ...extra,
    },
    { hass: fakeHass({ language }) },
  );
  await goPage(editor, 'card_header');
  return editor;
}

/** The setting's block on the open page: its head row and, open, its chips. */
function setting(editor: Editor): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>(`[data-setting="${ID}"]`);
}

/** Opens the setting from its head row, as a press on it does. */
async function open(editor: Editor): Promise<void> {
  const toggle = setting(editor)?.querySelector<HTMLButtonElement>('.setting-toggle');
  if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  await editor.updateComplete;
}

/** The chips, one per layout. */
function chips(editor: Editor): HTMLButtonElement[] {
  return [
    ...editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(
      `[data-composed="layouts"][data-field="${ID}"] button.chip`,
    ),
  ];
}

/** Each chip as read: its layout, pressed or not, and kept (why) or pressable. */
function read(editor: Editor): string[] {
  return chips(editor).map((chip) => {
    const state = chip.getAttribute('aria-pressed') === 'true' ? 'on' : 'off';
    const kept = chip.getAttribute('aria-disabled') === 'true' ? ' kept' : '';
    return `${chip.dataset.value} ${state}${kept}: ${chip.getAttribute('aria-label')}`;
  });
}

/** Presses one layout's chip. */
async function press(editor: Editor, view: Types.EffectiveView): Promise<void> {
  chips(editor)
    .find((chip) => chip.dataset.value === view)!
    .click();
  await editor.updateComplete;
}

/** The toolbar block the editor last wrote. */
function writtenToolbar(editor: Editor): unknown {
  return lastConfig(editor)?.toolbar;
}

describe('the chips’ model', () => {
  it('presses the layouts offered, the starting one kept, and the other one alone kept too', () => {
    expect(layoutChips(['list', 'column', 'grid', 'month'], 'list')).toEqual([
      { view: 'list', pressed: true, kept: 'starting' },
      { view: 'column', pressed: true },
      { view: 'grid', pressed: true },
      { view: 'month', pressed: true },
    ]);
    // A list that leaves out the starting layout still offers it.
    expect(layoutChips(['month'], 'grid')).toEqual([
      { view: 'list', pressed: false },
      { view: 'column', pressed: false },
      { view: 'grid', pressed: true, kept: 'starting' },
      { view: 'month', pressed: true, kept: 'second' },
    ]);
    // Offering the starting layout alone, as an empty list does: the others can be pressed on.
    expect(layoutChips([], 'month')).toEqual([
      { view: 'list', pressed: false },
      { view: 'column', pressed: false },
      { view: 'grid', pressed: false },
      { view: 'month', pressed: true, kept: 'starting' },
    ]);
  });

  it('writes the whole list a press leaves, in the layouts’ order, the starting one among them', () => {
    expect(pressLayout(['list', 'column', 'grid', 'month'], 'grid', 'column')).toEqual([
      'list',
      'grid',
      'month',
    ]);
    expect(pressLayout(['month'], 'grid', 'list')).toEqual(['list', 'grid', 'month']);
    expect(pressLayout([], 'month', 'column')).toEqual(['column', 'month']);
    // A kept chip writes nothing: never a list of one layout, never the switcher off.
    expect(pressLayout(['list', 'month'], 'list', 'list')).toBeUndefined();
    expect(pressLayout(['list', 'month'], 'list', 'month')).toBeUndefined();
  });
});

describe('Layouts in Switcher on Card & Header', () => {
  it('folds to All Layouts after the Controls, and opens to a chip per layout', async () => {
    const editor = await mount();
    const root = editor.shadowRoot!;
    const head = setting(editor)!;
    expect(head.querySelector('.setting-label')?.textContent).toBe('Layouts in Switcher');
    expect(head.querySelector('.setting-value')?.textContent).toBe('All Layouts');
    expect(head.querySelector('.setting-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(chips(editor)).toEqual([]);

    // Placed right after the controls it qualifies, and before Calendar Filter.
    const controls = root.querySelector('.chip-group[aria-label="Controls"]')!;
    const filter = root.querySelector('[data-field="card:toolbar.legend"]')!;
    const follows = (a: Node, b: Node) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(controls, head)).toBe(true);
    expect(follows(head, filter)).toBe(true);

    await open(editor);
    expect(read(editor)).toEqual([
      'list on kept: List, Starting Layout',
      'column on: Columns',
      'grid on: Grid',
      'month on: Month',
    ]);
    // A kept chip is still a stop for the keyboard, its reason drawn inside it.
    const list = chips(editor)[0];
    expect(list.disabled).toBe(false);
    expect(list.querySelector('.chip-needs')?.textContent).toBe('Starting Layout');
    // Opening writes nothing.
    expect(reportsOf(editor)).toEqual([]);
  });

  it('writes the list each press leaves, and keeps the last other layout pressed', async () => {
    const editor = await mount();
    await open(editor);

    await press(editor, 'month');
    expect(writtenToolbar(editor)).toEqual({
      show: true,
      view_switcher_layouts: ['list', 'column', 'grid'],
    });
    await press(editor, 'column');
    expect(writtenToolbar(editor)).toEqual({ show: true, view_switcher_layouts: ['list', 'grid'] });
    expect(read(editor)).toEqual([
      'list on kept: List, Starting Layout',
      'column off: Columns',
      'grid on kept: Grid, Switcher Needs Two',
      'month off: Month',
    ]);
    expect(
      chips(editor)
        .find((chip) => chip.dataset.value === 'grid')!
        .querySelector('.chip-needs')?.textContent,
    ).toBe('Switcher Needs Two');

    // The kept chip does nothing: the switcher is never left offering one layout, nor turned off.
    const writes = reportsOf(editor).length;
    await press(editor, 'grid');
    expect(reportsOf(editor)).toHaveLength(writes);
    expect(valueOf(editor, 'card:toolbar.view_switcher')).toBe(true);

    // Every layout again is the default, so the key goes.
    await press(editor, 'column');
    await press(editor, 'month');
    expect(writtenToolbar(editor)).toEqual({ show: true });
  });

  it('reads the card’s own starting layout whatever Settings For edits', async () => {
    // Settings For keeps its layout from page to page, and the scope's projection draws that
    // layout as the view; the switcher's chips must still be those of the card as it opens.
    const editor = await mount({ view_switcher_layouts: ['list', 'grid'] }, { view: 'list' });
    await changeField(editor, 'workspace:editing_workspace', 'month');
    await goPage(editor, 'card_header');
    await open(editor);

    expect(read(editor)).toEqual([
      'list on kept: List, Starting Layout',
      'column off: Columns',
      'grid on kept: Grid, Switcher Needs Two',
      'month off: Month',
    ]);
    await press(editor, 'column');
    expect(writtenToolbar(editor)).toEqual({
      show: true,
      view_switcher_layouts: ['list', 'column', 'grid'],
    });
  });

  it('is one undo step per press', async () => {
    const editor = await mount();
    await open(editor);
    await press(editor, 'month');
    await press(editor, 'grid');
    expect(writtenToolbar(editor)).toEqual({
      show: true,
      view_switcher_layouts: ['list', 'column'],
    });

    editor.shadowRoot!.querySelector<HTMLElement>('.history-controls [data-focus="undo"]')!.click();
    await editor.updateComplete;
    expect(writtenToolbar(editor)).toEqual({
      show: true,
      view_switcher_layouts: ['list', 'column', 'grid'],
    });
  });

  it('resets to every layout by removing the key, and stays open', async () => {
    const editor = await mount({ view_switcher_layouts: ['list', 'month'] });
    // A stored value never folds; its Reset follows Set.
    expect(setting(editor)!.querySelector('.setting-value')).toBeNull();
    expect(read(editor)).toEqual([
      'list on kept: List, Starting Layout',
      'column off: Columns',
      'grid off: Grid',
      'month on kept: Month, Switcher Needs Two',
    ]);
    const reset = lineOf(editor, ID)!.querySelector<HTMLButtonElement>('button[data-reset-keys]')!;
    expect(reset.dataset.resetKeys).toBe('view_switcher_layouts');
    reset.click();
    await editor.updateComplete;
    expect(writtenToolbar(editor)).toEqual({ show: true });
    expect(read(editor).map((line) => line.split(':')[0])).toEqual([
      'list on kept',
      'column on',
      'grid on',
      'month on',
    ]);
  });

  it('offers the starting layout when the list leaves it out, and writes it in', async () => {
    const editor = await mount({ view_switcher_layouts: ['list', 'month'] }, { view: 'grid' });
    expect(read(editor)).toEqual([
      'list on: List',
      'column off: Columns',
      'grid on kept: Grid, Starting Layout',
      'month on: Month',
    ]);
    await press(editor, 'list');
    expect(writtenToolbar(editor)).toEqual({
      show: true,
      view_switcher_layouts: ['grid', 'month'],
    });
  });
});

describe('Starting Layout keeps the switcher it offered', () => {
  /** Takes the last step back. */
  async function undo(editor: Editor): Promise<void> {
    editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="undo"]')!.click();
    await editor.updateComplete;
  }

  it('adds the layout it leaves to a list that would offer one layout, in the same step', async () => {
    // Naming Month alone offers List and Month while the card starts in List, as the starting
    // layout is always offered. Starting in Month, the same list offers Month alone, and the card
    // draws no switcher, so the layout it leaves joins the list.
    const editor = await mount({ view_switcher_layouts: ['month'] }, { view: 'list' });
    await changeField(editor, 'display:view', 'month');

    expect(lastConfig(editor)).toMatchObject({
      view: 'month',
      toolbar: { show: true, view_switcher_layouts: ['list', 'month'] },
    });
    expect(Config.switcherOffers(lastConfig(editor) as unknown as Types.Config)).toEqual([
      'list',
      'month',
    ]);
    await goPage(editor, 'card_header');
    expect(read(editor)).toEqual([
      'list on kept: List, Switcher Needs Two',
      'column off: Columns',
      'grid off: Grid',
      'month on kept: Month, Starting Layout',
    ]);

    // One step: Undo takes back the layout and the list together.
    expect(
      editor.shadowRoot!.querySelector('[data-focus="undo"]')?.getAttribute('aria-label'),
    ).toBe('Undo: Change Starting Layout');
    await undo(editor);
    expect(lastConfig(editor)).toMatchObject({
      view: 'list',
      toolbar: { show: true, view_switcher_layouts: ['month'] },
    });
  });

  it.each([
    ['no list is stored, which offers every layout', {}],
    ['the list stored still offers two', { view_switcher_layouts: ['list', 'grid'] }],
    [
      'View Switcher is off, so nothing was offered',
      { view_switcher: false, view_switcher_layouts: ['month'] },
    ],
  ])('writes the list as it was where %s', async (_case, toolbar) => {
    const editor = await mount(toolbar, { view: 'list' });
    await changeField(editor, 'display:view', 'month');
    expect(lastConfig(editor)).toMatchObject({ view: 'month' });
    expect(writtenToolbar(editor)).toEqual({ show: true, ...toolbar });
  });
});

describe('Layouts in Switcher waits on View Switcher', () => {
  /** What the setting's place on the open page says while it is withheld. */
  function gated(editor: Editor): string | undefined {
    return editor
      .shadowRoot!.querySelector(`.setting-gated[data-field="${ID}"] .setting-gated-when`)
      ?.textContent?.trim();
  }

  it('says in its place that it appears once View Switcher is pressed', async () => {
    const editor = await mount({ view_switcher: false });
    expect(setting(editor)).toBeNull();
    expect(gated(editor)).toBe('Appears once View Switcher is pressed.');
  });

  it('shares the toolbar’s line while the toolbar is off', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    await goPage(editor, 'card_header');
    expect(setting(editor)).toBeNull();
    expect(
      editor
        .shadowRoot!.querySelector(`.setting-gated[data-field="${ID}"]`)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe(
      'Appears once Show Toolbar is on: Layouts in Switcher, Calendar Filter, Arrow & Chip Size.',
    );
  });

  it('keeps its list while View Switcher is off, and the chip alone turns it off', async () => {
    const editor = await mount({ view_switcher_layouts: ['list', 'month'] });
    const chip = editor.shadowRoot!.querySelector<HTMLButtonElement>(
      'button.chip[data-field="card:toolbar.view_switcher"]',
    )!;
    chip.click();
    await editor.updateComplete;
    expect(writtenToolbar(editor)).toEqual({
      show: true,
      view_switcher: false,
      view_switcher_layouts: ['list', 'month'],
    });
    // Not in use, its value named where the setting would be, with its Reset.
    const page = editor.shadowRoot!.querySelector('.page')!.textContent!.replace(/\s+/g, ' ');
    expect(page).toContain('Layouts in Switcher (List · Month)');
  });
});

describe('Layouts in Switcher in words', () => {
  const field = buildFieldIndex(
    schemaCtx({ ...Config.DEFAULT_CONFIG, toolbar: { show: true } } as Types.Config, 'list', 'en'),
  ).fields.get(ID)!;

  it.each([
    ['en', ['list', 'column', 'grid', 'month'], 'All Layouts'],
    ['en', ['list', 'month'], 'List · Month'],
    ['de', ['list', 'column', 'grid', 'month'], 'Alle Layouts'],
    ['de', ['column', 'grid'], 'Spalten · Zeitraster'],
  ])('reads in %s as the layouts it offers', (language, value, words) => {
    // Labeled in the language asked for, as the editor builds the field in it.
    const built = buildFieldIndex(
      schemaCtx(
        { ...Config.DEFAULT_CONFIG, toolbar: { show: true } } as Types.Config,
        'list',
        language,
      ),
    ).fields.get(ID)!;
    expect(wordValue(built, value, language)).toBe(words);
  });

  it('folds to the words of the editor’s language', async () => {
    const editor = await mount({}, {}, 'de');
    expect(setting(editor)!.querySelector('.setting-label')?.textContent).toBe(
      'Layouts im Umschalter',
    );
    expect(setting(editor)!.querySelector('.setting-value')?.textContent).toBe('Alle Layouts');
    await open(editor);
    expect(read(editor)).toEqual([
      'list on kept: Liste, Startlayout',
      'column on: Spalten',
      'grid on: Zeitraster',
      'month on: Monat',
    ]);
  });

  it('control: the field is labeled through the layouts’ own names', () => {
    expect(field.node).toMatchObject({
      name: 'view_switcher_layouts',
      selector: { select: { multiple: true } },
    });
  });
});

/**
 * Layouts in Switcher: which layouts the toolbar's View Switcher offers, its qualifier line on
 * Card & Header › Toolbar, under the Controls while View Switcher is pressed.
 *
 * Two options, never one value: the View Switcher chip turns the switcher on and off
 * (`toolbar.view_switcher`), and this line writes `toolbar.view_switcher_layouts`, the list of
 * layouts, and nothing else. It is a checkbox per layout under the legend "View Switcher offers".
 * The starting layout's stays checked, as the card always offers it, and so does the one other
 * layout's beside it alone, since a switcher of one layout is not drawn: each says why after its
 * name and in it, focusable and `aria-disabled`. Read off the mounted editor, as a user meets it.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  fakeHass,
  goPage,
  lastConfig,
  mountEditor,
  reportsOf,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { SWITCHER_LAYOUTS_FIELD, layoutChips, pressLayout } from '../src/rendering/editor/chips';
import { buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
import * as Routing from '../src/rendering/editor/routing';
import { wordValue } from '../src/rendering/editor/summary';
import { WORKSPACES } from '../src/rendering/editor/workspace';

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

/** View Switcher's qualifier line on the open page. */
function setting(editor: Editor): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>(
    '.qualifier[data-qualifies="card:toolbar.view_switcher"]',
  );
}

/** The checkboxes, one per layout. */
function chips(editor: Editor): HTMLInputElement[] {
  return [
    ...editor.shadowRoot!.querySelectorAll<HTMLInputElement>(
      `[data-composed="layouts"][data-field="${ID}"] input[type="checkbox"]`,
    ),
  ];
}

/** Each checkbox as read: its layout, checked or not, and kept (why) or free, and its name. */
function read(editor: Editor): string[] {
  return chips(editor).map((box) => {
    const state = box.checked ? 'on' : 'off';
    const kept = box.getAttribute('aria-disabled') === 'true' ? ' kept' : '';
    const name =
      box.getAttribute('aria-label') ?? box.closest('label')!.querySelector('span')!.textContent;
    return `${box.dataset.value} ${state}${kept}: ${name}`;
  });
}

/** Checks or unchecks one layout, as a click does. */
async function press(editor: Editor, view: Types.EffectiveView): Promise<void> {
  chips(editor)
    .find((box) => box.dataset.value === view)!
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
  it('draws a checkbox per layout under the Controls and their hint', async () => {
    const editor = await mount();
    const root = editor.shadowRoot!;
    const line = setting(editor)!;
    expect(line.querySelector('legend')?.textContent?.trim()).toBe('View Switcher offers');
    // No head row of its own any more: the line is the setting.
    expect(root.querySelector(`[data-setting="${ID}"]`)).toBeNull();

    // Under the chips and their hint, drawn unlike them: native checkboxes, never a chip.
    const controls = root.querySelector('.chip-group[aria-label="Controls"]')!;
    const hint = [...root.querySelectorAll('p.hint')].find((each) =>
      each.textContent?.includes('Pressed controls show in the toolbar.'),
    )!;
    const follows = (a: Node, b: Node) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(controls, hint)).toBe(true);
    expect(follows(hint, line)).toBe(true);
    expect(line.querySelector('button.chip')).toBeNull();

    expect(read(editor)).toEqual([
      'list on kept: List, Starting Layout',
      'column on: Columns',
      'grid on: Grid',
      'month on: Month',
    ]);
    // A kept checkbox is still a stop for the keyboard, its reason drawn after its name.
    const list = chips(editor)[0];
    expect(list.disabled).toBe(false);
    expect(list.closest('label')!.querySelector('.qualifier-kept')?.textContent).toBe(
      'Starting Layout',
    );
    expect(reportsOf(editor)).toEqual([]);
  });

  it('writes the list each press leaves, and keeps the last other layout pressed', async () => {
    const editor = await mount();

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
        .find((box) => box.dataset.value === 'grid')!
        .closest('label')!
        .querySelector('.qualifier-kept')?.textContent,
    ).toBe('Switcher Needs Two');

    // The kept checkbox does nothing: the switcher never offers one layout, nor is turned off.
    const writes = reportsOf(editor).length;
    await press(editor, 'grid');
    expect(reportsOf(editor)).toHaveLength(writes);
    expect(chips(editor).find((box) => box.dataset.value === 'grid')!.checked).toBe(true);
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

  it('resets to every layout with the Controls’ one Reset, by removing the key', async () => {
    const editor = await mount({ view_switcher_layouts: ['list', 'month'] });
    expect(read(editor)).toEqual([
      'list on kept: List, Starting Layout',
      'column off: Columns',
      'grid off: Grid',
      'month on kept: Month, Switcher Needs Two',
    ]);
    // Its facts and Reset are the Controls' own, under the chips: one option of the toolbar's.
    const reset = editor.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-focus="reset-chips:toolbar"]',
    )!;
    expect(reset.getAttribute('aria-label')).toBe('Reset Controls: Layouts in Switcher');
    expect(reset.dataset.resetKeys).toBe('view_switcher_layouts');
    expect(
      editor
        .shadowRoot!.querySelector('[data-heading="heading_toolbar"] .chip-source')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toContain('Chosen Here: Layouts in Switcher');
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

describe('Layouts in Switcher says when no switcher is drawn', () => {
  /** The words the setting's group is described by, each element read where it is drawn. */
  function described(editor: Editor): string[] {
    const root = editor.shadowRoot!;
    const group = root.querySelector<HTMLElement>(`[data-composed="layouts"][data-field="${ID}"]`)!;
    return (group.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => root.getElementById(id))
      .filter((element): element is HTMLElement => element !== null && group.contains(element))
      .map((element) => element.textContent!.trim());
  }

  const ALONE = 'No switcher is drawn until a second layout is checked.';

  it('says so under the checkboxes of a list that offers the starting layout alone', async () => {
    // Written by hand: the chips never leave one layout, but YAML can.
    const editor = await mount({ view_switcher_layouts: ['list'] }, { view: 'list' });
    expect(read(editor)).toEqual([
      'list on kept: List, Starting Layout',
      'column off: Columns',
      'grid off: Grid',
      'month off: Month',
    ]);
    expect(described(editor)).toEqual([ALONE]);

    // A second layout pressed, the switcher is drawn and the line goes.
    await press(editor, 'column');
    expect(writtenToolbar(editor)).toEqual({
      show: true,
      view_switcher_layouts: ['list', 'column'],
    });
    expect(described(editor)).toEqual([]);
    expect(setting(editor)!.textContent).not.toContain(ALONE);
  });

  it.each([
    ['an empty list', { view_switcher_layouts: [] }, [ALONE]],
    ['every layout, the default', {}, []],
    ['a list offering two', { view_switcher_layouts: ['month'] }, []],
  ])('%s', async (_case, toolbar, words) => {
    const editor = await mount(toolbar, { view: 'list' });
    expect(described(editor)).toEqual(words);
  });
});

describe('Layouts in Switcher reads the starting layout as the card does', () => {
  it('takes a view that is no layout as List, in every scope', () => {
    // The card reads an unknown `view` as List (`validateView`), and so do the chips; the list the
    // form holds, which words the setting where it is folded and found, must agree with both.
    const config = {
      ...Config.DEFAULT_CONFIG,
      view: 'agenda',
      toolbar: { show: true, view_switcher_layouts: ['grid'] },
    } as unknown as Types.Config;
    for (const workspace of WORKSPACES) {
      const toolbar = Routing.workspaceFormData(config, workspace).toolbar as Record<
        string,
        unknown
      >;
      expect(toolbar.view_switcher_layouts, workspace).toEqual(['list', 'grid']);
    }
  });
});

describe('Layouts in Switcher waits on View Switcher', () => {
  it('is drawn only while View Switcher is pressed, with no line in its place', async () => {
    const editor = await mount({ view_switcher: false });
    expect(setting(editor)).toBeNull();
    expect(editor.shadowRoot!.querySelector(`[data-field="${ID}"]`)).toBeNull();
    expect(editor.shadowRoot!.querySelector('.page')!.textContent).not.toContain(
      'Layouts in Switcher',
    );
  });

  it('is not named in the toolbar’s line while the toolbar is off', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
    });
    await goPage(editor, 'card_header');
    expect(setting(editor)).toBeNull();
    expect(editor.shadowRoot!.querySelector('.page')!.textContent).not.toContain(
      'Layouts in Switcher',
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

  it('reads in the words of the editor’s language', async () => {
    const editor = await mount({}, {}, 'de');
    expect(setting(editor)!.querySelector('legend')?.textContent?.trim()).toBe(
      'Der Layout-Umschalter bietet',
    );
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

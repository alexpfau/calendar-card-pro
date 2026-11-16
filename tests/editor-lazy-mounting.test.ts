/**
 * A closed button row mounts no form, and a page only its own (backlog item 307).
 *
 * Today's dialog built every panel's forms, 124 of them behind closed panels, at every open and
 * on every render. Now the card's settings sit on pages, a calendar entry's on a page of its own,
 * and only the place open draws its forms. The last of Home Assistant's collapsible panels, the
 * toolbar buttons', became the editor's own rows (PR 18): a row draws its forms while it is open,
 * in the update its toggle asks for, and no other row's.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  chooseResult,
  goPage,
  mountEditor,
  openPageOf,
  openResultGroup,
  resultRows,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { PAGES } from '../src/rendering/editor/pages';

const CONFIG = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: ['calendar.anna', { entity: 'calendar.ben', label: 'mdi:home' }],
  weather: { entity: 'weather.home', position: 'both' },
  toolbar: {
    show: true,
    buttons: [
      { icon: 'mdi:home', name: 'Home' },
      { icon: 'mdi:bed', name: 'Bed' },
    ],
  },
};

/** The forms an element holds, and Home Assistant's own editors. */
function mounted(element: Element): Element[] {
  return [...element.querySelectorAll('ha-form, ha-card-conditions-editor')];
}

afterEach(() => document.body.replaceChildren());

/**
 * A toolbar button's row on Card & Header, by its place.
 *
 * @param editor - The editor, on Card & Header
 * @param at - Its place
 * @returns The row
 */
function toolbarButton(editor: HTMLElement, at: number): HTMLElement {
  return [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.button-row')][at];
}

/**
 * A row's toggle, which opens and closes it.
 *
 * @param row - The row
 * @returns The toggle
 */
function toggle(row: HTMLElement): HTMLButtonElement {
  return row.querySelector<HTMLButtonElement>('[aria-expanded]')!;
}

describe('a closed button row', () => {
  it('holds no form, and the editor draws none of Home Assistant’s collapsible panels', async () => {
    const editor = await mountEditor(CONFIG);
    // The overview's own forms are drawn: the filter bar, Days to Show and Start Date.
    expect(editor.shadowRoot!.querySelectorAll('ha-form').length).toBeGreaterThanOrEqual(3);
    for (const { id } of PAGES.filter((page) => page.onlyIn === undefined)) {
      await goPage(editor, id);
      expect(editor.shadowRoot!.querySelectorAll('ha-expansion-panel'), id).toHaveLength(0);
    }

    await openPageOf(editor, 'card:title');
    const rows = [toolbarButton(editor, 0), toolbarButton(editor, 1)];
    expect(rows.map((row) => mounted(row).length)).toEqual([0, 0]);
    expect(rows.map((row) => toggle(row).getAttribute('aria-expanded'))).toEqual([
      'false',
      'false',
    ]);
    // The control: the page's own forms are drawn, outside the rows.
    expect(editor.shadowRoot!.querySelectorAll('ha-form').length).toBeGreaterThanOrEqual(2);
  });

  it('opens with its forms mounted in the update that opens it, and no other row’s', async () => {
    const editor = await mountEditor(CONFIG);
    await openPageOf(editor, 'card:title');
    const bed = toolbarButton(editor, 1);

    toggle(bed).click();
    await editor.updateComplete;

    expect(toggle(bed).getAttribute('aria-expanded')).toBe('true');
    // Icon, Name, Entity and Tap Action, a form each.
    expect(mounted(bed)).toHaveLength(4);
    expect(mounted(toolbarButton(editor, 0))).toEqual([]);
  });

  it('takes its forms away as it closes', async () => {
    const editor = await mountEditor(CONFIG);
    await openPageOf(editor, 'card:title');
    const bed = toolbarButton(editor, 1);
    toggle(bed).click();
    await editor.updateComplete;
    expect(mounted(bed)).toHaveLength(4);

    toggle(bed).click();
    await editor.updateComplete;

    expect(toggle(bed).getAttribute('aria-expanded')).toBe('false');
    expect(mounted(bed)).toEqual([]);
  });
});

describe('a page', () => {
  it('draws its own fields only, and the overview’s come back with it', async () => {
    const editor = await mountEditor(CONFIG);
    const ids = (): string[] =>
      [...editor.shadowRoot!.querySelectorAll('[data-field]')].map((field) =>
        field.getAttribute('data-field')!,
      );
    const overview = ids();
    expect(overview).toContain('content:days_to_show');

    await openPageOf(editor, 'events:show_time');
    expect(ids().length).toBeGreaterThan(1);
    expect(ids().every((id) => id.startsWith('events:') || id.startsWith('content:'))).toBe(true);
    expect(ids()).not.toContain('content:days_to_show');

    await openPageOf(editor, 'content:days_to_show');
    expect(ids()).toEqual(overview);
  });
});

describe('a search', () => {
  it('opens the calendar entry’s page a result names, which then mounts its forms, and no other', async () => {
    const editor = await mountEditor(CONFIG);
    const root = editor.shadowRoot!;

    await changeField(editor, 'filter:search', 'color');
    // Results are rows: no entry page is drawn, so no calendar form is mounted.
    expect(root.querySelectorAll('ha-form.entity-form')).toHaveLength(0);

    // One field of several calendars is one row, which opens to a row per calendar.
    const folded = resultRows(editor).find((each) => each.id.startsWith('calendar:'))!;
    await openResultGroup(editor, folded.id);
    const row = resultRows(editor).find(
      (each) => each.id === folded.id && each.ownerKey !== undefined,
    )!;
    await chooseResult(editor, row.key);
    const pages = [...root.querySelectorAll('.entry-page')];
    expect(pages.map((page) => page.getAttribute('data-entry-key'))).toEqual([
      String(row.ownerKey),
    ]);
    expect(root.querySelectorAll('ha-form.entity-form').length).toBeGreaterThan(0);
  });
});

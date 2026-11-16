/**
 * A closed panel mounts no form, and a page only its own (backlog item 307).
 *
 * Today's dialog built every panel's forms, 124 of them behind closed panels, at every open and
 * on every render. Now the card's settings sit on pages, a calendar entry's on a page of its own,
 * and only the place open draws its forms; the panels left, the toolbar buttons', mount theirs when
 * they first open, and have to do so before Home Assistant measures it: its `ha-expansion-panel` announces `expanded-will-change`, lets a render
 * pass, reads its content's height, and only then announces `expanded-changed` (`_toggleContainer`
 * in its frontend, 2026.11). Forms mounted on `expanded-changed` would arrive after the measuring,
 * and the panel would open to the height of an empty one.
 *
 * The panels here are replayed as Home Assistant's opens one on a click, step for step
 * (`toggleOpen`), rather than through the harness, so the order those steps happen in is the
 * thing tested.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  chooseResult,
  mountEditor,
  openPageOf,
  openResultGroup,
  resultRows,
} from './helpers/editor-host';
import * as Config from '../src/config/config';

/** A drawn panel, as Home Assistant's element and the editor set it. */
type Panel = HTMLElement & { expanded?: boolean; header?: string };

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

/** Every panel the editor draws, outermost first. */
function panels(editor: HTMLElement): Panel[] {
  return [...editor.shadowRoot!.querySelectorAll<Panel>('ha-expansion-panel')];
}

/** The forms a panel holds, its nested panels' included, and Home Assistant's own editors. */
function mounted(panel: Element): Element[] {
  return [...panel.querySelectorAll('ha-form, ha-card-conditions-editor')];
}

/** Waits as Home Assistant's `nextRender` does: an animation frame, then a timeout. */
function nextRender(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * Opens a panel as Home Assistant's `_toggleContainer` does on a click, recording what the panel
 * holds when Home Assistant measures it.
 *
 * @param panel - The panel
 * @returns The forms it held when measured
 */
async function toggleOpen(panel: Panel): Promise<number> {
  const announce = (type: string) =>
    panel.dispatchEvent(
      new CustomEvent(type, { detail: { expanded: true }, bubbles: true, composed: true }),
    );
  announce('expanded-will-change');
  await nextRender();
  const measured = mounted(panel).length;
  panel.expanded = true;
  announce('expanded-changed');
  return measured;
}

afterEach(() => document.body.replaceChildren());

/**
 * A toolbar button's panel on Card & Header, by its place among those drawn.
 *
 * @param editor - The editor, on Card & Header
 * @param at - Its place
 * @returns The panel
 */
function toolbarButton(editor: HTMLElement, at: number): Panel {
  return panels(editor).filter((panel) => panel.matches('.button-panel'))[at];
}

describe('a closed panel', () => {
  it('holds no form, and nor does any panel inside it', async () => {
    const editor = await mountEditor(CONFIG);
    // The overview draws its calendars as rows, and no panel at all; its own forms are drawn: the
    // filter bar, Days to Show and Start Date.
    expect(panels(editor)).toEqual([]);
    expect(editor.shadowRoot!.querySelectorAll('ha-form').length).toBeGreaterThanOrEqual(3);

    await openPageOf(editor, 'card:title');
    const drawn = panels(editor);
    // Two toolbar buttons on Card & Header: every panel it draws.
    expect(drawn).toHaveLength(2);
    expect(drawn.map((panel) => mounted(panel).length)).toEqual(drawn.map(() => 0));
    // The control: the page's own forms are drawn, outside the panels.
    const forms = editor.shadowRoot!.querySelectorAll('ha-form').length;
    expect(forms).toBeGreaterThanOrEqual(4);
  });

  it('opens with its forms mounted in the update that opens it, before Home Assistant measures it', async () => {
    const editor = await mountEditor(CONFIG);
    await openPageOf(editor, 'card:title');
    const bed = toolbarButton(editor, 1);
    const updates: string[] = [];
    bed.addEventListener('expanded-changed', () =>
      updates.push(`changed with ${mounted(bed).length} forms`),
    );

    bed.dispatchEvent(
      new CustomEvent('expanded-will-change', {
        detail: { expanded: true },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;

    // Still closed, and nothing announced yet beyond the will-change: the forms are there now.
    expect(bed.expanded).not.toBe(true);
    expect(updates).toEqual([]);
    expect(mounted(bed).length).toBeGreaterThan(0);
    // Only that panel: the other still holds none.
    expect(mounted(toolbarButton(editor, 0))).toEqual([]);
  });

  it('mounts what one of two toolbar buttons’ panels holds before Home Assistant measures it, and not the other’s', async () => {
    const editor = await mountEditor(CONFIG);
    await openPageOf(editor, 'card:title');
    const bed = toolbarButton(editor, 1);
    const measured = await toggleOpen(bed);
    expect(measured).toBeGreaterThan(0);
    expect(mounted(bed).length).toBe(measured);
    expect(mounted(toolbarButton(editor, 0))).toEqual([]);
  });

  it('mounts what a toolbar button’s panel holds before Home Assistant measures it', async () => {
    const editor = await mountEditor(CONFIG);
    await openPageOf(editor, 'card:title');
    const home = panels(editor).find((panel) => panel.matches('.button-panel'))!;
    expect(mounted(home)).toEqual([]);

    const measured = await toggleOpen(home);
    expect(measured).toBeGreaterThan(0);
    expect(mounted(home).length).toBe(measured);
  });

  it('keeps its forms once it has opened, closed again or not', async () => {
    const editor = await mountEditor(CONFIG);
    await openPageOf(editor, 'card:title');
    const bed = toolbarButton(editor, 1);
    await toggleOpen(bed);
    const forms = mounted(bed);
    expect(forms.length).toBeGreaterThan(0);

    bed.dispatchEvent(
      new CustomEvent('expanded-will-change', {
        detail: { expanded: false },
        bubbles: true,
        composed: true,
      }),
    );
    bed.expanded = false;
    editor.requestUpdate();
    await editor.updateComplete;

    expect(mounted(bed)).toEqual(forms);
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

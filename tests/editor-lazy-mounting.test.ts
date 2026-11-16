/**
 * A closed panel mounts no form, and a page only its own (backlog item 307).
 *
 * Today's dialog built every panel's forms, 124 of them behind closed panels, at every open and
 * on every render. Now the card's settings sit on pages, and only the place open draws its forms;
 * the panels left, a calendar's and a toolbar button's, mount theirs when they first open, and have
 * to do so before Home
 * Assistant measures it: its `ha-expansion-panel` announces `expanded-will-change`, lets a render
 * pass, reads its content's height, and only then announces `expanded-changed` (`_toggleContainer`
 * in its frontend, 2026.11). Forms mounted on `expanded-changed` would arrive after the measuring,
 * and the panel would open to the height of an empty one.
 *
 * The panels here are replayed as Home Assistant's opens one on a click, step for step
 * (`toggleOpen`), rather than through the harness, so the order those steps happen in is the
 * thing tested.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { changeField, mountEditor, openPageOf } from './helpers/editor-host';
import * as Config from '../src/config/config';

/** A drawn panel, as Home Assistant's element and the editor set it. */
type Panel = HTMLElement & { expanded?: boolean; header?: string };

const CONFIG = {
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: ['calendar.anna', { entity: 'calendar.ben', label: 'mdi:home' }],
  weather: { entity: 'weather.home', position: 'both' },
  toolbar: { show: true, buttons: [{ icon: 'mdi:home', name: 'Home' }] },
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

/** A calendar's panel, by its place among those drawn. */
function calendar(editor: HTMLElement, at: number): Panel {
  return panels(editor).filter((panel) => panel.matches('.entity-panel'))[at];
}

describe('a closed panel', () => {
  it('holds no form, and nor does any panel inside it', async () => {
    const editor = await mountEditor(CONFIG);

    const drawn = panels(editor);
    // Two calendars on the overview: every panel it draws.
    expect(drawn).toHaveLength(2);
    expect(drawn.map((panel) => mounted(panel).length)).toEqual(drawn.map(() => 0));
    // The control: the overview's own forms are drawn: the filter bar, the calendar picker,
    // Days to Show and Start Date.
    expect(editor.shadowRoot!.querySelectorAll('ha-form').length).toBeGreaterThanOrEqual(4);
  });

  it('opens with its forms mounted in the update that opens it, before Home Assistant measures it', async () => {
    const editor = await mountEditor(CONFIG);
    const ben = calendar(editor, 1);
    const updates: string[] = [];
    ben.addEventListener('expanded-changed', () =>
      updates.push(`changed with ${mounted(ben).length} forms`),
    );

    ben.dispatchEvent(
      new CustomEvent('expanded-will-change', {
        detail: { expanded: true },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;

    // Still closed, and nothing announced yet beyond the will-change: the forms are there now.
    expect(ben.expanded).not.toBe(true);
    expect(updates).toEqual([]);
    expect(mounted(ben).length).toBeGreaterThan(0);
    // Only that panel: the other still holds none.
    expect(mounted(calendar(editor, 0))).toEqual([]);
  });

  it('mounts what a calendar’s panel holds before Home Assistant measures it', async () => {
    const editor = await mountEditor(CONFIG);
    const ben = calendar(editor, 1);
    const measured = await toggleOpen(ben);
    expect(measured).toBeGreaterThan(0);
    expect(mounted(ben).length).toBe(measured);
    expect(mounted(calendar(editor, 0))).toEqual([]);
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
    const ben = calendar(editor, 1);
    await toggleOpen(ben);
    const forms = mounted(ben);

    ben.dispatchEvent(
      new CustomEvent('expanded-will-change', {
        detail: { expanded: false },
        bubbles: true,
        composed: true,
      }),
    );
    ben.expanded = false;
    editor.requestUpdate();
    await editor.updateComplete;

    expect(mounted(ben)).toEqual(forms);
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
  it('opens the calendar panels it keeps, which then mount their forms', async () => {
    const editor = await mountEditor(CONFIG);

    await changeField(editor, 'filter:search', 'color');

    const kept = panels(editor).filter((panel) => panel.matches('.entity-panel'));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.map((panel) => [panel.expanded, mounted(panel).length > 0])).toEqual(
      kept.map(() => [true, true]),
    );
  });
});

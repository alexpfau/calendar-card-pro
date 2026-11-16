/**
 * A closed panel mounts no form (backlog item 307).
 *
 * Today's dialog built every panel's forms, 124 of them behind closed panels, at every open and
 * on every render. Now a panel mounts its forms when it first opens, and has to do so before Home
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

import { changeField, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import { PANELS } from '../src/rendering/editor/panels';

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

describe('a closed panel', () => {
  it('holds no form, and nor does any panel inside it', async () => {
    const editor = await mountEditor(CONFIG);

    const drawn = panels(editor);
    // Nine panels, two calendars and one toolbar button: every panel the editor draws.
    expect(drawn).toHaveLength(PANELS.length + 2 + 1);
    expect(drawn.map((panel) => mounted(panel).length)).toEqual(drawn.map(() => 0));
    // The control: the forms above the panels are drawn as before.
    expect(editor.shadowRoot!.querySelectorAll('ha-form')).toHaveLength(3);
  });

  it('opens with its forms mounted in the update that opens it, before Home Assistant measures it', async () => {
    const editor = await mountEditor(CONFIG);
    const events = panels(editor).find((panel) => panel.header === 'Events')!;
    const updates: string[] = [];
    events.addEventListener('expanded-changed', () =>
      updates.push(`changed with ${mounted(events).length} forms`),
    );

    events.dispatchEvent(
      new CustomEvent('expanded-will-change', {
        detail: { expanded: true },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;

    // Still closed, and nothing announced yet beyond the will-change: the form is there now.
    expect(events.expanded).not.toBe(true);
    expect(updates).toEqual([]);
    expect(mounted(events)).toHaveLength(1);
    // Only that panel: every other one still holds none.
    expect(
      panels(editor)
        .filter((panel) => panel !== events)
        .flatMap(mounted),
    ).toEqual([]);
  });

  it.each(PANELS.map((panel) => panel.id))(
    'mounts what the %s panel holds before Home Assistant measures it',
    async (id) => {
      const editor = await mountEditor(CONFIG);
      const index = PANELS.findIndex((panel) => panel.id === id);
      const panel = panels(editor).filter(
        (candidate) => !candidate.matches('.entity-panel, .button-panel'),
      )[index];

      const measured = await toggleOpen(panel);

      expect(measured).toBeGreaterThan(0);
      expect(mounted(panel).length).toBe(measured);
    },
  );

  it('mounts a calendar’s forms when its own panel opens, inside an open Calendars panel', async () => {
    const editor = await mountEditor(CONFIG);
    const calendars = panels(editor)[0];
    const ben = panels(editor).filter((panel) => panel.matches('.entity-panel'))[1];

    expect(await toggleOpen(calendars)).toBe(1);
    // The calendars' own panels are still closed: the picker is the only form so far.
    expect(mounted(ben)).toEqual([]);

    expect(await toggleOpen(ben)).toBeGreaterThan(0);
    expect(mounted(panels(editor).filter((panel) => panel.matches('.entity-panel'))[0])).toEqual(
      [],
    );
  });

  it('keeps its forms once it has opened, closed again or not', async () => {
    const editor = await mountEditor(CONFIG);
    const events = panels(editor).find((panel) => panel.header === 'Events')!;
    await toggleOpen(events);
    const form = mounted(events)[0];

    events.dispatchEvent(
      new CustomEvent('expanded-will-change', {
        detail: { expanded: false },
        bubbles: true,
        composed: true,
      }),
    );
    events.expanded = false;
    editor.requestUpdate();
    await editor.updateComplete;

    expect(mounted(events)).toEqual([form]);
  });
});

describe('a search', () => {
  it('opens the panels it keeps, which then mount their forms', async () => {
    const editor = await mountEditor(CONFIG);

    await changeField(editor, 'filter:search', 'color');

    const kept = panels(editor).filter((panel) => !panel.matches('.entity-panel, .button-panel'));
    expect(kept.length).toBeGreaterThan(1);
    expect(kept.map((panel) => [panel.expanded, mounted(panel).length > 0])).toEqual(
      kept.map(() => [true, true]),
    );
  });
});

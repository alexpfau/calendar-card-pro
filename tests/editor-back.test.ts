/**
 * Where Back goes in the editor (backlog item 364): up one level, to the place the page header
 * names, whatever led to the page, with the row it came back by focused and in view; the line a
 * page reached by a jump draws instead, which returns there; and the scroller that both use,
 * which stays inside Home Assistant's dialog.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { fakeHass, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import { keepInView } from '../src/rendering/editor/views/focus';
import { scrollContainer } from '../src/rendering/editor/views/scroll';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const ANNA = 'calendar.anna';
const STATES = {
  [ANNA]: { entity_id: ANNA, state: 'off', attributes: { friendly_name: 'Anna' } },
};

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Mounts the editor over a calendar Home Assistant knows.
 *
 * @param config - Options beside the version
 * @returns The editor
 */
function mount(config: Record<string, unknown>): Promise<Editor> {
  return mountEditor(
    { config_version: Config.CURRENT_CONFIG_VERSION, ...config },
    { hass: fakeHass({ states: STATES }) },
  );
}

/**
 * Presses one of the editor's own controls, found by its `data-focus` key or a selector, then
 * lets the render and the focus after it settle.
 *
 * @param editor - The editor
 * @param focus - The key, or a selector
 */
async function press(editor: Editor, focus: string): Promise<void> {
  const selector = /^[[.]/.test(focus) ? focus : `[data-focus="${focus}"]`;
  const found = editor.shadowRoot!.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`no control ${focus}`);
  found.click();
  await editor.updateComplete;
  await editor.updateComplete;
}

/**
 * Where the editor is.
 *
 * @param editor - The editor
 * @returns Its route
 */
function route(editor: Editor): unknown {
  return (editor as unknown as { _nav: { route: unknown } })._nav.route;
}

/**
 * The `data-focus` key of what has focus.
 *
 * @param editor - The editor
 * @returns The key, if focus is on a control that has one
 */
function focused(editor: Editor): string | undefined {
  return (editor.shadowRoot!.activeElement as HTMLElement | null)?.dataset.focus;
}

/**
 * The words of the line under a page's header that returns somewhere, if it draws one.
 *
 * @param editor - The editor
 * @returns Its text
 */
function returnLine(editor: Editor): string | undefined {
  const line = editor.shadowRoot!.querySelector('[data-focus="return"]');
  return line?.textContent?.replace(/\s+/g, ' ').trim();
}

describe('Back', () => {
  it('goes to the layout the page names after Also for, with the topic’s row focused', async () => {
    const editor = await mount({ entities: [ANNA], view: 'list' });
    await press(editor, 'layout:list');
    await press(editor, 'nav:which_events');
    await press(editor, 'also:grid');
    expect(route(editor)).toEqual({ kind: 'page', page: 'which_events', scope: 'grid' });
    expect(returnLine(editor)).toBeUndefined();

    await press(editor, 'back-top');
    expect(route(editor)).toEqual({ kind: 'layout', layout: 'grid' });
    expect(focused(editor)).toBe('nav:which_events');

    await press(editor, 'back-foot');
    expect(route(editor)).toEqual({ kind: 'overview' });
    expect(focused(editor)).toBe('layout:grid');
  });

  it('goes up from a setting’s home that a reference row opened, which a line returns from', async () => {
    const editor = await mount({ entities: [ANNA], view: 'list' });
    await press(editor, 'layout:list');
    await press(editor, 'nav:day_header');
    const reference = editor.shadowRoot!.querySelector<HTMLElement>('[data-focus^="reference:"]');
    expect(reference).not.toBeNull();
    const key = reference!.dataset.focus!;
    await press(editor, key);
    expect(route(editor)).toEqual({ kind: 'page', page: 'events_weather_language' });
    expect(returnLine(editor)).toBe('Back to Days in List');

    await press(editor, '[data-focus="return"]');
    expect(route(editor)).toEqual({ kind: 'page', page: 'day_header', scope: 'list' });
    expect(focused(editor)).toBe(key);
    expect(returnLine(editor)).toBeUndefined();

    await press(editor, key);
    await press(editor, 'back-top');
    expect(route(editor)).toEqual({ kind: 'overview' });
    expect(focused(editor)).toBe('nav:events_weather_language');
  });
});

describe('the editor’s scroller', () => {
  /**
   * An element with the geometry a layout would give it: its scroll height, client height, and
   * where it sits in the viewport.
   *
   * @param overflow - Its `overflow-y`
   * @param scrollHeight - How tall its content is
   * @param clientHeight - How tall it shows
   * @param top - Its top in the viewport
   * @returns The element
   */
  function box(overflow: string, scrollHeight: number, clientHeight: number, top = 0): HTMLElement {
    const element = document.createElement('div');
    element.style.overflowY = overflow;
    Object.defineProperty(element, 'scrollHeight', { value: scrollHeight });
    Object.defineProperty(element, 'clientHeight', { value: clientHeight });
    element.getBoundingClientRect = () => new DOMRect(0, top, 400, clientHeight);
    return element;
  }

  /**
   * Home Assistant's dialog in shape: its body, which can scroll, holding the editor's pane, which
   * can too, holding the editor.
   *
   * @param pane - The pane's content height
   * @param body - The body's content height
   * @returns The editor and the two scrollers
   */
  function dialog(pane: number, body: number) {
    const outer = box('auto', body, 700);
    const inner = box('auto', pane, 690, 110);
    const editor = document.createElement('div');
    inner.append(editor);
    outer.append(inner);
    document.body.append(outer);
    return { editor, outer, inner };
  }

  it('is the pane that scrolls now, else the one that scrolls above it', () => {
    const tall = dialog(1500, 700);
    expect(scrollContainer(tall.editor)).toBe(tall.inner);
    document.body.replaceChildren();
    const page = dialog(690, 1000);
    expect(scrollContainer(page.editor)).toBe(page.outer);
  });

  it('stays the dialog’s on a page that fits, never the dashboard behind it', () => {
    const fits = dialog(690, 700);
    expect(scrollContainer(fits.editor)).toBe(fits.inner);
  });

  it('brings what Back lands on into view, by scrolling the pane alone', () => {
    const { editor, inner, outer } = dialog(1500, 700);
    const row = document.createElement('button');
    inner.append(row);
    // The pane shows 110 to 800 in the viewport; the row sits below it, then above it.
    row.getBoundingClientRect = () => new DOMRect(0, 900, 400, 44);
    keepInView(editor, row);
    expect(inner.scrollTop).toBe(144);
    expect(outer.scrollTop).toBe(0);
    row.getBoundingClientRect = () => new DOMRect(0, 60, 400, 44);
    keepInView(editor, row);
    expect(inner.scrollTop).toBe(94);
    // Shown already: nothing moves.
    row.getBoundingClientRect = () => new DOMRect(0, 300, 400, 44);
    keepInView(editor, row);
    expect(inner.scrollTop).toBe(94);
  });
});

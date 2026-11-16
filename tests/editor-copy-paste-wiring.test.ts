/**
 * The editor's Copy and Paste buttons, driven through the rendered DOM.
 *
 * Every other editor test in this suite exercises a schema or a pure function. None of
 * them render the element, which means the wiring between a button and the function it
 * is supposed to call was never observed: both `Entities.copySettings` and
 * `Entities.pasteSettings` could be deleted from their click handlers, and the full
 * suite stayed green.
 *
 * The buttons sit in each calendar row's action strip, opened from the row's ⋮. The chain
 * being pinned here is longer than "a click calls a function". Copy writes to a module-level
 * clipboard, so the Paste button on *every* row has to re-render to become enabled — which
 * only happens because the copy handler asks for an update. Paste then rebuilds the config
 * and reports it upward, and the pasted-into calendar gains settings of its own, so its own
 * Copy button turns on. Each of those is visible from the outside, and each breaks
 * differently.
 *
 * The clipboard is module state shared by every instance, so it is cleared before each
 * test; without that, a test would inherit whatever the previous one copied.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { keysOf } from './helpers/editor-host';
import * as Config from '../src/config/config';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import * as Entities from '../src/rendering/editor/entities';

customElements.define('editor-copy-paste-probe', CalendarCardProEditor);

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  updateComplete: Promise<unknown>;
}

/** Config events seen since the editor was built. */
interface Harness {
  element: EditorHost;
  /**
   * One calendar row's strip buttons, in document order, opening that row's strip first:
   * only one strip is open at a time, so reading a row closes any other.
   *
   * @param calendar - Which calendar's row, counting from zero
   * @returns Its strip's buttons
   */
  strip(calendar: number): Promise<HTMLButtonElement[]>;
  /**
   * One calendar's strip button, by the text on it.
   *
   * Addressed by label rather than by offset because the row has grown once already:
   * Duplicate and Remove landed between Paste and the next calendar's Copy, and every
   * index past the first shifted under tests that read correctly either way.
   *
   * @param calendar - Which calendar's row, counting from zero
   * @param label - The text on the button
   * @returns That button
   */
  action(calendar: number, label: string): Promise<HTMLButtonElement>;
  /**
   * Enabled/disabled state of every strip button on every row, as readable strings.
   *
   * @returns The states, row by row
   */
  states(): Promise<string[]>;
  emitted: Array<Record<string, unknown>>;
}

/**
 * The text a strip button shows as its label, without the note under it.
 *
 * @param button - A strip button
 * @returns Its label
 */
function labelOf(button: HTMLButtonElement): string {
  return button.querySelector('.strip-label')?.textContent?.trim() ?? '';
}

/**
 * Builds a rendered editor over the given calendars.
 *
 * @param entities - Calendars as they would be stored in the card config
 * @returns Handles for driving and observing the rendered editor
 */
async function renderEditor(entities: ReadonlyArray<unknown>): Promise<Harness> {
  const element = document.createElement('editor-copy-paste-probe') as EditorHost;
  element.hass = { states: {}, locale: { language: 'en' } };
  document.body.appendChild(element);
  element.setConfig({ config_version: Config.CURRENT_CONFIG_VERSION, entities });
  await element.updateComplete;

  const emitted: Array<Record<string, unknown>> = [];
  element.addEventListener('config-changed', (event) => {
    emitted.push((event as CustomEvent).detail.config as Record<string, unknown>);
  });

  const root = element.shadowRoot!;
  // One row's strip, and nothing outside it: the chassis has buttons of its own, such as Quick
  // Setup's, that are no part of what this file pins.
  const strip = async (calendar: number) => {
    const key = keysOf(element, 'entry')[calendar];
    const selector = `[data-focus^="strip:entry:${key}:"]`;
    if (root.querySelector(selector) === null) {
      const more = root.querySelector<HTMLButtonElement>(`[data-focus="more:entry:${key}"]`);
      if (more === null) throw new Error(`no row for calendar ${calendar}`);
      more.click();
      await element.updateComplete;
    }
    return Array.from(root.querySelectorAll<HTMLButtonElement>(selector));
  };

  return {
    element,
    strip,
    action: async (calendar, label) => {
      const found = (await strip(calendar)).find((button) => labelOf(button) === label);
      if (!found) throw new Error(`no ${label} button on calendar ${calendar}`);

      return found;
    },
    states: async () => {
      const states: string[] = [];
      for (let calendar = 0; calendar < keysOf(element, 'entry').length; calendar++) {
        for (const button of await strip(calendar)) {
          states.push(`${labelOf(button)}:${button.hasAttribute('disabled') ? 'off' : 'on'}`);
        }
      }
      return states;
    },
    emitted,
  };
}

describe('editor copy/paste buttons', () => {
  beforeEach(() => {
    Entities.clearCopiedSettings();
    document.body.innerHTML = '';
  });

  it('offers Copy only for a calendar that has settings of its own', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      'calendar.b',
    ]);

    // Each row's whole strip, both calendars, so a button appearing or disappearing shows up
    // here rather than silently shifting the offsets the rest of this file used to read.
    expect(await harness.states()).toEqual([
      'Move Up:off',
      'Move Down:on',
      'Move to Top:off',
      'Duplicate:on',
      'Copy Settings:on',
      'Paste Settings:off',
      'Remove:on',
      'Move Up:on',
      'Move Down:off',
      'Move to Top:on',
      'Duplicate:on',
      'Copy Settings:off',
      'Paste Settings:off',
      'Remove:on',
    ]);
  });

  it('enables every Paste button once something has been copied', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      'calendar.b',
    ]);

    (await harness.action(0, 'Copy Settings')).click();
    await harness.element.updateComplete;

    // Both Paste buttons, not just the one on the calendar that was copied from: the
    // clipboard is shared. The first is read from the strip still open from the click, so it
    // flips only because the copy handler asks for an update.
    expect((await harness.action(0, 'Paste Settings')).hasAttribute('disabled')).toBe(false);
    expect((await harness.action(1, 'Paste Settings')).hasAttribute('disabled')).toBe(false);
  });

  it('reports a config in which the pasted-into calendar keeps its own entity', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      'calendar.b',
    ]);

    (await harness.action(0, 'Copy Settings')).click();
    await harness.element.updateComplete;
    (await harness.action(1, 'Paste Settings')).click();
    await harness.element.updateComplete;

    expect(harness.emitted).toHaveLength(1);
    expect(harness.emitted[0].entities).toEqual([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      { entity: 'calendar.b', label: 'A', color: '#ff0000' },
    ]);
  });

  it('turns on the pasted-into calendar’s own Copy button', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      'calendar.b',
    ]);

    (await harness.action(0, 'Copy Settings')).click();
    await harness.element.updateComplete;
    expect((await harness.action(1, 'Copy Settings')).hasAttribute('disabled')).toBe(true);

    (await harness.action(1, 'Paste Settings')).click();
    await harness.element.updateComplete;

    // The pasted config has to have traveled back into the editor for this to flip.
    expect((await harness.action(1, 'Copy Settings')).hasAttribute('disabled')).toBe(false);
  });

  it('leaves the calendar that was copied from untouched', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      { entity: 'calendar.b', label: 'B' },
    ]);

    (await harness.action(0, 'Copy Settings')).click();
    await harness.element.updateComplete;
    (await harness.action(1, 'Paste Settings')).click();
    await harness.element.updateComplete;

    const entities = harness.emitted[0].entities as Array<Record<string, unknown>>;
    expect(entities[0]).toEqual({ entity: 'calendar.a', label: 'A', color: '#ff0000' });
    expect(entities[1].entity).toBe('calendar.b');
  });
});

/**
 * The editor's Copy and Paste buttons, driven through the rendered DOM.
 *
 * Every other editor test in this suite exercises a schema or a pure function. None of
 * them render the element, which means the wiring between a button and the function it
 * is supposed to call was never observed: both `Entities.copySettings` and
 * `Entities.pasteSettings` could be deleted from their click handlers, and the full
 * suite stayed green.
 *
 * The chain being pinned here is longer than "a click calls a function". Copy writes to
 * a module-level clipboard, so the Paste buttons on *every* calendar have to re-render
 * to become enabled — which only happens because the copy handler asks for an update.
 * Paste then rebuilds the config and reports it upward, and the pasted-into calendar
 * gains settings of its own, so its own Copy button turns on. Each of those is visible
 * from the outside, and each breaks differently.
 *
 * The clipboard is module state shared by every instance, so it is cleared before each
 * test; without that, a test would inherit whatever the previous one copied.
 */

import { beforeEach, describe, expect, it } from 'vitest';

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
   * Every rendered button, in document order: four per calendar, so calendar N's own
   * four begin at 4N.
   */
  buttons(): HTMLButtonElement[];
  /**
   * One calendar's button, by the text on it.
   *
   * Addressed by label rather than by offset because the row has grown once already:
   * Duplicate and Remove landed between Paste and the next calendar's Copy, and every
   * index past the first shifted under tests that read correctly either way.
   *
   * @param calendar - Which calendar's row, counting from zero
   * @param label - The text on the button
   * @returns That button
   */
  action(calendar: number, label: string): HTMLButtonElement;
  /** Enabled/disabled state of every button, as readable strings. */
  states(): string[];
  emitted: Array<Record<string, unknown>>;
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
  element.setConfig({ entities });
  await element.updateComplete;

  const emitted: Array<Record<string, unknown>> = [];
  element.addEventListener('config-changed', (event) => {
    emitted.push((event as CustomEvent).detail.config as Record<string, unknown>);
  });

  const buttons = () => Array.from(element.shadowRoot!.querySelectorAll('button'));

  const rowOf = (calendar: number) =>
    Array.from(
      element.shadowRoot!.querySelectorAll('.entity-actions')[calendar].querySelectorAll('button'),
    );

  return {
    element,
    buttons,
    action: (calendar, label) => {
      const found = rowOf(calendar).find((button) => button.textContent?.trim() === label);
      if (!found) throw new Error(`no ${label} button on calendar ${calendar}`);

      return found;
    },
    states: () =>
      buttons().map(
        (button) =>
          `${button.textContent?.trim()}:${button.hasAttribute('disabled') ? 'off' : 'on'}`,
      ),
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

    // The whole row, both calendars, so a button appearing or disappearing shows up here
    // rather than silently shifting the offsets the rest of this file used to read.
    expect(harness.states()).toEqual([
      'Copy Settings:on',
      'Paste Settings:off',
      'Duplicate:on',
      'Remove:on',
      'Copy Settings:off',
      'Paste Settings:off',
      'Duplicate:on',
      'Remove:on',
    ]);
  });

  it('enables every Paste button once something has been copied', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      'calendar.b',
    ]);

    harness.action(0, 'Copy Settings').click();
    await harness.element.updateComplete;

    // Both Paste buttons, not just the one on the calendar that was copied from: the
    // clipboard is shared, so the whole list has to re-render.
    expect(harness.action(0, 'Paste Settings').hasAttribute('disabled')).toBe(false);
    expect(harness.action(1, 'Paste Settings').hasAttribute('disabled')).toBe(false);
  });

  it('reports a config in which the pasted-into calendar keeps its own entity', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      'calendar.b',
    ]);

    harness.action(0, 'Copy Settings').click();
    await harness.element.updateComplete;
    harness.action(1, 'Paste Settings').click();
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

    harness.action(0, 'Copy Settings').click();
    await harness.element.updateComplete;
    expect(harness.action(1, 'Copy Settings').hasAttribute('disabled')).toBe(true);

    harness.action(1, 'Paste Settings').click();
    await harness.element.updateComplete;

    // The pasted config has to have travelled back into the editor for this to flip.
    expect(harness.action(1, 'Copy Settings').hasAttribute('disabled')).toBe(false);
  });

  it('leaves the calendar that was copied from untouched', async () => {
    const harness = await renderEditor([
      { entity: 'calendar.a', label: 'A', color: '#ff0000' },
      { entity: 'calendar.b', label: 'B' },
    ]);

    harness.action(0, 'Copy Settings').click();
    await harness.element.updateComplete;
    harness.action(1, 'Paste Settings').click();
    await harness.element.updateComplete;

    const entities = harness.emitted[0].entities as Array<Record<string, unknown>>;
    expect(entities[0]).toEqual({ entity: 'calendar.a', label: 'A', color: '#ff0000' });
    expect(entities[1].entity).toBe('calendar.b');
  });
});

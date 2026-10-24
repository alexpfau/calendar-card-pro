/**
 * The editor's half of resetting a remembered view.
 *
 * A changed configuration has a new fingerprint, so every device falls back to the
 * configured view after an edit without anyone doing anything. What that leaves open is
 * undoing the edit later: the old fingerprint would come back, and with it the old choice.
 * The card cannot close that on the device doing the editing, because Home Assistant
 * builds a fresh card for each new configuration in edit mode instead of handing the
 * configuration to the old one. So the editor forgets the choice for the configuration it
 * opened with, once an edit is really made — and not before, since opening the editor and
 * closing it again is not an edit.
 */

import { afterEach, describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { walkSchema } from '../src/rendering/editor/panels';
import { configFingerprint, readViewChoice, writeViewChoice } from '../src/utils/view-choice';

customElements.define('view-choice-editor-probe', CalendarCardProEditor);

interface EditorHost extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  readonly updateComplete: Promise<unknown>;
}

const OPENED = {
  type: 'custom:calendar-card-pro-dev',
  config_version: Config.CURRENT_CONFIG_VERSION,
  entities: ['calendar.anna'],
  toolbar: { show: true },
};

async function open(): Promise<EditorHost> {
  const element = document.createElement('view-choice-editor-probe') as EditorHost;
  element.hass = { states: {}, locale: { language: 'en' } };
  document.body.appendChild(element);
  element.setConfig(structuredClone(OPENED));
  await element.updateComplete;
  return element;
}

/** Fires the whole-object change `ha-form` emits from the form owning the title. */
async function editTitle(element: EditorHost, title: string): Promise<void> {
  const form = Array.from(element.shadowRoot!.querySelectorAll('ha-form.panel-form')).find(
    (candidate) =>
      [...walkSchema((candidate as unknown as { schema: HaFormSchema[] }).schema)].some(
        ({ node }) => node.name === 'title',
      ),
  )!;
  const data = (form as unknown as { data: Record<string, unknown> }).data;
  form.dispatchEvent(new CustomEvent('value-changed', { detail: { value: { ...data, title } } }));
  await element.updateComplete;
}

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('the editor and the remembered view', () => {
  const fingerprint = configFingerprint(OPENED);

  it('leaves the choice alone when the editor is only opened', async () => {
    writeViewChoice(fingerprint, 'grid');
    const element = await open();

    // Home Assistant echoes the editor's own output back; that is not an edit either.
    element.setConfig(structuredClone(OPENED));
    await element.updateComplete;

    expect(readViewChoice(fingerprint)).toBe('grid');
  });

  it('forgets it once an edit is made in the form', async () => {
    writeViewChoice(fingerprint, 'grid');
    const element = await open();

    await editTitle(element, 'Family');

    expect(readViewChoice(fingerprint)).toBeUndefined();
  });

  it('forgets it once a different configuration arrives, as from the YAML editor', async () => {
    writeViewChoice(fingerprint, 'grid');
    const element = await open();

    element.setConfig({ ...structuredClone(OPENED), title: 'Family' });
    await element.updateComplete;

    expect(readViewChoice(fingerprint)).toBeUndefined();
  });

  it("forgets only the opened configuration's choice", async () => {
    writeViewChoice(fingerprint, 'grid');
    writeViewChoice('another-card', 'column');
    const element = await open();

    await editTitle(element, 'Family');

    expect(readViewChoice('another-card')).toBe('column');
  });
});

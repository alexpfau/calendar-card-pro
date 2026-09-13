import { afterEach, describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { workspaceFields } from '../src/rendering/editor/routing';

customElements.define('editor-serialization-state-test', CalendarCardProEditor);

interface Editor extends HTMLElement {
  hass: unknown;
  setConfig(config: Record<string, unknown>): void;
  readonly updateComplete: Promise<boolean>;
}

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

async function mount(config: Record<string, unknown>) {
  const editor = document.createElement('editor-serialization-state-test') as Editor;
  editor.hass = { states: {}, locale: { language: 'en' } };
  editor.setConfig({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    ...config,
  });
  document.body.appendChild(editor);
  await editor.updateComplete;
  const reports: Record<string, unknown>[] = [];
  editor.addEventListener('config-changed', (event) => {
    reports.push(structuredClone((event as CustomEvent).detail.config));
  });
  return { editor, reports };
}

function formFor(editor: Editor, key: string): Form {
  const forms = [...editor.shadowRoot!.querySelectorAll<Form>('ha-form:not(.entity-form)')].filter(
    (form) => [...workspaceFields(form.schema)].some(({ node }) => node.name === key),
  );
  expect(forms, `form for ${key}`).toHaveLength(1);
  return forms[0];
}

async function change(editor: Editor, key: string, value: unknown): Promise<void> {
  const form = formFor(editor, key);
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, [key]: value } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

afterEach(() => document.body.replaceChildren());

describe.each(['list', 'column', 'grid'] as const)('%s serialized editor state', (view) => {
  it.each([false, true])(
    'follows the saved override ownership before another edit (echo=%s)',
    async (echo) => {
      const block = view === 'grid' ? 'time_grid' : view;
      const { editor, reports } = await mount({
        view,
        [block]: { show_description: true },
      });
      await change(editor, 'show_description', false);
      const saved = reports.at(-1)!;
      if (view === 'list') expect(saved).toHaveProperty('list.show_description', false);
      else expect(saved).not.toHaveProperty(block);

      if (echo) {
        editor.setConfig(saved);
        await editor.updateComplete;
      }
      await change(editor, 'editing_workspace', 'shared');
      await change(editor, 'show_description', true);
      await change(editor, 'editing_workspace', view);

      const stored = reports.at(-1)!;
      expect(stored).toHaveProperty('show_description', true);
      if (view === 'list') expect(stored).toHaveProperty('list.show_description', false);
      else expect(stored).not.toHaveProperty(block);
      expect(formFor(editor, 'show_description').data.show_description).toBe(view !== 'list');

      const reopened = await mount(stored);
      expect(formFor(reopened.editor, 'show_description').data.show_description).toBe(
        formFor(editor, 'show_description').data.show_description,
      );
    },
  );
});

it.each([false, true])('retains an explicit divergent Grid default (echo=%s)', async (echo) => {
  const { editor, reports } = await mount({
    view: 'grid',
    time_grid: { event_font_size: '18px' },
  });
  await change(editor, 'event_font_size', '12px');
  expect(reports.at(-1)).toHaveProperty('time_grid.event_font_size', '12px');
  if (echo) {
    editor.setConfig(reports.at(-1)!);
    await editor.updateComplete;
  }
  await change(editor, 'editing_workspace', 'shared');
  await change(editor, 'event_font_size', '20px');
  await change(editor, 'editing_workspace', 'grid');
  expect(reports.at(-1)).toHaveProperty('event_font_size', '20px');
  expect(reports.at(-1)).toHaveProperty('time_grid.event_font_size', '12px');
  expect(formFor(editor, 'event_font_size').data.event_font_size).toBe('12px');
});

it('keeps incomplete scoped text through a save and an echo', async () => {
  const { editor, reports } = await mount({
    view: 'grid',
    time_grid: { height: '400px' },
  });
  await change(editor, 'card_height', '');
  expect(reports).toHaveLength(0);
  await change(editor, 'show_description', true);
  expect(reports.at(-1)).toHaveProperty('time_grid.height', '400px');
  expect(formFor(editor, 'card_height').data.card_height).toBe('');
  editor.setConfig(reports.at(-1)!);
  await editor.updateComplete;
  expect(formFor(editor, 'card_height').data.card_height).toBe('');
});

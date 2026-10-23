import { afterEach, describe, expect, it } from 'vitest';

import type * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';

customElements.define('editor-panel-search-test', CalendarCardProEditor);

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

interface Panel extends HTMLElement {
  header: string;
  secondary: string;
}

function fieldNames(schema: ReadonlyArray<HaFormSchema>): string[] {
  return schema.flatMap((node) =>
    'schema' in node ? fieldNames(node.schema) : 'selector' in node ? [node.name] : [],
  );
}

async function mount(language: string, view: Types.EffectiveView = 'grid') {
  const editor = document.createElement('editor-panel-search-test') as CalendarCardProEditor;
  editor.hass = { states: {}, locale: { language } } as Types.Hass;
  editor.setConfig({
    config_version: 5,
    entities: ['calendar.anna'],
    view,
  } as Types.Config);
  document.body.appendChild(editor);
  await editor.updateComplete;
  return editor;
}

function rulesForm(editor: CalendarCardProEditor): Form | undefined {
  return [...editor.shadowRoot!.querySelectorAll<Form>('.panel-form')].find((form) =>
    fieldNames(form.schema).includes('day_separator_width'),
  );
}

async function search(editor: CalendarCardProEditor, query: string, customizedOnly = false) {
  const form = editor.shadowRoot!.querySelector<Form>('.filter-form')!;
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, search: query, customized_only: customizedOnly } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

afterEach(() => document.body.replaceChildren());

describe.each(['en', 'en-GB', 'de', 'et', 'it', 'lt', 'lv', 'nb', 'pl', 'sk', 'sv'])(
  'panel search in %s',
  (language) => {
    it('finds the whole Grid panel by the title actually displayed', async () => {
      const editor = await mount(language);
      const form = rulesForm(editor)!;
      const before = fieldNames(form.schema);
      const title = form.closest<Panel>('ha-expansion-panel')!.header;
      expect(before).toContain('hour_line_width');
      expect(before).toHaveLength(11);
      expect(title).not.toBe('');

      await search(editor, title);
      expect(fieldNames(rulesForm(editor)?.schema ?? [])).toEqual(before);
    });

    it('finds the whole Grid panel by its displayed helper', async () => {
      const editor = await mount(language);
      const form = rulesForm(editor)!;
      const before = fieldNames(form.schema);
      const helper = form.closest<Panel>('ha-expansion-panel')!.secondary;
      expect(helper).not.toBe('');

      await search(editor, helper);
      expect(fieldNames(rulesForm(editor)?.schema ?? [])).toEqual(before);
    });

    it('control: still finds List by its title without exposing Grid-only rules', async () => {
      const editor = await mount(language, 'list');
      const form = rulesForm(editor)!;
      const before = fieldNames(form.schema);
      const title = form.closest<Panel>('ha-expansion-panel')!.header;
      expect(before).not.toContain('hour_line_width');

      await search(editor, title);
      expect(fieldNames(rulesForm(editor)?.schema ?? [])).toEqual(before);
    });
  },
);

it('does not let a panel title bypass Customized Only', async () => {
  const editor = await mount('it');
  const title = rulesForm(editor)!.closest<Panel>('ha-expansion-panel')!.header;
  await search(editor, title, true);
  expect(rulesForm(editor)).toBeUndefined();
});

import { afterEach, describe, expect, it } from 'vitest';

import {
  type FormElement,
  changeFields,
  fakeHass,
  formOf,
  mountEditor,
  openPageOf,
} from './helpers/editor-host';
import type * as Types from '../src/config/types';
import type { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';

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
  const editor = await mountEditor(
    {
      config_version: 5,
      entities: ['calendar.anna'],
      view,
    },
    { hass: fakeHass({ language }) },
  );
  // The rules' panel, opened as a user would to read it: a closed panel mounts no form.
  await openPageOf(editor, 'separators:day_separator_width');
  return editor;
}

function rulesForm(editor: CalendarCardProEditor): FormElement | undefined {
  return formOf(editor, 'separators:day_separator_width');
}

async function search(editor: CalendarCardProEditor, query: string, customizedOnly = false) {
  await changeFields(editor, {
    'filter:search': query,
    'filter:customized_only': customizedOnly,
  });
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

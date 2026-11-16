import { afterEach, describe, expect, it } from 'vitest';

import {
  CARD,
  changeFields,
  fakeHass,
  formsOf,
  mountEditor,
  openPageOf,
  resultRows,
} from './helpers/editor-host';
import type * as Types from '../src/config/types';
import type { CalendarCardProEditor } from '../src/rendering/editor/element';
import { lookupForView } from '../src/rendering/editor/localize';

/**
 * The rule fields the open place shows: drawn on the Size & Spacing page, or listed by the
 * overview's results for a query.
 *
 * @param editor - Editor
 * @returns Their ids, in order
 */
function ruleFields(editor: CalendarCardProEditor): string[] {
  const root = editor.shadowRoot!;
  const results =
    root.querySelector('.overview') !== null && root.querySelector('[data-focus^="nav:"]') === null;
  const ids = results
    ? resultRows(editor).map((row) => row.id)
    : formsOf(editor, CARD).map((form) =>
        form.closest('[data-field]')!.getAttribute('data-field')!,
      );
  return ids.filter((id) => id.startsWith('separators:'));
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
  // The rules' page, opened as a user would to read it.
  await openPageOf(editor, 'separators:day_separator_width');
  return editor;
}

/**
 * The words the search matches the rules' panel by, in a layout: the panel's title or the line
 * under it, as the filter reads them, now that pages draw neither.
 *
 * @param language - Editor language
 * @param view - The scope
 * @param suffix - `.helper` for the line under the title
 * @returns The words
 */
function panelWords(language: string, view: string, suffix?: string): string {
  return lookupForView(language, 'panel.separators', view, suffix) ?? '';
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
    it('finds every Grid rule by the title of the panel that builds them', async () => {
      const editor = await mount(language);
      const before = ruleFields(editor);
      const title = panelWords(language, 'grid');
      expect(before).toContain('separators:time_grid.hour_line_width');
      expect(before).toHaveLength(11);
      expect(title).not.toBe('');

      await search(editor, title);
      expect(ruleFields(editor)).toEqual(before);
    });

    it('finds every Grid rule by the line under that panel’s title', async () => {
      const editor = await mount(language);
      const before = ruleFields(editor);
      const helper = panelWords(language, 'grid', '.helper');
      expect(helper).not.toBe('');

      await search(editor, helper);
      expect(ruleFields(editor)).toEqual(before);
    });

    it('control: still finds List by its title without exposing Grid-only rules', async () => {
      const editor = await mount(language, 'list');
      const before = ruleFields(editor);
      const title = panelWords(language, 'list');
      expect(before).not.toContain('separators:time_grid.hour_line_width');

      await search(editor, title);
      expect(ruleFields(editor)).toEqual(before);
    });
  },
);

it('does not let a panel title bypass Customized Only', async () => {
  const editor = await mount('it');
  await search(editor, panelWords('it', 'grid'), true);
  expect(ruleFields(editor)).toEqual([]);
});

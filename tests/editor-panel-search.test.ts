import { afterEach, describe, expect, it } from 'vitest';

import {
  CARD,
  changeFields,
  fakeHass,
  formsOf,
  mountEditor,
  openPageOf,
} from './helpers/editor-host';
import type * as Types from '../src/config/types';
import type { CalendarCardProEditor } from '../src/rendering/editor/element';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { lookup } from '../src/rendering/editor/localize';
import { PAGES } from '../src/rendering/editor/pages';

/**
 * The rule fields every card form drawn now holds: on the Size & Spacing page, or in the
 * overview's results for a query.
 *
 * @param editor - Editor
 * @returns Their names, in order
 */
function ruleFields(editor: CalendarCardProEditor): string[] {
  return formsOf(editor, CARD)
    .filter((form) =>
      form.closest('[data-field]')?.getAttribute('data-field')?.startsWith('separators:'),
    )
    .flatMap((form) => fieldNames(form.schema));
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
  // The rules' page, opened as a user would to read it.
  await openPageOf(editor, 'separators:day_separator_width');
  return editor;
}

/**
 * The words a search finds the rules by: the title of the page that draws them, or of the
 * heading they sit under there.
 *
 * @param language - Editor language
 * @param key - Page or heading title key
 * @returns The words
 */
function words(language: string, key: string): string {
  return lookup(language, key) ?? '';
}

const SIZE_SPACING = PAGES.find((page) => page.id === 'size_spacing')!;

/**
 * The rule fields a heading of the Size & Spacing page holds, by name.
 *
 * @param key - Heading key
 * @returns Their names, in order
 */
function headingRules(key: string): string[] {
  const heading = SIZE_SPACING.headings.find((candidate) => candidate.key === key)!;
  return heading.fields
    .map(([id]) => id)
    .filter((id) => id.startsWith('separators:'))
    .map((id) => id.slice(id.lastIndexOf('.') + 1).replace(/^separators:/, ''));
}

async function search(editor: CalendarCardProEditor, query: string, customizedOnly = false) {
  await changeFields(editor, {
    'filter:search': query,
    'filter:customized_only': customizedOnly,
  });
}

afterEach(() => document.body.replaceChildren());

describe.each(['en', 'en-GB', 'de', 'et', 'it', 'lt', 'lv', 'nb', 'pl', 'sk', 'sv'])(
  'search for the rules in %s',
  (language) => {
    it('finds every Grid rule by the title of the page that draws them', async () => {
      const editor = await mount(language);
      const before = ruleFields(editor);
      const title = words(language, SIZE_SPACING.titleKey);
      expect(before).toContain('hour_line_width');
      expect(before).toHaveLength(11);
      expect(title).not.toBe('');

      await search(editor, title);
      expect(ruleFields(editor)).toEqual(before);
    });

    it.each(['heading_between_days', 'heading_across_the_grid'])(
      'finds the Grid rules under %s by that heading’s title',
      async (key) => {
        const editor = await mount(language);
        const rules = headingRules(key);
        const title = words(language, key);
        expect(rules.length).toBeGreaterThan(1);
        expect(title).not.toBe('');

        await search(editor, title);
        expect(ruleFields(editor)).toEqual(expect.arrayContaining(rules));
      },
    );

    it('control: still finds List’s rules by the page title without exposing Grid-only rules', async () => {
      const editor = await mount(language, 'list');
      const before = ruleFields(editor);
      expect(before).not.toContain('hour_line_width');

      await search(editor, words(language, SIZE_SPACING.titleKey));
      expect(ruleFields(editor)).toEqual(before);
    });
  },
);

it('does not let a page or heading title bypass Customized Only', async () => {
  const editor = await mount('it');
  await search(editor, words('it', SIZE_SPACING.titleKey), true);
  expect(ruleFields(editor)).toEqual([]);
  await search(editor, words('it', 'heading_across_the_grid'), true);
  expect(ruleFields(editor)).toEqual([]);
});

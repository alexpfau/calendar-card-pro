/**
 * Month's own settings in the visual editor: the card's four heights, its two shadings and the font
 * sizes of its days. Each is drawn on its topic's page under Month, and writes into `month:`, never
 * the top level.
 *
 * 🚨 Two of them share their names with the card's synthetic Height fields, `card_height` and
 * `card_max_height`, which write the shared `height` and `max_height`. A check that asks a name
 * alone whether it is synthetic takes Month's for the card's: the block serializer then dropped a
 * height written fresh, and the held text of one being typed was not shown back. Both are pinned
 * here by what the editor writes and shows.
 */

import { describe, expect, it } from 'vitest';

import {
  changeField,
  editLayout,
  formOf,
  helperOf,
  labelOf,
  lastConfig,
  mountEditor,
  openPageOf,
  reportsOf,
  valueOf,
} from './helpers/editor-host';
import type { FieldId } from '../src/rendering/editor/field-index';
import { PAGES } from '../src/rendering/editor/pages';

const CARD = { type: 'custom:calendar-card-pro', entities: ['calendar.anna'], view: 'month' };

/** Each new field, the page and heading it is placed under, its label and a value to write. */
const FIELDS: ReadonlyArray<readonly [FieldId, string, string, string, string]> = [
  ['layout:month.card_height', 'size_spacing', 'heading_card_size', 'Month Card Height', '50rem'],
  [
    'layout:month.card_max_height',
    'size_spacing',
    'heading_card_size',
    'Month Maximum Height',
    '60rem',
  ],
  [
    'layout:month.compact_card_height',
    'size_spacing',
    'heading_card_size',
    'Compact Card Height',
    '30rem',
  ],
  [
    'layout:month.compact_card_max_height',
    'size_spacing',
    'heading_card_size',
    'Compact Maximum Height',
    '40rem',
  ],
  [
    'layout:month.weekend_background_color',
    'day_header',
    'weekend_colors',
    'Weekend Shading',
    'transparent',
  ],
  [
    'layout:month.today_background_color',
    'day_header',
    'heading_today',
    'Today Shading',
    'rgb(1, 2, 3)',
  ],
  [
    'layout:month.cell_event_font_size',
    'events',
    'heading_title',
    'Event Font Size in Days',
    '15px',
  ],
  ['layout:month.cell_time_font_size', 'events', 'time', 'Time Font Size in Days', '11px'],
];

/** The page and heading the registry places a field under. */
function placement(id: FieldId): [string, string | undefined] | undefined {
  for (const page of PAGES) {
    for (const heading of page.headings) {
      if (heading.fields.some(([field]) => field === id)) return [page.id, heading.key];
    }
  }
  return undefined;
}

/** What the editor last wrote. */
function stored(editor: Parameters<typeof lastConfig>[0]): Record<string, unknown> {
  const config = lastConfig(editor);
  expect(config).toBeDefined();
  return config!;
}

async function monthEditor(config: Record<string, unknown> = CARD) {
  const editor = await mountEditor(config);
  await editLayout(editor, 'month');
  return editor;
}

/**
 * Month has no hours and no Days To Show, so nothing on its pages may describe either: the banner
 * switch and a calendar's banner choice are shared with Grid, and the Which Events row with every
 * layout.
 */
describe('words Month shares with other layouts', () => {
  const HOURS = /hour|time grid/i;

  it('names the banner switch and its helper by what Month draws too', async () => {
    const editor = await monthEditor();
    await openPageOf(editor, 'content:multiday_banners');
    expect(labelOf(editor, 'content:multiday_banners')).not.toMatch(HOURS);
    expect(helperOf(editor, 'content:multiday_banners')).not.toMatch(HOURS);
    editor.remove();
  });

  it('names a calendar’s banner choice and its options by what Month draws too', async () => {
    const editor = await monthEditor();
    const id = 'calendar:multiday_banners';
    await openPageOf(editor, id);
    expect(labelOf(editor, id)).not.toMatch(HOURS);
    const form = formOf(editor, id) as unknown as {
      schema: Array<{ selector: { select: { options: Array<{ label: string }> } } }>;
    };
    const options = form.schema[0].selector.select.options.map((option) => option.label);
    expect(options.length).toBeGreaterThan(1);
    for (const option of options) expect(option).not.toMatch(HOURS);
    editor.remove();
  });

  it('describes Which Events on Month’s page without a Days To Show it lacks', async () => {
    const editor = await mountEditor(CARD);
    editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="layout:month"]')!.click();
    await editor.updateComplete;
    const row = editor.shadowRoot!.querySelector('[data-focus="nav:which_events"]');
    expect(row?.textContent).toMatch(/\S/);
    expect(row?.textContent).not.toMatch(/days to show/i);
    await openPageOf(editor, 'content:filter_duplicates_mode');
    expect(formOf(editor, 'content:days_to_show')).toBeUndefined();
    editor.remove();
  });
});

describe('Month’s own settings in the editor', () => {
  it.each(FIELDS)(
    'draws %s on %s › %s, labeled as Month’s, and writes it into month:',
    async (id, page, heading, label, value) => {
      expect(placement(id)).toEqual([page, heading]);
      const editor = await monthEditor();
      await openPageOf(editor, id);
      expect(formOf(editor, id)).toBeDefined();
      expect(labelOf(editor, id)).toBe(label);

      await changeField(editor, id, value);
      const config = stored(editor);
      const key = id.slice('layout:month.'.length);
      expect(config.month).toEqual({ [key]: value });
      // Never the card's own Height, whose synthetic fields share two of these names.
      expect(config).not.toHaveProperty('height');
      expect(config).not.toHaveProperty('max_height');
      expect(config).not.toHaveProperty(key);
      editor.remove();
    },
  );

  it('says what the heights, shadings and cell sizes do where it is not obvious', async () => {
    const editor = await monthEditor();
    const helpers = Object.fromEntries(
      await FIELDS.reduce<Promise<Array<[string, string | undefined]>>>(async (done, [id]) => {
        const list = await done;
        await openPageOf(editor, id);
        return [...list, [id, helperOf(editor, id)]];
      }, Promise.resolve([])),
    );
    expect(helpers['layout:month.card_height']).toMatch(/632px, or 760px with the toolbar/);
    expect(helpers['layout:month.card_height']).toMatch(/Layout tab/);
    expect(helpers['layout:month.compact_card_height']).toMatch(/632px, or 760px with the toolbar/);
    expect(helpers['layout:month.compact_card_max_height']).toMatch(/grows/);
    expect(helpers['layout:month.today_background_color']).toMatch(/replaces/);
    expect(helpers['layout:month.cell_event_font_size']).toMatch(/Event Font Size/);
    expect(helpers['layout:month.cell_time_font_size']).toMatch(/Time Font Size/);
    // The cap alone says nothing the label does not.
    expect(helpers['layout:month.card_max_height']).toBeUndefined();
    editor.remove();
  });

  it.each(['layout:month.card_height', 'layout:month.compact_card_height'] as const)(
    'holds %s while it is typed, and writes it once it is a length',
    async (id) => {
      const editor = await monthEditor();
      editor.addEventListener('config-changed', (event) =>
        editor.setConfig((event as CustomEvent<{ config: unknown }>).detail.config),
      );
      const key = id.slice('layout:month.'.length);
      for (const text of ['5', '50', '50r', '50re', '50rem']) {
        await changeField(editor, id, text);
        expect(valueOf(editor, id), text).toBe(text);
      }
      expect(stored(editor).month).toEqual({ [key]: '50rem' });
      // Nothing the card cannot use was written on the way: `50r` and `50re` were held.
      expect(
        reportsOf(editor).map((config) => (config.month as Record<string, unknown>)[key]),
      ).toEqual(['5px', '50px', '50rem']);
      editor.remove();
    },
  );

  it('keeps a height the YAML holds, and the card’s Height out of Month', async () => {
    const editor = await monthEditor({
      ...CARD,
      height: '300px',
      month: { card_height: '50rem', compact_card_max_height: '40rem' },
    });
    await changeField(editor, 'layout:month.cell_time_font_size', '11px');
    expect(stored(editor).month).toEqual({
      card_height: '50rem',
      compact_card_max_height: '40rem',
      cell_time_font_size: '11px',
    });
    expect(stored(editor).height).toBe('300px');
    editor.remove();
  });
});

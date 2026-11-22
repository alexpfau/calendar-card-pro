/**
 * Month's own settings in the visual editor: its narrow form's two heights, its two shadings and the
 * font sizes of its days, and the card's Card Height as Month's page writes it. Each is drawn on its
 * topic's page under Month, and writes into `month:`, never the top level.
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
  [
    'layout:month.narrow_card_height',
    'size_spacing',
    'heading_narrow_month',
    'Narrow Month Height',
    '30rem',
  ],
  [
    'layout:month.narrow_card_max_height',
    'size_spacing',
    'heading_narrow_month',
    'Narrow Month Maximum Height',
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
    'Event Font Size in Wide Month',
    '15px',
  ],
  ['layout:month.cell_time_font_size', 'events', 'time', 'Time Font Size in Wide Month', '11px'],
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
      expect(config).not.toHaveProperty('card_height');
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
    expect(helpers['layout:month.narrow_card_height']).toMatch(/632px, or 760px with the toolbar/);
    expect(helpers['layout:month.narrow_card_max_height']).toMatch(/grows/);
    expect(helpers['layout:month.today_background_color']).toMatch(/replaces/);
    expect(helpers['layout:month.cell_event_font_size']).toMatch(/Event Font Size/);
    expect(helpers['layout:month.cell_time_font_size']).toMatch(/Time Font Size/);
    editor.remove();
  });

  it.each(['layout:month.narrow_card_height'] as const)(
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
      month: { card_height: '50rem', narrow_card_max_height: '40rem' },
    });
    await changeField(editor, 'layout:month.cell_time_font_size', '11px');
    expect(stored(editor).month).toEqual({
      card_height: '50rem',
      narrow_card_max_height: '40rem',
      cell_time_font_size: '11px',
    });
    expect(stored(editor).height).toBe('300px');
    editor.remove();
  });
});

describe('Card Height on Month’s page', () => {
  it('names its first choice Month’s default height, and writes the whole card’s into month:', async () => {
    const editor = await monthEditor({ ...CARD, card_height: '30rem' });
    editor.addEventListener('config-changed', (event) =>
      editor.setConfig((event as CustomEvent<{ config: unknown }>).detail.config),
    );
    await openPageOf(editor, 'layout:height_mode');
    const form = formOf(editor, 'layout:height_mode') as unknown as {
      schema: Array<{ selector: { select: { options: Array<{ label: string }> } } }>;
    };
    expect(form.schema[0].selector.select.options.map((option) => option.label)).toEqual([
      'Default height',
      'Fixed height',
      'Maximum height',
    ]);
    // The card's own height reaches Month too, so the page reads it as Month's.
    expect(valueOf(editor, 'layout:height_mode')).toBe('fixed');

    for (const text of ['5', '50', '50r', '50re', '50rem']) {
      await changeField(editor, 'layout:fixed_height', text);
      expect(valueOf(editor, 'layout:fixed_height'), text).toBe(text);
    }
    const config = stored(editor);
    expect(config.month).toEqual({ card_height: '50rem' });
    // The top level, which every other layout reads, keeps its own.
    expect(config.card_height).toBe('30rem');
    editor.remove();
  });

  it('clears a cap stored beside a fixed height once the height is changed', async () => {
    // The cap is not drawn while the height is fixed, and the card still applies it.
    const editor = await mountEditor({
      ...CARD,
      list: { card_height: '400px', card_max_height: '200px' },
    });
    await editLayout(editor, 'list');
    await openPageOf(editor, 'layout:height_mode');
    expect(valueOf(editor, 'layout:height_mode')).toBe('fixed');
    await changeField(editor, 'layout:fixed_height', '500px');
    // In a layout's block, no cap is written as none, which a cap at the top level cannot reach.
    expect(lastConfig(editor)!.list).toEqual({ card_height: '500px', card_max_height: 'none' });
    editor.remove();
  });

  it('says a size in a unit the card cannot use is not saved, and what stays', async () => {
    const editor = await mountEditor({ ...CARD, list: { card_height: '300px' } });
    await editLayout(editor, 'list');
    await openPageOf(editor, 'layout:height_mode');
    await changeField(editor, 'layout:fixed_height', '50%');
    expect(valueOf(editor, 'layout:fixed_height')).toBe('50%');
    expect(reportsOf(editor)).toEqual([]);
    const error = () =>
      (formOf(editor, 'layout:fixed_height') as unknown as { error?: Record<string, string> })
        .error;
    expect(error()).toEqual({ fixed_height: 'Not a size the card can use, so it stays 300px.' });
    await changeField(editor, 'layout:fixed_height', '50px');
    expect(error()).toBeUndefined();
    editor.remove();
  });

  it('describes Maximum Height and all-day times as Month draws them', async () => {
    const card = { ...CARD, card_max_height: '500px' };
    const editor = await mountEditor(card);
    await openPageOf(editor, 'layout:maximum_height');
    expect(helperOf(editor, 'layout:maximum_height')).toMatch(
      /^The Wide Month fits its weeks within this height/,
    );
    await openPageOf(editor, 'events:show_single_allday_time');
    expect(helperOf(editor, 'events:show_single_allday_time')).toMatch(/^Month splits/);
    editor.remove();
    // List keeps its own: it grows to the cap, and has the multi-day setting below.
    const list = await mountEditor({ ...card, view: 'list' });
    await openPageOf(list, 'layout:maximum_height');
    expect(helperOf(list, 'layout:maximum_height')).toMatch(/^Grows with its content/);
    await openPageOf(list, 'events:show_single_allday_time');
    expect(helperOf(list, 'events:show_single_allday_time')).toMatch(/their own setting below/);
    list.remove();
  });

  it('leaves the events area’s own height at the top level, which Month never reads', async () => {
    const editor = await monthEditor({ ...CARD, height: '300px', max_height: '500px' });
    await openPageOf(editor, 'layout:height_mode');
    await changeField(editor, 'layout:height_mode', 'fixed');
    const config = stored(editor);
    expect(config.month).toEqual({ card_height: '300px' });
    expect(config.height).toBe('300px');
    expect(config.max_height).toBe('500px');
    editor.remove();
  });
});

describe('At Common Card Widths', () => {
  it('scrolls inside a named region the keyboard reaches, so four layouts fit a narrow pane', async () => {
    const editor = await mountEditor({
      ...CARD,
      view: 'grid',
      toolbar: { show: true, view_switcher_layouts: ['list', 'column', 'grid', 'month'] },
    });
    await editLayout(editor, 'grid');
    await openPageOf(editor, 'layout:height_mode');
    const region = editor.shadowRoot!.querySelector<HTMLElement>(
      '.fit-summary .width-table-scroll',
    );
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.getAttribute('aria-label')).toBe('At Common Card Widths');
    expect(region?.querySelector('table th[scope="col"]')).not.toBeNull();
    editor.remove();
  });
});

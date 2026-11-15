/**
 * Essentials Only (backlog item 188): the editor cut down to the settings most cards need, plus
 * every setting the card sets (backlog item 315).
 *
 * Four things are pinned here. The two field sets, by value, so a field that drops out of
 * either fails rather than quietly leaving the switch shorter. The sets against the schemas the
 * editor builds, so a field renamed or moved off its surface fails even while an option of the
 * same name lives on elsewhere (`accent_color`, `entity` and `tap_action` each exist on more than
 * one surface). The behavior on the mounted editor, across search, Customized Only, the
 * per-calendar forms and the toolbar's own buttons: in particular that an empty query lets no
 * whole panel through, which is the shortcut that would have shown every field. And that what the
 * card sets always stays: a line held at the root, one at its default, one a layout holds, a
 * calendar's filter and a button's own fields, each of which an earlier version hid.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CARD,
  button,
  changeFields,
  entry,
  formOf,
  formsOf,
  mountEditor,
  openPageOf,
  openPanels,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import * as Types from '../src/config/types';
import type { CalendarCardProEditor } from '../src/rendering/editor/element';
import {
  ESSENTIALS_STORAGE_KEY,
  ESSENTIAL_CALENDAR_FIELDS,
  ESSENTIAL_CARD_FIELDS,
} from '../src/rendering/editor/essentials';
import * as Filter from '../src/rendering/editor/filter';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { PANELS, type SchemaCtx } from '../src/rendering/editor/panels';
import { workspaceFields } from '../src/rendering/editor/routing';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';
import { type EditorWorkspace, WORKSPACES } from '../src/rendering/editor/workspace';

function ids(schema: ReadonlyArray<HaFormSchema>): string[] {
  return [...workspaceFields(schema)].map(({ node, path }) => [...path, node.name].join('.'));
}

describe('the essential fields', () => {
  it('are pinned by value', () => {
    expect([...ESSENTIAL_CARD_FIELDS]).toEqual([
      'calendars',
      'time_grid.start_time',
      'time_grid.end_time',
      'days_to_show',
      'start_date_mode',
      'start_date_fixed',
      'start_date_offset',
      'show_past_events',
      'show_empty_days',
      'title',
      'toolbar.show',
      'toolbar.legend',
      'show_time',
      'show_end_time',
      'show_location',
      'show_description',
      'show_countdown',
      'weather.entity',
      'weather.position',
      'tap_action',
      'day_tap_action_mode',
      'event_tap_action',
    ]);
    expect([...ESSENTIAL_CALENDAR_FIELDS]).toEqual([
      'name',
      'label_type',
      'label',
      'label_icon_source',
      'label_image_source',
      'accent_color_mode',
      'accent_color',
    ]);
  });

  it('each name a field the card’s own panels build, at that data path', () => {
    // Every gate open: a weather entity for Position, the toolbar for its fields, and each
    // start-date mode for the field it reveals.
    const variants: Record<string, unknown>[] = [
      { start_date: '2026-01-05' },
      { start_date: 'today+1' },
    ].map((extra) => ({
      ...Config.DEFAULT_CONFIG,
      entities: ['calendar.anna'],
      weather: { entity: 'weather.home' },
      toolbar: { show: true },
      show_time: true,
      ...extra,
    }));

    const built = new Set<string>();
    for (const workspace of ['shared', 'list', 'column', 'grid'] as EditorWorkspace[]) {
      for (const config of variants) {
        const ctx = {
          view: workspace === 'shared' ? 'list' : workspace,
          workspace,
          config,
          rawConfig: config,
          language: 'en',
        } as unknown as SchemaCtx;
        for (const panel of PANELS) for (const id of ids(panel.build(ctx))) built.add(id);
      }
    }

    expect([...ESSENTIAL_CARD_FIELDS].filter((id) => !built.has(id))).toEqual([]);
  });

  it('each name a field of one calendar’s form', () => {
    const ctx = { view: 'list', config: Config.DEFAULT_CONFIG, language: 'en' } as SchemaCtx;
    const fields = new Set(ids(buildEntitySchema(ctx)));

    expect([...ESSENTIAL_CALENDAR_FIELDS].filter((name) => !fields.has(name))).toEqual([]);
  });
});

async function mount(config: Record<string, unknown> = {}) {
  return mountEditor({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    weather: { entity: 'weather.home' },
    toolbar: { show: true, buttons: [{ icon: 'mdi:home', name: 'Home' }] },
    ...config,
  });
}

function root(editor: CalendarCardProEditor): ShadowRoot {
  return editor.shadowRoot!;
}

function panelFields(editor: CalendarCardProEditor): string[] {
  return formsOf(editor, CARD).flatMap((form) => ids(form.schema));
}

function calendarFields(editor: CalendarCardProEditor): string[] {
  return formsOf(editor, entry()).flatMap((form) => ids(form.schema));
}

function calendarFieldCount(editor: CalendarCardProEditor): number {
  return calendarFields(editor).length;
}

function buttonFields(editor: CalendarCardProEditor): string[] {
  return formsOf(editor, button()).flatMap((form) => ids(form.schema));
}

const LIST_ESSENTIALS = [
  'calendars',
  'days_to_show',
  'start_date_mode',
  'show_past_events',
  'show_empty_days',
  'title',
  'toolbar.show',
  'toolbar.legend',
  'show_time',
  'show_location',
  'show_description',
  'show_countdown',
  'show_end_time',
  'weather.entity',
  'weather.position',
  'tap_action',
  'day_tap_action_mode',
  'event_tap_action',
];

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('Essentials Only on the editor', () => {
  it('is off until switched on, and the editor shows everything', async () => {
    const editor = await mount();
    // A closed panel mounts no form: open every panel to read what the editor shows.
    await openPanels(editor);

    expect(panelFields(editor).length).toBeGreaterThan(LIST_ESSENTIALS.length * 3);
    expect(localStorage.getItem(ESSENTIALS_STORAGE_KEY)).toBeNull();
  });

  it('cuts the panels to the essential fields, with no panel let through whole', async () => {
    const editor = await mount();
    await changeFields(editor, { 'filter:essentials_only': true });

    // Panels with no essential field go; the rest stay closed, as they do without it.
    const panels = [
      ...root(editor).querySelectorAll<HTMLElement & { expanded: boolean }>(
        'ha-expansion-panel:not(.entity-panel):not(.button-panel)',
      ),
    ];
    expect(panels).toHaveLength(6);
    expect(panels.every((panel) => !panel.expanded)).toBe(true);
    // Read once they are seen closed: a closed panel mounts no form, so each is opened to read.
    await openPanels(editor);
    expect(panelFields(editor)).toEqual(LIST_ESSENTIALS);
  });

  it('adds the hours of the grid in the Grid workspace', async () => {
    const editor = await mount({ view: 'grid' });
    await changeFields(editor, { 'filter:essentials_only': true });
    await openPanels(editor);

    expect(panelFields(editor).slice(0, 3)).toEqual([
      'calendars',
      'time_grid.start_time',
      'time_grid.end_time',
    ]);
  });

  it('cuts each calendar’s form to its essentials and keeps what each toolbar button sets', async () => {
    const editor = await mount({
      entities: [{ entity: 'calendar.anna', name: 'Anna', label: '🎂', accent_color: '#ff6c92' }],
    });
    expect(root(editor).querySelectorAll('.button-panel')).toHaveLength(1);
    expect(root(editor).querySelector('.add-button')).not.toBeNull();

    await changeFields(editor, { 'filter:essentials_only': true });
    await openPanels(editor);

    const fields = calendarFields(editor);
    expect(fields).toContain('name');
    expect(fields).toContain('accent_color');
    expect(fields.filter((name) => !ESSENTIAL_CALENDAR_FIELDS.has(name))).toEqual([]);
    // A button the card has is part of what the card does: its own fields stay, the rest go.
    expect(root(editor).querySelectorAll('.button-panel')).toHaveLength(1);
    expect(buttonFields(editor).sort()).toEqual(['icon', 'name']);
    expect(root(editor).querySelector('.add-button')).toBeNull();
  });

  it('keeps every setting the card’s YAML holds, on the card and in each calendar', async () => {
    const editor = await mount({
      // Held at the root, which the List workspace inherits rather than owns.
      event_font_size: '30px',
      // Held at the value the card would use anyway, so only the YAML says it is set.
      refresh_interval: 30,
      entities: [{ entity: 'calendar.anna', blocklist: 'Birthday' }],
    });
    await changeFields(editor, { 'filter:essentials_only': true });
    await openPanels(editor);

    expect(panelFields(editor)).toEqual(
      expect.arrayContaining(['event_font_size', 'refresh_interval']),
    );
    expect(panelFields(editor)).not.toContain('time_font_size');
    expect(calendarFields(editor)).toContain('blocklist');
    expect(calendarFields(editor)).not.toContain('allowlist');
  });

  it('keeps a value the selected layout’s block holds, even at its default', async () => {
    // Written unitless, so each normalizes to the layout's default and Customized Only does not
    // count it; only the YAML says it is set.
    for (const { config, field } of [
      { config: { view: 'column', column: { event_font_size: 14 } }, field: 'event_font_size' },
      { config: { view: 'grid', time_grid: { time_font_size: 12 } }, field: 'time_font_size' },
      {
        config: { view: 'grid', time_grid: { event_font_size: '12px' } },
        field: 'event_font_size',
      },
    ]) {
      document.body.replaceChildren();
      const editor = await mount(config);
      await changeFields(editor, { 'filter:essentials_only': true });
      await openPanels(editor);

      expect(panelFields(editor), JSON.stringify(config)).toContain(field);
    }
  });

  it('opens nothing it keeps, as it opens no panel', async () => {
    const editor = await mount({ time_color: '#ff0000' });
    await changeFields(editor, { 'filter:essentials_only': true });
    // The Events panel, opened as a user would: its group must still be closed inside it.
    await openPageOf(editor, 'events:time_color');

    const form = formOf(editor, 'events:time_color')!;
    const group = form.schema.find(
      (node) => 'schema' in node && ids(node.schema).includes('time_color'),
    ) as { expanded?: boolean };
    expect(group.expanded).not.toBe(true);
  });

  it('steps aside for a search, which reaches every setting', async () => {
    const editor = await mount();
    await changeFields(editor, { 'filter:essentials_only': true, 'filter:search': 'separator' });

    expect(panelFields(editor)).toContain('day_separator_width');
  });

  it('beside Customized Only, shows what Customized Only shows', async () => {
    const editor = await mount({ title: 'Family', refresh_interval: 60 });
    await changeFields(editor, { 'filter:customized_only': true });
    const customized = panelFields(editor);
    expect(customized).toEqual(expect.arrayContaining(['title', 'refresh_interval']));
    expect(customized).not.toContain('days_to_show');

    await changeFields(editor, { 'filter:essentials_only': true, 'filter:customized_only': true });

    expect(panelFields(editor)).toEqual(customized);
    // What is missing is no longer what Essentials hides, so no count.
    expect(root(editor).querySelector('[data-essentials-note]')).toBeNull();
  });

  it('says how many settings it hides, counting every form it shortens', async () => {
    const editor = await mount();
    // Every panel open, so every form it shortens is there to be counted.
    await openPanels(editor);
    const everything =
      panelFields(editor).length + calendarFieldCount(editor) + buttonFields(editor).length;
    expect(root(editor).querySelector('[data-essentials-note]')).toBeNull();

    await changeFields(editor, { 'filter:essentials_only': true });
    // A panel that now lands in another's place comes with closed panels of its own.
    await openPanels(editor);

    const kept =
      panelFields(editor).length + calendarFieldCount(editor) + buttonFields(editor).length;
    expect(root(editor).querySelector('[data-essentials-note]')!.textContent!.trim()).toBe(
      `Other settings hidden: ${everything - kept}.`,
    );
  });

  it('says nothing is customized when, beside Customized Only, nothing is', async () => {
    const editor = await mount({ entities: [], weather: undefined, toolbar: undefined });
    await changeFields(editor, { 'filter:essentials_only': true, 'filter:customized_only': true });

    expect(root(editor).querySelector('.filter-empty')!.textContent!.trim()).toBe(
      'Nothing is customized — every setting is at the card default.',
    );
  });

  it('is remembered in this browser, and forgotten when switched off', async () => {
    const first = await mount();
    await changeFields(first, { 'filter:essentials_only': true });
    expect(localStorage.getItem(ESSENTIALS_STORAGE_KEY)).toBe('on');

    document.body.replaceChildren();
    const second = await mount();
    await openPanels(second);
    expect(panelFields(second)).toEqual(LIST_ESSENTIALS);

    await changeFields(second, { 'filter:essentials_only': false });
    expect(localStorage.getItem(ESSENTIALS_STORAGE_KEY)).toBeNull();
  });
});

describe('Essentials Only in Columns', () => {
  afterEach(() => document.body.replaceChildren());

  it('leaves out the width table, which explains a layout rather than setting it', async () => {
    const editor = await mount({ view: 'column' });
    expect(root(editor).querySelector('.width-table')).not.toBeNull();

    await changeFields(editor, { 'filter:essentials_only': true });

    expect(root(editor).querySelector('.width-table')).toBeNull();
  });
});

describe('Essentials Only beside Customized Only, on every workspace', () => {
  /** Cards that set something at the root, in a layout's block, in a nested block, or nowhere. */
  const CARDS: ReadonlyArray<Record<string, unknown>> = [
    {},
    { title: 'Family', event_font_size: '30px', refresh_interval: 30 },
    { list: { event_font_size: '20px' }, day_separator_width: '2px' },
    { view: 'grid', time_grid: { start_time: '07:00', event_font_size: '12px' } },
    { column: { day_separator_width: '3px' }, show_past_events: true },
    { view: 'column', column: { event_font_size: 14 } },
    { weather: { entity: 'weather.home', position: 'event' }, time_24h: false },
    { start_date: 'today+1', time_color: '#ff0000' },
  ];

  function shown(
    raw: Record<string, unknown>,
    workspace: EditorWorkspace,
    criteria: Partial<Filter.FilterCriteria>,
    withStored = true,
  ): string[] {
    const config = {
      ...Config.DEFAULT_CONFIG,
      entities: ['calendar.anna'],
      ...raw,
    } as unknown as Types.Config;
    const ctx: Filter.FilterCtx = {
      view: workspace === 'shared' ? 'list' : workspace,
      workspace,
      config,
      rawConfig: config,
      language: 'en',
      stored: withStored ? { entities: ['calendar.anna'], ...raw } : undefined,
      criteria: { ...Filter.NO_FILTER, ...criteria },
    };
    return PANELS.flatMap((panel) =>
      ids(Filter.filterSchema(Filter.withholdInertFields(panel.build(ctx), workspace), ctx)),
    );
  }

  // Without the stored YAML, as outside the mounted editor, only the comparison with the defaults
  // can tell what the card sets, and the two switches must still agree.
  it.each(WORKSPACES.flatMap((workspace) => [true, false].map((stored) => [workspace, stored])))(
    'shows exactly what Customized Only shows in %s (stored YAML: %s)',
    (workspace, withStored) => {
      let customizedSomewhere = 0;
      for (const raw of CARDS) {
        const customized = shown(
          raw,
          workspace as EditorWorkspace,
          { customizedOnly: true },
          withStored as boolean,
        );
        customizedSomewhere += customized.length;
        expect(
          shown(
            raw,
            workspace as EditorWorkspace,
            { customizedOnly: true, essentialsOnly: true },
            withStored as boolean,
          ),
        ).toEqual(customized);
      }
      // The denominator: the cards do customize something here, so the equality can fail.
      expect(customizedSomewhere).toBeGreaterThan(0);
    },
  );
});

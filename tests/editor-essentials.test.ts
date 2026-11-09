/**
 * Essentials Only (backlog item 188): the editor cut down to the settings most cards need.
 *
 * Three things are pinned here. The two field sets, by value, so a field that drops out of
 * either fails rather than quietly leaving the switch shorter. The sets against the schemas the
 * editor builds, so a field renamed or moved off its surface fails even while an option of the
 * same name lives on elsewhere (`accent_color`, `entity` and `tap_action` each exist on more than
 * one surface). And the behavior on the mounted editor, across search, Customized Only, the
 * per-calendar forms and the toolbar's own buttons: in particular that an empty query lets no
 * whole panel through, which is the shortcut that would have shown every field.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as Config from '../src/config/config';
import * as Types from '../src/config/types';
import { CalendarCardProEditor } from '../src/rendering/editor/element';
import {
  ESSENTIALS_STORAGE_KEY,
  ESSENTIAL_CALENDAR_FIELDS,
  ESSENTIAL_CARD_FIELDS,
} from '../src/rendering/editor/essentials';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { PANELS, type SchemaCtx } from '../src/rendering/editor/panels';
import { workspaceFields } from '../src/rendering/editor/routing';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';
import type { EditorWorkspace } from '../src/rendering/editor/workspace';

customElements.define('editor-essentials-test', CalendarCardProEditor);

interface Form extends HTMLElement {
  schema: ReadonlyArray<HaFormSchema>;
  data: Record<string, unknown>;
}

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
  const editor = document.createElement('editor-essentials-test') as CalendarCardProEditor;
  editor.hass = { states: {}, locale: { language: 'en' } } as unknown as Types.Hass;
  editor.setConfig({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    weather: { entity: 'weather.home' },
    toolbar: { show: true, buttons: [{ icon: 'mdi:home', name: 'Home' }] },
    ...config,
  } as unknown as Types.Config);
  document.body.appendChild(editor);
  await editor.updateComplete;
  return editor;
}

function root(editor: CalendarCardProEditor): ShadowRoot {
  return editor.shadowRoot!;
}

async function filter(
  editor: CalendarCardProEditor,
  values: { search?: string; customized_only?: boolean; essentials_only?: boolean },
): Promise<void> {
  const form = root(editor).querySelector<Form>('.filter-form')!;
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, ...values } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

function panelFields(editor: CalendarCardProEditor): string[] {
  return [...root(editor).querySelectorAll<Form>('ha-form.panel-form')].flatMap((form) =>
    ids(form.schema),
  );
}

function calendarFields(editor: CalendarCardProEditor): string[] {
  return [...root(editor).querySelectorAll<Form>('ha-form.entity-form')].flatMap((form) =>
    ids(form.schema),
  );
}

function calendarFieldCount(editor: CalendarCardProEditor): number {
  return calendarFields(editor).length;
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

    expect(panelFields(editor).length).toBeGreaterThan(LIST_ESSENTIALS.length * 3);
    expect(localStorage.getItem(ESSENTIALS_STORAGE_KEY)).toBeNull();
  });

  it('cuts the panels to the essential fields, with no panel let through whole', async () => {
    const editor = await mount();
    await filter(editor, { essentials_only: true });

    expect(panelFields(editor)).toEqual(LIST_ESSENTIALS);
    // Panels with no essential field go; the rest stay closed, as they do without it.
    const panels = [
      ...root(editor).querySelectorAll<HTMLElement & { expanded: boolean }>(
        'ha-expansion-panel:not(.entity-panel):not(.button-panel)',
      ),
    ];
    expect(panels).toHaveLength(6);
    expect(panels.every((panel) => !panel.expanded)).toBe(true);
  });

  it('adds the hours of the grid in the Grid workspace', async () => {
    const editor = await mount({ view: 'grid' });
    await filter(editor, { essentials_only: true });

    expect(panelFields(editor).slice(0, 3)).toEqual([
      'calendars',
      'time_grid.start_time',
      'time_grid.end_time',
    ]);
  });

  it('cuts each calendar’s form to its essentials and hides the toolbar’s own buttons', async () => {
    const editor = await mount({
      entities: [{ entity: 'calendar.anna', name: 'Anna', label: '🎂', accent_color: '#ff6c92' }],
    });
    expect(root(editor).querySelectorAll('.button-panel')).toHaveLength(1);
    expect(root(editor).querySelector('.add-button')).not.toBeNull();

    await filter(editor, { essentials_only: true });

    const fields = calendarFields(editor);
    expect(fields).toContain('name');
    expect(fields).toContain('accent_color');
    expect(fields.filter((name) => !ESSENTIAL_CALENDAR_FIELDS.has(name))).toEqual([]);
    expect(root(editor).querySelectorAll('.button-panel')).toHaveLength(0);
    expect(root(editor).querySelector('.add-button')).toBeNull();
  });

  it('steps aside for a search, which reaches every setting', async () => {
    const editor = await mount();
    await filter(editor, { essentials_only: true, search: 'separator' });

    expect(panelFields(editor)).toContain('day_separator_width');
  });

  it('combines with Customized Only', async () => {
    const editor = await mount({ title: 'Family', day_separator_width: '2px' });
    await filter(editor, { essentials_only: true, customized_only: true });

    const fields = panelFields(editor);
    expect(fields).toContain('title');
    expect(fields).not.toContain('day_separator_width');
    expect(fields).not.toContain('days_to_show');
    // What is missing is no longer what Essentials hides, so no count.
    expect(root(editor).querySelector('[data-essentials-note]')).toBeNull();
  });

  it('says how many settings it hides, counting every form it shortens', async () => {
    const editor = await mount();
    const everything = panelFields(editor).length + calendarFieldCount(editor) + 4;
    expect(root(editor).querySelector('[data-essentials-note]')).toBeNull();

    await filter(editor, { essentials_only: true });

    const kept = panelFields(editor).length + calendarFieldCount(editor);
    expect(root(editor).querySelector('[data-essentials-note]')!.textContent!.trim()).toBe(
      `Other settings hidden: ${everything - kept}.`,
    );
  });

  it('says what is true when none of the essentials is customized', async () => {
    const editor = await mount({
      entities: [],
      weather: undefined,
      toolbar: undefined,
      day_separator_width: '2px',
    });
    await filter(editor, { essentials_only: true, customized_only: true });

    expect(root(editor).querySelector('.filter-empty')!.textContent!.trim()).toBe(
      'None of the essential settings is customized. Switch off Essentials Only to see the rest.',
    );
  });

  it('is remembered in this browser, and forgotten when switched off', async () => {
    const first = await mount();
    await filter(first, { essentials_only: true });
    expect(localStorage.getItem(ESSENTIALS_STORAGE_KEY)).toBe('on');

    document.body.replaceChildren();
    const second = await mount();
    expect(panelFields(second)).toEqual(LIST_ESSENTIALS);

    await filter(second, { essentials_only: false });
    expect(localStorage.getItem(ESSENTIALS_STORAGE_KEY)).toBeNull();
  });
});

describe('Essentials Only in Columns', () => {
  afterEach(() => document.body.replaceChildren());

  it('leaves out the width table, which explains a layout rather than setting it', async () => {
    const editor = await mount({ view: 'column' });
    expect(root(editor).querySelector('.width-table')).not.toBeNull();

    await filter(editor, { essentials_only: true });

    expect(root(editor).querySelector('.width-table')).toBeNull();
  });
});

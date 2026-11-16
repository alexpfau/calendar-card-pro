/**
 * What This Card Changes (backlog item 307, the editor redesign's PR 16): every line the YAML
 * stores, grouped by where it lives, each with its YAML path and state words; Edit mounts the
 * line's own control and writes where the line lives, whatever the scope; Reset All in a layout
 * is one undo step; lines the editor does not own are read-only. And values from YAML: a
 * dropdown holding a value none of its options offers shows it, "(From YAML)", and keeps it.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  formOf,
  goOverview,
  goPage,
  lastConfig,
  mountEditor,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as Audit from '../src/rendering/editor/audit';
import { corpus } from '../src/rendering/editor/gates';
import { isConfigBlock } from '../src/utils/helpers';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const VERSION = Config.CURRENT_CONFIG_VERSION;

/** A wall card after some use: lines at the top level, in List and Grid, on calendars, and Home Assistant's and card-mod's own. */
const WALL = {
  type: 'custom:calendar-card-pro',
  config_version: VERSION,
  view: 'list',
  days_to_show: 7,
  title: 'Family',
  refresh_interval: Config.DEFAULT_CONFIG.refresh_interval,
  toolbar: { show: true, legend: 'chips' },
  list: { show_past_events: true, description_font_size: '20px' },
  time_grid: { start_time: '07:00', end_time: '21:00', show_location: true },
  grid_options: { columns: 12 },
  card_mod: { style: 'ha-card { color: red; }' },
  entities: [
    { entity: 'calendar.anna', label: '🎒', accent_color: '#F06292' },
    'calendar.ben',
    {
      entity: 'calendar.bin_day',
      event_type: 'all_day',
      allday_expires_at: '09:00',
      glitter: true,
    },
  ],
};

afterEach(() => document.body.replaceChildren());

const $ = (editor: Editor, selector: string): HTMLElement | null =>
  editor.shadowRoot!.querySelector<HTMLElement>(selector);

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function click(editor: Editor, selector: string): Promise<void> {
  const target = $(editor, selector);
  expect(target, selector).not.toBeNull();
  target!.click();
  await editor.updateComplete;
  await editor.updateComplete;
}

async function openAudit(editor: Editor): Promise<void> {
  await goOverview(editor);
  await click(editor, '[data-focus="more:audit"]');
}

/** Each row, by its YAML path: its group, its text, its meta line and its buttons' names. */
function rows(
  editor: Editor,
): Record<string, { group: string; meta: string; value: string; buttons: string[] }> {
  return Object.fromEntries(
    [...editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-audit]')].map((row) => [
      row.dataset.audit!,
      {
        group: row.closest<HTMLElement>('.audit-group')!.dataset.heading!,
        meta: text(row.querySelector('.audit-meta')),
        value: text(row.querySelector('.audit-value')),
        buttons: [...row.querySelectorAll('button')].map(
          (button) => button.getAttribute('aria-label') ?? text(button),
        ),
      },
    ]),
  );
}

/** Every leaf of a stored configuration, by path, past what the page never lists. */
function storedLeaves(raw: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (value === undefined || value === null || value === '') return;
    if (isConfigBlock(value) && Object.keys(value).length > 0) {
      for (const [key, inner] of Object.entries(value)) walk(inner, path ? `${path}.${key}` : key);
    } else {
      out.push(path);
    }
  };
  for (const [key, value] of Object.entries(raw)) {
    if (['type', 'config_version', 'entities'].includes(key)) continue;
    if (key in Config.DEPRECATED_CONFIG_MAP) continue;
    walk(value, key);
  }
  (Array.isArray(raw.entities) ? raw.entities : []).forEach((entry: unknown, at: number) => {
    if (!isConfigBlock(entry)) return;
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'entity' || key in Config.DEPRECATED_ENTITY_CONFIG_MAP) continue;
      walk(value, `entities[${at}].${key}`);
    }
  });
  return out;
}

describe('What This Card Changes, its groups', () => {
  it('groups every stored line, the calendars and the lines kept as written included', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);

    const groups: Record<string, string[]> = {};
    for (const [path, row] of Object.entries(rows(editor))) {
      (groups[row.group] ??= []).push(path);
    }
    expect(groups).toEqual({
      'audit:card': [
        'view',
        'days_to_show',
        'title',
        'refresh_interval',
        'toolbar.show',
        'toolbar.legend',
      ],
      'audit:list': ['list.show_past_events', 'list.description_font_size'],
      'audit:grid': ['time_grid.start_time', 'time_grid.end_time', 'time_grid.show_location'],
      'audit:entry:0': ['entities[0].label', 'entities[0].accent_color'],
      'audit:entry:2': [
        'entities[2].event_type',
        'entities[2].allday_expires_at',
        'entities[2].glitter',
      ],
      'audit:kept': ['grid_options', 'card_mod'],
    });
    // Calendars sit under their own heading, each titled as its row.
    const calendars = $(editor, '[data-heading="audit:calendars"]')!;
    expect(text(calendars.querySelector('h3'))).toBe('Calendars');
    expect([...calendars.querySelectorAll('h4')].map((title) => text(title))).toEqual([
      'calendar.anna',
      'calendar.bin_day',
    ]);
    expect(text($(editor, '.audit-count'))).toBe('Set: 15 · Not in Use: 1');
  });

  /**
   * Reconciled against an independent walk of each configuration of the gate corpus: every
   * stored leaf lies under exactly one listed line, and every listed line holds what the YAML
   * stores there.
   */
  it('lists every stored line once over the gate corpus', () => {
    let configs = 0;
    let leaves = 0;
    for (const state of corpus()) {
      const name = `${state.workspace} ${state.display} ${state.gate ?? 'fresh'}`;
      const raw = {
        ...(state.config as unknown as Record<string, unknown>),
        card_mod: { style: 'x' },
        entities: [
          ...((state.config.entities ?? []) as unknown[]),
          { entity: 'calendar.leo', label: '🦁', glitter: 1 },
        ],
      };
      const config = { ...Config.DEFAULT_CONFIG, ...raw } as unknown as Types.Config;
      const keys = (raw.entities as unknown[]).map((_, at) => at);
      const lines = Audit.auditGroups({ raw, config, entryKeys: keys }).flatMap(
        (group) => group.lines,
      );
      const texts = lines.map((line) => line.text);
      expect(new Set(texts).size, name).toBe(texts.length);
      for (const leaf of storedLeaves(raw)) {
        const under = texts.filter((each) => leaf === each || leaf.startsWith(`${each}.`));
        expect(under, `${name}: ${leaf}`).toHaveLength(1);
        leaves += 1;
      }
      for (const line of lines) {
        let held: unknown = raw;
        for (const key of line.path) held = (held as Record<string, unknown>)?.[key];
        expect(held, `${name}: ${line.text}`).toEqual(line.value);
      }
      configs += 1;
    }
    expect(configs).toBeGreaterThan(20);
    expect(leaves).toBeGreaterThan(configs * 3);
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);

  it('gives a line the field holding its value, not the mode choosing which', () => {
    const raw = {
      config_version: VERSION,
      entities: ['calendar.anna'],
      start_date: '2026-01-05',
      remove_location_country: true,
    };
    const config = { ...Config.DEFAULT_CONFIG, ...raw } as unknown as Types.Config;
    const [card] = Audit.auditGroups({ raw, config, entryKeys: [0] });

    expect(Object.fromEntries(card.lines.map((line) => [line.text, line.field]))).toEqual({
      start_date: 'content:start_date_fixed',
      // A mode whose value is not drawn: the mode is the line's control.
      remove_location_country: 'events:location_country_mode',
    });
  });

  it('shows every row its YAML path and its state words', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    const all = rows(editor);

    for (const [path, row] of Object.entries(all)) {
      const [code, ...words] = row.meta.split(' · ');
      expect(code, path).toBe(path);
      expect(words.join(' · '), path).not.toBe('');
    }
    expect(all.days_to_show.meta).toBe('days_to_show · Set for All Layouts');
    expect(all.refresh_interval.meta).toBe(
      'refresh_interval · Set for All Layouts Same as the Default',
    );
    expect(all['toolbar.legend'].meta).toBe('toolbar.legend · Set');
    expect(all['time_grid.end_time'].meta).toBe('time_grid.end_time · Set for Grid');
    expect(all['time_grid.start_time'].meta).toBe(
      'time_grid.start_time · Set for Grid, Same as the Default',
    );
    expect(all['list.description_font_size'].meta).toBe(
      // Show Description is the Description chip, so its clause says pressed (PR 18).
      'list.description_font_size · Set for List Not in Use until Description is pressed',
    );
    expect(all['entities[2].event_type'].meta).toBe(
      'entities[2].event_type · Set on This Calendar',
    );
    expect(all.grid_options.meta).toBe(
      'grid_options · Kept as Written Home Assistant’s own, from the Layout tab',
    );
    expect(all.grid_options.value).toBe('columns: 12');
    expect(all.view.value).toBe('List');
  });

  it('keeps lines the editor does not own read-only', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    const all = rows(editor);

    expect(all.card_mod.buttons).toEqual([]);
    expect(all.grid_options.buttons).toEqual([]);
    expect(all['entities[2].glitter'].buttons).toEqual([]);
    expect(all['entities[2].glitter'].meta).toBe('entities[2].glitter · Kept as Written');
    // An owned line has all three.
    expect(all['time_grid.end_time'].buttons).toEqual([
      'Edit Last Hour in Grid, 21:00',
      'Reset Last Hour in Grid',
      'Go to Last Hour in Grid',
    ]);
    expect(all['entities[0].label'].buttons).toEqual([
      'Edit Label on calendar.anna, 🎒',
      'Reset Label on calendar.anna',
      'Go to Label on calendar.anna',
    ]);
  });

  it('names every button on the page uniquely', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    const names = [...editor.shadowRoot!.querySelectorAll('.audit-group button')].map(
      (button) => button.getAttribute('aria-label') ?? text(button),
    );
    expect(names.length).toBeGreaterThan(40);
    expect(names.filter((name, at) => names.indexOf(name) !== at)).toEqual([]);
  });

  it('counts the lines it sets on the overview', async () => {
    const editor = await mountEditor(WALL);

    expect(text($(editor, '[data-focus="more:audit"] .nav-summary'))).toBe(
      'Set: 15 · Not in Use: 1',
    );
  });
});

describe('What This Card Changes, its actions', () => {
  it('edits a line in place and writes where it lives, whatever the scope', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await click(editor, '[data-focus="edit:time_grid.end_time"]');

    const row = $(editor, '[data-audit="time_grid.end_time"]')!;
    const form = row.querySelector<HTMLElement & { data: Record<string, unknown> }>('ha-form')!;
    expect(form, 'the control mounts in place').not.toBeNull();
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-field')).toBe(
      'layout:time_grid.end_time',
    );
    const data = form.data as { time_grid: Record<string, unknown> };
    expect(data.time_grid.end_time).toBe('21:00');
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...data, time_grid: { ...data.time_grid, end_time: '20:00' } } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;

    const stored = lastConfig(editor)!;
    expect(stored.time_grid).toEqual({
      start_time: '07:00',
      end_time: '20:00',
      show_location: true,
    });
    expect(stored).not.toHaveProperty('end_time');
    expect(stored.list).toEqual(WALL.list);
    // Still open, on the new value; Escape closes it, focus back on its Edit.
    expect(rows(editor)['time_grid.end_time'].meta).toBe('time_grid.end_time · Set for Grid');
    row
      .querySelector('ha-form')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
    await editor.updateComplete;
    await editor.updateComplete;
    expect($(editor, '[data-audit="time_grid.end_time"] ha-form')).toBeNull();
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe(
      'edit:time_grid.end_time',
    );
    expect(rows(editor)['time_grid.end_time'].value).toBe('20:00');
  });

  it('edits a chip’s line and Calendar Filter’s where they live, from another scope', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      view: 'list',
      entities: ['calendar.anna'],
      toolbar: { show: true, legend: 'chips' },
      time_grid: { show_location: false },
    });
    await openAudit(editor);
    expect(rows(editor)['time_grid.show_location'].buttons[0]).toBe(
      'Edit Show Location in Grid, Off',
    );

    // A part drawn as a chip on its page: Edit mounts its chip, pressed as the line stores it.
    await click(editor, '[data-focus="edit:time_grid.show_location"]');
    const chip = $(editor, '[data-audit="time_grid.show_location"] button.chip')!;
    expect(chip.getAttribute('data-field')).toBe('events:show_location');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(editor.shadowRoot!.activeElement).toBe(chip);
    chip.click();
    await editor.updateComplete;
    expect(lastConfig(editor)!.time_grid).toEqual({ show_location: true });
    expect(lastConfig(editor)).not.toHaveProperty('show_location');
    expect(lastConfig(editor)).not.toHaveProperty('list');

    expect(
      $(editor, '[data-audit="time_grid.show_location"] button.chip')!.getAttribute('aria-pressed'),
    ).toBe('true');

    // Calendar Filter, a radio group on its page, mounts as that group and picks in place.
    await click(editor, '[data-focus="edit:toolbar.legend"]');
    const off = $(
      editor,
      '[data-audit="toolbar.legend"] fieldset.segmented input[type="radio"][value="off"]',
    ) as HTMLInputElement;
    expect(off.checked).toBe(false);
    off.checked = true;
    off.dispatchEvent(new Event('change', { bubbles: true }));
    await editor.updateComplete;
    expect(lastConfig(editor)!.toolbar).toEqual({ show: true, legend: false });
  });

  it('goes from a chip’s line to its chip, in the line’s scope', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      view: 'list',
      entities: ['calendar.anna'],
      time_grid: { show_location: false },
    });
    await openAudit(editor);
    await click(editor, '[data-focus="audit-go:time_grid.show_location"]');
    await editor.updateComplete;
    expect(
      editor.shadowRoot!.activeElement?.closest('[data-field]')?.getAttribute('data-field'),
    ).toBe('events:show_location');
    expect(
      editor
        .shadowRoot!.querySelector('[data-field="events:show_location"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('edits a top-level line at the top level from Grid', async () => {
    const editor = await mountEditor({ ...WALL, view: 'grid' });
    await openAudit(editor);
    await click(editor, '[data-focus="edit:days_to_show"]');

    const form = $(editor, '[data-audit="days_to_show"] ha-form') as HTMLElement & {
      data: Record<string, unknown>;
    };
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...form.data, days_to_show: 5 } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;

    expect(lastConfig(editor)!.days_to_show).toBe(5);
    expect(lastConfig(editor)!.time_grid).toEqual(WALL.time_grid);
  });

  it('edits a calendar line on its own entry', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await click(editor, '[data-focus="edit:entities[2].allday_expires_at"]');

    const form = $(
      editor,
      '[data-audit="entities[2].allday_expires_at"] ha-form',
    ) as HTMLElement & {
      data: Record<string, unknown>;
    };
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...form.data, allday_expires_at: '10:00' } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;

    const entities = lastConfig(editor)!.entities as Array<Record<string, unknown>>;
    expect(entities[2].allday_expires_at).toBe('10:00');
    expect(entities[0]).toEqual(WALL.entities[0]);
  });

  it('resets all of Grid in one undo step, and says so', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    const button = $(editor, '[data-focus="reset-all:grid"]')!;
    expect(text(button)).toBe('Reset All in Grid');
    await click(editor, '[data-focus="reset-all:grid"]');

    expect(lastConfig(editor)).not.toHaveProperty('time_grid');
    expect(lastConfig(editor)!.list).toEqual(WALL.list);
    expect(text($(editor, '.live-region'))).toBe('Reset every value stored for Grid.');
    expect($(editor, '[data-heading="audit:grid"]')).toBeNull();
    await click(editor, '[data-focus="undo"]');
    expect(lastConfig(editor)!.time_grid).toEqual(WALL.time_grid);
  });

  it('resets one line where it lives, and a calendar line on its entry', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await click(editor, '[data-focus="audit-reset:time_grid.show_location"]');
    await click(editor, '[data-focus="audit-reset:entities[0].accent_color"]');

    const stored = lastConfig(editor)!;
    expect(stored.time_grid).toEqual({ start_time: '07:00', end_time: '21:00' });
    expect((stored.entities as unknown[])[0]).toEqual({ entity: 'calendar.anna', label: '🎒' });
  });

  it('goes to a setting on its page, in its group’s scope', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await click(editor, '[data-focus="audit-go:time_grid.end_time"]');

    expect($(editor, '.page')!.dataset.page).toBe('grid');
    expect($(editor, '[data-field="layout:time_grid.end_time"]')).not.toBeNull();
    // Back returns to the line it left.
    await click(editor, '[data-focus="back-top"]');
    expect($(editor, '.page')!.dataset.page).toBe('audit');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe(
      'audit-go:time_grid.end_time',
    );
  });

  it('opens at Grid from the notice under Card Displays', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      show_location: true,
    });
    await changeField(editor, 'display:view', 'grid');
    await goOverview(editor);
    await click(editor, '[data-focus="grid-keeps"]');

    expect($(editor, '.page')!.dataset.page).toBe('audit');
    expect(rows(editor)['time_grid.show_location']?.group).toBe('audit:grid');
  });
});

describe('values from YAML', () => {
  it('shows a dropdown value none of its options offers, and keeps it through an unrelated edit', async () => {
    const editor = await mountEditor(
      { config_version: VERSION, entities: ['calendar.anna'], time_position: 'sideways' },
      { every: true },
    );
    await goPage(editor, 'events');
    const form = formOf(editor, 'events:time_position')!;
    const options = (
      form.schema as unknown as Array<{ selector: { select: { options: unknown[] } } }>
    )[0].selector.select.options;
    expect(options).toContainEqual({ value: 'sideways', label: 'sideways (From YAML)' });

    await changeField(editor, 'card:title', 'Family');

    expect(lastConfig(editor)).toMatchObject({ title: 'Family', time_position: 'sideways' });
    await openAudit(editor);
    expect(rows(editor).time_position.value).toBe('sideways (From YAML)');
  });

  it('leaves a dropdown holding one of its options as it was', () => {
    const node = {
      name: 'time_position',
      selector: { select: { options: [{ value: 'inline', label: 'Inline' }] } },
    };
    expect(Audit.withYamlOption(node, 'inline', 'x')).toBe(node);
    expect(Audit.outsideOptions(node, undefined)).toBe(false);
    expect(
      Audit.outsideOptions(
        { name: 'd', selector: { select: { options: ['mon'], multiple: true } } },
        ['sat'],
      ),
    ).toBe(false);
  });
});

describe('What This Card Changes, the review’s findings', () => {
  async function editLine(
    editor: Editor,
    path: string,
    change: (data: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    await click(editor, `[data-focus="edit:${path}"]`);
    const form = $(editor, `[data-audit="${path}"] ha-form`) as HTMLElement & {
      data: Record<string, unknown>;
    };
    expect(form, path).not.toBeNull();
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: change(form.data) },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    await editor.updateComplete;
  }

  it('keeps a layout’s lines kept as written through Reset All', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      time_grid: { end_time: '21:00', custom_thing: { value: 'keep' } },
    });
    await openAudit(editor);
    expect(rows(editor)['time_grid.custom_thing'].group).toBe('audit:kept');
    await click(editor, '[data-focus="reset-all:grid"]');

    expect(lastConfig(editor)!.time_grid).toEqual({ custom_thing: { value: 'keep' } });
    await click(editor, '[data-focus="undo"]');
    expect(lastConfig(editor)!.time_grid).toEqual({
      end_time: '21:00',
      custom_thing: { value: 'keep' },
    });
  });

  it('edits a calendar’s color where its mode follows Home Assistant through its color control', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: [{ entity: 'calendar.anna', accent_color: 'home-assistant' }],
    });
    await openAudit(editor);
    expect(
      $(editor, '[data-audit="entities[0].accent_color"] [data-focus^="edit:"]')!.getAttribute(
        'aria-label',
      ),
    ).toMatch(/^Edit Accent Color on /);
    await click(editor, '[data-focus="edit:entities[0].accent_color"]');
    // Edit opens the control the line's setting is drawn as, its swatches there to pick.
    const row = $(editor, '[data-audit="entities[0].accent_color"]')!;
    expect(row.querySelector('.color-toggle')?.getAttribute('aria-expanded')).toBe('true');
    const pink = row.querySelector<HTMLInputElement>('[data-swatch="pink"] input')!;
    pink.checked = true;
    pink.dispatchEvent(new Event('change', { bubbles: true }));
    await editor.updateComplete;

    expect((lastConfig(editor)!.entities as Array<Record<string, unknown>>)[0]).toEqual({
      entity: 'calendar.anna',
      accent_color: 'var(--pink-color)',
    });
  });

  it('edits the card’s Title Color through its color control', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      title: 'Family',
      title_color: '#123456',
    });
    await openAudit(editor);
    await click(editor, '[data-focus="edit:title_color"]');
    const row = $(editor, '[data-audit="title_color"]')!;
    expect(row.querySelector('.color-toggle')?.getAttribute('aria-expanded')).toBe('true');
    const amber = row.querySelector<HTMLInputElement>('[data-swatch="amber"] input')!;
    amber.checked = true;
    amber.dispatchEvent(new Event('change', { bubbles: true }));
    await editor.updateComplete;
    expect(lastConfig(editor)!.title_color).toBe('var(--amber-color)');
  });

  it('keeps the line being edited, and its control, once its value reaches the default', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      days_to_show: 7,
    });
    await openAudit(editor);
    await editLine(editor, 'days_to_show', (data) => ({
      ...data,
      days_to_show: Config.DEFAULT_CONFIG.days_to_show,
    }));

    expect(lastConfig(editor)).not.toHaveProperty('days_to_show');
    expect($(editor, '[data-audit="days_to_show"] ha-form')).not.toBeNull();
    const form = $(editor, '[data-audit="days_to_show"] ha-form')!;
    form.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await editor.updateComplete;
    await editor.updateComplete;
    expect($(editor, '[data-audit="days_to_show"]')).toBeNull();
    expect($(editor, '.page')!.dataset.page).toBe('audit');
  });

  it('goes to a calendar’s setting in a scope that offers it', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      view: 'list',
      entities: [{ entity: 'calendar.anna', multiday_banners: false }],
    });
    await openAudit(editor);
    await click(editor, '[data-focus="audit-go:entities[0].multiday_banners"]');

    expect($(editor, '.page')!.dataset.page).toBe(`entry:${0}`);
    expect($(editor, '[data-field="calendar:multiday_banners"]')).not.toBeNull();
  });

  it('words a stored action no control holds as YAML would', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      day_tap_action: { action: 'navigate', navigation_path: '/lovelace/test' },
    });
    await openAudit(editor);

    expect(rows(editor).day_tap_action.value).not.toContain('[object Object]');
  });
});

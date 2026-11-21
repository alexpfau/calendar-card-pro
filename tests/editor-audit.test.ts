/**
 * Stored Settings (backlog item 307): every line the YAML
 * stores, grouped as Whole Card, All Layouts, each layout, each calendar and the lines kept as
 * written, worded as the editor words them, with the YAML path only on request; each owned line
 * one button opening a strip, whose Change Here mounts the line's own control and writes where
 * the line lives, whatever the scope; Reset leaves a line with Undo; Reset All in a layout is one
 * undo step; lines the editor does not own are read-only. And values from YAML: a dropdown
 * holding a value none of its options offers shows it, "(From YAML)", and keeps it.
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
import { HA_CARD_KEYS } from '../src/config/constants';
import type * as Types from '../src/config/types';
import * as Audit from '../src/rendering/editor/audit';
import { corpus } from '../src/rendering/editor/gates';
import { EDITOR_STRINGS, interpolate } from '../src/rendering/editor/strings';
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

/** The `data-focus` key of a line's row, the one button it is. */
const rowKey = (path: string): string => `[data-focus="${CSS.escape(`more:audit:${path}`)}"]`;

/**
 * A line's strip, opened by pressing its row as a user does: each action's words and name.
 *
 * @param editor - Editor element, on the page
 * @param path - The line
 * @returns Its actions
 */
async function strip(
  editor: Editor,
  path: string,
): Promise<Array<{ id: string; label: string; name: string }>> {
  const row = $(editor, rowKey(path))!;
  if (row.getAttribute('aria-expanded') !== 'true') await click(editor, rowKey(path));
  return [
    ...editor.shadowRoot!.querySelectorAll<HTMLElement>(
      `[data-audit="${CSS.escape(path)}"] .strip button`,
    ),
  ].map((button) => ({
    id: button.dataset.focus!.split(':').pop()!,
    label: text(button.querySelector('.strip-label')),
    name: button.getAttribute('aria-label')!,
  }));
}

/**
 * Presses one action of a line's strip, opening it first: `change`, `open` or `reset`.
 *
 * @param editor - Editor element, on the page
 * @param path - The line
 * @param action - The action
 */
async function act(
  editor: Editor,
  path: string,
  action: 'change' | 'open' | 'reset',
): Promise<void> {
  await strip(editor, path);
  await click(editor, `[data-focus="${CSS.escape(`strip:audit:${path}:${action}`)}"]`);
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

describe('a switch whose option takes a further value', () => {
  it('reads as on, with what refines it', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      show_countdown: 'once_per_day',
    });
    await openAudit(editor);
    expect(rows(editor).show_countdown!.value).toBe('On, Leave Out Repeated Countdowns');
  });
});

describe('lines the YAML writes as null or empty', () => {
  it('lists them, and words a null action as running nothing', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      event_tap_action: null,
      remove_location_country: '',
    });
    await openAudit(editor);
    const found = rows(editor);
    expect(Object.keys(found)).toEqual(
      expect.arrayContaining(['event_tap_action', 'remove_location_country']),
    );
    expect(found.event_tap_action!.value).toBe('Nothing');
    // Its page says it is set, not that the default, which opens an event's details, applies.
    await goPage(editor, 'taps_refresh');
    expect(text($(editor, '.page'))).toContain('Event Tap Action Set Reset ');
  });
});

describe('Stored Settings, its groups', () => {
  it('groups every stored line, the calendars and the lines kept as written included', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);

    const groups: Record<string, string[]> = {};
    for (const [path, row] of Object.entries(rows(editor))) {
      (groups[row.group] ??= []).push(path);
    }
    expect(groups).toEqual({
      'audit:whole': ['view', 'title', 'refresh_interval', 'toolbar.show', 'toolbar.legend'],
      'audit:card': ['days_to_show'],
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
    // Group titles in that order, and no counts anywhere: the scope chips have none to match.
    expect(
      [...editor.shadowRoot!.querySelectorAll('.audit h3')].map((title) => text(title)),
    ).toEqual(['Whole Card', 'Layout Defaults', 'List', 'Grid', 'Calendars', 'Kept as Written']);
    expect(editor.shadowRoot!.querySelector('.audit-count')).toBeNull();
    expect(text($(editor, '.audit'))).not.toMatch(/Set: \d/);
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

  it('owns each layout’s own weather under its layout, never as kept', () => {
    const raw = {
      config_version: VERSION,
      entities: ['calendar.anna'],
      weather_entity: 'weather.home',
      list: { day_spacing: '4px', weather: { position: 'event' } },
      time_grid: { weather: { position: 'date', date: { show_low_temp: true } } },
    };
    const config = Config.mergeConfig(
      Config.DEFAULT_CONFIG as unknown as Record<string, unknown>,
      raw,
    ) as unknown as Types.Config;
    const groups = Audit.auditGroups({ raw, config, entryKeys: [0] });
    const of = (kind: string, workspace?: string) =>
      groups
        .filter((group) => group.kind === kind && (!workspace || group.workspace === workspace))
        .flatMap((group) => group.lines.map((line) => [line.text, line.field]));

    expect(of('kept')).toEqual([]);
    expect(of('layout', 'list')).toEqual([
      ['list.day_spacing', 'layout:day_spacing'],
      ['list.weather.position', 'weather:weather.position'],
    ]);
    expect(of('layout', 'grid')).toEqual([
      ['time_grid.weather.position', 'weather:weather.position'],
      ['time_grid.weather.date.show_low_temp', 'weather:weather.date.show_low_temp'],
    ]);
    expect(of('whole')).toEqual([['weather_entity', 'weather:weather_entity']]);
  });

  it('gives a line the field holding its value, not the mode choosing which', () => {
    const raw = {
      config_version: VERSION,
      entities: ['calendar.anna'],
      start_date: '2026-01-05',
      remove_location_country: true,
    };
    const config = { ...Config.DEFAULT_CONFIG, ...raw } as unknown as Types.Config;
    const top = Audit.auditGroups({ raw, config, entryKeys: [0] })
      .filter((group) => group.kind === 'whole' || group.kind === 'card')
      .flatMap((group) => group.lines);

    expect(Object.fromEntries(top.map((line) => [line.text, line.field]))).toEqual({
      start_date: 'content:start_date_fixed',
      // A mode whose value is not drawn: the mode is the line's control.
      remove_location_country: 'events:location_country_mode',
    });
  });

  it('words each row, its YAML path only with Show YAML Option Names on, and no “Set”', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    const all = rows(editor);

    // The group says where a line lives, so a row says only what is worth knowing about it.
    for (const [path, row] of Object.entries(all)) {
      expect(row.meta, path).not.toMatch(/\bSet\b/);
      expect(row.meta, path).not.toContain(path);
    }
    expect(all.days_to_show.meta).toBe('');
    expect(all.refresh_interval.meta).toBe('Same as the Default');
    expect(all['time_grid.end_time'].meta).toBe('');
    expect(all['time_grid.start_time'].meta).toBe('Same as the Default');
    expect(all['list.description_font_size'].meta).toBe(
      // Show Description is the Description chip, so its clause says pressed.
      'Not in Use until Description is pressed',
    );
    expect(all.grid_options.meta).toBe('Home Assistant’s own, from the Layout tab');
    expect(all.grid_options.value).toBe('columns: 12');
    expect(all.view.value).toBe('List');
    expect(all.days_to_show.value).toBe('7');

    const yaml = await mountEditor(WALL, { yaml: true });
    await openAudit(yaml);
    const shown = rows(yaml);
    for (const [path, row] of Object.entries(shown)) expect(row.meta, path).toMatch(/^\S+/);
    expect(shown.days_to_show.meta).toBe('days_to_show');
    expect(shown['time_grid.start_time'].meta).toBe('time_grid.start_time Same as the Default');
    expect(shown['entities[2].glitter'].meta).toBe('entities[2].glitter');
  });

  it('words a value a dropdown stands in for as that dropdown words it', async () => {
    // Each option is stored as a value its dropdown never offers: `true`, an action object.
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      filter_duplicates: true,
      remove_location_country: true,
      day_tap_action: { action: 'add-event' },
    });
    await openAudit(editor);
    const all = rows(editor);
    expect(all.filter_duplicates.value).toBe('Same title, start, end and location');
    expect(all.remove_location_country.value).toBe('Remove Well-Known Ones');
    expect(all.day_tap_action.value).toBe('Add Event');
  });

  it('words a number with its box’s unit once, whether the YAML writes the unit or not', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      refresh_interval: 15,
      column: { min_day_width: '120px' },
      time_grid: { min_day_width: 90 },
    });
    await openAudit(editor);
    const all = rows(editor);
    expect(all.refresh_interval.value).toBe('15 min');
    expect(all['column.min_day_width'].value).toBe('120px');
    expect(all['time_grid.min_day_width'].value).toBe('90px');
  });

  it('says under All Layouts which layouts have their own value, a line each', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      show_location: true,
      list: { show_location: false },
      time_grid: { show_location: false },
    });
    await openAudit(editor);
    const row = $(editor, '[data-audit="show_location"]')!;
    expect(row.closest<HTMLElement>('.audit-group')!.dataset.heading).toBe('audit:card');
    expect([...row.querySelectorAll('.audit-own')].map((line) => text(line))).toEqual([
      interpolate(EDITOR_STRINGS['state.layout_own'], { layout: 'List', value: 'Off' }),
      interpolate(EDITOR_STRINGS['state.layout_own'], { layout: 'Grid', value: 'Off' }),
    ]);
    // And the row button is described by them, so a screen reader hears them with it.
    const button = $(editor, rowKey('show_location'))!;
    expect(editor.shadowRoot!.getElementById(button.getAttribute('aria-describedby')!)).toBe(
      row.querySelector('.audit-meta'),
    );
  });

  it('keeps lines the editor does not own read-only', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    const all = rows(editor);

    expect(all.card_mod.buttons).toEqual([]);
    expect(all.grid_options.buttons).toEqual([]);
    expect(all['entities[2].glitter'].buttons).toEqual([]);
    expect(all['entities[2].glitter'].meta).toBe('');
  });

  it('makes an owned line one stop, whose strip says by ear what each action does', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    // One button a row, closed, named by the setting and its value.
    expect(rows(editor)['time_grid.end_time'].buttons).toEqual(['Last Hour in Grid: 21:00']);
    const row = $(editor, rowKey('time_grid.end_time'))!;
    expect(row.getAttribute('aria-expanded')).toBe('false');

    expect(await strip(editor, 'time_grid.end_time')).toEqual([
      { id: 'change', label: 'Change Here', name: 'Change Last Hour in Grid Here' },
      {
        id: 'open',
        label: 'Open in Which Events',
        name: 'Open Last Hour in Grid in Which Events',
      },
      { id: 'reset', label: 'Reset', name: 'Reset Last Hour in Grid' },
    ]);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const group = $(editor, '[data-audit="time_grid.end_time"] .strip')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Actions for Last Hour in Grid');
    // A calendar's line opens on its calendar's page, and says so.
    expect((await strip(editor, 'entities[0].label')).map(({ name }) => name)).toEqual([
      'Change Label on calendar.anna Here',
      'Open Label on calendar.anna in calendar.anna',
      // Its control leaves the page with its line, so the action is Remove.
      'Remove Label on calendar.anna',
    ]);
    // Opening one strip closes the other; Escape closes it, focus back on its row.
    expect($(editor, '[data-audit="time_grid.end_time"] .strip')).toBeNull();
    $(editor, '[data-focus="strip:audit:entities[0].label:open"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await editor.updateComplete;
    await editor.updateComplete;
    expect($(editor, '[data-audit="entities[0].label"] .strip')).toBeNull();
    expect(editor.shadowRoot!.activeElement).toBe($(editor, rowKey('entities[0].label')));
  });

  it('names every button on the page uniquely, its strips open', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    const names = [...editor.shadowRoot!.querySelectorAll('.audit-group button')].map(
      (button) => button.getAttribute('aria-label') ?? text(button),
    );
    for (const path of ['time_grid.end_time', 'list.show_past_events', 'days_to_show']) {
      names.push(...(await strip(editor, path)).map(({ name }) => name));
    }
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((name, at) => names.indexOf(name) !== at)).toEqual([]);
  });

  it('says on the overview what the page holds, whatever the card stores', async () => {
    const editor = await mountEditor(WALL);
    expect(text($(editor, '[data-focus="more:audit"] .nav-title'))).toBe('Stored Settings');
    expect(text($(editor, '[data-focus="more:audit"] .nav-summary'))).toBe(
      'What is set, grouped by where it lives',
    );
    const fresh = await mountEditor({ config_version: VERSION, entities: ['calendar.anna'] });
    expect(text($(fresh, '[data-focus="more:audit"] .nav-summary'))).toBe(
      'What is set, grouped by where it lives',
    );
  });

  it('says so on a card that stores nothing', async () => {
    const editor = await mountEditor({ config_version: VERSION, entities: ['calendar.anna'] });
    await openAudit(editor);
    expect(editor.shadowRoot!.querySelectorAll('.audit-group')).toHaveLength(0);
    expect(text(editor.shadowRoot!.querySelector('.audit .page-line'))).toBe('No Stored Settings');
    const stored = await mountEditor(WALL);
    await openAudit(stored);
    expect(stored.shadowRoot!.querySelector('.audit .page-line')).toBeNull();
  });

  it('tags as Home Assistant’s only keys Home Assistant takes on every card', () => {
    expect([...Audit.HA_LAYOUT_KEYS].filter((key) => !HA_CARD_KEYS.has(key))).toEqual([]);
  });
});

describe('Stored Settings, its actions', () => {
  it('edits a line in place and writes where it lives, whatever the scope', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await act(editor, 'time_grid.end_time', 'change');

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
    // Still open, on the new value; Escape closes it, focus back on its row.
    expect(rows(editor)['time_grid.end_time'].meta).toBe('');
    row
      .querySelector('ha-form')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
      );
    await editor.updateComplete;
    await editor.updateComplete;
    expect($(editor, '[data-audit="time_grid.end_time"] ha-form')).toBeNull();
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe(
      'more:audit:time_grid.end_time',
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
    expect(rows(editor)['time_grid.show_location'].buttons[0]).toBe('Show Location in Grid: Off');

    // A part drawn as a chip on its page: Edit mounts its chip, pressed as the line stores it.
    await act(editor, 'time_grid.show_location', 'change');
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

    // Calendar Filter, a chip on its page with its form as a qualifier line under it, mounts as
    // both: one option, read and written as its page draws it.
    await act(editor, 'toolbar.legend', 'change');
    const filter = $(editor, '[data-audit="toolbar.legend"] button.chip')!;
    expect(filter.getAttribute('data-field')).toBe('card:toolbar.legend');
    expect(filter.getAttribute('aria-pressed')).toBe('true');
    const menu = $(
      editor,
      '[data-audit="toolbar.legend"] .qualifier input[type="radio"][value="menu"]',
    ) as HTMLInputElement;
    expect(menu.checked).toBe(false);
    menu.checked = true;
    menu.dispatchEvent(new Event('change', { bubbles: true }));
    await editor.updateComplete;
    expect(lastConfig(editor)!.toolbar).toEqual({ show: true });
    $(editor, '[data-audit="toolbar.legend"] button.chip')!.click();
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
    await act(editor, 'time_grid.show_location', 'open');
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
    await act(editor, 'days_to_show', 'change');

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
    await act(editor, 'entities[2].allday_expires_at', 'change');

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

  it('says where Undo came from when it opens Stored Settings from another page', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await click(editor, '[data-focus="reset-all:grid"]');
    await goOverview(editor);
    await click(editor, '[data-focus="nav:events_weather_language"]');

    await click(editor, '[data-focus="undo"]');
    expect($(editor, '.page')!.dataset.page).toBe('audit');
    expect($(editor, '[data-focus="return"]')?.textContent?.trim()).toBe(
      'Back to Events, Weather & Language',
    );
    await click(editor, '[data-focus="return"]');
    expect($(editor, '.page')!.dataset.page).toBe('events_weather_language');
  });

  it('resets one line where it lives, and a calendar line on its entry', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await act(editor, 'time_grid.show_location', 'reset');
    await act(editor, 'entities[0].accent_color', 'reset');

    const stored = lastConfig(editor)!;
    expect(stored.time_grid).toEqual({ start_time: '07:00', end_time: '21:00' });
    expect((stored.entities as unknown[])[0]).toEqual({ entity: 'calendar.anna', label: '🎒' });
  });

  it('leaves a line saying what Reset did, with Undo, which takes focus and puts it back', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await act(editor, 'list.show_past_events', 'reset');

    expect(lastConfig(editor)!.list).toEqual({ description_font_size: '20px' });
    const bar = $(editor, '[data-heading="audit:list"] [data-status-bar]')!;
    expect(text(bar)).toBe('Reset Show Past Events in List Undo');
    expect(text($(editor, '.live-region'))).toBe('Reset Show Past Events in List.');
    expect(editor.shadowRoot!.activeElement).toBe(bar.querySelector('[data-focus="status-undo"]'));
    // Its row has gone, the line stands where it was.
    expect($(editor, '[data-audit="list.show_past_events"]')).toBeNull();
    await click(editor, '[data-focus="status-undo"]');
    expect(lastConfig(editor)!.list).toEqual(WALL.list);
    expect($(editor, '[data-audit="list.show_past_events"]')).not.toBeNull();
    expect($(editor, '[data-status-bar]')).toBeNull();
  });

  it('keeps the line a reset leaves when it took its group’s last line', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      title: 'Family',
    });
    await openAudit(editor);
    await act(editor, 'title', 'reset');

    expect(lastConfig(editor)!.title).toBeUndefined();
    expect(editor.shadowRoot!.querySelectorAll('.audit-group')).toHaveLength(0);
    const bar = $(editor, '.audit [data-status-bar]')!;
    expect(text(bar)).toMatch(/^Reset .+ Undo$/);
    expect(editor.shadowRoot!.activeElement).toBe(bar.querySelector('[data-focus="status-undo"]'));
    expect(text($(editor, '.audit .page-line'))).toBe('No Stored Settings');
    await click(editor, '[data-focus="status-undo"]');
    expect(lastConfig(editor)!.title).toBe('Family');
    expect($(editor, '[data-audit="title"]')).not.toBeNull();
    expect($(editor, '[data-status-bar]')).toBeNull();
  });

  it('words the line Remove leaves as the strip did', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    // A calendar's label leaves its page with its line, so the strip offers Remove.
    const [, , reset] = await strip(editor, 'entities[0].label');
    expect(reset.label).toBe('Remove');
    await act(editor, 'entities[0].label', 'reset');

    const bar = $(editor, '[data-status-bar]')!;
    expect(text(bar)).toBe('Removed Label on calendar.anna Undo');
    expect(text($(editor, '.live-region'))).toBe('Removed Label on calendar.anna.');
    expect($(editor, '[data-focus="undo"]')!.getAttribute('aria-label')).toBe(
      'Undo: Remove Label on calendar.anna',
    );
  });

  it('goes to a setting on its page, in its group’s scope', async () => {
    const editor = await mountEditor(WALL);
    await openAudit(editor);
    await act(editor, 'time_grid.end_time', 'open');

    expect($(editor, '.page')!.dataset.page).toBe('which_events');
    expect($(editor, '[data-field="layout:time_grid.end_time"]')).not.toBeNull();
    // The line under the header returns to the line it left.
    expect($(editor, '[data-focus="return"]')?.textContent?.trim()).toBe('Back to Stored Settings');
    await click(editor, '[data-focus="return"]');
    expect($(editor, '.page')!.dataset.page).toBe('audit');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe(
      'more:audit:time_grid.end_time',
    );
    // Back goes up from the page, to the layout it is Grid's topic in.
    await act(editor, 'time_grid.end_time', 'open');
    await click(editor, '[data-focus="back-top"]');
    expect($(editor, '.layout-page')?.getAttribute('data-layout')).toBe('grid');
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

describe('Stored Settings, the review’s findings', () => {
  async function editLine(
    editor: Editor,
    path: string,
    change: (data: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    await act(editor, path, 'change');
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
      (await strip(editor, 'entities[0].accent_color')).find(({ id }) => id === 'change')!.name,
    ).toMatch(/^Change Accent Color on .* Here$/);
    await act(editor, 'entities[0].accent_color', 'change');
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
    await act(editor, 'title_color', 'change');
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

  it('judges a calendar’s line as the calendar’s page does, not as Layout Defaults would', async () => {
    // Grid alone hides locations by its own default, which the top level does not reach, so
    // Anna's icon waits on Show Location there, as her page says.
    const editor = await mountEditor({
      config_version: VERSION,
      view: 'grid',
      time_grid: { min_days_fallback: 'cramp' },
      entities: [{ entity: 'calendar.anna', location_icon: 'mdi:pin' }],
    });
    await openAudit(editor);
    expect(rows(editor)['entities[0].location_icon'].meta).toMatch(/^Not in Use until /);
    // On a List card, which shows locations, it is in use.
    const list = await mountEditor({
      config_version: VERSION,
      view: 'list',
      entities: [{ entity: 'calendar.anna', location_icon: 'mdi:pin' }],
    });
    await openAudit(list);
    expect(rows(list)['entities[0].location_icon'].meta).not.toMatch(/Not in Use/);
  });

  it('goes to a calendar’s setting in a scope that offers it', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      view: 'list',
      entities: [{ entity: 'calendar.anna', multiday_banners: false }],
    });
    await openAudit(editor);
    await act(editor, 'entities[0].multiday_banners', 'open');

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

describe('Stored Settings, list and nested values', () => {
  it('names the toolbar’s own buttons as their rows on the toolbar page do', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      toolbar: {
        show: true,
        buttons: [
          { icon: 'mdi:arrow-left', tap_action: { action: 'navigate', navigation_path: '/x' } },
          { icon: 'mdi:calendar', name: 'Agenda' },
          { tap_action: { action: 'none' } },
        ],
      },
    });
    await openAudit(editor);

    expect(rows(editor)['toolbar.buttons'].value).toBe('Arrow left, Agenda, Button 3');
  });

  it('words a list or a nested value as one line of YAML, never as JSON', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: [
        {
          entity: 'calendar.anna',
          visibility: [
            { condition: 'screen', media_query: '(min-width: 600px)' },
            { condition: 'user', users: ['a1', 'b2'] },
          ],
        },
      ],
      day_tap_action: {
        action: 'perform-action',
        perform_action: 'light.toggle',
        target: { entity_id: ['light.hall', 'light.porch'] },
      },
      toolbar: { buttons: [] },
      time_grid: { custom_thing: { value: 'keep', steps: [1, 2] } },
      card_mod: { style: { 'ha-card': 'x' } },
    });
    await openAudit(editor);
    const all = rows(editor);

    expect(all['entities[0].visibility'].value).toBe(
      '{condition: screen, media_query: "(min-width: 600px)"}, {condition: user, users: [a1, b2]}',
    );
    expect(all.day_tap_action.value).toBe(
      'action: perform-action, perform_action: light.toggle, target: {entity_id: [light.hall, light.porch]}',
    );
    expect(all['toolbar.buttons'].value).toBe('[]');
    expect(all['time_grid.custom_thing'].value).toBe('value: keep, steps: [1, 2]');
    expect(all.card_mod.value).toBe('style: {ha-card: x}');
  });

  it('quotes a string inside a list or block only where it would read as something else', () => {
    expect(Audit.plainValue({ only: ['a, b'], also: ['a', 'b'] })).toBe(
      'only: ["a, b"], also: [a, b]',
    );
    expect(Audit.plainValue([''])).toBe('""');
    expect(Audit.plainValue({ a: null, b: 'null', c: 12, d: '12', e: 'action: none' })).toBe(
      'a: null, b: "null", c: 12, d: "12", e: "action: none"',
    );
    expect(Audit.plainValue({ nested: { empty: [], none: {} } })).toBe(
      'nested: {empty: [], none: {}}',
    );
    // A top-level string is the whole line, so nothing can misread it.
    expect(Audit.plainValue('a, b')).toBe('a, b');
  });
});

/**
 * Show what applies (backlog item 307): each page draws what applies here and is essential,
 * stored, inherited with a value that differs, or added this session; the rest of each heading
 * waits in its Add row, named; what a gate withholds is named in its gate line, with any value
 * stored for it all the same; and each field says where its value comes from, with Reset or
 * Remove beside it (sections 5.1 to 5.3 of the plan).
 *
 * Every case reads the editor as drawn: the fields a page's frames hold, the words their forms
 * give Home Assistant, the lines and buttons around them, and what the editor reports. #834's
 * cases for what Essentials Only had to keep (the root, a nested path, a layout's block holding a
 * unitless line at its default, a calendar and a toolbar button) are here as render cases: the
 * page shows each live.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  type MountedEditor,
  button,
  changeField,
  formsOf,
  goEntry,
  goPage,
  helperOf,
  keysOf,
  labelOf,
  lastConfig,
  mountEditor,
  openPageOf,
  prefForm,
  togglePref,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import {
  type FieldId,
  buildFieldIndex,
  fieldLabel,
  schemaCtx,
  universeIndex,
} from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import {
  type Appearance,
  OVERVIEW_FIELDS,
  PAGES,
  placementOf,
} from '../src/rendering/editor/pages';
import { keepsControl, storedAt } from '../src/rendering/editor/plan';
import { PREFS_KEY } from '../src/rendering/editor/prefs';
import * as Reset from '../src/rendering/editor/reset';
import { toStoredConfig } from '../src/rendering/editor/value';
import { WORKSPACES } from '../src/rendering/editor/workspace';

const VERSION = Config.CURRENT_CONFIG_VERSION;

/** Every field the List scope can build. */
const EVERY = universeIndex('en', 'list').fields;

/** Each card field's appearance in the registry. */
const APPEARANCE = new Map<FieldId, Appearance>([
  ...OVERVIEW_FIELDS,
  ...PAGES.flatMap((page) => page.headings.flatMap((heading) => heading.fields)),
]);

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

/**
 * Mounts a card and lets it report.
 *
 * @param config - The configuration, beside its version and one calendar
 * @returns The editor
 */
async function mount(config: Record<string, unknown> = {}): Promise<MountedEditor> {
  return mountEditor({ config_version: VERSION, entities: ['calendar.anna'], ...config });
}

const $ = <T extends Element = HTMLElement>(editor: MountedEditor, selector: string): T | null =>
  editor.shadowRoot!.querySelector<T>(selector);

/** The fields the open place draws live, in order. */
const live = (editor: MountedEditor): FieldId[] =>
  [...editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-field]')].map(
    (frame) => frame.dataset.field!,
  );

/**
 * The words a field gives Home Assistant: its label, then its helper; for a chip the editor draws
 * in its place (PR 18), the chip's own name, which carries them.
 */
const words = (editor: MountedEditor, id: FieldId): string =>
  chipName(editor, id) ?? `${labelOf(editor, id)} | ${helperOf(editor, id) ?? ''}`;

/**
 * A toggle chip's accessible name, where the open place draws the field as one.
 *
 * @param editor - The editor
 * @param id - The field
 * @returns The name, or `undefined` where the field is no chip here
 */
function chipName(editor: MountedEditor, id: FieldId): string | undefined {
  return (
    editor
      .shadowRoot!.querySelector(`button.chip[data-field="${id}"]`)
      ?.getAttribute('aria-label') ?? undefined
  );
}

/**
 * Clicks one of the editor's own controls and waits for the render.
 *
 * @param editor - The editor
 * @param selector - The control
 */
async function click(editor: MountedEditor, selector: string): Promise<void> {
  const control = $(editor, selector);
  if (control === null) throw new Error(`The editor draws no ${selector}`);
  control.click();
  await editor.updateComplete;
}

/** The live region's last words, once what queued them has rendered. */
const said = (editor: MountedEditor): string =>
  $(editor, '.live-region')?.textContent?.trim() ?? '';

describe('what a page shows of a fresh card', () => {
  it('draws exactly the essentials that apply on Events, and names the rest', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    // The eight event parts as chips (PR 18), then the essential fields under them.
    expect(live(editor)).toEqual([
      'events:show_time',
      'events:show_end_time',
      'events:show_location',
      'events:show_description',
      'events:show_countdown',
      'events:show_progress_bar',
      'events:show_duration',
      'events:show_now_indicator',
      'content:time_format',
    ]);
    // Reconciled against the registry, read the other way: every setting that keeps its control
    // (an essential one, a chip) present here.
    const held = (editor as unknown as { _config: Types.Config })._config;
    const present = buildFieldIndex(schemaCtx(held, 'list', 'en')).fields;
    const essentials = PAGES.find((page) => page.id === 'events')!
      .headings.flatMap((heading) => heading.fields)
      .filter(([id, appearance]) => keepsControl(appearance) && present.has(id))
      .map(([id]) => id);
    expect([...live(editor)].sort()).toEqual([...essentials].sort());
    expect(editor.shadowRoot!.querySelectorAll('.add-row').length).toBeGreaterThan(4);
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('names the settings of an Add row, four and a count past that', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    const row = $(editor, '.page-group[data-heading="time"] .add-toggle')!;
    const names = PAGES.find((page) => page.id === 'events')!
      .headings.find((heading) => heading.key === 'time')!
      .fields.filter(([, appearance]) => appearance === 'add')
      .map(([id]) => fieldLabel(EVERY.get(id)!, 'en'));
    // Seven since End Time and Duration became chips under Event Details (PR 18).
    expect(names).toHaveLength(7);
    expect(row.querySelector('.add-names')!.textContent).toBe(
      `${names.slice(0, 4).join(' · ')}, +3`,
    );
    expect(row.querySelector('.add-count')!.textContent).toBe('Settings: 7');
    expect(row.getAttribute('aria-label')).toBe('Add Setting under Time, Settings: 7');
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('names an Add row with its heading only where the row stands in for it', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    const state = $(editor, '.page-group[data-heading="heading_event_state"]')!;
    expect(state.querySelector('h3')).toBeNull();
    expect(state.querySelector('.add-title')!.textContent).toBe('Event State · Add Setting');
    // Over every page of a fresh card: a heading drawn with nothing between it and its Add row
    // never stutters, and a row under a heading's line or fields stays plain.
    let named = 0;
    let plain = 0;
    // Every page a List card opens; Grid's page is Grid's alone.
    for (const page of PAGES.filter((each) => each.id !== 'grid')) {
      await goPage(editor, page.id);
      for (const group of editor.shadowRoot!.querySelectorAll('.page-group')) {
        const title = group.querySelector('.add-title')?.textContent;
        if (title === undefined) continue;
        const h3 = group.querySelector('h3');
        const between = group.querySelector('[data-field], .hint, .page-line') !== null;
        if (title === 'Add Setting') {
          plain += 1;
          expect(h3 === null || between, `${page.id} ${group.getAttribute('data-heading')}`).toBe(
            true,
          );
        } else {
          named += 1;
          expect(h3, title).toBeNull();
          expect(between, title).toBe(false);
        }
      }
    }
    expect(named).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(0);
  });

  it('adds a setting without writing, keeps the list open and focuses the new field', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    await click(editor, '.page-group[data-heading="time"] .add-toggle');
    expect($(editor, '[aria-label="Settings to Add under Time"]')).not.toBeNull();
    await click(editor, '[data-focus="add:time:events:time_font_size"]');
    await editor.updateComplete;

    expect(lastConfig(editor)).toBeUndefined();
    expect(live(editor)).toContain('events:time_font_size');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-field')).toBe(
      'events:time_font_size',
    );
    expect(said(editor)).toBe('Added Time Font Size.');
    // The rest stay offered, the one added gone from them.
    expect($(editor, '[data-focus="add:time:events:time_color"]')).not.toBeNull();
    expect($(editor, '[data-focus="add:time:events:time_font_size"]')).toBeNull();
  });

  it('puts the YAML back as it was when an added setting is changed, then removed', async () => {
    const card = { config_version: VERSION, entities: ['calendar.anna'], title: 'Family' };
    const editor = await mountEditor(card);
    await goPage(editor, 'events');
    await click(editor, '.page-group[data-heading="time"] .add-toggle');
    await click(editor, '[data-focus="add:time:events:time_font_size"]');
    await changeField(editor, 'events:time_font_size', '20px');
    expect(lastConfig(editor)).toEqual({ ...card, list: { time_font_size: '20px' } });

    const remove = $(editor, '[data-focus="remove:events:time_font_size"]')!;
    expect(remove.getAttribute('aria-label')).toBe('Remove Time Font Size for List and Reset It');
    await click(editor, '[data-focus="remove:events:time_font_size"]');
    await editor.updateComplete;

    expect(lastConfig(editor)).toEqual(card);
    expect(live(editor)).not.toContain('events:time_font_size');
    // Focus goes to the Add row that names it again.
    expect(editor.shadowRoot!.activeElement?.classList.contains('add-toggle')).toBe(true);
    expect(said(editor)).toBe('Removed Time Font Size and reset it.');
  });
});

describe('what the card sets stays on its page', () => {
  it('draws a value held at the root, live and from All Layouts where it differs', async () => {
    // Held at the root, which List inherits; and a value at its default, which only the YAML
    // says is set.
    const editor = await mount({ event_font_size: '30px', refresh_interval: 30 });
    await openPageOf(editor, 'events:event_font_size');
    expect(live(editor)).toContain('events:event_font_size');
    expect(words(editor, 'events:event_font_size')).toContain('From All Layouts.');
    expect($(editor, '[data-focus="edit:events:event_font_size:shared"]')?.textContent).toContain(
      'Edit All Layouts',
    );
    await goPage(editor, 'taps_refresh');
    expect(live(editor)).toContain('actions:refresh_interval');
  });

  it('draws a value held at a nested path', async () => {
    const editor = await mount({
      weather: { entity: 'weather.home', position: 'date', date: { color: '#ff0000' } },
    });
    await goPage(editor, 'weather');
    expect(live(editor)).toContain('weather:weather.date.color');
    expect(live(editor)).not.toContain('weather:weather.date.font_size');
  });

  it.each([
    [{ view: 'column', column: { event_font_size: 14 } }, 'events:event_font_size', 'Columns'],
    [{ view: 'grid', time_grid: { time_font_size: 12 } }, 'events:time_font_size', 'Grid'],
  ] as const)(
    'draws a line the layout’s block holds, unitless at its default: %j',
    async (config, id, layout) => {
      const editor = await mount(config);
      await openPageOf(editor, id);
      expect(live(editor)).toContain(id);
      expect(words(editor, id)).toContain(`Set for ${layout}, Same as the Default.`);
    },
  );

  it('draws what a calendar sets on its page, and what it does not in an Add row', async () => {
    const editor = await mount({ entities: [{ entity: 'calendar.anna', blocklist: 'Birthday' }] });
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect(live(editor)).toContain('calendar:blocklist');
    expect(live(editor)).not.toContain('calendar:allowlist');
    expect(helperOf(editor, 'calendar:blocklist')).toMatch(/^Set on This Calendar\. /);
  });

  it('draws each toolbar button’s own fields', async () => {
    const editor = await mount({
      toolbar: { show: true, buttons: [{ icon: 'mdi:home', name: 'Home' }] },
    });
    await openPageOf(editor, 'button:icon', button(0));
    expect(formsOf(editor, button(0)).length).toBeGreaterThan(0);
  });
});

describe('state words, by where they are drawn', () => {
  it('carry “From All Layouts” on a chip’s name and a text field’s helper', async () => {
    const editor = await mount({ show_location: false, event_font_size: '30px' });
    await goPage(editor, 'events');
    expect(chipName(editor, 'events:show_location')).toBe('Location, From All Layouts');
    expect(helperOf(editor, 'events:event_font_size')).toMatch(/^From All Layouts\./);
  });

  it('name a slider’s group with them, where the slider has no name of its own', async () => {
    const editor = await mount({
      view: 'grid',
      days_to_show: 3,
      show_location: false,
      time_grid: { min_days_to_show: 2, show_location: true },
    });
    await openPageOf(editor, 'layout:time_grid.min_days_to_show');
    const group = (id: string): string | null =>
      $(editor, `[data-field="${id}"]`)!.getAttribute('aria-label');
    expect(labelOf(editor, 'layout:time_grid.min_days_to_show')).toBe(
      'Fewest Day Columns · Set for Grid',
    );
    expect(group('layout:time_grid.min_days_to_show')).toBe('Fewest Day Columns · Set for Grid');
    // An event part is a chip (PR 18), named by its label and its words.
    await openPageOf(editor, 'events:show_location');
    expect(chipName(editor, 'events:show_location')).toBe('Location, Set for Grid');
    expect(group('events:show_location')).toBe('Location, Set for Grid');
  });

  it('carry “Set for All Layouts” on a dropdown’s label', async () => {
    const editor = await mount({ show_week_numbers: 'iso' });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await openPageOf(editor, 'day_header:week_number_mode');
    expect(labelOf(editor, 'day_header:week_number_mode')).toMatch(/ · Set for All Layouts$/);
  });

  it('read “Grid’s Default” on every field Grid defaults differently while Grid stores nothing', async () => {
    const editor = await mountEditor(
      { config_version: VERSION, entities: ['calendar.anna'], view: 'grid' },
      { every: true },
    );
    const config = (editor as unknown as { _config: Types.Config })._config;
    const fields = [...buildFieldIndex(schemaCtx(config, 'grid', 'en')).fields.values()].filter(
      (field) =>
        field.dataPath.length === 0 &&
        field.configKeys.some((key) => View.hasDivergentDefault(key, 'grid')) &&
        placementOf(field.id) !== undefined,
    );
    expect(fields.length).toBeGreaterThan(10);
    const wrong: string[] = [];
    for (const field of fields) {
      await openPageOf(editor, field.id);
      if (!words(editor, field.id).includes('Grid’s Default')) wrong.push(field.id);
    }
    expect(wrong).toEqual([]);
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('say what Reset gives, which describes Reset, and Reset gives it', async () => {
    const editor = await mount({
      view: 'grid',
      event_font_size: '14px',
      time_grid: { event_font_size: '18px' },
    });
    await openPageOf(editor, 'events:event_font_size');
    expect(words(editor, 'events:event_font_size')).toContain('Set for Grid.');
    const outcome = $(editor, '[data-field="events:event_font_size"] .outcome')!;
    expect(outcome.textContent).toBe(
      `Reset gives Grid’s Default, ${View.TIME_GRID_DEFAULT_OVERRIDES.event_font_size}, not the All Layouts value, 14px`,
    );
    const reset = $(editor, '[data-focus="remove:events:event_font_size"]')!;
    expect(reset.getAttribute('aria-describedby')).toBe(outcome.id);

    await click(editor, '[data-focus="remove:events:event_font_size"]');
    expect(lastConfig(editor)).not.toHaveProperty('time_grid');
    expect(lastConfig(editor)?.event_font_size).toBe('14px');
  });
});

describe('Reset and Remove', () => {
  it('keeps an essential field on Reset, with focus on its wrapper, in one undo step', async () => {
    const editor = await mount({ show_time: false });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await goPage(editor, 'events');
    const reset = $(editor, '[data-focus="reset:events:show_time"]')!;
    expect(reset.getAttribute('aria-label')).toBe('Reset Show Time');
    await click(editor, '[data-focus="reset:events:show_time"]');
    await editor.updateComplete;

    expect(lastConfig(editor)).not.toHaveProperty('show_time');
    expect(live(editor)).toContain('events:show_time');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-field')).toBe('events:show_time');
    await click(editor, '[data-focus="undo"]');
    expect(lastConfig(editor)?.show_time).toBe(false);
  });

  it('removes a family with the ✕ on its heading, every member in one step', async () => {
    const card = { config_version: VERSION, entities: ['calendar.anna'], title: 'Family' };
    const editor = await mountEditor(card);
    await changeField(editor, 'content:compact_days_to_show', 2);
    await changeField(editor, 'content:compact_events_to_show', 3);
    const stored = lastConfig(editor)!;
    expect(live(editor)).toEqual(
      expect.arrayContaining(['content:compact_days_to_show', 'content:compact_events_to_show']),
    );
    const remove = $(editor, '[data-focus="remove-family:compact_mode"]')!;
    expect(remove.getAttribute('aria-label')).toBe('Remove Compact Mode and Reset It');
    await click(editor, '[data-focus="remove-family:compact_mode"]');
    await editor.updateComplete;

    expect(lastConfig(editor)).toEqual(card);
    expect(live(editor)).not.toContain('content:compact_days_to_show');
    expect(said(editor)).toBe('Removed Compact Mode and reset it.');
    // One step: Undo brings both back.
    await click(editor, '[data-focus="undo"]');
    expect(lastConfig(editor)).toEqual(stored);
  });

  /**
   * `plan.ts` › `resetAction` takes a shortcut for a setting that stays live whatever is stored
   * (`keepsControl`: an essential one, a chip, a button's row): Reset, without building what the
   * reset would leave. It rests on one fact about the builders, checked here on its own over the
   * corpus: resetting such a field's own line never withholds it. A mode value's can (Card Height
   * leaves with its height), which is why the shortcut stops at these.
   */
  it('never withholds a field that keeps its control by resetting its own line, over the corpus', () => {
    let checked = 0;
    const withheld: string[] = [];
    for (const state of corpus()) {
      const raw = state.config as unknown as Record<string, unknown>;
      const ctx = schemaCtx(state.config, state.workspace, 'en');
      const present = buildFieldIndex(ctx).fields;
      for (const field of present.values()) {
        const appearance = APPEARANCE.get(field.id);
        if (appearance === undefined || !keepsControl(appearance)) continue;
        if (!storedAt(raw, field, state.workspace)) continue;
        const { state: after } = Reset.reset(
          {
            config: state.config,
            pending: {},
            authoredRootKeys: new Set(Object.keys(raw)),
            gridResetKeys: new Set(),
            entryKeys: (state.config.entities ?? []).map((_, at) => at),
            buttonKeys: [],
          },
          { kind: 'field', field, workspace: state.workspace },
        );
        const stored = toStoredConfig(after.config, after.authoredRootKeys, raw);
        const config = { ...Config.DEFAULT_CONFIG, ...stored } as unknown as Types.Config;
        if (!Array.isArray(config.entities)) config.entities = [];
        checked += 1;
        const rebuilt = buildFieldIndex(schemaCtx(config, state.workspace, 'en')).fields;
        if (!rebuilt.has(field.id)) withheld.push(`${state.workspace} ${field.id}`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(withheld).toEqual([]);
    expect(WORKSPACES.length).toBe(4);
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);
});

describe('gate lines and stored values not in use', () => {
  it('draws the line alone, then each stored value with its Reset, where all are stored', async () => {
    const editor = await mount({
      show_description: false,
      show_description_allday: true,
      description_font_size: '20px',
      description_color: '#ff0000',
      description_icon_size: '18px',
      description_max_lines: 2,
    });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await goPage(editor, 'events');
    const lines = [
      ...editor.shadowRoot!.querySelectorAll('.page-group[data-heading="description"] .gate-line'),
    ].map((line) => line.textContent!.replace(/\s+/g, ' ').trim());
    // Show Description is drawn as the Description chip, so the line says it is pressed (PR 18).
    expect(lines[0]).toBe('Appears once Description is pressed.');
    expect(lines.slice(1)).toEqual([
      'Stored but not in use: Show Description For All-Day Events (On) Reset',
      'Stored but not in use: Description Font Size (20px) Reset',
      'Stored but not in use: Description Color (#ff0000) Reset',
      'Stored but not in use: Description Icon Size (18px) Reset',
      'Stored but not in use: Description Line Limit (2) Reset',
    ]);
  });

  it('names what waits, and the stored value, from All Layouts in a layout', async () => {
    const editor = await mount({ show_description: false, description_font_size: '20px' });
    await goPage(editor, 'events');
    const lines = [
      ...editor.shadowRoot!.querySelectorAll('.page-group[data-heading="description"] .gate-line'),
    ].map((line) => line.textContent!.replace(/\s+/g, ' ').trim());
    expect(lines[0]).toMatch(
      /^Appears once Description is pressed: Show Description For All-Day Events, /,
    );
    expect(lines).toContain(
      'Stored but not in use: Description Font Size (20px), from All Layouts Edit All Layouts',
    );
  });
});

describe('the preferences under More', () => {
  it('Show Every Setting draws every setting that applies, with no Add row, and is remembered', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    const shown = live(editor).length;
    await click(editor, '[data-focus="back-top"]');
    // Home Assistant's own switch, a form of its own that writes nothing to the card.
    expect(prefForm(editor, 'every')!.schema).toEqual([
      { name: 'every', selector: { boolean: {} } },
    ]);
    expect(prefForm(editor, 'every')!.data).toEqual({ every: false });
    await togglePref(editor, 'every');
    expect(prefForm(editor, 'every')!.data).toEqual({ every: true });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toEqual({
      v: 1,
      every: true,
      yaml: false,
    });

    await goPage(editor, 'events');
    expect(editor.shadowRoot!.querySelectorAll('.add-row')).toHaveLength(0);
    expect(live(editor)).toContain('events:time_font_size');
    expect(live(editor).length).toBeGreaterThan(shown * 3);
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('Show YAML Option Names puts each setting’s option, where this scope writes it, first', async () => {
    const editor = await mount({ event_font_size: '30px' });
    await togglePref(editor, 'yaml');
    await openPageOf(editor, 'events:event_font_size');
    expect(helperOf(editor, 'events:event_font_size')).toMatch(
      /^YAML: list\.event_font_size From All Layouts\./,
    );
    expect(helperOf(editor, 'events:show_time')).toMatch(/^YAML: list\.show_time/);
  });
});

describe('the review’s findings', () => {
  it('keeps focus in the editor after a Remove on the overview', async () => {
    const editor = await mount({ start_date: '2026-11-15' });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    expect(live(editor)).toContain('content:start_date_fixed');
    $(editor, '[data-focus="remove:content:start_date_fixed"]')!.focus();
    await click(editor, '[data-focus="remove:content:start_date_fixed"]');
    await editor.updateComplete;
    expect(live(editor)).not.toContain('content:start_date_fixed');
    const focused = editor.shadowRoot!.activeElement;
    expect(focused?.isConnected).toBe(true);
    expect(focused?.hasAttribute('data-field')).toBe(true);
  });

  it('removes one calendar’s family, and leaves another calendar’s added one', async () => {
    const editor = await mount({ entities: ['calendar.anna', 'calendar.ben'] });
    const [anna, ben] = keysOf(editor, 'entry');
    for (const key of [anna, ben]) {
      await goEntry(editor, key);
      await click(editor, '.page-group[data-heading="heading_replace"] .add-toggle');
      await click(editor, '[data-focus="add:heading_replace:family:replace"]');
      expect(live(editor)).toContain('calendar:replace_pattern');
    }
    await click(editor, '[data-focus="remove-family:replace"]');
    expect(live(editor)).not.toContain('calendar:replace_pattern');
    await goEntry(editor, anna);
    expect(live(editor)).toContain('calendar:replace_pattern');
  });

  it('forgets what was added to a calendar once the YAML replaces it from outside', async () => {
    const editor = await mount();
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    await click(editor, '.page-group[data-heading="heading_details"] .add-toggle');
    await click(editor, '[data-focus="add:heading_details:calendar:show_description"]');
    expect(live(editor)).toContain('calendar:show_description');
    editor.setConfig({ config_version: VERSION, entities: ['calendar.ben'] });
    await editor.updateComplete;
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect(live(editor)).not.toContain('calendar:show_description');
  });
});

describe('an open Add row', () => {
  it('closes on Escape, focus back on its row, and does not stay open on the next page', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    await click(editor, '.page-group[data-heading="time"] .add-toggle');
    const item = $(editor, '[data-focus="add:time:events:time_font_size"]')!;
    item.focus();
    item.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    await editor.updateComplete;
    await editor.updateComplete;
    expect($(editor, '.add-row.open')).toBeNull();
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe('add:time');
    expect($(editor, '.page[data-page="events"]')).not.toBeNull();

    await click(editor, '.page-group[data-heading="time"] .add-toggle');
    await goPage(editor, 'day_header');
    expect($(editor, '.add-row.open')).toBeNull();
  });
});

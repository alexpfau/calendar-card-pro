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
  openPill,
  pillOf,
  prefItem,
  togglePref,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import { type FieldId, buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
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
import * as Shown from '../src/rendering/editor/shown';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { toStoredConfig } from '../src/rendering/editor/value';
import { WORKSPACES } from '../src/rendering/editor/workspace';

const VERSION = Config.CURRENT_CONFIG_VERSION;

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

/** Whether a setting's head starts with Home Assistant's own switch row. */
const isSwitch = (editor: MountedEditor, id: FieldId): boolean =>
  editor.shadowRoot!.querySelector(`[data-setting="${id}"] > .setting-head .setting-control`) !==
  null;

/** The live region's last words, once what queued them has rendered. */
const said = (editor: MountedEditor): string =>
  $(editor, '.live-region')?.textContent?.trim() ?? '';

describe('every setting on a fresh card', () => {
  it('draws every setting that applies on Events, folding each one at its default', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    const held = (editor as unknown as { _config: Types.Config })._config;
    const present = buildFieldIndex(schemaCtx(held, 'list', 'en')).fields;
    const placed = PAGES.find((page) => page.id === 'events')!
      .headings.flatMap((heading) => heading.fields)
      .filter(([id]) => present.has(id));
    // Every setting that applies is drawn: as a chip, or under a head row of its own, except a
    // color's value, which its mode's control holds.
    const missing = placed.map(([id]) => id).filter((id) => !live(editor).includes(id));
    expect(missing).toEqual(['events:accent_color']);
    expect(editor.shadowRoot!.querySelectorAll('.add-row, .add-toggle')).toHaveLength(0);
    // An essential one is drawn open; every other one folds to its head.
    for (const [id, appearance] of placed) {
      const toggle = $(editor, `[data-setting="${id}"] .setting-toggle`);
      if (keepsControl(appearance)) expect(toggle, id).toBeNull();
      else if ($(editor, `[data-setting="${id}"]`) !== null && !isSwitch(editor, id)) {
        expect(toggle?.getAttribute('aria-expanded'), id).toBe('false');
      }
    }
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('opens a folded setting in place, focus kept on its head, and folds it again', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    const id = 'events:time_font_size';
    const toggle = $(editor, `[data-setting="${id}"] .setting-toggle`)!;
    expect(toggle.getAttribute('aria-label')).toBe('Time Font Size, 12px');
    // Folded, the head is what a search, an undo or a pick lands on.
    expect(toggle.dataset.field).toBe(id);
    expect($(editor, `[data-setting="${id}"] ha-form`)).toBeNull();
    toggle.focus();
    await click(editor, `[data-setting="${id}"] .setting-toggle`);

    // The same head, still focused, opened: nothing in it moves, Home Assistant's control below.
    expect($(editor, `[data-setting="${id}"] .setting-toggle`)).toBe(toggle);
    expect(editor.shadowRoot!.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.hasAttribute('data-field')).toBe(false);
    expect($(editor, `[data-setting="${id}"] .field[data-field="${id}"] ha-form`)).not.toBeNull();
    expect(lastConfig(editor)).toBeUndefined();

    await click(editor, `[data-setting="${id}"] .setting-toggle`);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect($(editor, `[data-setting="${id}"] ha-form`)).toBeNull();
  });

  it('opens one member of a family alone, so no other head moves', async () => {
    const editor = await mount();
    await goPage(editor, 'day_header');
    await click(editor, '[data-setting="day_header:past_date_scale"] .setting-toggle');
    const expanded = (id: string) =>
      $(editor, `[data-setting="${id}"] .setting-toggle`)?.getAttribute('aria-expanded');
    expect(expanded('day_header:past_date_scale')).toBe('true');
    expect(expanded('day_header:past_date_opacity')).toBe('false');
    expect(expanded('day_header:past_date_font_weight')).toBe('false');
  });

  it('keeps a changed setting open through its Reset, and folds it on leaving the page', async () => {
    const card = { config_version: VERSION, entities: ['calendar.anna'], title: 'Family' };
    const editor = await mountEditor(card);
    await goPage(editor, 'events');
    const id = 'events:time_font_size';
    await click(editor, `[data-setting="${id}"] .setting-toggle`);
    await changeField(editor, id, '20px');
    expect(lastConfig(editor)).toEqual({ ...card, list: { time_font_size: '20px' } });
    expect(pillOf(editor, id)).toBe('Set');

    // The pill holds the Reset the line under the field used to.
    const menu = (await openPill(editor, id))!;
    const reset = menu.querySelector<HTMLButtonElement>(`[data-focus="reset:${id}"]`)!;
    expect(reset.textContent?.trim()).toMatch(/^Reset \(/);
    expect(reset.getAttribute('aria-label')).toMatch(/^Reset Time Font Size to /);
    reset.click();
    await editor.updateComplete;

    expect(lastConfig(editor)).toEqual(card);
    expect(pillOf(editor, id)).toBe('Default');
    expect($(editor, `[data-setting="${id}"] .setting-menu`)).toBeNull();
    expect($(editor, `[data-setting="${id}"] ha-form`)).not.toBeNull();
    await goPage(editor, 'day_header');
    await goPage(editor, 'events');
    expect($(editor, `[data-setting="${id}"] .setting-toggle`)?.getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('keeps a helper behind ⓘ, as the setting’s accessible description', async () => {
    const editor = await mount();
    await goPage(editor, 'day_header');
    const id = 'day_header:today_date_scale';
    await click(editor, `[data-setting="${id}"] .setting-toggle`);
    const info = $(editor, `[data-setting="${id}"] .setting-info`)!;
    expect(info.getAttribute('aria-label')).toBe(`About ${labelOf(editor, id)}`);
    const help = $(editor, `[data-setting="${id}"] .setting-help`)!;
    expect(help.hidden).toBe(true);
    expect($(editor, `.field[data-field="${id}"]`)!.getAttribute('aria-describedby')).toBe(help.id);
    // The form shows none of its own.
    const form = $(editor, `.field[data-field="${id}"] ha-form`) as unknown as {
      computeHelper(node: unknown): string | undefined;
      schema: Array<{ name: string }>;
    };
    expect(form.computeHelper(form.schema[0])).toBeUndefined();
    await click(editor, `[data-setting="${id}"] .setting-info`);
    expect(help.hidden).toBe(false);
    expect(help.textContent?.trim()).toBe(helperOf(editor, id));
  });

  it('draws the editor’s tools in the head, never inside Home Assistant’s field box', async () => {
    const editor = await mount({ event_font_size: '30px', show_time: false });
    for (const page of ['events', 'day_header', 'taps_refresh']) {
      await goPage(editor, page);
      for (const toggle of editor.shadowRoot!.querySelectorAll<HTMLElement>(
        '.setting-toggle[aria-expanded="false"]',
      )) {
        toggle.click();
      }
      await editor.updateComplete;
      expect(editor.shadowRoot!.querySelectorAll('.field .setting-tools')).toHaveLength(0);
      expect(editor.shadowRoot!.querySelectorAll('.setting-head .setting-tools').length).toBe(
        editor.shadowRoot!.querySelectorAll('.setting').length,
      );
    }
  });
});

describe('what the card sets stays on its page', () => {
  it('draws a value held at the root, live and from All Layouts where it differs', async () => {
    // Held at the root, which List inherits; and a value at its default, which only the YAML
    // says is set.
    const editor = await mount({ event_font_size: '30px', refresh_interval: 30 });
    await openPageOf(editor, 'events:event_font_size');
    expect(live(editor)).toContain('events:event_font_size');
    expect(pillOf(editor, 'events:event_font_size')).toBe('From All Layouts');
    // Nothing here resets it, so its pill opens no menu.
    expect($(editor, '[data-setting="events:event_font_size"] .setting-pill-button')).toBeNull();
    await goPage(editor, 'taps_refresh');
    expect(live(editor)).toContain('actions:refresh_interval');
  });

  it('gives a value from All Layouts no button of its own, and no other layouts’ line', async () => {
    const editor = await mount({ view: 'grid', filter_duplicates: true });
    await changeField(editor, 'workspace:editing_workspace', 'column');
    await openPageOf(editor, 'content:filter_duplicates_mode');
    expect(pillOf(editor, 'content:filter_duplicates_mode')).toBe('From All Layouts');
    expect(
      $(editor, '[data-setting="content:filter_duplicates_mode"] .setting-pill-button'),
    ).toBeNull();
    // What only another layout offers is search's to name; the page's foot switches no scope.
    expect(
      editor.shadowRoot!.querySelector('[data-focus^="edit-layout:"], .other-layouts'),
    ).toBeNull();
  });

  it('names a layout’s own value in its row in All Layouts, its pill holding only Reset', async () => {
    const editor = await mount({
      view: 'grid',
      filter_duplicates: true,
      column: { filter_duplicates: false },
    });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await openPageOf(editor, 'content:filter_duplicates_mode');
    const id = 'content:filter_duplicates_mode';
    // A line of the head itself, under the name, so it is read with its own row.
    expect(
      $(editor, `[data-setting="${id}"] > .setting-head > .setting-own`)?.textContent?.trim(),
    ).toBe('Columns Has Its Own: Off');
    const menu = (await openPill(editor, id))!;
    expect(menu.querySelector('.setting-menu-note')).toBeNull();
    expect(
      [...menu.querySelectorAll('.line-button')].map((each) => each.getAttribute('data-focus')),
    ).toEqual([`reset:${id}`]);
  });

  it('draws a value held at a nested path', async () => {
    const editor = await mount({
      weather: { entity: 'weather.home', position: 'date', date: { color: '#ff0000' } },
    });
    await goPage(editor, 'weather');
    expect(pillOf(editor, 'weather:weather.date.color')).toBe('Set');
    expect($(editor, '[data-setting="weather:weather.date.color"] .field')).not.toBeNull();
    // Its neighbor at its default is folded to its head.
    expect(
      $(editor, '[data-setting="weather:weather.date.font_size"] .setting-toggle')?.getAttribute(
        'aria-expanded',
      ),
    ).toBe('false');
  });

  it.each([
    [{ view: 'column', column: { event_font_size: 14 } }, 'events:event_font_size'],
    [{ view: 'grid', time_grid: { time_font_size: 12 } }, 'events:time_font_size'],
  ] as const)(
    'draws a line the layout’s block holds, unitless at its default: %j',
    async (config, id) => {
      const editor = await mount(config);
      await openPageOf(editor, id);
      expect(live(editor)).toContain(id);
      // Settings For names the layout, so the pill says only that it is set.
      expect(pillOf(editor, id)).toBe('Set');
    },
  );

  it('draws what a calendar sets on its page open, and what it does not folded', async () => {
    const editor = await mount({ entities: [{ entity: 'calendar.anna', blocklist: 'Birthday' }] });
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect(pillOf(editor, 'calendar:blocklist')).toBe('Set');
    expect($(editor, '[data-setting="calendar:blocklist"] ha-form')).not.toBeNull();
    expect(
      $(editor, '[data-setting="calendar:allowlist"] .setting-toggle')?.getAttribute(
        'aria-expanded',
      ),
    ).toBe('false');
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
    expect(pillOf(editor, 'events:event_font_size')).toBe('From All Layouts');
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
    // The pill carries the words, outside the slider, which keeps its own label.
    expect(pillOf(editor, 'layout:time_grid.min_days_to_show')).toBe('Set');
    expect(
      $(
        editor,
        '[data-setting="layout:time_grid.min_days_to_show"] .setting-pill-button',
      )?.getAttribute('aria-label'),
    ).toBe('Fewest Day Columns: Set');
    expect(labelOf(editor, 'layout:time_grid.min_days_to_show')).toBe('Fewest Day Columns');
    // An event part is a chip (PR 18), named by its label and its words.
    await openPageOf(editor, 'events:show_location');
    expect(chipName(editor, 'events:show_location')).toBe('Location, Set');
    expect(group('events:show_location')).toBe('Location, Set');
  });

  it('draw no pill at a default, and mark a whole-card setting by its name instead', async () => {
    const id = 'content:first_day_of_week';
    const head = (editor: MountedEditor) => $(editor, `[data-setting="${id}"] > .setting-head`)!;
    const fresh = await mount({ view: 'grid' });
    await openPageOf(fresh, id);
    // "Default" is read, not drawn; the scope is a mark by the name, never a pill's words.
    expect(pillOf(fresh, id)).toBe('Default');
    expect(head(fresh).querySelector('.setting-pill')!.classList).toContain('visually-hidden');
    expect(head(fresh).querySelector('.setting-scope')?.getAttribute('aria-label')).toBe(
      'Whole Card',
    );

    const stored = await mount({ view: 'grid', first_day_of_week: 'monday' });
    await openPageOf(stored, id);
    expect(pillOf(stored, id)).toBe('Set');
    expect(head(stored).querySelector('.setting-pill')!.classList).not.toContain('visually-hidden');
    expect(head(stored).querySelector('.setting-scope')).not.toBeNull();
  });

  it('carry “Set” under All Layouts on a dropdown’s label, never naming the scope', async () => {
    const editor = await mount({ show_week_numbers: 'iso' });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await openPageOf(editor, 'day_header:week_number_mode');
    expect(pillOf(editor, 'day_header:week_number_mode')).toBe('Set');
    expect(labelOf(editor, 'day_header:week_number_mode')).toBe('Numbering');
  });

  it('read “Default” on every field Grid defaults differently while Grid stores nothing', async () => {
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
      // On its pill, or in a chip's name.
      const said = chipName(editor, field.id) ?? pillOf(editor, field.id) ?? '';
      if (!/(^|, )Default\b/.test(said)) wrong.push(field.id);
    }
    expect(wrong).toEqual([]);
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('name Reset for what it leaves, in its text and leading its name, and Reset leaves it', async () => {
    const editor = await mount({ view: 'grid', start_date: 'today+1', event_font_size: '14px' });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    const reset = $(editor, '[data-focus="reset:content:start_date_mode"]')!;
    expect(reset.textContent?.trim()).toBe('Reset (Today)');
    expect(reset.getAttribute('aria-label')).toBe('Reset Start Date to Today');
    // One short button: no mark, no outcome sentence beside it.
    const line = reset.closest('.field-line')!;
    expect(line.querySelector('.mark, .outcome')).toBeNull();
    expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('Reset (Today)');

    await click(editor, '[data-focus="reset:content:start_date_mode"]');
    expect(lastConfig(editor)).not.toHaveProperty('start_date');
  });

  it('words Reset by the value it leaves, Empty where none comes back, and names the setting', () => {
    const t = (key: string) => EDITOR_STRINGS[key];
    const word = (value: unknown) => (value === undefined ? 'Not Set' : String(value));
    expect(
      Shown.resetText('reset', { kind: 'default', value: 'off' }, 'Show Time', t, () => 'Off'),
    ).toEqual({ label: 'Reset (Off)', name: 'Reset Show Time to Off' });
    // Before, an empty default left "Reset gives the default," hanging on its comma.
    for (const value of [undefined, null, '', []]) {
      expect(Shown.resetText('reset', { kind: 'default', value }, 'Title', t, word)).toEqual({
        label: 'Reset (Empty)',
        name: 'Reset Title to Empty',
      });
    }
    expect(
      Shown.resetText('reset', { kind: 'default', value: 'x' }, 'Title', t, () => ' '),
    ).toEqual({ label: 'Reset (Empty)', name: 'Reset Title to Empty' });
    expect(Shown.resetText('reset', undefined, 'Label', t, word)).toEqual({
      label: 'Reset',
      name: 'Reset Label',
    });
  });

  it('words Remove by the setting it takes away, so it never reads as a Reset', () => {
    const t = (key: string) => EDITOR_STRINGS[key];
    const word = (value: unknown) => String(value);
    expect(
      Shown.resetText(
        'remove',
        { kind: 'layout-default', view: 'grid', value: 14 },
        'Event Font Size',
        t,
        word,
      ),
    ).toEqual({ label: 'Remove Setting', name: 'Remove Event Font Size and Reset It to 14' });
    expect(Shown.resetText('remove', undefined, 'Label', t, word)).toEqual({
      label: 'Remove Setting',
      name: 'Remove Label and Reset It',
    });
  });
});

describe('Reset and Remove', () => {
  it('keeps an essential field on Reset, with focus on its wrapper, in one undo step', async () => {
    const editor = await mount({ show_time: false });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await goPage(editor, 'events');
    // Show Time is a chip, reset with its group.
    const reset = $(editor, '[data-focus="reset-chips:parts"]')!;
    expect(reset.getAttribute('aria-label')).toBe('Reset Parts: Time');
    await click(editor, '[data-focus="reset-chips:parts"]');
    await editor.updateComplete;

    expect(lastConfig(editor)).not.toHaveProperty('show_time');
    expect(live(editor)).toContain('events:show_time');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-field')).toBe('events:show_time');
    await click(editor, '[data-focus="undo"]');
    expect(lastConfig(editor)?.show_time).toBe(false);
  });

  it('resets a family from its heading, every member in one step, and keeps them drawn', async () => {
    const card = { config_version: VERSION, entities: ['calendar.anna'], title: 'Family' };
    const editor = await mountEditor(card);
    await changeField(editor, 'content:compact_days_to_show', 2);
    await changeField(editor, 'content:compact_events_to_show', 3);
    const stored = lastConfig(editor)!;
    expect(live(editor)).toEqual(
      expect.arrayContaining(['content:compact_days_to_show', 'content:compact_events_to_show']),
    );
    const reset = $(editor, '[data-focus="remove-family:compact_mode"]')!;
    expect(reset.getAttribute('aria-label')).toBe('Reset Compact Mode');
    await click(editor, '[data-focus="remove-family:compact_mode"]');
    await editor.updateComplete;

    expect(lastConfig(editor)).toEqual(card);
    expect(pillOf(editor, 'content:compact_days_to_show')).toBe('Default');
    expect(said(editor)).toBe('Reset Compact Mode');
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
      ...editor.shadowRoot!.querySelectorAll(
        '.page-group[data-heading="description"] :is(.gate-line, .setting-gated)',
      ),
    ].map((line) => line.textContent!.replace(/\s+/g, ' ').trim());
    // In place, once: the stored value's line says nothing more about the condition.
    expect(lines[0]).toMatch(
      /^Appears once Description is pressed: Show Description For All-Day Events, /,
    );
    expect(lines.filter((line) => line.startsWith('Appears once'))).toHaveLength(1);
    expect(lines).toContain(
      'Stored but not in use: Description Font Size (20px), from All Layouts',
    );
    // No Reset here reaches All Layouts' value, so the line has no button; Settings For does.
    const line = $(editor, '[data-focus="inactive:events:description_font_size"]')!;
    expect(line.querySelector('button')).toBeNull();
  });
});

describe('the preferences in the overview header’s ⋯ menu', () => {
  it('offers no Show Every Setting: every page draws every setting', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ v: 1, every: false, yaml: false }));
    const editor = await mount();
    expect(await prefItem(editor, 'every')).toBeUndefined();
    expect(await prefItem(editor, 'yaml')).not.toBeUndefined();
    await goPage(editor, 'events');
    expect(live(editor)).toContain('events:time_font_size');
  });

  it('is a menu button the keyboard opens, walks and closes, with focus back on the button', async () => {
    const editor = await mount();
    const root = editor.shadowRoot!;
    const button = root.querySelector<HTMLElement>('[data-focus="prefs-menu"]')!;
    // At the end of the search row, after Undo and Redo.
    const row = [...root.querySelectorAll<HTMLElement>('.search-row button')];
    expect(row.indexOf(button)).toBe(row.length - 1);
    expect(button.getAttribute('aria-label')).toBe('Editor Preferences');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.menu')).toBeNull();

    const key = async (target: Element, name: string): Promise<void> => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, bubbles: true, composed: true }),
      );
      await editor.updateComplete;
      await editor.updateComplete;
    };
    button.focus();
    await key(button, 'ArrowDown');
    const menu = root.querySelector<HTMLElement>('.menu')!;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(menu.id);
    expect(menu.getAttribute('role')).toBe('menu');
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
    // Its item is named by its label and described by the line under it.
    const named = (item: HTMLElement, attribute: string): string =>
      root.getElementById(item.getAttribute(attribute)!)!.textContent!.trim();
    expect(items.map((item) => named(item, 'aria-labelledby'))).toEqual(['Show YAML Option Names']);
    expect(named(items[0], 'aria-describedby')).toMatch(/option name/);
    expect(root.activeElement).toBe(items[0]);
    await key(items[0], 'ArrowDown');
    expect(root.activeElement).toBe(items[0]);
    // Pressing the item turns it over and leaves the menu open on it.
    items[0].click();
    await editor.updateComplete;
    expect(root.querySelector('[data-pref="yaml"]')!.getAttribute('aria-checked')).toBe('true');
    await key(root.querySelector('[data-pref="yaml"]')!, 'Escape');
    expect(root.querySelector('.menu')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(root.activeElement).toBe(button);
    // Escape closed the menu only: the overview is still there, and nothing was written.
    expect(root.querySelector('.overview')).not.toBeNull();
    expect(lastConfig(editor)).toBeUndefined();
    await key(button, 'ArrowUp');
    expect(root.activeElement).toBe(root.querySelector('[data-pref="yaml"]'));
  });

  it('Show YAML Option Names puts each setting’s option, where this scope writes it, first', async () => {
    const editor = await mount({ event_font_size: '30px' });
    await togglePref(editor, 'yaml');
    await openPageOf(editor, 'events:event_font_size');
    expect(helperOf(editor, 'events:event_font_size')).toMatch(/^YAML: list\.event_font_size\b/);
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

  it('opens a setting on one calendar’s page, and leaves another calendar’s folded', async () => {
    const editor = await mount({ entities: ['calendar.anna', 'calendar.ben'] });
    const [anna, ben] = keysOf(editor, 'entry');
    const expanded = () =>
      $(editor, '[data-setting="calendar:replace_pattern"] .setting-toggle')?.getAttribute(
        'aria-expanded',
      );
    await goEntry(editor, anna);
    await click(editor, '[data-setting="calendar:replace_pattern"] .setting-toggle');
    expect(expanded()).toBe('true');
    await goEntry(editor, ben);
    expect(expanded()).toBe('false');
  });

  it('forgets what was opened on a calendar once the YAML replaces it from outside', async () => {
    const editor = await mount();
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    await click(editor, '[data-setting="calendar:show_description"] .setting-toggle');
    expect($(editor, '[data-setting="calendar:show_description"] ha-form')).not.toBeNull();
    editor.setConfig({ config_version: VERSION, entities: ['calendar.ben'] });
    await editor.updateComplete;
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect($(editor, '[data-setting="calendar:show_description"] ha-form')).toBeNull();
  });
});

describe('a helper shown once', () => {
  it('keeps a color’s helper behind its ⓘ alone, never under its control as well', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    const id = 'events:now_color';
    await click(editor, `[data-setting="${id}"] .setting-toggle`);
    const setting = $(editor, `[data-setting="${id}"]`)!;
    expect(setting.querySelector('.color-field')).not.toBeNull();
    const helper = EDITOR_STRINGS['now_color.helper'];
    const shown = (): number =>
      [...setting.querySelectorAll<HTMLElement>('.hint')].filter(
        (hint) => !hint.hidden && hint.textContent?.trim() === helper,
      ).length;
    expect(shown()).toBe(0);
    await click(editor, `[data-setting="${id}"] .setting-info`);
    expect(shown()).toBe(1);
  });

  it('does the same for a calendar’s own color', async () => {
    const editor = await mount();
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    const id = 'calendar:accent_color_mode';
    const setting = $(editor, `[data-setting="${id}"]`)!;
    expect(setting.querySelector('.color-field')).not.toBeNull();
    const helper = EDITOR_STRINGS['entity.accent_color_mode.helper'];
    const shown = (): number =>
      [...setting.querySelectorAll<HTMLElement>('.hint')].filter(
        (hint) => !hint.hidden && hint.textContent?.trim() === helper,
      ).length;
    expect(shown()).toBe(0);
    await click(editor, `[data-setting="${id}"] .setting-info`);
    expect(shown()).toBe(1);
  });
});

describe('an open pill', () => {
  it('closes on Escape, focus back on its pill, and does not stay open on the next page', async () => {
    const editor = await mount({ event_font_size: '30px' });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await goPage(editor, 'events');
    const id = 'events:event_font_size';
    const menu = (await openPill(editor, id))!;
    const reset = menu.querySelector<HTMLElement>('.line-button')!;
    reset.focus();
    reset.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    await editor.updateComplete;
    await editor.updateComplete;
    expect($(editor, '.setting-menu')).toBeNull();
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-focus')).toBe(`pill:${id}`);
    expect($(editor, '.page[data-page="events"]')).not.toBeNull();

    await openPill(editor, id);
    await goPage(editor, 'day_header');
    await goPage(editor, 'events');
    expect($(editor, '.setting-menu')).toBeNull();
  });
});

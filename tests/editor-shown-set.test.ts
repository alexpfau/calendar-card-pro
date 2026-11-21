/**
 * Show what applies (backlog item 307): each page draws what applies here and is essential,
 * stored, inherited with a value that differs, or added this session; the rest of each heading
 * waits in its Add row, named; what a gate withholds is named in its gate line, with any value
 * stored for it all the same; and each field says where its value comes from, with Reset or
 * Remove beside it.
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
  editLayout,
  factsOf,
  fakeHass,
  formsOf,
  goEntry,
  goPage,
  helperOf,
  keysOf,
  labelOf,
  lastConfig,
  lineOf,
  mountEditor,
  openPageOf,
  prefItem,
  stateWordOf,
  togglePref,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as View from '../src/config/view';
import { type FieldId, buildFieldIndex, schemaCtx } from '../src/rendering/editor/field-index';
import { corpus } from '../src/rendering/editor/gates';
import { type Appearance, PAGES, placementOf } from '../src/rendering/editor/pages';
import { keepsControl, storedAt } from '../src/rendering/editor/plan';
import { PREFS_KEY } from '../src/rendering/editor/prefs';
import * as Reset from '../src/rendering/editor/reset';
import * as Shown from '../src/rendering/editor/shown';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { EDITOR_LANGUAGE_STRINGS } from '../src/rendering/editor/translations';
import { toStoredConfig } from '../src/rendering/editor/value';
import { WORKSPACES } from '../src/rendering/editor/workspace';

const VERSION = Config.CURRENT_CONFIG_VERSION;

/** Each card field's appearance in the registry. */
const APPEARANCE = new Map<FieldId, Appearance>([
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

/**
 * Opens a setting folded to its head, as a user would, and waits for the render.
 *
 * @param editor - The editor
 * @param id - The setting
 */
async function open(editor: MountedEditor, id: FieldId): Promise<void> {
  const toggle = $(editor, `[data-setting="${id}"] .setting-toggle`);
  if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
  await editor.updateComplete;
}

/**
 * What a screen reader hears for an open setting's group: its name, then its description, the
 * text of each element its `aria-describedby` names joined with a space as accessible-name
 * computation joins them, so nothing between two parts ends a sentence that the parts do not.
 *
 * @param editor - The editor
 * @param id - The setting
 * @returns Its name, its description (undefined where it names none), and whether any element it
 *   is described by is or holds a button
 */
function spoken(
  editor: MountedEditor,
  id: FieldId,
): { name: string; description: string | undefined; pressable: boolean } {
  const wrapper = $(editor, `.setting > .field[role="group"][data-field="${id}"]`);
  if (wrapper === null) throw new Error(`No open setting draws ${id}`);
  const named = (wrapper.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((each) => editor.shadowRoot!.getElementById(each));
  expect(named).not.toContain(null);
  return {
    name: wrapper.getAttribute('aria-label') ?? '',
    description:
      named.length === 0
        ? undefined
        : named.map((each) => each!.textContent!.replace(/\s+/g, ' ').trim()).join(' '),
    pressable: named.some(
      (each) => each!.closest('button') !== null || each!.querySelector('button') !== null,
    ),
  };
}

/**
 * Opens every folded setting on the open page and checks each open setting's group as a screen
 * reader hears it: named with its visible name, then the facts under it and its "Default", each a
 * phrase of its own; described by its helper behind ⓘ and nothing else.
 *
 * @param editor - The editor
 * @returns How many groups it checked, how many of them had facts or a helper, and their kinds
 */
async function openSettingsSpoken(
  editor: MountedEditor,
): Promise<{ checked: number; withFacts: number; withHelp: number; kinds: string[] }> {
  for (const toggle of editor.shadowRoot!.querySelectorAll<HTMLElement>(
    '.setting-toggle[aria-expanded="false"]',
  )) {
    toggle.click();
  }
  await editor.updateComplete;
  const counts = { checked: 0, withFacts: 0, withHelp: 0, kinds: [] as string[] };
  for (const wrapper of editor.shadowRoot!.querySelectorAll<HTMLElement>(
    '.setting > .field[role="group"][data-field]',
  )) {
    const id = wrapper.dataset.field as FieldId;
    const setting = wrapper.closest('.setting')!;
    const facts = [
      ...setting.querySelectorAll(':scope > .setting-head .setting-facts > .fact'),
    ].map((fact) => fact.textContent!.replace(/\s+/g, ' ').trim());
    const quiet = setting.querySelector(':scope > .setting-head > .setting-state.visually-hidden');
    const help = setting.querySelector(':scope > .setting-help')?.textContent?.trim();
    const label = setting.querySelector(':scope > .setting-head .setting-label');
    const { name, description } = spoken(editor, id);
    // A switch's head is Home Assistant's row, which draws no label of the editor's.
    if (label !== null) {
      expect(name, id).toBe(
        [label.textContent!.trim(), ...facts, ...(quiet ? [quiet.textContent!.trim()] : [])].join(
          ', ',
        ),
      );
    }
    expect(description, id).toBe(help);
    counts.checked += 1;
    if (facts.length > 0) counts.withFacts += 1;
    if (help !== undefined) counts.withHelp += 1;
    counts.kinds.push(
      id === 'calendar:visibility'
        ? id
        : wrapper.classList.contains('color-field')
          ? 'color'
          : wrapper.querySelector('ha-form') !== null
            ? 'form'
            : 'other',
    );
  }
  return counts;
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
      .filter(([id, appearance]) => present.has(id) && appearance !== 'reference');
    // Every setting that applies is drawn: as a chip, or under a head row of its own, except a
    // color's value, which its mode's control holds. A reference, Time Format's, opens its home.
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
    expect(stateWordOf(editor, id)).toBe('Set');

    // Reset is a button in plain view after Set, named for what it leaves.
    const menu = lineOf(editor, id)!;
    const reset = menu.querySelector<HTMLButtonElement>(`[data-focus="reset:${id}"]`)!;
    expect(reset.textContent?.trim()).toMatch(/^Reset \(/);
    expect(reset.getAttribute('aria-label')).toMatch(/^Reset Time Font Size to /);
    reset.click();
    await editor.updateComplete;

    expect(lastConfig(editor)).toEqual(card);
    expect(stateWordOf(editor, id)).toBe('Default');
    expect($(editor, `[data-setting="${id}"] [data-reset-keys]`)).toBeNull();
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
    // Described by its helper alone; its facts are in its name (the test below).
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

  it('names an open setting with the facts under its name and describes it by its helper alone', async () => {
    // At its default with a helper: the "Default" a screen reader hears is in the name, so the
    // helper that follows is never read as part of it ("Default Large makes them bigger…").
    const editor = await mount({
      view: 'list',
      title: 'Family',
      event_font_size: '20px',
      toolbar: { show: true },
    });
    await goPage(editor, 'card_header');
    await open(editor, 'card:toolbar.size');
    expect(spoken(editor, 'card:toolbar.size')).toEqual({
      name: 'Arrow & Chip Size, Default',
      description: 'Large makes them bigger and easier to tap on a touch screen.',
      pressable: false,
    });
    // Stored here: Set, then the helper as a sentence of its own; its Reset is in neither.
    expect(spoken(editor, 'card:title')).toEqual({
      name: 'Title, Set',
      description: helperOf(editor, 'card:title'),
      pressable: false,
    });
    expect(helperOf(editor, 'card:title')).toMatch(/^Text with/);
    expect(lineOf(editor, 'card:title')!.querySelector('button')).not.toBeNull();

    // Two facts, each its own phrase in the name, and no helper to describe it.
    await goPage(editor, 'events');
    await open(editor, 'events:accent_color_mode');
    expect(spoken(editor, 'events:accent_color_mode')).toEqual({
      name: 'Accent Color, Whole Card, Default',
      // A color is composed, so its helper is read where it is drawn, behind ⓘ.
      description: $(
        editor,
        '[data-setting="events:accent_color_mode"] > .setting-help',
      )!.textContent!.trim(),
      pressable: false,
    });
    // A Layout Defaults value on a List topic: where the value comes from, and no description.
    const id = 'events:event_font_size';
    await open(editor, id);
    expect(factsOf(editor, id)).toEqual(['From Layout Defaults']);
    expect(spoken(editor, id)).toEqual({
      name: 'Event Font Size, From Layout Defaults',
      description: undefined,
      pressable: false,
    });
    // Stored here: Set, and Reset beside it stays out.
    await changeField(editor, id, '22px');
    expect(spoken(editor, id)).toEqual({
      name: 'Event Font Size, Set',
      description: undefined,
      pressable: false,
    });
    expect(lineOf(editor, id)!.querySelector('button')).not.toBeNull();
  });

  it.each([
    ['de', 'Pfeil- und Chipgröße, Standard'],
    ['ja', '矢印とチップのサイズ, デフォルト'],
  ])('keeps the facts and the helper apart in %s', async (language, name) => {
    const editor = await mountEditor(
      {
        config_version: VERSION,
        entities: ['calendar.anna'],
        view: 'list',
        toolbar: { show: true },
      },
      { hass: fakeHass({ language }) },
    );
    await goPage(editor, 'card_header');
    await open(editor, 'card:toolbar.size');
    const help = $(editor, '[data-setting="card:toolbar.size"] .setting-help')!.textContent!.trim();
    expect(help).not.toBe(EDITOR_STRINGS['toolbar.size.helper']);
    expect(spoken(editor, 'card:toolbar.size')).toEqual({
      name,
      description: help,
      pressable: false,
    });
  });

  it.each(['en', ...Object.keys(EDITOR_LANGUAGE_STRINGS)])(
    'reads each open setting’s facts in its name and its helper alone as its description in %s',
    async (language) => {
      const editor = await mountEditor(
        {
          config_version: VERSION,
          entities: ['calendar.anna'],
          view: 'month',
          title: 'Family',
          event_font_size: '20px',
          toolbar: { show: true },
        },
        { hass: fakeHass({ language }) },
      );
      let checked = 0;
      let withFacts = 0;
      let withHelp = 0;
      for (const page of ['card_header', 'events']) {
        await goPage(editor, page);
        const counts = await openSettingsSpoken(editor);
        checked += counts.checked;
        withFacts += counts.withFacts;
        withHelp += counts.withHelp;
      }
      // Enough open settings, with facts and with helpers, that the loop proves something.
      expect(checked).toBeGreaterThan(15);
      expect(withFacts).toBeGreaterThan(2);
      expect(withHelp).toBeGreaterThan(5);
    },
  );

  it('names a calendar’s open settings with their facts and describes them by their help alone', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: [
        { entity: 'calendar.anna', accent_color: '#e57373', label: 'A', show_time: false },
      ],
      view: 'list',
    });
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    const counts = await openSettingsSpoken(editor);
    // A calendar's color, its ordinary forms and Who Sees It, each with facts and with a helper.
    expect(counts.kinds).toEqual(expect.arrayContaining(['color', 'form', 'calendar:visibility']));
    expect(counts.withFacts).toBeGreaterThan(2);
    expect(counts.withHelp).toBeGreaterThan(2);
    expect(spoken(editor, 'calendar:accent_color_mode')).toEqual({
      name: 'Accent Color, Set',
      description: $(
        editor,
        '[data-setting="calendar:accent_color_mode"] > .setting-help',
      )!.textContent!.trim(),
      pressable: false,
    });
    expect(spoken(editor, 'calendar:label').name).toBe('Label, Set');
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
    expect(stateWordOf(editor, 'events:event_font_size')).toBe('From Layout Defaults');
    // Nothing here resets it, so it offers no Reset.
    expect($(editor, '[data-setting="events:event_font_size"] [data-reset-keys]')).toBeNull();
    await goPage(editor, 'taps_refresh');
    expect(live(editor)).toContain('actions:refresh_interval');
  });

  it('gives a value from All Layouts no button of its own, and no other layouts’ line', async () => {
    const editor = await mount({ view: 'grid', filter_duplicates: true });
    await editLayout(editor, 'column');
    await openPageOf(editor, 'content:filter_duplicates_mode');
    expect(stateWordOf(editor, 'content:filter_duplicates_mode')).toBe('From Layout Defaults');
    expect(
      $(editor, '[data-setting="content:filter_duplicates_mode"] [data-reset-keys]'),
    ).toBeNull();
    // What only another layout offers is search's to name; the page's foot switches no scope.
    expect(
      editor.shadowRoot!.querySelector('[data-focus^="edit-layout:"], .other-layouts'),
    ).toBeNull();
  });

  it('names a layout’s own value under the name in All Layouts, Reset after Set', async () => {
    const editor = await mount({
      view: 'grid',
      filter_duplicates: true,
      column: { filter_duplicates: false },
    });
    await editLayout(editor, 'shared');
    await openPageOf(editor, 'content:filter_duplicates_mode');
    const id = 'content:filter_duplicates_mode';
    // A line of the head itself, under the name, so it is read with its own row.
    expect(factsOf(editor, id)).toEqual(['Set', 'Columns Has Its Own: Off']);
    // Reset follows Set, before the layout's own line.
    const line = lineOf(editor, id)!;
    expect(
      [...line.children].map(
        (each) => each.getAttribute('data-focus') ?? each.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Set', `reset:${id}`, 'Columns Has Its Own: Off']);
  });

  it('draws a value held at a nested path', async () => {
    const editor = await mount({
      weather: { entity: 'weather.home', position: 'date', date: { color: '#ff0000' } },
    });
    await goPage(editor, 'weather');
    expect(stateWordOf(editor, 'weather:weather.date.color')).toBe('Set');
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
      // The page's title names the layout, so the fact says only that it is set.
      expect(stateWordOf(editor, id)).toBe('Set');
    },
  );

  it('draws what a calendar sets on its page open, and what it does not folded', async () => {
    const editor = await mount({ entities: [{ entity: 'calendar.anna', blocklist: 'Birthday' }] });
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    expect(stateWordOf(editor, 'calendar:blocklist')).toBe('Set');
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
    expect(chipName(editor, 'events:show_location')).toBe('Location, From Layout Defaults');
    expect(stateWordOf(editor, 'events:event_font_size')).toBe('From Layout Defaults');
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
    // The facts carry the words, outside the slider, which keeps its own label.
    expect(stateWordOf(editor, 'layout:time_grid.min_days_to_show')).toBe('Set');
    expect(labelOf(editor, 'layout:time_grid.min_days_to_show')).toBe('Down To');
    // An event part is a chip, named by its label and its words.
    await openPageOf(editor, 'events:show_location');
    expect(chipName(editor, 'events:show_location')).toBe('Location, Set');
    expect(group('events:show_location')).toBe('Location, Set');
  });

  it('draw nothing at a default, and say a whole-card setting’s scope in words', async () => {
    // A whole-card setting drawn on a layout's topic, as the day's colors are.
    const id = 'day_header:weekday_color';
    const head = (editor: MountedEditor) => $(editor, `[data-setting="${id}"] > .setting-head`)!;
    const fresh = await mount({ view: 'grid' });
    await openPageOf(fresh, id);
    // "Default" is read, not drawn; the scope is words under the name, and nothing is pressable.
    expect(stateWordOf(fresh, id)).toBe('Default');
    expect(head(fresh).querySelector('.setting-state')!.classList).toContain('visually-hidden');
    expect(factsOf(fresh, id)).toEqual(['Whole Card']);
    expect(head(fresh).querySelectorAll('.setting-facts button')).toHaveLength(0);

    const stored = await mount({ view: 'grid', weekday_color: '#c62828' });
    await openPageOf(stored, id);
    expect(stateWordOf(stored, id)).toBe('Set');
    expect(factsOf(stored, id)).toEqual(['Set', 'Whole Card']);
    expect($(stored, `[data-setting="${id}"] [data-reset-keys]`)).not.toBeNull();
  });

  it('carry “Set” under All Layouts on a dropdown’s label, never naming the scope', async () => {
    const editor = await mount({ show_week_numbers: 'iso' });
    await editLayout(editor, 'shared');
    await openPageOf(editor, 'day_header:week_number_mode');
    expect(stateWordOf(editor, 'day_header:week_number_mode')).toBe('Set');
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
      const said = chipName(editor, field.id) ?? stateWordOf(editor, field.id) ?? '';
      if (!/(^|, )Default\b/.test(said)) wrong.push(field.id);
    }
    expect(wrong).toEqual([]);
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('name Reset for what it leaves, in its text and leading its name, and Reset leaves it', async () => {
    const editor = await mount({ view: 'grid', start_date: 'today+1', event_font_size: '14px' });
    await editLayout(editor, 'shared');
    await openPageOf(editor, 'content:start_date_mode');
    const reset = $(editor, '[data-focus="reset:content:start_date_mode"]')!;
    expect(reset.textContent?.trim()).toBe('Reset (Today)');
    expect(reset.getAttribute('aria-label')).toBe('Reset Start Date to Today');
    // One short button right after Set, among the facts: no mark, no outcome sentence beside it.
    // At home on a Whole Card page, nothing says Whole Card.
    const line = reset.closest('.setting-facts')!;
    expect(line.querySelector('.mark, .outcome')).toBeNull();
    expect([...line.children].map((each) => each.textContent?.replace(/\s+/g, ' ').trim())).toEqual(
      ['Set', 'Reset (Today)'],
    );

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
    await editLayout(editor, 'shared');
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
    expect(stateWordOf(editor, 'content:compact_days_to_show')).toBe('Default');
    expect(said(editor)).toBe('Reset Compact Mode');
    // One step: Undo brings both back.
    await click(editor, '[data-focus="undo"]');
    expect(lastConfig(editor)).toEqual(stored);
  });

  // Weekend Colors holds Grid's weekend shading after its members: a day's background, so the
  // family's Reset, named for the family, leaves it as it is.
  it('resets Weekend Colors without the Grid shading under the same heading', async () => {
    const card = {
      config_version: VERSION,
      entities: ['calendar.anna'],
      view: 'grid',
      time_grid: { weekend_background_color: '#eeeeee' },
      weekend_day_color: '#ff0000',
    };
    const editor = await mountEditor(card);
    await openPageOf(editor, 'day_header:weekend_day_color');
    await click(editor, '[data-focus="remove-family:weekend_colors"]');
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual({
      config_version: VERSION,
      entities: ['calendar.anna'],
      view: 'grid',
      time_grid: { weekend_background_color: '#eeeeee' },
    });
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
    // Every scope walked, Month's included.
    expect(WORKSPACES.length).toBe(5);
    // Over a second in a full local run; the limit is set for CI's slower runner under load
    // rather than for a hang.
  }, 30_000);
});

describe('gate lines and stored values not in use', () => {
  it('says Off with Turn On in place of the gate line, then each stored value with its Reset', async () => {
    const editor = await mount({
      show_description: false,
      show_description_allday: true,
      description_font_size: '20px',
      description_color: '#ff0000',
      description_icon_size: '18px',
      description_max_lines: 2,
    });
    await editLayout(editor, 'shared');
    await goPage(editor, 'events');
    const group = $(editor, '.page-group[data-heading="description"]')!;
    expect(group.classList.contains('off-group')).toBe(true);
    const row = group.querySelector('.heading-row')!;
    expect(row.querySelector('.heading')?.textContent).toBe('Description');
    expect(row.querySelector('.heading-state')?.textContent).toBe('Off');
    expect(row.querySelector('button')?.textContent?.trim()).toBe('Turn On');
    // Every setting is stored, so nothing waits unstored and there is no line naming them.
    expect(group.querySelector('.gate-summary')).toBeNull();
    const lines = [...group.querySelectorAll('.gate-line')].map((line) =>
      line.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(lines).toEqual([
      'Stored but not in use: Show Description For All-Day Events (On) Reset',
      'Stored but not in use: Description Font Size (20px) Reset',
      'Stored but not in use: Description Color (#ff0000) Reset',
      'Stored but not in use: Description Icon Size (18px) Reset',
      'Stored but not in use: Description Line Limit (2) Reset',
    ]);
  });

  it('names what waits once, without the part’s own word, and the stored value from All Layouts', async () => {
    const editor = await mount({ show_description: false, description_font_size: '20px' });
    await goPage(editor, 'events');
    const group = $(editor, '.page-group[data-heading="description"]')!;
    expect(group.querySelector('.gate-summary')?.textContent).toBe(
      'Show Description For All-Day Events · Color · Icon Size · Line Limit',
    );
    expect(group.querySelectorAll('.setting-gated')).toHaveLength(0);
    expect(
      [...group.querySelectorAll('.gate-line')].map((line) =>
        line.textContent!.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Stored but not in use: Description Font Size (20px), from Layout Defaults']);
    // No Reset here reaches Layout Defaults' value, so the line has no button; its page does.
    const line = $(editor, '[data-focus="inactive:events:description_font_size"]')!;
    expect(line.querySelector('button')).toBeNull();
  });
});

describe('names a part’s settings wait on', () => {
  it('never drops the part’s word where it ends a name, as a preposition governs it there', async () => {
    const editor = await mount({ language: 'nb', show_location: false });
    await goPage(editor, 'events');
    const summary = $(editor, '.page-group[data-heading="location"] .gate-summary')!.textContent!;
    expect(summary.split(' · ')).toContain('Linjegrense for sted');
    expect(summary.split(' · ')).not.toContain('Linjegrense for');
  });
});

describe('a heading with nothing to edit', () => {
  const turnOns = (editor: MountedEditor): Array<[string, string | null]> =>
    [...editor.shadowRoot!.querySelectorAll<HTMLElement>('[data-focus^="turn-on:"]')].map(
      (each) => [each.textContent!.trim(), each.getAttribute('aria-label')],
    );

  it('turns its part on in the scope shown, as the chip would, in one undo step', async () => {
    const editor = await mount({ show_location: false });
    await editLayout(editor, 'list');
    await goPage(editor, 'events');
    expect(turnOns(editor)).toContainEqual(['Turn On', 'Turn On Location']);
    await click(editor, '[data-focus="turn-on:events:show_location"]');
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual({
      config_version: VERSION,
      entities: ['calendar.anna'],
      show_location: false,
      list: { show_location: true },
    });
    const group = $(editor, '.page-group[data-heading="location"]')!;
    expect(group.classList.contains('off-group')).toBe(false);
    expect(group.querySelector('[data-field="events:location_font_size"]')).not.toBeNull();
    // The button left with the Off: focus is on the heading it stood beside.
    expect(editor.shadowRoot!.activeElement).toBe(group.querySelector('.heading'));
    expect($(editor, '[data-focus="undo"]')?.getAttribute('aria-label')).toBe(
      'Undo: Change Show Location',
    );
  });

  it('names each button by its part where a heading waits on two', async () => {
    const editor = await mount({ show_countdown: false, show_progress_bar: false });
    await editLayout(editor, 'shared');
    await goPage(editor, 'events');
    const group = $(editor, '.page-group[data-heading="progress"]');
    expect(group?.classList.contains('off-group')).toBe(true);
    expect(
      [...group!.querySelectorAll<HTMLElement>('.heading-row .line-button')].map((each) => [
        each.textContent!.trim(),
        each.getAttribute('aria-label'),
      ]),
    ).toEqual([
      ['Turn On Countdown', 'Turn On Countdown'],
      ['Turn On Progress Bar', 'Turn On Progress Bar'],
    ]);
  });

  it('says No Entity on weather headings until an entity is chosen, and goes to its picker', async () => {
    const editor = await mount();
    await goPage(editor, 'weather');
    const groups = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.off-group')];
    expect(groups.map((group) => group.querySelector('.heading-state')?.textContent)).toEqual([
      'No Entity',
      'No Entity',
    ]);
    const choose = groups.map((group) => group.querySelector<HTMLElement>('.heading-row button')!);
    expect(choose.map((each) => each.textContent!.trim())).toEqual([
      'Choose Weather Entity',
      'Choose Weather Entity',
    ]);
    // Two buttons on one page, named apart by their heading.
    expect(choose.map((each) => each.getAttribute('aria-label'))).toEqual([
      'Choose Weather Entity for In the Day Header',
      'Choose Weather Entity for Beside Each Event',
    ]);
    choose[1].click();
    await editor.updateComplete;
    await editor.updateComplete;
    expect($(editor, '.jump [data-field="weather:weather_entity"]')).not.toBeNull();
  });

  it('keeps its gate line where it waits on anything but a part or a weather entity', async () => {
    const editor = await mount({ weather: { entity: 'weather.home', position: 'date' } });
    await goPage(editor, 'weather');
    const group = $(editor, '.page-group[data-heading="weather.event"]');
    expect(group?.classList.contains('off-group')).toBe(false);
    expect(group?.querySelector('.setting-gated, .gate-line')?.textContent).toMatch(
      /Appears once the forecast shows beside events/,
    );
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

  it('closes on a second press of its button, where the press takes no focus as in Safari', async () => {
    const editor = await mount();
    const root = editor.shadowRoot!;
    const button = root.querySelector<HTMLElement>('[data-focus="prefs-menu"]')!;
    /** A press as Safari makes it: focus leaves the menu for nowhere unless the press keeps it. */
    const press = async (): Promise<void> => {
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true });
      button.dispatchEvent(down);
      if (!down.defaultPrevented) {
        (root.activeElement as HTMLElement | null)?.blur();
        await editor.updateComplete;
      }
      button.click();
      await editor.updateComplete;
    };
    await press();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(root.activeElement).toBe(root.querySelector('[data-pref="yaml"]'));
    await press();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('.menu')).toBeNull();
    expect(root.activeElement).toBe(button);
    await press();
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('draws its item’s state as a box, empty while off and checked while on', async () => {
    const editor = await mount();
    const root = editor.shadowRoot!;
    root.querySelector<HTMLElement>('[data-focus="prefs-menu"]')!.click();
    await editor.updateComplete;
    const item = () => root.querySelector<HTMLElement>('[data-pref="yaml"]')!;
    const box = () => item().querySelector('.menu-check')!;
    expect(item().getAttribute('aria-checked')).toBe('false');
    expect(box().classList.contains('checked')).toBe(false);
    expect(box().querySelector('svg')).toBeNull();
    item().click();
    await editor.updateComplete;
    expect(item().getAttribute('aria-checked')).toBe('true');
    expect(box().classList.contains('checked')).toBe(true);
    expect(box().querySelector('svg')).not.toBeNull();
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
  it('keeps focus in the editor after a Remove of a mode value', async () => {
    const editor = await mount({ start_date: '2026-11-15' });
    await editLayout(editor, 'shared');
    await openPageOf(editor, 'content:start_date_mode');
    expect(live(editor)).toContain('content:start_date_fixed');
    $(editor, '[data-focus="remove:content:start_date_fixed"]')!.focus();
    await click(editor, '[data-focus="remove:content:start_date_fixed"]');
    await editor.updateComplete;
    expect(live(editor)).not.toContain('content:start_date_fixed');
    // On its page, focus goes to its heading, which stays.
    const focused = editor.shadowRoot!.activeElement;
    expect(focused?.isConnected).toBe(true);
    expect(focused?.textContent?.trim()).toBe('Which Events');
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

describe('a stored setting', () => {
  it('never folds, and offers its Reset in plain view, one press away', async () => {
    const editor = await mount({ event_font_size: '30px' });
    await editLayout(editor, 'shared');
    await goPage(editor, 'events');
    const id = 'events:event_font_size';
    // No toggle to open first: a setting holding a value is drawn open.
    expect($(editor, `[data-setting="${id}"] .setting-toggle`)).toBeNull();
    const reset = lineOf(editor, id)!.querySelector<HTMLButtonElement>(
      `[data-focus="reset:${id}"]`,
    )!;
    expect(reset.getAttribute('aria-label')).toMatch(/^Reset Event Font Size to /);
    reset.click();
    await editor.updateComplete;
    expect(lastConfig(editor)).not.toHaveProperty('event_font_size');
  });

  it('puts a switch’s Reset after Set under its row, not inside Home Assistant’s', async () => {
    const editor = await mount({ scroll_long_titles: true });
    await editLayout(editor, 'shared');
    await goPage(editor, 'events');
    const id = 'events:scroll_long_titles';
    const setting = $(editor, `[data-setting="${id}"]`)!;
    expect(setting.querySelector('.setting-head.switch')).not.toBeNull();
    expect(setting.querySelector('.setting-control [data-reset-keys]')).toBeNull();
    expect(lineOf(editor, id)?.querySelector('[data-reset-keys]')).not.toBeNull();
    expect(setting.querySelector(':scope > .field-line [data-reset-keys]')).toBeNull();
    expect(factsOf(editor, id)[0]).toBe('Set');
  });

  it('names a calendar’s three-way option by its words in Reset’s name, never its stored value', async () => {
    const editor = await mountEditor({
      config_version: Config.CURRENT_CONFIG_VERSION,
      show_location: false,
      entities: [{ entity: 'calendar.anna', show_location: true }],
    });
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    const reset = lineOf(editor, 'calendar:show_location')!.querySelector<HTMLButtonElement>(
      '[data-reset-keys]',
    )!;
    // The calendar goes back to following the card, which hides locations.
    expect(reset.textContent?.trim()).not.toMatch(/false|true/);
    expect(reset.getAttribute('aria-label')).not.toMatch(/false|true/);
  });

  it('presses nothing among its facts but Reset or Remove, right after Set', async () => {
    const editor = await mount({
      view: 'grid',
      event_font_size: '15px',
      list: { event_font_size: '16px' },
    });
    await editLayout(editor, 'shared');
    await goPage(editor, 'events');
    const facts = [...editor.shadowRoot!.querySelectorAll('.setting-facts')];
    expect(facts.length).toBeGreaterThan(0);
    let resets = 0;
    for (const each of facts) {
      // A fact is words: nothing in one presses.
      expect(each.querySelector('.fact button, .fact a, .fact [tabindex]')).toBeNull();
      for (const pressable of each.querySelectorAll('button, a, [tabindex]')) {
        expect(
          pressable.matches(
            '.line-button[data-focus^="reset:"], .line-button[data-focus^="remove:"]',
          ),
        ).toBe(true);
        // It follows Set where a fact says Set, and leads where none does.
        const before = pressable.previousElementSibling;
        if (each.querySelector('.fact-set')) expect(before?.classList).toContain('fact-set');
        else expect(before).toBeNull();
        resets++;
      }
    }
    expect(resets).toBeGreaterThan(0);
  });
});

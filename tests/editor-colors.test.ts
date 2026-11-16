/**
 * The composed color control (backlog item 307, D13; the plan's section 5.9).
 *
 * Every color field is one control: its own rows, Home Assistant's named swatches and Custom, whose
 * text is written only once it is a color the card can draw. What is reconciled here, and how:
 *
 * - **Which fields are colors** is derived, never listed: `schemas/common.ts` › `color` marks the
 *   nodes it builds. Every field any workspace's corpus builds, and every field an entry declares,
 *   whose name ends in `color` must carry the mark, and so must every key of `Types.Config` and
 *   `Types.EntityConfig` ending in `color` that has a field, read from source.
 * - **What a value means** (`choiceOf`, `describeColor`, `validColor`) round-trips through the
 *   values each row and swatch writes.
 * - **What the control writes** is checked on the mounted editor, through its own rows, swatches
 *   and Custom text, as a user picks them: drafts, their destination, owners and undo steps.
 *
 * happy-dom's `CSS.supports` answers yes to anything, so each mounted test stubs it with one that
 * rejects text a browser rejects (`hot pink`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type MountedEditor,
  changeField,
  entry,
  fakeHass,
  keysOf,
  lastConfig,
  mountEditor,
  openPageOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import * as Colors from '../src/rendering/editor/colors';
import {
  type FieldId,
  buildFieldIndex,
  entityFieldIndex,
  schemaCtx,
  universeIndex,
} from '../src/rendering/editor/field-index';
import type { SchemaCtx } from '../src/rendering/editor/panels';
import { isColorNode } from '../src/rendering/editor/schemas/common';
import { buildEntitySchema } from '../src/rendering/editor/schemas/entity';
import { WORKSPACES } from '../src/rendering/editor/workspace';
import * as EntityColors from '../src/utils/entity-colors';

/** What the tests reach of the editor beyond the harness. */
interface Internals {
  readonly _ctx: SchemaCtx;
  readonly _history: { peekUndo(): { readonly label: string } | undefined };
  _undo(): void;
}

const internals = (editor: MountedEditor): Internals => editor as unknown as Internals;

/**
 * A CSS check that rejects what a browser rejects among the values typed here. Stubbed as a
 * global: happy-dom's own `CSS.supports` cannot be spied on.
 */
function stubSupports(): void {
  const supports = (_property: string, value?: string) => !String(value).includes('hot pink');
  vi.stubGlobal('CSS', { ...globalThis.CSS, supports, escape: globalThis.CSS.escape });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  EntityColors.resetEntityColors();
  document.body.replaceChildren();
});

/**
 * The keys of an interface in `src/config/types.ts`, read from source.
 *
 * @param name - The interface
 * @returns Its keys
 */
function interfaceKeys(name: string): string[] {
  const source = readFileSync(join(process.cwd(), 'src/config/types.ts'), 'utf-8');
  const block = new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (block === null) throw new Error(`No interface ${name} in types.ts`);
  return [...block[1].matchAll(/^ {2}([a-z0-9_]+)\??:/gm)].map((match) => match[1]);
}

/** Every field the card can draw in any workspace, and every field an entry declares. */
function everyField() {
  const card = WORKSPACES.flatMap((workspace) => [
    ...universeIndex('en', workspace).fields.values(),
  ]);
  const ctx = schemaCtx(Config.DEFAULT_CONFIG, 'list', 'en');
  const entry = [...entityFieldIndex(buildEntitySchema(ctx)).fields.values()];
  return { card, entry };
}

describe('which fields are colors', () => {
  it('pins the swatches by value, every one a theme color Home Assistant names', () => {
    expect(Colors.SWATCH_TOKENS).toEqual([
      'red',
      'pink',
      'purple',
      'deep-purple',
      'indigo',
      'blue',
      'light-blue',
      'cyan',
      'teal',
      'green',
      'light-green',
      'lime',
      'yellow',
      'amber',
      'orange',
      'deep-orange',
      'brown',
      'grey',
      'blue-grey',
    ]);
    expect(
      Colors.SWATCH_TOKENS.filter((token) => !EntityColors.THEME_COLOR_TOKENS.has(token)),
    ).toEqual([]);
  });

  it('builds every field named for a color, and every color key of the configuration, with color()', () => {
    const { card, entry } = everyField();
    const named = [...card, ...entry].filter((field) => field.node.name.endsWith('color'));
    const unmarked = named.filter((field) => !isColorNode(field.node)).map((field) => field.id);
    // And nothing else: a mark on a field that is no color would draw swatches for it.
    const strays = [...card, ...entry]
      .filter((field) => isColorNode(field.node) && !field.node.name.endsWith('color'))
      .map((field) => field.id);

    const keyed = (keys: string[], fields: typeof card) =>
      keys
        .filter((key) => key.endsWith('color'))
        .map((key) => ({ key, fields: fields.filter((field) => field.node.name === key) }));
    const config = keyed(interfaceKeys('Config'), card);
    const entity = keyed(interfaceKeys('EntityConfig'), entry);
    const withField = [...config, ...entity].filter(({ fields }) => fields.length > 0);
    const keyUnmarked = withField
      .filter(({ fields }) => fields.some((field) => !isColorNode(field.node)))
      .map(({ key }) => key);
    console.info(
      `color fields: ${named.length} fields named for a color; ` +
        `${config.length} Config and ${entity.length} EntityConfig color keys, ` +
        `${withField.length} with a field`,
    );
    expect(named.length).toBeGreaterThan(40);
    expect(withField.length).toBeGreaterThan(25);
    expect(unmarked).toEqual([]);
    expect(strays).toEqual([]);
    expect(keyUnmarked).toEqual([]);
  });

  it('absorbs exactly the two mode fields that choose a color source, for the card and an entry', () => {
    const { card, entry } = everyField();
    const specs = Colors.colorSpecs({ fields: new Map([...card, ...entry].map((f) => [f.id, f])) });
    const absorbed = [...new Set([...specs.values()].map((spec) => spec.mode))]
      .filter((mode) => mode !== undefined)
      .sort();
    expect(absorbed).toEqual([
      'calendar:accent_color_mode',
      'events:accent_color_mode',
      'events:allday_badge_color_mode',
    ]);
  });
});

/** Every spec kind the control draws, from the fields that have it. */
function specs() {
  const { card, entry } = everyField();
  const all = Colors.colorSpecs({ fields: new Map([...card, ...entry].map((f) => [f.id, f])) });
  const get = (id: FieldId) => {
    const spec = all.get(id);
    if (spec === undefined) throw new Error(`No color spec for ${id}`);
    return spec;
  };
  return {
    entryAccent: get('calendar:accent_color'),
    cardAccent: get('events:accent_color'),
    badge: get('events:allday_badge_color'),
    text: get('events:time_color'),
    weatherEvent: get('weather:weather.event.color'),
    plain: get('card:title_color'),
    entryColor: get('calendar:color'),
  };
}

describe('what a value means', () => {
  // Built in a hook, so a field that lost its mark fails these tests rather than their collection.
  let s: ReturnType<typeof specs>;
  let all: ReadonlyArray<Colors.ColorSpec>;
  beforeAll(() => {
    s = specs();
    all = Object.values(s);
  });

  it('reads every swatch back as itself, by its name', () => {
    for (const spec of all) {
      for (const token of Colors.SWATCH_TOKENS) {
        const value = Colors.swatchValue(token);
        expect(Colors.choiceOf(value, spec)).toEqual({ kind: 'swatch', token });
        expect(Colors.describeColor(value, spec, 'en')).toBe(Colors.swatchName(token, 'en'));
      }
    }
    expect(Colors.describeColor('var(--grey-color)', s.plain, 'en')).toBe('Gray');
    // Home Assistant's own name wins, in its language.
    const haName = (token: string) => (token === 'pink' ? 'Rosa' : undefined);
    expect(Colors.describeColor('var(--pink-color)', s.plain, 'de', { haName })).toBe('Rosa');
  });

  it('reads every value a row writes back as that row', () => {
    const rows = (spec: Colors.ColorSpec) => spec.sources.map(({ source }) => source);
    expect(rows(s.entryAccent)).toEqual(['follow-card', 'follow-ha']);
    expect(rows(s.cardAccent)).toEqual(['default', 'follow-ha']);
    expect(rows(s.badge)).toEqual(['calendar-accent', 'row-text']);
    expect(rows(s.text)).toEqual(['default', 'calendar-accent']);
    expect(rows(s.weatherEvent)).toEqual(['default', 'calendar-accent']);
    expect(rows(s.plain)).toEqual(['default']);
    expect(rows(s.entryColor)).toEqual(['default']);

    const cases: ReadonlyArray<readonly [Colors.ColorSpec, unknown, Colors.ColorSource, string]> = [
      [s.entryAccent, undefined, 'follow-card', 'Follow the card'],
      [s.entryAccent, 'home-assistant', 'follow-ha', 'Follow Home Assistant'],
      [s.cardAccent, 'home-assistant', 'follow-ha', 'Follow Home Assistant'],
      [s.badge, 'accent', 'calendar-accent', 'Calendar Accent Color'],
      [s.badge, ' Text ', 'row-text', 'Row Text Color'],
      [s.text, 'accent', 'calendar-accent', 'Calendar Color'],
      [s.weatherEvent, 'accent', 'calendar-accent', 'Calendar Color'],
    ];
    for (const [spec, value, source, words] of cases) {
      expect(Colors.choiceOf(value, spec)).toEqual({ kind: 'source', source });
      expect(Colors.describeColor(value, spec, 'en')).toBe(words);
    }
    // Default is nothing stored, or the value it falls back to.
    const fallback = 'var(--secondary-text-color)';
    expect(Colors.choiceOf(undefined, s.text, fallback)).toEqual({
      kind: 'source',
      source: 'default',
    });
    expect(Colors.choiceOf(fallback, s.text, fallback)).toEqual({
      kind: 'source',
      source: 'default',
    });
    expect(Colors.describeColor(undefined, s.text, 'en', { fallback })).toBe('Secondary Text');
    expect(Colors.describeColor(undefined, s.plain, 'en')).toBe('Not Set');
    // A word one field honors is Custom in another.
    expect(Colors.choiceOf('accent', s.plain)).toEqual({ kind: 'custom' });
    expect(Colors.choiceOf('home-assistant', s.text)).toEqual({ kind: 'custom' });
  });

  it('names theme colors and softened ones, and leaves anything else as written', () => {
    expect(Colors.describeColor('var(--primary-text-color)', s.plain, 'en')).toBe('Primary Text');
    expect(
      Colors.describeColor(
        'color-mix(in srgb, var(--divider-color) 50%, transparent)',
        s.plain,
        'en',
      ),
    ).toBe('Divider, 50%');
    expect(Colors.describeColor('var(--primary-color, #03a9f4)', s.plain, 'en')).toBe(
      "Home Assistant's primary color",
    );
    expect(Colors.describeColor('#e91e63', s.plain, 'en')).toBe('#e91e63');
    expect(Colors.choiceOf('#e91e63', s.plain)).toEqual({ kind: 'custom' });
  });

  it('accepts the card’s own words only where the card honors them', () => {
    const supports = (text: string) => text !== 'hot pink';
    const valid = (text: string, spec: Colors.ColorSpec) => Colors.validColor(text, spec, supports);
    expect([s.text, s.weatherEvent, s.badge].map((spec) => valid('accent', spec))).toEqual([
      true,
      true,
      true,
    ]);
    expect(
      [s.plain, s.cardAccent, s.entryAccent, s.entryColor].map((spec) => valid('accent', spec)),
    ).toEqual([false, false, false, false]);
    expect([s.cardAccent, s.entryAccent].map((spec) => valid('home-assistant', spec))).toEqual([
      true,
      true,
    ]);
    expect(
      [s.plain, s.text, s.badge, s.entryColor].map((spec) => valid('home-assistant', spec)),
    ).toEqual([false, false, false, false]);
    expect(valid('text', s.badge)).toBe(true);
    expect(valid('text', s.text)).toBe(true);
    expect(valid('#e91e63', s.plain)).toBe(true);
    expect(valid('hot pink', s.plain)).toBe(false);
    expect(valid('   ', s.plain)).toBe(false);
  });

  it('keys a draft by owner, field and where it would be stored', () => {
    const card = { kind: 'card' } as const;
    expect(Colors.draftKey(card, 'events:event_color', 'time_grid')).toBe(
      'card|events:event_color|time_grid',
    );
    expect(Colors.draftKey(card, 'events:event_color', 'list')).not.toBe(
      Colors.draftKey(card, 'events:event_color', 'time_grid'),
    );
    expect(Colors.draftKey({ kind: 'entry', key: 3 }, 'calendar:accent_color', '3')).toBe(
      'entry:3|calendar:accent_color|3',
    );
  });

  it('offers a new calendar the first swatch nobody uses', () => {
    const card = { ...Config.DEFAULT_CONFIG, accent_color: 'var(--red-color)' };
    expect(
      Colors.freeSwatch(
        [{ entity: 'calendar.anna', accent_color: 'var(--pink-color)' }, 'calendar.ben'],
        card,
      ),
    ).toBe('var(--purple-color)');
  });
});

/** The color control a card field is drawn as, on the open page. */
function control(editor: MountedEditor, id: FieldId): HTMLElement {
  const found = editor.shadowRoot!.querySelector<HTMLElement>(`.color-field[data-field="${id}"]`);
  if (found === null) throw new Error(`No color control for ${id}`);
  return found;
}

/**
 * Goes to a card color field and opens its control, as a user would.
 *
 * @param editor - Editor
 * @param id - The field the control is drawn for
 * @returns The control
 */
async function openColor(editor: MountedEditor, id: FieldId): Promise<HTMLElement> {
  await openPageOf(editor, id);
  const toggle = control(editor, id).querySelector<HTMLButtonElement>('.color-toggle')!;
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    toggle.click();
    await editor.updateComplete;
  }
  return control(editor, id);
}

/**
 * Goes to a calendar entry's page and opens its color control, as a user would.
 *
 * @param editor - Editor
 * @param key - The entry's key
 * @param id - The field the control is drawn for
 * @returns The control, on the entry's page
 */
async function openEntryColor(
  editor: MountedEditor,
  key: number,
  id: FieldId = 'calendar:accent_color_mode',
): Promise<HTMLElement> {
  await openPageOf(editor, id, entry({ key }));
  const found = () => {
    const at = editor.shadowRoot!.querySelector<HTMLElement>(
      `.entry-page[data-entry-key="${key}"] .color-field[data-field="${id}"]`,
    );
    if (at === null) throw new Error(`No color control for ${id} on entry ${key}'s page`);
    return at;
  };
  const toggle = found().querySelector<HTMLButtonElement>('.color-toggle')!;
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    toggle.click();
    await editor.updateComplete;
  }
  return found();
}

/**
 * Picks a row, a swatch or Custom in an open control.
 *
 * @param editor - Editor, awaited after the pick
 * @param where - The open control
 * @param selector - `[data-color-row="default"]`, `[data-swatch="pink"]`
 */
async function pick(editor: MountedEditor, where: HTMLElement, selector: string): Promise<void> {
  const input = where.querySelector<HTMLInputElement>(`${selector} input`);
  if (input === null) throw new Error(`No ${selector} to pick`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await editor.updateComplete;
}

/** Custom's text field in an open control. */
function textField(where: HTMLElement): (HTMLElement & { data: Record<string, unknown> }) | null {
  return where.querySelector('.color-text-field ha-form');
}

/**
 * Types into Custom's text field, as its form sends a keystroke.
 *
 * @param editor - Editor, awaited after
 * @param where - The open control, Custom chosen
 * @param name - The field's name
 * @param text - The whole text
 */
async function type(editor: MountedEditor, where: HTMLElement, name: string, text: string) {
  const form = textField(where);
  if (form === null) throw new Error('Custom draws no text field');
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: { ...form.data, [name]: text } },
      bubbles: true,
      composed: true,
    }),
  );
  await editor.updateComplete;
}

const BASE = { config_version: Config.CURRENT_CONFIG_VERSION, entities: ['calendar.anna'] };

describe('a draft, not a write', () => {
  beforeEach(stubSupports);

  it('holds text the card cannot draw, writes a color once it is one, and coalesces the typing', async () => {
    const editor = await mountEditor({
      ...BASE,
      title: 'Family',
      title_color: 'var(--pink-color)',
    });
    let at = await openColor(editor, 'card:title_color');
    await pick(editor, at, '[data-color-row="custom"]');
    at = control(editor, 'card:title_color');
    const reports = () => (lastConfig(editor) ?? {}).title_color;

    await type(editor, at, 'title_color', 'hot pink');
    at = control(editor, 'card:title_color');
    expect(reports()).toBeUndefined();
    expect(internals(editor)._history.peekUndo()).toBeUndefined();
    expect(at.querySelector('.color-invalid')?.textContent).toBe('Not a color the card can draw');
    expect(at.querySelector('.color-yaml code')?.textContent).toBe(
      'title_color: var(--pink-color)',
    );
    expect(at.querySelector('.color-kept')?.textContent).toBe(
      'Kept until the text above is a color',
    );
    expect(textField(at)!.data.title_color).toBe('hot pink');
    // Closing the control and leaving the page keeps it.
    at.querySelector<HTMLButtonElement>('.color-toggle')!.click();
    await editor.updateComplete;
    await openPageOf(editor, 'events:event_font_size');
    at = await openColor(editor, 'card:title_color');
    expect(textField(at)!.data.title_color).toBe('hot pink');

    await type(editor, at, 'title_color', '#e91e6a');
    await type(editor, control(editor, 'card:title_color'), 'title_color', '#e91e63');
    at = control(editor, 'card:title_color');
    expect(reports()).toBe('#e91e63');
    expect(at.querySelector('.color-invalid')).toBeNull();
    expect(at.querySelector('.color-kept')).toBeNull();
    expect(at.querySelector('.color-yaml code')?.textContent).toBe('title_color: #e91e63');
    // Both keystrokes are one step, back to the swatch.
    expect(internals(editor)._history.peekUndo()?.label).toBe('Change Title Color');
    internals(editor)._undo();
    await editor.updateComplete;
    expect(reports()).toBe('var(--pink-color)');
    expect(internals(editor)._history.peekUndo()).toBeUndefined();
  });

  it('forgets a draft when a configuration the editor did not send arrives', async () => {
    const editor = await mountEditor({ ...BASE, title_color: '#123456' });
    let at = await openColor(editor, 'card:title_color');
    await type(editor, at, 'title_color', 'hot pink');
    expect(textField(control(editor, 'card:title_color'))!.data.title_color).toBe('hot pink');

    editor.setConfig({ ...BASE, title_color: '#654321' });
    await editor.updateComplete;
    at = await openColor(editor, 'card:title_color');
    expect(textField(at)!.data.title_color).toBe('#654321');
    expect(at.querySelector('.color-invalid')).toBeNull();
  });

  it('flags a stored value the card cannot draw, and never rewrites it for an unrelated edit', async () => {
    const editor = await mountEditor({ ...BASE, title_color: 'hot pink' });
    await openPageOf(editor, 'card:title_color');
    expect(
      control(editor, 'card:title_color').querySelector('.color-toggle .color-dot.crossed'),
    ).not.toBeNull();
    const at = await openColor(editor, 'card:title_color');
    expect(at.querySelector('.color-invalid')?.textContent).toBe('Not a color the card can draw');
    expect(at.querySelector('.color-kept')).toBeNull();

    await changeField(editor, 'card:title', 'Family');
    expect(lastConfig(editor)).toMatchObject({ title: 'Family', title_color: 'hot pink' });
  });
});

describe('a draft is kept where its value would be stored', () => {
  beforeEach(stubSupports);

  it('neither shows nor commits a Grid draft while List is the scope, and keeps it for Grid', async () => {
    const editor = await mountEditor({
      ...BASE,
      view: 'grid',
      list: { event_color: '#111111' },
      time_grid: { event_color: '#222222' },
    });
    const stored = () => {
      const config = lastConfig(editor) ?? {};
      return [
        (config.list as Record<string, unknown> | undefined)?.event_color,
        (config.time_grid as Record<string, unknown> | undefined)?.event_color,
      ];
    };
    await changeField(editor, 'workspace:editing_workspace', 'grid');
    let at = await openColor(editor, 'events:event_color');
    expect(textField(at)!.data.event_color).toBe('#222222');
    await type(editor, at, 'event_color', 'hot pink');
    expect(textField(control(editor, 'events:event_color'))!.data.event_color).toBe('hot pink');

    await changeField(editor, 'workspace:editing_workspace', 'list');
    at = await openColor(editor, 'events:event_color');
    expect(textField(at)!.data.event_color).toBe('#111111');
    expect(at.querySelector('.color-invalid')).toBeNull();
    // Editing List's own, through a swatch, takes nothing from the draft.
    await pick(editor, at, '[data-swatch="teal"]');
    expect(stored()).toEqual(['var(--teal-color)', '#222222']);

    await changeField(editor, 'workspace:editing_workspace', 'grid');
    at = await openColor(editor, 'events:event_color');
    expect(textField(at)!.data.event_color).toBe('hot pink');
    expect(at.querySelector('.color-invalid')).not.toBeNull();
    expect(stored()).toEqual(['var(--teal-color)', '#222222']);
  });
});

describe('a change that arrives late, or a word typed', () => {
  beforeEach(stubSupports);

  it('writes a Grid text field’s late change to Grid, after List was chosen', async () => {
    const editor = await mountEditor({
      ...BASE,
      view: 'grid',
      list: { event_color: '#111111' },
      time_grid: { event_color: '#222222' },
    });
    await changeField(editor, 'workspace:editing_workspace', 'grid');
    const grid = textField(await openColor(editor, 'events:event_color'))!;
    await changeField(editor, 'workspace:editing_workspace', 'list');
    const list = textField(await openColor(editor, 'events:event_color'))!;
    expect(list).not.toBe(grid);

    const send = async (text: string) => {
      grid.dispatchEvent(
        new CustomEvent('value-changed', {
          detail: { value: { event_color: text } },
          bubbles: true,
          composed: true,
        }),
      );
      await editor.updateComplete;
    };
    await send('hot pink');
    expect(textField(control(editor, 'events:event_color'))!.data.event_color).toBe('#111111');
    await send('#333333');
    const config = lastConfig(editor)!;
    expect(config.list).toEqual({ event_color: '#111111' });
    expect(config.time_grid).toEqual({ event_color: '#333333' });
  });

  it('writes a word the card honors as its row does, never as a custom color', async () => {
    const editor = await mountEditor({ ...BASE, time_color: '#123456' });
    const at = await openColor(editor, 'events:time_color');
    await type(editor, at, 'time_color', ' accent ');
    // A List card writes List's own.
    expect(lastConfig(editor)?.list).toEqual({ time_color: 'accent' });

    const entries = await mountEditor(
      {
        ...BASE,
        accent_color: '#123456',
        entities: [{ entity: 'calendar.anna', accent_color: '#abcdef' }],
      },
      {
        hass: fakeHass({ states: { 'calendar.anna': { attributes: { friendly_name: 'Anna' } } } }),
      },
    );
    const [anna] = keysOf(entries, 'entry');
    const host = await openEntryColor(entries, anna);
    await type(entries, host, 'accent_color', 'home-assistant');
    expect((lastConfig(entries)?.entities as ReadonlyArray<unknown>)[0]).toEqual({
      entity: 'calendar.anna',
      accent_color: 'home-assistant',
    });
  });

  it('lets Escape go Back on a page where the open control is not drawn', async () => {
    const editor = await mountEditor({ ...BASE, title_color: '#123456' });
    await openColor(editor, 'card:title_color');
    // A field Events shows of a fresh card, so no Add row is left open to close first.
    await openPageOf(editor, 'events:show_time');
    const page = editor.shadowRoot!.querySelector<HTMLElement>('.page[data-page="events"]')!;
    page.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    await editor.updateComplete;
    expect(editor.shadowRoot!.querySelector('.page')).toBeNull();
  });
});

describe('what each owner’s control writes', () => {
  beforeEach(stubSupports);

  it('gives the card’s Accent Color its returned name and resets both keys with Default', async () => {
    for (const accent of ['#123456', 'home-assistant']) {
      const editor = await mountEditor({ ...BASE, accent_color: accent });
      const at = await openColor(editor, 'events:accent_color_mode');
      expect(at.getAttribute('aria-label')).toBe('Accent Color');
      expect(editor.shadowRoot!.querySelector('[data-field="events:accent_color"]')).toBeNull();
      await pick(editor, at, '[data-color-row="default"]');
      expect(lastConfig(editor)).not.toHaveProperty('accent_color');
      expect(internals(editor)._history.peekUndo()?.label).toBe('Change Accent Color');
      internals(editor)._undo();
      await editor.updateComplete;
      expect(lastConfig(editor)?.accent_color).toBe(accent);
      expect(internals(editor)._history.peekUndo()).toBeUndefined();
      editor.remove();
    }
  });

  it('draws the badge’s modes as its rows, and a swatch as its custom color', async () => {
    const editor = await mountEditor({ ...BASE, allday_badge: 'title' });
    // A List card edits List's own badge color.
    const value = () =>
      (lastConfig(editor)?.list as Record<string, unknown> | undefined)?.allday_badge_color;
    let at = await openColor(editor, 'events:allday_badge_color_mode');
    expect(at.querySelector('[data-color-row="calendar-accent"] input')).toHaveProperty(
      'checked',
      true,
    );
    await pick(editor, at, '[data-color-row="row-text"]');
    expect(value()).toBe('text');
    at = control(editor, 'events:allday_badge_color_mode');
    await pick(editor, at, '[data-swatch="amber"]');
    expect(value()).toBe('var(--amber-color)');
    at = control(editor, 'events:allday_badge_color_mode');
    // Its state words follow the choice in its name, as they follow any field's label.
    expect(at.querySelector('.color-toggle')?.getAttribute('aria-label')).toBe(
      'All-Day Badge Color, Amber, Set',
    );
    expect(at.querySelector('.color-words')?.textContent).toBe('Set');
    await pick(editor, at, '[data-color-row="calendar-accent"]');
    expect(value() ?? 'accent').toBe('accent');
  });

  it('writes an entry’s Accent Color to that entry alone, mode and value in one undo step', async () => {
    const editor = await mountEditor(
      {
        ...BASE,
        accent_color: '#123456',
        entities: [
          { entity: 'calendar.anna', label: 'A', blocklist: 'Private', unknown_key: 1 },
          'calendar.ben',
        ],
      },
      {
        hass: fakeHass({ states: { 'calendar.anna': { attributes: { friendly_name: 'Anna' } } } }),
      },
    );
    const [anna] = keysOf(editor, 'entry');
    let at = await openEntryColor(editor, anna);
    const draw = async (): Promise<HTMLElement> => openEntryColor(editor, anna);
    // The page draws Anna's accent as one control: its value is inside it, not a field of its own.
    expect(
      at.closest('.entry-page')?.querySelectorAll('[data-field^="calendar:accent_color"]'),
    ).toHaveLength(1);
    expect(at.querySelector('[data-color-row="follow-card"] input')).toHaveProperty(
      'checked',
      true,
    );
    expect(
      at.querySelector('[data-color-row="follow-card"] .display-description')?.textContent,
    ).toBe("The card's Accent Color, #123456");

    await pick(editor, at, '[data-swatch="pink"]');
    at = await draw();
    // Its own color now, still inside the one control rather than a field beside it.
    expect(
      at.closest('.entry-page')?.querySelectorAll('[data-field^="calendar:accent_color"]'),
    ).toHaveLength(1);
    const entities = () => lastConfig(editor)?.entities as ReadonlyArray<unknown>;
    expect(entities()).toEqual([
      {
        entity: 'calendar.anna',
        label: 'A',
        blocklist: 'Private',
        unknown_key: 1,
        accent_color: 'var(--pink-color)',
      },
      'calendar.ben',
    ]);
    expect(lastConfig(editor)?.accent_color).toBe('#123456');
    expect(internals(editor)._history.peekUndo()?.label).toBe('Change Accent Color for Anna');
    expect(at.querySelector('.color-toggle')?.getAttribute('aria-label')).toBe(
      'Accent Color, Pink, Set',
    );
    // Its own color gets a way off, which follows the card again.
    const remove = at.querySelector<HTMLButtonElement>('.color-head .icon-button')!;
    expect(remove.getAttribute('aria-label')).toBe("Remove Anna's Accent Color");

    await pick(editor, at, '[data-color-row="follow-ha"]');
    expect(entities()[0]).toMatchObject({ accent_color: 'home-assistant' });
    remove.click();
    await draw();
    expect(entities()[0]).not.toHaveProperty('accent_color');

    internals(editor)._undo();
    internals(editor)._undo();
    internals(editor)._undo();
    await editor.updateComplete;
    expect(entities()[0]).not.toHaveProperty('accent_color');
    expect(internals(editor)._history.peekUndo()).toBeUndefined();
  });
});

describe('a color control’s state line', () => {
  beforeEach(stubSupports);

  it('resets the card’s badge color from the line under its control, one undo step', async () => {
    const editor = await mountEditor({
      ...BASE,
      allday_badge: 'title',
      list: { allday_badge_color: 'var(--amber-color)' },
    });
    await openPageOf(editor, 'events:allday_badge_color_mode');
    const at = control(editor, 'events:allday_badge_color_mode');
    expect(at.querySelector('.color-words')?.textContent).toBe('Set');
    const reset = at.querySelector<HTMLButtonElement>(
      '[data-focus="reset:events:allday_badge_color_mode"]',
    );
    expect(reset?.textContent?.trim()).toBe('Reset (Calendar Accent Color)');
    reset!.click();
    await editor.updateComplete;
    expect(lastConfig(editor)).not.toHaveProperty('list');
    expect(lastConfig(editor)).not.toHaveProperty('allday_badge_color');
    internals(editor)._undo();
    await editor.updateComplete;
    expect(lastConfig(editor)?.list).toEqual({ allday_badge_color: 'var(--amber-color)' });
    expect(internals(editor)._history.peekUndo()).toBeUndefined();
  });

  it('resets an entry’s own Accent Color from the line under its control, one undo step', async () => {
    const editor = await mountEditor(
      {
        ...BASE,
        entities: [{ entity: 'calendar.anna', accent_color: 'var(--pink-color)' }],
      },
      {
        hass: fakeHass({ states: { 'calendar.anna': { attributes: { friendly_name: 'Anna' } } } }),
      },
    );
    const [anna] = keysOf(editor, 'entry');
    const at = await openEntryColor(editor, anna);
    expect(at.querySelector('.color-words')?.textContent).toBe('Set');
    const line = at.querySelector<HTMLButtonElement>(
      '[data-focus="reset:calendar:accent_color_mode"], [data-focus="remove:calendar:accent_color_mode"]',
    );
    expect(line).not.toBeNull();
    line!.click();
    await editor.updateComplete;
    const entities = () => lastConfig(editor)?.entities as ReadonlyArray<unknown>;
    expect(entities()[0]).not.toEqual(expect.objectContaining({ accent_color: expect.anything() }));
    internals(editor)._undo();
    await editor.updateComplete;
    expect(entities()[0]).toEqual({ entity: 'calendar.anna', accent_color: 'var(--pink-color)' });
    expect(internals(editor)._history.peekUndo()).toBeUndefined();
  });
});

describe('Follow Home Assistant', () => {
  it('describes the calendar’s registry color, and lets the subscription go when the editor leaves', async () => {
    const off = vi.fn();
    const subscribeEvents = vi.fn(async () => off);
    const callWS = vi.fn(async (message: { type: string }) =>
      message.type === 'config/entity_registry/list'
        ? [{ entity_id: 'calendar.anna', options: { calendar: { color: 'teal' } } }]
        : [],
    );
    const editor = await mountEditor(
      { ...BASE, entities: ['calendar.anna', 'calendar.ben'] },
      {
        hass: fakeHass({
          callWS,
          connection: {
            subscribeEvents,
            subscribeMessage: (_callback: unknown, message: { type?: string }) =>
              message?.type === 'calendar/event/subscribe'
                ? Promise.reject({ code: 'unknown_command' })
                : Promise.resolve(() => undefined),
          },
          states: {
            'calendar.anna': { attributes: { friendly_name: 'Anna' } },
            'calendar.ben': { attributes: { friendly_name: 'Ben' } },
          },
        }),
      },
    );
    // Nothing is read until a control asks.
    expect(callWS).not.toHaveBeenCalled();
    const [anna, ben] = keysOf(editor, 'entry');
    const said = (host: HTMLElement) =>
      host.querySelector('[data-color-row="follow-ha"] .display-description')?.textContent;
    await openEntryColor(editor, anna);
    await vi.waitFor(() => expect(callWS).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => {
      editor.requestUpdate();
      expect(said(await openEntryColor(editor, anna))).toBe(
        "Home Assistant's color for Anna: Teal",
      );
    });
    // Ben has none, and his page reads the same registry, once.
    expect(said(await openEntryColor(editor, ben))).toBe(
      'None set for Ben there, so it falls back to the card',
    );
    expect(callWS).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(subscribeEvents).toHaveBeenCalledTimes(1));

    editor.remove();
    expect(off).toHaveBeenCalledTimes(1);
  });
});

describe('the card’s fields as drawn', () => {
  it('draws the absorbed mode as the control, and the value inside it', () => {
    const ctx = schemaCtx(
      { ...Config.DEFAULT_CONFIG, accent_color: 'home-assistant' },
      'shared',
      'en',
    );
    expect(buildFieldIndex(ctx).fields.has('events:accent_color')).toBe(false);
    const { specs: found, fields } = Colors.cardColorFields(ctx);
    expect(found.get('events:accent_color_mode')?.value).toBe('events:accent_color');
    expect(fields.has('events:accent_color')).toBe(true);
  });
});

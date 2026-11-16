/**
 * Undo and Redo (backlog item 307): exact snapshots, the migration choice as a step, coalescing,
 * the keys, focus after a step, and the line a removal or an applied story leaves.
 *
 * Exactness is checked on what the editor tells Home Assistant, as JSON, so a key's order and a
 * default-valued line count: `toEqual` would call a pruned or reordered configuration equal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type MountedEditor,
  changeField,
  emitChange,
  fakeHass,
  formOf,
  goOverview,
  goPage,
  keysOf,
  mountEditor,
  openPageOf,
  resetButton,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { History, type HistoryEntry, type Snapshot } from '../src/rendering/editor/history';
import { historyKey, inTextField } from '../src/rendering/editor/views/keys';

const VERSION = Config.CURRENT_CONFIG_VERSION;

/** What these tests read of the editor beyond its DOM. */
interface Internals {
  _history: History;
  _pending: Record<string, string>;
  _gridResetKeys: Set<string>;
  _gridReconciliation: ReadonlyArray<string>;
  _migration: { readonly kind: string };
  _snapshot(): Snapshot;
}

const internals = (editor: MountedEditor) => editor as unknown as Internals;

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/**
 * Mounts the editor and records what it tells Home Assistant, as JSON; with `echo`, hands each
 * configuration back as Home Assistant does.
 *
 * @param config - The configuration as stored
 * @param echo - Whether to echo
 * @returns The editor and what it reported
 */
async function mount(config: Record<string, unknown>, echo = true) {
  const editor = await mountEditor(structuredClone(config), {
    hass: fakeHass({ states: { 'calendar.anna': {}, 'calendar.ben': {}, 'calendar.leo': {} } }),
  });
  const sent: string[] = [];
  editor.addEventListener('config-changed', (event) => {
    const config = (event as CustomEvent<{ config: Record<string, unknown> }>).detail.config;
    sent.push(JSON.stringify(config));
    if (echo) editor.setConfig(structuredClone(config));
  });
  return { editor, sent, last: () => JSON.parse(sent[sent.length - 1]!) };
}

function $(editor: MountedEditor, selector: string): HTMLElement | null {
  return editor.shadowRoot!.querySelector<HTMLElement>(selector);
}

/** Lets a step's render and the focus that follows it land. */
async function settle(editor: MountedEditor): Promise<void> {
  await editor.updateComplete;
  await new Promise((resolve) => setTimeout(resolve));
  await editor.updateComplete;
}

/** Presses Undo or Redo, the first drawn. */
async function press(editor: MountedEditor, which: 'undo' | 'redo'): Promise<void> {
  const button = $(editor, `.history-controls [data-focus="${which}"]`);
  if (button === null) throw new Error(`The editor draws no ${which}`);
  button.click();
  await settle(editor);
}

/**
 * Sends a key down from an element, as a keyboard does, and reports what became of it.
 *
 * @returns Whether it was prevented, and whether it got past the editor's own listener
 */
async function key(
  editor: MountedEditor,
  from: Element,
  init: KeyboardEventInit,
): Promise<{ prevented: boolean; escaped: boolean }> {
  let escaped = false;
  const outside = (): void => {
    escaped = true;
  };
  document.addEventListener('keydown', outside);
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  from.dispatchEvent(event);
  document.removeEventListener('keydown', outside);
  await settle(editor);
  return { prevented: event.defaultPrevented, escaped };
}

const undoLabel = (editor: MountedEditor) =>
  $(editor, '.history-controls [data-focus="undo"]')?.getAttribute('aria-label');

describe('History', () => {
  const snap = (value: number): Snapshot => ({
    raw: { days_to_show: value },
    authoredRootKeys: [],
    gridResetKeys: [],
    gridReconciliation: [],
    pending: {},
    migration: { kind: 'current' },
    entryKeys: [],
    buttonKeys: [],
  });
  const step = (from: number, to: number, label = `${from}→${to}`): HistoryEntry => ({
    label,
    before: snap(from),
    after: snap(to),
    where: { route: { kind: 'overview' }, workspace: undefined },
  });

  it('joins typing in one field under COALESCE_MS, and nothing else', () => {
    const history = new History();
    history.record(step(1, 2), 'a', 0);
    history.record(step(2, 3), 'a', History.COALESCE_MS - 1);
    expect(history.peekUndo()?.before.raw).toEqual({ days_to_show: 1 });
    expect(history.peekUndo()?.after.raw).toEqual({ days_to_show: 3 });

    // A pause, another field, and a step that never joins each start one of their own.
    history.record(step(3, 4), 'a', 2 * History.COALESCE_MS);
    history.record(step(4, 5), 'b', 2 * History.COALESCE_MS + 1);
    history.record(step(5, 6), undefined, 2 * History.COALESCE_MS + 2);
    history.record(step(6, 7), undefined, 2 * History.COALESCE_MS + 3);
    const labels: string[] = [];
    for (let entry = history.undo(); entry; entry = history.undo()) labels.push(entry.label);
    expect(labels).toEqual(['6→7', '5→6', '4→5', '3→4', '2→3']);
  });

  it('starts afresh after Undo, and drops a run that ends where it began', () => {
    const history = new History();
    history.record(step(1, 2), 'a', 0);
    history.undo();
    history.redo();
    history.record(step(2, 3), 'a', 10);
    expect(history.peekUndo()?.before.raw).toEqual({ days_to_show: 2 });

    const back = new History();
    back.record(step(1, 2), 'a', 0);
    back.record(step(2, 1), 'a', 10);
    expect(back.canUndo).toBe(false);
  });

  it('keeps the last LIMIT steps, and a new step drops what Redo could reach', () => {
    const history = new History();
    for (let at = 0; at < History.LIMIT + 5; at++) history.record(step(at, at + 1), undefined, at);
    let count = 0;
    while (history.undo()) count++;
    expect(count).toBe(History.LIMIT);
    history.redo();
    history.record(step(9, 10), undefined, 0);
    expect(history.canRedo).toBe(false);
  });
});

describe('the keys', () => {
  const path = (...elements: Element[]) => ({ composedPath: () => elements });
  const div = document.createElement('div');

  it('reads Ctrl/Cmd+Z as Undo, Ctrl+Y and Ctrl/Cmd+Shift+Z as Redo, and leaves the rest', () => {
    const at = path(div);
    const cases: Array<[KeyboardEventInit, string | undefined]> = [
      [{ key: 'z', ctrlKey: true }, 'undo'],
      [{ key: 'z', metaKey: true }, 'undo'],
      [{ key: 'Z', ctrlKey: true, shiftKey: true }, 'redo'],
      [{ key: 'z', metaKey: true, shiftKey: true }, 'redo'],
      [{ key: 'y', ctrlKey: true }, 'redo'],
      // Home Assistant's code editor's own.
      [{ key: 'Y', ctrlKey: true, shiftKey: true }, undefined],
      [{ key: 'y', metaKey: true }, undefined],
      [{ key: 'z' }, undefined],
      [{ key: 'z', ctrlKey: true, altKey: true }, undefined],
    ];
    expect(
      cases.map(([init]) =>
        historyKey({
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          altKey: false,
          ...init,
          ...at,
        } as never),
      ),
    ).toEqual(cases.map(([, step]) => step));
  });

  it('leaves every key typed in a text field to the field', () => {
    const editing = [
      document.createElement('input'),
      document.createElement('textarea'),
      Object.assign(document.createElement('div'), { contentEditable: 'true' }),
      ...['textbox', 'combobox', 'spinbutton', 'searchbox'].map((role) => {
        const element = document.createElement('div');
        element.setAttribute('role', role);
        return element;
      }),
    ];
    for (const element of editing)
      expect(inTextField([element, div]), element.outerHTML).toBe(true);
    expect(inTextField([div, document.createElement('button')])).toBe(false);
  });
});

describe('Undo restores exactly', () => {
  it('a deprecated option the first write pruned, byte for byte', async () => {
    const stored = {
      config_version: VERSION,
      entities: ['calendar.anna'],
      days_to_show: 3,
      row_spacing: '8px',
    };
    const { editor, sent } = await mount(stored);
    await changeField(editor, 'content:days_to_show', 5);
    expect(sent[0]).not.toContain('row_spacing');

    await press(editor, 'undo');
    expect(sent[1]).toBe(JSON.stringify(stored));
  });

  it('an authored default the write minimized away', async () => {
    // Days to Show at its default, written where Shared writes it.
    const stored = { config_version: VERSION, entities: ['calendar.anna'], days_to_show: 3 };
    const { editor, sent, last } = await mount(stored);
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await changeField(editor, 'content:days_to_show', 5);
    expect(last()).toHaveProperty('days_to_show', 5);

    // Written through the minimizing write, 3 would be dropped as a default nothing holds.
    await press(editor, 'undo');
    expect(sent[sent.length - 1]).toBe(JSON.stringify(stored));
  });

  it('an automatic migration, and the next edit writes what it would have', async () => {
    const stored = { entities: ['calendar.anna'], title: 'Family' };
    const { editor, sent } = await mount(stored);
    expect(internals(editor)._migration.kind).toBe('automatic');
    await changeField(editor, 'card:title', 'Home');
    const first = sent[0];
    expect(JSON.parse(first!)).toHaveProperty('config_version', VERSION);

    await press(editor, 'undo');
    expect(sent[1]).toBe(JSON.stringify(stored));
    expect(internals(editor)._migration.kind).toBe('automatic');

    await changeField(editor, 'card:title', 'Home');
    expect(sent[2]).toBe(first);
  });

  it('a Grid reset, its memory with it', async () => {
    const stored = {
      config_version: VERSION,
      entities: ['calendar.anna'],
      view: 'grid',
      event_font_size: '14px',
      time_grid: { event_font_size: '18px' },
    };
    const { editor, last } = await mount(stored);
    const reset = await resetButton(editor, 'event_font_size');
    reset!.click();
    await settle(editor);
    expect(last()).not.toHaveProperty('time_grid');
    expect([...internals(editor)._gridResetKeys]).toEqual(['event_font_size']);

    await press(editor, 'undo');
    expect(last().time_grid).toEqual({ event_font_size: '18px' });
    expect([...internals(editor)._gridResetKeys]).toEqual([]);
    await press(editor, 'redo');
    expect([...internals(editor)._gridResetKeys]).toEqual(['event_font_size']);
  });

  it('a reset, with focus on the field it reset', async () => {
    const { editor } = await mount({
      config_version: VERSION,
      entities: ['calendar.anna'],
      view: 'grid',
      event_font_size: '14px',
      time_grid: { event_font_size: '18px' },
    });
    await openPageOf(editor, 'events:event_font_size');
    $(editor, '[data-reset-keys="event_font_size"]')!.click();
    await settle(editor);
    // Grid's own default applies once the line is gone, so the field goes back to its Add row,
    // which takes focus; Undo is pressed there.
    await key(editor, editor.shadowRoot!.activeElement as HTMLElement, {
      key: 'z',
      ctrlKey: true,
    });
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-field')).toBe(
      'events:event_font_size',
    );
  });

  it('the Grid notice a layout switch brings, as one step with it', async () => {
    const { editor, last } = await mount({
      config_version: VERSION,
      entities: ['calendar.anna'],
      view: 'list',
      event_font_size: '14px',
    });
    await changeField(editor, 'display:view', 'grid');
    const notice = [...internals(editor)._gridReconciliation];
    expect(notice).toContain('event_font_size');

    await press(editor, 'undo');
    expect(last()).toHaveProperty('view', 'list');
    expect(internals(editor)._gridReconciliation).toEqual([]);
    await press(editor, 'redo');
    expect(last()).toHaveProperty('view', 'grid');
    expect(internals(editor)._gridReconciliation).toEqual(notice);
    expect($(editor, '[data-grid-reconciliation]')).not.toBeNull();
  });

  it('text a field held while it did not parse', async () => {
    const { editor } = await mount({
      config_version: VERSION,
      entities: ['calendar.anna'],
      // Not `+1`, which reads as Tomorrow and draws no Expression field.
      start_date: '+2',
    });
    await changeField(editor, 'content:start_date_offset', '-');
    const held = { ...internals(editor)._pending };
    expect(Object.values(held)).toContain('-');
    await changeField(editor, 'card:title', 'Family');
    // A write moves what is held on.
    internals(editor)._pending = {};

    await press(editor, 'undo');
    expect(internals(editor)._pending).toEqual(held);
  });
});

describe('echoes after a step', () => {
  it('are all known for what they are, however often Home Assistant sends them', async () => {
    const stored = {
      config_version: VERSION,
      entities: ['calendar.anna'],
      row_spacing: '8px',
    };
    const { editor, sent } = await mount(stored);
    await changeField(editor, 'card:title', 'Family');
    await press(editor, 'undo');
    // Home Assistant may answer a write more than once, each time with its newest value.
    for (let echo = 0; echo < 2; echo++) {
      editor.setConfig(JSON.parse(sent[sent.length - 1]!));
      await settle(editor);
    }
    expect(internals(editor)._history.canRedo).toBe(true);
    await press(editor, 'redo');
    expect(JSON.parse(sent[sent.length - 1]!)).toHaveProperty('title', 'Family');
  });
});

describe('the migration choice', () => {
  const PRE_V5 = { entities: ['calendar.anna'], event_font_size: '18px' };
  const choices = (editor: MountedEditor) => [
    ...editor.shadowRoot!.querySelectorAll<HTMLButtonElement>('[data-config-migration] button'),
  ];

  it('is a step: Undo sends the YAML back and shows the choice again, past the echo', async () => {
    const { editor, sent, last } = await mount(PRE_V5);
    choices(editor)[0]!.click();
    await settle(editor);
    const chosen = sent[0];
    expect(last()).toHaveProperty('config_version', VERSION);
    expect($(editor, '[data-config-migration]')).toBeNull();

    await press(editor, 'undo');
    // `mount` echoed it, as Home Assistant does; the screen and Redo outlast the echo.
    expect(sent[1]).toBe(JSON.stringify(PRE_V5));
    expect($(editor, '[data-config-migration]')).not.toBeNull();
    expect(choices(editor)).toHaveLength(2);
    expect(internals(editor)._history.canRedo).toBe(true);
    expect(editor.shadowRoot!.activeElement?.id).toBe('config-migration-title');

    const redo = await key(editor, editor.shadowRoot!.activeElement!, {
      key: 'y',
      ctrlKey: true,
    });
    expect(redo.prevented).toBe(true);
    expect(sent[2]).toBe(chosen);
    expect($(editor, '[data-config-migration]')).toBeNull();
  });

  it('shows the choice again before Home Assistant echoes anything', async () => {
    const { editor, sent } = await mount(PRE_V5, false);
    choices(editor)[1]!.click();
    await settle(editor);
    await press(editor, 'undo');
    expect(sent[1]).toBe(JSON.stringify(PRE_V5));
    expect($(editor, '[data-config-migration]')).not.toBeNull();
  });
});

describe('steps', () => {
  it('join typing in one field, and part at a pause or another field', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { editor, sent } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    const opening = await (async () => {
      await changeField(editor, 'card:title', 'F');
      return JSON.parse(sent[0]!);
    })();
    vi.advanceTimersByTime(History.COALESCE_MS - 1);
    await changeField(editor, 'card:title', 'Fa');
    vi.advanceTimersByTime(History.COALESCE_MS - 1);
    await changeField(editor, 'card:title', 'Fam');
    vi.advanceTimersByTime(History.COALESCE_MS);
    await changeField(editor, 'card:title', 'Fami');
    await changeField(editor, 'content:days_to_show', 5);
    vi.advanceTimersByTime(10);
    await changeField(editor, 'card:title', 'Family');

    const titles: unknown[] = [];
    while (internals(editor)._history.canUndo) {
      await press(editor, 'undo');
      titles.push(JSON.parse(sent[sent.length - 1]!).title);
    }
    expect(opening.title).toBe('F');
    expect(titles).toEqual(['Fami', 'Fami', 'Fam', undefined]);
  });

  it('are named for what they did, and the buttons say so', async () => {
    const { editor } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    expect(undoLabel(editor)).toBe('Undo');
    expect($(editor, '[data-focus="undo"]')!.hasAttribute('disabled')).toBe(true);
    await changeField(editor, 'content:days_to_show', 5);
    expect(undoLabel(editor)).toBe('Undo: Change Days To Show');
    await press(editor, 'undo');
    expect($(editor, '[data-focus="redo"]')!.getAttribute('aria-label')).toBe(
      'Redo: Change Days To Show',
    );
  });

  it('use Home Assistant’s Undo and Redo where it has them', async () => {
    const words: Record<string, string> = { 'ui.common.undo': 'Rückgängig', 'ui.common.redo': '' };
    const editor = await mountEditor(
      { config_version: VERSION, entities: ['calendar.anna'] },
      { hass: fakeHass({ localize: (key: string) => words[key] ?? '' }) },
    );
    expect(undoLabel(editor)).toBe('Rückgängig');
    expect($(editor, '[data-focus="redo"]')!.getAttribute('aria-label')).toBe('Redo');
  });

  it('keep the last 75', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { editor } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    for (let at = 0; at < History.LIMIT + 3; at++) {
      vi.advanceTimersByTime(History.COALESCE_MS);
      await changeField(editor, 'content:days_to_show', at % 2 === 0 ? 5 : 6);
    }
    let count = 0;
    while (internals(editor)._history.canUndo) {
      await press(editor, 'undo');
      count++;
    }
    expect(count).toBe(History.LIMIT);
  });

  it('are forgotten once a configuration the editor did not send arrives', async () => {
    const { editor } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    await changeField(editor, 'content:days_to_show', 5);
    expect(internals(editor)._history.canUndo).toBe(true);
    editor.setConfig({ config_version: VERSION, entities: ['calendar.ben'] });
    await settle(editor);
    expect(internals(editor)._history.canUndo).toBe(false);
    expect($(editor, '[data-focus="undo"]')!.hasAttribute('disabled')).toBe(true);
  });
});

describe('Undo by key', () => {
  it('is handled outside text fields, kept from Home Assistant, and focus stays able to undo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { editor, sent } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    await changeField(editor, 'content:days_to_show', 5);
    vi.advanceTimersByTime(History.COALESCE_MS);
    await changeField(editor, 'content:days_to_show', 6);

    const wrapper = $(editor, '[data-field="content:days_to_show"]')!;
    const first = await key(editor, wrapper, { key: 'z', ctrlKey: true });
    expect(first).toEqual({ prevented: true, escaped: false });
    expect(JSON.parse(sent[sent.length - 1]!).list).toEqual({ days_to_show: 5 });

    // Focus is on the field's wrapper, never inside its form, so the next Ctrl/Cmd+Z undoes too.
    const focused = editor.shadowRoot!.activeElement!;
    expect(focused.getAttribute('data-field')).toBe('content:days_to_show');
    expect(focused.querySelector('ha-form')?.contains(focused)).toBeFalsy();
    await key(editor, focused, { key: 'z', metaKey: true });
    expect(JSON.parse(sent[sent.length - 1]!)).not.toHaveProperty('list');

    await key(editor, editor.shadowRoot!.activeElement!, {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(JSON.parse(sent[sent.length - 1]!).list).toEqual({ days_to_show: 5 });
  });

  it('is left to a text field, and Ctrl+Shift+Y to Home Assistant', async () => {
    const { editor, sent } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    await changeField(editor, 'content:days_to_show', 5);
    const form = formOf(editor, 'content:days_to_show')!;
    const input = document.createElement('input');
    form.appendChild(input);

    expect(await key(editor, input, { key: 'z', ctrlKey: true })).toEqual({
      prevented: false,
      escaped: true,
    });
    expect(await key(editor, form, { key: 'Y', ctrlKey: true, shiftKey: true })).toEqual({
      prevented: false,
      escaped: true,
    });
    expect(sent).toHaveLength(1);
  });
});

describe('focus after a step', () => {
  it('lands on the restored field’s wrapper, on the page it was changed on', async () => {
    const { editor } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    await openPageOf(editor, 'events:event_font_size');
    await changeField(editor, 'events:event_font_size', '20px');
    await goPage(editor, 'size_spacing');

    await press(editor, 'undo');
    const focused = editor.shadowRoot!.activeElement!;
    expect(focused.getAttribute('data-field')).toBe('events:event_font_size');
    expect($(editor, '.page[data-page]')?.getAttribute('data-page')).toBe('events');

    await press(editor, 'redo');
    expect(editor.shadowRoot!.activeElement?.getAttribute('data-field')).toBe(
      'events:event_font_size',
    );
  });

  it('goes to the heading where the field is gone', async () => {
    const { editor } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    await openPageOf(editor, 'card:title');
    // A field the step cannot point at.
    await changeField(editor, 'card:title', 'Family');
    $(editor, '[data-field="card:title"]')!.remove();
    await press(editor, 'undo');
    expect(editor.shadowRoot!.activeElement?.classList.contains('page-title')).toBe(true);
  });
});

describe('the line a removal leaves', () => {
  const ENTRIES = [
    { entity: 'calendar.anna', label: 'A' },
    { entity: 'calendar.ben', label: 'B' },
  ];

  /**
   * Removes a calendar of one entry as a user does from the overview: its row's ⋮, then Remove on
   * the strip that opens.
   *
   * @param editor - The editor, on the overview
   * @param key - The entry's key
   */
  const remove = async (editor: MountedEditor, key: number): Promise<void> => {
    $(editor, `[data-focus="more:entry:${key}"]`)!.click();
    await settle(editor);
    $(editor, `[data-focus="strip:entry:${key}:remove"]`)!.click();
    await settle(editor);
  };

  it('says what went, holds focus on its Undo, and its Undo brings the calendar back', async () => {
    const { editor, sent, last } = await mount({ config_version: VERSION, entities: ENTRIES });
    const [anna] = keysOf(editor, 'entry');
    await remove(editor, anna!);

    const line = $(editor, '[data-status-bar]')!;
    expect(line.querySelector('.status-text')!.textContent!.trim()).toMatch(/^Removed /);
    expect(editor.shadowRoot!.activeElement).toBe(line.querySelector('[data-focus="status-undo"]'));
    expect($(editor, '.live-region')!.textContent).toMatch(/Removed .*\./);
    expect(last().entities).toEqual([ENTRIES[1]]);

    (editor.shadowRoot!.activeElement as HTMLElement).click();
    await settle(editor);
    expect(sent[sent.length - 1]).toBe(
      JSON.stringify({ config_version: VERSION, entities: ENTRIES }),
    );
    expect($(editor, '[data-status-bar]')).toBeNull();
    expect(keysOf(editor, 'entry')[0]).toBe(anna);
    expect(editor.shadowRoot!.activeElement).toBe($(editor, `[data-focus="row:${anna}"]`));
  });

  it('stays until the next change', async () => {
    const { editor } = await mount({ config_version: VERSION, entities: ENTRIES });
    const [anna] = keysOf(editor, 'entry');
    await remove(editor, anna!);
    expect($(editor, '[data-status-bar]')).not.toBeNull();
    emitChange(formOf(editor, 'content:days_to_show')!, { 'content:days_to_show': 9 });
    await settle(editor);
    expect($(editor, '[data-status-bar]')).toBeNull();
  });

  it('after a toolbar button, hands focus to Add Button once it closes', async () => {
    const lights = { icon: 'mdi:lightbulb', name: 'Lights', tap_action: { action: 'toggle' } };
    const { editor } = await mount({
      config_version: VERSION,
      entities: ['calendar.anna'],
      toolbar: { show: true, buttons: [lights] },
    });
    await openPageOf(editor, 'button:name', { kind: 'button', at: 0 } as never);
    const [key] = keysOf(editor, 'button');
    const remove = [
      ...editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(
        `.button-panel[data-button-key="${key}"] button`,
      ),
    ].find((button) => button.textContent?.trim() === 'Remove')!;
    remove.click();
    await settle(editor);
    expect($(editor, '[data-status-bar] .status-text')!.textContent!.trim()).toBe('Removed Lights');

    const form = formOf(editor, 'card:title')!;
    $(editor, '[data-focus="status-undo"]')!.focus();
    emitChange(form, { 'card:title': 'Family' });
    await settle(editor);
    expect(editor.shadowRoot!.activeElement).toBe($(editor, '.add-button'));
  });
});

describe('Quick Setup', () => {
  it('applies as one step from the card it opened on, and leaves its line', async () => {
    const opening = {
      config_version: VERSION,
      title: 'Our Week',
      entities: ['calendar.anna', { entity: 'calendar.ben', accent_color: '#123456' }],
    };
    const { editor, sent } = await mount(opening);
    const click = async (selector: string) => {
      $(editor, selector)!.click();
      await settle(editor);
    };
    await click('[data-quick-setup-open]');
    await click('[data-story="family_hub"]');
    for (let step = 0; step < 4; step++) await click('[data-quick-setup-next]');
    await click('[data-quick-setup-apply]');

    expect($(editor, '[data-status-bar] .status-text')!.textContent!.trim()).toBe(
      'Applied Family Hub',
    );
    expect(undoLabel(editor)).toBe('Undo: Apply Family Hub');
    await press(editor, 'undo');
    expect(sent[sent.length - 1]).toBe(JSON.stringify(opening));
    expect(internals(editor)._history.canUndo).toBe(false);
  });

  it('leaves no line where Apply changed nothing, so nothing else is undone from it', async () => {
    const { editor, sent } = await mount({ config_version: VERSION, entities: ['calendar.anna'] });
    const click = async (selector: string) => {
      $(editor, selector)!.click();
      await settle(editor);
    };
    const apply = async () => {
      await click('[data-quick-setup-open]');
      await click('[data-story="family_hub"]');
      for (let step = 0; step < 4; step++) await click('[data-quick-setup-next]');
      await click('[data-quick-setup-apply]');
    };
    await apply();
    await changeField(editor, 'card:title', 'Updated');
    await goOverview(editor);
    const before = sent.length;
    // The same story again over what it already wrote: nothing to apply.
    await apply();
    expect(sent).toHaveLength(before);
    expect($(editor, '[data-status-bar]')).toBeNull();
    expect(undoLabel(editor)).toBe('Undo: Change Title');
  });
});

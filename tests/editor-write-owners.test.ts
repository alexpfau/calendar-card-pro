/**
 * Every write knows what it belongs to: the card, one calendar entry, or one toolbar button
 * (backlog item 307).
 *
 * The editor used to name a calendar's or a button's form by its place in the list, captured when
 * the form was drawn, and drew the calendars' panels by place. A removal above an entry then handed
 * its panel, and the listener on it, to the entry after it, so an edit could land on the wrong
 * calendar; and a form wrote back everything it held, so one drawn before another write could undo
 * it. Now each entry and button carries a key the editor keeps beside the list, its panel is drawn
 * by that key, and a change writes only what moved in the form that sent it, over the owner as it
 * stands when the change arrives (`write-frames.ts`). A panel drawn by key takes its focused Remove
 * with it, so Remove puts focus back itself, where drawing by place used to leave it.
 *
 * Each test fails with a defect it exists for planted, against an unmutated control: the panels
 * drawn by place, an owner resolved by the index it had when drawn (for a change sent before the
 * next render, too), one baseline shared by every change, a baseline frozen when first drawn or
 * never reset by a render, an action compared as the same object rather than an equal one, a
 * changed action merged into the one it replaces, a change written alone through `writeEntity`,
 * a reordered calendar taking a new key, a key leaking into the configuration, focus left nowhere
 * after Remove, moved where it was not, or sent into a closed panel. They read what reached Home
 * Assistant whole, keys and all.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  type EditorElement,
  type FormElement,
  button,
  changeField,
  emitChange,
  entry,
  formOf,
  keysOf,
  lastConfig,
  mountEditor,
  openPageOf,
  openPanels,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import * as Buttons from '../src/rendering/editor/buttons';
import type { HaFormSchema } from '../src/rendering/editor/ha-form';
import { buildToolbarButtonSchema } from '../src/rendering/editor/schemas/card';
import * as WriteFrames from '../src/rendering/editor/write-frames';

const VERSION = Config.CURRENT_CONFIG_VERSION;
const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const LEO = 'calendar.leo';
const HOME = { icon: 'mdi:home', name: 'Home', tap_action: { action: 'navigate' } };
const LIGHTS = {
  icon: 'mdi:lightbulb',
  name: 'Lights',
  entity: 'light.hall',
  tap_action: { action: 'toggle' },
};
const FAN = { icon: 'mdi:fan', name: 'Fan', entity: 'fan.attic', tap_action: { action: 'toggle' } };

/** The editor's way of writing a field as a control it draws itself does. */
interface FieldWriter {
  _writeFieldValue(owner: WriteFrames.WriteOwner, fieldId: string, value: unknown): void;
  _writeFieldValues(owner: WriteFrames.WriteOwner, values: Readonly<Record<string, unknown>>): void;
}

/**
 * Mounts the editor, and hands every configuration it reports back to it, as Home Assistant does.
 *
 * @param config - Options beside the configuration version
 * @returns The editor, and every configuration it reported since
 */
async function mount(config: Record<string, unknown>) {
  const editor = await mountEditor({ config_version: VERSION, ...config });
  const reports: Array<Record<string, unknown>> = [];
  editor.addEventListener('config-changed', (event) => {
    const reported = (event as CustomEvent<{ config: Record<string, unknown> }>).detail.config;
    reports.push(structuredClone(reported));
    editor.setConfig(structuredClone(reported));
  });
  return { editor, reports, writer: editor as unknown as FieldWriter };
}

/**
 * One of an entry's or a button's action buttons, by the key its panel names and the words on it.
 *
 * @param editor - Editor element
 * @param kind - An entry's panel or a button's
 * @param key - The owner's key
 * @param label - The words on the button
 * @returns The button
 */
function action(
  editor: EditorElement,
  kind: 'entry' | 'button',
  key: number,
  label: string,
): HTMLButtonElement {
  const panel = editor.shadowRoot?.querySelector(
    kind === 'entry'
      ? `ha-expansion-panel.entity-panel[data-entry-key="${key}"]`
      : `ha-expansion-panel.button-panel[data-button-key="${key}"]`,
  );
  const found = [...(panel?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (found === undefined) throw new Error(`No ${label} on the ${kind} keyed ${key}`);
  return found;
}

/**
 * Presses a button and waits for the editor to draw what it did.
 *
 * @param editor - Editor element
 * @param control - The button
 */
async function press(editor: EditorElement, control: HTMLButtonElement): Promise<void> {
  control.click();
  await editor.updateComplete;
}

/**
 * Sends a change as `ha-form` itself does: it keeps the data it sends as its own, then sends it.
 * A second change before a render therefore carries the first, and every value the form was
 * drawn with, as the very objects it was drawn with.
 *
 * @param form - The form, as `formOf` found it
 * @param values - New values, by data key at the form's top level
 */
function sendAsHaForm(form: FormElement, values: Readonly<Record<string, unknown>>): void {
  form.data = { ...form.data, ...values };
  form.dispatchEvent(
    new CustomEvent('value-changed', {
      detail: { value: form.data },
      bubbles: true,
      composed: true,
    }),
  );
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("a card form's change", () => {
  it('lands in the workspace the form was drawn for, however late it arrives', async () => {
    const { editor, reports } = await mount({ entities: [ANNA], view: 'grid' });
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await openPageOf(editor, 'events:event_font_size');
    const shared = formOf(editor, 'events:event_font_size')!;

    await changeField(editor, 'workspace:editing_workspace', 'grid');
    expect(formOf(editor, 'events:event_font_size')).not.toBe(shared);
    emitChange(shared, { 'events:event_font_size': '31px' });
    await editor.updateComplete;

    expect(reports).toEqual([
      { config_version: VERSION, entities: [ANNA], view: 'grid', event_font_size: '31px' },
    ]);

    // The control: the form drawn for Grid writes the same field into Grid's own block.
    await changeField(editor, 'events:event_font_size', '33px');
    expect(lastConfig(editor)).toEqual({
      config_version: VERSION,
      entities: [ANNA],
      view: 'grid',
      event_font_size: '31px',
      time_grid: { event_font_size: '33px' },
    });
  });
});

describe('the entry in the middle', () => {
  it('keeps its own form when the entry above it leaves, and writes to its own calendar', async () => {
    const { editor, reports } = await mount({
      entities: [
        { entity: ANNA, label: 'A' },
        { entity: BEN, label: 'B' },
        { entity: LEO, label: 'L' },
      ],
    });
    await openPanels(editor);
    const [anna, ben, leo] = keysOf(editor, 'entry');
    const benForm = formOf(editor, 'calendar:label', entry(1))!;
    const leoForm = formOf(editor, 'calendar:label', entry(2))!;

    await press(editor, action(editor, 'entry', anna, 'Remove'));

    expect(keysOf(editor, 'entry')).toEqual([ben, leo]);
    expect(formOf(editor, 'calendar:label', entry({ key: ben }))).toBe(benForm);
    expect(formOf(editor, 'calendar:label', entry({ key: leo }))).toBe(leoForm);
    expect(formOf(editor, 'calendar:label', entry(0))).toBe(benForm);

    emitChange(benForm, { 'calendar:label': 'Ben' });
    emitChange(leoForm, { 'calendar:label': 'Leo' });
    await editor.updateComplete;

    expect(reports.slice(-2)).toEqual([
      {
        config_version: VERSION,
        entities: [
          { entity: BEN, label: 'Ben' },
          { entity: LEO, label: 'L' },
        ],
      },
      {
        config_version: VERSION,
        entities: [
          { entity: BEN, label: 'Ben' },
          { entity: LEO, label: 'Leo' },
        ],
      },
    ]);
  });

  it('finds the entries after it by key for changes sent before the removal is drawn', async () => {
    const { editor, reports } = await mount({
      entities: [
        { entity: ANNA, name: 'A' },
        { entity: BEN, name: 'B' },
        { entity: LEO, name: 'L' },
      ],
    });
    await openPanels(editor);
    const [anna, ben, leo] = keysOf(editor, 'entry');
    const benForm = formOf(editor, 'calendar:name', entry(1))!;
    const leoForm = formOf(editor, 'calendar:name', entry(2))!;

    // Both changes arrive before the render the removal asks for, so nothing drawn since hands
    // either form a fresh listener: each finds its entry as the change arrives.
    action(editor, 'entry', anna, 'Remove').click();
    emitChange(benForm, { 'calendar:name': 'Ben' });
    emitChange(leoForm, { 'calendar:name': 'Leo' });
    await editor.updateComplete;

    expect(reports).toEqual([
      {
        config_version: VERSION,
        entities: [
          { entity: BEN, name: 'B' },
          { entity: LEO, name: 'L' },
        ],
      },
      {
        config_version: VERSION,
        entities: [
          { entity: BEN, name: 'Ben' },
          { entity: LEO, name: 'L' },
        ],
      },
      {
        config_version: VERSION,
        entities: [
          { entity: BEN, name: 'Ben' },
          { entity: LEO, name: 'Leo' },
        ],
      },
    ]);
    expect(keysOf(editor, 'entry')).toEqual([ben, leo]);
    expect(formOf(editor, 'calendar:name', entry({ key: ben }))).toBe(benForm);
    expect(formOf(editor, 'calendar:name', entry({ key: leo }))).toBe(leoForm);
  });
});

describe('the button in the middle', () => {
  it('finds the buttons after it by key for changes sent before the removal is drawn', async () => {
    const { editor, reports } = await mount({
      entities: [ANNA],
      toolbar: { show: true, buttons: [HOME, LIGHTS, FAN] },
    });
    // Card & Header, each button's panel open on it.
    for (const at of [0, 1, 2]) await openPageOf(editor, 'button:name', button(at));
    const [home, lights, fan] = keysOf(editor, 'button');
    const lightsForm = formOf(editor, 'button:name', button(1))!;
    const fanForm = formOf(editor, 'button:name', button(2))!;

    action(editor, 'button', home, 'Remove').click();
    emitChange(lightsForm, { 'button:name': 'Hall lights' });
    emitChange(fanForm, { 'button:name': 'Attic fan' });
    await editor.updateComplete;

    const toolbar = (buttons: unknown[]) => ({
      config_version: VERSION,
      entities: [ANNA],
      toolbar: { show: true, buttons },
    });
    expect(reports).toEqual([
      toolbar([LIGHTS, FAN]),
      toolbar([{ ...LIGHTS, name: 'Hall lights' }, FAN]),
      toolbar([
        { ...LIGHTS, name: 'Hall lights' },
        { ...FAN, name: 'Attic fan' },
      ]),
    ]);
    expect(keysOf(editor, 'button')).toEqual([lights, fan]);
    expect(formOf(editor, 'button:name', button({ key: lights }))).toBe(lightsForm);
    expect(formOf(editor, 'button:name', button({ key: fan }))).toBe(fanForm);
  });
});

describe('the calendar picker', () => {
  it.each([
    {
      path: 'adds a calendar, which takes a new key',
      entities: [ANNA, BEN],
      picked: [ANNA, BEN, LEO],
      // Each place in `picked` by the place its entry had before, or -1 for a new one.
      from: [0, 1, -1],
    },
    {
      path: 'removes a calendar, its key going with it',
      entities: [ANNA, BEN, LEO],
      picked: [ANNA, LEO],
      from: [0, 2],
    },
    {
      path: 'reorders calendars, each keeping its own key',
      entities: [ANNA, BEN, LEO],
      picked: [LEO, ANNA, BEN],
      from: [2, 0, 1],
    },
    {
      path: 'moves a calendar listed twice with both its entries, each keeping its own key',
      entities: [ANNA, BEN, { entity: ANNA, event_type: 'all_day' }],
      picked: [BEN, ANNA],
      from: [1, 0, 2],
    },
  ])('$path, and every entry left writes to its own calendar', async (row) => {
    const { editor, reports } = await mount({ entities: row.entities });
    await openPanels(editor);
    const keys = keysOf(editor, 'entry');
    const forms = keys.map((key) => formOf(editor, 'calendar:color', entry({ key }))!);

    await changeField(editor, 'calendars:calendars', row.picked);
    await openPanels(editor);
    const after = keysOf(editor, 'entry');
    const listed = lastConfig(editor)?.entities as ReadonlyArray<unknown>;

    expect(after).toHaveLength(row.from.length);
    row.from.forEach((before, at) => {
      if (before < 0) expect(keys).not.toContain(after[at]);
      else {
        expect(after[at], `entry ${at}`).toBe(keys[before]);
        expect(listed[at], `entry ${at}`).toEqual(row.entities[before]);
        expect(formOf(editor, 'calendar:color', entry({ key: after[at] }))).toBe(forms[before]);
      }
    });

    // An edit in every entry's form, each from the form as it was drawn before the picker moved
    // the list, where the entry had one.
    for (const [at, key] of after.entries()) {
      const form = forms[keys.indexOf(key)] ?? formOf(editor, 'calendar:color', entry({ key }))!;
      emitChange(form, { 'calendar:color': `#00000${at}` });
      await editor.updateComplete;
    }
    expect(reports[reports.length - 1]).toEqual({
      config_version: VERSION,
      entities: listed.map((stored, at) => ({
        ...(typeof stored === 'string' ? { entity: stored } : (stored as object)),
        color: `#00000${at}`,
      })),
    });
  });
});

describe('a form drawn before another write', () => {
  it('writes only what it changed, keeping what the other write moved since', async () => {
    const { editor, reports } = await mount({
      entities: [
        { entity: ANNA, name: 'Old', color: 'red' },
        { entity: ANNA, label: 'Second' },
      ],
    });
    await openPanels(editor);
    const first = formOf(editor, 'calendar:color', entry(0))!;
    const second = formOf(editor, 'calendar:name', entry(1))!;
    expect(valueOf(editor, 'calendar:name', entry(0))).toBe('Old');

    // The calendar's name is the calendar's, so the second entry's form renames the first entry
    // too. Both changes arrive before a render hands the first form the new name.
    emitChange(second, { 'calendar:name': 'New' });
    emitChange(first, { 'calendar:color': 'blue' });
    await editor.updateComplete;

    expect(reports[reports.length - 1]).toEqual({
      config_version: VERSION,
      entities: [
        { entity: ANNA, name: 'New', color: 'blue' },
        { entity: ANNA, name: 'New', label: 'Second' },
      ],
    });
  });

  it.each([
    { when: 'before a render hands it what it sent', render: false },
    { when: 'once a render has handed it what it sent', render: true },
  ])('writes a field returned to the value it was drawn with, $when', async ({ render }) => {
    const { editor, reports } = await mount({ entities: [{ entity: ANNA, name: 'Old' }] });
    await openPageOf(editor, 'calendar:name', entry(0));
    const form: FormElement = formOf(editor, 'calendar:name', entry(0))!;

    emitChange(form, { 'calendar:name': 'New' });
    if (render) await editor.updateComplete;
    emitChange(form, { 'calendar:name': 'Old' });
    await editor.updateComplete;

    expect(reports).toEqual([
      { config_version: VERSION, entities: [{ entity: ANNA, name: 'New' }] },
      { config_version: VERSION, entities: [{ entity: ANNA, name: 'Old' }] },
    ]);
  });

  it('writes the value it was drawn with once a render has handed it what another wrote', async () => {
    const { editor, reports } = await mount({
      entities: [
        { entity: ANNA, name: 'Old' },
        { entity: ANNA, label: 'Second' },
      ],
    });
    await openPanels(editor);
    const first = formOf(editor, 'calendar:name', entry(0))!;

    await changeField(editor, 'calendar:name', 'New', entry(1));
    expect(valueOf(editor, 'calendar:name', entry(0))).toBe('New');
    emitChange(first, { 'calendar:name': 'Old' });
    await editor.updateComplete;

    expect(reports[reports.length - 1]).toEqual({
      config_version: VERSION,
      entities: [
        { entity: ANNA, name: 'Old' },
        { entity: ANNA, name: 'Old', label: 'Second' },
      ],
    });
  });

  it('keeps an action another write changed when the form sends its next change', async () => {
    const OLD = { action: 'navigate', navigation_path: '/old' };
    const NEW = { action: 'navigate', navigation_path: '/new' };
    const { editor, reports, writer } = await mount({
      entities: [ANNA],
      toolbar: { show: true, buttons: [{ ...HOME, tap_action: OLD }] },
    });
    await openPageOf(editor, 'button:name', button(0));
    const [home] = keysOf(editor, 'button');
    const form = formOf(editor, 'button:name', button(0))!;

    // The form's second change carries the action it was drawn with, the same object, while what
    // the editor compares it with is its copy of the first change: equal, and not the same.
    sendAsHaForm(form, { name: 'Hall' });
    writer._writeFieldValue({ kind: 'button', key: home }, 'button:tap_action', NEW);
    sendAsHaForm(form, { name: 'Hallway' });
    await editor.updateComplete;

    const toolbar = (name: string, tapAction: object) => ({
      config_version: VERSION,
      entities: [ANNA],
      toolbar: { show: true, buttons: [{ ...HOME, name, tap_action: tapAction }] },
    });
    expect(reports).toEqual([toolbar('Hall', OLD), toolbar('Hall', NEW), toolbar('Hallway', NEW)]);
  });
});

describe('a control the editor draws itself', () => {
  const ANNA_SET = {
    entity: ANNA,
    name: 'Anna',
    event_type: 'timed',
    blocklist: 'Private',
    allowlist: 'School',
    visibility: [{ condition: 'user', users: ['8a1c'] }],
    unknown_option: 'kept',
  };

  it("writes one calendar's field, keeping everything else the entry holds", async () => {
    const { editor, reports, writer } = await mount({ entities: [BEN, ANNA_SET] });
    const [, anna] = keysOf(editor, 'entry');

    writer._writeFieldValue({ kind: 'entry', key: anna }, 'calendar:color', '#f00');
    await editor.updateComplete;

    expect(reports).toEqual([
      { config_version: VERSION, entities: [BEN, { ...ANNA_SET, color: '#f00' }] },
    ]);
  });

  it("writes one button's field, keeping everything else the button holds", async () => {
    const { editor, reports, writer } = await mount({
      entities: [ANNA],
      toolbar: { show: true, buttons: [HOME, { ...LIGHTS, unknown_option: 'kept' }] },
    });
    // The buttons' keys are made as the Card & Header panel first draws them.
    await openPageOf(editor, 'card:title');
    const [, lights] = keysOf(editor, 'button');

    writer._writeFieldValue({ kind: 'button', key: lights }, 'button:name', 'Hall lights');
    await editor.updateComplete;

    expect(reports).toEqual([
      {
        config_version: VERSION,
        entities: [ANNA],
        toolbar: {
          show: true,
          buttons: [HOME, { ...LIGHTS, name: 'Hall lights', unknown_option: 'kept' }],
        },
      },
    ]);
  });

  it("writes a card field through its workspace, where that workspace's form would", async () => {
    const { editor, reports, writer } = await mount({ entities: [ANNA], view: 'grid' });

    writer._writeFieldValue(WriteFrames.CARD_OWNER, 'events:event_font_size', '18px');
    writer._writeFieldValue(WriteFrames.CARD_OWNER, 'layout:time_grid.start_time', '06:30');
    await editor.updateComplete;

    expect(reports[reports.length - 1]).toEqual({
      config_version: VERSION,
      entities: [ANNA],
      view: 'grid',
      time_grid: { event_font_size: '18px', start_time: '06:30' },
    });
  });

  it('writes several fields of one owner as one change, one drawn only once another is set', async () => {
    const { editor, reports, writer } = await mount({ entities: [ANNA_SET] });
    const [anna] = keysOf(editor, 'entry');
    await openPageOf(editor, 'calendar:accent_color_mode', entry(0));
    expect(formOf(editor, 'calendar:accent_color', entry(0))).toBeUndefined();

    writer._writeFieldValues(
      { kind: 'entry', key: anna },
      { 'calendar:accent_color_mode': 'custom', 'calendar:accent_color': '#e91e63' },
    );
    await editor.updateComplete;

    expect(reports).toEqual([
      { config_version: VERSION, entities: [{ ...ANNA_SET, accent_color: '#e91e63' }] },
    ]);
  });

  it('writes nothing for a field its owner has none of, or an owner that has left', async () => {
    const { editor, reports, writer } = await mount({ entities: [ANNA, BEN] });
    const [anna] = keysOf(editor, 'entry');

    writer._writeFieldValue({ kind: 'entry', key: anna }, 'button:name', 'Hall');
    writer._writeFieldValue({ kind: 'entry', key: anna }, 'calendar:no_such_option', 'x');
    writer._writeFieldValue(
      { kind: 'entry', key: Math.max(...keysOf(editor, 'entry')) + 1 },
      'calendar:color',
      '#f00',
    );
    await editor.updateComplete;

    expect(reports).toEqual([]);
  });
});

describe('a late change from an owner that has left', () => {
  it('writes nothing for a removed entry', async () => {
    const { editor, reports } = await mount({
      entities: [
        { entity: ANNA, label: 'A' },
        { entity: BEN, label: 'B' },
      ],
    });
    await openPanels(editor);
    const [anna] = keysOf(editor, 'entry');
    const annaForm = formOf(editor, 'calendar:label', entry(0))!;

    await press(editor, action(editor, 'entry', anna, 'Remove'));
    emitChange(annaForm, { 'calendar:label': 'Late' });
    await editor.updateComplete;

    expect(reports).toEqual([{ config_version: VERSION, entities: [{ entity: BEN, label: 'B' }] }]);
  });

  it('writes nothing for a removed button', async () => {
    const { editor, reports } = await mount({
      entities: [ANNA],
      toolbar: { show: true, buttons: [HOME, LIGHTS] },
    });
    for (const at of [0, 1]) await openPageOf(editor, 'button:name', button(at));
    const [home] = keysOf(editor, 'button');
    const homeForm = formOf(editor, 'button:name', button(0))!;

    await press(editor, action(editor, 'button', home, 'Remove'));
    emitChange(homeForm, { 'button:name': 'Late' });
    await editor.updateComplete;

    expect(reports).toEqual([
      { config_version: VERSION, entities: [ANNA], toolbar: { show: true, buttons: [LIGHTS] } },
    ]);
  });
});

describe("focus after a calendar's Remove", () => {
  const ENTRIES = [
    { entity: ANNA, label: 'A' },
    { entity: BEN, label: 'B' },
    { entity: LEO, label: 'L' },
  ];

  /**
   * A calendar's panel, by its key.
   *
   * @param editor - Editor element
   * @param key - The entry's key
   * @returns The panel
   */
  function panelOf(editor: EditorElement, key: number): Element & { expanded?: boolean } {
    return editor.shadowRoot!.querySelector(
      `ha-expansion-panel.entity-panel[data-entry-key="${key}"]`,
    )!;
  }

  /**
   * Presses a calendar's Remove, as a keyboard does: focused first. Waits until focus has moved.
   *
   * @param editor - Editor element
   * @param key - The entry's key
   */
  async function removeWithKeyboard(editor: EditorElement, key: number): Promise<void> {
    const remove = action(editor, 'entry', key, 'Remove');
    remove.focus();
    expect(editor.shadowRoot!.activeElement).toBe(remove);
    await press(editor, remove);
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('goes to the Remove of the calendar now in its place, whose panel opens for it', async () => {
    const { editor } = await mount({ entities: ENTRIES });
    await openPageOf(editor, 'calendar:label', entry(0));
    const [anna, ben] = keysOf(editor, 'entry');
    expect(panelOf(editor, ben).expanded).not.toBe(true);

    await removeWithKeyboard(editor, anna);

    expect(editor.shadowRoot!.activeElement).toBe(action(editor, 'entry', ben, 'Remove'));
    expect(panelOf(editor, ben).expanded).toBe(true);
    expect(formOf(editor, 'calendar:label', entry({ key: ben }))).toBeDefined();
  });

  it('goes to the Remove of the calendar before it, where it was the last', async () => {
    const { editor } = await mount({ entities: ENTRIES });
    await openPanels(editor);
    const [, ben, leo] = keysOf(editor, 'entry');

    await removeWithKeyboard(editor, leo);

    expect(editor.shadowRoot!.activeElement).toBe(action(editor, 'entry', ben, 'Remove'));
  });

  it('goes to the calendar picker, named after it, where no calendar is left', async () => {
    const { editor } = await mount({ entities: [ANNA] });
    await openPanels(editor);
    const [anna] = keysOf(editor, 'entry');

    await removeWithKeyboard(editor, anna);

    const focused = editor.shadowRoot!.activeElement as HTMLElement;
    expect(focused.contains(formOf(editor, 'calendars:calendars')!)).toBe(true);
    expect([focused.getAttribute('role'), focused.getAttribute('aria-label')]).toEqual([
      'group',
      'Calendars',
    ]);
  });

  it('stays where it was when Remove is pressed while focus is elsewhere', async () => {
    const { editor } = await mount({ entities: ENTRIES });
    await openPageOf(editor, 'calendar:label', entry(0));
    const [anna, ben] = keysOf(editor, 'entry');
    const picker = editor.shadowRoot!.querySelector<HTMLElement>('.calendar-picker')!;
    picker.focus();

    await press(editor, action(editor, 'entry', anna, 'Remove'));
    await new Promise((resolve) => setTimeout(resolve));

    expect(editor.shadowRoot!.activeElement).toBe(picker);
    expect(panelOf(editor, ben).expanded).not.toBe(true);
  });
});

describe("the entries' keys", () => {
  it('follow each calendar through Quick Setup, and back through Cancel', async () => {
    const { editor } = await mount({
      entities: [ANNA, { entity: BEN, label: 'B' }, { entity: ANNA, event_type: 'all_day' }],
    });
    const [anna, ben, annaAllDay] = keysOf(editor, 'entry');
    const click = async (selector: string) => {
      editor.shadowRoot!.querySelector<HTMLButtonElement>(selector)!.click();
      await editor.updateComplete;
    };

    await click('[data-quick-setup-open]');
    await click('[data-story="now_and_next"]');
    await click('[data-quick-setup-next]');
    await changeField(editor, 'quick_setup:card_calendars', [BEN, ANNA]);
    expect(keysOf(editor, 'entry')).toEqual([ben, anna, annaAllDay]);

    await click('[data-quick-setup-cancel]');
    expect(keysOf(editor, 'entry')).toEqual([anna, ben, annaAllDay]);
  });

  it('keep each place for a list changed outside the editor, which says nothing of its moves', async () => {
    const { editor } = await mount({ entities: [ANNA, BEN] });
    const [anna, ben] = keysOf(editor, 'entry');

    editor.setConfig({ config_version: VERSION, entities: [BEN, ANNA, LEO] });
    const after = keysOf(editor, 'entry');

    expect(after.slice(0, 2)).toEqual([anna, ben]);
    expect([anna, ben]).not.toContain(after[2]);
  });
});

describe('write-frames.ts', () => {
  it('writes only the fields the sending form draws', () => {
    const schema: HaFormSchema[] = [
      { name: 'label', selector: { text: {} } },
      { name: 'grid', type: 'grid', schema: [{ name: 'size', selector: { text: {} } }] },
    ] as HaFormSchema[];
    const frame: WriteFrames.OwnedFrame = {
      owner: { kind: 'entry', key: 0 },
      workspace: 'list',
      schema,
      data: { label: 'A', grid: { size: '1px' }, name: 'Anna', tap_action: { action: 'none' } },
    };

    expect(
      WriteFrames.writeSet(frame, {
        label: 'A',
        grid: { size: '2px' },
        name: 'Somebody else',
        tap_action: { action: 'toggle' },
      }),
    ).toEqual([['grid', 'size']]);
    expect(WriteFrames.writeSet(frame, { ...frame.data, label: undefined })).toEqual([['label']]);
  });

  it('compares an action whole: equal in another object is no change, any change is the action', () => {
    const frame: WriteFrames.OwnedFrame = {
      owner: { kind: 'button', key: 0 },
      workspace: 'list',
      schema: [{ name: 'tap_action', selector: { ui_action: {} } }] as HaFormSchema[],
      data: { tap_action: { action: 'navigate', navigation_path: '/old' } },
    };
    const sent = (tapAction: object) => WriteFrames.writeSet(frame, { tap_action: tapAction });

    expect(sent({ action: 'navigate', navigation_path: '/old' })).toEqual([]);
    expect(sent({ action: 'navigate', navigation_path: '/new' })).toEqual([['tap_action']]);
    expect(sent({ action: 'url', url_path: 'https://example.com' })).toEqual([['tap_action']]);
  });

  it('writes a changed action whole, keeping nothing of the one it replaces', () => {
    const stored = { ...HOME, tap_action: { action: 'navigate', navigation_path: '/old' } };
    const state: WriteFrames.WriteState = {
      config: {
        ...Config.DEFAULT_CONFIG,
        entities: [ANNA],
        toolbar: { show: true, buttons: [stored] },
      } as Types.Config,
      pending: {},
      authoredRootKeys: new Set(),
      gridResetKeys: new Set(),
      entryKeys: [0],
      buttonKeys: [7],
    };
    const frame: WriteFrames.OwnedFrame = {
      owner: { kind: 'button', key: 7 },
      workspace: 'list',
      schema: buildToolbarButtonSchema(),
      data: Buttons.toButtonFormData(stored),
    };
    const url = { action: 'url', url_path: 'https://example.com' };

    const written = WriteFrames.applyOwnedChange(state, frame, { ...frame.data, tap_action: url });

    expect(written?.config.toolbar).toEqual({
      show: true,
      buttons: [{ ...HOME, tap_action: url }],
    });
  });

  it("carries each calendar's keys to the list rebuilt a calendar at a time, in their order", () => {
    let next = 10;
    const mint = () => next++;
    const before = [ANNA, BEN, { entity: ANNA, event_type: 'all_day' as const }, LEO];

    expect(
      WriteFrames.carryEntryKeys(
        before,
        [0, 1, 2, 3],
        [BEN, { entity: ANNA, label: 'A' }, ANNA, 'calendar.family'],
        mint,
      ),
    ).toEqual([1, 0, 2, 10]);
    expect(WriteFrames.keysByPosition([0, 1, 2], 2, mint)).toEqual([0, 1]);
    expect(WriteFrames.keysByPosition([0, 1], 3, mint)).toEqual([0, 1, 11]);
  });
});

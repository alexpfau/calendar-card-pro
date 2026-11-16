/**
 * The test harness in `tests/helpers/editor-host.ts`, held to what the editor tests lean on.
 *
 * Every editor test finds its forms through the harness, so a harness that quietly picked the
 * wrong form would let those tests pass on the wrong field. These pin the four ways it must
 * refuse to guess; the owner it must pick when a filter draws some of a calendar's blocks and
 * not others; the event it must emit for a test to stand in for `ha-form`, from a field the
 * form draws and nothing else; and a panel opening across a render, as Home Assistant's does.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CARD,
  type FormElement,
  button,
  changeField,
  changeFields,
  emitChange,
  entry,
  fakeHass,
  formOf,
  formsOf,
  lastConfig,
  mountEditor,
  openPageOf,
  openPanels,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { ESSENTIALS_STORAGE_KEY } from '../src/rendering/editor/essentials';

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const LEO = 'calendar.leo';
const BACK = { icon: 'mdi:arrow-left', name: 'Back', tap_action: { action: 'back' } };

/**
 * Mounts the editor over calendars, at the current configuration version.
 *
 * @param entities - Calendars as stored
 * @param extra - Further options
 * @returns The editor
 */
function mount(entities: ReadonlyArray<unknown>, extra: Record<string, unknown> = {}) {
  return mountEditor({ config_version: Config.CURRENT_CONFIG_VERSION, entities, ...extra });
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.removeItem(ESSENTIALS_STORAGE_KEY);
});

describe('the owner of a form', () => {
  it('is a calendar block by its place in entities, whatever a search leaves out', async () => {
    const editor = await mount([
      { entity: ANNA, name: 'Anna' },
      { entity: BEN, name: 'Ben' },
      { entity: LEO, name: 'Leo' },
    ]);
    // A closed panel mounts no form: open the calendars' panels, as a user would to read them.
    await openPanels(editor);
    expect([0, 1, 2].map((index) => valueOf(editor, 'calendar:name', entry(index)))).toEqual([
      'Anna',
      'Ben',
      'Leo',
    ]);

    // Only Leo's panel answers, so the first calendar form drawn is the third block's.
    await changeField(editor, 'filter:search', 'Leo');

    expect(formsOf(editor, entry())).toHaveLength(1);
    expect(formOf(editor, 'calendar:name', entry(0))).toBeUndefined();
    expect(valueOf(editor, 'calendar:name', entry(2))).toBe('Leo');
  });

  it('is the block a filter keeps, not the first one showing the same data', async () => {
    // Both blocks show the same form data, the second having written the default. Customized
    // Only reads what each block wrote, so it keeps the second and leaves out the first.
    const editor = await mount([ANNA, { entity: ANNA, label_type: 'none' }]);
    await changeField(editor, 'filter:customized_only', true);

    expect(formsOf(editor, entry())).toHaveLength(1);
    expect(formOf(editor, 'calendar:label_type', entry(0))).toBeUndefined();
    await expect(changeField(editor, 'calendar:label_type', 'text', entry(0))).rejects.toThrow(
      "'calendar:label_type' is not drawn: entry 0 draws no form holding it.",
    );
    await changeField(editor, 'calendar:label_type', 'text', entry(1));
    expect(lastConfig(editor)?.entities).toEqual([ANNA, { entity: ANNA, label_type: 'text' }]);
  });

  it.each([
    {
      filter: 'Customized Only, the name both blocks show written by the second',
      entities: [ANNA, { entity: ANNA, name: 'Anna at home' }],
      criteria: { 'filter:customized_only': true },
      field: 'calendar:name',
      shown: [undefined, 'Anna at home'],
      write: undefined,
    },
    {
      filter: 'Essentials Only',
      entities: [ANNA, { entity: ANNA, label_type: 'none' }, BEN],
      criteria: { 'filter:essentials_only': true },
      field: 'calendar:label_type',
      shown: ['none', 'none', 'none'],
      write: {
        index: 1,
        value: 'text',
        entities: [ANNA, { entity: ANNA, label_type: 'text' }, BEN],
      },
    },
    {
      filter: 'a search one block answers',
      entities: [{ entity: ANNA, label: 'Kids' }, ANNA],
      criteria: { 'filter:search': 'kids' },
      field: 'calendar:label',
      shown: ['Kids', undefined],
      write: {
        index: 0,
        value: 'Kids at home',
        entities: [{ entity: ANNA, label: 'Kids at home' }, ANNA],
      },
    },
  ])('is each repeated block’s own under $filter', async (row) => {
    const editor = await mount(row.entities);
    // Essentials Only opens no panel by itself, and a closed panel mounts no form.
    await openPanels(editor);
    await changeFields(editor, row.criteria);

    const drawn = row.shown.flatMap((value, index) => (value === undefined ? [] : [index]));
    expect(formsOf(editor, entry())).toHaveLength(drawn.length);
    expect(
      row.shown.map((_, index) => formOf(editor, row.field, entry(index)) !== undefined),
    ).toEqual(row.shown.map((value) => value !== undefined));
    for (const index of drawn) {
      expect(valueOf(editor, row.field, entry(index)), `entry ${index}`).toBe(row.shown[index]);
    }
    if (row.write) {
      // The block named takes the change, and no other block moves.
      await changeField(editor, row.field, row.write.value, entry(row.write.index));
      expect(lastConfig(editor)?.entities).toEqual(row.write.entities);
    }
  });
});

describe('the harness refuses to guess', () => {
  it('fails on a mistyped id, naming it and the id it was probably meant to be', async () => {
    const editor = await mount([ANNA]);

    expect(() => formOf(editor, 'events:show_tme')).toThrow(
      "Unknown field id 'events:show_tme': no form draws it and no builder offers it. " +
        "Did you mean 'events:show_time'?",
    );
  });

  it('fails on an id two calendars draw when the test names neither, naming both', async () => {
    const editor = await mount([ANNA, BEN]);
    await openPanels(editor);

    expect(() => valueOf(editor, 'calendar:name')).toThrow(
      "'calendar:name' is drawn by entry 0 and entry 1: name the one meant, as entry(index).",
    );
  });

  it('fails on one owner drawing an id in two forms, naming both forms', async () => {
    const editor = await mount([ANNA]);
    await openPageOf(editor, 'events:show_time');
    const events = formOf(editor, 'events:show_time')!;
    // Planted: a second form of the same panel holding the same fields.
    const twin = document.createElement('ha-form') as FormElement;
    twin.className = 'panel-form';
    twin.schema = events.schema;
    twin.data = events.data;
    events.after(twin);
    const place = formsOf(editor).indexOf(events) + 1;

    expect(() => formOf(editor, 'events:show_time')).toThrow(
      `'events:show_time' is drawn twice by the card, in form ${place} (ha-form.panel-form) ` +
        `and form ${place + 1} (ha-form.panel-form): one owner's field belongs in one form.`,
    );
  });

  it('fails on a field asked of an owner of another kind, naming the one that draws it', async () => {
    const editor = await mount([ANNA], { toolbar: { show: true } });
    await openPageOf(editor, 'button:heading', CARD);

    expect(() => formOf(editor, 'button:heading')).toThrow(
      "'button:heading' is drawn by the card, not by any button: pass CARD.",
    );
    expect(formOf(editor, 'button:heading', CARD)).toBeDefined();
  });

  it('fails on a form it cannot place', async () => {
    const editor = await mount([ANNA]);
    const stray = document.createElement('ha-form');
    stray.className = 'mystery-form';
    editor.shadowRoot!.append(stray);

    expect(() => formsOf(editor)).toThrow(
      'The editor draws an ha-form the harness does not know, class "mystery-form"',
    );
  });
});

describe('a change', () => {
  it('is the event ha-form emits: its whole data, the value at its data path', async () => {
    const editor = await mount([ANNA], { toolbar: { show: true } });
    await openPageOf(editor, 'card:toolbar.reset');
    const form = formOf(editor, 'card:toolbar.reset')!;
    const before = form.data;
    const seen: CustomEvent[] = [];
    form.addEventListener('value-changed', (event) => seen.push(event as CustomEvent));

    await changeField(editor, 'card:toolbar.reset', true);

    expect(seen).toHaveLength(1);
    expect(seen[0].detail.value).toEqual({
      ...before,
      toolbar: { ...(before.toolbar as Record<string, unknown>), reset: true },
    });
    expect([seen[0].bubbles, seen[0].composed]).toEqual([true, true]);
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [ANNA],
      toolbar: { show: true, reset: true },
    });
  });

  it('comes only from an id the form draws, scope and all, even once the form is gone', async () => {
    const editor = await mount([ANNA], { toolbar: { show: true, buttons: [BACK] } });
    await openPageOf(editor, 'button:icon', button(0));
    const form = formOf(editor, 'button:icon', button(0))!;
    const refused =
      "The form does not draw 'buton:icon', so it cannot change it: its ids are button:….";

    expect(() => emitChange(form, { 'buton:icon': 'mdi:school' })).toThrow(refused);
    await editor.updateComplete;
    expect(lastConfig(editor)).toBeUndefined();

    // A search no button answers takes the form away, as a render replacing it would.
    await changeField(editor, 'filter:search', 'no button answers this');
    expect(form.isConnected).toBe(false);
    expect(() => emitChange(form, { 'buton:icon': 'mdi:school' })).toThrow(refused);
  });
});

describe('opening a page', () => {
  it('opens every panel around the field, outermost first, as Home Assistant’s does', async () => {
    const editor = await mount([ANNA, BEN]);
    const announced: string[] = [];
    for (const type of ['expanded-will-change', 'expanded-changed']) {
      editor.shadowRoot!.addEventListener(type, (event) =>
        announced.push(`${type} ${(event.target as HTMLElement & { header: string }).header}`),
      );
    }

    await openPageOf(editor, 'calendar:name', entry(1));

    expect(announced).toEqual([
      'expanded-will-change Calendars',
      'expanded-changed Calendars',
      'expanded-will-change calendar.ben',
      'expanded-changed calendar.ben',
    ]);
    const panel = formOf(editor, 'calendar:name', entry(1))!.closest('ha-expansion-panel');
    expect((panel as HTMLElement & { expanded: boolean }).expanded).toBe(true);
  });

  it('lets a frame pass between announcing a panel and opening it, as Home Assistant’s does', async () => {
    const editor = await mount([ANNA]);
    const seen: string[] = [];
    const state = (event: Event) =>
      (event.target as HTMLElement & { expanded?: boolean }).expanded === true ? 'open' : 'closed';
    editor.shadowRoot!.addEventListener('expanded-will-change', (event) => {
      seen.push(`will change while ${state(event)}`);
      queueMicrotask(() => seen.push('a microtask queued then'));
      requestAnimationFrame(() => seen.push('a frame asked for then'));
    });
    editor.shadowRoot!.addEventListener('expanded-changed', (event) =>
      seen.push(`changed, now ${state(event)}`),
    );

    await openPageOf(editor, 'events:show_time');

    expect(seen).toEqual([
      'will change while closed',
      'a microtask queued then',
      'a frame asked for then',
      'changed, now open',
    ]);
  });

  it('opens a panel in a test that holds time still, moving no clock', async () => {
    const editor = await mount([ANNA]);
    vi.useFakeTimers();
    try {
      const now = Date.now();
      await openPageOf(editor, 'events:show_time');

      expect(Date.now()).toBe(now);
      const panel = formOf(editor, 'events:show_time')!.closest('ha-expansion-panel');
      expect((panel as HTMLElement & { expanded: boolean }).expanded).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens a panel when time was faked before the harness was imported', async () => {
    const editor = await mount([ANNA]);
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const fresh = await import('./helpers/editor-host');
      const now = Date.now();
      await fresh.openPageOf(editor, 'events:show_time');

      expect(Date.now()).toBe(now);
      const panel = formOf(editor, 'events:show_time')!.closest('ha-expansion-panel');
      expect((panel as HTMLElement & { expanded: boolean }).expanded).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the fake Home Assistant', () => {
  it('refuses the card’s calendar subscription and accepts any other', async () => {
    const { connection } = fakeHass() as unknown as {
      connection: { subscribeMessage(callback: unknown, message: unknown): Promise<unknown> };
    };

    await expect(
      connection.subscribeMessage(() => undefined, { type: 'calendar/event/subscribe' }),
    ).rejects.toEqual({ code: 'unknown_command' });
    await expect(
      connection.subscribeMessage(() => undefined, { type: 'subscribe_condition' }),
    ).resolves.toBeTypeOf('function');
  });
});

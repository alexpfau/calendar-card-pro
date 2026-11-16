/**
 * The test harness in `tests/helpers/editor-host.ts`, held to what the editor tests lean on.
 *
 * Every editor test finds its forms through the harness, so a harness that quietly picked the
 * wrong form would let those tests pass on the wrong field. These pin the ways it must refuse to
 * guess, an entry page that is not the entry it names among them; the owner it must pick when a
 * filter draws some of a calendar's entries and not others; the event it must emit for a test to
 * stand in for `ha-form`, from a field the form draws and nothing else; a calendar entry's page
 * opened from its row; and a panel opening across a render, as Home Assistant's does.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CARD,
  type FormElement,
  button,
  changeField,
  emitChange,
  entry,
  fakeHass,
  formOf,
  formsOf,
  keysOf,
  labelOf,
  lastConfig,
  mountEditor,
  openPageOf,
  openPanels,
  resultRows,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const LEO = 'calendar.leo';
const BACK = { icon: 'mdi:arrow-left', name: 'Back', tap_action: { action: 'back' } };
const LEFT = { icon: 'mdi:chevron-left', name: 'Left', tap_action: { action: 'back' } };

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

/**
 * Which entries draw a form now, by place: each entry's page draws a form per field, so the forms
 * are counted by the entry that draws them.
 *
 * @param editor - Editor element
 * @param count - How many entries the card holds
 * @returns Whether each entry draws any form
 */
function drawing(editor: HTMLElement & { updateComplete: Promise<unknown> }, count: number) {
  return Array.from({ length: count }, (_, index) => formsOf(editor, entry(index)).length > 0);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('the owner of a form', () => {
  it('is a calendar block by its place in entities', async () => {
    const editor = await mount([ANNA, BEN, { entity: LEO, name: 'Leo' }]);
    // Only the page open draws its forms: visit every entry's page, as a user would to read them.
    await openPanels(editor);
    expect(drawing(editor, 3)).toEqual([true, true, true]);
    expect(valueOf(editor, 'calendar:name', entry(0))).toBeUndefined();
    expect(valueOf(editor, 'calendar:name', entry(2))).toBe('Leo');
  });

  it('is the block a search result opens, by its place in entities', async () => {
    const editor = await mount([{ entity: ANNA, label: 'Kids' }, ANNA]);
    await changeField(editor, 'filter:search', 'kids');
    // The search lists the first entry's fields only, the one whose label answers.
    const keys = keysOf(editor, 'entry');
    const owners = resultRows(editor).flatMap((row) => row.ownerKey ?? []);
    expect(new Set(owners)).toEqual(new Set([keys[0]]));

    await changeField(editor, 'calendar:label', 'Kids at home', entry(0));
    // Only the first entry's page opens, with its label among its fields.
    expect(formsOf(editor, entry())).toEqual(formsOf(editor, entry(0)));
    expect(formOf(editor, 'calendar:label', entry(0))).toBeDefined();
    expect(lastConfig(editor)?.entities).toEqual([{ entity: ANNA, label: 'Kids at home' }, ANNA]);
  });

  it.each([
    {
      filter: 'an essential setting every block draws',
      entities: [ANNA, { entity: ANNA, label_type: 'none' }, BEN],
      field: 'calendar:label_type',
      shown: ['none', 'none', 'none'],
      write: {
        index: 1,
        value: 'text',
        entities: [ANNA, { entity: ANNA, label_type: 'text' }, BEN],
      },
    },
  ])('is each repeated block’s own under $filter', async (row) => {
    const editor = await mount(row.entities);
    // Only the page open draws its forms: visit every entry's page first.
    await openPanels(editor);

    const drawn = row.shown.flatMap((value, index) => (value === undefined ? [] : [index]));
    expect(drawing(editor, row.shown.length)).toEqual(
      row.shown.map((value) => value !== undefined),
    );
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
    await openPageOf(editor, 'content:time_format');
    const events = formOf(editor, 'content:time_format')!;
    // Planted: a second form in the same field's wrapper, holding the same field.
    const twin = document.createElement('ha-form') as FormElement;
    twin.className = 'field-form';
    twin.schema = events.schema;
    twin.data = events.data;
    events.after(twin);
    const place = formsOf(editor).indexOf(events) + 1;

    expect(() => formOf(editor, 'content:time_format')).toThrow(
      `'content:time_format' is drawn twice by the card, in form ${place} (ha-form.field-form) ` +
        `and form ${place + 1} (ha-form.field-form): one owner's field belongs in one form.`,
    );
  });

  it('fails on a field asked of an owner of another kind, naming the one that draws it', async () => {
    const editor = await mount([ANNA]);
    await openPageOf(editor, 'calendar:name', entry(0));

    expect(() => formOf(editor, 'calendar:name', CARD)).toThrow(
      "'calendar:name' is drawn by entry 0, not by the card: pass entry(index).",
    );
    expect(formOf(editor, 'calendar:name', entry(0))).toBeDefined();
  });

  describe('fails on an entry page that is not the entry it names', () => {
    /**
     * The entry page the editor draws.
     *
     * @param editor - Editor element
     * @returns The page
     */
    const page = (editor: HTMLElement) => editor.shadowRoot!.querySelector('.entry-page')!;

    it('keyed for no entry the card holds, rather than reading it as drawing no form', async () => {
      const editor = await mount([ANNA, BEN]);
      await openPageOf(editor, 'calendar:name', entry(1));
      // Planted: the page keyed for an entry that is not on the card.
      page(editor).setAttribute('data-entry-key', '99');

      expect(() => formsOf(editor, entry(1))).toThrow('An entry page keyed 99 matches no entry');
    });

    it('keyed for another entry than the one whose data its forms hold', async () => {
      const editor = await mount([
        { entity: ANNA, name: 'Anna' },
        { entity: BEN, name: 'Ben' },
      ]);
      await openPageOf(editor, 'calendar:name', entry(1));
      // Planted: Ben's page keyed as Anna's.
      page(editor).setAttribute('data-entry-key', String(keysOf(editor, 'entry')[0]));

      expect(() => formsOf(editor, entry(0))).toThrow(
        "The page of entry 0 holds another entry's data",
      );
    });

    it('drawn twice at once', async () => {
      const editor = await mount([ANNA]);
      await openPageOf(editor, 'calendar:name', entry(0));
      page(editor).after(page(editor).cloneNode(true));

      expect(() => formsOf(editor, entry(0))).toThrow('The editor draws 2 entry pages at once');
    });
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
    const editor = await mount([ANNA]);
    await openPageOf(editor, 'card:toolbar.show');
    const form = formOf(editor, 'card:toolbar.show')!;
    const before = form.data;
    const seen: CustomEvent[] = [];
    form.addEventListener('value-changed', (event) => seen.push(event as CustomEvent));

    await changeField(editor, 'card:toolbar.show', true);

    expect(seen).toHaveLength(1);
    expect(seen[0].detail.value).toEqual({
      ...before,
      toolbar: { ...(before.toolbar as Record<string, unknown>), show: true },
    });
    expect([seen[0].bubbles, seen[0].composed]).toEqual([true, true]);
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [ANNA],
      toolbar: { show: true },
    });
  });

  it('presses a toggle chip as a user does, through the form standing in for it', async () => {
    const editor = await mount([ANNA]);
    // The event parts are the editor's own toggle chips, each composed for its field.
    await changeField(editor, 'events:show_location', false);
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [ANNA],
      // A List card is edited for List, whose own block the part is written in.
      list: { show_location: false },
    });
    expect(valueOf(editor, 'events:show_location')).toBe(false);
    expect(formOf(editor, 'events:show_location')!.className).toBe('composed-form');
    expect(labelOf(editor, 'events:show_location')).toBe('Show Location');

    // Asked for what it already shows, it is not pressed, and nothing more is written.
    await changeField(editor, 'events:show_location', false);
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: [ANNA],
      list: { show_location: false },
    });
    expect(() =>
      emitChange(formOf(editor, 'events:show_countdown')!, {
        'events:show_countdown': 'once_per_day',
      }),
    ).toThrow("'events:show_countdown' is a toggle chip");
    // A part its gate withholds is drawn, unpressable, and stands for no field built here.
    await changeField(editor, 'events:show_time', false);
    expect(formOf(editor, 'events:show_end_time')).toBeUndefined();
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
  it('goes to a card field’s page from the overview’s row, and back for an overview field', async () => {
    const editor = await mount([ANNA]);
    expect(formOf(editor, 'content:time_format')).toBeUndefined();

    await openPageOf(editor, 'content:time_format');
    expect(editor.shadowRoot!.querySelector('.page')!.getAttribute('data-page')).toBe('events');
    expect(formOf(editor, 'content:time_format')).toBeDefined();

    await openPageOf(editor, 'content:days_to_show');
    expect(editor.shadowRoot!.querySelector('.page')).toBeNull();
    expect(formOf(editor, 'content:days_to_show')).toBeDefined();
  });

  it('goes to a calendar entry’s page from its row, opening no panel', async () => {
    const editor = await mount([ANNA, BEN]);
    const announced: string[] = [];
    editor.shadowRoot!.addEventListener('expanded-will-change', (event) =>
      announced.push((event.target as Element).localName),
    );

    await openPageOf(editor, 'calendar:name', entry(1));

    const key = keysOf(editor, 'entry')[1];
    expect(editor.shadowRoot!.querySelector('.page')!.getAttribute('data-page')).toBe(
      `entry:${key}`,
    );
    expect(announced).toEqual([]);
    expect(formOf(editor, 'calendar:name', entry(1))).toBeDefined();
    expect(formOf(editor, 'calendar:name', entry(0))).toBeUndefined();
  });

  it('opens the button’s row around the field by its toggle, and no other row', async () => {
    const editor = await mount([ANNA], { toolbar: { show: true, buttons: [BACK, LEFT] } });

    await openPageOf(editor, 'button:icon', button(1));

    // The toolbar's buttons sit on Card & Header, each in a row of its own.
    const rows = [...editor.shadowRoot!.querySelectorAll('.button-row')];
    expect(
      rows.map((row) => row.querySelector('[aria-expanded]')!.getAttribute('aria-expanded')),
    ).toEqual(['false', 'true']);
    expect(formOf(editor, 'button:icon', button(1))!.closest('.button-row')).toBe(rows[1]);
  });

  it('opens a row in a test that holds time still, moving no clock', async () => {
    const editor = await mount([ANNA], { toolbar: { show: true, buttons: [BACK] } });
    vi.useFakeTimers();
    try {
      const now = Date.now();
      await openPageOf(editor, 'content:time_format');
      await openPageOf(editor, 'calendar:name', entry(0));
      await openPageOf(editor, 'button:icon', button(0));

      expect(Date.now()).toBe(now);
      const row = formOf(editor, 'button:icon', button(0))!.closest('.button-row');
      expect(row?.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens a row when time was faked before the harness was imported', async () => {
    const editor = await mount([ANNA], { toolbar: { show: true, buttons: [BACK] } });
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const fresh = await import('./helpers/editor-host');
      const now = Date.now();
      await fresh.openPageOf(editor, 'button:icon', fresh.button(0));

      expect(Date.now()).toBe(now);
      const row = formOf(editor, 'button:icon', button(0))!.closest('.button-row');
      expect(row?.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true');
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

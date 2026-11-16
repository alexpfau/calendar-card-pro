/**
 * The calendar list's rows and their action strips: what each row is called, and what each action
 * in a strip writes. Moved here from the per-calendar panels' tests when the panels and the
 * calendar picker retired, each case re-asked of the list that took over their jobs.
 *
 * Three separate things are pinned here, and each fails in a way the others cannot see.
 *
 * The **title** is a name resolved out of the configuration and `hass`, so it has several
 * outcomes for one input: the card's own name, Home Assistant's, and the entity id where neither
 * is usable. A test that only ever supplies a populated `hass` proves nothing about a calendar the
 * user has since deleted from Home Assistant, which is the case where a blank title would be
 * worst — the row would name nothing at all, right where the user needs to know which to remove.
 *
 * **Grouping** only shows when a calendar is listed twice, and duplicates are exactly what the
 * default config does not have. Both directions are here: a single listing must not gain a
 * calendar row, and entries of one calendar sit under it even where the stored list has another
 * calendar between them, in first-occurrence order — the only order anything downstream reads.
 *
 * The **actions** write the list directly. Each is checked against what it reports to Home
 * Assistant, and the moves against a calendar listed twice, whose entries must travel together
 * and keep their relative order, which decides whose copy wins under Filter Duplicates.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeHass, keysOf, lastConfig, mountEditor } from './helpers/editor-host';
import * as Config from '../src/config/config';
import * as Entities from '../src/rendering/editor/entities';
import editorStyles from '../src/rendering/editor/styles';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

/** A calendar Home Assistant knows about, under a name that is not its id. */
const FAMILY_STATE = {
  entity_id: 'calendar.calendar_card_pro_family',
  state: 'on',
  attributes: { friendly_name: 'Calendar card pro - family' },
};

/**
 * Mounts the editor over calendars.
 *
 * @param entities - Calendars as they would be stored in the card config
 * @param states - The entities Home Assistant is holding, keyed by entity id
 * @returns The editor
 */
function mount(entities: ReadonlyArray<unknown>, states: Record<string, unknown> = {}) {
  return mountEditor(
    { config_version: Config.CURRENT_CONFIG_VERSION, entities },
    { hass: fakeHass({ states }) },
  );
}

/**
 * What the list names each calendar: its calendar row's title where it has one, else its row's.
 *
 * @param editor - The editor
 * @returns One title per calendar, in list order
 */
function titles(editor: Editor): Array<string | undefined> {
  return [...editor.shadowRoot!.querySelectorAll('.cal-group')].map(
    (group) => group.querySelector('.cal-title')?.textContent ?? undefined,
  );
}

/**
 * Every row's title and summary, calendar rows included, as "title / summary".
 *
 * @param editor - The editor
 * @returns One line per row, in order
 */
function rows(editor: Editor): string[] {
  return [...editor.shadowRoot!.querySelectorAll('.cal-row')].map(
    (row) =>
      `${row.querySelector('.cal-title')?.textContent} / ${row
        .querySelector('.cal-summary')
        ?.textContent?.trim()}`,
  );
}

/**
 * Presses one of the editor's own controls by its `data-focus` key.
 *
 * @param editor - The editor
 * @param focus - The key
 */
async function press(editor: Editor, focus: string): Promise<void> {
  const control = editor.shadowRoot!.querySelector<HTMLButtonElement>(`[data-focus="${focus}"]`);
  if (!control) throw new Error(`no control ${focus}`);
  control.click();
  await editor.updateComplete;
}

/**
 * Opens a row's strip and presses one of its actions.
 *
 * @param editor - The editor
 * @param row - The strip's key: `entry:<key>` or `calendar:<entity id>`
 * @param action - The action's id
 */
async function act(editor: Editor, row: string, action: string): Promise<void> {
  await press(editor, `more:${row}`);
  await press(editor, `strip:${row}:${action}`);
}

/**
 * States for calendars Home Assistant has, each named by its id, so no row warns it is missing.
 *
 * @param ids - The calendars
 * @returns The states, by entity id
 */
function known(...ids: string[]): Record<string, unknown> {
  return Object.fromEntries(ids.map((id) => [id, { entity_id: id, state: 'off', attributes: {} }]));
}

beforeEach(() => Entities.clearCopiedSettings());
afterEach(() => document.body.replaceChildren());

describe('row titles', () => {
  it('names the calendar the way Home Assistant does, not by its entity id', async () => {
    const editor = await mount([FAMILY_STATE.entity_id], {
      [FAMILY_STATE.entity_id]: FAMILY_STATE,
    });

    expect(titles(editor)).toEqual(['Calendar card pro - family']);
  });

  it('keeps showing the entity id for a calendar Home Assistant no longer has', async () => {
    // The row a user most needs to identify is the one for a calendar they deleted, and
    // it is the one with no name to resolve. Anything but the id here is a blank title.
    const editor = await mount(['calendar.deleted_last_week'], {
      [FAMILY_STATE.entity_id]: FAMILY_STATE,
    });

    expect(titles(editor)).toEqual(['calendar.deleted_last_week']);
    expect(rows(editor)).toEqual([
      'calendar.deleted_last_week / Not found in Home Assistant · All events · Set: 0',
    ]);
  });

  it('falls back to the entity id when the state carries no usable name', async () => {
    const editor = await mount(['calendar.unnamed', 'calendar.blank'], {
      'calendar.unnamed': { entity_id: 'calendar.unnamed', state: 'on', attributes: {} },
      'calendar.blank': {
        entity_id: 'calendar.blank',
        state: 'on',
        attributes: { friendly_name: '   ' },
      },
    });

    expect(titles(editor)).toEqual(['calendar.unnamed', 'calendar.blank']);
  });
});

describe('rows of a calendar listed more than once', () => {
  it('draws one row per calendar listed once, with no calendar row', async () => {
    const editor = await mount(
      ['calendar.a', { entity: 'calendar.b', label: 'Work' }],
      known('calendar.a', 'calendar.b'),
    );

    expect(rows(editor)).toEqual([
      'calendar.a / All events · Set: 0',
      'calendar.b / All events · Set: 1',
    ]);
    expect(editor.shadowRoot!.querySelectorAll('.cal-row-head')).toHaveLength(0);
  });

  it('groups its entries under a calendar row, in first-occurrence order', async () => {
    const editor = await mount(
      [
        { entity: 'calendar.family', event_type: 'all_day' },
        'calendar.other',
        { entity: 'calendar.family', event_type: 'timed' },
      ],
      known('calendar.family', 'calendar.other'),
    );

    // The two entries of one calendar need not be adjacent in the YAML; the list draws them
    // together, where the calendar first appears, as everything downstream reads it.
    expect(rows(editor)).toEqual([
      'calendar.family / Entries: 2',
      'All-day events / Set: 1',
      'Events with a time / Set: 1',
      'calendar.other / All events · Set: 0',
    ]);
  });
});

/**
 * The title is the calendar's name on this card, else Home Assistant's, else its id
 * (backlog item 148's decision table, re-asked of the rows that replaced the panels' heading and
 * secondary line). Each case reads "title" per calendar; a calendar listed twice reads its
 * calendar row's title, which every entry of it shares.
 */
describe("the calendar's own name on its row", () => {
  const FAMILY = FAMILY_STATE.entity_id;
  const HA = 'Calendar card pro - family';

  it.each<[string, unknown[], string[]]>([
    ['1. no settings', [FAMILY], [HA]],
    ['2. only a color', [{ entity: FAMILY, accent_color: '#e67e22' }], [HA]],
    ['3. a label', [{ entity: FAMILY, label: 'School' }], [HA]],
    ['4. a name', [{ entity: FAMILY, name: 'Kids' }], ['Kids']],
    ['5. a name and a label', [{ entity: FAMILY, name: 'Kids', label: 'School' }], ['Kids']],
    [
      '6. listed twice, a name, different labels',
      [
        { entity: FAMILY, name: 'Kids', label: 'School', event_type: 'timed' },
        { entity: FAMILY, name: 'Kids', label: 'Holidays', event_type: 'all_day' },
      ],
      ['Kids'],
    ],
    [
      '6b. the same, the name on the first entry only',
      [
        { entity: FAMILY, name: 'Kids', label: 'School' },
        { entity: FAMILY, label: 'Holidays' },
      ],
      ['Kids'],
    ],
    ["7. a name equal to Home Assistant's", [{ entity: FAMILY, name: HA }], [HA]],
    [
      '8. a name, the calendar gone from Home Assistant',
      [{ entity: 'calendar.old_school', name: 'Old school' }],
      ['Old school'],
    ],
    [
      '9. a name and an icon label',
      [{ entity: FAMILY, name: 'Kids', label: 'mdi:school' }],
      ['Kids'],
    ],
  ])('%s', async (_case, entities, expected) => {
    const editor = await mount(entities, { [FAMILY]: FAMILY_STATE });

    expect(titles(editor)).toEqual(expected);
  });

  /** Names as written by hand, with spaces around them or none at all. */
  it.each<[string, string, unknown[], string[]]>([
    [
      'a name with spaces around it reads trimmed',
      HA,
      [{ entity: FAMILY, name: '  Kids  ' }],
      ['Kids'],
    ],
    ['a blank name is no name', HA, [{ entity: FAMILY, name: '' }], [HA]],
    ['a name of spaces only is no name', HA, [{ entity: FAMILY, name: '   ' }], [HA]],
    [
      'a name of spaces only on one entry, and a name on the other',
      HA,
      [
        { entity: FAMILY, name: '   ', label: 'School' },
        { entity: FAMILY, name: 'Kids', label: 'Holidays' },
      ],
      ['Kids'],
    ],
    ["Home Assistant's name blank, so the title is the entity id", '', [FAMILY], [FAMILY]],
    [
      "Home Assistant's name of spaces only, so the title is the entity id",
      '   ',
      [FAMILY],
      [FAMILY],
    ],
    ['both of spaces only', '   ', [{ entity: FAMILY, name: '   ' }], [FAMILY]],
  ])('%s', async (_case, friendlyName, entities, expected) => {
    const state = { ...FAMILY_STATE, attributes: { friendly_name: friendlyName } };
    const editor = await mount(entities, { [FAMILY]: state });

    expect(titles(editor)).toEqual(expected);
  });
});

describe('the strip', () => {
  it('offers a calendar listed once every action, the moves first and Remove last', async () => {
    const editor = await mount(['calendar.a', 'calendar.b']);
    const [key] = keysOf(editor, 'entry');
    await press(editor, `more:entry:${key}`);

    const strip = editor.shadowRoot!.querySelector('.strip')!;
    expect([...strip.querySelectorAll('.strip-label')].map((label) => label.textContent)).toEqual([
      'Move Up',
      'Move Down',
      'Move to Top',
      'Duplicate',
      'Copy Settings',
      'Paste Settings',
      'Remove',
    ]);
    // Remove is the one that takes something away: last, and in Home Assistant's
    // destructive color. No confirmation; the line it leaves carries Undo.
    expect(strip.lastElementChild!.classList.contains('destructive')).toBe(true);
  });

  it('draws Remove in the destructive color, in the stylesheet', () => {
    const css = editorStyles.cssText;
    expect(css).toMatch(/\.strip-button\.destructive\s*\{[^}]*color:\s*var\(--error-color/);
  });

  it('lists the calendar again, next to the one it came from, with its settings', async () => {
    const editor = await mount([
      { entity: 'calendar.family', event_type: 'all_day', accent_color: '#9e9e9e' },
      'calendar.other',
    ]);

    await act(editor, `entry:${keysOf(editor, 'entry')[0]}`, 'duplicate');

    expect(lastConfig(editor)?.entities).toEqual([
      { entity: 'calendar.family', event_type: 'all_day', accent_color: '#9e9e9e' },
      { entity: 'calendar.family', event_type: 'all_day', accent_color: '#9e9e9e' },
      'calendar.other',
    ]);
  });

  it('gives the new entry a row of its own, under its calendar, numbered', async () => {
    const editor = await mount([{ entity: 'calendar.family', event_type: 'all_day' }], {
      'calendar.family': {
        entity_id: 'calendar.family',
        state: 'on',
        attributes: { friendly_name: 'Family' },
      },
    });

    await act(editor, `entry:${keysOf(editor, 'entry')[0]}`, 'duplicate');
    await press(editor, 'back-top');

    expect(rows(editor)).toEqual([
      'Family / Entries: 2',
      'All-day events / Set: 1',
      'All-day events / Set: 1',
    ]);
    expect(
      [...editor.shadowRoot!.querySelectorAll('.cal-body')].map((row) =>
        row.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Edit Family, All-day events, Set: 1, entry 1 of 2',
      'Edit Family, All-day events, Set: 1, entry 2 of 2',
    ]);
  });

  it('removes one entry without touching the other entry of the same calendar', async () => {
    const editor = await mount([
      { entity: 'calendar.family', event_type: 'all_day' },
      { entity: 'calendar.family', event_type: 'timed' },
    ]);

    await act(editor, `entry:${keysOf(editor, 'entry')[0]}`, 'remove');

    // An entry inside a calendar's group offers Remove This Entry, which takes it alone.
    expect(lastConfig(editor)?.entities).toEqual([
      { entity: 'calendar.family', event_type: 'timed' },
    ]);
  });

  it('removes a calendar with every entry it has from its calendar row', async () => {
    const editor = await mount([
      { entity: 'calendar.family', event_type: 'all_day' },
      'calendar.other',
      { entity: 'calendar.family', event_type: 'timed' },
    ]);

    await act(editor, 'calendar:calendar.family', 'remove');

    expect(lastConfig(editor)?.entities).toEqual(['calendar.other']);
  });

  it('removes the last calendar, leaving the empty list', async () => {
    const editor = await mount(['calendar.only']);

    await act(editor, `entry:${keysOf(editor, 'entry')[0]}`, 'remove');

    expect(lastConfig(editor)?.entities).toEqual([]);
  });

  it('moves a calendar with both its entries, in their order, from its calendar row', async () => {
    const editor = await mount([
      { entity: 'calendar.family', event_type: 'all_day' },
      'calendar.other',
      { entity: 'calendar.family', event_type: 'timed' },
    ]);

    await act(editor, 'calendar:calendar.family', 'down');

    // The first entry keeps its priority under Filter Duplicates: nothing reorders the entries
    // of one calendar.
    expect(lastConfig(editor)?.entities).toEqual([
      'calendar.other',
      { entity: 'calendar.family', event_type: 'all_day' },
      { entity: 'calendar.family', event_type: 'timed' },
    ]);
  });

  it('offers no move inside a calendar’s group, only on its calendar row', async () => {
    const editor = await mount([
      { entity: 'calendar.family', event_type: 'all_day' },
      { entity: 'calendar.family', event_type: 'timed' },
    ]);
    await press(editor, `more:entry:${keysOf(editor, 'entry')[1]}`);

    expect(
      [...editor.shadowRoot!.querySelectorAll('.strip .strip-label')].map(
        (label) => label.textContent,
      ),
    ).toEqual(['Duplicate', 'Copy Settings', 'Paste Settings', 'Remove This Entry']);
  });
});

describe('duplicate list algebra', () => {
  it('copies the settings object rather than sharing it', () => {
    const source = { entity: 'calendar.family', event_type: 'all_day' as const };
    const next = Entities.duplicateEntity([source], 0);

    // Identity, not equality: sharing one object would pass every `toEqual` in this file
    // and then edit both blocks at once the first time either dropdown moved.
    expect(next[0]).not.toBe(next[1]);
    expect(next[0]).toEqual(next[1]);
  });

  it('leaves the list alone for an index that is not in it', () => {
    const entities = ['calendar.a', 'calendar.b'];

    expect(Entities.duplicateEntity(entities, 5)).toEqual(entities);
    expect(Entities.duplicateEntity(entities, -1)).toEqual(entities);
    expect(Entities.removeEntity(entities, 5)).toEqual(entities);
    expect(Entities.removeEntity(entities, -1)).toEqual(entities);
  });

  it('counts a calendar among its own duplicates only', () => {
    const entities = ['calendar.a', 'calendar.b', 'calendar.a', 'calendar.a'];

    expect(Entities.occurrenceOf(entities, 0)).toEqual({ position: 1, total: 3 });
    expect(Entities.occurrenceOf(entities, 1)).toEqual({ position: 1, total: 1 });
    expect(Entities.occurrenceOf(entities, 3)).toEqual({ position: 3, total: 3 });
    expect(Entities.occurrenceOf(entities, 9)).toEqual({ position: 0, total: 0 });
  });
});

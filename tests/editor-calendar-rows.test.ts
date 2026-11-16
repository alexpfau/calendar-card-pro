/**
 * The calendar list's rows and a calendar entry's page, as a user meets them: what each row says
 * and is called, which actions it offers where, where focus goes and what is announced after each
 * one, and what the entry page warns about. What each action writes is pinned in
 * `editor-calendar-strip.test.ts`; the list operations themselves in `editor-calendar-list.test.ts`.
 */

import { LitElement } from 'lit';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CHASSIS,
  changeField,
  fakeHass,
  goEntry,
  keysOf,
  lastConfig,
  mountEditor,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import * as Entities from '../src/rendering/editor/entities';
import { ESSENTIALS_STORAGE_KEY } from '../src/rendering/editor/essentials';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const ANNA = 'calendar.anna';
const BEN = 'calendar.ben';
const LEO = 'calendar.leo';
const FAMILY = 'calendar.family';

/**
 * States for calendars Home Assistant has, each under a name of its own.
 *
 * @param names - Entity id to friendly name
 * @returns The states, by entity id
 */
function states(names: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(names).map(([id, name]) => [
      id,
      { entity_id: id, state: 'off', attributes: { friendly_name: name } },
    ]),
  );
}

const NAMED = states({ [ANNA]: 'Anna', [BEN]: 'Ben', [LEO]: 'Leo', [FAMILY]: 'Family' });

/**
 * Mounts the editor over calendars, Home Assistant knowing the four named ones.
 *
 * @param entities - Calendars as stored
 * @param hass - States, if not the four named ones
 * @returns The editor
 */
function mount(entities: ReadonlyArray<unknown>, hass = NAMED): Promise<Editor> {
  return mountEditor(
    { config_version: Config.CURRENT_CONFIG_VERSION, entities },
    { hass: fakeHass({ states: hass }) },
  );
}

/**
 * One of the editor's own controls, by its `data-focus` key.
 *
 * @param editor - The editor
 * @param focus - The key
 * @returns The control, or null
 */
function control(editor: Editor, focus: string): HTMLButtonElement | null {
  return editor.shadowRoot!.querySelector<HTMLButtonElement>(`[data-focus="${focus}"]`);
}

/**
 * Presses one of the editor's own controls.
 *
 * @param editor - The editor
 * @param focus - Its `data-focus` key
 */
async function press(editor: Editor, focus: string): Promise<void> {
  const found = control(editor, focus);
  if (!found) throw new Error(`no control ${focus}`);
  found.click();
  await editor.updateComplete;
  // Focus moves once the render that follows has settled.
  await editor.updateComplete;
}

/**
 * The `data-focus` key of what has focus inside the editor, else its class.
 *
 * @param editor - The editor
 * @returns The key
 */
function focused(editor: Editor): string | undefined {
  const active = editor.shadowRoot!.activeElement as HTMLElement | null;
  return active?.dataset.focus ?? active?.className;
}

/**
 * What the live region says now.
 *
 * @param editor - The editor
 * @returns Its text
 */
function said(editor: Editor): string {
  return editor.shadowRoot!.querySelector('.live-region')?.textContent?.trim() ?? '';
}

/**
 * Each entry row's accessible name and visible summary.
 *
 * @param editor - The editor
 * @returns Name and summary per row
 */
function rows(editor: Editor): Array<[string | null, string | undefined]> {
  return [...editor.shadowRoot!.querySelectorAll('.cal-body')].map((row) => [
    row.getAttribute('aria-label'),
    row.querySelector('.cal-summary')?.textContent?.trim(),
  ]);
}

/**
 * Each action of the strip open, as "label: name", disabled ones marked.
 *
 * @param editor - The editor
 * @returns The actions
 */
function actions(editor: Editor): string[] {
  return [...editor.shadowRoot!.querySelectorAll<HTMLButtonElement>('.strip .strip-button')].map(
    (button) =>
      `${button.querySelector('.strip-label')?.textContent}${button.disabled ? ' (off)' : ''}`,
  );
}

/** Home Assistant's Visibility editor, as a stand-in declaring the two properties it is fed. */
class ConditionsEditorStub extends LitElement {
  static override properties = {
    hass: { attribute: false },
    conditions: { attribute: false },
  };

  declare conditions: ReadonlyArray<unknown>;
}

beforeAll(() => {
  if (!customElements.get('ha-card-conditions-editor')) {
    customElements.define('ha-card-conditions-editor', ConditionsEditorStub);
  }
});
beforeEach(() => Entities.clearCopiedSettings());
afterEach(() => {
  document.body.replaceChildren();
  localStorage.removeItem(ESSENTIALS_STORAGE_KEY);
});

describe('a row', () => {
  it('says what the entry does in at most two parts, then what it sets', async () => {
    const editor = await mount([
      { entity: ANNA, blocklist: 'Homework|Chores', label: '🎒', name: 'Anna' },
      { entity: BEN, event_type: 'timed', allowlist: 'School|PTA', days_of_week: 'weekdays' },
      { entity: LEO, days_of_week: 'weekends', allday_expires_at: '18:00' },
      { entity: FAMILY, visibility: [{ condition: 'user', users: ['x'] }] },
    ]);

    expect(rows(editor)).toEqual([
      ['Edit Anna, Without: Homework, Chores, Set: 3', 'Without: Homework, Chores · Set: 3'],
      [
        'Edit Ben, Events with a time, Only: School, PTA, Set: 3',
        'Events with a time · Only: School, PTA · Set: 3',
      ],
      [
        'Edit Leo, Weekend days, Expires at 18:00, Set: 2',
        'Weekend days · Expires at 18:00 · Set: 2',
      ],
      ['Edit Family, Shown under conditions, Set: 1', 'Shown under conditions · Set: 1'],
    ]);
  });

  it('says "All events" and "Set: 0" for a bare calendar', async () => {
    const editor = await mount([ANNA]);

    expect(rows(editor)).toEqual([['Edit Anna, All events, Set: 0', 'All events · Set: 0']]);
  });

  it('names an entry of a calendar listed twice with its parts and its position', async () => {
    const editor = await mount([
      { entity: FAMILY, event_type: 'all_day' },
      ANNA,
      { entity: FAMILY, event_type: 'timed', blocklist: 'Private' },
    ]);
    const [first, , third] = keysOf(editor, 'entry');

    expect(rows(editor).map(([name]) => name)).toEqual([
      'Edit Family, All-day events, Set: 1, entry 1 of 2',
      'Edit Family, Events with a time, Without: Private, Set: 2, entry 2 of 2',
      'Edit Anna, All events, Set: 0',
    ]);
    expect(control(editor, `more:entry:${first}`)?.getAttribute('aria-label')).toBe(
      'Actions for Family, All-day events',
    );
    expect(control(editor, `more:entry:${third}`)?.getAttribute('aria-label')).toBe(
      'Actions for Family, Events with a time',
    );
    expect(control(editor, `more:calendar:${FAMILY}`)?.getAttribute('aria-label')).toBe(
      'Actions for Family',
    );
  });
});

describe('the strip', () => {
  it('disables the moves that go nowhere, at the top and at the bottom', async () => {
    const editor = await mount([ANNA, BEN, LEO]);
    const [anna, ben, leo] = keysOf(editor, 'entry');

    await press(editor, `more:entry:${anna}`);
    expect(actions(editor).slice(0, 3)).toEqual([
      'Move Up (off)',
      'Move Down',
      'Move to Top (off)',
    ]);
    await press(editor, `more:entry:${ben}`);
    expect(actions(editor).slice(0, 3)).toEqual(['Move Up', 'Move Down', 'Move to Top']);
    await press(editor, `more:entry:${leo}`);
    expect(actions(editor).slice(0, 3)).toEqual(['Move Up', 'Move Down (off)', 'Move to Top']);
    // One strip at a time.
    expect(editor.shadowRoot!.querySelectorAll('.strip')).toHaveLength(1);
  });

  it('offers Copy only where there is something to copy, and Paste once something is', async () => {
    const editor = await mount([
      { entity: ANNA, name: 'Anna' },
      { entity: BEN, label: 'B' },
    ]);
    const [anna, ben] = keysOf(editor, 'entry');

    await press(editor, `more:entry:${anna}`);
    // A name belongs to the calendar, so it is not copied.
    expect(actions(editor).slice(4, 6)).toEqual(['Copy Settings (off)', 'Paste Settings (off)']);
    expect(control(editor, `strip:entry:${anna}:paste`)?.textContent).toContain(
      'Copy settings first',
    );

    await press(editor, `more:entry:${ben}`);
    await press(editor, `strip:entry:${ben}:copy`);
    await press(editor, `more:entry:${anna}`);
    expect(actions(editor).slice(4, 6)).toEqual(['Copy Settings (off)', 'Paste Settings']);
    expect(control(editor, `strip:entry:${anna}:paste`)?.textContent).toContain('From Ben');
  });

  it('pastes in a second editor what was copied in the first', async () => {
    const first = await mount([{ entity: BEN, label: 'B', event_type: 'timed' }]);
    await press(first, `more:entry:${keysOf(first, 'entry')[0]}`);
    await press(first, `strip:entry:${keysOf(first, 'entry')[0]}:copy`);
    first.remove();

    const second = await mount([{ entity: ANNA, name: 'Anna' }]);
    const [anna] = keysOf(second, 'entry');
    await press(second, `more:entry:${anna}`);
    expect(control(second, `strip:entry:${anna}:paste`)?.textContent).toContain('From Ben');
    await press(second, `strip:entry:${anna}:paste`);

    expect(lastConfig(second)?.entities).toEqual([
      { entity: ANNA, name: 'Anna', label: 'B', event_type: 'timed' },
    ]);
    expect(said(second)).toBe('Pasted settings into Anna.');
  });
});

describe('focus and announcements', () => {
  it('keeps focus on a move, says where the calendar went, and the strip travels with it', async () => {
    const editor = await mount([ANNA, BEN, LEO]);
    const [, , leo] = keysOf(editor, 'entry');
    await press(editor, `more:entry:${leo}`);

    await press(editor, `strip:entry:${leo}:up`);

    expect(lastConfig(editor)?.entities).toEqual([ANNA, LEO, BEN]);
    expect(said(editor)).toBe('Moved Leo to position 2 of 3.');
    expect(focused(editor)).toBe(`strip:entry:${leo}:up`);
    // The strip stays open under its row, which now stands second.
    const strip = editor.shadowRoot!.querySelector('.strip')!;
    expect(strip.previousElementSibling?.getAttribute('data-entry-row')).toBe(String(leo));
    expect(strip.closest('.cal-group')?.getAttribute('data-calendar')).toBe(LEO);

    await press(editor, `strip:entry:${leo}:up`);
    expect(said(editor)).toBe('Moved Leo to position 1 of 3.');
    // Move Up is off at the top: focus goes to the row itself.
    expect(control(editor, `strip:entry:${leo}:up`)?.disabled).toBe(true);
    expect(focused(editor)).toBe(`row:${leo}`);

    await press(editor, `strip:entry:${leo}:down`);
    await press(editor, `strip:entry:${leo}:top`);
    expect(lastConfig(editor)?.entities).toEqual([LEO, ANNA, BEN]);
    expect(said(editor)).toBe('Moved Leo to position 1 of 3.');
    expect(focused(editor)).toBe(`row:${leo}`);
  });

  it('moves a focused row with Alt+Arrow keys, and keeps focus on it', async () => {
    const editor = await mount([ANNA, BEN]);
    const [anna] = keysOf(editor, 'entry');
    const row = control(editor, `row:${anna}`)!;
    row.focus();

    row.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    await editor.updateComplete;

    expect(lastConfig(editor)?.entities).toEqual([BEN, ANNA]);
    expect(said(editor)).toBe('Moved Anna to position 2 of 2.');
    expect(focused(editor)).toBe(`row:${anna}`);

    // Without Alt, the key is the browser's.
    control(editor, `row:${anna}`)!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, composed: true }),
    );
    await editor.updateComplete;
    expect(lastConfig(editor)?.entities).toEqual([BEN, ANNA]);
  });

  it('opens the copy’s page on Duplicate, warns that both show the same events, and Back returns to the original’s row', async () => {
    const editor = await mount([{ entity: ANNA, label: 'A' }, BEN]);
    const [anna] = keysOf(editor, 'entry');
    await press(editor, `more:entry:${anna}`);

    await press(editor, `strip:entry:${anna}:duplicate`);

    const copy = keysOf(editor, 'entry')[1];
    const page = editor.shadowRoot!.querySelector('.entry-page')!;
    expect(page.getAttribute('data-entry-key')).toBe(String(copy));
    expect(focused(editor)).toBe('page-title');
    expect(said(editor)).toBe('Duplicated Anna.');
    expect(page.querySelector('.entry-notice.warning')?.textContent?.trim()).toBe(
      'Both entries show the same events until one sets Event Type or a word list, so each event ' +
        'shows twice for now.',
    );
    expect(page.querySelector('.page-sub')?.textContent).toBe(`${ANNA} · Entry 2 of 2`);

    await press(editor, 'back-top');
    expect(focused(editor)).toBe(`row:${anna}`);
  });

  it('opens the overview on Remove at a page’s foot, the line where the row was and its Undo focused', async () => {
    const editor = await mount([ANNA, BEN, LEO]);
    const [, ben] = keysOf(editor, 'entry');
    await goEntry(editor, ben);
    expect(control(editor, 'entry-remove')?.textContent?.trim()).toBe('Remove Ben');

    await press(editor, 'entry-remove');

    expect(editor.shadowRoot!.querySelector('.entry-page')).toBeNull();
    expect(lastConfig(editor)?.entities).toEqual([ANNA, LEO]);
    expect(focused(editor)).toBe('status-undo');
    expect(said(editor)).toBe('Removed Ben.');
    const list = editor.shadowRoot!.querySelector('.cal-list')!;
    expect([...list.children].map((child) => child.className)).toEqual([
      'cal-group',
      'status-bar',
      'cal-group',
    ]);
    expect(list.querySelector('.status-text')?.textContent).toBe('Removed Ben');
    // The overview is where the editor is, not a page drawn as one: Escape goes through to Home
    // Assistant, which closes the dialog, rather than going Back from a page that is gone.
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    control(editor, 'status-undo')!.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);

    await press(editor, 'status-undo');
    expect(lastConfig(editor)?.entities).toEqual([ANNA, BEN, LEO]);
  });

  it('says how many entries a calendar’s removal took', async () => {
    const editor = await mount([
      { entity: FAMILY, event_type: 'all_day' },
      { entity: FAMILY, event_type: 'timed' },
    ]);
    await press(editor, `more:calendar:${FAMILY}`);

    await press(editor, `strip:calendar:${FAMILY}:remove`);

    expect(editor.shadowRoot!.querySelector('.status-text')?.textContent).toBe(
      'Removed Family · Entries: 2',
    );
    expect(focused(editor)).toBe('status-undo');
  });

  it('steps through every entry with Previous and Next Calendar, in list order', async () => {
    const editor = await mount([
      { entity: FAMILY, event_type: 'all_day' },
      ANNA,
      { entity: FAMILY, event_type: 'timed' },
    ]);
    const [allDay, anna, timed] = keysOf(editor, 'entry');
    await goEntry(editor, allDay);

    expect(control(editor, 'entry-previous')?.disabled).toBe(true);
    expect(control(editor, 'entry-next')?.getAttribute('aria-label')).toBe(
      'Next calendar: Family, Events with a time',
    );
    await press(editor, 'entry-next');
    expect(editor.shadowRoot!.querySelector('.entry-page')?.getAttribute('data-entry-key')).toBe(
      String(timed),
    );
    expect(said(editor)).toBe('Showing Family, Events with a time.');
    await press(editor, 'entry-next');
    expect(control(editor, 'entry-next')?.disabled).toBe(true);
    expect(editor.shadowRoot!.querySelector('.entry-page')?.getAttribute('data-entry-key')).toBe(
      String(anna),
    );

    // They take the page's place: Back still returns to the overview.
    await press(editor, 'back-top');
    expect(editor.shadowRoot!.querySelector('.page')).toBeNull();
  });
});

describe('a calendar Home Assistant no longer has', () => {
  it('warns on its row and its page, and the warning clears with a new hass alone', async () => {
    const editor = await mount([ANNA], {});
    expect(rows(editor)[0][1]).toBe('Not found in Home Assistant · All events · Set: 0');
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    const warning = () =>
      editor.shadowRoot!.querySelector('.entry-page .entry-notice.warning')?.textContent?.trim();
    expect(warning()).toBe('Not found in Home Assistant');

    // Home Assistant gains the calendar: nothing but `hass` changes.
    editor.hass = fakeHass({ states: NAMED });
    await editor.updateComplete;

    expect(warning()).toBeUndefined();
    await press(editor, 'back-top');
    expect(rows(editor)[0][1]).toBe('All events · Set: 0');
  });
});

describe('re-pointing an entry', () => {
  it('moves it to its new calendar, says it took that calendar’s name, and Undo gives its own back', async () => {
    const editor = await mount([
      { entity: ANNA, name: 'Anna', label: 'A' },
      { entity: FAMILY, name: 'Family', show_in_legend: false },
    ]);
    const [anna] = keysOf(editor, 'entry');
    await goEntry(editor, anna);

    await changeField(editor, 'entry_calendar:calendar', FAMILY, CHASSIS);

    expect(lastConfig(editor)?.entities).toEqual([
      { entity: FAMILY, name: 'Family', show_in_legend: false },
      { entity: FAMILY, name: 'Family', label: 'A', show_in_legend: false },
    ]);
    const notice =
      'Anna now reads Family, so it uses that calendar’s name and calendar filter setting.';
    expect(said(editor)).toBe(notice);
    // Its page stays open, by its key, wherever the entry went.
    const page = editor.shadowRoot!.querySelector('.entry-page')!;
    expect(page.getAttribute('data-entry-key')).toBe(String(anna));
    expect(page.querySelector('.entry-notice')?.textContent?.trim()).toBe(notice);

    await press(editor, 'undo');
    expect(lastConfig(editor)?.entities).toEqual([
      { entity: ANNA, name: 'Anna', label: 'A' },
      { entity: FAMILY, name: 'Family', show_in_legend: false },
    ]);
    expect(editor.shadowRoot!.querySelector('.entry-notice')).toBeNull();
  });

  it('says only where it went when its new calendar has no entries yet', async () => {
    const editor = await mount([{ entity: ANNA, name: 'Anna' }]);
    await goEntry(editor, keysOf(editor, 'entry')[0]);

    await changeField(editor, 'entry_calendar:calendar', LEO, CHASSIS);

    expect(lastConfig(editor)?.entities).toEqual([{ entity: LEO, name: 'Anna' }]);
    expect(said(editor)).toBe('Anna now reads Leo.');
  });
});

describe('Add Calendar', () => {
  it('offers only the calendars not on the card, and adds nothing until Add', async () => {
    const editor = await mount([ANNA, { entity: BEN, label: 'B' }, BEN]);
    await press(editor, 'add-calendar');
    const picker = editor.shadowRoot!.querySelector<
      HTMLElement & {
        schema: ReadonlyArray<{ selector: { entity: { exclude_entities?: string[] } } }>;
      }
    >('ha-form.add-calendar-form')!;

    expect(picker.schema[0].selector.entity.exclude_entities).toEqual([ANNA, BEN]);
    expect(control(editor, 'add-confirm')?.disabled).toBe(true);

    await changeField(editor, 'add_calendar:pick', LEO, CHASSIS);
    expect(lastConfig(editor)).toBeUndefined();
    expect(said(editor)).toBe('Chose Leo. Add puts it on the card and opens its page.');
    expect(focused(editor)).toBe('add-confirm');

    await press(editor, 'add-confirm');
    expect(lastConfig(editor)?.entities).toEqual([ANNA, { entity: BEN, label: 'B' }, BEN, LEO]);
    expect(editor.shadowRoot!.querySelector('.entry-page .page-title')?.textContent).toBe('Leo');
  });

  it('points to a calendar already on the card rather than adding it again', async () => {
    const editor = await mount([ANNA]);
    await press(editor, 'add-calendar');

    await changeField(editor, 'add_calendar:pick', ANNA, CHASSIS);

    expect(control(editor, 'add-confirm')?.disabled).toBe(true);
    expect(editor.shadowRoot!.querySelector('.add-calendar .page-line')?.textContent).toContain(
      'Anna is already on the card.',
    );
    await press(editor, 'add-open');
    expect(editor.shadowRoot!.querySelector('.entry-page .page-title')?.textContent).toBe('Anna');
  });

  it('stays offered under Essentials Only and Customized Only, withheld only while a query is typed', async () => {
    // Essentials Only is remembered in the browser: hiding Add Calendar under it would leave a
    // card no way to gain a calendar.
    const editor = await mount([ANNA]);
    await changeField(editor, 'filter:essentials_only', true, CHASSIS);
    expect(control(editor, 'add-calendar')).not.toBeNull();
    await changeField(editor, 'filter:customized_only', true, CHASSIS);
    expect(control(editor, 'add-calendar')).not.toBeNull();
    await changeField(editor, 'filter:search', 'anna', CHASSIS);
    expect(control(editor, 'add-calendar')).toBeNull();
  });

  it('shows the empty state on a card with no calendars', async () => {
    const editor = await mount([]);

    expect(
      editor.shadowRoot!.querySelector('.cal-empty')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toBe('No Calendars Yet Add the calendars this card shows.');
    expect(control(editor, 'add-calendar')).not.toBeNull();
  });
});

describe('Filter Calendars', () => {
  const EIGHT = Array.from({ length: 8 }, (_, at) => `calendar.c${at}`);

  it('appears above eight rows and narrows them by name and summary', async () => {
    expect(control(await mount(EIGHT.slice(0, 7)), 'calendar-filter')).toBeNull();

    const editor = await mount([...EIGHT.slice(0, 7), { entity: EIGHT[7], blocklist: 'Chores' }]);
    const filter = control(editor, 'calendar-filter') as unknown as HTMLInputElement;
    expect(filter.getAttribute('aria-label')).toBe('Filter Calendars');

    filter.value = 'chores';
    filter.dispatchEvent(new Event('input'));
    await editor.updateComplete;
    expect(rows(editor).map(([name]) => name)).toEqual([
      `Edit ${EIGHT[7]}, Not found in Home Assistant, Without: Chores, Set: 1`,
    ]);

    filter.value = 'c3';
    filter.dispatchEvent(new Event('input'));
    await editor.updateComplete;
    expect(rows(editor)).toHaveLength(1);
  });
});

describe('Who Sees It', () => {
  const CONDITION = { condition: 'user', users: ['anna'] };

  it('hands the Visibility editor the very list it sent, by entry, through a write and a move', async () => {
    const editor = await mount([BEN, { entity: ANNA, visibility: [CONDITION] }]);
    const [ben, anna] = keysOf(editor, 'entry');
    await goEntry(editor, anna);
    const conditions = () =>
      editor.shadowRoot!.querySelector<ConditionsEditorStub>('ha-card-conditions-editor')!
        .conditions;

    const sent = [{ ...CONDITION, users: ['anna', 'ben'] }];
    editor.shadowRoot!.querySelector('ha-card-conditions-editor')!.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: sent },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    // Home Assistant's echo stores a copy; the editor keeps the condition it sent open.
    editor.setConfig(lastConfig(editor)!);
    await editor.updateComplete;
    expect(conditions()).toBe(sent);

    // Moved above Ben, the entry keeps the list it sent: it is kept by key, not by place.
    await press(editor, 'back-top');
    await press(editor, `more:entry:${anna}`);
    await press(editor, `strip:entry:${anna}:up`);
    editor.setConfig(lastConfig(editor)!);
    await goEntry(editor, anna);
    expect(conditions()).toBe(sent);
    expect(keysOf(editor, 'entry')).toEqual([anna, ben]);
  });
});

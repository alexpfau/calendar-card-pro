/**
 * Start Date's shortcuts, Tapping an Event Opens It and the word lists' two presentations
 * (backlog item 307): the overview's chips and the mode they hold, the switch over the event's tap
 * and the line it gives way to, and a word list one term at a time or as its pattern.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  type MountedEditor,
  addFromRow,
  changeField,
  editLayout,
  entry,
  formOf,
  goEntry,
  goPage,
  keysOf,
  lastConfig,
  lineOf,
  mountEditor,
  openPageOf,
  valueOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import type * as Types from '../src/config/types';
import { applySyntheticChange, startDateMode } from '../src/rendering/editor/synthetic';

afterEach(() => document.body.replaceChildren());

const VERSION = Config.CURRENT_CONFIG_VERSION;

/**
 * A configuration as the editor holds it: the stored values over the defaults.
 *
 * @param start - Stored `start_date`, or undefined for none
 * @returns The configuration
 */
function withStart(start?: string): Types.Config {
  return { ...Config.DEFAULT_CONFIG, ...(start === undefined ? {} : { start_date: start }) };
}

/**
 * The editor's shadow root.
 *
 * @param editor - Editor
 * @returns Its root
 */
function root(editor: MountedEditor): ShadowRoot {
  return editor.shadowRoot!;
}

/**
 * Start Date's chip that is pressed.
 *
 * @param editor - Editor
 * @returns The chosen chip's value, or undefined where none is
 */
function pressedChip(editor: MountedEditor): string | undefined {
  return (
    root(editor).querySelector<HTMLInputElement>('input[name="start_date_mode"]:checked')?.value ??
    undefined
  );
}

/**
 * Presses one of Start Date's chips, as a user does.
 *
 * @param editor - Editor
 * @param value - The chip's value
 */
async function pressChip(editor: MountedEditor, value: string): Promise<void> {
  const input = root(editor).querySelector<HTMLInputElement>(
    `input[name="start_date_mode"][value="${value}"]`,
  );
  if (input === null) throw new Error(`Start Date offers no ${value}`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await editor.updateComplete;
}

/**
 * Clicks a control of the editor's own by its `data-focus` key.
 *
 * @param editor - Editor
 * @param key - The key
 */
async function press(editor: MountedEditor, key: string): Promise<void> {
  const control = root(editor).querySelector<HTMLElement>(`[data-focus="${CSS.escape(key)}"]`);
  if (control === null) throw new Error(`The editor draws no ${key}`);
  control.click();
  await editor.updateComplete;
}

describe('Start Date reads and writes its shortcuts', () => {
  it.each([
    ['today+1', 'tomorrow'],
    ['+1', 'tomorrow'],
    ['start_of_week', 'start_of_week'],
    ['2026-03-14', 'fixed'],
    ['today+3', 'offset'],
  ])('reads %s as %s, and choosing that again keeps it as written', (stored, mode) => {
    const config = withStart(stored);
    expect(startDateMode(config)).toBe(mode);
    const { changes } = applySyntheticChange('start_date_mode', mode, config);
    expect(changes.start_date).toBe(stored);
    expect(startDateMode(withStart(String(changes.start_date)))).toBe(mode);
  });

  it.each([
    ['tomorrow', 'today+1'],
    ['start_of_week', 'start_of_week'],
  ])('writes %s as %s from today, and reads it back', (mode, written) => {
    const { changes } = applySyntheticChange('start_date_mode', mode, withStart());
    expect(changes.start_date).toBe(written);
    expect(startDateMode(withStart(written))).toBe(mode);
    // Back to Today removes the line.
    expect(applySyntheticChange('start_date_mode', 'default', withStart(written)).changes).toEqual({
      start_date: undefined,
    });
  });

  it('holds Relative to Today over a shortcut instead of writing, and releases it for any other choice', () => {
    const relative = applySyntheticChange('start_date_mode', 'offset', withStart('today+1'));
    expect(relative.changes).toEqual({ start_date: 'today+1' });
    expect(relative.pending?.start_date_mode).toBe('offset');
    // Over an expression that is no shortcut there is nothing to hold.
    expect(
      applySyntheticChange('start_date_mode', 'offset', withStart('today+3')).pending
        ?.start_date_mode,
    ).toBeNull();
    for (const other of ['default', 'tomorrow', 'start_of_week', 'fixed']) {
      expect(
        applySyntheticChange('start_date_mode', other, withStart('today+1')).pending
          ?.start_date_mode,
      ).toBeNull();
    }
  });
});

describe('Start Date’s Expression', () => {
  it('holds Relative to Today while what is typed reads as a shortcut, and releases it after', () => {
    const typed = applySyntheticChange('start_date_offset', '+1', withStart('+2'));
    expect(typed.changes).toEqual({ start_date: '+1' });
    expect(typed.pending?.start_date_mode).toBe('offset');
    expect(
      applySyntheticChange('start_date_offset', '+10', withStart('+1')).pending?.start_date_mode,
    ).toBeNull();
  });
});

describe('Start Date on Which Events', () => {
  it('offers the five chips in order', async () => {
    const editor = await mountEditor({ config_version: VERSION, entities: ['calendar.anna'] });
    await openPageOf(editor, 'content:start_date_mode');
    const chips = [
      ...root(editor).querySelectorAll<HTMLInputElement>('input[name="start_date_mode"]'),
    ];
    expect(chips.map((chip) => chip.closest('label')!.textContent!.trim())).toEqual([
      'Today',
      'Tomorrow',
      'Start of Week',
      'A Fixed Date',
      'Relative to Today',
    ]);
    expect(pressedChip(editor)).toBe('default');
    // Named as the field; what it reaches is a fact on the line under it.
    const group = root(editor).querySelector('[data-field="content:start_date_mode"]')!;
    expect(group.getAttribute('aria-label')).toBe('Start Date');
    expect(group.querySelector('legend')!.textContent).toBe('Start Date');
    // At home on a Whole Card page it says nothing at its default; its copy beside Days To Show
    // says it is the whole card's.
    expect(group.querySelector('.field-line .fact')).toBeNull();
    await goPage(editor, 'which_events');
    const copy = root(editor).querySelector('[data-field="content:start_date_mode"]')!;
    expect(copy.querySelector('.field-line .fact')!.textContent!.trim()).toBe('Whole Card');
  });

  it('keeps Relative to Today pressed over Tomorrow’s expression until another is chosen', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      start_date: 'today+1',
    });
    await openPageOf(editor, 'content:start_date_mode');
    const reported = (): number => (lastConfig(editor) === undefined ? 0 : 1);
    expect(pressedChip(editor)).toBe('tomorrow');
    expect(formOf(editor, 'content:start_date_offset')).toBeUndefined();

    await pressChip(editor, 'offset');
    // Nothing is written: the expression is already stored, now shown for editing.
    expect(reported()).toBe(0);
    expect(pressedChip(editor)).toBe('offset');
    expect(valueOf(editor, 'content:start_date_offset')).toBe('today+1');

    // An unrelated edit, and Home Assistant's echo of it, leave the choice where it is.
    await changeField(editor, 'card:title', 'Family');
    editor.setConfig(lastConfig(editor));
    await editor.updateComplete;
    await openPageOf(editor, 'content:start_date_mode');
    expect(pressedChip(editor)).toBe('offset');
    expect(valueOf(editor, 'content:start_date_offset')).toBe('today+1');
    expect(lastConfig(editor)!.start_date).toBe('today+1');

    await changeField(editor, 'content:start_date_offset', 'today+2');
    expect(lastConfig(editor)!.start_date).toBe('today+2');
    expect(pressedChip(editor)).toBe('offset');

    // Tomorrow again writes its expression, and its chip is pressed.
    await pressChip(editor, 'tomorrow');
    expect(lastConfig(editor)!.start_date).toBe('today+1');
    expect(pressedChip(editor)).toBe('tomorrow');
    expect(formOf(editor, 'content:start_date_offset')).toBeUndefined();
  });

  it('keeps Expression while typing passes through a shortcut', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      start_date: '+2',
    });
    await openPageOf(editor, 'content:start_date_mode');
    expect(pressedChip(editor)).toBe('offset');
    await changeField(editor, 'content:start_date_offset', '+1');
    expect(lastConfig(editor)!.start_date).toBe('+1');
    expect(pressedChip(editor)).toBe('offset');
    expect(valueOf(editor, 'content:start_date_offset')).toBe('+1');
    await changeField(editor, 'content:start_date_offset', '+10');
    expect(lastConfig(editor)!.start_date).toBe('+10');
    expect(pressedChip(editor)).toBe('offset');
  });

  it('writes Start of Week, and Today removes the line', async () => {
    const editor = await mountEditor({ config_version: VERSION, entities: ['calendar.anna'] });
    await openPageOf(editor, 'content:start_date_mode');
    await pressChip(editor, 'start_of_week');
    expect(lastConfig(editor)!.start_date).toBe('start_of_week');
    await pressChip(editor, 'default');
    expect(lastConfig(editor)).not.toHaveProperty('start_date');
  });
});

describe('a word list', () => {
  /**
   * The form a word list is drawn in on Anna's page.
   *
   * @param editor - Editor
   * @param field - The list
   * @returns Its form
   */
  function listForm(
    editor: MountedEditor,
    field = 'calendar:blocklist',
  ): HTMLElement & { schema: Array<{ selector: unknown }>; data: Record<string, unknown> } {
    const form = root(editor).querySelector(`[data-field="${field}"] ha-form`);
    if (form === null) throw new Error(`${field} is not drawn`);
    return form as never;
  }

  /**
   * Sends terms from a word list's form, as Home Assistant's text selector with `multiple` does.
   *
   * @param editor - Editor
   * @param terms - The terms
   * @param field - The list
   */
  async function sendTerms(
    editor: MountedEditor,
    terms: ReadonlyArray<string>,
    field = 'calendar:blocklist',
  ): Promise<void> {
    const name = field.split(':')[1];
    listForm(editor, field).dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { [name]: [...terms] } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
  }

  /**
   * Mounts Anna with a blocklist and opens her page.
   *
   * @param blocklist - Her blocklist
   * @returns The editor
   */
  async function onAnnasPage(blocklist: string): Promise<MountedEditor> {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: [{ entity: 'calendar.anna', blocklist }],
    });
    await openPageOf(editor, 'calendar:blocklist', entry(0));
    return editor;
  }

  const annas = (editor: MountedEditor): Record<string, unknown> =>
    (lastConfig(editor)!.entities as Array<Record<string, unknown>>)[0];

  it('shows plain terms one at a time, and writes them as one pattern', async () => {
    const editor = await onAnnasPage('Soccer|School');
    const form = listForm(editor);
    expect(form.schema).toEqual([{ name: 'blocklist', selector: { text: { multiple: true } } }]);
    expect(form.data).toEqual({ blocklist: ['Soccer', 'School'] });

    // A term just added is empty: shown, and written once it is typed.
    await sendTerms(editor, ['Soccer', 'School', '']);
    expect(lastConfig(editor)).toBeUndefined();
    expect(listForm(editor).data).toEqual({ blocklist: ['Soccer', 'School', ''] });
    await sendTerms(editor, ['Soccer', 'School', 'C++']);
    expect(annas(editor).blocklist).toBe('Soccer|School|C\\+\\+');
    expect(listForm(editor).data).toEqual({ blocklist: ['Soccer', 'School', 'C++'] });
  });

  it('holds one empty box once added, and puts focus in it, writing nothing', async () => {
    const editor = await mountEditor({ config_version: VERSION, entities: ['calendar.anna'] });
    await goEntry(editor, keysOf(editor, 'entry')[0]);
    // Folded to its head: no form until it is opened.
    expect(root(editor).querySelector('.field[data-field="calendar:blocklist"]')).toBeNull();

    expect(await addFromRow(editor, 'calendar:blocklist')).toBe(true);
    // One box to type in, rather than Home Assistant's button that adds one.
    expect(listForm(editor).data).toEqual({ blocklist: [''] });
    expect(lastConfig(editor)).toBeUndefined();

    // Home Assistant draws the box a few frames after the form; focus follows it there.
    const box = document.createElement('input');
    listForm(editor).append(box);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(root(editor).activeElement).toBe(box);

    await sendTerms(editor, ['Dentist']);
    expect(annas(editor).blocklist).toBe('Dentist');
  });

  it('deletes the line when the last term is removed, and stays on the page', async () => {
    const editor = await onAnnasPage('Soccer');
    await sendTerms(editor, []);
    // With nothing else set, Anna is a bare id again.
    expect(lastConfig(editor)!.entities).toEqual(['calendar.anna']);
    // Still words, now with none, where it was: edited this session, as any field keeps its place.
    expect(listForm(editor).data).toEqual({ blocklist: [] });
  });

  it('switches to the pattern and back, writing nothing', async () => {
    const editor = await onAnnasPage('Soccer|School');
    const key = root(editor).querySelector<HTMLElement>('[data-composed="words"] .word-mode')!
      .dataset.focus!;
    expect(root(editor).querySelector(`[data-focus="${key}"]`)!.textContent!.trim()).toBe(
      'Use a Pattern',
    );

    await press(editor, key);
    const raw = listForm(editor);
    expect(raw.schema[0].selector).not.toEqual({ text: { multiple: true } });
    expect(raw.data).toEqual({ blocklist: 'Soccer|School' });
    expect(root(editor).querySelector(`[data-focus="${key}"]`)!.textContent!.trim()).toBe(
      'Use Words',
    );
    expect(root(editor).activeElement).toBe(root(editor).querySelector(`[data-focus="${key}"]`));

    await press(editor, key);
    expect(listForm(editor).data).toEqual({ blocklist: ['Soccer', 'School'] });
    expect(lastConfig(editor)).toBeUndefined();
  });

  it('keeps an expression as the pattern, exactly, with no Use Words', async () => {
    const editor = await onAnnasPage('^Soc+er\\b');
    const form = listForm(editor);
    expect(form.data).toEqual({ blocklist: '^Soc+er\\b' });
    expect(root(editor).querySelector('[data-field="calendar:blocklist"] .word-mode')).toBeNull();

    await changeField(editor, 'calendar:name', 'Anna', entry(0));
    expect(annas(editor).blocklist).toBe('^Soc+er\\b');
  });

  it('writes a late edit for the scope its form was drawn for', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      list: { remove_location_country: 'Germany' },
    });
    const field = 'events:location_country_pattern';
    await openPageOf(editor, field);
    const drawn = listForm(editor, field);
    expect(drawn.data).toEqual({ location_country_pattern: ['Germany'] });
    await editLayout(editor, 'shared');
    drawn.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { location_country_pattern: ['Germany', 'Austria'] } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    expect(lastConfig(editor)!.list).toEqual({ remove_location_country: 'Germany|Austria' });
    expect(lastConfig(editor)).not.toHaveProperty('remove_location_country');
  });

  it('leaves its terms and its presentation behind when a configuration arrives from outside', async () => {
    const editor = await onAnnasPage('School');
    await sendTerms(editor, ['School', '']);
    expect(listForm(editor).data).toEqual({ blocklist: ['School', ''] });
    editor.setConfig({
      config_version: VERSION,
      entities: [{ entity: 'calendar.ben', blocklist: 'School' }],
    });
    await editor.updateComplete;
    await openPageOf(editor, 'calendar:blocklist', entry(0));
    expect(listForm(editor).data).toEqual({ blocklist: ['School'] });

    await press(
      editor,
      root(editor).querySelector<HTMLElement>('[data-composed="words"] .word-mode')!.dataset.focus!,
    );
    expect(listForm(editor).data).toEqual({ blocklist: 'School' });
    editor.setConfig({
      config_version: VERSION,
      entities: [{ entity: 'calendar.anna', blocklist: 'School' }],
    });
    await editor.updateComplete;
    await openPageOf(editor, 'calendar:blocklist', entry(0));
    expect(listForm(editor).data).toEqual({ blocklist: ['School'] });
  });

  it('shows Countries To Remove as words, and as none once its last name is removed', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      list: { remove_location_country: 'Germany' },
    });
    const field = 'events:location_country_pattern';
    await openPageOf(editor, field);
    expect(listForm(editor, field).data).toEqual({ location_country_pattern: ['Germany'] });

    await sendTerms(editor, ['Germany', 'Austria'], field);
    // Written in the layout the page edits, List here, as any of its settings is.
    expect(lastConfig(editor)!.list).toEqual({ remove_location_country: 'Germany|Austria' });

    // An empty list writes the empty pattern clearing its raw field writes, and stays drawn.
    await sendTerms(editor, [], field);
    expect(lastConfig(editor)!.list).toEqual({ remove_location_country: '' });
    expect(listForm(editor, field).data).toEqual({ location_country_pattern: [] });
  });

  it('keeps Country Names on its page once Countries To Remove is emptied, reading Custom', async () => {
    // Opened afresh on an emptied list: nothing was added this session, so only the blank being
    // read as stored keeps the dropdown, and the empty list under it, on the page.
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      list: { remove_location_country: '' },
    });
    await openPageOf(editor, 'events:show_location');
    expect(
      root(editor).querySelector('[data-field="events:location_country_mode"]'),
    ).not.toBeNull();
    expect(listForm(editor, 'events:location_country_pattern').data).toEqual({
      location_country_pattern: [],
    });
  });
});

describe('with the shown set and Stored Settings', () => {
  /**
   * The buttons a field's wrapper draws, by their names.
   *
   * @param editor - Editor
   * @param id - The field
   * @returns Their accessible names
   */
  function buttonsOf(editor: MountedEditor, id: string): string[] {
    return [...root(editor).querySelectorAll(`[data-field="${id}"] button`)].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent!.trim(),
    );
  }

  it('gives each composed control the state words and Reset any field has', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: [{ entity: 'calendar.anna', blocklist: 'Soccer' }],
      start_date: 'today+1',
    });
    await openPageOf(editor, 'content:start_date_mode');
    expect(buttonsOf(editor, 'content:start_date_mode')).toContain('Reset Start Date to Today');
    await openPageOf(editor, 'calendar:blocklist', entry(0));
    // Its Reset is in plain view right after Set, as any stored setting's, and its own control
    // keeps only Use a Pattern.
    expect(buttonsOf(editor, 'calendar:blocklist')).toEqual(['Use a Pattern']);
    const line = lineOf(editor, 'calendar:blocklist')!;
    expect(
      [...line.querySelectorAll('.line-button')].map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Reset Hide Events Containing']);
  });

  it('resets Start Date to Today, releasing Relative to Today held over a shortcut', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      start_date: 'today+1',
    });
    await openPageOf(editor, 'content:start_date_mode');
    await pressChip(editor, 'offset');
    expect(pressedChip(editor)).toBe('offset');
    const reset = [...root(editor).querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.getAttribute('aria-label') === 'Reset Start Date to Today',
    )!;
    reset.click();
    await editor.updateComplete;
    await editor.updateComplete;
    expect(pressedChip(editor)).toBe('default');
    expect(lastConfig(editor)).not.toHaveProperty('start_date');
    expect(formOf(editor, 'content:start_date_offset')).toBeUndefined();
  });

  it('edits a Start Date shortcut in Stored Settings, the field a choice reveals in place', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: ['calendar.anna'],
      start_date: 'today+1',
    });
    await press(editor, 'more:audit');
    // The row opens its strip; Change Here mounts the control in place.
    await press(editor, 'more:audit:start_date');
    await press(editor, 'strip:audit:start_date:change');
    const row = (): Element => root(editor).querySelector('[data-audit="start_date"]')!;
    const fields = (): Array<string | null> =>
      [...row().querySelectorAll('[data-field]')].map((each) => each.getAttribute('data-field'));
    const pick = async (value: string): Promise<void> => {
      const input = row().querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await editor.updateComplete;
      await editor.updateComplete;
    };
    expect(fields()).toEqual(['content:start_date_mode']);
    expect(row().querySelector<HTMLInputElement>('input:checked')!.value).toBe('tomorrow');

    await pick('offset');
    expect(fields()).toEqual(['content:start_date_mode', 'content:start_date_offset']);
    expect(
      (
        row().querySelector('[data-field="content:start_date_offset"] ha-form') as never as {
          data: Record<string, unknown>;
        }
      ).data,
    ).toEqual({ start_date_offset: 'today+1' });
    expect(lastConfig(editor)).toBeUndefined();

    await pick('start_of_week');
    expect(lastConfig(editor)!.start_date).toBe('start_of_week');
  });

  it('edits a word list in Stored Settings as words, written where the line lives', async () => {
    const editor = await mountEditor({
      config_version: VERSION,
      entities: [{ entity: 'calendar.anna', blocklist: 'Soccer' }],
    });
    await press(editor, 'more:audit');
    // The row opens its strip; Change Here mounts the control in place.
    await press(editor, 'more:audit:entities[0].blocklist');
    await press(editor, 'strip:audit:entities[0].blocklist:change');
    const form = root(editor).querySelector(
      '[data-audit="entities[0].blocklist"] [data-composed="words"] ha-form',
    ) as never as HTMLElement & { data: Record<string, unknown> };
    expect(form.data).toEqual({ blocklist: ['Soccer'] });
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { blocklist: ['Soccer', 'Piano'] } },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    expect(lastConfig(editor)!.entities).toEqual([
      { entity: 'calendar.anna', blocklist: 'Soccer|Piano' },
    ]);
  });
});

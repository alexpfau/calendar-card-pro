/**
 * The composed controls of section 5.9 (PR 18): the event parts as toggle chips at the top of
 * Events (D08 A), and on Card & Header the toolbar's controls as chips and Calendar Filter as a
 * segmented radio group (D09 A).
 *
 * Which fields are chips is the page registry's, each chip's short label `chips.ts`'s, and which
 * chips a scope offers comes from the universe for it; the first two are pinned by value and
 * against each other, the third against `field-index.ts` › `universeIndex` itself. The rest is
 * read off the mounted editor: what is drawn, pressed, unpressable and why, the line naming where
 * the stored parts live, and what each press, pick and Reset writes.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { changeField, goPage, lastConfig, mountEditor, openPageOf } from './helpers/editor-host';
import * as Config from '../src/config/config';
import { CHIP_LABELS, chipFields, inScope } from '../src/rendering/editor/chips';
import { universeIndex } from '../src/rendering/editor/field-index';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { WORKSPACES } from '../src/rendering/editor/workspace';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const PARTS = [
  'events:show_time',
  'events:show_end_time',
  'events:show_location',
  'events:show_description',
  'events:show_countdown',
  'events:show_progress_bar',
  'events:show_duration',
  'events:show_now_indicator',
];

const CONTROLS = [
  'card:toolbar.add_event',
  'card:toolbar.view_switcher',
  'card:toolbar.reset',
  'card:toolbar.refresh',
  'card:toolbar.search',
  'card:toolbar.navigation',
];

afterEach(() => document.body.replaceChildren());

/**
 * Mounts the editor over a card with one calendar.
 *
 * @param extra - Further options
 * @returns The editor
 */
function mount(extra: Record<string, unknown> = {}): Promise<Editor> {
  return mountEditor({
    config_version: Config.CURRENT_CONFIG_VERSION,
    entities: ['calendar.anna'],
    ...extra,
  });
}

/**
 * The chips of a group the open page draws, by the group's name.
 *
 * @param editor - The editor
 * @param group - "Event Details" or "Controls"
 * @returns The chips, in order
 */
function chips(editor: Editor, group: string): HTMLButtonElement[] {
  const found = editor.shadowRoot!.querySelector(`.chip-group[aria-label="${group}"]`);
  return [...(found?.querySelectorAll<HTMLButtonElement>('button.chip') ?? [])];
}

/**
 * What each chip shows: its label, and whether it is pressed, or why it cannot be.
 *
 * @param editor - The editor
 * @param group - The group's name
 * @returns One line per chip
 */
function read(editor: Editor, group: string): string[] {
  return chips(editor, group).map((chip) => {
    const label = chip.querySelector('span')!.textContent!.trim();
    if (chip.getAttribute('aria-disabled') === 'true') {
      const reason = editor.shadowRoot!.getElementById(chip.getAttribute('aria-describedby')!);
      return `${label} (${reason?.textContent?.trim()})`;
    }
    return chip.getAttribute('aria-pressed') === 'true' ? `${label} ✓` : label;
  });
}

/**
 * The Reset and Remove buttons in the line under the event-part chips.
 *
 * @param editor - The editor
 * @returns Each as `<visible text>: <accessible name>`
 */
function resets(editor: Editor): string[] {
  const heading = editor.shadowRoot!.querySelector('[data-heading="heading_details"]')!;
  return [...heading.querySelectorAll<HTMLButtonElement>(':scope > .field-line .line-button')].map(
    (button) => `${button.textContent?.trim()}: ${button.getAttribute('aria-label')}`,
  );
}

/**
 * The lines the Event Details heading draws under its chips.
 *
 * @param editor - The editor
 * @returns Each line's text
 */
function lines(editor: Editor): string[] {
  const heading = editor.shadowRoot!.querySelector('[data-heading="heading_details"]')!;
  return [...heading.querySelectorAll(':scope > p.hint')].map(
    (line) => line.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  );
}

describe('which fields are chips', () => {
  it('pins each chip’s label by value, and the registry draws exactly those, in order', () => {
    expect(CHIP_LABELS).toEqual({
      'events:show_time': 'time',
      'events:show_end_time': 'chip.end_time',
      'events:show_location': 'location',
      'events:show_description': 'description',
      'events:show_countdown': 'chip.countdown',
      'events:show_progress_bar': 'chip.progress_bar',
      'events:show_duration': 'chip.duration',
      'events:show_now_indicator': 'chip.now',
      'card:toolbar.add_event': 'toolbar.controls.add_event',
      'card:toolbar.view_switcher': 'toolbar.view_switcher',
      'card:toolbar.reset': 'toolbar.controls.reset',
      'card:toolbar.refresh': 'toolbar.controls.refresh',
      'card:toolbar.search': 'toolbar.controls.search',
      'card:toolbar.navigation': 'toolbar.navigation',
    });
    expect(chipFields('parts')).toEqual(PARTS);
    expect(chipFields('toolbar')).toEqual(CONTROLS);
    expect([...chipFields('parts'), ...chipFields('toolbar')]).toEqual(Object.keys(CHIP_LABELS));
    expect(Object.values(CHIP_LABELS).map((key) => EDITOR_STRINGS[key])).toEqual([
      'Time',
      'End Time',
      'Location',
      'Description',
      'Countdown',
      'Progress Bar',
      'Duration',
      'Now',
      'Add Event',
      'View Switcher',
      'Reset',
      'Refresh',
      'Search',
      'Date Navigation',
    ]);
  });

  it('offers a chip in a scope exactly where the universe for that scope holds its field', () => {
    const offered = WORKSPACES.map((workspace) => [
      workspace,
      Object.keys(CHIP_LABELS).filter((id) => inScope(id, workspace)),
    ]);
    const universe = WORKSPACES.map((workspace) => [
      workspace,
      Object.keys(CHIP_LABELS).filter((id) => universeIndex('en', workspace).fields.has(id)),
    ]);
    expect(offered).toEqual(universe);
    // The denominator, and the one difference: Now is not offered in Grid.
    const grid = Object.fromEntries(offered)['grid'] as string[];
    expect(grid).toHaveLength(13);
    expect(Object.keys(CHIP_LABELS).filter((id) => !grid.includes(id))).toEqual([
      'events:show_now_indicator',
    ]);
  });
});

describe('the event-part chips', () => {
  it('draws every part at the top of Events, pressed as each event shows it, with the hint', async () => {
    const editor = await mount();
    await goPage(editor, 'events');

    expect(read(editor, 'Event Details')).toEqual([
      'Time ✓',
      'End Time ✓',
      'Location ✓',
      'Description',
      'Countdown',
      'Progress Bar',
      'Duration',
      'Now ✓',
    ]);
    // Native toggle buttons: focusable, never disabled, so every reason is read where it is.
    expect(chips(editor, 'Event Details').every((chip) => chip.localName === 'button')).toBe(true);
    expect(chips(editor, 'Event Details').some((chip) => chip.disabled)).toBe(false);
    // Nothing is stored, so no line says where.
    expect(lines(editor)).toEqual([
      "Each event shows the parts that are pressed. A pressed part's settings follow below.",
    ]);
  });

  it('leaves Now out in Grid, and says so', async () => {
    const editor = await mount({ view: 'grid' });
    await goPage(editor, 'events');

    expect(read(editor, 'Event Details').map((chip) => chip.replace(' ✓', ''))).toEqual([
      'Time',
      'End Time',
      'Location',
      'Description',
      'Countdown',
      'Progress Bar',
      'Duration',
    ]);
    expect(lines(editor)).toContain('Not in Grid: Now.');

    // In All Layouts, which offers every part, no line.
    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await goPage(editor, 'events');
    expect(chips(editor, 'Event Details')).toHaveLength(8);
    expect(lines(editor).some((line) => line.startsWith('Not in'))).toBe(false);
  });

  it('wraps the chips in rows, never stacked one per line by another control’s rule', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    const group = editor.shadowRoot!.querySelector('.chip-group[aria-label="Event Details"]')!;
    const style = getComputedStyle(group);
    // Start Date's radio chips are a column (.chips); a shared class stacked these one per line.
    expect([style.display, style.flexWrap]).toEqual(['flex', 'wrap']);
    expect(style.flexDirection).not.toBe('column');
  });

  it('keeps End Time and Duration in sight while Time is off, unpressable, with the reason', async () => {
    const editor = await mount({ show_end_time: true });
    await changeField(editor, 'events:show_time', false);

    expect(read(editor, 'Event Details').slice(0, 3)).toEqual([
      'Time',
      'End Time (Needs Time)',
      'Location ✓',
    ]);
    expect(read(editor, 'Event Details')[6]).toBe('Duration (Needs Time)');
    const end = chips(editor, 'Event Details')[1];
    // Still focusable, and not pressed, though its own value is on.
    expect(end.disabled).toBe(false);
    expect(end.getAttribute('aria-pressed')).toBe('false');
    const before = lastConfig(editor);
    end.click();
    await editor.updateComplete;
    expect(lastConfig(editor)).toBe(before);
  });

  it('presses as the scope reads it, names where each stored part lives, and writes there', async () => {
    const editor = await mount({ show_location: false, column: { show_location: true } });

    await changeField(editor, 'workspace:editing_workspace', 'shared');
    await goPage(editor, 'events');
    expect(read(editor, 'Event Details')[2]).toBe('Location');
    expect(lines(editor)[0]).toBe('Set for All Layouts · Location: Off');

    await changeField(editor, 'workspace:editing_workspace', 'column');
    await goPage(editor, 'events');
    expect(read(editor, 'Event Details')[2]).toBe('Location ✓');
    expect(lines(editor)[0]).toBe('Set for Columns, Same as the Default · Location: On');
    // A chip's name carries its state words, as any field's does.
    expect(chips(editor, 'Event Details')[2].getAttribute('aria-label')).toBe(
      'Location, Set for Columns, Same as the Default',
    );

    await changeField(editor, 'workspace:editing_workspace', 'list');
    await goPage(editor, 'events');
    expect(read(editor, 'Event Details')[2]).toBe('Location');
    expect(lines(editor)[0]).toBe('From All Layouts · Location: Off');
    expect(chips(editor, 'Event Details')[2].getAttribute('aria-label')).toBe(
      'Location, From All Layouts',
    );
    // Nothing is stored for List, so nothing here resets.
    expect(resets(editor)).toEqual([]);

    // A press writes the other value for the scope, in its own block: one write, one step.
    chips(editor, 'Event Details')[4].click();
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      show_location: false,
      column: { show_location: true },
      list: { show_countdown: true },
    });
    expect(lines(editor)[0]).toBe(
      'From All Layouts · Location: Off · Set for List · Countdown: On',
    );
    expect(
      editor.shadowRoot!.querySelector('[data-focus="undo"]')?.getAttribute('aria-label'),
    ).toBe('Undo: Change Show Countdown');
  });

  it('resets a stored part from the line under the chips, for the scope it is stored for', async () => {
    const editor = await mount({ list: { show_countdown: true, show_location: false } });
    await changeField(editor, 'workspace:editing_workspace', 'list');
    await goPage(editor, 'events');
    expect(resets(editor)).toEqual([
      'Reset Location: Reset Show Location for List',
      'Reset Countdown: Reset Show Countdown for List',
    ]);

    editor
      .shadowRoot!.querySelector<HTMLButtonElement>('[data-focus="reset:events:show_countdown"]')!
      .click();
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      list: { show_location: false },
    });
    expect(read(editor, 'Event Details')[4]).toBe('Countdown');
    expect(resets(editor)).toEqual(['Reset Location: Reset Show Location for List']);
  });

  it('puts focus back on the chip a press changed when Undo restores it', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    chips(editor, 'Event Details')[3].click();
    await editor.updateComplete;
    expect(read(editor, 'Event Details')[3]).toBe('Description ✓');

    editor.shadowRoot!.querySelector<HTMLButtonElement>('[data-focus="undo"]')!.click();
    await editor.updateComplete;
    await editor.updateComplete;

    expect(read(editor, 'Event Details')[3]).toBe('Description');
    expect(editor.shadowRoot!.activeElement).toBe(chips(editor, 'Event Details')[3]);
  });
});

describe('the toolbar on Card & Header', () => {
  it('draws the controls as chips only while the toolbar is shown, under Show Toolbar', async () => {
    const editor = await mount();
    await openPageOf(editor, 'card:toolbar.show');
    expect(chips(editor, 'Controls')).toEqual([]);
    expect(editor.shadowRoot!.querySelector('fieldset.segmented')).toBeNull();

    await changeField(editor, 'card:toolbar.show', true);
    expect(read(editor, 'Controls')).toEqual([
      'Add Event ✓',
      'View Switcher ✓',
      'Reset',
      'Refresh ✓',
      'Search ✓',
      'Date Navigation ✓',
    ]);
    const heading = editor.shadowRoot!.querySelector('[data-heading="heading_toolbar"]')!;
    expect(heading.textContent).toContain(
      'Pressed controls show in the toolbar. Search needs Date Navigation.',
    );

    chips(editor, 'Controls')[2].click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, reset: true });
  });

  it('picks Calendar Filter from its radio group, and resets it to the default', async () => {
    const editor = await mount({ toolbar: { show: true, legend: false } });
    await openPageOf(editor, 'card:toolbar.legend');
    const group = () =>
      editor.shadowRoot!.querySelector<HTMLFieldSetElement>('fieldset.segmented')!;
    const radios = () => [...group().querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    // Reset is in the line under the group, as under any field.
    const reset = () =>
      editor.shadowRoot!.querySelector<HTMLButtonElement>(
        '[data-focus="reset:card:toolbar.legend"]',
      );

    // Its state words follow its name, as any field's do.
    expect(group().querySelector('legend')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Calendar Filter · Set',
    );
    expect(reset()?.getAttribute('aria-label')).toBe('Reset to Menu: Calendar Filter');
    expect(radios().map((radio) => [radio.value, radio.checked])).toEqual([
      ['off', true],
      ['menu', false],
      ['chips', false],
    ]);
    expect(reset()).not.toBeNull();

    radios()[2].checked = true;
    radios()[2].dispatchEvent(new Event('change', { bubbles: true }));
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, legend: 'chips' });

    reset()!.click();
    await editor.updateComplete;
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true });
    expect(radios().find((radio) => radio.checked)?.value).toBe('menu');
    expect(reset()).toBeNull();
    expect(editor.shadowRoot!.activeElement).toBe(group());
  });

  it('resets a Calendar Filter the YAML holds at its default, taking the line away', async () => {
    // Written as the default, the line would stay: the editor keeps what the YAML already holds.
    const editor = await mount({ toolbar: { show: true, legend: 'menu' } });
    await openPageOf(editor, 'card:toolbar.legend');

    editor
      .shadowRoot!.querySelector<HTMLButtonElement>(
        '[aria-label="Reset to Menu: Calendar Filter"]',
      )!
      .click();
    await editor.updateComplete;

    expect(lastConfig(editor)?.toolbar).toEqual({ show: true });
  });
});

/**
 * The composed controls: the event parts as toggle chips at the top of
 * Events (D08 A), and on Card & Header the toolbar's controls as chips and Calendar Filter as a
 * segmented radio group (D09 A).
 *
 * Which fields are chips is the page registry's, each chip's short label `chips.ts`'s, and which
 * chips a scope offers comes from the universe for it; the first two are pinned by value and
 * against each other, the third against `universe.ts` › `universeIndex` itself. The rest is
 * read off the mounted editor: what is drawn, pressed, unpressable and why, the line naming where
 * the stored parts live, and what each press, pick and Reset writes.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  changeField,
  editLayout,
  goPage,
  lastConfig,
  mountEditor,
  openPageOf,
} from './helpers/editor-host';
import * as Config from '../src/config/config';
import { CHIP_LABELS, chipFields, inScope } from '../src/rendering/editor/chips';
import { EDITOR_STRINGS } from '../src/rendering/editor/strings';
import { universeIndex } from '../src/rendering/editor/universe';
import { WORKSPACES } from '../src/rendering/editor/workspace';

type Editor = Awaited<ReturnType<typeof mountEditor>>;

const PARTS = [
  'events:show_time',
  'events:show_end_time',
  'events:show_location',
  'events:show_description',
  'events:show_countdown',
  'events:show_time_left',
  'events:show_progress_bar',
  'events:show_duration',
  'events:show_now_indicator',
];

const CONTROLS = [
  'card:toolbar.add_event',
  'card:toolbar.view_switcher',
  'card:toolbar.legend',
  'card:toolbar.reset',
  'card:toolbar.refresh',
  'card:toolbar.search',
  'card:toolbar.overlay',
  'card:toolbar.navigation',
  // The full-size card's, on Full-Size Settings: the same controls but Open Full Size.
  'actions:overlay.toolbar.add_event',
  'actions:overlay.toolbar.view_switcher',
  'actions:overlay.toolbar.legend',
  'actions:overlay.toolbar.reset',
  'actions:overlay.toolbar.refresh',
  'actions:overlay.toolbar.search',
  'actions:overlay.toolbar.navigation',
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
 * @param group - "Visible Event Parts" or "Controls"
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
 * The Reset and Remove buttons under the event-part chips, after the line saying where they come from.
 *
 * @param editor - The editor
 * @returns Each as `<visible text>: <accessible name>`
 */
function resets(editor: Editor): string[] {
  const heading = editor.shadowRoot!.querySelector('[data-heading="heading_details"]')!;
  return [
    ...heading.querySelectorAll<HTMLButtonElement>(
      ':scope > .chip-source .line-button, :scope > .field-line .line-button',
    ),
  ].map((button) => `${button.textContent?.trim()}: ${button.getAttribute('aria-label')}`);
}

/**
 * The lines the Visible Event Parts heading draws under its chips.
 *
 * @param editor - The editor
 * @returns Each line's text
 */
function lines(editor: Editor): string[] {
  const heading = editor.shadowRoot!.querySelector('[data-heading="heading_details"]')!;
  // The chips' facts, a line each, then the hints.
  return [...heading.querySelectorAll(':scope > .chip-source .fact, :scope > p.hint')].map(
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
      'events:show_time_left': 'chip.time_left',
      'events:show_progress_bar': 'chip.progress_bar',
      'events:show_duration': 'chip.duration',
      'events:show_now_indicator': 'chip.now',
      'card:toolbar.add_event': 'toolbar.controls.add_event',
      'card:toolbar.view_switcher': 'toolbar.view_switcher',
      'card:toolbar.legend': 'toolbar.legend',
      'card:toolbar.reset': 'toolbar.controls.reset',
      'card:toolbar.refresh': 'toolbar.controls.refresh',
      'card:toolbar.search': 'toolbar.controls.search',
      'card:toolbar.overlay': 'toolbar.controls.overlay',
      'card:toolbar.navigation': 'toolbar.navigation',
      'actions:overlay.toolbar.add_event': 'toolbar.controls.add_event',
      'actions:overlay.toolbar.view_switcher': 'toolbar.view_switcher',
      'actions:overlay.toolbar.legend': 'toolbar.legend',
      'actions:overlay.toolbar.reset': 'toolbar.controls.reset',
      'actions:overlay.toolbar.refresh': 'toolbar.controls.refresh',
      'actions:overlay.toolbar.search': 'toolbar.controls.search',
      'actions:overlay.toolbar.navigation': 'toolbar.navigation',
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
      'Time Left',
      'Progress Bar',
      'Duration',
      'Now',
      'Add Event',
      'View Switcher',
      'Calendar Filter',
      'Reset',
      'Refresh',
      'Search',
      'Open Full Size',
      'Date Navigation',
      'Add Event',
      'View Switcher',
      'Calendar Filter',
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
    expect(grid).toHaveLength(23);
    expect(Object.keys(CHIP_LABELS).filter((id) => !grid.includes(id))).toEqual([
      'events:show_now_indicator',
    ]);
  });
});

describe('the event-part chips', () => {
  it('draws every part at the top of Events, pressed as each event shows it, with the hint', async () => {
    const editor = await mount();
    await goPage(editor, 'events');

    expect(read(editor, 'Visible Event Parts')).toEqual([
      'Time ✓',
      'End Time ✓',
      'Location ✓',
      'Description',
      'Countdown',
      'Time Left',
      'Progress Bar',
      'Duration',
      'Now ✓',
    ]);
    // Native toggle buttons: focusable, never disabled, so every reason is read where it is.
    expect(chips(editor, 'Visible Event Parts').every((chip) => chip.localName === 'button')).toBe(
      true,
    );
    expect(chips(editor, 'Visible Event Parts').some((chip) => chip.disabled)).toBe(false);
    // Nothing is stored, so no line says where.
    expect(lines(editor)).toEqual([
      "Each event shows the parts that are pressed. A pressed part's settings follow below.",
    ]);
  });

  it('leaves Now out in Grid, and says so', async () => {
    const editor = await mount({ view: 'grid' });
    await goPage(editor, 'events');

    expect(read(editor, 'Visible Event Parts').map((chip) => chip.replace(' ✓', ''))).toEqual([
      'Time',
      'End Time',
      'Location',
      'Description',
      'Countdown',
      'Time Left',
      'Progress Bar',
      'Duration',
    ]);
    expect(lines(editor)).toContain('Not in Grid: Now.');

    // In All Layouts, which offers every part, no line.
    await editLayout(editor, 'shared');
    await goPage(editor, 'events');
    expect(chips(editor, 'Visible Event Parts')).toHaveLength(9);
    expect(lines(editor).some((line) => line.startsWith('Not in'))).toBe(false);
  });

  // Grid draws no location in its blocks unless told to, so Location reads off there. The line
  // under the chips says why, as every other field's words say "Default".
  it('names the parts a layout defaults otherwise, until one is stored for it', async () => {
    const editor = await mount({ view: 'grid' });
    await goPage(editor, 'events');
    expect(read(editor, 'Visible Event Parts')[2]).toBe('Location');
    // Each part says whether it is on, so its source never reads as "on".
    expect(lines(editor)).toContain('Grid Default: Location (Off)');

    const stored = await mount({ view: 'grid', time_grid: { show_location: true } });
    await goPage(stored, 'events');
    expect(read(stored, 'Visible Event Parts')[2]).toBe('Location ✓');
    expect(lines(stored).some((line) => line.includes('Default:'))).toBe(false);
  });

  it('wraps the chips in rows, never stacked one per line by another control’s rule', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    const group = editor.shadowRoot!.querySelector(
      '.chip-group[aria-label="Visible Event Parts"]',
    )!;
    const style = getComputedStyle(group);
    // Start Date's radio chips are a column (.chips); a shared class stacked these one per line.
    expect([style.display, style.flexWrap]).toEqual(['flex', 'wrap']);
    expect(style.flexDirection).not.toBe('column');
  });

  it('keeps End Time and Duration in sight while Time is off, unpressable, with the reason', async () => {
    const editor = await mount({ show_end_time: true });
    await changeField(editor, 'events:show_time', false);

    expect(read(editor, 'Visible Event Parts').slice(0, 3)).toEqual([
      'Time',
      'End Time (Needs Time)',
      'Location ✓',
    ]);
    expect(read(editor, 'Visible Event Parts')[7]).toBe('Duration (Needs Time)');
    const end = chips(editor, 'Visible Event Parts')[1];
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

    await editLayout(editor, 'shared');
    await goPage(editor, 'events');
    expect(read(editor, 'Visible Event Parts')[2]).toBe('Location');
    expect(lines(editor)[0]).toBe('Chosen Here: Location (Off)');

    await editLayout(editor, 'column');
    await goPage(editor, 'events');
    expect(read(editor, 'Visible Event Parts')[2]).toBe('Location ✓');
    expect(lines(editor)[0]).toBe('Chosen Here: Location (On)');
    // A chip's name carries its state words, as any field's does.
    expect(chips(editor, 'Visible Event Parts')[2].getAttribute('aria-label')).toBe(
      'Location, Set',
    );

    await editLayout(editor, 'list');
    await goPage(editor, 'events');
    expect(read(editor, 'Visible Event Parts')[2]).toBe('Location');
    expect(lines(editor)[0]).toBe('From Layout Defaults: Location (Off)');
    expect(chips(editor, 'Visible Event Parts')[2].getAttribute('aria-label')).toBe(
      'Location, From Layout Defaults',
    );
    // Nothing is stored for List, so nothing here resets.
    expect(resets(editor)).toEqual([]);

    // A press writes the other value for the scope, in its own block: one write, one step.
    chips(editor, 'Visible Event Parts')[4].click();
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      show_location: false,
      column: { show_location: true },
      list: { show_countdown: true },
    });
    expect(lines(editor).slice(0, 2)).toEqual([
      'Chosen Here: Countdown (On)',
      'From Layout Defaults: Location (Off)',
    ]);
    expect(
      editor.shadowRoot!.querySelector('[data-focus="undo"]')?.getAttribute('aria-label'),
    ).toBe('Undo: Change Show Countdown');
  });

  it('resets every part stored for the scope with one Reset Parts, in one undo step', async () => {
    const editor = await mount({
      show_description: false,
      list: { show_countdown: true, show_location: false },
    });
    await editLayout(editor, 'list');
    await goPage(editor, 'events');
    // One button for the group, named for every part it resets; the All Layouts one is not here.
    expect(resets(editor)).toEqual(['Reset Parts: Reset Parts: Location, Countdown']);

    editor
      .shadowRoot!.querySelector<HTMLButtonElement>('[data-focus="reset-chips:parts"]')!
      .click();
    await editor.updateComplete;
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      show_description: false,
    });
    expect(read(editor, 'Visible Event Parts').slice(2, 5)).toEqual([
      'Location ✓',
      'Description',
      'Countdown',
    ]);
    expect(resets(editor)).toEqual([]);
    // Focus lands on the group's first chip, since the button is gone.
    expect(editor.shadowRoot!.activeElement).toBe(chips(editor, 'Visible Event Parts')[0]);
    expect(
      editor.shadowRoot!.querySelector('[data-focus="undo"]')?.getAttribute('aria-label'),
    ).toBe('Undo: Reset Parts');

    editor.shadowRoot!.querySelector<HTMLButtonElement>('[data-focus="undo"]')!.click();
    await editor.updateComplete;
    expect(lastConfig(editor)).toEqual({
      config_version: Config.CURRENT_CONFIG_VERSION,
      entities: ['calendar.anna'],
      show_description: false,
      list: { show_countdown: true, show_location: false },
    });
  });

  it('puts focus back on the chip a press changed when Undo restores it', async () => {
    const editor = await mount();
    await goPage(editor, 'events');
    chips(editor, 'Visible Event Parts')[3].click();
    await editor.updateComplete;
    expect(read(editor, 'Visible Event Parts')[3]).toBe('Description ✓');

    editor.shadowRoot!.querySelector<HTMLButtonElement>('[data-focus="undo"]')!.click();
    await editor.updateComplete;
    await editor.updateComplete;

    expect(read(editor, 'Visible Event Parts')[3]).toBe('Description');
    expect(editor.shadowRoot!.activeElement).toBe(chips(editor, 'Visible Event Parts')[3]);
  });
});

describe('the toolbar on Card & Header', () => {
  it('draws the controls as chips only while the toolbar is shown, under Show Toolbar', async () => {
    const editor = await mount();
    await openPageOf(editor, 'card:toolbar.show');
    expect(chips(editor, 'Controls')).toEqual([]);
    expect(editor.shadowRoot!.querySelector('.qualifier')).toBeNull();

    await changeField(editor, 'card:toolbar.show', true);
    expect(read(editor, 'Controls')).toEqual([
      'Add Event ✓',
      'View Switcher ✓',
      'Calendar Filter ✓',
      'Reset',
      'Refresh ✓',
      'Search ✓',
      'Open Full Size',
      'Date Navigation ✓',
    ]);
    const heading = editor.shadowRoot!.querySelector('[data-heading="heading_toolbar"]')!;
    expect(heading.textContent).toContain(
      'Pressed controls show in the toolbar. Search needs Date Navigation.',
    );

    chips(editor, 'Controls')[3].click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, reset: true });
  });

  /** The qualifier line of a pressed control: its legend and each choice, ✓ where chosen. */
  const qualifier = (editor: Editor, control: string): string[] | undefined => {
    const line = editor.shadowRoot!.querySelector(`.qualifier[data-qualifies="${control}"]`);
    if (line === null) return undefined;
    return [
      line.querySelector('legend')!.textContent!.replace(/\s+/g, ' ').trim(),
      ...[...line.querySelectorAll<HTMLInputElement>('input')].map(
        (input) =>
          `${input.closest('label')!.querySelector('span')!.textContent!.trim()}${input.checked ? ' ✓' : ''}`,
      ),
    ];
  };
  const pickForm = async (editor: Editor, form: string): Promise<void> => {
    const radio = editor.shadowRoot!.querySelector<HTMLInputElement>(
      `.qualifier[data-qualifies="card:toolbar.legend"] input[value="${form}"]`,
    )!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await editor.updateComplete;
  };
  const filterChip = (editor: Editor): HTMLButtonElement =>
    chips(editor, 'Controls').find((chip) => chip.dataset.field === 'card:toolbar.legend')!;

  it('draws Calendar Filter as a chip, its form as a qualifier line only while it is pressed', async () => {
    const editor = await mount({ toolbar: { show: true, legend: false } });
    await openPageOf(editor, 'card:toolbar.legend');
    expect(filterChip(editor).getAttribute('aria-pressed')).toBe('false');
    expect(qualifier(editor, 'card:toolbar.legend')).toBeUndefined();

    // Pressed on with no form chosen this session: Menu, the default.
    filterChip(editor).click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true });
    expect(qualifier(editor, 'card:toolbar.legend')).toEqual([
      'Calendar Filter shows',
      'Menu ✓',
      'Chips',
    ]);
    // Drawn unlike the chips: native radios under a legend, never a chip.
    expect(
      editor.shadowRoot!.querySelectorAll(
        '.qualifier[data-qualifies="card:toolbar.legend"] input[type="radio"]',
      ),
    ).toHaveLength(2);
    // One field, one element named by it: the chip.
    expect(editor.shadowRoot!.querySelectorAll('[data-field="card:toolbar.legend"]')).toHaveLength(
      1,
    );

    await pickForm(editor, 'chips');
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, legend: 'chips' });
    filterChip(editor).click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, legend: false });
    expect(qualifier(editor, 'card:toolbar.legend')).toBeUndefined();
    // Pressed on again: the form chosen earlier in this session.
    filterChip(editor).click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, legend: 'chips' });
  });

  it('draws a qualifier line per pressed control with a choice, in the chips’ order', async () => {
    const editor = await mount({ toolbar: { show: true } });
    await openPageOf(editor, 'card:toolbar.legend');
    const lines = () =>
      [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.qualifier')].map(
        (line) => line.dataset.qualifies,
      );
    expect(lines()).toEqual(['card:toolbar.view_switcher', 'card:toolbar.legend']);
    // Drawn alike, a legend over native controls, and unlike the chips above them.
    expect(
      [...editor.shadowRoot!.querySelectorAll('.qualifier')].map((line) =>
        [...line.querySelectorAll('input')].map((input) => input.type).join(','),
      ),
    ).toEqual(['checkbox,checkbox,checkbox,checkbox', 'radio,radio']);
    chips(editor, 'Controls')
      .find((chip) => chip.dataset.field === 'card:toolbar.view_switcher')!
      .click();
    await editor.updateComplete;
    expect(lines()).toEqual(['card:toolbar.legend']);
  });

  it('presses Calendar Filter on in the form the YAML named, and Undo takes each press back', async () => {
    const editor = await mount({ toolbar: { show: true, legend: 'chips' } });
    await openPageOf(editor, 'card:toolbar.legend');
    expect(qualifier(editor, 'card:toolbar.legend')).toEqual([
      'Calendar Filter shows',
      'Menu',
      'Chips ✓',
    ]);
    filterChip(editor).click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, legend: false });
    // The card's own Chips counts as named: pressed on again, it is Chips, not Menu.
    filterChip(editor).click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, legend: 'chips' });
    // A form picked later wins, even the default, which the YAML then leaves out.
    await pickForm(editor, 'menu');
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true });
    filterChip(editor).click();
    await editor.updateComplete;
    filterChip(editor).click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true });
    // Undo takes back each press, one step each.
    editor.shadowRoot!.querySelector<HTMLElement>('[data-focus="undo"]')!.click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true, legend: false });
  });

  it('resets Calendar Filter, chip and form alike, with the Controls’ one Reset', async () => {
    const editor = await mount({ toolbar: { show: true, legend: 'chips' } });
    await openPageOf(editor, 'card:toolbar.legend');
    const reset = editor.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-focus="reset-chips:toolbar"]',
    )!;
    expect(reset.getAttribute('aria-label')).toBe('Reset Controls: Calendar Filter');
    reset.click();
    await editor.updateComplete;
    expect(lastConfig(editor)?.toolbar).toEqual({ show: true });
    expect(qualifier(editor, 'card:toolbar.legend')).toEqual([
      'Calendar Filter shows',
      'Menu ✓',
      'Chips',
    ]);
  });
});
